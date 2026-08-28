import { useAccount } from "wagmi";
import { ADDRESSES, defaultChainId, isConfigured } from "@/config/addresses";

/**
 * Resolves the addresses for the network the app is pointed at.
 *
 * Two different chain ids matter here and conflating them is a trap: the
 * config's chain is what reads go through (they use the app's own RPC
 * transport and work whatever the wallet is doing), while
 * `useAccount().chainId` is the chain the wallet is actually on, which is
 * what writes go through. Only the latter can tell us the user is on the
 * wrong network.
 */
export function useAddresses() {
  const { chainId: walletChainId, isConnected } = useAccount();

  const chainId = defaultChainId;
  const addresses = ADDRESSES[chainId];

  return {
    addresses,
    /** The chain reads are served from, and the chain writes must target. */
    chainId,
    walletChainId,
    /** Wallet is connected but sitting on a network this deployment doesn't serve. */
    wrongNetwork: isConnected && walletChainId !== undefined && walletChainId !== chainId,
    configured: isConfigured(addresses),
  };
}
