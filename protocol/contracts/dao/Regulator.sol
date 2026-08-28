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
import "./Comptroller.sol";
import "../external/Decimal.sol";
import "../Constants.sol";

contract Regulator is Comptroller {
    using SafeMath for uint256;
    using Decimal for Decimal.D256;

    event SupplyIncrease(uint256 indexed epoch, uint256 price, uint256 newRedeemable, uint256 lessDebt, uint256 newBonded);
    event SupplyDecrease(uint256 indexed epoch, uint256 price, uint256 newDebt);
    event SupplyNeutral(uint256 indexed epoch);

    function step() internal {
        Decimal.D256 memory price = oracleCapture();

        if (price.greaterThan(Decimal.one())) {
            growSupply(price);
            return;
        }

        if (price.lessThan(Decimal.one())) {
            shrinkSupply(price);
            return;
        }

        emit SupplyNeutral(epoch());
    }

    /**
     * The per-epoch limit is a throttle that has to be earned, not a fixed
     * cap. It climbs by half again each epoch the price actually pins it -
     * a deviation at or above the limit - up to SUPPLY_CHANGE_LIMIT (10%),
     * and every contraction epoch halves it, down to SUPPLY_RAMP_FLOOR
     * (2.5%). A deviation below the limit expands by the deviation and
     * leaves the throttle where it is: the ramp follows the price, never
     * runs ahead of it.
     *
     * It comes out of genesis AT the ceiling. Bootstrapping is forty-five
     * pinned expansion epochs, so demand that carries straight on keeps
     * expanding at 10% with no re-earning; the throttle only walks down
     * once contractions actually happen. From the floor, one manipulated
     * oracle epoch mints 2.5% instead of 10%, and re-earning the ceiling
     * takes five consecutive epochs (~30h) of the price holding 2.5%+ over
     * the peg - sustained demand, not a spike.
     *
     * Bootstrapping itself bypasses the ramp - expansion is pinned to the
     * ceiling so genesis multiplies as designed - and leaves the stored
     * limit untouched, which is exactly what makes the hand-off seamless:
     * the unset field reads as the ceiling.
     */
    function shrinkSupply(Decimal.D256 memory price) private {
        Decimal.D256 memory lim = currentLimit();
        Decimal.D256 memory delta = Decimal.one().sub(price);
        if (delta.greaterThan(lim)) {
            delta = lim;
        }
        uint256 newDebt = delta.mul(totalNet()).asUint256();
        increaseDebt(newDebt);
        rampDown();

        emit SupplyDecrease(epoch(), price.value, newDebt);
        return;
    }

    function growSupply(Decimal.D256 memory price) private {
        Decimal.D256 memory lim = currentLimit();
        Decimal.D256 memory delta = price.sub(Decimal.one());
        bool pinned = !delta.lessThan(lim);
        if (pinned) {
            delta = lim;
            rampUp();
        }
        uint256 newSupply = delta.mul(totalNet()).asUint256();
        (uint256 newRedeemable, uint256 lessDebt, uint256 newBonded) = increaseSupply(newSupply);
        emit SupplyIncrease(epoch(), price.value, newRedeemable, lessDebt, newBonded);
    }

    function currentLimit() private view returns (Decimal.D256 memory) {
        if (bootstrappingAt(epoch().sub(1))) {
            return Constants.getSupplyChangeLimit();
        }
        return Decimal.D256({value: supplyLimit()});
    }

    function rampUp() private {
        if (bootstrappingAt(epoch().sub(1))) {
            return;
        }
        uint256 next = supplyLimit().mul(3).div(2);
        uint256 cap = Constants.getSupplyChangeLimit().value;
        _state.supplyLimit = next > cap ? cap : next;
    }

    function rampDown() private {
        if (bootstrappingAt(epoch().sub(1))) {
            return;
        }
        uint256 next = supplyLimit().div(2);
        uint256 rest = Constants.getSupplyRampFloor().value;
        _state.supplyLimit = next < rest ? rest : next;
    }

    function oracleCapture() private returns (Decimal.D256 memory) {
        (Decimal.D256 memory price, bool valid) = oracle().capture();

        // Record what bonds may be sold against, which is only ever a price
        // this function was willing to act on itself.
        //
        // During bootstrapping nothing is recorded: genesis bonds sell at
        // the flat GENESIS_BOND_PRICE (see effectiveBondPrice), which takes
        // no market input on purpose. The oracle's validity check is only
        // "the pool holds liquidity", and a genesis pool is thin enough
        // that five LSD listed at any price would read as a market - a
        // price that reads nothing cannot be fed anything. Expansion still
        // runs on the pinned policy price.
        if (bootstrappingAt(epoch().sub(1))) {
            setBondPrice(Decimal.zero());
            return Constants.getBootstrappingPrice();
        }
        if (!valid) {
            setBondPrice(Decimal.zero());
            return Decimal.one();
        }

        setBondPrice(price);
        return price;
    }
}
