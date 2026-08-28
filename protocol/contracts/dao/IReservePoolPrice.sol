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
 * @title IReservePoolPrice
 * @notice The one view the treasury's cross-check needs off a reserve's
 * market adapter: the spot price of one whole unit of the asset in counter
 * units, 18-decimal fixed point. Zero means "no price right now".
 *
 * The canonical implementation is Spyglass (protocol/v4), which reads the
 * asset's own USDG pool straight out of the Uniswap V4 PoolManager. An
 * adapter computes off a raw sqrt price, which needs the 512-bit math the
 * 0.8 compiler has a library for and 0.5 does not - hence the boundary.
 */
contract IReservePoolPrice {
    function assetPriceInCounter() external view returns (uint256);
}
