"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { shortAddress } from "@/lib/format";
import { defaultChainId } from "@/config/addresses";
import { useAddresses } from "@/hooks/useAddresses";
import { supportedChains } from "@/config/chains";

/**
 * One Connect button that picks the right transport by itself: a browser
 * with a wallet extension gets the injected connector, a phone (no
 * extensions) gets WalletConnect, which opens the wallet app. Only when
 * neither path exists does it explain instead of silently doing nothing.
 */
export function ConnectWallet() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { wrongNetwork } = useAddresses();

  // window.ethereum only exists client-side; start false and correct after
  // mount so server and client render the same first frame.
  const [hasInjected, setHasInjected] = useState(false);
  const [showHint, setShowHint] = useState(false);
  useEffect(() => {
    setHasInjected(typeof window !== "undefined" && !!(window as { ethereum?: unknown }).ethereum);
  }, []);

  if (!isConnected) {
    const injectedConnector = connectors.find((c) => c.id === "injected");
    const wcConnector = connectors.find((c) => c.id === "walletConnect");
    const pick = hasInjected ? (injectedConnector ?? wcConnector) : (wcConnector ?? injectedConnector);
    const dead = !hasInjected && !wcConnector;

    return (
      <div className="relative">
        <button
          onClick={() => (dead ? setShowHint((v) => !v) : pick && connect({ connector: pick }))}
          disabled={isPending}
          className="btn btn-gilt"
        >
          {isPending ? "Connecting…" : "Connect"}
        </button>
        {dead && showHint && (
          <div className="absolute right-0 top-full z-40 mt-2 w-72 rounded-xl border border-[var(--edge)] bg-ink p-4 text-left shadow-xl">
            <p className="text-sm text-chalk">No wallet found in this browser.</p>
            <p className="mt-2 text-xs leading-relaxed text-haze">
              Install a wallet extension (Rabby, MetaMask), or open this site inside your wallet
              app&apos;s browser on a phone.
            </p>
          </div>
        )}
      </div>
    );
  }

  const liveChainName = supportedChains.find((c) => c.id === defaultChainId)?.name ?? "the live network";

  if (wrongNetwork) {
    return (
      <button
        onClick={() => switchChain({ chainId: defaultChainId as (typeof supportedChains)[number]["id"] })}
        disabled={isSwitching}
        className="btn btn-gilt"
        title={`Switch to ${liveChainName}`}
      >
        {isSwitching ? "Switching…" : "Wrong network"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="rounded-lg border border-white/10 px-3 py-1.5 font-mono text-sm text-chalk">
        {shortAddress(address)}
      </span>
      <button onClick={() => disconnect()} className="btn btn-ghost" title="Disconnect">
        ×
      </button>
    </div>
  );
}
