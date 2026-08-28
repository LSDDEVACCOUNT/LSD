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
import "./Getters.sol";
import "../external/Require.sol";

contract Setters is State, Getters {
    using SafeMath for uint256;

    /**
     * ERC20 Interface
     */

    function transfer(address recipient, uint256 amount) external returns (bool) {
        return false;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        return false;
    }

    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool) {
        return false;
    }

    /**
     * Global
     */

    function incrementTotalBonded(uint256 amount) internal {
        _state.balance.bonded = _state.balance.bonded.add(amount);
    }

    function decrementTotalBonded(uint256 amount, string memory reason) internal {
        _state.balance.bonded = _state.balance.bonded.sub(amount, reason);
    }

    function incrementTotalDebt(uint256 amount) internal {
        _state.balance.debt = _state.balance.debt.add(amount);
    }

    function decrementTotalDebt(uint256 amount, string memory reason) internal {
        _state.balance.debt = _state.balance.debt.sub(amount, reason);
    }

    function incrementTotalRedeemable(uint256 amount) internal {
        _state.balance.redeemable = _state.balance.redeemable.add(amount);
    }

    function decrementTotalRedeemable(uint256 amount, string memory reason) internal {
        _state.balance.redeemable = _state.balance.redeemable.sub(amount, reason);
    }

    /**
     * Account
     */

    function incrementBalanceOf(address account, uint256 amount) internal {
        _state.accounts[account].balance = _state.accounts[account].balance.add(amount);
        _state.balance.supply = _state.balance.supply.add(amount);
    }

    function decrementBalanceOf(address account, uint256 amount, string memory reason) internal {
        _state.accounts[account].balance = _state.accounts[account].balance.sub(amount, reason);
        _state.balance.supply = _state.balance.supply.sub(amount, reason);
    }

    function incrementBalanceOfStaged(address account, uint256 amount) internal {
        _state.accounts[account].staged = _state.accounts[account].staged.add(amount);
        _state.balance.staged = _state.balance.staged.add(amount);
    }

    function decrementBalanceOfStaged(address account, uint256 amount, string memory reason) internal {
        _state.accounts[account].staged = _state.accounts[account].staged.sub(amount, reason);
        _state.balance.staged = _state.balance.staged.sub(amount, reason);
    }

    function incrementBalanceOfCoupons(address account, uint256 epoch, uint256 amount) internal {
        _state.accounts[account].coupons[epoch] = _state.accounts[account].coupons[epoch].add(amount);
        _state.epochs[epoch].coupons.outstanding = _state.epochs[epoch].coupons.outstanding.add(amount);
        _state.balance.coupons = _state.balance.coupons.add(amount);
    }

    function decrementBalanceOfCoupons(address account, uint256 epoch, uint256 amount, string memory reason) internal {
        _state.accounts[account].coupons[epoch] = _state.accounts[account].coupons[epoch].sub(amount, reason);
        _state.epochs[epoch].coupons.outstanding = _state.epochs[epoch].coupons.outstanding.sub(amount, reason);
        _state.balance.coupons = _state.balance.coupons.sub(amount, reason);
    }

    function unfreeze(address account) internal {
        _state.accounts[account].fluidUntil = epoch().add(Constants.getDAOExitLockupEpochs());
    }

    /**
     * Treasury (bond-backed floor)
     */

    function setBondPrice(Decimal.D256 memory price) internal {
        _state.price = price;
    }

    function setBondDiscountInternal(Decimal.D256 memory discount) internal {
        Require.that(
            discount.lessThanOrEqualTo(Constants.getMaxBondDiscount()),
            "Setters",
            "Discount above ceiling"
        );
        _state.bondDiscount = discount;
        _state.bondDiscountSet = true;
    }

    function setBondsPausedInternal(bool paused) internal {
        _state.bondsPaused = paused;
    }

    function setReservePoolInternal(address asset, address pool) internal {
        Require.that(_state.reserveOracles[asset] != address(0), "Setters", "Not a priced reserve");
        _state.reservePools[asset] = pool;
    }

    function setReserveStalenessInternal(uint256 seconds_) internal {
        Require.that(seconds_ > 0, "Setters", "Staleness is zero");
        Require.that(
            seconds_ <= Constants.getMaxReserveStaleness(),
            "Setters",
            "Staleness above ceiling"
        );
        _state.reserveStaleness = seconds_;
    }

    function setGasOracleInternal(address feed) internal {
        _state.gasOracle = feed;
    }

    function setTreasurer(address account) internal {
        _state.treasurer = account;
    }

    /**
     * LP pools
     */

    function addPoolInternal(address account, uint256 weight) internal {
        Require.that(account != address(0), "Setters", "Pool is zero");
        Require.that(!isPool(account), "Setters", "Already a pool");
        Require.that(
            _state.pools.length < Constants.getMaxPools(),
            "Setters",
            "Too many pools"
        );

        _state.pools.push(account);
        _state.poolWeights[account] = weight;
        _state.totalPoolWeight = _state.totalPoolWeight.add(weight);
    }

    /// @dev Weight zero stops a pool earning without removing it, which keeps
    /// poolAt() indices stable for anything reading the list.
    function setPoolWeightInternal(address account, uint256 weight) internal {
        Require.that(isPool(account), "Setters", "Not a pool");

        _state.totalPoolWeight = _state.totalPoolWeight
            .sub(_state.poolWeights[account], "Setters: weight underflow")
            .add(weight);
        _state.poolWeights[account] = weight;
    }

    /// @dev Listing a reserve is the one action here that could be used to
    /// drain the protocol - a token nobody wants, paired with a feed that
    /// says it is worth a fortune, bonds for real LSD. Governance is the
    /// only caller by design; see Treasury.sol.
    function addReserveInternal(address asset, address oracle) internal {
        Require.that(asset != address(0), "Setters", "Asset is zero");
        Require.that(!_state.reserveListed[asset], "Setters", "Already listed");
        Require.that(
            _state.reserves.length < Constants.getMaxReserves(),
            "Setters",
            "Too many reserves"
        );

        _state.reserveListed[asset] = true;
        _state.reserveOracles[asset] = oracle;
        _state.reserves.push(asset);
    }

    /// @dev Delisting stops new bonds in an asset but leaves the balance
    /// where it is - it stays part of what redemption pays out, because
    /// taking it out of the basket would hand it to nobody.
    function removeReserveInternal(address asset) internal {
        Require.that(_state.reserveListed[asset], "Setters", "Not listed");
        Require.that(asset != _state.counter, "Setters", "Cannot delist counter");

        // The feed stays wired up: the balance is still part of what
        // redemption pays out, so it still has to be valued. Only bonding
        // in this asset stops.
        _state.reserveListed[asset] = false;
    }

    // `unlockEpoch` rather than `epoch`, which would shadow the epoch()
    // getter this needs to read for the per-epoch cap.
    function incrementBalanceOfBonds(address account, uint256 unlockEpoch, uint256 amount) internal {
        _state.bonds[account][unlockEpoch] = _state.bonds[account][unlockEpoch].add(amount);
        _state.totalBonds = _state.totalBonds.add(amount);

        if (_state.bondsEpoch != epoch()) {
            _state.bondsEpoch = epoch();
            _state.bondsThisEpoch = 0;
        }
        _state.bondsThisEpoch = _state.bondsThisEpoch.add(amount);
    }

    function decrementBalanceOfBonds(address account, uint256 unlockEpoch, uint256 amount, string memory reason) internal {
        _state.bonds[account][unlockEpoch] = _state.bonds[account][unlockEpoch].sub(amount, reason);
        _state.totalBonds = _state.totalBonds.sub(amount, reason);
    }

    function updateAllowanceCoupons(address owner, address spender, uint256 amount) internal {
        _state.accounts[owner].couponAllowances[spender] = amount;
    }

    function decrementAllowanceCoupons(address owner, address spender, uint256 amount, string memory reason) internal {
        _state.accounts[owner].couponAllowances[spender] =
            _state.accounts[owner].couponAllowances[spender].sub(amount, reason);
    }

    /**
     * Epoch
     */

    function incrementEpoch() internal {
        _state.epoch.current = _state.epoch.current.add(1);
    }

    function snapshotTotalBonded() internal {
        _state.epochs[epoch()].bonded = totalBonded();
    }

    function initializeCouponsExpiration(uint256 epoch, uint256 expiration) internal {
        _state.epochs[epoch].coupons.expiration = expiration;
        _state.epochs[expiration].coupons.expiring.push(epoch);
    }

    function eliminateOutstandingCoupons(uint256 epoch) internal {
        uint256 outstandingCouponsForEpoch = outstandingCoupons(epoch);
        if(outstandingCouponsForEpoch == 0) {
            return;
        }
        _state.balance.coupons = _state.balance.coupons.sub(outstandingCouponsForEpoch);
        _state.epochs[epoch].coupons.outstanding = 0;
    }

    /**
     * Governance
     */

    function createCandidate(address candidate, uint256 period) internal {
        _state.candidates[candidate].start = epoch();
        _state.candidates[candidate].period = period;
    }

    function recordVote(address account, address candidate, Candidate.Vote vote) internal {
        _state.candidates[candidate].votes[account] = vote;
    }

    function incrementApproveFor(address candidate, uint256 amount) internal {
        _state.candidates[candidate].approve = _state.candidates[candidate].approve.add(amount);
    }

    function decrementApproveFor(address candidate, uint256 amount, string memory reason) internal {
        _state.candidates[candidate].approve = _state.candidates[candidate].approve.sub(amount, reason);
    }

    function incrementRejectFor(address candidate, uint256 amount) internal {
        _state.candidates[candidate].reject = _state.candidates[candidate].reject.add(amount);
    }

    function decrementRejectFor(address candidate, uint256 amount, string memory reason) internal {
        _state.candidates[candidate].reject = _state.candidates[candidate].reject.sub(amount, reason);
    }

    function placeLock(address account, address candidate) internal {
        uint256 currentLock = _state.accounts[account].lockedUntil;
        uint256 newLock = startFor(candidate).add(periodFor(candidate));
        if (newLock > currentLock) {
            _state.accounts[account].lockedUntil = newLock;
        }
    }

    function initialized(address candidate) internal {
        _state.candidates[candidate].initialized = true;
    }
}
