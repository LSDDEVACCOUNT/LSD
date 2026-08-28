"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useProtocol } from "@/hooks/useProtocol";
import { useAddresses } from "@/hooks/useAddresses";
import { implementationAbi } from "@/config/abis";
import { constantsFor, formatCountdown, nextEpochStart } from "@/config/protocol";
import { SimpleAction } from "./actions";
import { formatAmount } from "@/lib/format";

/**
 * The epoch clock: where the protocol is, when it moves next, and the
 * advance() call that moves it.
 */
export function EpochCard() {
  const { addresses, configured, chainId } = useAddresses();
  const { isConnected } = useAccount();
  const { epoch, epochTime, epochStart, epochPeriod, price, advanceReady, refetch } = useProtocol();

  // What advance() pays is derived client-side rather than read: the
  // contract's quote depends on tx.gasprice, which is zero in an eth_call,
  // so asking the chain would always report the floor. The rule fits in a
  // sentence anyway.
  const { bootstrappingPeriod } = constantsFor(chainId);
  const bootstrapping = epoch !== undefined && epoch <= BigInt(bootstrappingPeriod);

  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // advance() steps one epoch per call, so a clock that has run ahead of the
  // counter takes several calls back to back to catch up.
  const behind = epoch !== undefined && epochTime !== undefined && epochTime > epoch ? epochTime - epoch : BigInt(0);

  // Before the treasurer calls launch(), epochStart sits at uint256 max.
  const unlaunched = epochStart !== undefined && epochStart > BigInt("0xffffffffffff");
  // Reads not in yet (first paint, or a momentary RPC gap): show nothing
  // definite rather than asserting the protocol is running.
  const loading = configured && (epoch === undefined || epochStart === undefined);

  const boundary =
    !unlaunched && epochStart !== undefined && epochPeriod !== undefined
      ? nextEpochStart(epochStart, epochPeriod, now, constantsFor(chainId))
      : 0;

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-6 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-8">
          <div>
            <p className="eyebrow">epoch</p>
            <p className="gilt-text mt-0.5 font-mono text-4xl font-semibold leading-none">
              {epoch !== undefined ? String(epoch) : "—"}
            </p>
          </div>
          <div>
            <p className="eyebrow">next in</p>
            <p className="mt-1.5 font-mono text-xl leading-none text-chalk">
              {boundary > 0 ? formatCountdown(boundary - now) : "—"}
            </p>
          </div>
          <div>
            <p className="eyebrow">lsd price</p>
            <p className="mt-1.5 font-mono text-xl leading-none text-chalk">
              {price !== undefined ? formatAmount(price, 18, 4) : "—"}
              <span className="ml-1.5 text-xs text-haze">USDG</span>
            </p>
          </div>
          <div>
            <p className="eyebrow">status</p>
            <p className="mt-1.5 flex items-center gap-2 text-sm leading-none">
              {loading ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-haze/40" />
                  <span className="text-haze">reading…</span>
                </>
              ) : unlaunched ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-[var(--color-gold)]/70" />
                  <span className="text-haze">awaiting launch</span>
                </>
              ) : advanceReady ? (
                <>
                  <span className="pulse-dot" />
                  <span className="text-lime-300">
                    advance ready{behind > BigInt(1) ? ` · ${behind} behind` : ""}
                  </span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-haze/50" />
                  <span className="text-haze">running</span>
                </>
              )}
            </p>
          </div>
        </div>

        {configured && isConnected && unlaunched && (
          <p className="w-full text-xs text-haze sm:w-52">
            The clock has not been started. The treasurer starts it once with launch(); until then
            advance() reverts.
          </p>
        )}
        {configured && isConnected && !unlaunched && !loading && (
          <div className="w-full sm:w-52">
            <SimpleAction
              address={addresses.root}
              abi={implementationAbi}
              functionName="advance"
              buttonLabel="advance epoch"
              variant={advanceReady ? "gilt" : "ghost"}
              onSuccess={refetch}
            />
            <p className="mt-1.5 text-xs text-haze">
              {behind > BigInt(1)
                ? `One epoch per call, ${behind} calls to catch up. `
                : "Steps the epoch and pays the caller for it. "}
              {bootstrapping
                ? "Pays a flat 100 LSD while the protocol bootstraps."
                : "Pays the gas back plus 25%, between 5 and 100 LSD."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
