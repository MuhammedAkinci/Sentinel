"use client";

import { useMemo } from "react";
import type { Address } from "viem";

import { DashboardHeader } from "~/components/dashboard/DashboardHeader";
import { ActivePositions } from "~/components/dashboard/ActivePositions";
import { LiveEventStream } from "~/components/dashboard/LiveEventStream";
import { AgentReputation } from "~/components/dashboard/AgentReputation";
import { RecentLiquidations } from "~/components/dashboard/RecentLiquidations";
import { DemoControls } from "~/components/dashboard/DemoControls";
import { AgentRoster, AgentDebate, rolesFromEvents } from "~/components/dashboard/AgentDebate";
import { addresses } from "~/lib/env";
import {
  coordinatorAbi,
  lendingPoolAbi,
  reputationAbi,
  splitterAbi,
} from "~/lib/abis";
import { useContractEvents, type SentinelEventKind } from "~/hooks/useContractEvents";

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
    // that a hard refresh after an extended demo session rehydrates the full
    // event arc without needing to replay any transactions.
    bootstrapChunks: 30,
  });

  const activeRoles = useMemo(() => rolesFromEvents(events), [events]);

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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardHeader wssStatus={status} />

      <main className="mx-auto flex w-full max-w-[1480px] flex-col gap-6 px-6 py-8 sm:px-8">
        <AgentRoster activeRoles={activeRoles} />

        <div className="grid gap-6 lg:grid-cols-12">
          <div className="flex flex-col gap-6 lg:col-span-8">
            <ActivePositions extraUsers={liveBorrowers} />
            <AgentDebate events={events} />
            <AgentReputation refreshTick={reputationTick} />
            <RecentLiquidations refreshTick={executedTick} />
            <DemoControls />
          </div>
          <aside className="lg:col-span-4">
            <LiveEventStream events={events} />
          </aside>
        </div>
      </main>
    </div>
  );
}
