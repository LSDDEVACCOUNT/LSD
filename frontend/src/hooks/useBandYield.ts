"use client";

import { useEffect, useMemo, useState } from "react";
import { usePublicClient, useReadContracts } from "wagmi";
import { activityEvents, implementationAbi } from "@/config/abis";
import { useAddresses } from "./useAddresses";
import { useProtocol } from "./useProtocol";

/**
 * What joining the band has actually paid, measured off the chain.
 *
 * Every expansion epoch emits SupplyIncrease with the amount minted to
 * bonded holders and pools together; the band's cut is a compiled 75%
 * (Constants.ORACLE_POOL_RATIO sends 25% to the LP pools). Dividing each
 * epoch's cut by that epoch's totalBondedAt snapshot - the same snapshot
 * governance votes are weighed with - gives the exact per-epoch yield, and
 * the trailing week is their sum.
 *
 * Deliberately trailing rather than projected: an elastic-supply protocol
 * pays only when the price is over a dollar, so any forward APY would be an
 * invented number. This one is arithmetic on what happened.
 */

const BAND_SHARE_NUM = BigInt(75);
const BAND_SHARE_DEN = BigInt(100);
/** 7 days of 6-hour epochs. */
const WINDOW_EPOCHS = BigInt(28);

export type BandYield = {
  /** Trailing 7-day yield as a fraction (0.012 = 1.2%), undefined while loading. */
  weekly: number | undefined;
  /** weekly x 52, the simple annualised rate. */
  annualized: number | undefined;
  /** How many expansion epochs paid in the window (0 = flat week). */
  expansions: number | undefined;
};

export function useBandYield(): BandYield {
  const { addresses, configured, chainId } = useAddresses();
  const client = usePublicClient({ chainId });
  const { epoch } = useProtocol();

  const [events, setEvents] = useState<{ epoch: bigint; newBonded: bigint }[] | undefined>();

  useEffect(() => {
    if (!configured || !client || !addresses || epoch === undefined) return;
    let alive = true;

    (async () => {
      try {
        const head = await client.getBlockNumber();
        const span = BigInt(3_000_000);
        const from = head > span ? head - span : BigInt(0);
        const chunk = BigInt(500_000);
        const found: { epoch: bigint; newBonded: bigint }[] = [];
        for (let lo = from; lo <= head; lo += chunk) {
          const hi = lo + chunk - BigInt(1) > head ? head : lo + chunk - BigInt(1);
          const logs = await client.getLogs({
            address: addresses.root,
            event: activityEvents.supplyIncrease,
            fromBlock: lo,
            toBlock: hi,
          });
          for (const l of logs) {
            const e = l.args.epoch as bigint | undefined;
            const nb = l.args.newBonded as bigint | undefined;
            if (e !== undefined && nb !== undefined && epoch - e < WINDOW_EPOCHS && nb > BigInt(0)) {
              found.push({ epoch: e, newBonded: nb });
            }
          }
        }
        if (alive) setEvents(found);
      } catch {
        /* transient RPC failure: stay in the loading state, the next epoch
           tick re-runs this effect */
      }
    })();

    return () => {
      alive = false;
    };
  }, [configured, client, addresses, epoch]);

  // The denominator for each epoch: the bonded total as it stood then.
  const { data: bondedRaw } = useReadContracts({
    contracts: useMemo(
      () =>
        addresses && events
          ? events.map((e) => ({
              address: addresses.root,
              abi: implementationAbi,
              functionName: "totalBondedAt" as const,
              args: [e.epoch] as const,
            }))
          : [],
      [events, addresses],
    ),
    query: { enabled: configured && !!events && events.length > 0 },
  });
  const bondedData = bondedRaw as ReadonlyArray<{ result?: unknown }> | undefined;

  return useMemo(() => {
    if (events === undefined) return { weekly: undefined, annualized: undefined, expansions: undefined };
    if (events.length === 0) return { weekly: 0, annualized: 0, expansions: 0 };
    if (!bondedData) return { weekly: undefined, annualized: undefined, expansions: undefined };

    let weekly = 0;
    let counted = 0;
    for (let i = 0; i < events.length; i++) {
      const bonded = bondedData[i]?.result as bigint | undefined;
      if (bonded === undefined || bonded === BigInt(0)) continue;
      const cut = (events[i].newBonded * BAND_SHARE_NUM) / BAND_SHARE_DEN;
      weekly += Number(cut) / Number(bonded);
      counted++;
    }
    return { weekly, annualized: weekly * 52, expansions: counted };
  }, [events, bondedData]);
}
