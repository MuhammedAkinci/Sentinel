"use client";

import { ReactNode, useState } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RainbowKitProvider,
  darkTheme,
  type Theme,
} from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";

import { wagmiConfig } from "~/lib/wagmi";

const sentinelTheme: Theme = {
  ...darkTheme({
    accentColor: "#00FF88",
    accentColorForeground: "#0A0A0A",
    borderRadius: "small",
    fontStack: "system",
    overlayBlur: "small",
  }),
};

export function Providers({ children }: { children: ReactNode }) {
  // Stable query client across renders.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={sentinelTheme} modalSize="compact" locale="en-US">
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
