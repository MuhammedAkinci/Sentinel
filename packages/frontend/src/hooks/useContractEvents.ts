"use client";

import { useEffect, useRef, useState } from "react";
import type { Abi, AbiEvent, Log, PublicClient } from "viem";

import { createWssClient, httpClient } from "~/lib/viem";

export type SentinelEventKind =
  | "PositionFlagged"
  | "Scored"
  | "RouterAdvanced"
  | "Routed"
  | "CaseCancelled"
  | "Executed"
  | "Deposit"
  | "Withdraw"
  | "Borrow"
  | "Repay"
  | "Liquidation"
  | "Settled"
  | "Claimed"
  | "SuccessRecorded"
  | "FailureRecorded";

export interface SentinelLogEntry {
  id: string;
  kind: SentinelEventKind;
  blockNumber: bigint;
  txHash: `0x${string}`;
  logIndex: number;
  args: Record<string, unknown>;
  emittedBy: `0x${string}`;
}

export interface EventSource {
  address: `0x${string}`;
  abi: Abi;
  events: readonly SentinelEventKind[];
}

export interface UseContractEventsConfig {
  sources: ReadonlyArray<EventSource>;
  /** Max entries to retain in memory. */
  buffer?: number;
  /** Number of 1000-block chunks to scan on mount (bootstrap). */
  bootstrapChunks?: number;
}

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "error";

const BOOTSTRAP_CHUNK = 1_000n;
const DEFAULT_BUFFER = 200;
// 30 × 1000 = ~30 000 blocks of history. At ~0.4 s/block on Shannon this
// covers roughly three hours - long enough that a hard refresh after an
// extended demo session still rehydrates every previous case's full
// event arc. Windows fire in parallel under a concurrency cap below so
// total wall-clock time stays in single-digit seconds.
const DEFAULT_BOOTSTRAP_CHUNKS = 30;

/**
 * Live event aggregator for Sentinel contracts. On mount it back-fills the
 * stream with the most recent `bootstrapChunks * 1000` blocks (Shannon's
 * eth_getLogs cap is 1000 blocks per call, so we paginate). After that it
 * holds an open WSS subscription and re-subscribes with exponential
 * backoff on disconnect.
 */
export function useContractEvents(config: UseContractEventsConfig): {
  events: ReadonlyArray<SentinelLogEntry>;
  status: ConnectionState;
} {
  const [events, setEvents] = useState<ReadonlyArray<SentinelLogEntry>>([]);
  const [status, setStatus] = useState<ConnectionState>("connecting");

  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    let cancelled = false;
    let backoffMs = 1_000;
    let unwatchAll: Array<() => void> = [];
    let client: PublicClient | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const buffer = configRef.current.buffer ?? DEFAULT_BUFFER;
    const bootstrapChunks = configRef.current.bootstrapChunks ?? DEFAULT_BOOTSTRAP_CHUNKS;

    const push = (entries: SentinelLogEntry[]) => {
      if (entries.length === 0) return;
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        const additions = entries.filter((e) => !seen.has(e.id));
        if (additions.length === 0) return prev;
        // Newest first; cap to buffer.
        const combined = [...additions, ...prev].sort(compareDesc).slice(0, buffer);
        return combined;
      });
    };

    const bootstrap = async () => {
      try {
        const head = await httpClient.getBlockNumber();
        // Build the full (chunk × source × event) work list. Each entry
        // is one self-contained eth_getLogs call that pushes events as
        // soon as it resolves, so a single slow window cannot block the
        // rest of the history from reaching the dashboard.
        const windows: Array<{
          fromBlock: bigint;
          toBlock: bigint;
          source: EventSource;
          eventName: SentinelEventKind;
          eventAbi: AbiEvent;
        }> = [];
        for (let i = 0; i < bootstrapChunks; i += 1) {
          const toBlock = head - BigInt(i) * BOOTSTRAP_CHUNK;
          const fromCandidate = toBlock - BOOTSTRAP_CHUNK + 1n;
          const fromBlock = fromCandidate < 0n ? 0n : fromCandidate;
          for (const source of configRef.current.sources) {
            for (const eventName of source.events) {
              const eventAbi = findEventAbi(source.abi, eventName);
              if (!eventAbi) continue;
              windows.push({ fromBlock, toBlock, source, eventName, eventAbi });
            }
          }
          if (fromBlock === 0n) break;
        }

        // Bound concurrency so Shannon's public RPC does not rate-limit us
        // when the dashboard subscribes to four contracts at once.
        const CONCURRENCY = 8;
        let cursor = 0;
        const worker = async (): Promise<void> => {
          while (!cancelled) {
            const idx = cursor;
            cursor += 1;
            if (idx >= windows.length) return;
            const w = windows[idx]!;
            try {
              const logs = await httpClient.getContractEvents({
                address: w.source.address,
                abi: [w.eventAbi],
                eventName: w.eventAbi.name as string,
                fromBlock: w.fromBlock,
                toBlock: w.toBlock,
              });
              if (cancelled) return;
              const entries: SentinelLogEntry[] = [];
              for (const raw of logs) {
                const entry = toEntry(raw, w.eventName);
                if (entry) entries.push(entry);
              }
              if (entries.length > 0) push(entries);
            } catch {
              // Per-window failure tolerated; next iteration continues.
            }
          }
        };
        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, windows.length) }, () => worker()),
        );
      } catch {
        // Bootstrap failure does not block the WSS subscription.
      }
    };

    const subscribe = () => {
      try {
        client = createWssClient();
        setStatus("connected");
        backoffMs = 1_000;

        for (const source of configRef.current.sources) {
          for (const eventName of source.events) {
            const eventAbi = findEventAbi(source.abi, eventName);
            if (!eventAbi) continue;

            const unwatch = client.watchContractEvent({
              address: source.address,
              abi: [eventAbi],
              eventName: eventAbi.name as string,
              onLogs: (logs) => {
                const entries: SentinelLogEntry[] = [];
                for (const raw of logs) {
                  const entry = toEntry(raw, eventName);
                  if (entry) entries.push(entry);
                }
                push(entries);
              },
              onError: () => scheduleReconnect(),
            });
            unwatchAll.push(unwatch);
          }
        }
      } catch {
        scheduleReconnect();
      }
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      setStatus("reconnecting");
      for (const u of unwatchAll) {
        try {
          u();
        } catch {
          // ignore
        }
      }
      unwatchAll = [];
      client = null;

      const delay = Math.min(backoffMs, 30_000);
      backoffMs *= 2;
      reconnectTimer = setTimeout(() => {
        if (!cancelled) subscribe();
      }, delay);
    };

    // Kick off both flows.
    void bootstrap();
    subscribe();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      for (const u of unwatchAll) {
        try {
          u();
        } catch {
          // ignore
        }
      }
      unwatchAll = [];
    };
  }, []);

  return { events, status };
}

function findEventAbi(abi: Abi, name: string): AbiEvent | undefined {
  return abi.find((item) => item.type === "event" && item.name === name) as AbiEvent | undefined;
}

function toEntry(raw: unknown, eventName: SentinelEventKind): SentinelLogEntry | null {
  const log = raw as Log & {
    args?: Record<string, unknown>;
    eventName?: string;
  };
  const blockNumber = log.blockNumber ?? 0n;
  const logIndex = Number(log.logIndex ?? 0);
  if (!log.transactionHash) return null;
  return {
    id: `${blockNumber.toString()}:${logIndex}`,
    kind: (log.eventName ?? eventName) as SentinelEventKind,
    blockNumber,
    txHash: log.transactionHash as `0x${string}`,
    logIndex,
    args: log.args ?? {},
    emittedBy: log.address as `0x${string}`,
  };
}

function compareDesc(a: SentinelLogEntry, b: SentinelLogEntry): number {
  if (a.blockNumber === b.blockNumber) return b.logIndex - a.logIndex;
  return a.blockNumber > b.blockNumber ? -1 : 1;
}
