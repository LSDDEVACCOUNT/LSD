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

/**
 * The token the treasury holds and LSD is priced against - USDC on mainnet,
 * the free-mint stand-in on testnet.
 *
 * `decimals()` is read rather than configured, so nothing has to be kept in
 * sync by hand. The token must be a standard ERC20 that returns a bool from
 * transfer and transferFrom; the treasury checks those return values.
 */
contract ICounter {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}
