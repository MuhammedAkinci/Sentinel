import { explorer } from "~/lib/utils";
import { addresses } from "~/lib/env";

const AGENTS = [
  { name: "Watcher", role: "Off-chain WSS listener" },
  { name: "Scorer", role: "Somnia native llm-inference" },
  { name: "Router", role: "Somnia native llm-inference" },
  { name: "Executor", role: "Off-chain transaction submitter" },
];

const CONTRACTS: ReadonlyArray<{ name: string; address: string; description: string }> = [
  { name: "AgentRegistry", address: addresses.registry, description: "Permissionless agent registry" },
  { name: "Reputation", address: addresses.reputation, description: "Per-agent success / failure ledger" },
  { name: "Coordinator", address: addresses.coordinator, description: "On-chain orchestrator" },
  { name: "Splitter", address: addresses.splitter, description: "60 / 30 / 10 pull payment splitter" },
  { name: "LendingPool", address: addresses.pool, description: "Interest-free multi-reserve pool" },
  { name: "AutoProtectionVault", address: addresses.vault, description: "Consumer-side dApp integration" },
];

export function Architecture() {
  return (
    <section id="architecture" className="border-t border-border bg-muted/30">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-16 px-6 py-24 sm:px-10 lg:grid-cols-2">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-primary/80">Agents</p>
          <h3 className="mt-4 text-3xl font-semibold tracking-tight">Four agents, two surfaces.</h3>
          <p className="mt-4 max-w-md text-foreground/70">
            Watcher and Executor live as TypeScript binaries with WSS
            subscriptions - sub-second event detection where latency wins
            liquidations. Scorer and Router run as Somnia native agents
            invoked through validator consensus - verifiable decisions where
            integrity wins trust.
          </p>

          <ul className="mt-10 divide-y divide-border border-y border-border">
            {AGENTS.map((agent) => (
              <li key={agent.name} className="flex items-center justify-between py-4">
                <span className="text-sm font-medium">{agent.name}</span>
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {agent.role}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-primary/80">Contracts</p>
          <h3 className="mt-4 text-3xl font-semibold tracking-tight">
            Deployed on the Somnia testnet.
          </h3>
          <p className="mt-4 max-w-md text-foreground/70">
            Every address below is a public on-chain contract. The Coordinator
            forwards agent payloads to the Somnia platform; the rest of the
            protocol runs as plain Solidity.
          </p>

          <ul className="mt-10 divide-y divide-border border-y border-border">
            {CONTRACTS.map((c) => (
              <li key={c.name} className="flex flex-col gap-1 py-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{c.name}</span>
                  <a
                    href={explorer.address(c.address)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-primary hover:underline"
                  >
                    {c.address.slice(0, 6)}…{c.address.slice(-4)}
                  </a>
                </div>
                <p className="text-xs text-muted-foreground">{c.description}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
