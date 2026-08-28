"use client";

import { useSwitchChain } from "wagmi";
import { useAddresses } from "@/hooks/useAddresses";
import { supportedChains } from "@/config/chains";

/**
 * Reads work through the app's own RPC regardless of what the wallet is set
 * to, so a wrong-network wallet looks completely healthy until the first
 * transaction. This says so up front instead.
 */
export function NetworkBanner() {
  const { wrongNetwork, chainId, configured } = useAddresses();
  const { switchChain, isPending } = useSwitchChain();

  // Nothing to talk to yet. The pages below still render their whole layout,
  // with every figure dashed out and every button dead, so what is missing is
  // the data rather than the app.
  if (!configured) {
    return (
      <div className="border-b border-white/10 bg-white/[0.03]">
        <div className="mx-auto w-full max-w-6xl px-5 py-2.5 sm:px-8">
          <p className="text-sm text-haze">
            <span className="text-chalk">Not live yet.</span> This is the interface with no protocol behind it. The
            figures fill in and the buttons wake up once a deployment&apos;s addresses are set in{" "}
            <code className="font-mono text-chalk">src/config/addresses.ts</code>.
          </p>
        </div>
      </div>
    );
  }

  if (!wrongNetwork) return null;

  const target = supportedChains.find((c) => c.id === chainId);

  return (
    <div className="border-b border-amber-400/25 bg-amber-400/10">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-2.5 sm:px-8">
        <p className="text-sm text-amber-100">
          Your wallet is on another network. The numbers here come straight from{" "}
          {target?.name ?? "the protocol chain"}, so they look fine, but nothing you sign will go through.
        </p>
        <button
          onClick={() => switchChain({ chainId: chainId as (typeof supportedChains)[number]["id"] })}
          disabled={isPending}
          className="btn btn-gilt"
        >
          {isPending ? "Switching…" : `Switch to ${target?.name ?? "the right network"}`}
        </button>
      </div>
    </div>
  );
}
