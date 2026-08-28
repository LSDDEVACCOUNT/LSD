# LSD: Liquid Supply Dollar

A fork of the [Empty Set Dollar (ESD)](https://github.com/emptysetsquad/dollar) protocol's
**original, working mechanism** (bonding, rebase/regulation, coupons, on-chain
governance, Uniswap-based price oracle), rebranded as
**Liquid Supply Dollar (LSD)**, targeting deployment on
[Robinhood Chain](https://docs.robinhood.com/chain/).

> **Note:** this fork is sourced from ESD's genesis commit, not the
> `emptysetsquad/dollar` repository's current default branch. By 2026 that
> branch reflects ESD's final "EIP-25: Enable Migration" state, a one-time
> wind-down contract ESD used to migrate its V1 DAO into a V2 system, with
> hardcoded migration addresses. It is not a deployable protocol. See
> [NOTICE](./NOTICE) for details and the full list of changes required
> under the Apache License 2.0.

## token

- full name: `Liquid Supply Dollar` (after £sd: librae, solidi, denarii)
- symbol: `LSD`
- decimals: `18`
- bonded/stake token name: `Liquid Supply Dollar Stake`
- bonded/stake token symbol: `LSDS` (non-transferable)

## documentation

[docs/PROTOCOL.md](./docs/PROTOCOL.md) is the full mechanism documentation,
the tokens, the epoch clock, regulation, the floor and its limits, genesis,
liquidity, governance, every parameter, and an honest list of what can go
wrong. [NOTICE](./NOTICE) records what changed relative to ESD and why;
[DEPLOY.md](./DEPLOY.md) covers getting it on-chain.

## structure

- [`protocol/`](./protocol): the DAO contracts (bonding, rebase/regulation,
  coupons, governance, the treasury), forked from `emptysetsquad/dollar`'s
  genesis commit, the last commit before governance-upgrade proposals
  started altering it on-chain. Solidity ^0.5.17. The JS tests under
  `protocol/test/` are upstream's and predate this fork's additions; see the
  README there.
- [`protocol/v4/`](./protocol/v4): the price oracle (`Watchtower.sol`),
  the fee-only hook the stock pools share (`TollGate.sol`), the swap fee
  itself (`SwapFeeCollector.sol`) and the LP-incentive pool
  (`Quiver.sol`), a Uniswap V4 Foundry project. Solidity ^0.8.24 (V4
  requires it; the 0.5.x DAO calls into these contracts through a minimal
  ABI-only interface; see NOTICE). Tested against a real,
  locally-simulated V4 `PoolManager`.
- [`protocol/remix/`](./protocol/remix): the two flattened files and four
  scripts a deploy actually uses. Generated; see that folder's README.
- [`frontend/`](./frontend): Next.js + wagmi dashboard: bonding, the LP
  pool, treasury bonds, coupons, protocol stats, and trading on mainnet.
  One config file points it at a deployment.

## backing

Beyond ESD's mechanism, LSD puts a floor under itself. `Treasury.sol` sells
LSD at a discount for reserve assets and keeps them, and lets anyone burn LSD
for its pro-rata share of everything collected. Coupons are a bet on recovery;
redemption is not conditional on one.

The reserve is not just the counter token. Governance can list tokenised
stocks, each with the Chainlink feed Robinhood Chain publishes for it, so
bonds buy real equity into the backing. Feeds are trusted in one direction
only: they decide what a bond pays out, and a dead feed closes bonding.
Redemption reads no price at all and pays a slice of every asset held, so a
stale feed can never close the floor.

A reserve can also name the LSD pool it trades against, and the treasury takes
whichever price is lower. That direction is what makes a spot price safe
without a TWAP: getting paid more for a bond needs a higher valuation, and a
minimum cannot be pushed up.

Two things feed the backing: bonds, and the fee the hooks charge on every
swap. See NOTICE for the design and its limits, chiefly that expansion still
dilutes the backing, so bonds and fees have to outpace it for the floor to
climb.

## liquidity

LPs earn LSD, and not only on the LSD/counter-token pair. An LSD pair against
each tokenised stock can go on the same emission schedule, so providing
LSD/NVDA earns the same way providing LSD/USDG does. Governance sets each
pair's share.

The counter-token pool keeps the largest share deliberately: the oracle reads
its price from that pool, and if it thins out the protocol stops regulating
at all. LSD is never priced against a stock pair; the peg is denominated in
the counter token, and a price read from LSD/AAPL would move with the
semiconductor cycle.

## keeping the clock running

`advance()` steps the protocol one epoch and pays whoever called it. ESD paid
a flat 100 LSD forever, which is a bet that the token stays cheap: the
incentive is denominated in LSD and the work it pays for is denominated in
gas. Here it is flat at 100 LSD while bootstrapping, and afterwards what the
call actually cost in gas plus 25%, clamped between 5 and 100 LSD.

The ceiling matters. The caller picks the gas price, so without a cap,
paying an absurd gas price and taking 125% of it back in LSD would be a
mint faucet.

## chain dependencies

Upstream ESD hardcoded Ethereum mainnet's Uniswap V2 factory and USDC. This
fork brings its own counter token and its own Uniswap V4 pool, with the price
oracle and the LP-incentivized liquidity in the *same* pool; NOTICE explains
why splitting them across two is unsafe.

Uniswap is already deployed on Robinhood Chain, so the deploy uses the
official `PoolManager` and the chain's own stablecoin rather than bringing
either. See [DEPLOY.md](./DEPLOY.md).

## deployment

Two files to compile, three scripts to run, one copy-paste, plus an optional
fourth script for the stock pairs. All in the browser through Remix and a
wallet extension, no local toolchain.

- [`protocol/remix/README.md`](./protocol/remix/README.md): the actual steps.
- [DEPLOY.md](./DEPLOY.md): what is being deployed and why, and what changes
  for mainnet.

## frontend

```bash
cd frontend && npm install && npm run dev
```

Point it at a deployment by filling in `frontend/src/config/addresses.ts`;
nothing else hardcodes an address. The LP pairs and the treasury's reserves
are deliberately not in there; both are read off the chain, so they cannot
drift from what governance actually voted in.

```
Copyright 2020 Empty Set Squad <emptysetsquad@protonmail.com>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use the included code except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

See [NOTICE](./NOTICE) for the modifications made to the original ESD source.
