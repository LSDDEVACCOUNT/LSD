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

import "../external/Decimal.sol";

contract IOracle {
    function capture() public returns (Decimal.D256 memory, bool);
    // Address of the Watchtower (Uniswap V4 hook) this Oracle reads its
    // price from - upstream ESD's Oracle exposed `pair()` (a Uniswap V2
    // pair address) for the same purpose (Deployer3 uses this to wire up
    // the LP-incentive Pool contract to the same pool the price comes
    // from). See NOTICE for why this fork moved off V2 pairs to a V4 hook.
    function hook() external view returns (address);
}
