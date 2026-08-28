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

import "./external/Decimal.sol";

library Constants {
    /*
     * ---------------------------------------------------------------------
     * PROFILE: MAINNET (Robinhood Chain, 6-hour epochs)
     * ---------------------------------------------------------------------
     * Several constants below count in *epochs*, not in time, so they only
     * mean what you think once you fix the epoch length. Shortening epochs
     * without moving them shortens the durations they stand for - a coupon
     * window, a governance vote - silently.
     *
     * At 21600s epochs (4 per day):
     *
     *   COUPON_EXPIRATION     360   / 4 a day = 90 days   (ESD: 90 days)
     *   GOVERNANCE_PERIOD      28   / 4 a day =  7 days   (ESD:  7 days)
     *
     * BOOTSTRAPPING_PERIOD counts 10% compounding expansions, not time: at
     * BOOTSTRAPPING_PRICE the supply-change limit caps each bootstrapping
     * epoch at +10%, so the phase multiplies supply by
     * 1.1^BOOTSTRAPPING_PERIOD. ESD ran 90 of them (~5,300x); this deploy
     * runs 45 (~73x, 3.75 days at 2h bootstrap epochs). The shortening is a
     * treasury decision, not a pacing one: capital bonded at genesis is
     * divided by whatever multiplication follows it, and a floor divided by
     * 5,300 is a rounding error while one divided by 73 is a floor.
     *
     * The deploy tooling reads the epoch length back off the chain and
     * stops if it isn't what was expected, so a half-switched profile does
     * not get as far as a live deployment.
     * ---------------------------------------------------------------------
     */

    /* Chain */
    // Used as the EIP-712 signing domain (see LibEIP712/Permittable) - must
    // match the chain this is actually deployed on, or permit() signatures
    // will not verify.
    uint256 private constant CHAIN_ID = 4663; // Robinhood Chain Mainnet

    /* Bootstrapping */
    // A count of forced +10% expansions, not a duration - see the note at
    // the top. 45 of them multiply supply by ~73x over 3.75 days; raising
    // this to fill a longer window would compound, not stretch.
    uint256 private constant BOOTSTRAPPING_PERIOD = 45;
    uint256 private constant BOOTSTRAPPING_PRICE = 11e17; // 1.10, what expansion runs on
    uint256 private constant BOOTSTRAPPING_SPEEDUP_FACTOR = 3; // 2h epochs while bootstrapping
    // What genesis bonds sell at, flat, for the whole bootstrap: no market
    // input at all, because at genesis there is no market worth the name -
    // the oracle's validity check is only "the pool holds liquidity", and
    // five LSD listed at any price satisfies it. A price that reads nothing
    // cannot be fed anything. Far above the eventual peg on purpose: each
    // genesis bond carries five dollars of backing per LSD issued, and
    // paying 5 for a token targeting 1 is rational exactly because early
    // supply still has the bootstrap multiplication ahead of it - which is
    // also why no discount applies on top, and why the door goes quiet by
    // itself late in the bootstrap, when little multiplication remains.
    uint256 private constant GENESIS_BOND_PRICE = 5e18; // 5.00

    /* Bonding */
    uint256 private constant INITIAL_STAKE_MULTIPLE = 1e6; // 100 LSD -> 100M LSDS
    // How long bonding or unbonding leaves an account Fluid - unable to take
    // its LSD out, or to vote. Upstream ESD hardcoded one epoch of a day;
    // this keeps that day and spends it as four six-hour epochs.
    //
    // What it defends against is bonding just before advance(), collecting
    // the expansion, and leaving before any contraction can reach you. That
    // trade lives on the DAO side, where expansion is credited to bonded
    // balances, so that is where the lock has to bite.
    //
    // The pool's is deliberately half of it, not double. Liquidity providers
    // already carry impermanent loss, which DAO bonders do not, and the
    // oracle reads its price from the pool: if that thins out, capture()
    // reports invalid and the protocol stops regulating at all. Charging the
    // riskier position the longer lock would tax the one behaviour
    // everything else depends on. DSD, forking ESD after watching it get
    // farmed, went the same way and further - 72h on the DAO against 24h on
    // the pool.
    uint256 private constant DAO_EXIT_LOCKUP_EPOCHS = 16; // 4 days at 6h epochs
    uint256 private constant POOL_EXIT_LOCKUP_EPOCHS = 12; // 3 days at 6h epochs

    /* Epoch */
    // 6 hours, so 4 epochs a day. ESD ran one epoch a day (86400).
    uint256 private constant EPOCH_PERIOD = 21600; // 6 hours

    /* Governance */
    // 28 epochs at 4 a day = a 7-day voting window, as ESD had.
    uint256 private constant GOVERNANCE_PERIOD = 28;
    uint256 private constant GOVERNANCE_QUORUM = 33e16; // 33%

    /* DAO */
    // Paid to whoever calls advance(). ESD paid a flat amount forever, which
    // is a bet that the token stays cheap: the incentive is denominated in
    // LSD but the work it pays for is denominated in gas, so once LSD is
    // worth something a flat 100 is wildly overpaying for a transaction.
    //
    // So: a flat ADVANCE_INCENTIVE_MAX while bootstrapping, when the supply
    // is multiplying anyway and getting the epochs stepped matters more than
    // what it costs, and afterwards whatever the call actually cost in gas
    // plus ADVANCE_INCENTIVE_MARGIN percent, clamped between MIN and MAX.
    //
    // The clamp is not cosmetic. The gas price is set by the caller, so
    // without a ceiling anyone could pay an absurd gas price and be handed
    // 125% of it back in LSD - a mint faucet that costs 80 cents on the
    // dollar. MAX bounds that at the amount the protocol was willing to pay
    // anyway.
    uint256 private constant ADVANCE_INCENTIVE_MAX = 100e18; // 100 LSD
    uint256 private constant ADVANCE_INCENTIVE_MIN = 5e18; // 5 LSD
    uint256 private constant ADVANCE_INCENTIVE_MARGIN = 25; // +25%
    // Gas spent outside the measured region: the 21,000 base, calldata, the
    // mint that pays the incentive, and the measurement itself. Deliberately
    // an estimate - being a little generous here is what keeps advance()
    // worth calling at the floor.
    uint256 private constant ADVANCE_GAS_OVERHEAD = 60000;

    /* Market */
    // 360 epochs at 4 a day = 90 days, as ESD had.
    uint256 private constant COUPON_EXPIRATION = 360;

    /* Treasury (bond-backed floor - not part of upstream ESD) */
    // Discount bonders get against the oracle price, and the ceiling the
    // treasurer may raise it to. The discount is their compensation for
    // taking price risk across the vesting window; it starts at the ceiling
    // because early on there is nothing backing LSD yet and bonding has to
    // be worth doing. Whatever it is set to, the effective price clamps at
    // backing - see Getters.effectiveBondPrice - so no discount setting can
    // sell below the floor or close the window.
    uint256 private constant BOND_DISCOUNT = 25e16; // 25%
    uint256 private constant MAX_BOND_DISCOUNT = 25e16; // 25%
    // Epochs a bond vests before it can be claimed - 24 hours at 6h epochs.
    // The discount is what buys the bonder's patience across this window, and
    // 25% buys a lot of it: Semivault asks 24 hours for 20%. A shorter window
    // would be paying the same discount for less patience, and it is the
    // window that keeps claimed supply from all arriving at once.
    uint256 private constant BOND_VESTING_EPOCHS = 4;
    // Most new supply bonds may mint in one epoch, as a share of total supply.
    // Without a cap one actor could mint an unbounded amount of discounted
    // supply and sell it. This is deliberately generous: from a standing
    // start a percent an epoch would take months to build any backing worth
    // having, and the guard that actually protects holders is that a bond
    // can never price under backing - the cap only limits how fast.
    uint256 private constant BOND_SUPPLY_LIMIT = 1e17; // 10%
    // The bootstrap-window cap, double the normal one. Wide because at the
    // flat genesis price every sale raises backing and there is no
    // manipulable market to defend; capped at all because an open door lets
    // early capital corner the genesis multiplication - whoever fills it
    // first owns the share everyone later is diluted against. 20% per epoch
    // keeps the treasury filling fast while no single epoch's buyers can
    // take more than a sixth of what that epoch ends with.
    uint256 private constant GENESIS_BOND_SUPPLY_LIMIT = 2e17; // 20%
    // Most reserve assets the treasury may hold. redeem() pays out every one
    // of them in a single call, so the list has to stay short enough to be
    // affordable to redeem against - the floor is worthless if using it
    // costs more gas than it pays.
    uint256 private constant MAX_RESERVES = 8;
    // Most LP pools that can share an expansion. Every one of them is minted
    // to inside advance(), so the list has to stay short enough that stepping
    // the epoch never becomes expensive enough for nobody to bother.
    uint256 private constant MAX_POOLS = 12;
    // How old a Chainlink answer may be before the treasury stops pricing
    // that asset, and the ceiling governance may raise that to.
    //
    // Robinhood's stock feeds run 24/5, so the window has to carry a feed
    // across the weekend: Friday's close to Monday's reopen is around 65
    // hours, and three days rides it with a margin. That does not leave the
    // weekend unguarded - each stock's own USDG pool trades around the
    // clock, and reservePrice() takes the LOWER of feed and pool, so a
    // Friday price that the live market has moved under is capped by the
    // market, not paid out.
    //
    // It is in storage rather than compiled in because the cost of guessing
    // wrong is asymmetric and the true heartbeat is not published. Too tight
    // only closes bonding, which is inconvenient; too loose lets a bond be
    // priced off a stale number, which dilutes every holder. Governance can
    // move it either way without an upgrade.
    uint256 private constant RESERVE_MAX_STALENESS = 3 days;
    uint256 private constant MAX_RESERVE_STALENESS = 7 days;

    // How far the pool's spot may sit from the feed's answer before the
    // treasury refuses to price the asset at all. Inside the band the min()
    // quietly takes the lower; past it, one of the two sources is simply
    // wrong - a feed frozen through a violent weekend move, or a pool
    // someone shoved - and a bond priced off either would be a guess.
    // Refusing closes bonding (the safe failure), never redemption.
    uint256 private constant RESERVE_MAX_DIVERGENCE = 1e17; // 10%

    /* Regulator */
    /* The expansion throttle. SUPPLY_CHANGE_LIMIT is the ceiling; the live
     * limit only climbs while the price is actually pinned against it, and
     * every contraction epoch halves it toward SUPPLY_RAMP_FLOOR - see
     * Regulator. It comes out of genesis AT the ceiling: bootstrapping is
     * forty-five pinned expansion epochs, so continuing demand carries
     * straight on at 10%. Once contractions have walked it down, a single
     * manipulated epoch mints 2.5%, not 10%, and re-earning the ceiling
     * takes five consecutive epochs of the oracle reading 2.5%+ over the
     * peg. 2.5% per 6-hour epoch is ~10.4% a day - almost exactly upstream
     * ESD's daily rate, which the retiming to four epochs a day had quietly
     * multiplied by four. */
    uint256 private constant SUPPLY_CHANGE_LIMIT = 1e17; // 10% ceiling
    uint256 private constant SUPPLY_RAMP_FLOOR = 25e15; // 2.5%, where contractions stop cutting
    // Share of each expansion paid to liquidity providers rather than to
    // DAO bonders. ESD used 5; DSD, after watching ESD run, used 35. 25 sits
    // between them: enough that providing liquidity competes with bonding,
    // which is what keeps the pool deep enough for the oracle to trust.
    uint256 private constant ORACLE_POOL_RATIO = 25; // 25%


    /**
     * Getters
     */

    function getEpochPeriod() internal pure returns (uint256) {
        return EPOCH_PERIOD;
    }

    function getInitialStakeMultiple() internal pure returns (uint256) {
        return INITIAL_STAKE_MULTIPLE;
    }

    function getDAOExitLockupEpochs() internal pure returns (uint256) {
        return DAO_EXIT_LOCKUP_EPOCHS;
    }

    function getBootstrappingPeriod() internal pure returns (uint256) {
        return BOOTSTRAPPING_PERIOD;
    }

    function getBootstrappingPrice() internal pure returns (Decimal.D256 memory) {
        return Decimal.D256({value: BOOTSTRAPPING_PRICE});
    }

    function getBootstrappingSpeedupFactor() internal pure returns (uint256) {
        return BOOTSTRAPPING_SPEEDUP_FACTOR;
    }

    function getGenesisBondPrice() internal pure returns (Decimal.D256 memory) {
        return Decimal.D256({value: GENESIS_BOND_PRICE});
    }

    function getGovernancePeriod() internal pure returns (uint256) {
        return GOVERNANCE_PERIOD;
    }

    function getGovernanceQuorum() internal pure returns (Decimal.D256 memory) {
        return Decimal.D256({value: GOVERNANCE_QUORUM});
    }

    function getAdvanceIncentiveMax() internal pure returns (uint256) {
        return ADVANCE_INCENTIVE_MAX;
    }

    function getAdvanceIncentiveMin() internal pure returns (uint256) {
        return ADVANCE_INCENTIVE_MIN;
    }

    function getAdvanceIncentiveMargin() internal pure returns (uint256) {
        return ADVANCE_INCENTIVE_MARGIN;
    }

    function getAdvanceGasOverhead() internal pure returns (uint256) {
        return ADVANCE_GAS_OVERHEAD;
    }

    function getCouponExpiration() internal pure returns (uint256) {
        return COUPON_EXPIRATION;
    }

    function getBondDiscount() internal pure returns (Decimal.D256 memory) {
        return Decimal.D256({value: BOND_DISCOUNT});
    }

    function getMaxBondDiscount() internal pure returns (Decimal.D256 memory) {
        return Decimal.D256({value: MAX_BOND_DISCOUNT});
    }

    function getMaxReserves() internal pure returns (uint256) {
        return MAX_RESERVES;
    }

    function getMaxPools() internal pure returns (uint256) {
        return MAX_POOLS;
    }

    function getReserveMaxStaleness() internal pure returns (uint256) {
        return RESERVE_MAX_STALENESS;
    }

    function getMaxReserveStaleness() internal pure returns (uint256) {
        return MAX_RESERVE_STALENESS;
    }

    function getReserveMaxDivergence() internal pure returns (Decimal.D256 memory) {
        return Decimal.D256({value: RESERVE_MAX_DIVERGENCE});
    }

    function getBondVestingEpochs() internal pure returns (uint256) {
        return BOND_VESTING_EPOCHS;
    }

    function getBondSupplyLimit() internal pure returns (Decimal.D256 memory) {
        return Decimal.D256({value: BOND_SUPPLY_LIMIT});
    }

    function getGenesisBondSupplyLimit() internal pure returns (Decimal.D256 memory) {
        return Decimal.D256({value: GENESIS_BOND_SUPPLY_LIMIT});
    }

    function getSupplyRampFloor() internal pure returns (Decimal.D256 memory) {
        return Decimal.D256({value: SUPPLY_RAMP_FLOOR});
    }

    function getSupplyChangeLimit() internal pure returns (Decimal.D256 memory) {
        return Decimal.D256({value: SUPPLY_CHANGE_LIMIT});
    }

    function getOraclePoolRatio() internal pure returns (uint256) {
        return ORACLE_POOL_RATIO;
    }

    function getChainId() internal pure returns (uint256) {
        return CHAIN_ID;
    }
}
