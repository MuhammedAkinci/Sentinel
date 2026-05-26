import type { Metadata } from "next";
import Link from "next/link";

import {
  DocsLayout,
  DocsSectionHeading,
  DocsSubheading,
  DocsParagraph,
  DocsCallout,
  type DocsSection,
} from "~/components/docs/DocsLayout";
import { CodeBlock } from "~/components/ui/CodeBlock";
import { Footer } from "~/components/landing/Footer";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "Sentinel documentation: agent roles, on-chain pipeline, wire format, lending layer, splitter math, and how to drive a full case end to end.",
};

const SECTIONS: ReadonlyArray<DocsSection> = [
  { id: "intro", title: "Introduction" },
  {
    id: "architecture",
    title: "Architecture",
    children: [
      { id: "agents", title: "Four agents" },
      { id: "surfaces", title: "Two surfaces" },
    ],
  },
  {
    id: "pipeline",
    title: "Pipeline",
    children: [
      { id: "state-machine", title: "Case state machine" },
      { id: "wire-format", title: "Wire format" },
    ],
  },
  {
    id: "lending",
    title: "Lending layer",
    children: [
      { id: "reserves", title: "Reserves" },
      { id: "liquidation-math", title: "Liquidation math" },
    ],
  },
  { id: "splitter", title: "Splitter" },
  { id: "reputation", title: "Reputation" },
  { id: "run", title: "Drive a case" },
  { id: "faq", title: "FAQ" },
];

export default function DocsPage() {
  return (
    <>
      <DocsLayout sections={SECTIONS}>
        {/* ---------------------------- Intro ---------------------------- */}
        <DocsSectionHeading
          id="intro"
          kicker="Sentinel"
          title="Autonomous liquidation network on the Agentic L1."
          description="Sentinel coordinates four specialised agents around a single on-chain orchestrator. Two of them run as TypeScript binaries where milliseconds win MEV races; the other two run as Somnia native agents where validator consensus wins trust. Every transition lands as an event on chain."
        />

        <DocsCallout tone="primary">
          New to the protocol? Open the{" "}
          <Link href="/dashboard" className="text-primary underline-offset-4 hover:underline">
            dashboard
          </Link>{" "}
          for the live event stream, then drive a full case end to end with
          the deployer-gated Case Console panel.
        </DocsCallout>

        {/* --------------------------- Architecture -------------------------- */}
        <div className="mt-16">
          <DocsSectionHeading
            id="architecture"
            kicker="Layout"
            title="Four agents. Two surfaces."
            description="The split is deliberate. Detection and execution need to win speed races. Scoring and routing need to win trust battles. Sentinel does not collapse those into a single design."
          />

          <DocsSubheading id="agents" title="The four agents" />
          <div className="mt-4 grid gap-px overflow-hidden border border-border bg-border md:grid-cols-2">
            {AGENT_CARDS.map((agent) => (
              <article key={agent.role} className="bg-background/60 p-6">
                <p
                  className="font-mono text-[10px] uppercase tracking-[0.22em]"
                  style={{ color: agent.accent }}
                >
                  {agent.surface}
                </p>
                <h4 className="mt-2 text-lg font-semibold">{agent.role}</h4>
                <p className="mt-2 text-sm leading-relaxed text-foreground/80">
                  {agent.body}
                </p>
              </article>
            ))}
          </div>

          <DocsSubheading id="surfaces" title="Two execution surfaces" />
          <DocsParagraph>
            Off-chain TypeScript binaries handle the latency-sensitive ends of
            the pipeline. The Watcher subscribes to LendingPool events over
            WSS and reacts to a position drifting below its health threshold
            inside a single block. The Executor races every other Executor in
            the network to call <code className="font-mono text-primary">execute(caseId)</code>{" "}
            the moment a case is Routed - whoever lands first earns the
            settlement fees for the operator.
          </DocsParagraph>
          <DocsParagraph>
            Somnia native agents handle the trust-sensitive middle. Scorer
            and Router are invoked through{" "}
            <code className="font-mono text-primary">ISomniaAgents.createRequest</code>; a
            randomly elected three-validator subcommittee runs the inference,
            reaches consensus, and ships the result back as a callback
            transaction. The on-chain Response receipt is the trust anchor
            third parties cite.
          </DocsParagraph>
        </div>

        {/* ---------------------------- Pipeline ---------------------------- */}
        <div className="mt-20">
          <DocsSectionHeading
            id="pipeline"
            kicker="Pipeline"
            title="Five transitions, every one an event."
            description="The Coordinator advances each case through a deterministic state machine. Reaching the next state requires either a validator callback or a permissionless on-chain push - never a private off-chain decision."
          />

          <DocsSubheading id="state-machine" title="Case state machine" />
          <div className="mt-4">
            <CodeBlock
              lang="text"
              code={`None ─► Flagged ─(Scorer callback)► Scored ─(advanceToRouter)► Routed ─(execute)► Executed
                          │
                          └─(below-threshold score or revert)──► Cancelled`}
            />
          </div>
          <DocsParagraph>
            <code className="font-mono text-primary">flagPosition</code> opens
            a case and submits the Scorer prompt to the Somnia platform.
            After validator consensus the{" "}
            <code className="font-mono text-primary">handleScorerResponse</code>{" "}
            callback transitions to{" "}
            <code className="font-mono text-primary">Scored</code> or{" "}
            <code className="font-mono text-primary">Cancelled</code>{" "}
            (low score, agent error, or empty result). Any keeper -
            typically the same Watcher that flagged the position - then
            calls{" "}
            <code className="font-mono text-primary">advanceToRouter</code>{" "}
            to dispatch the Router request. After the Router callback the
            case is <code className="font-mono text-primary">Routed</code>{" "}
            and gated for execution.
          </DocsParagraph>

          <DocsSubheading id="wire-format" title="Wire format" />
          <DocsParagraph>
            The Coordinator is a payload pass-through. Callers build the bytes
            off-chain in the exact shape the configured Somnia base agent
            expects. The agent today is{" "}
            <code className="font-mono text-primary">llm-inference</code>,
            which accepts an{" "}
            <code className="font-mono text-primary">inferNumber(string,string,int256,int256,bool)</code>{" "}
            calldata payload and returns a clamped 32-byte int256.
          </DocsParagraph>
          <div className="mt-4">
            <CodeBlock
              lang="typescript"
              code={`// Scorer payload: range [0, 10000]
encodeInferNumber({
  prompt: buildScorerPrompt(positionSnapshot),
  system: "Return a single integer between minValue and maxValue.",
  minValue: 0n,
  maxValue: 10_000n,
});

// Router payload: range [1, debtBalance * closeFactorBps / 10000]
encodeInferNumber({
  prompt: buildRouterPrompt({ ...positionSnapshot, score }),
  system: "Return a single integer between minValue and maxValue.",
  minValue: 1n,
  maxValue: closeFactorCap,
});`}
            />
          </div>
          <DocsCallout>
            Both responses decode as int256 on the Coordinator and reject
            negatives with{" "}
            <code className="font-mono text-primary">NegativeAgentResponse</code>.
            The full encoder ships with the off-chain agent runtime under{" "}
            <code className="font-mono">packages/agents/src/prompts/payload.ts</code>{" "}
            and is shared between the Watcher and any keeper that calls
            advanceToRouter.
          </DocsCallout>
        </div>

        {/* ---------------------------- Lending ---------------------------- */}
        <div className="mt-20">
          <DocsSectionHeading
            id="lending"
            kicker="Lending"
            title="Aave-V2-lite, interest-free."
            description="Sentinel ships with a minimal lending pool: one collateral reserve, one debt reserve, no interest accrual. Plain Solidity with the same liquidation math production protocols use."
          />

          <DocsSubheading id="reserves" title="Reserves" />
          <DocsParagraph>
            The pool tracks one collateral asset (WETH) and one debt asset
            (USDC) on the deployed testnet instance. Each reserve carries
            its own liquidation threshold, liquidation bonus, and close
            factor. The Coordinator can be re-pointed at additional reserves
            by the protocol owner without redeploying.
          </DocsParagraph>
          <div className="mt-4 overflow-hidden border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Reserve</th>
                  <th className="px-4 py-3 font-medium">Liquidation threshold</th>
                  <th className="px-4 py-3 font-medium">Liquidation bonus</th>
                  <th className="px-4 py-3 font-medium">Close factor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="px-4 py-3 font-mono">WETH</td>
                  <td className="px-4 py-3 font-mono">75%</td>
                  <td className="px-4 py-3 font-mono">5%</td>
                  <td className="px-4 py-3 font-mono">-</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-mono">USDC</td>
                  <td className="px-4 py-3 font-mono">-</td>
                  <td className="px-4 py-3 font-mono">-</td>
                  <td className="px-4 py-3 font-mono">50%</td>
                </tr>
              </tbody>
            </table>
          </div>

          <DocsSubheading id="liquidation-math" title="Liquidation math" />
          <DocsParagraph>
            Health factor is computed against the on-chain oracle:
          </DocsParagraph>
          <div className="mt-4">
            <CodeBlock
              lang="text"
              code={`HF = (collateralValueUSD × LT_bps / 10_000) / debtValueUSD

A position is liquidatable when HF < 1.
The Coordinator's flagPosition reverts above 1 with PositionHealthy(hf).`}
            />
          </div>
          <DocsParagraph>
            A liquidation seizes collateral worth{" "}
            <code className="font-mono text-primary">debtToCover × (1 + bonus)</code>{" "}
            and capped at the borrower&rsquo;s remaining collateral. The Executor
            cannot cover more than{" "}
            <code className="font-mono text-primary">debtBalance × closeFactorBps / 10_000</code>{" "}
            in a single pass - the Router enforces this in its own output
            range, and the LendingPool double-checks it at execute time.
          </DocsParagraph>
        </div>

        {/* ---------------------------- Splitter ---------------------------- */}
        <div className="mt-20">
          <DocsSectionHeading
            id="splitter"
            kicker="Payout"
            title="60 / 30 / 10."
            description="Every successful case routes its seized collateral through a single Splitter contract. The split is deterministic, on-chain, and pull-payment - no off-chain bookkeeping, no escrow contract upgrade path."
          />
          <div className="mt-4 grid gap-px overflow-hidden border border-border bg-border md:grid-cols-3">
            <div className="bg-background/60 p-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">
                60%
              </p>
              <h4 className="mt-2 text-lg font-semibold">Agent operators</h4>
              <p className="mt-2 text-sm leading-relaxed text-foreground/80">
                Split four ways among Watcher, Scorer, Router and Executor of
                the case. Reputation-weighted; equal split when all scores tie.
              </p>
            </div>
            <div className="bg-background/60 p-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground/70">
                30%
              </p>
              <h4 className="mt-2 text-lg font-semibold">Protocol treasury</h4>
              <p className="mt-2 text-sm leading-relaxed text-foreground/80">
                Owned by the AgentRegistry deployer at testnet. Held in the
                Splitter until withdrawn through a pull payment.
              </p>
            </div>
            <div className="bg-background/60 p-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground/70">
                10%
              </p>
              <h4 className="mt-2 text-lg font-semibold">Bounty pool</h4>
              <p className="mt-2 text-sm leading-relaxed text-foreground/80">
                Reserved for community-submitted specialist agents. Held by
                the Splitter; release rules live with the AgentRegistry owner.
              </p>
            </div>
          </div>
          <DocsCallout>
            Splitter is asset-agnostic. The same contract handles WETH today
            and any future debt-token denomination as the protocol grows -
            no Splitter change required to support stage-3 Router output that
            includes a DEX swap path.
          </DocsCallout>
        </div>

        {/* --------------------------- Reputation --------------------------- */}
        <div className="mt-20">
          <DocsSectionHeading
            id="reputation"
            kicker="Trust"
            title="A counter, not a market."
            description="Each agent ID has two counters on the Reputation contract: successes and failures. The score is a clamped affine of the two. The Coordinator is the only writer; every transition that closes a case credits all four participating agents."
          />
          <div className="mt-4">
            <CodeBlock
              lang="solidity"
              code={`function recordSuccess(uint256 agentId) external onlyCoordinator;
function recordFailure(uint256 agentId) external onlyCoordinator;
function performanceOf(uint256 agentId) external view
    returns (uint256 successes, uint256 failures, uint256 score);

// score = max(0, successes * REWARD - failures * PENALTY)`}
            />
          </div>
          <DocsParagraph>
            The Splitter reads the reputation score when distributing the
            agent tranche, weighting payouts toward operators that have
            historically settled cases without faulting. Agents with zero
            score still earn at parity if no other agent has a positive
            score - this seeds the system fairly for new joiners.
          </DocsParagraph>
        </div>

        {/* --------------------------- Drive a case --------------------------- */}
        <div className="mt-20">
          <DocsSectionHeading
            id="run"
            kicker="Try it"
            title="Drive a full case from the console."
            description="The Case Console panel on the dashboard exposes every transition as a single signature. Connect the deployer wallet to unlock the oracle and flag actions; any wallet can deposit, borrow, repay and withdraw."
          />
          <ol className="mt-6 space-y-4 text-sm leading-relaxed text-foreground/85">
            {CASE_STEPS.map((step) => (
              <li key={step.title} className="border-l-2 border-primary/40 bg-muted/30 px-4 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">
                  {step.kicker}
                </p>
                <p className="mt-1 font-semibold text-foreground">{step.title}</p>
                <p className="mt-1 text-foreground/80">{step.body}</p>
              </li>
            ))}
          </ol>
          <DocsCallout tone="primary">
            In the autonomous configuration the Watcher binary observes
            <code className="font-mono"> Scored </code>events directly and calls
            <code className="font-mono"> advanceToRouter </code>without manual intervention.
            The Executor binary watches{" "}
            <code className="font-mono">Routed</code> and races to settle.
            Both processes are shipped under{" "}
            <code className="font-mono">packages/agents</code> in the source tree.
          </DocsCallout>
        </div>

        {/* ------------------------------ FAQ ------------------------------ */}
        <div className="mt-20">
          <DocsSectionHeading
            id="faq"
            kicker="FAQ"
            title="Sharp questions, sharp answers."
          />
          <dl className="mt-6 space-y-6">
            {FAQ_ENTRIES.map((entry) => (
              <div key={entry.q} className="border-b border-border pb-6">
                <dt className="text-base font-semibold text-foreground">{entry.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-foreground/80">{entry.a}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-16 mb-10 border-t border-border pt-8 text-sm text-foreground/60">
          Built on Somnia. Watching, never sleeping.
        </div>
      </DocsLayout>
      <Footer />
    </>
  );
}

const AGENT_CARDS: ReadonlyArray<{
  role: string;
  surface: string;
  body: string;
  accent: string;
}> = [
  {
    role: "Watcher",
    surface: "Off-chain · TypeScript",
    body: "Subscribes to LendingPool events over WSS, mirrors active borrower balances in memory, and polls health factor. When a position drops below threshold it submits the Scorer prompt through flagPosition.",
    accent: "#7DD3FC",
  },
  {
    role: "Scorer",
    surface: "On-chain · Somnia native",
    body: "Receives the position snapshot inside an inferNumber payload and returns a uint256 risk score in [0, 10000]. Below-threshold scores cancel the case without penalty.",
    accent: "#FBBF24",
  },
  {
    role: "Router",
    surface: "On-chain · Somnia native",
    body: "Receives the scored position and returns the debt-to-cover amount in the debt asset's base units. Bounded by the reserve's close-factor cap so the Executor cannot over-liquidate.",
    accent: "#C4B5FD",
  },
  {
    role: "Executor",
    surface: "Off-chain · TypeScript",
    body: "Watches the Coordinator's Routed event and races every other Executor in the network to call execute(caseId). The first transaction in earns the settlement reward for the operator.",
    accent: "#86EFAC",
  },
];

const CASE_STEPS: ReadonlyArray<{ kicker: string; title: string; body: string }> = [
  {
    kicker: "Step 01",
    title: "Open Position",
    body: "Reset the oracle to $3,000, mint 10 WETH from the faucet, deposit, then borrow 15,000 USDC. Five sequential signatures, finishes in seconds.",
  },
  {
    kicker: "Step 02",
    title: "Crash Oracle",
    body: "Drop the WETH oracle to the price that puts the connected wallet's HF at 0.85. Computed from live position state, so it works for any borrower regardless of how much collateral they have accumulated.",
  },
  {
    kicker: "Step 03",
    title: "Trigger flagPosition",
    body: "Submit the Scorer prompt. The Coordinator dispatches a Somnia createRequest; the validator subcommittee callback lands within seconds, transitioning the case to Scored.",
  },
  {
    kicker: "Step 04",
    title: "Advance to Router",
    body: "Push the case forward. The Coordinator dispatches the second createRequest; the Routed callback lands within seconds, locking in the debt-to-cover.",
  },
  {
    kicker: "Step 05",
    title: "Execute",
    body: "Settle the case. LendingPool.liquidate runs, the seized collateral is forwarded to the Splitter, and Reputation credits +100 to all four participating agents.",
  },
  {
    kicker: "Step 06",
    title: "Close Position",
    body: "Clear any leftover debt and withdraw the remaining collateral. The console mints any USDC shortfall from the faucet, approves the pool, repays in full, then withdraws every unit of WETH - up to four signatures, each awaited before the next so the solvency post-check on withdraw always passes.",
  },
  {
    kicker: "Step 07",
    title: "Reset Oracle",
    body: "Restore the WETH price to $3,000 between runs so the next case starts from a clean slate.",
  },
];

const FAQ_ENTRIES: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "Why split agents across two execution surfaces?",
    a: "Detection and execution lose to MEV if they wait for validator consensus. Scoring and routing lose to opaqueness if they run on a private bot server. Sentinel does not collapse those into a single trade-off.",
  },
  {
    q: "Is the Scorer running a real LLM?",
    a: "Yes. Both Scorer and Router point at Somnia's public llm-inference base agent. A randomly elected three-validator subcommittee runs the inference and reaches consensus on the numeric result. Validator latency on the testnet is consistently under three seconds.",
  },
  {
    q: "What happens if a Scorer prompt fails?",
    a: "The Coordinator marks the case Cancelled and records a failure against the configured Scorer Sentinel agent ID. Failures decay the agent's reputation score and reduce its share of future Splitter payouts. No funds are at risk.",
  },
  {
    q: "Can I replace the Watcher or Executor with my own?",
    a: "Yes. Anyone can register a new agent through AgentRegistry, run a binary that subscribes to the relevant events, and race for the settlement reward. The Coordinator gates writes to flagPosition and execute on owned-agent checks but does not whitelist operators.",
  },
  {
    q: "Why hasn't Sentinel registered a custom Somnia agent?",
    a: "Custom agent registration on the Agentic L1 was not open for public use at the time of writing. Sentinel uses the public llm-inference base agent with role-specific prompts; the Coordinator's scorerSomniaAgentId and routerSomniaAgentId slots are owner-settable, so the cutover to a registered custom agent is a single transaction.",
  },
];
