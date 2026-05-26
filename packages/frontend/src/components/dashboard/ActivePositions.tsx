"use client";

import { ArrowUpRight } from "lucide-react";

import { useActivePositions, type Position } from "~/hooks/useActivePositions";
import { formatAmount, formatHealthFactor, shortAddress, explorer } from "~/lib/utils";

function hfColor(hf18: bigint): string {
  if (hf18 >= 10n ** 30n) return "text-muted-foreground";
  const oneFive = 1_500_000_000_000_000_000n;
  const oneOne = 1_100_000_000_000_000_000n;
  if (hf18 >= oneFive) return "text-primary";
  if (hf18 >= oneOne) return "text-foreground";
  return "text-danger";
}

function statusLabel(hf18: bigint): string {
  if (hf18 >= 10n ** 30n) return "No debt";
  const oneE18 = 10n ** 18n;
  const oneOne = (oneE18 * 110n) / 100n;
  if (hf18 < oneE18) return "Liquidatable";
  if (hf18 < oneOne) return "At Risk";
  return "Healthy";
}

export function ActivePositions() {
  const { positions, loading } = useActivePositions();

  return (
    <Panel
      title="Active Positions"
      subtitle="Live readings against LendingPool. Sorted by lowest health factor."
    >
      {loading && positions.length === 0 ? (
        <EmptyState label="Loading positions…" />
      ) : positions.length === 0 ? (
        <EmptyState label="No active positions" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Collateral</th>
                <th className="px-4 py-3 font-medium">Debt</th>
                <th className="px-4 py-3 font-medium text-right">HF</th>
                <th className="px-4 py-3 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {positions.map((p) => (
                <PositionRow key={p.user} p={p} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function PositionRow({ p }: { p: Position }) {
  return (
    <tr className="hover:bg-muted/40">
      <td className="px-4 py-3 font-mono text-xs">
        <a
          href={explorer.address(p.user)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 hover:text-primary"
        >
          {shortAddress(p.user)}
          <ArrowUpRight size={10} />
        </a>
      </td>
      <td className="px-4 py-3 font-mono">
        {formatAmount(p.collateralBalance, p.collateralDecimals)}{" "}
        <span className="text-muted-foreground">{p.collateralSymbol}</span>
      </td>
      <td className="px-4 py-3 font-mono">
        {formatAmount(p.debtBalance, p.debtDecimals)}{" "}
        <span className="text-muted-foreground">{p.debtSymbol}</span>
      </td>
      <td className={`px-4 py-3 text-right font-mono ${hfColor(p.healthFactor18)}`}>
        {formatHealthFactor(p.healthFactor18)}
      </td>
      <td className="px-4 py-3 text-right font-mono text-[11px] uppercase tracking-[0.18em]">
        {statusLabel(p.healthFactor18)}
      </td>
    </tr>
  );
}

export function Panel({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="border border-border bg-background/60">
      <header className="flex items-start justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {subtitle ? (
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {action}
      </header>
      <div>{children}</div>
    </section>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center px-5 py-12 font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
      {label}
    </div>
  );
}
