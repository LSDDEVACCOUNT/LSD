// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "v4-core/src/types/BeforeSwapDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {SwapFeeCollector} from "./SwapFeeCollector.sol";

/// @title TollGate
/// @notice The hook on the LSD/stock pools: it charges a 1% fee into the
/// protocol and does nothing else.
///
/// Separate from `Watchtower` because the two jobs have different shapes.
/// The oracle hook accumulates a TWAP for one specific pool and holds that
/// pool's id in storage, so it can only ever serve one. This one holds no
/// per-pool state at all - every swap arrives with its own PoolKey and the
/// fee arithmetic reads what it needs from that - so a single deployment
/// serves every LSD/stock pool at once. Seven stock pairs would otherwise
/// mean seven mined addresses and seven deploys.
///
/// It carries only the afterSwap and afterSwapReturnDelta permission bits
/// (0x44), which is what its mined address has to end in.
///
/// LSD is not priced against these pools and must not be: the peg is
/// denominated in the counter token, and a price read from an LSD/AAPL pool
/// would move with the semiconductor cycle. Only the counter-token pool
/// feeds the oracle, which is why only that one needs the oracle hook.
///
/// Sweeping is `sweep(address[])` from the base, naming the currencies to
/// move. The stock side lands at the DAO, where it is backing the moment
/// governance has that stock listed as a reserve, and recoverable rather
/// than lost before then. The LSD side is burned.
contract TollGate is IHooks, SwapFeeCollector {
    error NotPoolManager();

    IPoolManager public immutable poolManager;

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    /// @param _poolManager the V4 PoolManager this hook will be attached to
    /// @param _dollarCurrency the LSD token
    /// @param _treasury the DAO proxy (Root) that swept fees are sent to
    constructor(IPoolManager _poolManager, address _dollarCurrency, address _treasury)
        SwapFeeCollector(_dollarCurrency, _treasury, 100)
    {
        poolManager = _poolManager;
    }

    function getHookPermissions() public pure returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
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

    function _poolManager() internal view override returns (IPoolManager) {
        return poolManager;
    }

    // --- IHooks: implemented ---

    function afterSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata
    ) external override onlyPoolManager returns (bytes4, int128) {
        return (IHooks.afterSwap.selector, _takeSwapFee(key, params, delta));
    }

    // --- IHooks: unused by this hook's permission set, required by interface ---

    function beforeInitialize(address, PoolKey calldata, uint160) external pure override returns (bytes4) {
        return IHooks.beforeInitialize.selector;
    }

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure override returns (bytes4) {
        return IHooks.afterInitialize.selector;
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
