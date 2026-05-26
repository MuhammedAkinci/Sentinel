"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Logo } from "~/components/shared/Logo";
import { WalletButton } from "~/components/shared/WalletButton";
import { NetworkStatus } from "~/components/dashboard/NetworkStatus";
import type { ConnectionState } from "~/hooks/useContractEvents";

export function DashboardHeader({ wssStatus }: { wssStatus: ConnectionState }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1480px] items-center justify-between gap-6 px-6 py-4 sm:px-8">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-3" aria-label="Sentinel home">
            <Logo size={26} />
            <span className="text-sm font-medium tracking-tight">Sentinel</span>
          </Link>
          <span className="font-mono text-xs uppercase tracking-[0.32em] text-muted-foreground">
            Dashboard
          </span>
        </div>

        <NetworkStatus wssStatus={wssStatus} />

        <div className="flex items-center gap-4">
          <a
            href="https://testnet.somnia.network"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-foreground/70 transition-colors hover:text-foreground"
          >
            Faucet <ArrowUpRight size={12} />
          </a>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
