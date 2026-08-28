import { createConfig, http, injected } from "wagmi";
import { walletConnect } from "wagmi/connectors";
import { robinhoodMainnet } from "./chains";

// WalletConnect project id (public, not a secret - it ships in the bundle).
// Create one at https://cloud.reown.com and paste it here. With it set,
// phones connect through their wallet app; without it, only browser
// extensions (the injected connector) can connect.
export const WALLETCONNECT_PROJECT_ID = "85e9e96021f9d304144febd342075dbb";

const connectors = [
  injected(),
  ...(WALLETCONNECT_PROJECT_ID
    ? [
        walletConnect({
          projectId: WALLETCONNECT_PROJECT_ID,
          showQrModal: true,
          metadata: {
            name: "Liquid Supply Dollar",
            description: "A dollar that reprices its own supply, with a treasury floor.",
            url: "https://lsd.finance",
            icons: ["https://lsd.finance/icon.svg"],
          },
        }),
      ]
    : []),
];

export const wagmiConfig = createConfig({
  chains: [robinhoodMainnet],
  connectors,
  transports: {
    [robinhoodMainnet.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
