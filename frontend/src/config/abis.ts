// Hand-written minimal ABIs covering only what this frontend calls. The
// contracts are Solidity 0.5.17 (DAO) / 0.8.24 (V4 hook & pool) - not built
// by this app's own toolchain, so these are authored by hand against the
// source in `protocol/contracts/dao/Getters.sol`, `Bonding.sol`,
// `Greenwood.sol`, `protocol/v4/src/Quiver.sol` and
// `Watchtower.sol`. Keep in sync if you change those.

export const erc20Abi = [
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const;

// The Sherwood proxy, called through the `Greenwood` ABI (the final logic
// contract after the full Deployer1->2->3->Implementation upgrade
// chain). Covers DAO-level bonding + epoch/protocol stats.
export const implementationAbi = [
  ...erc20Abi,
  {
    type: "function",
    name: "dollar",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "pool",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalBonded",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalStaged",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOfStaged",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOfBonded",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "statusOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint8" }], // Account.Status: 0=Frozen, 1=Fluid, 2=Locked
  },
  {
    type: "function",
    name: "epoch",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "epochStart",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "epochPeriod",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "epochTime",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalDebt",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalRedeemable",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalCoupons",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalNet",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "bootstrappingAt",
    stateMutability: "view",
    inputs: [{ name: "epoch", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "couponPremium",
    stateMutability: "view",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOfCoupons",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "epoch", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "couponsExpiration",
    stateMutability: "view",
    inputs: [{ name: "epoch", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "purchaseCoupons",
    stateMutability: "nonpayable",
    inputs: [{ name: "dollarAmount", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "redeemCoupons",
    stateMutability: "nonpayable",
    inputs: [
      { name: "epoch", type: "uint256" },
      { name: "couponAmount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "counter",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "treasurer",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "bondsPaused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "poolCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "poolAt",
    stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "poolWeight",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalPoolWeight",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "reserveCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "reserveAt",
    stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "isReserve",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "reserveOracle",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "reserveBalance",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  // (price in counter units, whether the feed could be trusted)
  {
    type: "function",
    name: "reservePrice",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [{ type: "uint256" }, { type: "bool" }],
  },
  // (total value in counter units, whether every reserve could be priced)
  {
    type: "function",
    name: "treasuryValue",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }, { type: "bool" }],
  },
  // Treasury value in counter units, 18 decimals - NOT the counter token's
  // own decimals, and no longer a raw balance now that stocks can be held.
  {
    type: "function",
    name: "treasury",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  // The live per-epoch supply-change limit: rests at 2.5%, climbs while the
  // price pins it, ceilings at 10%, halves on contraction epochs.
  {
    type: "function",
    name: "supplyLimit",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "backingPerDollar",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "bondDiscount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "effectiveBondPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "bondCapacity",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "bondPayoutFor",
    stateMutability: "view",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOfBonds",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "unlockEpoch", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalBonds",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "purchaseBond",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "claimBond",
    stateMutability: "nonpayable",
    inputs: [{ name: "unlockEpoch", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "redeem",
    stateMutability: "nonpayable",
    inputs: [{ name: "dollarAmount", type: "uint256" }],
    outputs: [{ type: "uint256[]" }],
  },
  {
    type: "function",
    name: "setBondDiscount",
    stateMutability: "nonpayable",
    inputs: [{ name: "discount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "advance",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [{ name: "value", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "value", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "bond",
    stateMutability: "nonpayable",
    inputs: [{ name: "value", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "unbond",
    stateMutability: "nonpayable",
    inputs: [{ name: "value", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "unbondUnderlying",
    stateMutability: "nonpayable",
    inputs: [{ name: "value", type: "uint256" }],
    outputs: [],
  },
  // --- governance ---
  {
    type: "function",
    name: "vote",
    stateMutability: "nonpayable",
    inputs: [
      { name: "candidate", type: "address" },
      { name: "vote", type: "uint8" }, // Candidate.Vote: 0 undecided, 1 approve, 2 reject
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "commit",
    stateMutability: "nonpayable",
    inputs: [{ name: "candidate", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "startFor",
    stateMutability: "view",
    inputs: [{ name: "candidate", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "periodFor",
    stateMutability: "view",
    inputs: [{ name: "candidate", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approveFor",
    stateMutability: "view",
    inputs: [{ name: "candidate", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "rejectFor",
    stateMutability: "view",
    inputs: [{ name: "candidate", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "votesFor",
    stateMutability: "view",
    inputs: [{ name: "candidate", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "isNominated",
    stateMutability: "view",
    inputs: [{ name: "candidate", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "recordedVote",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "candidate", type: "address" },
    ],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "totalBondedAt",
    stateMutability: "view",
    inputs: [{ name: "epoch", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

// Governance's Proposal event, for enumerating candidates off the chain's
// own history the way the activity feed reads supply events.
export const proposalEvent = {
  type: "event",
  name: "Proposal",
  inputs: [
    { name: "candidate", type: "address", indexed: true },
    { name: "account", type: "address", indexed: true },
    { name: "start", type: "uint256", indexed: true },
    { name: "period", type: "uint256", indexed: false },
  ],
} as const;

// Commit, to tell which proposals have already been enacted.
export const commitEvent = {
  type: "event",
  name: "Commit",
  inputs: [
    { name: "account", type: "address", indexed: true },
    { name: "candidate", type: "address", indexed: true },
  ],
} as const;

// Quiver - the LP-incentive pool. One instance per LSD pair; the DAO
// splits each expansion across whichever of them governance put on the
// emission schedule.
export const poolAbi = [
  {
    type: "function",
    name: "poolKey",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "currency0", type: "address" },
      { name: "currency1", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "tickSpacing", type: "int24" },
      { name: "hooks", type: "address" },
    ],
  },
  {
    type: "function",
    name: "dollarIsCurrency0",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "sqrtPriceX96",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint160" }],
  },
  {
    type: "function",
    name: "totalStaged",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalBonded",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalClaimable",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOfRewarded",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "accounts",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [
      { name: "staged", type: "uint256" },
      { name: "claimable", type: "uint256" },
      { name: "bonded", type: "uint256" },
      { name: "phantom", type: "uint256" },
      { name: "fluidUntil", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "dollarMax", type: "uint256" },
      { name: "counterMax", type: "uint256" },
    ],
    outputs: [{ name: "liquidity", type: "uint256" }],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "liquidity", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [{ name: "value", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "bond",
    stateMutability: "nonpayable",
    inputs: [{ name: "value", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "unbond",
    stateMutability: "nonpayable",
    inputs: [{ name: "value", type: "uint256" }],
    outputs: [],
  },
] as const;

// Watchtower - the public price view, plus the permissionless sweep that
// moves collected swap fees into the backing.
export const oracleHookAbi = [
  {
    type: "function",
    name: "currentPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "sweep",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
] as const;

// TollGate - one instance shared by every LSD/stock pool. Its sweep names
// the currencies to move, since it has no fixed pair of its own.
export const feeHookAbi = [
  {
    type: "function",
    name: "sweep",
    stateMutability: "nonpayable",
    inputs: [{ name: "currencies", type: "address[]" }],
    outputs: [],
  },
] as const;

// BondPurchase, for enumerating an account's bonds from the chain's own
// history. A bond stays claimable forever, so no fixed window of epochs can
// find them all - the logs can.
export const bondPurchaseEvent = {
  type: "event",
  name: "BondPurchase",
  inputs: [
    { name: "account", type: "address", indexed: true },
    { name: "asset", type: "address", indexed: true },
    { name: "unlockEpoch", type: "uint256", indexed: true },
    { name: "assetAmount", type: "uint256", indexed: false },
    { name: "dollarPayout", type: "uint256", indexed: false },
  ],
} as const;

// Protocol activity events, for the live feed on the home page. Each is a
// real event emitted by the deployed contracts; the feed decodes recent logs
// for them and, before a deployment is wired in, cycles a labelled demo reel.
export const activityEvents = {
  supplyIncrease: {
    type: "event",
    name: "SupplyIncrease",
    inputs: [
      { name: "epoch", type: "uint256", indexed: true },
      { name: "price", type: "uint256", indexed: false },
      { name: "newRedeemable", type: "uint256", indexed: false },
      { name: "lessDebt", type: "uint256", indexed: false },
      { name: "newBonded", type: "uint256", indexed: false },
    ],
  },
  supplyDecrease: {
    type: "event",
    name: "SupplyDecrease",
    inputs: [
      { name: "epoch", type: "uint256", indexed: true },
      { name: "price", type: "uint256", indexed: false },
      { name: "newDebt", type: "uint256", indexed: false },
    ],
  },
  bondPurchase: bondPurchaseEvent,
  redemption: {
    type: "event",
    name: "Redemption",
    inputs: [
      { name: "account", type: "address", indexed: true },
      { name: "dollarAmount", type: "uint256", indexed: false },
      { name: "payouts", type: "uint256[]", indexed: false },
    ],
  },
  sweep: {
    type: "event",
    name: "Sweep",
    inputs: [
      { name: "caller", type: "address", indexed: true },
      { name: "currency", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
} as const;
