import { defineChain } from "viem";

/**
 * Somnia Shannon Testnet.
 * Source: docs.somnia.network/developer/network-info
 * - Chain ID: 50312
 * - Native token: STT (test-only, no real value)
 * - Finality: sub-second
 */
export const somniaShannonTestnet = defineChain({
  id: 50_312,
  name: "Somnia Shannon Testnet",
  nativeCurrency: { name: "Somnia Test Token", symbol: "STT", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://api.infra.testnet.somnia.network/"],
      webSocket: ["wss://api.infra.testnet.somnia.network/ws"],
    },
  },
  blockExplorers: {
    default: {
      name: "Shannon Explorer",
      url: "https://shannon-explorer.somnia.network",
    },
  },
  testnet: true,
});

/**
 * Somnia Mainnet (5031). Defined for completeness; Sentinel deploys against the
 * Shannon testnet during the Agentathon.
 */
export const somniaMainnet = defineChain({
  id: 5_031,
  name: "Somnia Mainnet",
  nativeCurrency: { name: "Somnia", symbol: "SOMI", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://api.infra.mainnet.somnia.network/"],
      webSocket: ["wss://api.infra.mainnet.somnia.network/ws"],
    },
  },
  blockExplorers: {
    default: {
      name: "Somnia Explorer",
      url: "https://explorer.somnia.network",
    },
  },
});

export type SomniaChain = typeof somniaShannonTestnet | typeof somniaMainnet;
