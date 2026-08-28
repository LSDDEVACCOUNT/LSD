/*
    Copyright 2026

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

import "./Greenwood.sol";

/**
 * Governance proposals.
 *
 * ESD has no admin functions: the only way to change anything is to propose
 * a new implementation, have bonded holders vote it through, and commit it.
 * A proposal is therefore a contract, and the change it makes lives in its
 * initialize(). Each one below inherits Heartwood - the full runtime - so once
 * committed the protocol keeps behaving exactly as before apart from the
 * one thing the proposal did.
 *
 * Fill in the constants, compile, deploy, then propose the deployed address
 * through the DAO the same way any other candidate is proposed.
 */

/**
 * @title ListReserve
 * @notice Adds a tokenised stock to the treasury, with the Chainlink feed
 * that prices it.
 *
 * This is the one action in the protocol that could be used to drain it: an
 * asset nobody wants, paired with a feed that claims it is worth a fortune,
 * bonds for real LSD and dilutes every holder. That is why it is a vote and
 * not a function call. Before voting for one of these, check that ASSET is
 * the token you think it is and that FEED is the address Robinhood publishes
 * for it - not one that merely reports plausible numbers today.
 */
contract ListReserve is Heartwood {
    address private constant ASSET = address(0);
    address private constant FEED = address(0);
    // The Spyglass over this asset's own USDG pool, or address(0) for
    // none. Its spot price is only ever taken as the lower half of a min
    // against the feed, so wiring it up can make the treasury more
    // conservative and never less - and it is the side that stays awake
    // when the 24/5 feed sleeps through a weekend. Wire it up.
    address private constant POOL = address(0);

    function initialize() initializer public {
        addReserveInternal(ASSET, FEED);
        if (POOL != address(0)) {
            setReservePoolInternal(ASSET, POOL);
        }

        // The feed has to work now, or the whole treasury becomes
        // unpriceable the moment this lands and bonding stops protocol-wide.
        (, bool ok) = reservePrice(ASSET);
        require(ok, "ListReserve: feed is not answering");
    }
}

/**
 * @title SetReservePool
 * @notice Wires an already-listed reserve to the market adapter that
 * cross-checks its feed - a Spyglass over the asset's own USDG pool - or
 * to address(0) to stop cross-checking it.
 *
 * The adapter price is only ever the lower half of a min, so this cannot
 * be used to make the treasury value anything more highly than its feed
 * says. The worst a wrong adapter does is undervalue an asset, making
 * bonds in it a worse deal, which costs the bonder and never the holders.
 * Its real job is coverage: the pool trades around the clock, where the
 * feed follows market hours - through a weekend the min still has one
 * live, conservative eye open.
 */
contract SetReservePool is Heartwood {
    address private constant ASSET = address(0);
    address private constant POOL = address(0);

    function initialize() initializer public {
        setReservePoolInternal(ASSET, POOL);
    }
}

/**
 * @title DelistReserve
 * @notice Stops new bonds in an asset. The balance stays where it is and
 * still pays out on redemption - taking it out of the basket would hand it
 * to nobody.
 */
contract DelistReserve is Heartwood {
    address private constant ASSET = address(0);

    function initialize() initializer public {
        removeReserveInternal(ASSET);
    }
}

/**
 * @title AddPool
 * @notice Puts another LSD pair on the LP emission schedule - an Quiver
 * deployed against, say, the LSD/AAPL pool.
 *
 * WEIGHT is relative to every other pool's, not a percentage. The oracle pool
 * starts at 30; listing seven stock pools at 10 each leaves it with 30/100 of
 * the LP share. Do not starve it: the protocol reads its price from that pool
 * and stops regulating entirely if its liquidity thins out.
 *
 * Unlike listing a reserve, this cannot be used to take anything - a pool can
 * only ever receive newly minted LSD, and only during an expansion the
 * Regulator already decided on. The worst a bad entry does is waste emission.
 */
contract AddPool is Heartwood {
    address private constant POOL = address(0);
    uint256 private constant WEIGHT = 10;

    function initialize() initializer public {
        addPoolInternal(POOL, WEIGHT);
    }
}

/**
 * @title SetPoolWeight
 * @notice Retunes one pool's share, or sets it to zero to stop it earning.
 * Zero leaves the pool listed so the indices anything reading the list has
 * cached stay valid.
 */
contract SetPoolWeight is Heartwood {
    address private constant POOL = address(0);
    uint256 private constant WEIGHT = 0;

    function initialize() initializer public {
        setPoolWeightInternal(POOL, WEIGHT);
    }
}

// Replacing a Quiver (a code upgrade of the LP wrapper, say) is these two
// templates in tandem: AddPool for the successor at the old weight, then
// SetPoolWeight retiring the incumbent to zero - committable in the same
// epoch, so the schedule never pays two versions for longer than a block.
// A single candidate doing both was measured at 24,632 bytes at runs=1 -
// over EIP-170 - so it cannot exist. The `pool()` view keeps naming the
// retired Quiver afterwards - nothing on-chain reads it, the schedule is
// the source of truth - and old-pool LPs keep unbond/withdraw/claim, so
// positions migrate at their own pace.

/**
 * @title SetReserveStaleness
 * @notice Changes how old a Chainlink answer may be and still price a
 * reserve.
 *
 * Tightening it only closes bonding sooner when a feed goes quiet, which
 * costs nothing but bonds. Loosening it lets an older answer price a bond, so
 * it is the direction to be careful in - and why there is a ceiling in
 * Constants that this cannot exceed. Redemption is unaffected either way; it
 * never reads a price.
 */
contract SetReserveStaleness is Heartwood {
    uint256 private constant SECONDS = 1 days;

    function initialize() initializer public {
        setReserveStalenessInternal(SECONDS);
    }
}

/**
 * @title RetireTreasurer
 * @notice Hands the bond discount to nobody, freezing it wherever it stands.
 * The treasurer can only ever move the discount inside the range Constants
 * allows, so this is a tidying-up move rather than an emergency one.
 */
contract RetireTreasurer is Heartwood {
    address private constant NEW_TREASURER = address(0);

    function initialize() initializer public {
        setTreasurer(NEW_TREASURER);
    }
}

/**
 * @title ResumeBonds
 * @notice Reopens treasury bonds after the treasurer pulled the
 * pauseBonds() brake. Deliberately governance-only: the pause exists for a
 * bug or a lying price source, and whether that is actually fixed is a
 * judgement no single key should make. A fix that ships its own
 * implementation does not need this - its initialize() can clear the flag
 * itself.
 */
contract ResumeBonds is Heartwood {
    function initialize() initializer public {
        setBondsPausedInternal(false);
    }
}
