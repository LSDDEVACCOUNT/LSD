import { robinhoodMainnet } from "./chains";
import type { Address } from "viem";

export type NetworkAddresses = {
  /** Sherwood proxy (the DAO). Talk to it using the Greenwood ABI. */
  root: Address;
  /** LSD token (the `Dollar` contract). */
  dollar: Address;
  /** Counter token the pool and the oracle price LSD against. */
  counter: Address;
  /** The oracle pool's Quiver. The other pairs are read off the DAO. */
  pool: Address;
  /** Watchtower - the V4 hook the price oracle reads from. */
  hook: Address;
};

const UNSET: Address = "0x0000000000000000000000000000000000dEaD";

// Fill these in after deploying. This is the ONLY file you
// need to touch to point the frontend at a deployment.
//
// Note what is deliberately not here: the LP pairs and the treasury's
// reserves. Both are read off the chain, because governance changes them and
// a list kept here could only ever drift from what was actually voted in.
export const ADDRESSES: Record<number, NetworkAddresses> = {
  [robinhoodMainnet.id]: {
    root: "0x3210F83b3a0E1E585100994C823c30c4C0176912",
    dollar: "0x02A8D8a2a7bee68A39cdFA822388fA878817f9AB",
    counter: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
    pool: "0xb32405e649cdA0758D1d826301ae659DB2976D21",
    hook: "0xE5B19CC394c678518f2d91049F2a4E9B72981044",
  },
};

export function isConfigured(addresses: NetworkAddresses | undefined): boolean {
  if (!addresses) return false;
  return ([addresses.root, addresses.dollar, addresses.counter, addresses.pool, addresses.hook] as Address[]).every(
    (a) => a !== UNSET,
  );
}

export const defaultChainId = robinhoodMainnet.id;
