"use client";

import { ArrowUpRight } from "lucide-react";

import { useRecentLiquidations } from "~/hooks/useRecentLiquidations";
import { explorer, formatAmount, formatTimeAgo, shortAddress } from "~/lib/utils";
import { Panel, EmptyState } from "./ActivePositions";

export function RecentLiquidations() {
  const { cases, loading } = useRecentLiquidations(10);

  return (
    <Panel
      title="Recent Liquidations"
      subtitle="Reads the Coordinator case ledger directly. Executed cases only, newest first."
    >
      {loading && cases.length === 0 ? (
        <EmptyState label="Loading liquidations..." />
      ) : cases.length === 0 ? (
        <EmptyState label="No executed cases yet" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                <th className="px-4 py-3 font-medium">Case</th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium text-right">Debt covered</th>
                <th className="px-4 py-3 font-medium text-right">Collateral seized</th>
                <th className="px-4 py-3 font-medium text-right">Flagged</th>
                <th className="px-4 py-3 font-medium text-right">Explorer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cases.map((c) => (
                <tr key={c.caseId.toString()} className="hover:bg-muted/40">
                  <td className="px-4 py-3 font-mono">#{c.caseId.toString()}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    <a
                      href={explorer.address(c.user)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 hover:text-primary"
                    >
                      {shortAddress(c.user)} <ArrowUpRight size={10} />
                    </a>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatAmount(c.debtCovered, 6)}{" "}
                    <span className="text-muted-foreground">USDC</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatAmount(c.collateralSeized, 18)}{" "}
                    <span className="text-muted-foreground">WETH</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {formatTimeAgo(Number(c.createdAt))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={explorer.address(c.user)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-primary"
                    >
                      view <ArrowUpRight size={10} />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
