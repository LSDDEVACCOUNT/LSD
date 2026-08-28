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

import "../external/Require.sol";
import "../external/Decimal.sol";
import "./IOracle.sol";

/// @dev Minimal interface for calling the Watchtower (a Uniswap V4 hook,
/// compiled separately with Solidity ^0.8.24 - see
/// protocol/v4/src/Watchtower.sol) from this 0.5.x contract. Solidity can
/// call any already-deployed contract through an ABI-compatible interface
/// regardless of which compiler version produced it - this is exactly how
/// upstream ESD's Oracle.sol already called the externally deployed
/// Uniswap V2 Factory/Pair contracts, just applied across a Solidity
/// major-version boundary instead of an org boundary. See NOTICE for the
/// full rationale for moving off V2 pairs to a V4 hook.
contract IWatchtower {
    function capture() external returns (uint256 price, bool valid);
    function setDao(address dao) external;
}

contract Longbow is IOracle {
    using Decimal for Decimal.D256;

    bytes32 private constant FILE = "Longbow";

    address internal _dao;
    address internal _dollar;
    address internal _hook;

    constructor (address dollar, address hook) public {
        _dao = msg.sender;
        _dollar = dollar;
        _hook = hook;
    }

    function capture() public onlyDao returns (Decimal.D256 memory, bool) {
        (uint256 price, bool valid) = IWatchtower(_hook).capture();
        return (Decimal.D256({value: price}), valid);
    }

    function hook() external view returns (address) {
        return _hook;
    }

    function dollar() external view returns (address) {
        return _dollar;
    }

    modifier onlyDao() {
        Require.that(
            msg.sender == _dao,
            FILE,
            "Not dao"
        );

        _;
    }
}
