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
 * @title IAggregatorV3
 * @notice The read side of a Chainlink price feed, which is what Robinhood
 * Chain publishes for each Stock Token. Declared here rather than pulled in
 * as a dependency because this is the whole of it that the treasury uses,
 * and because the published Chainlink packages target a much later Solidity
 * than the 0.5.17 the DAO is pinned to.
 *
 * `answer` is signed and can legitimately be zero or negative for non-price
 * feeds, so every caller has to check it - see Getters.reservePrice().
 * `decimals()` is usually 8 for USD feeds and is read rather than assumed.
 */
contract IAggregatorV3 {
    function decimals() external view returns (uint8);

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}
