"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { erc20Abi, implementationAbi, oracleHookAbi } from "@/config/abis";
import { useAddresses } from "./useAddresses";

/**
 * Protocol-wide state, read straight off the DAO and the oracle hook.
 *
 * `advanceReady` mirrors the contract's own precondition for `advance()`
 * (Bonding.step() requires `epochTime() > epoch()`), so it is exact rather
 * than a clock estimate - the epoch length differs during bootstrapping and
 * those constants aren't exposed on-chain.
 */
export function useProtocol() {
  const { addresses, configured } = useAddresses();

  const { data, refetch } = useReadContracts({
    contracts: [
      { address: addresses?.root, abi: implementationAbi, functionName: "epoch" },
      { address: addresses?.root, abi: implementationAbi, functionName: "epochTime" },
      { address: addresses?.root, abi: implementationAbi, functionName: "epochPeriod" },
      { address: addresses?.root, abi: implementationAbi, functionName: "epochStart" },
      { address: addresses?.root, abi: implementationAbi, functionName: "totalSupply" },
      { address: addresses?.root, abi: implementationAbi, functionName: "totalBonded" },
      { address: addresses?.root, abi: implementationAbi, functionName: "totalStaged" },
      { address: addresses?.root, abi: implementationAbi, functionName: "totalDebt" },
      { address: addresses?.root, abi: implementationAbi, functionName: "totalRedeemable" },
      { address: addresses?.root, abi: implementationAbi, functionName: "totalCoupons" },
      // The DAO's own totalSupply is LSDS - staking shares, minted at a
      // 1e6 multiple. The token supply people mean by "supply" lives on
      // the Dollar contract. Two different numbers; never mix them.
      { address: addresses?.dollar, abi: erc20Abi, functionName: "totalSupply" },
    ],
    query: { enabled: configured, refetchInterval: 12_000 },
  });

  const { data: price } = useReadContract({
    address: addresses?.hook,
    abi: oracleHookAbi,
    functionName: "currentPrice",
    query: { enabled: configured, refetchInterval: 12_000 },
  });

  const r = data?.map((x) => x.result);
  const epoch = r?.[0] as bigint | undefined;
  const epochTime = r?.[1] as bigint | undefined;

  return {
    epoch,
    epochTime,
    epochPeriod: r?.[2] as bigint | undefined,
    epochStart: r?.[3] as bigint | undefined,
    /** LSDS staking shares outstanding (the DAO's own ERC20). */
    lsdsSupply: r?.[4] as bigint | undefined,
    /** LSD token supply - the number everything user-facing should use. */
    dollarSupply: r?.[10] as bigint | undefined,
    totalBonded: r?.[5] as bigint | undefined,
    totalStaged: r?.[6] as bigint | undefined,
    totalDebt: r?.[7] as bigint | undefined,
    totalRedeemable: r?.[8] as bigint | undefined,
    totalCoupons: r?.[9] as bigint | undefined,
    price: price as bigint | undefined,
    advanceReady: epoch !== undefined && epochTime !== undefined && epochTime > epoch,
    refetch,
  };
}
