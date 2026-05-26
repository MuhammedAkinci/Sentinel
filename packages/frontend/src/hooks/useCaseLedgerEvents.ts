"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { usePublicClient } from "wagmi";

import { addresses } from "~/lib/env";
import { coordinatorAbi } from "~/lib/abis";
import type { SentinelLogEntry } from "./useContractEvents";

const STATUS_FLAGGED = 1;
const STATUS_SCORED = 2;
const STATUS_ROUTED = 3;
const STATUS_EXECUTED = 4;
const STATUS_CANCELLED = 5;

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

/**
 * Reads the most recent N cases from the Coordinator's storage and
 * synthesises the lifecycle events each case has reached. The output
 * shape matches the WSS-derived SentinelLogEntry stream so the
 * dashboard's downstream panels can consume either source uniformly.
 *
 * This is the canonical history source: it survives the public RPC's
 * 1000-block eth_getLogs cap, populates instantly on refresh, and
 * carries arbitrarily old cases as long as the case ledger remembers
 * them. Synthetic entries omit txHash; the dashboard's WSS subscription
 * fills that in for cases that fire while the page is open.
 *
 * @param limit How many recent cases to walk. The Coordinator stores
 *   one case per id from `1..nextCaseId-1`, so this is also the max
 *   number of lifecycle slices the hook will emit.
 * @param refreshTick External trigger (the dashboard's count of
 *   case-related events on the live stream) so the hook re-reads
 *   storage the moment a new case lifecycle event arrives.
 */
export function useCaseLedgerEvents(
  limit = 50,
  refreshTick = 0,
): {
  entries: ReadonlyArray<SentinelLogEntry>;
  loading: boolean;
} {
  const client = usePublicClient();
  const [entries, setEntries] = useState<ReadonlyArray<SentinelLogEntry>>([]);
  const [loading, setLoading] = useState(true);

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
          if (!cancelled) setEntries([]);
          return;
        }

        const cases: OnchainCase[] = [];
        for (let id = next - 1n; id >= 1n && cases.length < limit; id -= 1n) {
          try {
            const c = (await client.readContract({
              address: addresses.coordinator,
              abi: coordinatorAbi,
              functionName: "getCase",
              args: [id],
            })) as OnchainCase;
            cases.push(c);
          } catch {
            // Missing case id - skip and keep walking.
          }
        }

        if (cancelled) return;
        const synthesised: SentinelLogEntry[] = [];
        for (const c of cases) synthesised.push(...synthesiseCase(c));
        setEntries(synthesised);
      } catch {
        if (!cancelled) setEntries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, limit, refreshTick]);

  return { entries, loading };
}

/**
 * Build the event log entries for a single case based on the status it
 * has reached. The Coordinator emits PositionFlagged at flag time and
 * an additional event for each transition (Scored, RouterAdvanced,
 * Routed, Executed, CaseCancelled) - storage tells us exactly which
 * transitions happened.
 *
 * Each synthesised entry carries `synthetic: true` and omits txHash so
 * downstream consumers can render a non-link fallback. blockNumber is
 * approximated from the case's createdAt timestamp - good enough for
 * sort ordering and "block #N" labels in the live stream UI.
 */
function synthesiseCase(c: OnchainCase): SentinelLogEntry[] {
  const out: SentinelLogEntry[] = [];
  const baseBlock = c.createdAt;
  let bumpIndex = 0;
  const push = (
    kind: SentinelLogEntry["kind"],
    args: Record<string, unknown>,
  ) => {
    bumpIndex += 1;
    out.push({
      id: `synthetic:${c.id.toString()}:${kind}`,
      kind,
      blockNumber: baseBlock + BigInt(bumpIndex),
      logIndex: bumpIndex,
      args,
      emittedBy: addresses.coordinator,
      synthetic: true,
    });
  };

  // Status >= Flagged means the case opened.
  if (c.status >= STATUS_FLAGGED) {
    push("PositionFlagged", {
      caseId: c.id,
      user: c.user,
      watcherAgentId: c.watcherAgentId,
      scoreRequestId: c.scoreRequestId,
    });
  }

  if (c.status >= STATUS_SCORED) {
    push("Scored", {
      caseId: c.id,
      score: c.score,
    });
  }

  if (c.status >= STATUS_ROUTED) {
    push("RouterAdvanced", {
      caseId: c.id,
      routeRequestId: c.routeRequestId,
    });
    push("Routed", {
      caseId: c.id,
      collateralAsset: c.route.collateralAsset,
      debtAsset: c.route.debtAsset,
      debtToCover: c.route.debtToCover,
    });
  }

  if (c.status === STATUS_EXECUTED) {
    push("Executed", {
      caseId: c.id,
      executorAgentId: c.executorAgentId,
      debtCovered: c.route.debtToCover,
      collateralSeized: c.collateralSeized,
    });
  }

  if (c.status === STATUS_CANCELLED) {
    push("CaseCancelled", {
      caseId: c.id,
      // Reason byte string is not stored on chain post-emit, so omit
      // here. The voice layer falls back to "unknown" gracefully.
      reason: undefined,
    });
  }

  return out;
}
