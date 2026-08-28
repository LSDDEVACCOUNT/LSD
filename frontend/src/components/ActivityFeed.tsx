"use client";

import { useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";
import { formatUnits } from "viem";
import { activityEvents } from "@/config/abis";
import { useAddresses } from "@/hooks/useAddresses";

/**
 * The protocol, live.
 *
 * A protocol that steps its own supply, sells bonds, sweeps fees and pays out
 * redemptions is doing something visible every few minutes. This feed decodes
 * those events off the chain and streams them newest-first. Before a
 * deployment is wired in there is nothing to read, so it cycles a labelled
 * demo reel instead of sitting empty.
 */

type Kind = "epoch" | "bond" | "redeem" | "sweep" | "debt";

type Item = {
  id: string;
  kind: Kind;
  text: string;
  sub: string;
};

const DOT: Record<Kind, string> = {
  epoch: "var(--color-gold)",
  bond: "var(--color-leaf)",
  redeem: "var(--color-lime)",
  sweep: "var(--color-ember)",
  debt: "var(--color-haze)",
};

function short18(v: bigint, digits = 2): string {
  const [whole, frac] = formatUnits(v, 18).split(".");
  const n = BigInt(whole);
  const g = n.toLocaleString("en-US");
  if (!frac || digits === 0) return g;
  const t = frac.slice(0, digits).replace(/0+$/, "");
  return t ? `${g}.${t}` : g;
}

// --- the pre-deploy demo reel -------------------------------------------------

function demoItem(seq: number, epoch: number): Item {
  const reel: Omit<Item, "id">[] = [
    { kind: "epoch", text: `epoch ${epoch} · expansion`, sub: "price $1.03 · +2,140 LSD minted" },
    { kind: "bond", text: "pledge · +1,190 LSD", sub: "5,000 USDG in → Coffer" },
    { kind: "sweep", text: "sweep · +82 USDG", sub: "swap fees → backing" },
    { kind: "bond", text: "pledge · +340 LSD", sub: "2 NVDA in → Coffer" },
    { kind: "redeem", text: "redeem · 400 LSD", sub: "→ treasury basket" },
    { kind: "epoch", text: `epoch ${epoch} · neutral`, sub: "price $1.00 · no change" },
    { kind: "sweep", text: "sweep · 61 LSD burned", sub: "fee side → fewer LSD" },
    { kind: "bond", text: "pledge · +2,380 LSD", sub: "10,000 USDG in → Coffer" },
    { kind: "debt", text: `epoch ${epoch} · contraction`, sub: "price $0.98 · debt +900" },
    { kind: "redeem", text: "redeem · 1,250 LSD", sub: "→ treasury basket" },
  ];
  const pick = reel[seq % reel.length];
  return { ...pick, id: `demo-${seq}` };
}

// --- live decode --------------------------------------------------------------

function decodeLog(log: { eventName?: string; args?: Record<string, unknown>; transactionHash?: string; logIndex?: number }): Item | null {
  const a = log.args ?? {};
  const id = `${log.transactionHash ?? "?"}-${log.logIndex ?? 0}`;
  switch (log.eventName) {
    case "SupplyIncrease": {
      const minted = (a.newBonded as bigint) ?? BigInt(0);
      return { id, kind: "epoch", text: `epoch ${a.epoch} · expansion`, sub: `price $${short18((a.price as bigint) ?? BigInt(0), 3)} · +${short18(minted, 0)} LSD` };
    }
    case "SupplyDecrease":
      return { id, kind: "debt", text: `epoch ${a.epoch} · contraction`, sub: `price $${short18((a.price as bigint) ?? BigInt(0), 3)} · debt +${short18((a.newDebt as bigint) ?? BigInt(0), 0)}` };
    case "BondPurchase":
      return { id, kind: "bond", text: `pledge · +${short18((a.dollarPayout as bigint) ?? BigInt(0), 0)} LSD`, sub: "reserve in → Coffer" };
    case "Redemption":
      return { id, kind: "redeem", text: `redeem · ${short18((a.dollarAmount as bigint) ?? BigInt(0), 0)} LSD`, sub: "→ treasury basket" };
    case "Sweep":
      return { id, kind: "sweep", text: `sweep · ${short18((a.amount as bigint) ?? BigInt(0), 0)}`, sub: "fees → backing" };
    default:
      return null;
  }
}

export function ActivityFeed() {
  const { addresses, configured, chainId } = useAddresses();
  const client = usePublicClient({ chainId });
  const [items, setItems] = useState<Item[]>([]);
  const seen = useRef<Set<string>>(new Set());

  // Demo reel while there is no deployment to read from.
  useEffect(() => {
    if (configured) return;
    let seq = 0;
    const epoch = 41;
    setItems([demoItem(0, epoch), demoItem(1, epoch), demoItem(2, epoch), demoItem(3, epoch)]);
    seq = 4;
    const id = setInterval(() => {
      setItems((prev) => [demoItem(seq++, epoch), ...prev].slice(0, 7));
    }, 3600);
    return () => clearInterval(id);
  }, [configured]);

  // Live path: poll recent logs from the DAO and the oracle hook.
  useEffect(() => {
    if (!configured || !client || !addresses) return;
    let alive = true;

    async function pull() {
      try {
        const head = await client!.getBlockNumber();
        const from = head > BigInt(9000) ? head - BigInt(9000) : BigInt(0);
        const [daoLogs, hookLogs] = await Promise.all([
          client!.getLogs({
            address: addresses!.root,
            events: [activityEvents.supplyIncrease, activityEvents.supplyDecrease, activityEvents.bondPurchase, activityEvents.redemption],
            fromBlock: from,
            toBlock: head,
          }),
          client!.getLogs({
            address: addresses!.hook,
            events: [activityEvents.sweep],
            fromBlock: from,
            toBlock: head,
          }),
        ]);
        if (!alive) return;
        const decoded = [...daoLogs, ...hookLogs]
          .map((l) => decodeLog(l as never))
          .filter((x): x is Item => x !== null && !seen.current.has(x.id));
        if (decoded.length === 0) return;
        decoded.forEach((x) => seen.current.add(x.id));
        // newest first; logs come back in ascending order, so reverse the batch
        setItems((prev) => [...decoded.reverse(), ...prev].slice(0, 12));
      } catch {
        /* transient RPC hiccup; try again next tick */
      }
    }

    pull();
    const id = setInterval(pull, 15_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [configured, client, addresses]);

  return (
    <section className="panel overflow-hidden p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="pulse-dot" />
          <h2 className="eyebrow">activity</h2>
        </div>
        {!configured && (
          <span className="rounded-full border border-[var(--edge)] px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-wider text-haze">
            demo
          </span>
        )}
      </div>

      <ul className="flex flex-col">
        {items.map((it, i) => (
          <li
            key={it.id}
            className="feed-row flex items-center gap-3 border-b border-[var(--edge)] py-2.5 last:border-0"
            style={{ opacity: Math.max(0.35, 1 - i * 0.11) }}
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: DOT[it.kind], boxShadow: `0 0 8px ${DOT[it.kind]}` }}
            />
            <span className="min-w-0 flex-1 truncate font-mono text-sm text-chalk">{it.text}</span>
            <span className="hidden shrink-0 font-mono text-xs text-haze sm:inline">{it.sub}</span>
          </li>
        ))}
        {items.length === 0 && <li className="py-6 text-center text-sm text-haze">Waiting for the first epoch…</li>}
      </ul>
    </section>
  );
}
