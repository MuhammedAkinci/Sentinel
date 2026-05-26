"use client";

import { ArrowUpRight } from "lucide-react";

import { useAgents } from "~/hooks/useAgents";
import { explorer, shortAddress } from "~/lib/utils";
import { Panel, EmptyState } from "./ActivePositions";

export function AgentReputation({ refreshTick = 0 }: { refreshTick?: number }) {
  const { agents, loading } = useAgents(refreshTick);

  const maxScore = agents.reduce((acc, a) => (a.reputationScore > acc ? a.reputationScore : acc), 0n);

  return (
    <Panel
      title="Agent Reputation"
      subtitle="Per-agent successes and failures. Score = successes × reward − failures × penalty (clamped at zero)."
    >
      {loading && agents.length === 0 ? (
        <EmptyState label="Loading agents…" />
      ) : agents.length === 0 ? (
        <EmptyState label="No agents registered" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Operator</th>
                <th className="px-4 py-3 font-medium text-right">Success</th>
                <th className="px-4 py-3 font-medium text-right">Failure</th>
                <th className="px-4 py-3 font-medium text-right">Score</th>
                <th className="px-4 py-3 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {agents.map((agent) => {
                const pct =
                  maxScore === 0n
                    ? 0
                    : Number((agent.reputationScore * 100n) / (maxScore === 0n ? 1n : maxScore));
                return (
                  <tr key={agent.id.toString()} className="hover:bg-muted/40">
                    <td className="px-4 py-3 font-mono">#{agent.id.toString()}</td>
                    <td className="px-4 py-3">{agent.role}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <a
                        href={explorer.address(agent.operator)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 hover:text-primary"
                      >
                        {shortAddress(agent.operator)} <ArrowUpRight size={10} />
                      </a>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{agent.successes}</td>
                    <td className="px-4 py-3 text-right font-mono">{agent.failures}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-mono">{agent.reputationScore.toString()}</span>
                        <div
                          aria-hidden="true"
                          className="h-px w-24 bg-muted-foreground/20"
                        >
                          <div
                            className="h-px bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[11px] uppercase tracking-[0.18em]">
                      {agent.active ? "active" : "inactive"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
