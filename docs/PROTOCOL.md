# LSD Protocol Documentation

The Liquid Supply Dollar (LSD) is an elastic-supply dollar on Robinhood
Chain with a claimable asset floor underneath it.

The ticker reads more than one way, and every reading is meant. £sd, spoken "L-S-D", was
the English money of account for a thousand years: *librae, solidi,
denarii*, the pounds, shillings and pence of Sherwood's England. The other
reading is also intentional. The coin wears Loxley's arrow.

Supply regulation follows Empty Set Dollar: the protocol reads its own
market price once per epoch, expands supply when LSD trades above one
dollar, and issues debt against future supply when it trades below. On top
of that mechanism LSD holds a treasury of real reserve assets, USDG and
tokenised equities, which any holder can claim a pro-rata share of at any
time by burning LSD.

Every number in this document is a compiled constant in
`protocol/contracts/Constants.sol` unless the text marks it governable.

---

## 1. Tokens

| Token | Type | Description |
|---|---|---|
| **LSD** | ERC-20, 18 decimals | The dollar. The only token the protocol mints or burns. Freely transferable. |
| **LSDS** | Non-transferable position | A bonded stake in the DAO. Credited on bonding, settled on unbonding. |

LSDS represents a share of the DAO's LSD balance. That balance grows with
every expansion while LSDS supply does not, so the LSD value of a stake
increases over time.

## 2. Epoch Cycle

The protocol clock advances in **epochs of 6 hours**, four per day. The
clock does not run at deployment: it is started once, by the treasurer
calling `launch()`, and begins at the next whole epoch boundary after that
call. Until launch, `advance()` reverts and the protocol is inert. There is
no way to stop the clock once started.

An epoch advances only when someone calls `advance()`, which executes three
steps in order:

1. **Step**: the bonding snapshot advances; vested bonds, matured locks and
   expired coupons settle.
2. **Regulate**: the oracle price is captured and the supply decision
   applied.
3. **Incentivise**: the caller is paid.

`advance()` is permissionless. The incentive is a flat **100 LSD** during
bootstrapping. Afterwards it is the measured gas cost of the call plus
**25%**, valued through a Chainlink ETH/USD feed and the protocol's own LSD
price, clamped to the range **5–100 LSD**. Where no gas feed is configured
or the feed is stale, the incentive is the 5 LSD floor.

## 3. Supply Regulation

Each epoch the DAO reads a time-weighted average price of LSD from its own
Uniswap V4 pool. The price is accumulated between epochs by
`Watchtower`. The oracle reports a price as valid only while the pool
holds liquidity; on an invalid reading the protocol takes no supply action
that epoch.

**Expansion (price > 1.00).** New supply equal to the price excess is
minted, throttled by a per-epoch limit, and allocated in this order:

- outstanding coupon redemptions,
- **25%** to liquidity providers, split across the emission schedule by pool
  weight,
- the remainder to bonded DAO stakers.

**The expansion throttle.** The per-epoch limit is earned, not fixed. It
grows by half each epoch the oracle price actually pins it (a
deviation at or above the limit), up to a **10%** ceiling, and every
contraction epoch halves it, down to a **2.5%** floor. A deviation below
the limit expands by the deviation itself and leaves the throttle where it
stands, so the ramp follows the price and never runs ahead of it.

```
pinned epoch:      limit = min( limit × 1.5 , 10% )
contraction epoch: limit = max( limit ÷ 2   , 2.5% )
```

The limit comes out of genesis **at the ceiling**: bootstrapping is
forty-five pinned expansion epochs, so demand that carries straight on
keeps expanding at 10% with nothing to re-earn. Contractions walk it down;
from the floor, one epoch of a manipulated oracle mints 2.5%, not 10%, and
the full rate takes roughly 30 hours of sustained demand to earn back:
2.5%, 3.75%, 5.6%, 8.4%, 10%. The current value is `supplyLimit()`.

**Contraction (price < 1.00).** The protocol records debt and sells
**coupons**: LSD is burned now in exchange for a claim on a larger amount of
LSD once expansion resumes. Debt growth per epoch is capped by the same live
limit. The premium scales with the debt ratio. Coupons expire **360 epochs
(90 days)** after purchase.

## 4. Treasury

The DAO holds a treasury of reserve assets. Two mechanisms fill it; one
mechanism pays out of it.

Only three things ever mint LSD, and they are independent of each other:

| Mint | Trigger | Backed by |
|---|---|---|
| Expansion | price above the peg at `advance()` | nothing (dilutes the backing); paid to coupons, then stakers, then LPs |
| Bond claim | the buyer's claim after the 24 h vest | the asset the buyer paid, already in the treasury |
| Advance incentive | whoever calls `advance()` | nothing; 5 to 100 LSD, priced from gas |

A bond payout therefore competes with no one and waits for nothing but its
vest: its counter-value is already in the treasury, which is also why it
books no debt.

### 4.1 Bonds

`purchaseBond(address asset, uint256 amount)` transfers a listed reserve
asset into the treasury and credits the sender a claim on LSD, claimable
after **4 epochs (24 hours)**. LSD is minted at claim, not at purchase.

Vesting is counted in epochs but aimed at wall-clock. Bootstrap epochs run at
a third of the normal length, so a bond bought during one vests over
proportionally more of them: 12 epochs deep in genesis, fewer as the phase
ends and full-length epochs start carrying the wait. The result is 22–28
hours whenever the bond is bought.

The credited payout is computed from the balance the transfer actually
delivered, so a fee-on-transfer token is credited net of its fee.

### 4.2 Bond Pricing

```
effective price = max( oracle price × (1 − discount) , backing per LSD )
```

The discount launches at **25%** and is settable by the treasurer anywhere
in the range **0–25%**.

The floor clamp is absolute: no discount setting and no market price
produces a bond price below backing per LSD. A bond struck at backing grows
treasury and supply in the same proportion and leaves backing per LSD
unchanged. The clamp raises the price rather than rejecting the sale, so the
bond window stays open at every discount setting.

Bonds close when the treasury cannot be priced; see §5.2. The treasurer
can also close them instantly with `pauseBonds()`, a one-way brake for a
mispriced feed or a pricing bug: nothing the treasurer holds reopens them,
only governance does (the `ResumeBonds` proposal, or a fix's own
initializer).

### 4.3 Issuance Limits

Issuance is capped per epoch as a fraction of LSD supply.

| Phase | Cap |
|---|---|
| Bootstrapping | 20% of supply per epoch |
| Normal operation | 10% of supply per epoch |

`bondCapacity()` returns the room remaining in the current epoch.

### 4.4 Swap Fees

The protocol's pools charge a fee on every swap, levied by
`SwapFeeCollector` on top of the pool's own LP fee: **0.05%** on the
LSD/USDG oracle pool, **1%** on the equity pools. The oracle pool is where
peg arbitrage lives, so its fee stays small enough never to block it; the
equity pools are not the peg's venue, and their toll is pure backing
revenue. `sweep()` is
permissionless and settles the collected balances: reserve assets are
transferred to the DAO and become backing; collected LSD is burned. Both
directions raise backing per LSD.

### 4.5 Redemption

`redeem(uint256 amount)` burns LSD and pays the sender a pro-rata share of
**every** asset in the treasury:

```
payout(asset) = treasuryBalance(asset) × amount / totalSupply
```

Redemption consults no oracle, computes no price, requires no venue, and
carries no per-epoch limit, no lockup and no eligibility condition.

Burning `d` out of supply `S` against holdings `T` pays `T·d/S` and leaves
`T/S` per remaining token. The ratio is invariant under redemption, and
integer division rounds payouts down, so backing per LSD can only rise. This
holds per asset and therefore for the whole basket at any set of asset
prices.

Redemption is economically rational while LSD trades below its backing;
above that level, selling on the open market returns more.

**Backing dynamics.** Expansion mints LSD against no new assets and lowers
backing per LSD. Bond proceeds, swept swap fees and redemption rounding
raise it. Net growth in backing per LSD requires the inflows to outpace
expansion dilution.

## 5. Reserve Assets

### 5.1 Listing

Governance lists reserve assets by proposal. A listing names the asset, its
Chainlink price feed, and optionally an LSD pool for cross-checking. The
proposal verifies that the feed answers before it commits. The treasury
holds at most **8** reserve assets.

Robinhood Chain publishes Chainlink feeds for USDG and for its tokenised
equities, including the MAG7 names and SpaceX. The stock feeds follow the
market's 24/5 clock; the tokens themselves trade on-chain around the
clock, which is what the pool cross-check below is for.

### 5.2 Pricing and Staleness

A feed determines what a bond in that asset pays out. A feed that is absent,
stale, zero or negative makes the treasury unpriceable, and **bonding closes
in every asset** until it recovers. The staleness window is **3 days**, wide
enough to carry a 24/5 feed across the weekend, and movable by governance up
to a maximum of **7 days**. The window is not the only guard through a
weekend: the cross-check below stays live while the feed sleeps.

Redemption reads no feed and is unaffected by feed availability.

### 5.3 Pool Cross-Check

A listed reserve may name a market adapter: a **Spyglass**, a read-only
contract over the asset's own deep asset/USDG pool on Robinhood Chain (the
launch names each sit in pools holding tens of millions to over a billion
dollars of active liquidity). The treasury then values the asset at:

```
reserve price = min( feed price , pool spot price )
```

The minimum is one-directional: a larger bond payout requires a higher
valuation, and a minimum cannot be raised by moving one of its inputs up.
Pushing the pool price up leaves the feed price binding; pushing it down
values the asset more conservatively than the market does.

The cross-check is also the weekend guard. The feed runs 24/5 and freezes
at Friday's close; the pool trades on. A stock that gaps down over the
weekend is valued at the live, lower pool price rather than Friday's
frozen one, so a stale feed inside the 3-day window can never overpay a
bond against a market that has moved.

The min only applies inside a tolerance band. When pool and feed sit more
than **10%** apart (`RESERVE_MAX_DIVERGENCE`), in either direction, one of
the two sources is simply wrong - a feed frozen through a violent move, or
a pool being pushed - and the treasury refuses to price the asset at all.
That closes bonding, the safe failure, and touches nothing else;
redemption never reads a price.

### 5.4 Delisting

Delisting stops new bonds in an asset. The existing balance remains in the
treasury and in the redemption basket.

## 6. Bootstrapping

The protocol bootstraps for its first **45 epochs**, run at 2 hours each,
**3.75 days**. Through this phase the oracle price is not read, expansion is
pinned to **+10% per epoch**, and supply multiplies approximately **73×**.

Bond terms differ during bootstrapping:

| | Bootstrapping | Normal operation |
|---|---|---|
| Bond price | Flat **5.00 USDG** | Oracle price − discount, clamped at backing |
| Market input | None | TWAP from the LSD/USDG pool |
| Discount | Not applied | 0–25%, treasurer-set |
| Epoch capacity | 20% of supply | 10% of supply |
| Advance incentive | Flat 100 LSD | Gas + 25%, clamped 5–100 LSD |
| Bond vesting | 12 epochs (~24 h) | 4 epochs (~24 h) |

The genesis price takes no market input. The oracle's validity condition is
that the pool holds liquidity, which a thin pool satisfies; a flat price is
not a function of any pool state.

The level of 5.00 is set against the ~73× multiplication that follows it;
an implied cost near seven cents per eventual LSD at epoch zero, rising as
the remaining multiplication shrinks. The 20% capacity cap bounds how much
of that multiplication one epoch of capital can claim.

All four columns switch to normal operation in the epoch the bootstrapping
period ends. A market price between 5.00 and roughly 6.67 makes the
post-bootstrap discounted price the cheaper of the two, so bond flow pauses
near that boundary and resumes above it.

## 7. Liquidity Program

The DAO maintains an **emission schedule**: a weighted list of up to **12**
pools that share the 25% LP allocation of every expansion. An LSD pair
against a tokenised equity earns on the same schedule as the LSD/USDG pair.
Governance adds pools and sets weights.

The LSD/USDG pool carries the largest weight. The epoch oracle reads its
price from that pool; if its liquidity falls away, supply regulation stops.
LSD is never priced against an equity pair.

Positions in any pool are **staged** (idle, withdrawable) or **bonded**
(earning rewards, exit-locked).

| Position | Exit lockup |
|---|---|
| DAO stake | 16 epochs (4 days) |
| Pool stake | 12 epochs (3 days) |

Bonding or unbonding leaves the account **Fluid** for the lockup. Fluid
refuses `deposit()` and `withdraw()` — moving tokens across the DAO's edge
is what the guard exists for — but `bond()` and `unbond()` stay open, so
an already-staged balance can be put to work (or pulled back to staged) at
any time. The practical pattern follows: deposit more than you mean to
bond immediately and keep the rest staged. Staged earns nothing, but it is
bondable on the spot, where a wallet balance has to wait out the lockup
first. Each bond or unbond restarts the clock.

## 8. Governance

The protocol has no admin keys. Changes are made by deploying a candidate
implementation, passing a vote of bonded stakers, and committing it through
the `Sherwood` proxy.

| Parameter | Value |
|---|---|
| Voting period | 28 epochs (7 days) |
| Quorum | 33% of bonded supply |
| Proposal threshold | 1% of bonded supply |

A proposal is a contract; its effect is whatever its initialization
executes. The repository ships proposal contracts for the expected actions
in `dao/Governance.sol`:

| Proposal | Effect |
|---|---|
| `ListReserve` | Adds a reserve asset with feed and optional pool |
| `DelistReserve` | Stops new bonds in an asset |
| `SetReservePool` | Wires or rewires an asset's pool cross-check |
| `SetReserveStaleness` | Adjusts the feed staleness window (≤ 7 days) |
| `AddPool` | Adds a pool to the emission schedule |
| `SetPoolWeight` | Changes a pool's emission weight |
| `RetireTreasurer` | Removes the treasurer role |
| `ResumeBonds` | Reopens bonds after a treasurer pause |

Voting locks the voter's stake for the duration of the proposal. An account
that has bonded or unbonded within its lockup cannot vote until the lockup
passes.

### Treasurer

The treasurer is the single non-governance role, held initially by the
deploying account. Its powers are:

- start the epoch clock, once, with `launch()`,
- stop new treasury bonds instantly with `pauseBonds()`; only governance
  reopens them,
- set the bond discount within 0–25%,
- set the address of the gas price oracle.

It cannot move funds, mint LSD, list a reserve, or restrict redemption.
Governance can retire the role by proposal.

## 9. Parameter Reference

| Constant | Value | Description |
|---|---:|---|
| `EPOCH_PERIOD` | 21,600 s | 6-hour epochs, 4 per day |
| `BOOTSTRAPPING_PERIOD` | 45 | epochs at 2 h each; ~73× supply over 3.75 days |
| `BOOTSTRAPPING_PRICE` | 1.10 | price expansion runs on while bootstrapping |
| `SUPPLY_CHANGE_LIMIT` | 10% | ceiling of the per-epoch supply move |
| `SUPPLY_RAMP_FLOOR` | 2.5% | floor of the limit; ×1.5 when pinned, ÷2 on contraction; genesis exits at the ceiling |
| `ORACLE_POOL_RATIO` | 25% | LP share of each expansion |
| `GENESIS_BOND_PRICE` | 5.00 | flat, undiscounted bond price in bootstrapping |
| `GENESIS_BOND_SUPPLY_LIMIT` | 20% / epoch | bond capacity while bootstrapping |
| `BOND_SUPPLY_LIMIT` | 10% / epoch | bond capacity in normal operation |
| `BOND_DISCOUNT` | 25% | launch discount; treasurer-settable 0–25% |
| `BOND_VESTING_EPOCHS` | 4 | ~24 h from purchase to claim; 12 while bootstrapping |
| `MAX_RESERVES` | 8 | reserve assets in the treasury |
| `MAX_POOLS` | 12 | pools on the emission schedule |
| `RESERVE_MAX_STALENESS` | 3 days | feed age limit, rides the weekend; governable to 7 days |
| `RESERVE_MAX_DIVERGENCE` | 10% | max feed/pool disagreement; past it, bonding closes |
| `DAO_EXIT_LOCKUP_EPOCHS` | 16 | 4-day DAO exit lock |
| `POOL_EXIT_LOCKUP_EPOCHS` | 12 | 3-day pool exit lock |
| `COUPON_EXPIRATION` | 360 | coupons expire after 90 days |
| `GOVERNANCE_PERIOD` | 28 | 7-day voting window |
| `GOVERNANCE_QUORUM` | 33% | of bonded supply |
| `ADVANCE_INCENTIVE` | 5–100 LSD | gas + 25%, clamped; flat 100 while bootstrapping |
| Swap fee | 0.05% / 1% | oracle pool / equity pools, swept into the treasury |

## 10. Risk

**Reflexivity.** Expansion rewards depend on demand, and demand depends in
part on expansion rewards. This circularity is common to elastic-supply
designs. The treasury floor sets the level at which a decline stops; it does
not remove the cycle.

**Backing is not par.** LSD is redeemable for its share of treasury
holdings, not for 1.00. Backing per LSD starts near zero and rises as bond
proceeds and swept fees outpace expansion dilution.

**Reserve issuer risk.** The unit of account is USDG, and the floor inherits
its issuer risk. Tokenised equities carry the issuer risk of their
tokenisation and the price risk of the underlying. A basket redemption pays
shares of assets, not a fixed dollar amount.

**Feed dependence.** A Chainlink outage or a stale feed closes bonding until
it recovers or governance widens the staleness window. Redemption is
unaffected.

**Governance.** A proposal that reaches quorum can change any part of the
implementation, reserve listings included. The controls are the 7-day
window, the 33% quorum and the proposal threshold.

**Review status.** The supply mechanism is inherited from ESD and was
audited in that form. The treasury, multi-pool emission, Uniswap
V4 hooks, advance incentive and the other changes listed in `NOTICE` are
specific to this fork. A 79-test suite runs against the compiled
bytecode of the deployed contracts.

## 11. Contract Reference

The deployed contracts carry Sherwood-forest names; the table gives each
one's role.

| Contract | Role |
|---|---|
| `Sherwood` | The proxy. The protocol's one permanent address. |
| `Greenwood` | Current logic behind `Sherwood` (bonding, regulation, treasury, governance). |
| `Loxley` | The LSD token. |
| `Longbow` + `Watchtower` | Epoch TWAP from the protocol's own V4 pool. |
| `Quiver` | LP position with staged/bonded accounting; one per pair. |
| `TollGate` | 1% swap fee on equity pairs; one instance serves all of them. |

`SwapFeeCollector` is the shared fee base behind `Watchtower` and `TollGate`;
`sweep()` lives there. Bonds, redemption and the reserve accounting are the
`Treasury` module of `Greenwood`; the shipped governance proposals are in
`Governance.sol`.

The interface names the mechanisms in the same register; the underlying
calls never change:

| Interface | Mechanism | Contract call |
|---|---|---|
| join / leave the Band | stake / unstake LSD in the DAO | `bond()`, `unbondUnderlying()` |
| fill a Quiver | provide + stake LP | `deposit()`, `bond()` |
| pledge / collect | buy / claim a treasury bond | `purchaseBond()`, `claimBond()` |
| cut / collect a tally | buy / redeem a coupon | `purchaseCoupons()`, `redeemCoupons()` |
| reach into the Coffer | redeem against the treasury | `redeem()` |
| stand the Watch | advance the epoch | `advance()` |

Deployed addresses are published in this repository. An address delivered
through any other channel is not the protocol.
