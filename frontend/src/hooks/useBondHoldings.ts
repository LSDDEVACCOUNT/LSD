"use client";

import { useEffect, useState } from "react";
import { useAccount, usePublicClient, useReadContracts } from "wagmi";
import { bondPurchaseEvent, implementationAbi } from "@/config/abis";
import { useAddresses } from "@/hooks/useAddresses";
import { useProtocol } from "@/hooks/useProtocol";
import { constantsFor } from "@/config/protocol";

export type BondHolding = {
  /** The epoch this bond becomes (or became) claimable at. */
  epoch: bigint;
  amount: bigint;
  ready: boolean;
};

/**
 * Every treasury bond this wallet holds, however old.
 *
 * A bond stays claimable forever, so no window of recent epochs can find
 * them all - one forgotten for a week would simply vanish from a
 * window-based list, funds intact but invisible. BondPurchase indexes the
 * account, so the chain's own logs name every unlock epoch this wallet has
 * ever bought into; a window over the next few epochs covers the purchase
 * made seconds ago that the log query has not caught up with.
 */
export function useBondHoldings() {
  const { addresses, configured } = useAddresses();
  const { address: account } = useAccount();
  const { epoch } = useProtocol();
  const constants = constantsFor(useAddresses().chainId);
  // The scan window has to cover the longest vesting any phase uses -
  // genesis bonds vest over up to speedup x the normal count - or a
  // genesis bond would drop out of the list until its log arrives.
  const bondVestingEpochs = constants.bondVestingEpochs * constants.bootstrappingSpeedupFactor;

  const publicClient = usePublicClient();
  const [purchasedEpochs, setPurchasedEpochs] = useState<readonly bigint[]>([]);
  const [logNonce, setLogNonce] = useState(0);
  const root = addresses?.root;

  useEffect(() => {
    if (!publicClient || !account || !root) return;
    let stale = false;
    publicClient
      .getLogs({ address: root, event: bondPurchaseEvent, args: { account }, fromBlock: "earliest" })
      .then((logs) => {
        if (stale) return;
        setPurchasedEpochs(logs.map((l) => l.args.unlockEpoch).filter((e): e is bigint => e !== undefined));
      })
      .catch(() => {
        // The recent window below still works without the logs.
      });
    return () => {
      stale = true;
    };
  }, [publicClient, account, root, logNonce]);

  const windowEpochs: bigint[] = [];
  if (epoch !== undefined) {
    const oldest = epoch > BigInt(bondVestingEpochs) ? epoch - BigInt(bondVestingEpochs) : BigInt(0);
    for (let e = epoch + BigInt(bondVestingEpochs); e >= oldest; e--) {
      windowEpochs.push(e);
      if (e === BigInt(0)) break;
    }
  }
  const unlockEpochs = [...new Set([...windowEpochs, ...purchasedEpochs])].sort((a, b) =>
    a > b ? -1 : a < b ? 1 : 0,
  );

  const { data, refetch } = useReadContracts({
    contracts: unlockEpochs.map((e) => ({
      address: root,
      abi: implementationAbi,
      functionName: "balanceOfBonds" as const,
      args: [account!, e] as const,
    })),
    query: { enabled: configured && !!account && unlockEpochs.length > 0, refetchInterval: 12_000 },
  });

  const holdings: BondHolding[] = unlockEpochs
    .map((e, i) => ({ epoch: e, amount: data?.[i]?.result as bigint | undefined }))
    .filter((h): h is { epoch: bigint; amount: bigint } => h.amount !== undefined && h.amount > BigInt(0))
    .map((h) => ({ ...h, ready: epoch !== undefined && epoch >= h.epoch }));

  const totalVesting = holdings.reduce((sum, h) => (h.ready ? sum : sum + h.amount), BigInt(0));
  const totalReady = holdings.reduce((sum, h) => (h.ready ? sum + h.amount : sum), BigInt(0));

  return {
    holdings,
    totalVesting,
    totalReady,
    refetch: () => {
      refetch();
      setLogNonce((n) => n + 1);
    },
  };
}
