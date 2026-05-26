import type { Address } from "viem";
import { formatUnits } from "viem";

import { AGENT_PERSONAS, type AgentRoleKey, shortUser, type SpokenLine } from "./agentPersonas";
import type { SentinelLogEntry } from "~/hooks/useContractEvents";

/** Drop trailing zeros / unused decimal precision so big-int amounts read
 *  naturally in dialogue lines. e.g. 26_250_000_000 / 6dp → "26,250", and
 *  21_201_923_076_923_076_923n / 18dp → "21.2019". */
function formatAmount(raw: bigint, decimals: number, displayDecimals = 4): string {
  const s = formatUnits(raw, decimals);
  const [whole, frac = ""] = s.split(".");
  const grouped = (whole ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (!frac || displayDecimals === 0) return grouped;
  const trimmed = frac.slice(0, displayDecimals).replace(/0+$/, "");
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}

interface VoicedEvent {
  speaker: AgentRoleKey;
  message: string;
}

/**
 * Maps a Sentinel on-chain event to an in-character utterance. Returns
 * an empty array when no agent has anything to say about this event
 * (deduplicated event kinds, agent-irrelevant logs). Multiple lines may
 * be produced for events that naturally involve more than one agent
 * (e.g. Executed triggers reflections from all four).
 */
export function voiceForEvent(event: SentinelLogEntry): VoicedEvent[] {
  const args = event.args;
  const caseId = (args.caseId as bigint | undefined)?.toString();
  const user = args.user as Address | undefined;

  switch (event.kind) {
    case "Borrow": {
      return [
        {
          speaker: "Watcher",
          message: `Borrow detected for ${shortUser(user)}. Baseline recorded; I will watch this position into the unhealthy band.`,
        },
      ];
    }
    case "Deposit": {
      return [
        {
          speaker: "Watcher",
          message: `Collateral added by ${shortUser(user)}. The cushion grows; the discipline does not change.`,
        },
      ];
    }
    case "Repay": {
      return [
        {
          speaker: "Watcher",
          message: `${shortUser(user)} repays. Honest settlement is the ledger's quietest event.`,
        },
      ];
    }
    case "Withdraw": {
      return [
        {
          speaker: "Watcher",
          message: `${shortUser(user)} withdraws collateral. The cushion thins.`,
        },
      ];
    }
    case "Liquidation": {
      return [
        {
          speaker: "Executor",
          message: `Liquidation settled on the LendingPool. The position is reshaped; the bonus is fair compensation for closing the gap.`,
        },
      ];
    }

    case "PositionFlagged": {
      return [
        {
          speaker: "Watcher",
          message: `Position ${shortUser(user)} drifted into the unhealthy band. I forwarded the signal as Case #${caseId ?? "?"}. The math has spoken.`,
        },
      ];
    }
    case "Scored": {
      const score = (args.score as bigint | undefined)?.toString() ?? "?";
      return [
        {
          speaker: "Scorer",
          message: `Case #${caseId ?? "?"} weighed. Score: ${score}. I judge the math, not the borrower.`,
        },
      ];
    }
    case "RouterAdvanced": {
      return [
        {
          speaker: "Router",
          message: `Case #${caseId ?? "?"} reached me. I will route the cleanest cut the system allows.`,
        },
      ];
    }
    case "Routed": {
      const debtRaw = args.debtToCover as bigint | undefined;
      const debt = debtRaw !== undefined ? `${formatAmount(debtRaw, 6)} USDC` : "?";
      return [
        {
          speaker: "Router",
          message: `Optimal cover for Case #${caseId ?? "?"}: ${debt}. Anything more would punish the borrower's recovery.`,
        },
      ];
    }
    case "CaseCancelled": {
      const reasonHex = args.reason as string | undefined;
      const reason = reasonHex ? decodeBytesReason(reasonHex) : "unknown";
      return [
        {
          speaker: "Scorer",
          message: `Case #${caseId ?? "?"} cancelled (${reason}). Abstention is a probabilistic decision, not failure.`,
        },
      ];
    }
    case "Executed": {
      const debtRaw = args.debtCovered as bigint | undefined;
      const seizedRaw = args.collateralSeized as bigint | undefined;
      const debt = debtRaw !== undefined ? `${formatAmount(debtRaw, 6)} USDC` : "?";
      const seized = seizedRaw !== undefined ? `${formatAmount(seizedRaw, 18)} WETH` : "?";
      return [
        {
          speaker: "Executor",
          message: `Case #${caseId ?? "?"} executed. Covered ${debt}, seized ${seized}. The ledger is settled; gas was paid; the case is closed.`,
        },
        {
          speaker: "Router",
          message: `The cut held. Bonus path through the pool's collateral asset. Reputation grows for all who carried this case.`,
        },
      ];
    }

    case "Settled": {
      return [
        {
          speaker: "Executor",
          message: `Splitter notified. Sixty to the agents, thirty to the treasury, ten retained as bounty. The arithmetic is simple. The work was not.`,
        },
      ];
    }
    case "Claimed": {
      return [
        {
          speaker: "Router",
          message: `An agent collected its share. Reputation pays in stable coordination, not promises.`,
        },
      ];
    }
    case "SuccessRecorded": {
      const agentId = (args.agentId as bigint | undefined)?.toString() ?? "?";
      return [
        {
          speaker: "Scorer",
          message: `Reputation +reward for agent #${agentId}. The ledger remembers what humans forget.`,
        },
      ];
    }
    case "FailureRecorded": {
      const agentId = (args.agentId as bigint | undefined)?.toString() ?? "?";
      return [
        {
          speaker: "Scorer",
          message: `Reputation penalty for agent #${agentId}. Below threshold is not failure; non-success is. The distinction matters.`,
        },
      ];
    }
    default:
      return [];
  }
}

/** Convert event entries into spoken lines suitable for the debate panel. */
export function linesFromEvents(events: ReadonlyArray<SentinelLogEntry>): SpokenLine[] {
  const out: SpokenLine[] = [];
  for (const event of events) {
    const voices = voiceForEvent(event);
    voices.forEach((voice, vi) => {
      const persona = AGENT_PERSONAS[voice.speaker];
      const caseId = event.args.caseId as bigint | undefined;
      const line: SpokenLine = {
        id: `${event.id}:${voice.speaker}:${vi}`,
        speaker: voice.speaker,
        callSign: persona.callSign,
        message: voice.message,
        blockNumber: event.blockNumber,
        capturedAt: Date.now(),
      };
      if (event.txHash !== undefined) line.txHash = event.txHash;
      if (caseId !== undefined) line.caseId = caseId;
      out.push(line);
    });
  }
  // Newest first based on block ordering already in `events`.
  return out;
}

function decodeBytesReason(hex: string): string {
  // Try to decode the dynamic bytes returned by Coordinator.CaseCancelled
  // (offset + length + content). Falls back to the raw hex tail.
  try {
    if (!hex.startsWith("0x") || hex.length < 130) return hex.slice(2, 18);
    const lenHex = hex.slice(66, 130);
    const len = parseInt(lenHex, 16);
    if (!Number.isFinite(len) || len === 0 || len > 256) return hex.slice(2, 18);
    const dataHex = hex.slice(130, 130 + len * 2);
    let decoded = "";
    for (let i = 0; i < dataHex.length; i += 2) {
      decoded += String.fromCharCode(parseInt(dataHex.slice(i, i + 2), 16));
    }
    return decoded;
  } catch {
    return "unknown";
  }
}
