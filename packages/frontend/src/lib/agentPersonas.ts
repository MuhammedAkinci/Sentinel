import type { Address } from "viem";

/**
 * Persona profile for each Sentinel agent role. The role determines the
 * voice the dashboard puts into the agent's mouth as on-chain events
 * flow through the Coordinator case ledger.
 */
export type AgentRoleKey = "Watcher" | "Scorer" | "Router" | "Executor";

export interface AgentPersona {
  role: AgentRoleKey;
  callSign: string;
  philosophicalSchool: string;
  tagline: string;
  manifesto: ReadonlyArray<string>;
  accent: string; // hex
  tonics: ReadonlyArray<string>; // short signature phrases
}

export const AGENT_PERSONAS: Record<AgentRoleKey, AgentPersona> = {
  Watcher: {
    role: "Watcher",
    callSign: "ARG-01",
    philosophicalSchool: "Stoic empiricism",
    tagline: "Vigilance is a discipline, not a feeling.",
    manifesto: [
      "I do not interpret positions. I observe drift.",
      "Every borrower writes a story in numbers. I read the page they have already turned.",
      "There is no panic in the ledger. Panic lives in people who refused to look.",
    ],
    accent: "#7DD3FC",
    tonics: ["holding the line.", "no shift undetected.", "the ledger does not blink."],
  },
  Scorer: {
    role: "Scorer",
    callSign: "ARG-02",
    philosophicalSchool: "Bayesian rationalism",
    tagline: "Numbers reveal what humans rationalise.",
    manifesto: [
      "Risk is a distribution, not a verdict. I weigh tails the market forgets.",
      "Below threshold is not absolution. It is a probabilistic abstention.",
      "I do not score the borrower. I score the position. The position has no feelings.",
    ],
    accent: "#FBBF24",
    tonics: [
      "scoring without sentiment.",
      "probability over intuition.",
      "the math is the witness.",
    ],
  },
  Router: {
    role: "Router",
    callSign: "ARG-03",
    philosophicalSchool: "Utilitarian pragmatism",
    tagline: "Liquidate the right amount. Anything else is waste.",
    manifesto: [
      "Too small a close factor wastes the case. Too large destroys the borrower's path back.",
      "I do not pursue maximum profit. I pursue maximum recovery within constraint.",
      "The bonus is not a reward. It is a fee for clearing the system.",
    ],
    accent: "#A78BFA",
    tonics: [
      "the cleanest cut is the right one.",
      "optimum is a calibration, not an aspiration.",
      "carve only what the system needs.",
    ],
  },
  Executor: {
    role: "Executor",
    callSign: "ARG-04",
    philosophicalSchool: "Action-first existentialism",
    tagline: "Decisions die in deliberation.",
    manifesto: [
      "I do not wait for certainty. Certainty is purchased with speed.",
      "The Splitter has no patience for hesitation. Neither do I.",
      "An unexecuted decision is a decision unmade.",
    ],
    accent: "#34D399",
    tonics: ["the case is closed.", "the gas is paid.", "the ledger is settled."],
  },
};

export const AGENT_ROLE_ORDER: ReadonlyArray<AgentRoleKey> = [
  "Watcher",
  "Scorer",
  "Router",
  "Executor",
];

/** Map raw uint8 role index from AgentRegistry to a typed key. */
export function roleKeyFromIndex(index: number): AgentRoleKey | null {
  switch (index) {
    case 1:
      return "Watcher";
    case 2:
      return "Scorer";
    case 3:
      return "Router";
    case 4:
      return "Executor";
    default:
      return null;
  }
}

/** Minimal data shape used by AgentDebate for in-character lines. */
export interface SpokenLine {
  id: string;
  speaker: AgentRoleKey;
  callSign: string;
  message: string;
  caseId?: bigint;
  txHash?: `0x${string}`;
  blockNumber?: bigint;
  /** Wall-clock when generated; for display ordering only. */
  capturedAt: number;
}

/** Format a 0x address into a short identifier used inside lines. */
export function shortUser(addr: Address | undefined): string {
  if (!addr) return "the borrower";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
