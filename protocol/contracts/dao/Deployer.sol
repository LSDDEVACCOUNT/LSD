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
import "../token/Loxley.sol";
import "../oracle/Longbow.sol";
import "./Upgradeable.sol";
import "./Permission.sol";


contract Fletcher is State, Permission, Upgradeable {
    function initialize() initializer public {
        _state.provider.dollar = new Loxley();
    }

    function implement(address implementation) external {
        upgradeTo(implementation);
    }
}

contract Bowyer is State, Permission, Upgradeable {
    // MUST be set to the already-deployed Watchtower's address before
    // compiling (see protocol/v4/src/Watchtower.sol) - a
    // Uniswap V4 hook contract, compiled separately with Solidity ^0.8.24,
    // that this 0.5.x code cannot `new` directly (see NOTICE), so the
    // deploy script deploys it first (via CREATE2, with `_controller` set
    // to this DAO's own predicted address) and this constant just wires up
    // the resulting address. Left as address(0) so deployment fails loudly
    // instead of silently pointing at nothing.
    address private constant HOOK_ADDRESS = address(0);

    function initialize() initializer public {
        _state.provider.oracle = new Longbow(address(dollar()), HOOK_ADDRESS);
        // Hands control of the hook's capture() access from this DAO
        // (temporarily "controller" since deployment - see
        // Watchtower.setDao()) to the Oracle just created above, in the
        // same transaction. msg.sender as seen by the hook is this DAO
        // (Root), matching HOOK_ADDRESS's `_controller` constructor arg.
        IWatchtower(HOOK_ADDRESS).setDao(address(oracle()));
    }

    function implement(address implementation) external {
        upgradeTo(implementation);
    }
}

/// @dev Just enough of the Solidity ^0.8.24 Quiver to read which token
/// sits on the other side of the pool. Calling across the pragma boundary is
/// fine - only `new` is not (see NOTICE).
contract IQuiver {
    function poolKey() external view returns (address, address, uint24, int24, address);
    function dollarIsCurrency0() external view returns (bool);
}

contract Stringer is State, Permission, Upgradeable {
    // MUST be set to the already-deployed Quiver's address before
    // compiling (see protocol/v4/src/Quiver.sol) - same
    // reasoning as HOOK_ADDRESS above: a Solidity ^0.8.24 contract this
    // 0.5.x code cannot `new` directly, deployed by the script ahead of
    // time (with its own `dao` constructor arg set to this DAO's own
    // predicted address) and just wired up here.
    address private constant POOL_ADDRESS = address(0);

    function initialize() initializer public {
        _state.provider.pool = POOL_ADDRESS;

        // Derive the treasury's counter token from the pool rather than
        // taking it as another hand-pasted constant. Read this way it cannot
        // disagree with the token the oracle prices against, which is the
        // only thing that makes backingPerDollar() mean anything.
        (address currency0, address currency1, , , ) = IQuiver(POOL_ADDRESS).poolKey();
        _state.counter = IQuiver(POOL_ADDRESS).dollarIsCurrency0() ? currency1 : currency0;

        // The counter token is reserve zero and the unit of account, so it
        // needs no price feed. Tokenised stocks are listed afterwards by
        // governance, each with its Chainlink feed - listing is the one
        // action that could be used to drain the treasury, so it is never
        // something a single address can do.
        addReserveInternal(_state.counter, address(0));

        // The oracle pool goes on the emission schedule as pool zero. The
        // weight is relative, so on its own it takes the whole LP share;
        // adding an LSD/stock pool at weight 10 later gives this one 30/40 of
        // it, and so on. It is set high deliberately - the protocol reads its
        // price from this pool and goes neutral if it empties out.
        addPoolInternal(POOL_ADDRESS, 30);

        setBondDiscountInternal(Constants.getBondDiscount());

        // Whoever ran the upgrade. May start the epoch clock (launch()),
        // move the bond discount inside the range Constants allows, and set
        // the gas oracle - nothing else; governance can retire
        // them by proposal. msg.sender survives the delegatecall chain, so
        // this is the deploying account, not the proxy.
        setTreasurer(msg.sender);
    }

    function implement(address implementation) external {
        upgradeTo(implementation);
    }
}