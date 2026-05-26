import type { Metadata, Viewport } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";

import { Providers } from "./providers";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Sentinel - Autonomous liquidation network on Somnia",
    template: "%s · Sentinel",
  },
  description:
    "Sentinel is an autonomous liquidation and risk network on Somnia's Agentic L1. " +
    "Validator-consensus scoring and routing at sub-second latency.",
  metadataBase: new URL("https://sentinel.ecc"),
  openGraph: {
    title: "Sentinel",
    description:
      "Autonomous liquidation network on Somnia. Watching, never sleeping.",
    siteName: "Sentinel",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
