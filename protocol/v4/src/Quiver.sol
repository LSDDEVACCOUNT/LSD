// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {FixedPoint96} from "v4-core/src/libraries/FixedPoint96.sol";
import {LiquidityAmounts} from "v4-core/test/utils/LiquidityAmounts.sol";
import {CurrencySettler} from "v4-core/test/utils/CurrencySettler.sol";

interface IERC20Decimals {
    function decimals() external view returns (uint8);
}

interface IDollarMinimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title Quiver
/// @notice Replaces upstream ESD's V2-pair-based `Pool.sol` LP incentive
/// contract with one that provides liquidity directly into the same V4
/// pool `Watchtower` reads its price from - so LP-incentivized liquidity
/// and the price oracle are never split across two different pools (see
/// NOTICE for why that split is unsafe: a hook can only observe swaps in
/// its own pool, so a separate, thinly-traded pool used only for pricing
/// is trivially manipulable).
///
/// V4 has no fungible LP-token analogous to a V2 pair's ERC20 share token,
/// so this contract itself becomes the pool's sole liquidity position
/// (one fixed tick range) and tracks each user's proportional share
/// internally using "liquidity units" (V4's own uint128 liquidity
/// accounting for that position) in place of upstream's `univ2` ERC20
/// balance - the staged/bonded/phantom/claimable bonding and
/// reward-distribution accounting below is otherwise unchanged from
/// upstream ESD's Pool.sol (that logic never actually depended on `univ2`
/// being an ERC20 - it just needed a fungible unit).
contract Quiver is IUnlockCallback {
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;
    using CurrencySettler for Currency;

    bytes32 private constant FILE = "Pool";

    enum Status {
        Frozen,
        Fluid
    }

    struct Account {
        uint256 staged;
        uint256 claimable;
        uint256 bonded;
        uint256 phantom;
        uint256 fluidUntil;
    }

    /// @notice How long depositing, withdrawing, bonding or unbonding leaves
    /// an account Fluid. Half the DAO's, on purpose: providing liquidity
    /// already carries impermanent loss that DAO bonding does not, and the
    /// oracle reads its price from a pool - if that thins out the protocol
    /// stops regulating at all, so this is the last place to add friction.
    /// Kept in step with Constants.POOL_EXIT_LOCKUP_EPOCHS on the DAO side.
    uint256 public constant EXIT_LOCKUP_EPOCHS = 12; // 3 days at 6h epochs

    IPoolManager public immutable poolManager;
    address public immutable dao;
    IDollarMinimal public immutable dollarToken;
    PoolKey public poolKey;
    PoolId public poolId;
    int24 public immutable tickLower;
    int24 public immutable tickUpper;
    bool public immutable dollarIsCurrency0;

    uint256 public totalStaged;
    uint256 public totalBonded;
    uint256 public totalClaimable;
    uint256 public totalPhantom;

    mapping(address => Account) public accounts;

    event Deposit(address indexed account, uint256 liquidity);
    event Withdraw(address indexed account, uint256 liquidity);
    event Claim(address indexed account, uint256 value);
    event Bond(address indexed account, uint256 value);
    event Unbond(address indexed account, uint256 value, uint256 newClaimable);
    event Provide(address indexed account, uint256 dollarValue, uint256 counterValue, uint256 newLiquidity);

    error NotDao();
    error NotFrozen();
    error NotPoolManager();
    error InconsistentDollarBalance();
    error InconsistentLiquidity();

    modifier onlyFrozen(address account) {
        if (statusOf(account) != Status.Frozen) revert NotFrozen();
        _;
    }

    /// @param _poolManager the V4 PoolManager this pool's liquidity (and the
    /// Watchtower's price feed) both live on
    /// @param _dao the LSD DAO (Root proxy) - this Pool's owner, and the
    /// only address `epoch()` is read through
    /// @param _dollar the LSD token address
    /// @param _poolKey the pool this contract will hold a single liquidity
    /// position in - MUST be the same pool `Watchtower` is attached to
    /// @param _tickLower / _tickUpper the fixed range this contract
    /// provides liquidity across (a wide range is recommended so the
    /// position stays in-range across normal price movement)
    constructor(
        IPoolManager _poolManager,
        address _dao,
        address _dollar,
        PoolKey memory _poolKey,
        int24 _tickLower,
        int24 _tickUpper
    ) {
        poolManager = _poolManager;
        dao = _dao;
        dollarToken = IDollarMinimal(_dollar);
        poolKey = _poolKey;
        poolId = _poolKey.toId();
        tickLower = _tickLower;
        tickUpper = _tickUpper;

        address c0 = Currency.unwrap(_poolKey.currency0);
        address c1 = Currency.unwrap(_poolKey.currency1);
        if (c0 == _dollar) {
            dollarIsCurrency0 = true;
        } else if (c1 == _dollar) {
            dollarIsCurrency0 = false;
        } else {
            revert("Quiver: dollar not in pool");
        }
    }

    // --- DAO-facing epoch source (mirrors upstream Pool's `dao().epoch()`) ---

    function epoch() internal view returns (uint256) {
        (bool ok, bytes memory ret) = dao.staticcall(abi.encodeWithSignature("epoch()"));
        require(ok, "Quiver: epoch() call failed");
        return abi.decode(ret, (uint256));
    }

    // --- Views ---

    function statusOf(address account) public view returns (Status) {
        return epoch() >= accounts[account].fluidUntil ? Status.Frozen : Status.Fluid;
    }

    /// @notice The pool's current sqrt price, straight from the PoolManager.
    ///
    /// Exposed raw rather than converted: this contract runs against pools
    /// whose paired token can be a 6-decimal stablecoin or an 18-decimal
    /// stock, and every caller already knows which. Converting here would
    /// mean baking one of those in. Callers wanting a human price square it,
    /// divide by 2**192, invert if LSD is currency1, and scale by the paired
    /// token's decimals.
    function sqrtPriceX96() external view returns (uint160) {
        (uint160 price,,,) = poolManager.getSlot0(poolId);
        return price;
    }

    /// @notice Price of one whole LSD in whole units of the paired token,
    /// 18-decimal fixed point. Zero if the pool has never been initialized.
    ///
    /// Done here rather than in the DAO because squaring a sqrt price
    /// overflows a plain uint256 and needs 512-bit math, which this compiler
    /// has a library for and Solidity 0.5 does not. The DAO reads the answer
    /// and does one division with it.
    ///
    /// This is a spot price, deliberately. It is only ever consumed as the
    /// lower half of a `min` against a Chainlink answer, so pushing it up
    /// achieves nothing and pushing it down only makes the protocol value the
    /// paired token more conservatively than the market does.
    function dollarPrice() external view returns (uint256) {
        (uint160 sqrtP,,,) = poolManager.getSlot0(poolId);
        if (sqrtP == 0) return 0;

        uint256 priceX96 = FullMath.mulDiv(sqrtP, sqrtP, FixedPoint96.Q96);
        if (priceX96 == 0) return 0;

        // The pool holds a ratio of raw units, so a pair with different
        // decimals needs scaling, and the ratio inverts when LSD sorted into
        // currency1.
        address counter = dollarIsCurrency0
            ? Currency.unwrap(poolKey.currency1)
            : Currency.unwrap(poolKey.currency0);
        uint8 counterDecimals = IERC20Decimals(counter).decimals();
        if (counterDecimals > 18) return 0;

        uint256 scale = 1e18 * (10 ** (18 - counterDecimals));

        return dollarIsCurrency0
            ? FullMath.mulDiv(priceX96, scale, FixedPoint96.Q96)
            : FullMath.mulDiv(FixedPoint96.Q96, scale, priceX96);
    }

    function totalRewarded() public view returns (uint256) {
        return dollarToken.balanceOf(address(this)) - totalClaimable;
    }

    function balanceOfRewarded(address account) public view returns (uint256) {
        if (totalBonded == 0) return 0;
        uint256 totalRewardedWithPhantom = totalRewarded() + totalPhantom;
        uint256 balanceOfRewardedWithPhantom = (totalRewardedWithPhantom * accounts[account].bonded) / totalBonded;
        return balanceOfRewardedWithPhantom - accounts[account].phantom;
    }

    // --- User actions: deposit/withdraw liquidity to/from staged ---

    /// @notice Add liquidity to the shared position, crediting the caller's
    /// staged balance with the liquidity units minted. Pulls up to
    /// `dollarMax`/`counterMax` of each token (refunding any unused amount
    /// is not implemented here for simplicity - callers should size their
    /// approvals to the pool's current ratio, e.g. via a static call/quote
    /// first).
    function deposit(uint256 dollarMax, uint256 counterMax) external onlyFrozen(msg.sender) returns (uint256 liquidity) {
        liquidity = _modifyLiquidity(msg.sender, dollarMax, counterMax, true, false);
        accounts[msg.sender].staged += liquidity;
        totalStaged += liquidity;
        emit Deposit(msg.sender, liquidity);
    }

    function withdraw(uint256 liquidity) external onlyFrozen(msg.sender) {
        accounts[msg.sender].staged -= liquidity;
        totalStaged -= liquidity;
        _modifyLiquidity(msg.sender, liquidity, 0, false, false);
        emit Withdraw(msg.sender, liquidity);
    }

    function claim(uint256 value) external onlyFrozen(msg.sender) {
        accounts[msg.sender].claimable -= value;
        totalClaimable -= value;
        require(dollarToken.transfer(msg.sender, value), "Quiver: dollar transfer failed");
        emit Claim(msg.sender, value);
    }

    // --- Bonding (unchanged accounting vs. upstream ESD Pool.sol - operates
    // on liquidity units instead of a univ2 ERC20 balance) ---

    function bond(uint256 value) external {
        _unfreeze(msg.sender);

        uint256 totalRewardedWithPhantom = totalRewarded() + totalPhantom;
        uint256 newPhantom = totalBonded == 0
            ? (totalRewarded() == 0 ? INITIAL_STAKE_MULTIPLE * value : 0)
            : (totalRewardedWithPhantom * value) / totalBonded;

        accounts[msg.sender].bonded += value;
        totalBonded += value;
        accounts[msg.sender].phantom += newPhantom;
        totalPhantom += newPhantom;

        accounts[msg.sender].staged -= value;
        totalStaged -= value;

        emit Bond(msg.sender, value);
    }

    function unbond(uint256 value) external {
        _unfreeze(msg.sender);

        uint256 newClaimable = (balanceOfRewarded(msg.sender) * value) / accounts[msg.sender].bonded;
        uint256 lessPhantom = (accounts[msg.sender].phantom * value) / accounts[msg.sender].bonded;

        accounts[msg.sender].staged += value;
        totalStaged += value;
        accounts[msg.sender].claimable += newClaimable;
        totalClaimable += newClaimable;
        accounts[msg.sender].bonded -= value;
        totalBonded -= value;
        accounts[msg.sender].phantom -= lessPhantom;
        totalPhantom -= lessPhantom;

        emit Unbond(msg.sender, value, newClaimable);
    }

    /// @notice Converts already-earned (rewarded, unclaimed) LSD directly
    /// into new bonded liquidity, matched with counter-token pulled from
    /// the caller - same purpose as upstream ESD's `provide()`.
    ///
    /// The dollar side is paid out of this contract's own balance - that is
    /// where rewarded LSD physically sits - and the phantom credit below
    /// assumes exactly that. Paying it from the caller instead would charge
    /// them twice: once from the wallet and once via the extinguished
    /// reward claim, with the difference leaking pro rata to every other
    /// bonded account.
    function provide(uint256 dollarValue, uint256 counterMax) external onlyFrozen(msg.sender) {
        require(totalBonded > 0, "Quiver: insufficient total bonded");
        require(totalRewarded() > 0, "Quiver: insufficient total rewarded");
        require(balanceOfRewarded(msg.sender) >= dollarValue, "Quiver: insufficient rewarded balance");

        uint256 newLiquidity = _modifyLiquidity(msg.sender, dollarValue, counterMax, true, true);

        uint256 totalRewardedWithPhantom = totalRewarded() + totalPhantom + dollarValue;
        uint256 newPhantomFromBonded = (totalRewardedWithPhantom * newLiquidity) / totalBonded;

        accounts[msg.sender].bonded += newLiquidity;
        totalBonded += newLiquidity;
        accounts[msg.sender].phantom += dollarValue + newPhantomFromBonded;
        totalPhantom += dollarValue + newPhantomFromBonded;

        emit Provide(msg.sender, dollarValue, counterMax, newLiquidity);
    }

    function _unfreeze(address account) internal {
        accounts[account].fluidUntil = epoch() + EXIT_LOCKUP_EPOCHS;
    }

    // 100 LSD -> 100M LSDS, matches Constants.getInitialStakeMultiple()
    uint256 internal constant INITIAL_STAKE_MULTIPLE = 1e6;

    // --- V4 liquidity plumbing ---

    struct CallbackData {
        address account;
        uint256 dollarAmount;
        uint256 counterAmount;
        bool adding;
        // provide() only: the dollar side comes out of this contract's own
        // balance (the rewarded pot) instead of the account's wallet.
        bool dollarFromSelf;
    }

    function _modifyLiquidity(
        address account,
        uint256 dollarAmount,
        uint256 counterAmountOrLiquidity,
        bool adding,
        bool dollarFromSelf
    ) internal returns (uint256 liquidity) {
        bytes memory result = poolManager.unlock(
            abi.encode(CallbackData(account, dollarAmount, counterAmountOrLiquidity, adding, dollarFromSelf))
        );
        liquidity = abi.decode(result, (uint256));
    }

    function unlockCallback(bytes calldata rawData) external override returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        CallbackData memory data = abi.decode(rawData, (CallbackData));

        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(poolId);
        uint160 sqrtPriceAX96 = TickMath.getSqrtPriceAtTick(tickLower);
        uint160 sqrtPriceBX96 = TickMath.getSqrtPriceAtTick(tickUpper);

        int256 liquidityDelta;
        uint256 liquidityOut;

        if (data.adding) {
            (uint256 amount0Max, uint256 amount1Max) = dollarIsCurrency0
                ? (data.dollarAmount, data.counterAmount)
                : (data.counterAmount, data.dollarAmount);
            uint128 liquidityMinted =
                LiquidityAmounts.getLiquidityForAmounts(sqrtPriceX96, sqrtPriceAX96, sqrtPriceBX96, amount0Max, amount1Max);
            require(liquidityMinted > 0, "Quiver: zero liquidity");
            liquidityDelta = int256(uint256(liquidityMinted));
            liquidityOut = liquidityMinted;
        } else {
            liquidityDelta = -int256(data.dollarAmount); // dollarAmount field reused as liquidity-to-remove
            liquidityOut = data.dollarAmount;
        }

        (BalanceDelta delta,) = poolManager.modifyLiquidity(
            poolKey,
            ModifyLiquidityParams({
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidityDelta: liquidityDelta,
                salt: bytes32(0)
            }),
            ""
        );

        int128 delta0 = BalanceDeltaLibrary.amount0(delta);
        int128 delta1 = BalanceDeltaLibrary.amount1(delta);

        address dollarPayer = data.dollarFromSelf ? address(this) : data.account;
        address payer0 = dollarIsCurrency0 ? dollarPayer : data.account;
        address payer1 = dollarIsCurrency0 ? data.account : dollarPayer;

        if (delta0 < 0) poolKey.currency0.settle(poolManager, payer0, uint256(uint128(-delta0)), false);
        if (delta1 < 0) poolKey.currency1.settle(poolManager, payer1, uint256(uint128(-delta1)), false);
        if (delta0 > 0) poolKey.currency0.take(poolManager, data.account, uint256(uint128(delta0)), false);
        if (delta1 > 0) poolKey.currency1.take(poolManager, data.account, uint256(uint128(delta1)), false);

        return abi.encode(liquidityOut);
    }
}
