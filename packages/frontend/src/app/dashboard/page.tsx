"use client";

import { useCallback, useMemo, useState } from "react";
import type { Address } from "viem";

import { httpClient } from "~/lib/viem";

import { DashboardHeader } from "~/components/dashboard/DashboardHeader";
import { ActivePositions } from "~/components/dashboard/ActivePositions";
import { LiveEventStream } from "~/components/dashboard/LiveEventStream";
import { AgentReputation } from "~/components/dashboard/AgentReputation";
import { RecentLiquidations } from "~/components/dashboard/RecentLiquidations";
import { CaseConsole } from "~/components/dashboard/CaseConsole";
import { AgentRoster, AgentDebate, rolesFromEvents } from "~/components/dashboard/AgentDebate";
import { addresses } from "~/lib/env";
import {
  coordinatorAbi,
  lendingPoolAbi,
  reputationAbi,
  splitterAbi,
} from "~/lib/abis";
import {
  useContractEvents,
  type SentinelEventKind,
  type SentinelLogEntry,
} from "~/hooks/useContractEvents";
import { useCaseLedgerEvents } from "~/hooks/useCaseLedgerEvents";

const COORDINATOR_EVENTS: SentinelEventKind[] = [
  "PositionFlagged",
  "Scored",
  "RouterAdvanced",
  "Routed",
  "Executed",
  "CaseCancelled",
];
const POOL_EVENTS: SentinelEventKind[] = [
  "Deposit",
  "Withdraw",
  "Borrow",
  "Repay",
  "Liquidation",
];
const REPUTATION_EVENTS: SentinelEventKind[] = ["SuccessRecorded", "FailureRecorded"];
const SPLITTER_EVENTS: SentinelEventKind[] = ["Settled", "Claimed"];

export default function DashboardPage() {
  const sources = useMemo(
    () => [
      { address: addresses.coordinator, abi: coordinatorAbi, events: COORDINATOR_EVENTS },
      { address: addresses.pool, abi: lendingPoolAbi, events: POOL_EVENTS },
      { address: addresses.reputation, abi: reputationAbi, events: REPUTATION_EVENTS },
      { address: addresses.splitter, abi: splitterAbi, events: SPLITTER_EVENTS },
    ],
    [],
  );

  const { events, status } = useContractEvents({
    sources,
    buffer: 200,
    // 30 chunks × 1000 blocks = ~30 000 blocks (~3 h on Shannon). Wide enough
    // that a hard refresh after an extended session rehydrates the full
    // event arc without needing to replay any transactions.
    bootstrapChunks: 30,
  });

  // Derive refresh triggers from the unified event stream so the
  // dependent panels re-fetch within the same tick a relevant event
  // lands over WSS. Counting is cheap and the count strictly
  // increases, which makes it a clean useEffect dependency.
  const reputationTick = useMemo(
    () =>
      events.filter(
        (e) => e.kind === "SuccessRecorded" || e.kind === "FailureRecorded",
      ).length,
    [events],
  );
  const executedTick = useMemo(
    () => events.filter((e) => e.kind === "Executed").length,
    [events],
  );

  // Synthesise case lifecycle events directly from Coordinator storage.
  // This source is immune to Shannon's 1000-block eth_getLogs cap, so a
  // hard refresh after a session has been running for hours still
  // shows the full lifecycle of every case the ledger remembers. WSS
  // and HTTP log scans add tx hashes for cases that fire while the page
  // is open; storage iteration carries the rest.
  const { entries: ledgerEvents } = useCaseLedgerEvents(50, executedTick);

  // Merge: real WSS / HTTP-scan entries take precedence over synthetic
  // ones for the same (kind, caseId) pair, since real entries carry a
  // tx hash. Non-case events (Borrow, Settled, SuccessRecorded, ...)
  // come only from the WSS source and pass through unchanged.
  const mergedEvents = useMemo<ReadonlyArray<SentinelLogEntry>>(() => {
    const realCaseKeys = new Set<string>();
    for (const e of events) {
      const caseId = e.args.caseId as bigint | undefined;
      if (caseId !== undefined) realCaseKeys.add(`${e.kind}:${caseId.toString()}`);
    }
    const filteredLedger = ledgerEvents.filter((e) => {
      const caseId = e.args.caseId as bigint | undefined;
      if (caseId === undefined) return true;
      return !realCaseKeys.has(`${e.kind}:${caseId.toString()}`);
    });
    return [...events, ...filteredLedger].sort((a, b) => {
      // Real WSS / HTTP-scan events always rank above ledger-synthesised
      // ones. Synthetic entries use the case's createdAt timestamp as a
      // pseudo blockNumber for stable ordering between themselves, but
      // that value lives in a different numeric range than real chain
      // blocks, so a naive numeric sort would interleave them wrongly.
      const aSynthetic = a.synthetic ?? false;
      const bSynthetic = b.synthetic ?? false;
      if (aSynthetic !== bSynthetic) return aSynthetic ? 1 : -1;
      if (a.blockNumber === b.blockNumber) return b.logIndex - a.logIndex;
      return a.blockNumber > b.blockNumber ? -1 : 1;
    });
  }, [events, ledgerEvents]);

  // High-water mark for the demo stream. Clicking "Reset stream" in
  // the Live Event Stream header records the current head; from that
  // point on we hide every synthetic ledger entry and every real event
  // older than the mark. New events flowing in after the click stay
  // visible. The on-chain state is unaffected - this is a viewer-side
  // filter only.
  const [streamFloor, setStreamFloor] = useState<bigint | null>(null);
  const resetStream = useCallback(async () => {
    const head = await httpClient.getBlockNumber();
    setStreamFloor(head);
  }, []);

  const filteredStream = useMemo<ReadonlyArray<SentinelLogEntry>>(() => {
    if (streamFloor === null) return mergedEvents;
    return mergedEvents.filter((e) => {
      if (e.synthetic) return false;
      return e.blockNumber > streamFloor;
    });
  }, [mergedEvents, streamFloor]);

  const activeRoles = useMemo(() => rolesFromEvents(filteredStream), [filteredStream]);

  // Feed every borrower seen over WSS straight into the active-positions
  // discovery set so a freshly opened position appears without waiting
  // for the next 8-second log re-scan.
  const liveBorrowers = useMemo<ReadonlyArray<Address>>(() => {
    const seen = new Set<Address>();
    for (const event of events) {
      if (event.kind !== "Borrow") continue;
      const user = event.args.user as Address | undefined;
      if (user) seen.add(user);
    }
    return Array.from(seen);
  }, [events]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardHeader wssStatus={status} />

      <main className="mx-auto flex w-full max-w-[1480px] flex-col gap-6 px-6 py-8 sm:px-8">
        <AgentRoster activeRoles={activeRoles} />

        <div className="grid gap-6 lg:grid-cols-12">
          <div className="flex flex-col gap-6 lg:col-span-8">
            <ActivePositions extraUsers={liveBorrowers} />
            <AgentDebate events={filteredStream} />
            <AgentReputation refreshTick={reputationTick} />
            <RecentLiquidations refreshTick={executedTick} />
            <CaseConsole />
          </div>
          <aside className="lg:col-span-4">
            <LiveEventStream
              events={filteredStream}
              onReset={resetStream}
              resetActive={streamFloor !== null}
            />
          </aside>
        </div>
      </main>
    </div>
  );
}
