# LSD — live deployment (Robinhood Chain, id 4663)

## Core (steps 1–3)

| role | address |
|---|---|
| root — Sherwood proxy (the DAO) | `0x3210F83b3a0E1E585100994C823c30c4C0176912` |
| dollar — LSD token | `0x02A8D8a2a7bee68A39cdFA822388fA878817f9AB` |
| counter — USDG | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` |
| pool — oracle Quiver (LP) | `0xb32405e649cdA0758D1d826301ae659DB2976D21` |
| hook — Watchtower (oracle) | `0xE5B19CC394c678518f2d91049F2a4E9B72981044` |

PoolManager (Uniswap V4, chain-level): `0x8366a39CC670B4001A1121B8F6A443A643e40951`

## Stock pools (step 4)

Shared fee hook (TollGate): `0x2A1e23f8aAB598dfC0DBAF4A122C5b279b8f0044`

| stock | token (ASSET) | feed | Quiver (LP pool) | Spyglass (POOL) |
|---|---|---|---|---|
| NVDA | `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC` | `0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15` | `0x15FDa813b1006cB18dC5F5589c8E7F3A19B1a798` | `0x1b3e1aF821f3edbB0ee78f14aE439A74DB3BD122` |
| SPCX | `0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa` | `0xB265810950ba6c5C0Ff821c9963014a56fD8Bffb` | `0x9Da5EE1a3006fdf0E8146816166548e76BB5210D` | `0x0ED5c862D1E706EcfC949974Ab8aE1645A931e63` |
| AAPL | `0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9` | `0x6B22A786bAa607d76728168703a39Ea9C99f2cD0` | `0x5e9896D6784caA8DC3758A7Ce8021715f6C32877` | `0xA5BEC086e12a0a4604440bFeFCeEa8dF9f0Be4A6` |
| SPY  | `0x117cc2133c37B721F49dE2A7a74833232B3B4C0C` | `0x319724394D3A0e3669269846abE664Cd621f9f6A` | `0xD7845447D1f01c42e5478fAB86936DCCE0A672E5` | `0x50647E8295ed4696151eF2eB85372826c6045a5a` |

The pools exist but earn nothing and are not bondable yet. Both are governance
actions (below): the candidate contracts can be deployed any time, but
nominating, voting and committing only work after launch().

### Deployed candidates

| proposal | address |
|---|---|
| ~~AddPool NVDA~~ DEAD, embeds v1 Quiver — never nominate | `0x686a9288f79b3a6Fbf32C244Dffd81Ad3266d52f` |
| ~~AddPool SPCX~~ DEAD, embeds v1 Quiver — never nominate | `0x6E62a19940acDB87e82F2477b5e9539776f5df8D` |
| ~~AddPool AAPL~~ DEAD, embeds v1 Quiver — never nominate | `0xD192C34560b69f1376fEAa5942eEC72D3a830352` |
| ~~AddPool SPY~~ DEAD, embeds v1 Quiver — never nominate | `0xe58B7C91e58e861bCD41BB50d46E1A1e56852fbA` |
| ListReserve NVDA (asset+feed only) | `0x0C666e2D7E3dc659459D64fA713dEF089D89e4F2` |
| ListReserve SPCX (asset+feed only) | `0x851f45148a9eC752da06fc908C07CB803D09ACDc` |
| ListReserve AAPL (asset+feed only) | `0x8A3f0f276E0BB1be9d9Ba3D3b4156e66B333Af7d` |
| ListReserve SPY (asset+feed only) | `0xF90e79A1471d2b7AE85e27d0E37B1f0C35Bf5823` |
| SetReservePool NVDA | `0x09e13308629552357fbd1f7967306D3DF37BbC1D` |
| SetReservePool SPCX | `0x840708c94C8a8D2BC2a1fCaa9842c2E980C9F140` |
| SetReservePool AAPL | `0xfF01c5bdB1E2580Ea131fAD6C5D2Fd6c3f6384ef` |
| SetReservePool SPY | `0xE55531bA052c04E516D67F05D9AA9479dE02E2af` |

Sweep fees: `TollGate.sweep([<currency>, ...])` — LSD is burned, stocks go to the DAO.

---

## Quiver v2 — the provide() fix (do this BEFORE nominating anything)

Every Quiver above (USDG + 4 stocks) carries a settlement bug in
`provide()`: it pulls the LSD side from the caller's wallet while the
phantom bookkeeping assumes the rewarded pot paid — a compounder is charged
twice and the difference leaks pro rata to the other bonded LPs. Nothing
else in the protocol is affected; nobody who never calls `provide()` can be
harmed, and the function is linked nowhere. The V4 pools, the Watchtower
oracle hook and the TollGate fee hook are all fine and stay.

The fix is a replacement LP wrapper per pool, deployed by
`protocol/remix/scripts/5_quiver_v2.js` (compile the UPDATED
`2_Uniswap.sol` first — the script bytecode-checks against the old Quiver
and aborts if the unfixed file was compiled). Fill the v2 addresses in
here after the run:

Deployed 2026-08-31. Every address bytecode-verified against a local
solc 0.8.26 (runs=200, cancun) compile of the fixed source — runtime code
AND metadata hash match, immutables masked; each reads the DAO, the old
pool's exact PoolKey and a live price.

| pool | Quiver v2 |
|---|---|
| USDG (oracle pool) | `0x636b598e0c83dB6e57ba93be2a2A9aE882F29f5A` |
| NVDA | `0xb7D6cBE9AD1B81CEcD544c43d8994A6a74849ba5` |
| SPCX | `0x9Cadb8225C58dEF0D2196Af2b56D694694ddf410` |
| AAPL | `0xe7652a7c35b34EB88684B85FD87008E914B648CF` |
| SPY | `0x6007d7219C274CcacBf9d613B6D2Fc8dF9342f7e` |

Governance then seats them — **14 candidates in total, none of the four
struck-through AddPools above**:

- 4× **AddPool** with the v2 stock Quivers, WEIGHT = 10 (deployed below).
- 4× ListReserve and 4× SetReservePool — unchanged, the deployed
  candidates above stay valid (they reference Spyglasses, not Quivers).
- 1× **AddPool** with the v2 USDG Quiver, WEIGHT = 30, plus
  1× **SetPoolWeight** with the old USDG Quiver `0xb32405…6D21`,
  WEIGHT = 0. Commit these two in the same epoch, AddPool first.

### v2 candidates — deployed 2026-08-31, each bytecode-verified against a
### local solc 0.5.17 runs=1 compile with the real constants

| proposal | address |
|---|---|
| AddPool NVDA v2 (w10) | `0x40D11226D665C7774a6092576c2665512C57569d` |
| AddPool SPCX v2 (w10) | `0x14E73F798A146aFa4C74B3cb3bf1477eeA4E195D` |
| AddPool AAPL v2 (w10) | `0x353E042340e16a40b7cBD656426Bb472716AB8Ef` |
| AddPool SPY v2 (w10) | `0xDFa5C8a18c07C4eE1B4D07D866543B51Eb899e6e` |
| AddPool USDG v2 (w30) | `0x79BAAf4E1a9CD7E363B7135820327e9C178E6319` |
| SetPoolWeight old USDG → 0 | `0xFc7c7cd58D425F611FEd63902674AeB25E41Db45` |

### The full nomination list (epoch 17+, all fourteen)

1. `0x40D11226D665C7774a6092576c2665512C57569d` — AddPool NVDA v2
2. `0x14E73F798A146aFa4C74B3cb3bf1477eeA4E195D` — AddPool SPCX v2
3. `0x353E042340e16a40b7cBD656426Bb472716AB8Ef` — AddPool AAPL v2
4. `0xDFa5C8a18c07C4eE1B4D07D866543B51Eb899e6e` — AddPool SPY v2
5. `0x79BAAf4E1a9CD7E363B7135820327e9C178E6319` — AddPool USDG v2
6. `0xFc7c7cd58D425F611FEd63902674AeB25E41Db45` — SetPoolWeight old USDG
7. `0x0C666e2D7E3dc659459D64fA713dEF089D89e4F2` — ListReserve NVDA
8. `0x851f45148a9eC752da06fc908C07CB803D09ACDc` — ListReserve SPCX
9. `0x8A3f0f276E0BB1be9d9Ba3D3b4156e66B333Af7d` — ListReserve AAPL
10. `0xF90e79A1471d2b7AE85e27d0E37B1f0C35Bf5823` — ListReserve SPY
11. `0x09e13308629552357fbd1f7967306D3DF37BbC1D` — SetReservePool NVDA
12. `0x840708c94C8a8D2BC2a1fCaa9842c2E980C9F140` — SetReservePool SPCX
13. `0xfF01c5bdB1E2580Ea131fAD6C5D2Fd6c3f6384ef` — SetReservePool AAPL
14. `0xE55531bA052c04E516D67F05D9AA9479dE02E2af` — SetReservePool SPY

Commit order (epoch 45+): per stock ListReserve before SetReservePool;
AddPool USDG v2 and SetPoolWeight in the same epoch, AddPool first;
everything else in any order.

After the USDG pair commits, old-pool LPs migrate: unbond, wait out the
12-epoch Fluid lock, then withdraw + claim + deposit-into-v2 + bond in one
epoch (each pool action starts the 12-epoch clock, so batch them). The
frontend reads the schedule off the chain — v2 appears as soon as its
AddPool commits; only `frontend/src/config/addresses.ts` (`pool`) wants
the v2 address for its static display list.

---

## Deploying the candidates (can be done before launch)

Deploying a proposal contract is allowed any time - only nominating, voting
and committing need a running clock and bonded stake. Fourteen rounds in
Remix, one per candidate (5x AddPool, 1x SetPoolWeight, 4x ListReserve,
4x SetReservePool). AddPool and SetPoolWeight constants come from script
5's output (Quiver v2 — see the section above), the rest from the blocks
below:

1. Open the workspace with `1_Protocol.sol`. Compiler tab: **0.5.17**,
   optimizer **on, runs = 1** - not the 200 the core deploy used. With
   runs=200 the AddPool/ListReserve candidates land a couple hundred bytes
   over the 24,576-byte EIP-170 limit and the deploy fails; runs=1 optimises
   for size and every candidate fits (verified: AddPool 24,407 / ListReserve
   24,484). If Remix still shows a "code size over limit" warning, Cancel -
   never Force Send.
2. Ctrl+F in `1_Protocol.sol` for `contract AddPool`. Replace its two
   constants with the first block below (NVDA). Save.
3. **Compile 1_Protocol.sol.** Every edit needs a recompile before deploying.
4. Deploy tab: Environment "Browser Extension", the wallet does not matter -
   proposal contracts have no owner. In the CONTRACT dropdown pick
   **AddPool** (the list is long; type to filter). Click **Deploy**, confirm.
   The deploys are large (each candidate carries the whole implementation);
   that is normal.
5. Copy the new address from "Deployed Contracts" (copy icon) and write it
   next to the matching block below.
6. Repeat 2-5 for SPCX, AAPL, SPY - then the same steps for
   `contract ListReserve` (ASSET+FEED only, POOL stays address(0)) and
   `contract SetReservePool` (ASSET + the Spyglass) with the blocks below.

Careful: `POOL` means the **Quiver** in AddPool but the **Spyglass** in
SetReservePool. The blocks below are already correct - paste, don't retype.

After launch, in The Moot: bond, wait out the 16-epoch Fluid lock, then
nominate each candidate by casting its first vote; commit after the 28-epoch
window passes.

## Governance constants (paste into 1_Protocol.sol)

### AddPool — puts an LP pool on the emission schedule

**SUPERSEDED — these are the v1 Quivers with the provide() bug. Use the
blocks script 5 prints (v2 addresses) instead; kept only to identify the
dead candidates above.**

```solidity
// NVDA
address private constant POOL = address(0x15FDa813b1006cB18dC5F5589c8E7F3A19B1a798);
uint256 private constant WEIGHT = 10;

// SPCX
address private constant POOL = address(0x9Da5EE1a3006fdf0E8146816166548e76BB5210D);
uint256 private constant WEIGHT = 10;

// AAPL
address private constant POOL = address(0x5e9896D6784caA8DC3758A7Ce8021715f6C32877);
uint256 private constant WEIGHT = 10;

// SPY
address private constant POOL = address(0xD7845447D1f01c42e5478fAB86936DCCE0A672E5);
uint256 private constant WEIGHT = 10;
```

### ListReserve — makes a stock bondable into the treasury

Leave `POOL = address(0)` in ListReserve: with the Spyglass compiled in the
candidate exceeds EIP-170 (24,711 bytes at runs=1). The Spyglass is wired by
a separate SetReservePool proposal below; until that commits, the treasury
prices the stock from its Chainlink feed alone.

```solidity
// NVDA
address private constant ASSET = address(0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC);
address private constant FEED  = address(0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15);

// SPCX
address private constant ASSET = address(0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa);
address private constant FEED  = address(0xB265810950ba6c5C0Ff821c9963014a56fD8Bffb);

// AAPL
address private constant ASSET = address(0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9);
address private constant FEED  = address(0x6B22A786bAa607d76728168703a39Ea9C99f2cD0);

// SPY
address private constant ASSET = address(0x117cc2133c37B721F49dE2A7a74833232B3B4C0C);
address private constant FEED  = address(0x319724394D3A0e3669269846abE664Cd621f9f6A);
```

### SetReservePool — wires the stock's Spyglass (24/7 price cross-check)

Commit each stock's ListReserve first, then its SetReservePool.

```solidity
// NVDA
address private constant ASSET = address(0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC);
address private constant POOL  = address(0x1b3e1aF821f3edbB0ee78f14aE439A74DB3BD122);

// SPCX
address private constant ASSET = address(0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa);
address private constant POOL  = address(0x0ED5c862D1E706EcfC949974Ab8aE1645A931e63);

// AAPL
address private constant ASSET = address(0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9);
address private constant POOL  = address(0xA5BEC086e12a0a4604440bFeFCeEa8dF9f0Be4A6);

// SPY
address private constant ASSET = address(0x117cc2133c37B721F49dE2A7a74833232B3B4C0C);
address private constant POOL  = address(0x50647E8295ed4696151eF2eB85372826c6045a5a);
```
