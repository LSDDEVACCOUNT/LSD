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

import "../token/IDollar.sol";
import "../oracle/IOracle.sol";
import "../external/Decimal.sol";

contract Account {
    enum Status {
        Frozen,
        Fluid,
        Locked
    }

    struct State {
        uint256 staged;
        uint256 balance;
        mapping(uint256 => uint256) coupons;
        mapping(address => uint256) couponAllowances;
        uint256 fluidUntil;
        uint256 lockedUntil;
    }
}

contract Epoch {
    struct Global {
        uint256 start;
        uint256 period;
        uint256 current;
    }

    struct Coupons {
        uint256 outstanding;
        uint256 expiration;
        uint256[] expiring;
    }

    struct State {
        uint256 bonded;
        Coupons coupons;
    }
}

contract Candidate {
    enum Vote {
        UNDECIDED,
        APPROVE,
        REJECT
    }

    struct State {
        uint256 start;
        uint256 period;
        uint256 approve;
        uint256 reject;
        mapping(address => Vote) votes;
        bool initialized;
    }
}

contract Storage {
    struct Provider {
        IDollar dollar;
        IOracle oracle;
        address pool;
    }

    struct Balance {
        uint256 supply;
        uint256 bonded;
        uint256 staged;
        uint256 redeemable;
        uint256 debt;
        uint256 coupons;
    }

    struct State {
        Epoch.Global epoch;
        Balance balance;
        Provider provider;

        mapping(address => Account.State) accounts;
        mapping(uint256 => Epoch.State) epochs;
        mapping(address => Candidate.State) candidates;

        /*
         * Added by this fork for the bond-backed treasury (see Treasury.sol).
         *
         * Appended rather than folded into the structs above so that every
         * slot upstream ESD defined keeps the position it had - the storage
         * layout has to stay identical across Deployer1/2/3 and
         * Greenwood, since they all run against this same proxy.
         */

        // Token the treasury holds and LSD is priced against. Derived from
        // the LP pool by Deployer3, so it cannot disagree with the oracle.
        address counter;

        // Last oracle price the Regulator found trustworthy, in counter units
        // per LSD. Zero while bootstrapping or whenever the pool is too thin
        // for the oracle to vouch for a price - bonds are closed in that case
        // rather than sold against a number nobody stands behind.
        Decimal.D256 price;

        // LSD owed to bonds that have not been claimed yet, per account and
        // per unlock epoch, plus the total across everyone.
        mapping(address => mapping(uint256 => uint256)) bonds;
        uint256 totalBonds;

        // Per-epoch bond issuance cap, so a single actor cannot mint an
        // unbounded amount of discounted supply in one go.
        uint256 bondsEpoch;
        uint256 bondsThisEpoch;

        // Everything the treasury holds, in the order it was listed. The
        // counter token from the pool is always the first entry and is the
        // unit of account; the rest are tokenised stocks, each with the
        // Chainlink feed that prices it. Listing an asset is a full-trust
        // action - a worthless token with a lying feed could be bonded for
        // real LSD - so it goes through governance and nothing else.
        address[] reserves;
        mapping(address => address) reserveOracles;
        mapping(address => bool) reserveListed;

        // Discount bonders get against the oracle price. Kept in storage
        // rather than read from Constants so it can be tuned without an
        // upgrade; `bondDiscountSet` is what separates "nobody has set it"
        // from a deliberate zero.
        Decimal.D256 bondDiscount;
        bool bondDiscountSet;

        // May move the bond discount inside the range Constants allows, and
        // nothing else: it cannot move funds, mint, list a reserve, or make
        // a bond that lowers backing. Governance can retire it by proposal.
        address treasurer;

        // Every LP pool that earns a share of expansion, and how that share
        // is split. `provider.pool` above stays the oracle pool - the one the
        // price is read from - and is simply the first entry here.
        //
        // Weights are relative, not percentages: a pool's share is its weight
        // over the total. The oracle pool needs the largest one. If its
        // liquidity thins out, capture() reports invalid and the protocol
        // stops regulating at all, so its depth is not one incentive among
        // several - it is the precondition for the rest working.
        address[] pools;
        mapping(address => uint256) poolWeights;
        uint256 totalPoolWeight;

        // The Quiver whose spot price cross-checks a reserve's feed, if
        // one is wired up. Only ever the lower half of a min against the
        // feed, so it can make the treasury more conservative and never less.
        mapping(address => address) reservePools;

        // How old a Chainlink answer may be before the treasury refuses to
        // price that asset. Zero means nobody has set it, which falls back to
        // the compiled-in default - a real zero would reject every feed.
        uint256 reserveStaleness;

        // Chainlink ETH/USD, used only to price what an advance() call cost
        // in gas so the incentive can pay that back rather than a flat
        // amount. Unset simply means the incentive sits at its floor.
        address gasOracle;
        // The live per-epoch supply-change limit, 18-decimal fixed point.
        // Zero means "never touched": reads fall back to the
        // SUPPLY_CHANGE_LIMIT ceiling, so the first market epoch after
        // genesis - forty-five pinned expansions - continues at full rate
        // without an initializer. Appended, like everything above, so
        // upstream slots keep their positions.
        uint256 supplyLimit;

        // Treasurer's one-way brake: stops new treasury bonds instantly.
        // Cleared only by governance (ResumeBonds, or a fix's initialize).
        bool bondsPaused;
    }
}

contract State {
    Storage.State _state;
}
