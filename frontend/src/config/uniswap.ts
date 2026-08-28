import type { Address } from "viem";
import { robinhoodMainnet } from "./chains";

/**
 * Uniswap on Robinhood Chain mainnet.
 *
 * The router there is a *fork*: its v4 swap struct carries an extra
 * `minHopPriceX36` field, so calldata built by the stock Uniswap SDK reverts.
 * `SwapPanel` encodes the struct by hand to match. Only the router below is
 * the right one.
 *
 * Source: https://docs.bags.fm/robinhood/overview
 */
export const UNISWAP: Record<number, { universalRouter: Address; permit2: Address; poolManager: Address } | undefined> = {
  [robinhoodMainnet.id]: {
    universalRouter: "0x8876789976dEcBfCbBbe364623C63652db8C0904",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
  },
};

/** Must match what the pool was initialized with (see the deploy script). */
export const POOL_FEE = 3000;
export const POOL_TICK_SPACING = 60;

/** UniversalRouter command byte for a v4 swap. */
export const CMD_V4_SWAP = "0x10" as const;

/** v4 router actions, packed: SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL. */
export const V4_ACTIONS = "0x060c0f" as const;
