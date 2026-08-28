"use client";

import { useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { erc20Abi, implementationAbi, poolAbi } from "@/config/abis";
import { useAddresses } from "@/hooks/useAddresses";

export type LpPool = {
  address: Address;
  /** The token LSD is paired against in this pool. */
  counter: Address;
  counterSymbol: string;
  counterDecimals: number;
  dollarIsCurrency0: boolean;
  /** Share of each expansion, relative to `totalWeight`. */
  weight: bigint;
  /** Human price of 1 LSD in counter units, 18-decimal fixed point. */
  price: bigint | undefined;
  totalStaged: bigint | undefined;
  totalBonded: bigint | undefined;
};

const Q192 = BigInt(1) << BigInt(192);
const ONE = BigInt(10) ** BigInt(18);

/**
 * Converts a V4 sqrt price into the human price of 1 LSD in counter units.
 *
 * The pool stores a ratio of *raw* token units, so a pair of tokens with
 * different decimals needs scaling, and the ratio is inverted when LSD sorted
 * into currency1. Both are why this cannot be done generically on-chain: the
 * pool contract runs against a 6-decimal stablecoin and 18-decimal stocks
 * alike, so it hands out the raw number and the caller, which knows the pair,
 * finishes the job.
 */
export function priceFromSqrt(
  sqrtPriceX96: bigint | undefined,
  dollarIsCurrency0: boolean,
  counterDecimals: number,
): bigint | undefined {
  if (sqrtPriceX96 === undefined || sqrtPriceX96 === BigInt(0)) return undefined;
  if (counterDecimals > 18) return undefined;

  const squared = sqrtPriceX96 * sqrtPriceX96;
  const norm = BigInt(10) ** BigInt(18 - counterDecimals);

  return dollarIsCurrency0 ? (squared * norm * ONE) / Q192 : (Q192 * norm * ONE) / squared;
}

/**
 * Every LP pool on the emission schedule.
 *
 * Read from the chain rather than configured, including which token each pool
 * is paired against: the pool contract knows its own PoolKey, so a config file
 * listing pairs could only ever go out of date relative to what governance has
 * actually put on the schedule.
 */
export function usePools() {
  const { addresses, configured } = useAddresses();
  const root = addresses?.root;

  const { data: count } = useReadContract({
    address: root,
    abi: implementationAbi,
    functionName: "poolCount",
    query: { enabled: configured, refetchInterval: 30_000 },
  });

  const { data: totalWeight } = useReadContract({
    address: root,
    abi: implementationAbi,
    functionName: "totalPoolWeight",
    query: { enabled: configured, refetchInterval: 30_000 },
  });

  const indices = count === undefined ? [] : Array.from({ length: Number(count) }, (_, i) => BigInt(i));

  const { data: addressData } = useReadContracts({
    contracts: indices.map((i) => ({
      address: root,
      abi: implementationAbi,
      functionName: "poolAt" as const,
      args: [i] as const,
    })),
    query: { enabled: configured && indices.length > 0 },
  });

  const poolAddresses = (addressData ?? [])
    .map((x) => x.result as Address | undefined)
    .filter((a): a is Address => !!a);

  const { data: keyData } = useReadContracts({
    contracts: poolAddresses.flatMap((pool) => [
      { address: pool, abi: poolAbi, functionName: "poolKey" as const },
      { address: pool, abi: poolAbi, functionName: "dollarIsCurrency0" as const },
    ]),
    query: { enabled: poolAddresses.length > 0 },
  });

  const counters: (Address | undefined)[] = poolAddresses.map((_, i) => {
    const key = keyData?.[i * 2]?.result as readonly [Address, Address, number, number, Address] | undefined;
    const isC0 = keyData?.[i * 2 + 1]?.result as boolean | undefined;
    if (!key || isC0 === undefined) return undefined;
    return isC0 ? key[1] : key[0];
  });

  const { data, refetch } = useReadContracts({
    contracts: poolAddresses.flatMap((pool, i) => [
      { address: counters[i], abi: erc20Abi, functionName: "symbol" as const },
      { address: counters[i], abi: erc20Abi, functionName: "decimals" as const },
      { address: root, abi: implementationAbi, functionName: "poolWeight" as const, args: [pool] as const },
      { address: pool, abi: poolAbi, functionName: "sqrtPriceX96" as const },
      { address: pool, abi: poolAbi, functionName: "totalStaged" as const },
      { address: pool, abi: poolAbi, functionName: "totalBonded" as const },
    ]),
    query: { enabled: poolAddresses.length > 0 && counters.every(Boolean), refetchInterval: 15_000 },
  });

  const PER_POOL = 6;
  const pools: LpPool[] = poolAddresses.flatMap((address, i) => {
    const counter = counters[i];
    if (!counter) return [];
    const at = (offset: number) => data?.[i * PER_POOL + offset]?.result;
    const dollarIsCurrency0 = (keyData?.[i * 2 + 1]?.result as boolean | undefined) ?? true;
    const counterDecimals = (at(1) as number | undefined) ?? 18;
    return [
      {
        address,
        counter,
        counterSymbol: (at(0) as string | undefined) ?? "—",
        counterDecimals,
        dollarIsCurrency0,
        weight: (at(2) as bigint | undefined) ?? BigInt(0),
        price: priceFromSqrt(at(3) as bigint | undefined, dollarIsCurrency0, counterDecimals),
        totalStaged: at(4) as bigint | undefined,
        totalBonded: at(5) as bigint | undefined,
      },
    ];
  });

  return {
    pools,
    totalWeight: (totalWeight as bigint | undefined) ?? BigInt(0),
    ready: poolAddresses.length > 0 && data !== undefined,
    refetch,
  };
}
