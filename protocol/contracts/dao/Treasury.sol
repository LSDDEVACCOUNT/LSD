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

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./Comptroller.sol";
import "./ICounter.sol";
import "../Constants.sol";

/**
 * @title Treasury
 * @notice Sells LSD at a discount for counter tokens, and lets anyone redeem
 * LSD for its pro-rata share of what it collected.
 *
 * Not part of upstream ESD. ESD had one answer to a price below a dollar -
 * coupons - and coupons only pay out if the supply expands again. That makes
 * them a bet on recovery, not a floor, which is why ESD had nothing under it
 * when the recovery did not come.
 *
 * The two halves here only work together:
 *
 *   purchaseBond  takes a reserve asset now and owes LSD in a couple of
 *                 epochs, at a discount to the oracle price. The protocol
 *                 keeps the asset.
 *   redeem        burns LSD and pays out that LSD's share of everything the
 *                 protocol holds.
 *
 * The reserve is not limited to the counter token. Governance can list
 * tokenised stocks alongside it, each with the Chainlink feed Robinhood
 * publishes for it, and bonds in those buy real equity into the backing.
 * Pricing them is the only place a feed is trusted, and the trust is
 * one-directional: a feed that is stale, dead or non-positive stops bonds
 * in that asset and stops bonding entirely while it cannot be valued,
 * because a treasury that reads low makes the below-backing guard easier to
 * clear rather than harder.
 *
 * Redemption never reads a feed at all. It pays a straight pro-rata slice
 * of every reserve balance - some cash, some of each stock - which needs no
 * prices to be correct and cannot be stopped by a feed going quiet. A floor
 * that only holds while an oracle is up is not a floor.
 *
 * Redemption is what makes the backing real. Without it "backing" is a number
 * on a dashboard; with it, LSD cannot trade far below backing for long,
 * because anyone can buy it cheap and redeem it. That floor is unconditional
 * on purpose - gating redemption on a contraction would make it a promise
 * rather than a mechanism, and the whole point is that nobody has to trust it.
 *
 * Redemption is exactly pro-rata, so it cannot break itself: burning `d` of a
 * supply `S` against a holding `T` pays `T*d/S` and leaves `(T - T*d/S) /
 * (S - d) = T/S` behind. That holds per asset, so it holds for the basket
 * however the prices move. A rush of redemptions shrinks both sides together
 * and every remaining holder is left exactly as backed as before. Integer
 * division rounds the payout down, so the floor can only ever tick up.
 *
 * What this does not do is make the floor rise on its own. Every expansion
 * mints LSD against no new counter tokens and thins the backing; bonds have
 * to bring in more than expansions dilute for the floor to climb. And a
 * bonder who sells the moment their bond vests is selling into the same
 * market the price depends on. The discount buys their patience for two
 * epochs and no longer than that.
 */
contract Treasury is Comptroller {
    using SafeMath for uint256;
    using Decimal for Decimal.D256;

    bytes32 private constant FILE = "Treasury";

    event BondPurchase(
        address indexed account,
        address indexed asset,
        uint256 indexed unlockEpoch,
        uint256 assetAmount,
        uint256 dollarPayout
    );
    event BondClaim(address indexed account, uint256 indexed unlockEpoch, uint256 dollarAmount);
    event Redemption(address indexed account, uint256 dollarAmount, uint256[] payouts);
    event BondDiscountChange(address indexed account, uint256 discount);
    event BondsPause(address indexed account);

    /**
     * @notice Hand the protocol `amount` of a listed reserve asset, and be
     * owed LSD at a discount once the bond vests.
     * @return the LSD that will be claimable
     */
    function purchaseBond(address asset, uint256 amount) external returns (uint256) {
        Require.that(!bondsPaused(), FILE, "Bonds paused");
        Require.that(amount > 0, FILE, "Must bond non-zero");
        Require.that(isReserve(asset), FILE, "Not a reserve asset");

        Decimal.D256 memory price = effectiveBondPriceD();
        Require.that(price.greaterThan(Decimal.zero()), FILE, "No price to bond at");

        // Everything the treasury holds has to be priceable before any of it
        // can be bonded against. An unpriceable asset drops out of the sum,
        // which understates backing, which is the one direction the guard
        // below cannot tolerate.
        // Both price (with its backing clamp) and this completeness check
        // read the treasury BEFORE the transfer below, so a bonder's own
        // deposit is never counted against them.
        (, bool complete) = treasuryValue();
        Require.that(complete, FILE, "Reserve not priceable");

        // Credit what actually arrived, not what was asked for. A token that
        // skims a transfer fee, or rounds internally, would otherwise be owed
        // LSD for value the treasury never received - and reserve listing
        // should not have to depend on governance catching that in review.
        uint256 held = reserveBalance(asset);
        Require.that(
            ICounter(asset).transferFrom(msg.sender, address(this), amount),
            FILE,
            "Asset transfer failed"
        );
        uint256 received = reserveBalance(asset).sub(held);

        (uint256 value, bool priced) = bondValue(asset, received);
        Require.that(priced, FILE, "Asset not priceable");
        Require.that(value > 0, FILE, "Value rounds to zero");

        uint256 payout = Decimal.D256({value: value}).div(price).value;
        Require.that(payout > 0, FILE, "Payout rounds to zero");
        Require.that(payout <= bondCapacity(), FILE, "Over epoch capacity");

        uint256 unlockEpoch = epoch().add(bondVestingEpochs());
        incrementBalanceOfBonds(msg.sender, unlockEpoch, payout);

        emit BondPurchase(msg.sender, asset, unlockEpoch, received, payout);

        return payout;
    }

    /**
     * @notice Claim a vested bond. The LSD is minted here rather than at
     * purchase, so nothing sits in the contract waiting and the supply the
     * oracle sees is not inflated by promises not yet due.
     */
    function claimBond(uint256 unlockEpoch) external returns (uint256) {
        uint256 amount = balanceOfBonds(msg.sender, unlockEpoch);
        Require.that(amount > 0, FILE, "No bond for that epoch");
        Require.that(epoch() >= unlockEpoch, FILE, "Bond still vesting");

        decrementBalanceOfBonds(msg.sender, unlockEpoch, amount, "Treasury: insufficient bond");
        mintToBondHolder(msg.sender, amount);

        emit BondClaim(msg.sender, unlockEpoch, amount);

        return amount;
    }

    /**
     * @notice Burn LSD for its share of everything the protocol holds. This
     * is the floor.
     * @return what was paid out of each reserve, in reserve order
     */
    function redeem(uint256 dollarAmount) external returns (uint256[] memory) {
        Require.that(dollarAmount > 0, FILE, "Must redeem non-zero");

        uint256 supply = dollar().totalSupply();
        Require.that(supply > 0, FILE, "No supply");

        // Shares are computed against the supply as it stands before the
        // burn - that is what the caller actually owns - and all of them are
        // read before anything moves.
        uint256 count = reserveCount();
        uint256[] memory payouts = new uint256[](count);
        bool any = false;
        for (uint256 i = 0; i < count; i++) {
            payouts[i] = reserveBalance(reserveAt(i)).mul(dollarAmount).div(supply);
            if (payouts[i] > 0) {
                any = true;
            }
        }
        Require.that(any, FILE, "Nothing backing this yet");

        dollar().transferFrom(msg.sender, address(this), dollarAmount);
        dollar().burn(dollarAmount);

        // Comptroller's invariant holds that debt never exceeds supply. Deep
        // in a contraction, redemption can shrink supply past a debt that was
        // raised against a larger one - without this the invariant would trip
        // and the floor would stop working exactly when it is needed.
        uint256 remaining = dollar().totalSupply();
        if (totalDebt() > remaining) {
            decrementTotalDebt(totalDebt().sub(remaining), "Treasury: debt underflow");
        }

        for (uint256 i = 0; i < count; i++) {
            if (payouts[i] == 0) {
                continue; // dust: not worth the transfer, and some tokens revert on zero
            }
            Require.that(
                ICounter(reserveAt(i)).transfer(msg.sender, payouts[i]),
                FILE,
                "Asset transfer failed"
            );
        }

        balanceCheck();

        emit Redemption(msg.sender, dollarAmount, payouts);

        return payouts;
    }

    /**
     * @notice Move the bond discount, within the ceiling Constants sets.
     * The treasurer can do this, start the epoch clock (launch()), and set
     * the gas oracle - nothing else: it cannot move funds,
     * mint, or list a reserve, and a bond still cannot price under backing
     * whatever the discount says. Governance can retire the treasurer by
     * proposal, the same way it lists reserves.
     */
    /// @param discount 18-decimal fixed point, so 25e16 is 25%.
    function setBondDiscount(uint256 discount) external {
        Require.that(msg.sender == treasurer(), FILE, "Not treasurer");
        setBondDiscountInternal(Decimal.D256({value: discount}));

        emit BondDiscountChange(msg.sender, discount);
    }

    /**
     * @notice Stop new treasury bonds immediately. Treasurer only, and
     * one-way: nothing here reopens them - only governance can, by
     * committing ResumeBonds, or the fixed implementation whose initialize
     * clears the flag. The brake exists for a mispriced feed or a bug in
     * bond pricing: an honest treasurer can stop a leak faster than a
     * 7-day vote, and a dishonest one can only ever close a door, never
     * open one - the safe direction. Claims on bonds already bought still
     * vest and pay; redemption is untouched.
     */
    function pauseBonds() external {
        Require.that(msg.sender == treasurer(), FILE, "Not treasurer");
        setBondsPausedInternal(true);

        emit BondsPause(msg.sender);
    }
}
