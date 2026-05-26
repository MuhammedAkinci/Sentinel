import { CodeBlock } from "~/components/ui/CodeBlock";

const STEPS: ReadonlyArray<{
  index: string;
  title: string;
  body: string;
  code: string;
}> = [
  {
    index: "01",
    title: "Watcher flags an undercollateralized position",
    body:
      "The off-chain Watcher reads LendingPool state, builds an llm-inference " +
      "prompt that describes the position, and calls flagPosition. The " +
      "Coordinator records the case, attaches the prompt as the request " +
      "payload, and pays the Somnia validator subcommittee deposit.",
    code: `function flagPosition(
    uint256 watcherAgentId,
    address user,
    address collateralAsset,
    address debtAsset,
    bytes calldata scorerPayload
) external nonReentrant returns (uint256 caseId);`,
  },
  {
    index: "02",
    title: "Somnia validators score risk via consensus",
    body:
      "An elected 3-validator subcommittee runs llm-inference against the " +
      "prompt. Validators agree on a single int256 score (clamped 0..10000) " +
      "and the Coordinator's handleScorerResponse callback lands in the next " +
      "second. Below-threshold scores cancel the case without penalty.",
    code: `function handleScorerResponse(
    uint256 requestId,
    Response[] memory responses,
    ResponseStatus status,
    Request memory details
) external;
// emits: Scored(caseId, score)`,
  },
  {
    index: "03",
    title: "Router routes, Executor settles, Splitter distributes",
    body:
      "Any keeper advances the Scored case to Router with a debt-to-cover " +
      "prompt. After consensus, the Executor calls execute() which runs " +
      "LendingPool.liquidate, forwards the seized collateral to the " +
      "Splitter, and credits +100 reputation to all four agents.",
    code: `function advanceToRouter(uint256 caseId, bytes calldata routerPayload) external;
function execute(uint256 caseId, uint256 executorAgentId) external;
// Splitter: 60% agents (reputation-weighted) / 30% treasury / 10% bounty`,
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto w-full max-w-7xl px-6 py-24 sm:px-10">
      <header className="max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-[0.32em] text-primary/80">
          Pipeline
        </p>
        <h2 className="mt-4 text-4xl font-bold tracking-tighter text-foreground sm:text-5xl">
          Three on-chain steps, sub-second consensus.
        </h2>
        <p className="mt-5 max-w-xl text-foreground/70">
          Every transition is an event on-chain. Scoring and routing run on
          Somnia&rsquo;s native validator subcommittee, not on a private bot
          server.
        </p>
      </header>

      <ol className="mt-16 flex flex-col gap-16">
        {STEPS.map((step) => (
          <li key={step.index} className="grid gap-8 md:grid-cols-12 md:gap-12">
            <div className="md:col-span-5">
              <div className="font-mono text-xs uppercase tracking-[0.32em] text-primary">
                Step {step.index}
              </div>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-4 leading-relaxed text-foreground/70">{step.body}</p>
            </div>
            <div className="md:col-span-7">
              <CodeBlock code={step.code} lang="solidity" />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
