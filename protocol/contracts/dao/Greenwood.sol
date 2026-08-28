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
import "./Market.sol";
import "./Regulator.sol";
import "./Bonding.sol";
import "./Govern.sol";
import "./Treasury.sol";
import "../external/Require.sol";
import "../Constants.sol";

/**
 * Everything the running protocol is, minus first-deploy concerns. The
 * governance proposals in Governance.sol inherit this - a committed
 * proposal becomes the implementation, so it has to carry the whole
 * runtime - but not initialize() (each proposal brings its own) and not
 * launch(): by the time any proposal can pass, the clock is long started
 * (proposing takes bonded stake, which takes a running protocol), so
 * carrying launch() in every proposal would spend scarce EIP-170 room on
 * dead code.
 */
contract Heartwood is State, Bonding, Market, Regulator, Govern, Treasury {
    using SafeMath for uint256;

    event Advance(uint256 indexed epoch, uint256 block, uint256 timestamp);
    event Incentivization(address indexed account, uint256 amount);
    event GasOracleChange(address indexed account, address feed);

    /**
     * @notice Step the protocol one epoch, and pay the caller for doing it.
     *
     * The incentive is settled after the work rather than before, which is
     * the reverse of upstream ESD. It has to be: what the caller is paid now
     * depends on what the call cost, and that is not known until it is done.
     * The side effect is that the caller's own incentive is not part of the
     * supply this epoch's expansion is computed against, and lands in the
     * next epoch's bonded snapshot rather than the one it just took - which
     * is arguably where it belongs anyway.
     */
    function advance() external {
        uint256 startGas = gasleft();

        Bonding.step();
        Regulator.step();
        Market.step();

        uint256 incentive = advanceIncentive(startGas.sub(gasleft()));
        mintToAccount(msg.sender, incentive);
        emit Incentivization(msg.sender, incentive);

        emit Advance(epoch(), block.number, block.timestamp);
    }

    /**
     * @notice Point the incentive at a Chainlink ETH/USD feed, so it can pay
     * back what a call actually cost instead of sitting at its floor.
     *
     * The treasurer rather than a vote, for two reasons. The window where it
     * matters most opens the moment bootstrapping ends, which is sooner than
     * a governance cycle. And the damage a wrong or lying feed can do is
     * bounded by ADVANCE_INCENTIVE_MAX - at worst it restores the flat
     * amount the protocol was paying anyway. Governance can retire the
     * treasurer whenever it likes.
     */
    function setGasOracle(address feed) external {
        Require.that(msg.sender == treasurer(), "Greenwood", "Not treasurer");
        setGasOracleInternal(feed);

        emit GasOracleChange(msg.sender, feed);
    }
}

/**
 * The implementation the first deploy commits: the whole runtime, plus the
 * two things only a first deploy needs - the state initializer and the
 * one-shot launch.
 */
contract Greenwood is Heartwood {
    event Launch(uint256 start);

    function initialize() initializer public {
        _state.epoch.current = 0;
        // Deploying arms the clock but does not start it: the start is set to
        // the far future so epochTime() stays 0 and advance() reverts. The
        // treasurer starts the clock once, with launch() below, when the
        // deployment around the contracts (pool, site, published source) is
        // ready. Until then the protocol is inert - with zero supply, bond
        // capacity is zero too.
        _state.epoch.start = uint256(-1);
        _state.epoch.period = Constants.getEpochPeriod();
    }

    /**
     * @notice Start the epoch clock. One-shot, treasurer only.
     *
     * The clock starts at the next whole epoch boundary (UTC-aligned), the
     * same rounding a clock started at deploy time would have used. There
     * is no way to stop or restart it afterwards.
     */
    function launch() external {
        Require.that(msg.sender == treasurer(), "Greenwood", "Not treasurer");
        Require.that(_state.epoch.start == uint256(-1), "Greenwood", "Already launched");

        uint256 epochPeriod = _state.epoch.period;
        _state.epoch.start = (block.timestamp / epochPeriod + 1) * epochPeriod;

        emit Launch(_state.epoch.start);
    }
}
