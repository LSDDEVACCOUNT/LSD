"use client";

import { useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { erc20Abi, implementationAbi } from "@/config/abis";
import { useAddresses } from "@/hooks/useAddresses";

export type Reserve = {
  address: Address;
  symbol: string;
  decimals: number;
  /** Balance the protocol holds, in the asset's own decimals. */
  balance: bigint | undefined;
  /** Price of one whole unit in counter units, 18-decimal fixed point. */
  price: bigint | undefined;
  /** What the holding is worth in counter units, 18-decimal fixed point. */
  value: bigint | undefined;
  /** False when the Chainlink feed is stale, dead or non-positive. */
  priced: boolean;
  /** False once governance has delisted it: still held and still redeemable,
   *  but no longer accepting bonds. */
  bondable: boolean;
  /** Zero for the counter token, which is the unit of account. */
  oracle: Address | undefined;
};

/**
 * Everything the treasury holds.
 *
 * The list is read from the chain rather than configured, because governance
 * can add to it at any time and a hardcoded copy would quietly stop matching
 * what redemption actually pays out.
 */
export function useReserves() {
  const { addresses, configured } = useAddresses();
  const root = addresses?.root;

  const { data: count, refetch: refetchCount } = useReadContract({
    address: root,
    abi: implementationAbi,
    functionName: "reserveCount",
    query: { enabled: configured, refetchInterval: 30_000 },
  });

  const indices = count === undefined ? [] : Array.from({ length: Number(count) }, (_, i) => BigInt(i));

  const { data: addressData, refetch: refetchAddresses } = useReadContracts({
    contracts: indices.map((i) => ({
      address: root,
      abi: implementationAbi,
      functionName: "reserveAt" as const,
      args: [i] as const,
    })),
    query: { enabled: configured && indices.length > 0 },
  });

  const assets = (addressData ?? [])
    .map((r) => r.result as Address | undefined)
    .filter((a): a is Address => !!a);

  const { data, refetch: refetchDetails } = useReadContracts({
    contracts: assets.flatMap((asset) => [
      { address: asset, abi: erc20Abi, functionName: "symbol" as const },
      { address: asset, abi: erc20Abi, functionName: "decimals" as const },
      { address: root, abi: implementationAbi, functionName: "reserveBalance" as const, args: [asset] as const },
      { address: root, abi: implementationAbi, functionName: "reservePrice" as const, args: [asset] as const },
      { address: root, abi: implementationAbi, functionName: "isReserve" as const, args: [asset] as const },
      { address: root, abi: implementationAbi, functionName: "reserveOracle" as const, args: [asset] as const },
    ]),
    query: { enabled: configured && assets.length > 0, refetchInterval: 15_000 },
  });

  const PER_ASSET = 6;
  const ONE = BigInt(10) ** BigInt(18);
  const reserves: Reserve[] = assets.map((address, i) => {
    const at = (offset: number) => data?.[i * PER_ASSET + offset]?.result;
    const decimals = (at(1) as number | undefined) ?? 18;
    const balance = at(2) as bigint | undefined;
    const price = at(3) as readonly [bigint, boolean] | undefined;

    // The same arithmetic the treasury does: lift the balance to 18 decimals,
    // multiply by the price. Done here rather than read off the chain because
    // every byte of the Implementation is spoken for - see NOTICE.
    const value =
      balance === undefined || price === undefined || !price[1] || decimals > 18
        ? undefined
        : (balance * BigInt(10) ** BigInt(18 - decimals) * price[0]) / ONE;

    return {
      address,
      symbol: (at(0) as string | undefined) ?? "—",
      decimals,
      balance,
      value,
      price: price?.[0],
      priced: price?.[1] ?? false,
      bondable: (at(4) as boolean | undefined) ?? false,
      oracle: at(5) as Address | undefined,
    };
  });

  return {
    reserves,
    ready: assets.length > 0 && data !== undefined,
    refetch: () => {
      refetchCount();
      refetchAddresses();
      refetchDetails();
    },
  };
}
