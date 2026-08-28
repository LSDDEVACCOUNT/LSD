/*
    Copyright 2020 Empty Set Squad <emptysetsquad@protonmail.com>

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
*/

pragma solidity ^0.5.17;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./State.sol";
import "../Constants.sol";
import "./ICounter.sol";
import "./IAggregatorV3.sol";
import "./IReservePoolPrice.sol";

contract Getters is State {
    using SafeMath for uint256;
    using Decimal for Decimal.D256;

    bytes32 private constant IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    /**
     * ERC20 Interface
     */

    function name() public view returns (string memory) {
        return "Liquid Supply Dollar Stake";
    }

    function symbol() public view returns (string memory) {
        return "LSDS";
    }

    function decimals() public view returns (uint8) {
        return 18;
    }

    function balanceOf(address account) public view returns (uint256) {
        return _state.accounts[account].balance;
    }

    function totalSupply() public view returns (uint256) {
        return _state.balance.supply;
    }

    function allowance(address owner, address spender) external view returns (uint256) {
        return 0;
    }

    /**
     * Global
     */

    function dollar() public view returns (IDollar) {
        return _state.provider.dollar;
    }

    function oracle() public view returns (IOracle) {
        return _state.provider.oracle;
    }

    function pool() public view returns (address) {
        return _state.provider.pool;
    }

    function totalBonded() public view returns (uint256) {
        return _state.balance.bonded;
    }

    function totalStaged() public view returns (uint256) {
        return _state.balance.staged;
    }

    function totalDebt() public view returns (uint256) {
        return _state.balance.debt;
    }

    function totalRedeemable() public view returns (uint256) {
        return _state.balance.redeemable;
    }

    function totalCoupons() public view returns (uint256) {
        return _state.balance.coupons;
    }

    function totalNet() public view returns (uint256) {
        return dollar().totalSupply().sub(totalDebt());
    }

    /**
     * Account
     */

    function balanceOfStaged(address account) public view returns (uint256) {
        return _state.accounts[account].staged;
    }

    function balanceOfBonded(address account) public view returns (uint256) {
        uint256 totalSupply = totalSupply();
        if (totalSupply == 0) {
            return 0;
        }
        return totalBonded().mul(balanceOf(account)).div(totalSupply);
    }

    function balanceOfCoupons(address account, uint256 epoch) public view returns (uint256) {
        if (outstandingCoupons(epoch) == 0) {
            return 0;
        }
        return _state.accounts[account].coupons[epoch];
    }

    function statusOf(address account) public view returns (Account.Status) {
        if (_state.accounts[account].lockedUntil > epoch()) {
            return Account.Status.Locked;
        }

        return epoch() >= _state.accounts[account].fluidUntil ? Account.Status.Frozen : Account.Status.Fluid;
    }

    function allowanceCoupons(address owner, address spender) public view returns (uint256) {
        return _state.accounts[owner].couponAllowances[spender];
    }

    /**
     * Epoch
     */

    function epoch() public view returns (uint256) {
        return _state.epoch.current;
    }

    function epochStart() public view returns (uint256) {
        return _state.epoch.start;
    }

    function epochPeriod() public view returns (uint256) {
        return _state.epoch.period;
    }

    function epochTime() public view returns (uint256) {
        uint256 epochStart = epochStart();

        if (block.timestamp < epochStart) {
            return 0;
        }

        uint256 bootstrappingPeriod = epochPeriod().div(Constants.getBootstrappingSpeedupFactor());
        uint256 bootstrappingTotal = Constants.getBootstrappingPeriod().mul(bootstrappingPeriod);

        if (block.timestamp < epochStart.add(bootstrappingTotal)) {
            return block.timestamp.sub(epochStart).div(bootstrappingPeriod).add(1);
        }

        return block.timestamp
            .sub(epochStart.add(bootstrappingTotal))
            .div(_state.epoch.period)
            .add(1)
            .add(Constants.getBootstrappingPeriod());
    }

    function outstandingCoupons(uint256 epoch) public view returns (uint256) {
        return _state.epochs[epoch].coupons.outstanding;
    }

    function couponsExpiration(uint256 epoch) public view returns (uint256) {
        return _state.epochs[epoch].coupons.expiration;
    }

    function expiringCoupons(uint256 epoch) public view returns (uint256) {
        return _state.epochs[epoch].coupons.expiring.length;
    }

    function expiringCouponsAtIndex(uint256 epoch, uint256 i) public view returns (uint256) {
        return _state.epochs[epoch].coupons.expiring[i];
    }

    function totalBondedAt(uint256 epoch) public view returns (uint256) {
        return _state.epochs[epoch].bonded;
    }

    /**
     * Treasury (bond-backed floor)
     */

    function counter() public view returns (address) {
        return _state.counter;
    }

    function treasurer() public view returns (address) {
        return _state.treasurer;
    }

    function bondsPaused() public view returns (bool) {
        return _state.bondsPaused;
    }

    /**
     * LP pools
     *
     * `pool()` above is the oracle pool and is always poolAt(0). The rest are
     * the other LSD pairs - tokenised stocks against LSD - that governance has
     * put on the emission schedule.
     */

    function poolCount() public view returns (uint256) {
        return _state.pools.length;
    }

    function poolAt(uint256 index) public view returns (address) {
        return _state.pools[index];
    }

    /// @dev A scan rather than a flag: the list is capped at a handful of
    /// entries, and weight zero is a legal state for a listed pool, so a
    /// mapping lookup could not answer this on its own.
    function isPool(address account) internal view returns (bool) {
        for (uint256 i = 0; i < _state.pools.length; i++) {
            if (_state.pools[i] == account) {
                return true;
            }
        }
        return false;
    }

    /// @notice This pool's share of each expansion, relative to the total.
    /// Zero means listed but currently earning nothing.
    function poolWeight(address account) public view returns (uint256) {
        return _state.poolWeights[account];
    }

    function totalPoolWeight() public view returns (uint256) {
        return _state.totalPoolWeight;
    }

    /**
     * Reserves
     *
     * The counter token from the pool is reserve zero and is the unit of
     * account: everything the treasury holds is valued in it, and so is the
     * oracle price LSD is bonded against. The rest are tokenised stocks,
     * each priced by the Chainlink feed listed alongside it.
     *
     * A stock's feed can be stale or dead, so nothing here may be
     * load-bearing for redemption. It is not: redeem() pays out a straight
     * pro-rata slice of every reserve and never asks what any of it is
     * worth. Prices only decide how much LSD a bond pays out, and a bond
     * the protocol cannot price is a bond it refuses to sell.
     */

    function reserveCount() public view returns (uint256) {
        return _state.reserves.length;
    }

    function reserveAt(uint256 index) public view returns (address) {
        return _state.reserves[index];
    }

    /// @notice Whether `asset` may still be bonded. A delisted asset keeps
    /// its balance, its feed and its place in the redemption basket - only
    /// new bonds in it stop.
    function isReserve(address asset) public view returns (bool) {
        return _state.reserveListed[asset];
    }

    /// @notice The Chainlink feed pricing `asset`, or zero for the counter
    /// token, which is itself the unit of account.
    function reserveOracle(address asset) public view returns (address) {
        return _state.reserveOracles[asset];
    }

    /// @notice Raw balance of a reserve asset, in that asset's own decimals.
    function reserveBalance(address asset) public view returns (uint256) {
        return asset == address(0) ? 0 : ICounter(asset).balanceOf(address(this));
    }

    /// @notice Price of one whole unit of `asset` in counter units, 18-decimal
    /// fixed point, and whether that price can be trusted right now.
    ///
    /// Every failure returns `(0, false)` rather than reverting, so that a
    /// single broken feed cannot take down every view on this contract.
    function reservePrice(address asset) public view returns (uint256, bool) {
        address feed = _state.reserveOracles[asset];
        if (feed == address(0)) {
            // The counter token is the unit of account and needs no feed.
            // Anything else without one is simply not a reserve.
            return asset == _state.counter && asset != address(0)
                ? (Decimal.one().value, true)
                : (0, false);
        }

        (uint256 price, bool ok) = oraclePrice(feed);
        if (!ok) {
            return (0, false);
        }

        // Cross-check against the market the asset actually trades in, and
        // take whichever is lower.
        //
        // The direction is what makes this safe without a TWAP. To be paid
        // more LSD for a bond you need a HIGHER valuation, and a min can
        // never be pushed up: moving the pool against the protocol requires
        // moving it up, which the feed then wins. Moving it down only makes
        // the treasury value the asset more conservatively than the market
        // does, which costs the bonder and never the holders. So spot is
        // enough here, where it would not be if this number stood alone.
        //
        // But only inside a band. Past RESERVE_MAX_DIVERGENCE apart, either
        // the feed froze through a real move or the pool is being shoved,
        // and a bond priced off either would be a guess - so the answer is
        // no price at all, which closes bonding and touches nothing else.
        uint256 fromPool = poolPrice(asset);
        if (fromPool > 0) {
            uint256 gap = fromPool > price ? fromPool.sub(price) : price.sub(fromPool);
            if (Decimal.ratio(gap, price).greaterThan(Constants.getReserveMaxDivergence())) {
                return (0, false);
            }
            if (fromPool < price) {
                return (fromPool, true);
            }
        }

        return (price, true);
    }

    /// @dev What one whole unit of `asset` is worth in counter units,
    /// according to the LSD pool it trades against. Zero when there is no
    /// pool wired up, or no trusted LSD price to convert through.
    function poolPrice(address asset) internal view returns (uint256) {
        address pool = _state.reservePools[asset];
        if (pool == address(0)) {
            return 0;
        }

        // An adapter over the deep on-chain market the asset trades in
        // (Spyglass over its USDG pool), reporting the spot price of one
        // whole asset in counter units. It trades around the clock, where
        // the feed follows market hours - so through a weekend this is the
        // side of the min() that is still awake.
        return IReservePoolPrice(pool).assetPriceInCounter();
    }

    /// @notice One Chainlink answer, normalised to 18 decimals, and whether
    /// it can be trusted. Every failure returns `(0, false)` rather than
    /// reverting, so one broken feed cannot take down every view here.
    function oraclePrice(address feed) internal view returns (uint256, bool) {
        if (feed == address(0)) {
            return (0, false);
        }

        (, int256 answer, , uint256 updatedAt, ) = IAggregatorV3(feed).latestRoundData();
        if (answer <= 0 || updatedAt == 0) {
            return (0, false);
        }
        if (block.timestamp.sub(updatedAt) > reserveStaleness()) {
            return (0, false);
        }

        uint256 feedDecimals = uint256(IAggregatorV3(feed).decimals());
        if (feedDecimals > 18) {
            return (0, false);
        }

        return (uint256(answer).mul(10 ** (uint256(18).sub(feedDecimals))), true);
    }

    /// @notice How old a feed's answer may be and still price a reserve.
    function reserveStaleness() public view returns (uint256) {
        uint256 set = _state.reserveStaleness;
        return set == 0 ? Constants.getReserveMaxStaleness() : set;
    }

    /**
     * @notice What advance() would pay for a call that burned `gasUsed` gas
     * at the current gas price.
     *
     * While bootstrapping this is a flat maximum: the supply is multiplying
     * every epoch regardless, and having the epochs actually get stepped
     * matters more than what it costs. Afterwards it is what the call cost
     * plus a margin, floored so it is always worth someone's while and
     * capped because the caller picks the gas price - without the cap,
     * paying an absurd one and taking 125% of it back in LSD would be a mint
     * faucet.
     */
    function advanceIncentive(uint256 gasUsed) internal view returns (uint256) {
        uint256 max = Constants.getAdvanceIncentiveMax();
        if (bootstrappingAt(epoch())) {
            return max;
        }

        uint256 cost = gasCostInDollar(gasUsed);
        uint256 paid = cost.mul(uint256(100).add(Constants.getAdvanceIncentiveMargin())).div(100);

        uint256 min = Constants.getAdvanceIncentiveMin();
        if (paid < min) {
            return min;
        }
        return paid > max ? max : paid;
    }

    /// @dev Gas spent, valued in LSD. Zero whenever it cannot be worked out,
    /// which leaves advanceIncentive() at its floor rather than reverting -
    /// a protocol that cannot step its epoch because a feed is down is worse
    /// than one that underpays for a while.
    function gasCostInDollar(uint256 gasUsed) internal view returns (uint256) {
        (uint256 ethPrice, bool ok) = oraclePrice(_state.gasOracle);
        if (!ok) {
            return 0;
        }

        uint256 spentWei = gasUsed.add(Constants.getAdvanceGasOverhead()).mul(tx.gasprice);
        uint256 usd = spentWei.mul(ethPrice).div(Decimal.one().value);

        // The counter token is the unit of account, so a dollar of gas is
        // that many counter units, converted to LSD at the last price the
        // Regulator stood behind. Zero means there was none, in which case
        // treating LSD as a dollar is the only assumption available.
        Decimal.D256 memory price = bondPrice();
        return price.value == 0 ? usd : Decimal.D256({value: usd}).div(price).value;
    }

    /// @dev What the protocol's holding of `asset` is worth in counter
    /// units, 18-decimal fixed point, and whether it could be priced.
    /// Internal: it is price times balance, and any caller with the price
    /// already has both.
    function reserveValue(address asset) internal view returns (uint256, bool) {
        (uint256 price, bool ok) = reservePrice(asset);
        if (!ok) {
            return (0, false);
        }
        return (toEighteen(asset, reserveBalance(asset)).mul(price).div(Decimal.one().value), true);
    }

    /// @notice Everything the treasury holds, valued in counter units, and
    /// whether every reserve could be priced.
    ///
    /// When `complete` is false the value is an undercount - the assets that
    /// could not be priced contribute nothing. Bonding refuses to run on an
    /// undercount, because a treasury that looks smaller than it is makes
    /// the below-backing guard easier to clear, not harder.
    function treasuryValue() public view returns (uint256, bool) {
        uint256 total = 0;
        bool complete = true;

        for (uint256 i = 0; i < _state.reserves.length; i++) {
            (uint256 value, bool ok) = reserveValue(_state.reserves[i]);
            if (ok) {
                total = total.add(value);
            } else {
                complete = false;
            }
        }

        return (total, complete);
    }

    /// @notice Treasury value in counter units, 18-decimal fixed point.
    function treasury() public view returns (uint256) {
        (uint256 value, ) = treasuryValue();
        return value;
    }

    /// @notice Counter units backing one LSD, 18-decimal fixed point.
    /// Redemption pays exactly this, which is what makes it a floor rather
    /// than a talking point.
    function backingPerDollar() public view returns (uint256) {
        uint256 supply = dollar().totalSupply();
        if (supply == 0) {
            return 0;
        }
        return Decimal.D256({value: treasury()}).div(Decimal.D256({value: supply})).value;
    }

    /// @notice Last price the Regulator was willing to stand behind. Zero
    /// while bootstrapping, or whenever the oracle reported its pool too thin.
    function bondPrice() internal view returns (Decimal.D256 memory) {
        return _state.price;
    }

    /// @notice Discount bonders get against the oracle price. Falls back to
    /// the compiled-in default until someone sets it, so an upgrade that
    /// arrives before the first setBondDiscount() still prices bonds.
    function bondDiscount() public view returns (uint256) {
        return (_state.bondDiscountSet ? _state.bondDiscount : Constants.getBondDiscount()).value;
    }

    /// @notice What a bonder actually pays per LSD: the oracle price less
    /// the discount, clamped so it never sells below backing.
    ///
    /// The clamp replaces refusal. A bond at exactly backing grows the
    /// treasury and the supply in proportion - rounding makes it weakly
    /// accretive - so there is no price at which a bond can lower the floor,
    /// and no market condition in which the discount closes bonding. The
    /// discount decides how attractive bonds are; backing decides the
    /// minimum; only a missing price closes the window.
    function effectiveBondPrice() public view returns (uint256) {
        return effectiveBondPriceD().value;
    }

    function effectiveBondPriceD() internal view returns (Decimal.D256 memory) {
        Decimal.D256 memory price = bondPrice();

        if (bootstrappingAt(epoch())) {
            // Genesis pricing: the flat genesis price, no market input, no
            // discount. A genesis pool is thin enough that any dust listed
            // at any price would read as a "market" - so this deliberately
            // reads nothing and cannot be fed anything. Overpaying the
            // eventual peg is the cost of entering before the
            // multiplication, which is also why no discount is owed on top.
            price = Constants.getGenesisBondPrice();
        } else {
            if (price.value == 0) {
                return price; // no trusted market price: bonds are closed, not repriced
            }
            price = price.mul(Decimal.one().sub(Decimal.D256({value: bondDiscount()})));
        }

        Decimal.D256 memory floor = Decimal.D256({value: backingPerDollar()});
        return price.greaterThan(floor) ? price : floor;
    }

    function balanceOfBonds(address account, uint256 unlockEpoch) public view returns (uint256) {
        return _state.bonds[account][unlockEpoch];
    }

    function totalBonds() public view returns (uint256) {
        return _state.totalBonds;
    }

    /// @notice LSD already promised to bonds this epoch. Resets each epoch.
    function bondsThisEpoch() internal view returns (uint256) {
        return _state.bondsEpoch == epoch() ? _state.bondsThisEpoch : 0;
    }

    /// @notice How much more LSD bonds may mint this epoch.
    ///
    /// During bootstrapping the cap is 20% of supply rather than 10% -
    /// wider, because at the flat genesis price every sale raises backing
    /// and there is no manipulable market to defend against; still capped,
    /// because an open door would let early capital corner the genesis
    /// multiplication that everyone later is diluted against. Backing
    /// protects every holder equally; the cap is what protects the
    /// distribution.
    function bondCapacity() public view returns (uint256) {
        uint256 supply = dollar().totalSupply();
        Decimal.D256 memory frac = bootstrappingAt(epoch())
            ? Constants.getGenesisBondSupplyLimit()
            : Constants.getBondSupplyLimit();
        uint256 limit = frac.mul(supply).asUint256();
        uint256 used = bondsThisEpoch();
        return limit > used ? limit.sub(used) : 0;
    }

    /// @notice How many epochs a bond bought right now vests before it can
    /// be claimed.
    ///
    /// The target is wall-clock, not a count: a bond should take about a day
    /// whichever phase it is bought in. Bootstrap epochs run at a third of
    /// the normal length, so a bond bought during one needs proportionally
    /// more of them - and one bought near the end of bootstrapping is served
    /// partly by short epochs and partly by full-length ones, which is what
    /// the last line works out. Without that the count would be honoured and
    /// the duration would not: twelve epochs bought at the very end of
    /// bootstrapping would run nearly three days rather than one.
    function bondVestingEpochs() internal view returns (uint256) {
        uint256 vesting = Constants.getBondVestingEpochs();
        uint256 current = epoch();
        if (!bootstrappingAt(current)) {
            return vesting;
        }

        uint256 factor = Constants.getBootstrappingSpeedupFactor();
        uint256 full = vesting.mul(factor);

        // Short epochs still ahead, counting the one being bought in.
        uint256 short_ = Constants.getBootstrappingPeriod().add(1).sub(current);
        if (short_ >= full) {
            return full;
        }

        // `short_` short epochs, then full-length ones for the rest, rounded
        // up so the wait is never under the target.
        uint256 slow = factor.sub(1);
        return vesting.add(short_.mul(slow).add(slow).div(factor));
    }

    /// @notice LSD a bond of `amount` of `asset` would pay out right now.
    /// Zero whenever the bond would be refused for want of a price.
    function bondPayoutFor(address asset, uint256 amount) public view returns (uint256) {
        Decimal.D256 memory price = effectiveBondPriceD();
        if (price.value == 0) {
            return 0;
        }

        (uint256 value, bool ok) = bondValue(asset, amount);
        if (!ok) {
            return 0;
        }

        return Decimal.D256({value: value}).div(price).value;
    }

    /// @dev What `amount` of `asset` is worth in counter units, 18-decimal
    /// fixed point, and whether it could be priced. Internal for the same
    /// reason as reserveValue; bondPayoutFor is the view callers want.
    function bondValue(address asset, uint256 amount) internal view returns (uint256, bool) {
        (uint256 price, bool ok) = reservePrice(asset);
        if (!ok) {
            return (0, false);
        }
        return (toEighteen(asset, amount).mul(price).div(Decimal.one().value), true);
    }

    /// @dev Token amounts carry their own decimals; every ratio here is in
    /// 18-decimal fixed point, so they have to be lifted first.
    function toEighteen(address asset, uint256 amount) internal view returns (uint256) {
        if (asset == address(0)) {
            return 0;
        }
        uint256 decimals = uint256(ICounter(asset).decimals());
        require(decimals <= 18, "Getters: asset decimals > 18");
        return amount.mul(10 ** (uint256(18).sub(decimals)));
    }

    function counterToEighteen(uint256 amount) internal view returns (uint256) {
        return toEighteen(_state.counter, amount);
    }

    /// @notice The most the supply may change in the current epoch,
    /// 18-decimal fixed point. Comes out of genesis at the 10% ceiling -
    /// bootstrapping is forty-five pinned expansions - then every
    /// contraction epoch halves it toward a 2.5% floor, and it climbs by
    /// half again only in epochs where the price actually pins it. See
    /// Regulator.
    function supplyLimit() public view returns (uint256) {
        uint256 set = _state.supplyLimit;
        return set == 0 ? Constants.getSupplyChangeLimit().value : set;
    }

    function bootstrappingAt(uint256 epoch) public view returns (bool) {
        return epoch <= Constants.getBootstrappingPeriod();
    }

    /**
     * Governance
     */

    function recordedVote(address account, address candidate) public view returns (Candidate.Vote) {
        return _state.candidates[candidate].votes[account];
    }

    function startFor(address candidate) public view returns (uint256) {
        return _state.candidates[candidate].start;
    }

    function periodFor(address candidate) public view returns (uint256) {
        return _state.candidates[candidate].period;
    }

    function approveFor(address candidate) public view returns (uint256) {
        return _state.candidates[candidate].approve;
    }

    function rejectFor(address candidate) public view returns (uint256) {
        return _state.candidates[candidate].reject;
    }

    function votesFor(address candidate) public view returns (uint256) {
        return approveFor(candidate).add(rejectFor(candidate));
    }

    function isNominated(address candidate) public view returns (bool) {
        return _state.candidates[candidate].start > 0;
    }

    function isInitialized(address candidate) public view returns (bool) {
        return _state.candidates[candidate].initialized;
    }

    function implementation() public view returns (address impl) {
        bytes32 slot = IMPLEMENTATION_SLOT;
        assembly {
            impl := sload(slot)
        }
    }
}
