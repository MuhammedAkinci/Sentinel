"use client";

import { useMemo } from "react";
import { ArrowUpRight } from "lucide-react";

import {
  AGENT_PERSONAS,
  AGENT_ROLE_ORDER,
  type AgentRoleKey,
} from "~/lib/agentPersonas";
import { linesFromEvents } from "~/lib/agentVoice";
import type { SentinelLogEntry } from "~/hooks/useContractEvents";
import { explorer } from "~/lib/utils";
import { Panel, EmptyState } from "./ActivePositions";
import { AgentAvatar } from "./AgentAvatar";

export function AgentRoster({ activeRoles }: { activeRoles?: ReadonlySet<AgentRoleKey> }) {
  return (
    <Panel
      title="Agent Roster"
      subtitle="Four personalities, one mission. Avatars highlight when the agent is acting on the live stream."
    >
      <div className="grid gap-px bg-border md:grid-cols-2 xl:grid-cols-4">
        {AGENT_ROLE_ORDER.map((role) => (
          <AgentPersonaCard
            key={role}
            role={role}
            active={activeRoles ? activeRoles.has(role) : false}
          />
        ))}
      </div>
    </Panel>
  );
}

function AgentPersonaCard({ role, active }: { role: AgentRoleKey; active: boolean }) {
  const persona = AGENT_PERSONAS[role];
  return (
    <div className="flex h-full flex-col gap-4 bg-background/60 p-5">
      <header className="flex items-start gap-3">
        <AgentAvatar role={role} size={56} active={active} />
        <div className="min-w-0">
          <div
            className="font-mono text-[10px] uppercase tracking-[0.22em]"
            style={{ color: persona.accent }}
          >
            {persona.callSign} {active ? "· active" : "· standby"}
          </div>
          <div className="mt-1 text-sm font-semibold tracking-tight">{persona.role}</div>
          <div className="text-[11px] text-muted-foreground">{persona.philosophicalSchool}</div>
        </div>
      </header>
      <p className="text-sm leading-snug text-foreground/85">{persona.tagline}</p>
      <ul className="space-y-2 text-[12px] leading-relaxed text-muted-foreground">
        {persona.manifesto.map((line) => (
          <li key={line} className="border-l-2 pl-3" style={{ borderColor: persona.accent }}>
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AgentDebate({
  events,
}: {
  events: ReadonlyArray<SentinelLogEntry>;
}) {
  const lines = useMemo(() => linesFromEvents(events).slice(0, 60), [events]);

  return (
    <Panel
      title="Agent Debate"
      subtitle="In-character commentary translated from the Coordinator's on-chain events. Each line is anchored to the transaction that produced it."
    >
      {lines.length === 0 ? (
        <EmptyState label="No event has reached the agents yet." />
      ) : (
        <ul className="max-h-[640px] divide-y divide-border overflow-y-auto">
          {lines.map((line) => {
            const persona = AGENT_PERSONAS[line.speaker];
            return (
              <li
                key={line.id}
                className="animate-shimmer-in respects-motion-pref flex gap-3 px-5 py-4"
              >
                <AgentAvatar role={line.speaker} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="flex items-baseline gap-2">
                      <span
                        className="font-mono text-[10px] uppercase tracking-[0.22em]"
                        style={{ color: persona.accent }}
                      >
                        {persona.callSign}
                      </span>
                      <span className="text-sm font-medium">{persona.role}</span>
                    </div>
                    {line.txHash ? (
                      <a
                        href={explorer.tx(line.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-primary"
                      >
                        {line.txHash.slice(0, 8)}…{line.txHash.slice(-6)}
                        <ArrowUpRight size={10} />
                      </a>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-foreground/90">{line.message}</p>
                  {line.blockNumber ? (
                    <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                      block #{line.blockNumber.toString()}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/** Returns the set of agent roles that have spoken in the latest events,
 *  used to highlight active persona cards in real time. */
export function rolesFromEvents(events: ReadonlyArray<SentinelLogEntry>): Set<AgentRoleKey> {
  const lines = linesFromEvents(events.slice(0, 8));
  const active = new Set<AgentRoleKey>();
  for (const l of lines) active.add(l.speaker);
  return active;
}
