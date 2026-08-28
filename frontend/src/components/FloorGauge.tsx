"use client";

import { useReadContract } from "wagmi";
import { implementationAbi, oracleHookAbi } from "@/config/abis";
import { useAddresses } from "@/hooks/useAddresses";
import { useProtocol } from "@/hooks/useProtocol";

/**
 * The floor, made visible.
 *
 * Two numbers drive the whole thesis of the protocol: what one LSD trades at,
 * and what one LSD can be redeemed for out of the treasury. The second is a
 * hard floor under the first - burn LSD, take your pro-rata slice of every
 * reserve, no oracle and no permission in the way - and it rises every epoch
 * as bonds and swept swap fees flow in. This panel puts both on one track so
 * the gap (and which side of it the price sits on) reads at a glance.
 *
 * Before a deployment is wired in, it shows a representative preview rather
 * than an empty box, clearly labelled as one.
 */

const ONE = BigInt(10) ** BigInt(18);

function toNumber(x: bigint | undefined): number | undefined {
  if (x === undefined) return undefined;
  return Number(x) / Number(ONE);
}

export function FloorGauge() {
  const { addresses, configured } = useAddresses();
  const { price } = useProtocol();

  const { data: backingRaw } = useReadContract({
    address: addresses?.root,
    abi: implementationAbi,
    functionName: "backingPerDollar",
    query: { enabled: configured, refetchInterval: 15_000 },
  });

  const { data: livePrice } = useReadContract({
    address: addresses?.hook,
    abi: oracleHookAbi,
    functionName: "currentPrice",
    query: { enabled: configured, refetchInterval: 12_000 },
  });

  const backingLive = toNumber(backingRaw as bigint | undefined);
  const marketLive = toNumber((livePrice as bigint | undefined) ?? price);

  // Three states, kept apart on purpose. Preview is the marketing demo shown
  // only when no deployment is wired in - it must never stand in for a live
  // read that simply has not arrived, or a momentary RPC gap would flash
  // plausible fake numbers on the real site. When a deployment IS wired in but
  // its reads are not in yet, say so plainly instead.
  const isPreview = !configured;
  const awaiting = configured && (backingLive === undefined || marketLive === undefined);

  if (awaiting) {
    return (
      <section className="panel overflow-hidden p-5 sm:p-6">
        <p className="eyebrow">the floor</p>
        <p className="mt-1 max-w-md text-xs leading-relaxed text-haze">
          Every LSD can be burned for its pro-rata slice of the treasury, with no oracle and no
          queue. That redemption value is a floor under the price, and it rises each epoch as bonds
          and swept fees flow in.
        </p>
        <p className="mt-6 flex items-center gap-2 font-mono text-sm text-haze">
          <span className="pulse-dot" /> reading the chain…
        </p>
      </section>
    );
  }

  const backing = isPreview ? 0.71 : backingLive!;
  const market = isPreview ? 1.04 : marketLive!;

  // Scale the track so both markers and the $1 peg are always comfortably in
  // frame, with a little headroom above the higher of the two.
  const top = Math.max(market, backing, 1) * 1.18;
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / top) * 100))}%`;

  const belowFloor = market <= backing;
  const premium = backing > 0 ? (market / backing - 1) * 100 : 0;

  return (
    <section className="panel overflow-hidden p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">the floor</p>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-haze">
            Every LSD can be burned for its pro-rata slice of the treasury, with no oracle and no
            queue. That redemption value is a floor under the price, and it rises each epoch as
            bonds and swept fees flow in.
          </p>
        </div>
        {isPreview && (
          <span className="rounded-full border border-[var(--edge)] px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-wider text-haze">
            preview
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
        <div>
          <p className="eyebrow">backing / LSD</p>
          <p className="gilt-text mt-0.5 font-mono text-4xl font-semibold leading-none sm:text-5xl">
            ${backing.toFixed(4)}
          </p>
        </div>
        <div>
          <p className="eyebrow">market price</p>
          <p className="mt-0.5 font-mono text-2xl leading-none text-chalk sm:text-3xl">
            ${market.toFixed(4)}
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="eyebrow">{belowFloor ? "direct claim" : "premium to floor"}</p>
          <p
            className={`mt-0.5 font-mono text-2xl font-semibold leading-none sm:text-3xl ${
              belowFloor ? "text-lime" : "text-chalk"
            }`}
            style={belowFloor ? { color: "var(--color-lime)" } : undefined}
          >
            {belowFloor ? "live" : `+${premium.toFixed(1)}%`}
          </p>
        </div>
      </div>

      {/* The track: floor fill from 0 to backing, market marker, $1 peg tick. */}
      <div className="relative mt-7 h-11 rounded-xl border border-[var(--edge)] bg-black/30">
        <div className="floor-fill absolute inset-y-0 left-0 rounded-l-xl" style={{ width: pct(backing) }} />

        {/* $1.00 peg reference */}
        <div className="absolute inset-y-0" style={{ left: pct(1) }}>
          <div className="h-full w-px bg-white/25" />
          <span className="absolute -top-5 left-1/2 -translate-x-1/2 font-mono text-[0.65rem] text-haze">
            $1.00
          </span>
        </div>

        {/* market marker */}
        <div className="market-marker absolute inset-y-0 -translate-x-1/2" style={{ left: pct(market) }}>
          <div className="h-full w-0.5 bg-chalk shadow-[0_0_10px_rgba(236,233,247,0.7)]" />
          <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[0.65rem] text-chalk">
            market
          </span>
        </div>

        {/* floor edge label */}
        <span
          className="absolute -bottom-6 -translate-x-1/2 whitespace-nowrap font-mono text-[0.65rem] text-lime"
          style={{ left: pct(backing), color: "var(--color-lime)" }}
        >
          floor
        </span>
      </div>

      <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-haze">
        <span className="inline-flex items-center gap-2">
          <span className="pulse-dot" />
          bonds &amp; swept fees raise the floor
        </span>
        <span>
          {belowFloor
            ? "price is at or under the floor: redeeming returns more than selling"
            : "price is above the floor: the floor is the downside, not the exit"}
        </span>
      </div>
    </section>
  );
}
