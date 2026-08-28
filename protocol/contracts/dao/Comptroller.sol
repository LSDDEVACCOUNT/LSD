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
import "./Setters.sol";
import "../external/Require.sol";

contract Comptroller is Setters {
    using SafeMath for uint256;

    bytes32 private constant FILE = "Comptroller";

    function mintToAccount(address account, uint256 amount) internal {
        dollar().mint(account, amount);
        if (!bootstrappingAt(epoch())) {
            increaseDebt(amount);
        }

        balanceCheck();
    }

    /// @dev Minting against counter tokens the protocol just received, so
    /// unlike mintToAccount this deliberately creates no debt: the supply is
    /// backed, not conjured. Routing bond payouts through mintToAccount would
    /// have the protocol believe it was in deficit and open coupon sales it
    /// has no business opening.
    function mintToBondHolder(address account, uint256 amount) internal {
        dollar().mint(account, amount);

        balanceCheck();
    }

    function burnFromAccount(address account, uint256 amount) internal {
        dollar().transferFrom(account, address(this), amount);
        dollar().burn(amount);
        decrementTotalDebt(amount, "Comptroller: not enough outstanding debt");

        balanceCheck();
    }

    function redeemToAccount(address account, uint256 amount) internal {
        dollar().transfer(account, amount);
        decrementTotalRedeemable(amount, "Comptroller: not enough redeemable balance");

        balanceCheck();
    }

    function burnRedeemable(uint256 amount) internal {
        dollar().burn(amount);
        decrementTotalRedeemable(amount, "Comptroller: not enough redeemable balance");

        balanceCheck();
    }

    function increaseDebt(uint256 amount) internal {
        incrementTotalDebt(amount);

        balanceCheck();
    }

    function decreaseDebt(uint256 amount) internal {
        decrementTotalDebt(amount, "Comptroller: not enough debt");

        balanceCheck();
    }

    function increaseSupply(uint256 newSupply) internal returns (uint256, uint256, uint256) {
        (uint256 newRedeemable, uint256 lessDebt) = (0, 0);

        // 1. True up redeemable pool
        uint256 totalRedeemable = totalRedeemable();
        uint256 totalCoupons = totalCoupons();
        if (totalRedeemable < totalCoupons) {
            newRedeemable = totalCoupons.sub(totalRedeemable);
            newRedeemable = newRedeemable > newSupply ? newSupply : newRedeemable;
            mintToRedeemable(newRedeemable);

            newSupply = newSupply.sub(newRedeemable);
        }

        // 2. Eliminate debt
        uint256 totalDebt = totalDebt();
        if (newSupply > 0 && totalDebt > 0) {
            lessDebt = totalDebt > newSupply ? newSupply : totalDebt;
            decreaseDebt(lessDebt);

            newSupply = newSupply.sub(lessDebt);
        }

        // 3. Payout to bonded
        if (totalBonded() == 0) {
            newSupply = 0;
        }
        if (newSupply > 0) {
            mintToBonded(newSupply);
        }

        return (newRedeemable, lessDebt, newSupply);
    }

    /// @dev internal rather than upstream's private so Treasury, which
    /// inherits Comptroller, can assert the same invariant after moving
    /// tokens.
    ///
    /// The balance check is `>=`, not upstream ESD's `==`. Anyone can send
    /// LSD straight to this address - a plain ERC20 transfer, not a
    /// deposit - and under `==` a single wei of that would make every
    /// balance-changing call (deposit, bond, redeem, advance, ...) revert
    /// on the next assertion and brick the protocol for one wei. The only
    /// thing the assertion has to guarantee is solvency: that the contract
    /// holds at least the LSD it has credited to staged, bonded and
    /// redeemable, so it can always pay those out. A donated surplus above
    /// that is credited to no one, cannot be withdrawn by the donor, and
    /// changes no other number here (backing divides reserves by supply,
    /// redemption pays reserves pro rata - neither reads this balance), so
    /// it is harmless and left where it lands.
    function balanceCheck() internal {
        Require.that(
            dollar().balanceOf(address(this)) >= totalBonded().add(totalStaged()).add(totalRedeemable()),
            FILE,
            "Inconsistent balances"
        );

        Require.that(
            totalDebt() <= dollar().totalSupply(),
            FILE,
            "Debt too large"
        );
    }

    function mintToBonded(uint256 amount) private {
        Require.that(
            totalBonded() > 0,
            FILE,
            "Cant mint to empty pool"
        );

        uint256 poolAmount = amount.mul(Constants.getOraclePoolRatio()).div(100);
        uint256 paidToPools = mintToPools(poolAmount);

        // Whatever the pools did not take goes to bonders rather than
        // nowhere: rounding dust, and the whole share if no pool is on the
        // schedule yet. Expansion must never mint less than it decided to.
        uint256 bondedAmount = amount.sub(paidToPools);
        dollar().mint(address(this), bondedAmount);
        incrementTotalBonded(bondedAmount);

        balanceCheck();
    }

    /**
     * @dev Splits the LP share of an expansion across every pool on the
     * schedule, by weight.
     *
     * Upstream ESD had exactly one pool and minted the whole share to it.
     * LSD runs an LSD pair against each of several tokenised stocks as well
     * as against the counter token, and they all have to be worth providing
     * to. The oracle pool carries the largest weight by default because the
     * protocol stops regulating altogether if that one thins out - see
     * State.sol.
     *
     * The pools are plain ERC20 holders as far as this is concerned: they
     * read their reward off their own balance, so a mint is the whole of the
     * transfer and nothing here can revert on a pool's behalf.
     *
     * @return the total actually minted, which is at most `poolAmount` and
     * short of it by the division remainder.
     */
    function mintToPools(uint256 poolAmount) private returns (uint256) {
        uint256 total = totalPoolWeight();
        if (total == 0 || poolAmount == 0) {
            return 0;
        }

        uint256 paid = 0;
        uint256 count = poolCount();
        for (uint256 i = 0; i < count; i++) {
            address target = poolAt(i);
            uint256 share = poolAmount.mul(poolWeight(target)).div(total);
            if (share > 0) {
                dollar().mint(target, share);
                paid = paid.add(share);
            }
        }

        return paid;
    }

    function mintToRedeemable(uint256 amount) private {
        dollar().mint(address(this), amount);
        incrementTotalRedeemable(amount);

        balanceCheck();
    }
}
