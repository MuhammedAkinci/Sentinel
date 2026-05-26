import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { injectedWallet } from "@rainbow-me/rainbowkit/wallets";
import { somniaShannonTestnet } from "@sentinel/shared/chains";
import { http, createConfig } from "wagmi";

import { env } from "./env";

/**
 * Injected-wallet-only config. Sufficient for any browser-extension
 * wallet (MetaMask, Rabby, Brave, Frame). Mobile WalletConnect QR pairing
 * is intentionally omitted so the build can complete without a
 * WalletConnect Cloud project id; add the WalletConnect connector here
 * once a real id is provisioned.
 */
const projectId = env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "00000000000000000000000000000000";

const connectors = connectorsForWallets(
  [
    {
      groupName: "Wallets",
      wallets: [injectedWallet],
    },
  ],
  {
    appName: "Sentinel",
    projectId,
  },
);

export const wagmiConfig = createConfig({
  chains: [somniaShannonTestnet],
  connectors,
  transports: {
    [somniaShannonTestnet.id]: http(somniaShannonTestnet.rpcUrls.default.http[0]),
  },
  ssr: true,
});

export const supportedChain = somniaShannonTestnet;
