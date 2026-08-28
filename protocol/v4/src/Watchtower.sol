// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "v4-core/src/types/BeforeSwapDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {FixedPoint96} from "v4-core/src/libraries/FixedPoint96.sol";
import {SwapFeeCollector} from "./SwapFeeCollector.sol";

/// @title Watchtower
/// @notice Minimal Uniswap V4 hook that tracks a manually-accumulated TWAP
/// (time-weighted average price) for a single LSD:counter-token pool, and
/// exposes a `capture()` function with the same shape as upstream ESD's
/// `Oracle.capture()` (V2-pair based) so `Oracle.sol` can be ported to read
/// from a V4 pool instead of a V2 pair with a minimal change.
///
/// Design notes (see NOTICE in the main repo for the full rationale):
/// - `afterSwap` also charges a 5 bp fee on every trade and hands it to the
///   protocol: the counter side goes to the DAO, where it becomes backing
///   that redemption pays out, and the LSD side is burned, which raises
///   backing per LSD by shrinking the other half of the ratio. This is the
///   only part of the backing that grows without anybody choosing to bond.
///   It sits on top of the pool's own LP fee and is deliberately small - a
///   dollar-pegged token lives on arbitrage, and a fee large enough to
///   notice is a fee that stops the peg being enforced.
/// - Only `afterInitialize`, `afterSwap` and `afterSwapReturnDelta`
///   permissions are used. All other
///   IHooks callbacks are implemented as required by the interface but are
///   never invoked by the PoolManager for this hook (its deployed address
///   only has those permission bits set), so they just return their
///   selector with no side effects.
/// - TWAP accumulation is done manually (price * time elapsed, summed),
///   analogous to Uniswap V2's price0CumulativeLast - V4's core PoolManager
///   does not track this itself (unlike V2 pairs / V3 pools), so a hook is
///   exactly the mechanism V4 expects you to use to reconstruct it.
/// - "Reserve minimum" validity (ESD's ORACLE_RESERVE_MINIMUM check against
///   V2 x*y=k reserves) is approximated here using the pool's current
///   in-range liquidity (V4 concentrated liquidity has no single "reserve"
///   the way V2 does) - this is not a 1:1 semantic port, only an
///   analogous safety check with the same intent (require the pool isn't
///   empty/near-empty before trusting its price).
contract Watchtower is IHooks, SwapFeeCollector {
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    error NotPoolManager();
    error NotDao();
    error NotController();
    error ControlAlreadyRelinquished();
    error PoolAlreadySet();
    error WrongPool();
    error AlreadyInitialized();

    IPoolManager public immutable poolManager;

    /// @notice The only address allowed to call capture(). Starts out equal
    /// to `controller` (the deployer) and is reassigned exactly once via
    /// setDao() - this exists to break the circular dependency between this
    /// hook (which needs to know Oracle.sol's address) and Oracle.sol
    /// (which needs to know this hook's address): both get deployed in the
    /// same transaction, and whichever address deploys this hook first
    /// hands off control to Oracle.sol right after Oracle is deployed. See
    /// NOTICE in the main repo for the full rationale.
    address public dao;
    address public controller;

    /// @notice 10 ** (18 - counterTokenDecimals) - the same decimal-normalization
    /// factor upstream ESD's Oracle.sol applies via `.mul(1e12)` for 6-decimal USDC
    uint256 public immutable counterDecimalNormalizer;

    PoolId public poolId;
    bool public poolSet;
    bool public dollarIsCurrency0;
    /// @notice The non-LSD side of the pool, learned at initialize. This is
    /// what sweep() forwards to the treasury.
    address public counterCurrency;

    uint256 public priceCumulative;
    uint32 public timestampLast;
    bool public accumulating;

    uint256 private lastCaptureCumulative;
    uint32 private lastCaptureTimestamp;
    bool private capturedOnce;

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    modifier onlyDao() {
        if (msg.sender != dao) revert NotDao();
        _;
    }

    /// @param _poolManager the V4 PoolManager this hook will be attached to
    /// @param _controller the deployer - temporarily set as `dao` until it
    /// calls setDao() once (immediately after) to hand control to the real
    /// Oracle.sol address
    /// @param _dollarCurrency the LSD token's address (Currency.unwrap(currency0/1) must match this)
    /// @param _counterDecimals decimals of the counter token (6 for USDC-style tokens)
    /// @param _treasury the DAO proxy (Root) that swept swap fees are sent to
    constructor(
        IPoolManager _poolManager,
        address _controller,
        address _dollarCurrency,
        uint8 _counterDecimals,
        address _treasury
    ) SwapFeeCollector(_dollarCurrency, _treasury, 5) {
        poolManager = _poolManager;
        controller = _controller;
        dao = _controller;
        require(_counterDecimals <= 18, "Watchtower: counter decimals > 18 unsupported");
        counterDecimalNormalizer = 10 ** (18 - _counterDecimals);
    }

    /// @notice One-time handoff of control from the deployer to the real
    /// Oracle.sol address, once it exists (see `dao` docs above). Reverts
    /// if called more than once or by anyone other than the controller.
    function setDao(address _dao) external {
        if (msg.sender != controller) revert NotController();
        if (controller == address(0)) revert ControlAlreadyRelinquished();
        dao = _dao;
        controller = address(0);
    }

    function getHookPermissions() public pure returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: true,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: false,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: true,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // --- IHooks: implemented ---

    function afterInitialize(address, PoolKey calldata key, uint160, int24)
        external
        override
        onlyPoolManager
        returns (bytes4)
    {
        if (poolSet) revert AlreadyInitialized();
        poolId = key.toId();
        poolSet = true;

        address currency0 = Currency.unwrap(key.currency0);
        address currency1 = Currency.unwrap(key.currency1);
        if (currency0 == dollarCurrency) {
            dollarIsCurrency0 = true;
            counterCurrency = currency1;
        } else if (currency1 == dollarCurrency) {
            dollarIsCurrency0 = false;
            counterCurrency = currency0;
        } else {
            revert WrongPool();
        }

        timestampLast = uint32(block.timestamp);
        accumulating = true;
        return IHooks.afterInitialize.selector;
    }

    function afterSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata
    ) external override onlyPoolManager returns (bytes4, int128) {
        _updateCumulative(key);
        return (IHooks.afterSwap.selector, _takeSwapFee(key, params, delta));
    }

    /// @notice Sweep this pool's two currencies, without having to name
    /// them. `sweep(address[])` on the base does the general case.
    function sweep() external {
        _sweepCurrency(dollarCurrency);
        _sweepCurrency(counterCurrency);
    }

    function _poolManager() internal view override returns (IPoolManager) {
        return poolManager;
    }

    // --- DAO-facing: mirrors upstream ESD Oracle.capture() ---

    /// @notice Returns the TWAP price (18-decimal fixed point, LSD priced in
    /// counter-token units) accumulated since the last capture() call, and
    /// whether it should be trusted (pool has meaningful liquidity).
    /// First call only establishes a baseline (matches upstream Oracle.sol's
    /// initializeOracle() behavior) and returns (1e18, false).
    function capture() external onlyDao returns (uint256 price, bool valid) {
        require(poolSet, "Watchtower: pool not set");

        if (!capturedOnce) {
            lastCaptureCumulative = priceCumulative;
            lastCaptureTimestamp = timestampLast;
            capturedOnce = true;
            return (1e18, false);
        }

        uint32 elapsed = timestampLast - lastCaptureTimestamp;
        if (elapsed == 0) {
            return (1e18, false);
        }

        price = (priceCumulative - lastCaptureCumulative) / elapsed;
        lastCaptureCumulative = priceCumulative;
        lastCaptureTimestamp = timestampLast;

        uint128 liquidity = poolManager.getLiquidity(poolId);
        valid = liquidity > 0;
    }

    /// @notice Current instantaneous price (18-decimal fixed point), for
    /// convenience/debugging - capture() is what the DAO actually uses.
    function currentPrice() external view returns (uint256) {
        return _currentPrice();
    }

    // --- internal ---

    function _updateCumulative(PoolKey calldata key) private {
        PoolId pid = key.toId();
        if (PoolId.unwrap(pid) != PoolId.unwrap(poolId)) revert WrongPool();

        uint32 nowTs = uint32(block.timestamp);
        if (accumulating) {
            uint32 elapsed = nowTs - timestampLast;
            if (elapsed > 0) {
                priceCumulative += _currentPrice() * elapsed;
            }
        }
        timestampLast = nowTs;
    }

    /// @dev sqrtPriceX96 -> 18-decimal fixed-point price of LSD in
    /// counter-token terms, normalized for the counter token's decimals
    /// (mirrors upstream Oracle.sol's `price.mul(1e12)` for 6-decimal USDC).
    function _currentPrice() internal view returns (uint256) {
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(poolId);

        // price of currency1 in terms of currency0, Q96 fixed point:
        // (sqrtPriceX96^2) / 2^96, computed via 512-bit-safe mulDiv to avoid
        // overflow (sqrtPriceX96 can be up to ~2^160, so a naive square
        // overflows a plain uint256 multiplication).
        uint256 priceX96 = FullMath.mulDiv(sqrtPriceX96, sqrtPriceX96, FixedPoint96.Q96);

        uint256 scale = 1e18 * counterDecimalNormalizer;

        if (dollarIsCurrency0) {
            // token0 = LSD, token1 = counter. priceX96/Q96 = raw price of
            // token1 per unit token0 = rawCounterAmount / rawDollarAmount.
            // humanUSDCPerLSD = (rawCounter/1e6) / (rawDollar/1e18)
            //                 = (rawCounter/rawDollar) * 1e12
            //                 = (priceX96/Q96) * counterDecimalNormalizer
            // -> fixed-1e18 result = priceX96 * scale / Q96
            return FullMath.mulDiv(priceX96, scale, FixedPoint96.Q96);
        } else {
            // token0 = counter, token1 = LSD. priceX96/Q96 = raw price of
            // token1 per unit token0 = rawDollarAmount / rawCounterAmount,
            // i.e. the *inverse* of the ratio we need above.
            // -> fixed-1e18 result = Q96 * scale / priceX96
            return FullMath.mulDiv(FixedPoint96.Q96, scale, priceX96);
        }
    }

    // --- IHooks: unused by this hook's permission set, required by interface ---

    function beforeInitialize(address, PoolKey calldata, uint160) external pure override returns (bytes4) {
        return IHooks.beforeInitialize.selector;
    }

    function beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        return IHooks.beforeAddLiquidity.selector;
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure override returns (bytes4, BalanceDelta) {
        return (IHooks.afterAddLiquidity.selector, BalanceDelta.wrap(0));
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        return IHooks.beforeRemoveLiquidity.selector;
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure override returns (bytes4, BalanceDelta) {
        return (IHooks.afterRemoveLiquidity.selector, BalanceDelta.wrap(0));
    }

    function beforeSwap(address, PoolKey calldata, SwapParams calldata, bytes calldata)
        external
        pure
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        return IHooks.beforeDonate.selector;
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        return IHooks.afterDonate.selector;
    }
}
