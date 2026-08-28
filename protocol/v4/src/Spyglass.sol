// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolId} from "v4-core/src/types/PoolId.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";

/// @title Spyglass
/// @notice The watch's telescope: a read-only adapter that prices one
/// reserve asset off the deep Uniswap V4 pool it actually trades in - its
/// own asset/USDG pool, not anything of this protocol's - and reports it in
/// the one shape the 0.5.x treasury can consume:
/// `assetPriceInCounter()`, the spot price of one whole asset in counter
/// units, 18-decimal fixed point.
///
/// Why it exists: the treasury's primary price is a Chainlink feed, and
/// Robinhood's stock feeds follow the market's 24/5 clock. The tokenised
/// stocks themselves trade on-chain around the clock. `reservePrice()`
/// takes the LOWER of feed and adapter, so through a weekend the frozen
/// feed is capped by this live price and can never overpay a bond. Spot
/// without a TWAP is safe in that seat and only in that seat: a min can be
/// pushed down (which prices bonds more conservatively and costs only the
/// bonder) but never up.
///
/// One instance per reserve, fully immutable: the pool id, the orientation
/// and the decimal scaling are fixed at deployment, so there is nothing to
/// operate and nothing to take over. Reads that fail shut - an
/// uninitialized pool - report 0, which reservePrice() treats as "no
/// cross-check" rather than as a price.
contract Spyglass {
    using StateLibrary for IPoolManager;

    IPoolManager public immutable manager;
    PoolId public immutable poolId;
    /// @notice True when the asset is currency0 of the pool (the side with
    /// the numerically lower address), false when it is currency1.
    bool public immutable assetIsCurrency0;
    /// @notice 10^(18 + decimals of the price's denominator token), the
    /// factor that turns the raw per-unit ratio into an 18-decimal
    /// whole-unit price. Fixed from the two tokens' decimals at deployment.
    uint256 public immutable scale;

    constructor(
        IPoolManager _manager,
        PoolId _poolId,
        bool _assetIsCurrency0,
        uint8 _assetDecimals,
        uint8 _counterDecimals
    ) {
        require(address(_manager) != address(0), "Spyglass: manager is zero");
        manager = _manager;
        poolId = _poolId;
        assetIsCurrency0 = _assetIsCurrency0;
        // Whichever side the asset sits on, the ratio is arranged so the
        // asset's raw units are the numerator and the counter's the
        // denominator, so one factor covers both orientations:
        // 10^assetDecimals (one whole asset) / 10^counterDecimals (whole
        // counter units) x 1e18 (fixed point). Reverts at deployment if
        // the exponent would go negative, which no real token pair does.
        scale = 10 ** (18 + uint256(_assetDecimals) - uint256(_counterDecimals));
    }

    /// @notice Spot price of one whole asset in counter units, 18-decimal
    /// fixed point; 0 when the pool has no price to give.
    function assetPriceInCounter() external view returns (uint256) {
        (uint160 sqrtPriceX96, , , ) = manager.getSlot0(poolId);
        if (sqrtPriceX96 == 0) {
            return 0;
        }

        // token1-per-token0 in raw units, as a Q128: (sqrtP/2^96)^2 · 2^128
        uint256 ratioX128 = FullMath.mulDiv(uint256(sqrtPriceX96), uint256(sqrtPriceX96), 1 << 64);

        // A price low enough to round the Q128 ratio to zero would only come
        // from a mis-wired pool (no real asset/USDG pair is anywhere near
        // it), but the inverting branch below would divide by it. Fail shut
        // instead, so a bad Spyglass reads as "no price" rather than
        // reverting every treasury view that touches it.
        if (ratioX128 == 0) {
            return 0;
        }

        if (assetIsCurrency0) {
            // counter per asset directly
            return FullMath.mulDiv(ratioX128, scale, 1 << 128);
        }
        // asset is token1: invert the ratio
        return FullMath.mulDiv(1 << 128, scale, ratioX128);
    }
}
