"use client";

import { ArrowUpRight } from "lucide-react";

import type { SentinelLogEntry } from "~/hooks/useContractEvents";
import { explorer, formatAmount, shortAddress } from "~/lib/utils";
import { Panel, EmptyState } from "./ActivePositions";

const TAG_STYLES: Record<string, string> = {
  PositionFlagged: "border-foreground/30 text-foreground",
  Scored: "border-primary/40 text-primary",
  RouterAdvanced: "border-primary/40 text-primary",
  Routed: "border-primary/40 text-primary",
  Executed: "border-primary bg-primary/10 text-primary",
  CaseCancelled: "border-danger/40 text-danger",
  Deposit: "border-foreground/20 text-foreground/70",
  Withdraw: "border-foreground/20 text-foreground/70",
  Borrow: "border-foreground/30 text-foreground",
  Repay: "border-foreground/20 text-foreground/70",
  Liquidation: "border-primary bg-primary/10 text-primary",
  Settled: "border-primary/40 text-primary",
  Claimed: "border-foreground/20 text-foreground/70",
  SuccessRecorded: "border-foreground/20 text-foreground/70",
  FailureRecorded: "border-danger/40 text-danger",
};

function describeArgs(kind: string, args: Record<string, unknown>): string {
  switch (kind) {
    case "PositionFlagged": {
      const caseId = args.caseId as bigint | undefined;
      const user = args.user as `0x${string}` | undefined;
      return `Case #${caseId?.toString() ?? "?"} · ${shortAddress(user ?? null)}`;
    }
    case "Scored": {
      const caseId = args.caseId as bigint | undefined;
      const score = args.score as bigint | undefined;
      return `Case #${caseId?.toString() ?? "?"} · score=${score?.toString() ?? "?"}`;
    }
    case "RouterAdvanced": {
      const caseId = args.caseId as bigint | undefined;
      const routeRequestId = args.routeRequestId as bigint | undefined;
      return `Case #${caseId?.toString() ?? "?"} · reqId=${routeRequestId?.toString() ?? "?"}`;
    }
    case "Routed": {
      const caseId = args.caseId as bigint | undefined;
      const debtToCover = args.debtToCover as bigint | undefined;
      const debt =
        debtToCover !== undefined ? `${formatAmount(debtToCover, 6)} USDC` : "?";
      return `Case #${caseId?.toString() ?? "?"} · debtToCover=${debt}`;
    }
    case "Executed": {
      const caseId = args.caseId as bigint | undefined;
      const collateralSeized = args.collateralSeized as bigint | undefined;
      const seized =
        collateralSeized !== undefined
          ? `${formatAmount(collateralSeized, 18)} WETH`
          : "?";
      return `Case #${caseId?.toString() ?? "?"} · seized=${seized}`;
    }
    case "CaseCancelled": {
      const caseId = args.caseId as bigint | undefined;
      return `Case #${caseId?.toString() ?? "?"}`;
    }
    case "Liquidation": {
      const user = args.user as `0x${string}` | undefined;
      return `${shortAddress(user ?? null)}`;
    }
    case "Borrow": {
      const user = args.user as `0x${string}` | undefined;
      const asset = args.asset as `0x${string}` | undefined;
      const amount = args.amount as bigint | undefined;
      // The pool's only borrowable reserve is USDC (6 decimals). Fall
      // back to a raw render if the asset address does not match.
      const amountStr = amount !== undefined ? formatAmount(amount, 6) : "?";
      return `${shortAddress(user ?? null)} · borrow ${amountStr}${asset ? " " : ""}${asset ? "USDC" : ""}`;
    }
    case "Deposit":
    case "Repay":
    case "Withdraw": {
      const user = args.user as `0x${string}` | undefined;
      // Deposit / Withdraw use 18-dec WETH, Repay uses 6-dec USDC. The
      // distinct labels in the per-row badge make the asset clear.
      const amount = args.amount as bigint | undefined;
      if (amount === undefined) return shortAddress(user ?? null);
      const decimals = kind === "Repay" ? 6 : 18;
      const symbol = kind === "Repay" ? "USDC" : "WETH";
      return `${shortAddress(user ?? null)} · ${formatAmount(amount, decimals)} ${symbol}`;
    }
    case "Settled": {
      const amount = args.amount as bigint | undefined;
      // Splitter is asset-agnostic but the current pool only seizes
      // WETH, so render against 18 decimals.
      return amount !== undefined
        ? `${formatAmount(amount, 18)} WETH`
        : "—";
    }
    case "SuccessRecorded":
    case "FailureRecorded": {
      const agentId = args.agentId as bigint | undefined;
      return `Agent #${agentId?.toString() ?? "?"}`;
    }
    default: {
      const keys = Object.keys(args).slice(0, 2);
      if (keys.length === 0) return "";
      return keys.map((k) => `${k}=${String(args[k]).slice(0, 24)}`).join(" · ");
    }
  }
}

export function LiveEventStream({ events }: { events: ReadonlyArray<SentinelLogEntry> }) {
  return (
    <Panel
      title="Live Event Stream"
      subtitle="Coordinator, LendingPool, Reputation, Splitter - all over WSS."
    >
      {events.length === 0 ? (
        <EmptyState label="Awaiting events…" />
      ) : (
        <ul className="max-h-[640px] divide-y divide-border overflow-y-auto">
          {events.map((event) => (
            <li
              key={event.id}
              className="animate-shimmer-in respects-motion-pref px-5 py-3 hover:bg-muted/40"
            >
              <div className="flex items-center justify-between gap-3">
                <span
                  className={[
                    "inline-flex items-center border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em]",
                    TAG_STYLES[event.kind] ?? "border-foreground/20 text-foreground/70",
                  ].join(" ")}
                >
                  {event.kind}
                </span>
                {event.txHash ? (
                  <a
                    href={explorer.tx(event.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-primary"
                  >
                    {event.txHash.slice(0, 8)}…{event.txHash.slice(-6)}
                    <ArrowUpRight size={10} />
                  </a>
                ) : (
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                    ledger
                  </span>
                )}
              </div>
              <div className="mt-1 font-mono text-xs text-foreground/80">
                {describeArgs(event.kind, event.args)}
              </div>
              <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                {event.synthetic ? "case ledger" : `block #${event.blockNumber.toString()}`}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
