// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {IERC20Minimal} from "v4-core/src/interfaces/external/IERC20Minimal.sol";

/// @dev The LSD token is Solidity 0.5.17 and inherits OpenZeppelin 2.x's
/// ERC20Burnable, whose burn() destroys the caller's own balance.
interface IDollarBurnable {
    function burn(uint256 amount) external;
}

/// @title SwapFeeCollector
/// @notice The half of an LSD hook that charges a fee and hands it to the
/// protocol. Shared by the oracle hook on the counter-token pool and the
/// plain fee hook on the LSD/stock pools, so the two cannot drift apart on
/// the one piece of arithmetic that moves money.
///
/// The fee lands on the "unspecified" side of the swap - the side the pool
/// computes rather than the one the trader named. That is the only side a V4
/// afterSwap hook may adjust, so which token it is flips with the direction
/// and with exact-in versus exact-out. Both cases are charged; otherwise
/// naming an output amount would be a way around the fee.
///
/// Where it ends up depends on which token it is, and both destinations feed
/// the same thing from opposite sides:
///
///   LSD          burned. The DAO asserts that its own LSD balance equals
///                staged plus bonded plus redeemable exactly, so a donation
///                would break that invariant. Burning does the same job:
///                fewer LSD against the same reserves is more backing per LSD.
///   anything     sent to the DAO. If it is a listed reserve - the counter
///   else         token, or a stock governance has listed - redemption pays
///                it out and it is backing immediately. If it is not, it sits
///                at the DAO doing nothing until governance lists it, which
///                is recoverable rather than lost.
abstract contract SwapFeeCollector {
    event SwapFee(address indexed currency, uint256 amount);
    event Sweep(address indexed caller, address indexed currency, uint256 amount);

    /// @notice Fee in basis points of the unspecified side, set by the
    /// inheriting hook. It sits on top of the pool's own LP fee.
    ///
    /// The two hooks deliberately choose differently. The oracle pool
    /// (Watchtower) charges 5 bp: a dollar-pegged token lives on arbitrage
    /// closing the gap to a dollar, and that pool is where the closing
    /// happens - a fee big enough to notice there is a fee that stops the
    /// peg being enforced. The stock pools (TollGate) charge 100 bp: they
    /// are not the peg's venue, so a toll that would be poison on the
    /// oracle pair is simply revenue there, and every basis point of it is
    /// backing.
    uint256 public immutable SWAP_FEE_BPS;
    uint256 private constant BPS_DENOMINATOR = 10_000;

    /// @notice The LSD token. Fees in it are burned rather than forwarded.
    address public immutable dollarCurrency;

    /// @notice The DAO proxy (Root), whose balance is what backingPerDollar()
    /// divides and what redeem() pays out.
    address public immutable treasury;

    constructor(address _dollarCurrency, address _treasury, uint256 _swapFeeBps) {
        require(_dollarCurrency != address(0), "SwapFeeCollector: dollar is zero");
        require(_treasury != address(0), "SwapFeeCollector: treasury is zero");
        require(_swapFeeBps > 0 && _swapFeeBps < BPS_DENOMINATOR, "SwapFeeCollector: fee out of range");
        dollarCurrency = _dollarCurrency;
        treasury = _treasury;
        SWAP_FEE_BPS = _swapFeeBps;
    }

    function _poolManager() internal view virtual returns (IPoolManager);

    /// @dev Works out the fee, takes it into this contract, and returns the
    /// delta afterSwap must report so the PoolManager charges the swapper.
    /// Taken here rather than forwarded on every swap: a token transfer in
    /// the path of every trade is a cost everyone pays, and sweep() costs
    /// nobody anything to call.
    function _takeSwapFee(PoolKey calldata key, SwapParams calldata params, BalanceDelta delta)
        internal
        returns (int128)
    {
        bool exactIn = params.amountSpecified < 0;
        Currency feeCurrency;
        int128 unspecified;
        if (exactIn) {
            feeCurrency = params.zeroForOne ? key.currency1 : key.currency0;
            unspecified = params.zeroForOne ? delta.amount1() : delta.amount0();
        } else {
            feeCurrency = params.zeroForOne ? key.currency0 : key.currency1;
            unspecified = params.zeroForOne ? delta.amount0() : delta.amount1();
        }

        uint256 magnitude = unspecified < 0 ? uint256(uint128(-unspecified)) : uint256(uint128(unspecified));
        uint256 fee = (magnitude * SWAP_FEE_BPS) / BPS_DENOMINATOR;
        if (fee == 0) {
            return 0; // dust trade, nothing worth taking
        }

        _poolManager().take(feeCurrency, address(this), fee);
        emit SwapFee(Currency.unwrap(feeCurrency), fee);

        return int128(uint128(fee));
    }

    /// @notice Move collected fees to where they do their work. Anyone may
    /// call it, and there is nowhere else they can go.
    function sweep(address[] calldata currencies) external {
        for (uint256 i = 0; i < currencies.length; i++) {
            _sweepCurrency(currencies[i]);
        }
    }

    function _sweepCurrency(address currency) internal {
        if (currency == address(0)) return;

        uint256 balance = IERC20Minimal(currency).balanceOf(address(this));
        if (balance == 0) return;

        if (currency == dollarCurrency) {
            IDollarBurnable(currency).burn(balance);
        } else {
            require(IERC20Minimal(currency).transfer(treasury, balance), "SwapFeeCollector: sweep failed");
        }

        emit Sweep(msg.sender, currency, balance);
    }
}
