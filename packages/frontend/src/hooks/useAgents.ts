"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { usePublicClient } from "wagmi";

import { addresses } from "~/lib/env";
import { agentRegistryAbi, reputationAbi } from "~/lib/abis";

export type AgentRole = "None" | "Watcher" | "Scorer" | "Router" | "Executor";

export interface RegisteredAgent {
  id: bigint;
  operator: Address;
  role: AgentRole;
  metadataURI: string;
  active: boolean;
  registeredAt: bigint;
  reputationScore: bigint;
  successes: number;
  failures: number;
}

const ROLE_NAMES: AgentRole[] = ["None", "Watcher", "Scorer", "Router", "Executor"];

/**
 * Reads the AgentRegistry roster plus each agent's Reputation
 * performance counters.
 *
 * @param refreshTick An external trigger (typically a count of recent
 *   Reputation events the dashboard has observed). When this value
 *   changes the hook re-fetches every agent's score so the table
 *   updates within the same tick a SuccessRecorded / FailureRecorded
 *   event lands.
 */
export function useAgents(refreshTick: number = 0): {
  agents: ReadonlyArray<RegisteredAgent>;
  loading: boolean;
} {
  const client = usePublicClient();
  const [agents, setAgents] = useState<ReadonlyArray<RegisteredAgent>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const next = (await client.readContract({
          address: addresses.registry,
          abi: agentRegistryAbi,
          functionName: "nextAgentId",
        })) as bigint;

        const results: RegisteredAgent[] = [];
        for (let id = 1n; id < next; id += 1n) {
          try {
            const agent = (await client.readContract({
              address: addresses.registry,
              abi: agentRegistryAbi,
              functionName: "getAgent",
              args: [id],
            })) as {
              id: bigint;
              operator: Address;
              role: number;
              metadataURI: string;
              active: boolean;
              registeredAt: bigint;
            };
            const perf = (await client.readContract({
              address: addresses.reputation,
              abi: reputationAbi,
              functionName: "performanceOf",
              args: [id],
            })) as {
              successes: bigint;
              failures: bigint;
              score: bigint;
            };
            const roleIndex = agent.role >= 0 && agent.role < ROLE_NAMES.length ? agent.role : 0;
            const roleName = ROLE_NAMES[roleIndex] ?? "None";
            results.push({
              id: agent.id,
              operator: agent.operator,
              role: roleName,
              metadataURI: agent.metadataURI,
              active: agent.active,
              registeredAt: agent.registeredAt,
              reputationScore: perf.score,
              successes: Number(perf.successes),
              failures: Number(perf.failures),
            });
          } catch {
            // skip missing
          }
        }

        if (!cancelled) setAgents(results);
      } catch {
        if (!cancelled) setAgents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, refreshTick]);

  return { agents, loading };
}
