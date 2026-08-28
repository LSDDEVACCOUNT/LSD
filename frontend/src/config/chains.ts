import { defineChain } from "viem";

// Robinhood Chain doesn't ship in viem's built-in chain list, so it is
// defined here by hand. Values per NOTICE / the deploy docs.
export const robinhoodMainnet = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Chain Explorer",
      url: "https://robinhoodchain.blockscout.com",
    },
  },
});

export const supportedChains = [robinhoodMainnet] as const;
