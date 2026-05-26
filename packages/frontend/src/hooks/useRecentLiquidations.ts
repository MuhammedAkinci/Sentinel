"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { usePublicClient } from "wagmi";

import { addresses } from "~/lib/env";
import { coordinatorAbi } from "~/lib/abis";

export interface ExecutedLiquidation {
  caseId: bigint;
  executorAgentId: bigint;
  debtCovered: bigint;
  collateralSeized: bigint;
  user: Address;
  createdAt: bigint;
}

interface UseRecentLiquidationsResult {
  cases: ReadonlyArray<ExecutedLiquidation>;
  loading: boolean;
}

interface OnchainCase {
  id: bigint;
  user: Address;
  collateralAsset: Address;
  debtAsset: Address;
  watcherAgentId: bigint;
  scorerAgentId: bigint;
  routerAgentId: bigint;
  executorAgentId: bigint;
  scoreRequestId: bigint;
  routeRequestId: bigint;
  score: bigint;
  route: { collateralAsset: Address; debtAsset: Address; debtToCover: bigint };
  status: number;
  createdAt: bigint;
  collateralSeized: bigint;
}

const STATUS_EXECUTED = 4;

/**
 * Reads the Coordinator's case ledger directly from storage rather than
 * scanning event logs. Shannon's RPC caps eth_getLogs at 1000 blocks so
 * a deep historical scan is impractical; iterating `getCase(id)` from
 * `nextCaseId - 1` downward is unaffected by that limit.
 */
export function useRecentLiquidations(limit = 10): UseRecentLiquidationsResult {
  const client = usePublicClient();
  const [cases, setCases] = useState<ReadonlyArray<ExecutedLiquidation>>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const next = (await client.readContract({
          address: addresses.coordinator,
          abi: coordinatorAbi,
          functionName: "nextCaseId",
        })) as bigint;

        if (next <= 1n) {
          if (!cancelled) setCases([]);
          return;
        }

        // Walk newest-first until we have `limit` executed cases or
        // exhaust the id range.
        const collected: ExecutedLiquidation[] = [];
        for (let id = next - 1n; id >= 1n && collected.length < limit; id -= 1n) {
          try {
            const c = (await client.readContract({
              address: addresses.coordinator,
              abi: coordinatorAbi,
              functionName: "getCase",
              args: [id],
            })) as OnchainCase;
            if (c.status !== STATUS_EXECUTED) continue;
            collected.push({
              caseId: c.id,
              executorAgentId: c.executorAgentId,
              debtCovered: c.route.debtToCover,
              collateralSeized: c.collateralSeized,
              user: c.user,
              createdAt: c.createdAt,
            });
          } catch {
            // Skip missing cases.
          }
        }

        if (!cancelled) setCases(collected);
      } catch {
        if (!cancelled) setCases([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, tick, limit]);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  return { cases, loading };
}
