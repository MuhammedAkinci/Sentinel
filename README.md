# Sentinel

Autonomous liquidation and risk network on Somnia. A hybrid of native Somnia
agents (validator-consensus inference) and off-chain runtime processes,
coordinated on-chain through a registry, reputation, and payment-splitting
contract layer.

Built for the **Somnia Agentathon** (May 20 – June 11, 2026, Encode Club).

---

## Architecture

Five logical agents, two execution surfaces.

| Agent     | Where it lives                          | Why                                               |
| --------- | --------------------------------------- | ------------------------------------------------- |
| Watcher   | Off-chain TypeScript (WSS listener)     | Sub-second event detection; would lose the race against MEV bots if it had to wait on validator consensus. |
| Scorer    | Somnia native agent (`createRequest`)   | Verifiable, consensus-backed risk score. The on-chain Response receipt is the trust anchor third parties cite. |
| Router    | Somnia native agent (`createRequest`)   | Same reasoning as Scorer — route selection is the highest-leverage decision and benefits from validator consensus. |
| Executor  | Off-chain TypeScript + on-chain tx      | Milliseconds matter. Async agent invocation cannot win a liquidation race. |
| Splitter  | Plain Solidity (`Splitter.sol`)         | Deterministic, transparent payout — no need for off-chain computation. |

Coordinator orchestrates the flow on-chain: receives a Watcher hint, calls
`SomniaAgents.createRequest` twice (Scorer → Router), emits receipts, and gates
the Executor on the final routing decision.

### Receipts

Two layers of "receipt" — distinguish them carefully when describing the system:

- **On-chain Response**: returned by Somnia's validator subcommittee with
  consensus. Fields: `validator`, `result`, `status`, `receipt` id, `timestamp`,
  `executionCost`. This is the trust-anchor and what Sentinel persists in the
  Coordinator.
- **Off-chain execution trace**: detailed step-by-step log (HTTP calls, LLM
  prompts, value extractions). Stored at `receipts.testnet.agents.somnia.host`
  — currently centralized infrastructure per Somnia docs. Useful for debugging
  and the dashboard but not authoritative.

### Payment split

Profit from each successful liquidation is forwarded to `Splitter.sol`:

- **60%** → agent operators, weighted by reputation
- **30%** → protocol treasury
- **10%** → bounty pool (for community-submitted specialist agents)

---

## Network

Deploy target: **Somnia Shannon Testnet** (chain ID `50312`). Mainnet is out of
scope for the hackathon — all demonstrations run on Shannon.

- HTTP RPC: `https://api.infra.testnet.somnia.network/`
- WSS RPC:  `wss://api.infra.testnet.somnia.network/ws`
- Explorer: `https://shannon-explorer.somnia.network`
- Faucet:   `https://testnet.somnia.network/`

Verified externals (all addresses in [`packages/shared/src/addresses.ts`](packages/shared/src/addresses.ts)):

- Somnia agent platform (Shannon): `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776`
- Protofire ETH/USD feed: `0x604CF5063eC760A78d1C089AA55dFf29B90937f9`
- Protofire BTC/USD feed: `0x3dF17dbaa3BA861D03772b501ADB343B4326C676`
- Protofire USDC/USD feed: `0xA4a08Eb26f85A53d40E3f908B406b2a69B1A2441`

---

## Repository layout

```
sentinel/
├── contracts/                Foundry workspace (Solidity 0.8.28)
│   ├── src/
│   │   ├── interfaces/
│   │   │   ├── somnia/ISomniaAgents.sol    Somnia native platform ABI
│   │   │   └── IAggregatorV3.sol           Chainlink-compatible price feed
│   │   ├── lending/                        Aave-V2-lite pool, sToken, debtToken
│   │   ├── sentinel/                       AgentRegistry, Reputation, Coordinator, Splitter
│   │   └── consumer/                       AutoProtectionVault (demo)
│   ├── script/                             Foundry deployment scripts
│   └── test/                               Foundry tests
├── packages/
│   └── shared/                             Chains, addresses, env validation
└── docs/                                   Architecture notes, open questions
```

`packages/agents/` and `packages/frontend/` will be added when the contracts
they depend on exist. No empty placeholder packages — each one carries real
code on day one.

---

## Toolchain

- Node.js ≥ 22 (developed against v25)
- Foundry (forge ≥ 1.5)
- npm workspaces (no pnpm dependency)

```bash
npm install                  # install workspace dependencies
npm run contracts:build      # forge build
npm run contracts:test       # forge test -vvv
npm run typecheck            # tsc -p across all packages
```

---

## Open questions (do NOT proceed past these without resolving)

1. **Custom agent registration on Somnia.** Public docs only describe the three
   base agents (`json-api-request`, `llm-inference`, `llm-parse-website`).
   The registration path for domain-specific agents (e.g. our Scorer) is not
   publicly documented. Pending answer from Somnia DevRel on Discord.

   Interim approach: Coordinator stores `scorerAgentId` and `routerAgentId` as
   settable parameters. If custom registration is unavailable, both point at
   `llm-inference` with carefully structured prompts. If it is available, swap
   in our custom IDs without touching the contract logic.

2. **Agentathon judging weights.** We assume equal weighting across the four
   public criteria (Functionality, Agent-First Design, Innovation & Technical
   Creativity, Autonomous Performance). The official source page
   (`encode.club/somnia-agentathon`) did not expose detail through public
   scraping — re-verify before final submission.

---

## What's done

- Monorepo skeleton, npm workspaces, strict TS config.
- Foundry workspace with forge-std + OpenZeppelin v5.1.0.
- Solidity interfaces for the Somnia native agent platform and the Chainlink-
  compatible Protofire feeds — sourced verbatim from official docs.
- Shared TS package: Shannon testnet chain config (viem `defineChain`),
  verified contract address constants, and zod-validated environment loaders
  for the watcher / executor / deployer processes.
- `.env.example` covering every variable consumed by `env.ts`.
- **Lending layer (interest-free):**
  - `MintableERC20` — production-grade ERC20 used to bootstrap WETH and USDC
    on Shannon testnet (where canonical deployments are unavailable).
  - `SToken` — pool-controlled, non-rebasing 1:1 receipt token.
  - `PriceOracleAdapter` — wraps Chainlink-compatible feeds, normalizes to
    18-decimal USD, supports a one-way `lockOverrides()` switch so the demo's
    manual price override can be retired before any mainnet deployment.
  - `LendingPool` — multi-reserve, oracle-priced, **no interest accrual**.
    Static debt mapping per (user, asset). Per-reserve LT, liquidation bonus,
    and close factor. Multi-decimal-aware USD math. Full liquidation logic
    with capping when collateral is insufficient.
- **Sentinel layer:**
  - `AgentRegistry` — permissionless agent registration. Each registration
    mints an incrementing ID and records operator, role (Watcher / Scorer /
    Router / Executor), metadata URI, and active status. Only the operator
    that registered an agent may modify or deactivate it.
  - `Reputation` — Coordinator-gated success / failure counters that
    accumulate a clamped-at-zero score. Owner sets the reward / penalty
    constants and rotates the Coordinator address.
  - `Splitter` — pull-payment 60 / 30 / 10 distribution across agents
    (reputation-weighted, equal-split fallback when no scores exist),
    treasury, and a held bounty pool. Asset-agnostic — tracks owed
    balances per (token, account).
  - `Coordinator` — on-chain orchestrator. Watcher flags a position;
    Coordinator submits two real `ISomniaAgents.createRequest` calls
    (Scorer then Router) with on-chain native deposit; callbacks advance
    a state machine (`None → Flagged → Scored → Routed → Executed |
    Cancelled`); Executor runs the liquidation, Coordinator transfers
    seized collateral to the Splitter, and reputation is credited to all
    four participating agents. Scorer and Router agent IDs are split into
    Somnia-native and Sentinel-registry pairs, both owner-settable so we
    can swap between the public `llm-inference` base agent and our own
    custom registered agents without redeploying.
  - `AutoProtectionVault` — minimal third-party consumer that wraps a
    single user's lending position. The vault auto-registers itself as a
    Watcher in its constructor and exposes a permissionless
    `requestSentinelProtection()` that any keeper can call once the
    vault's health factor drops below 1.
- **Deployment script (`script/Deploy.s.sol`):** chain-id-driven branch.
  On Shannon testnet (50312) it seeds initial USD price overrides and
  turns on the public ERC20 faucet for demo convenience; on mainnet
  (5031) it calls the one-way `lockOverrides()` and leaves faucets off.
  `run()` reads configuration from environment variables and writes a
  full address bundle to `./deployments/<chain>.json`; the pure
  `deployAll(DeploymentConfig)` entry is exercised by an in-VM test.
- **Off-chain agent runtime (`packages/agents/`):**
  - `Watcher` — bootstraps in-memory position state by replaying the
    LendingPool event history, subscribes to live deposit / withdraw /
    borrow / repay / liquidation events over WSS, and on a configurable
    poll interval calls `lendingPool.healthFactor` for every active
    borrower. Positions whose HF drops below
    `WATCHER_HEALTH_THRESHOLD` (default 1.05) are flagged through
    `Coordinator.flagPosition`, with a per-user cooldown to prevent
    duplicate flags during a single scoring window. Every revert path
    is simulated first so failures surface as typed errors before
    spending gas.
  - `Executor` — subscribes to the Coordinator's `Routed` event and
    runs `Coordinator.execute(caseId, executorAgentId)`. Wrong-status
    reverts (typically another Executor already settled the case) are
    logged and skipped without halting the loop. Past-but-unsettled
    Routed events are replayed on startup.
  - Both processes share `@sentinel/shared` for chain configuration,
    deployment addresses, and zod-validated env loading. Strict
    TypeScript end to end; no `any` in application code.
- **108 tests passing in total**:
  - 94 Foundry tests (LendingPool 27, AgentRegistry 16, Reputation 8,
    Splitter 13, Coordinator 18, AutoProtectionVault 9, Deploy 3).
    The Coordinator suite covers the full end-to-end flow including
    the real `createRequest` shape (intercepted via `vm.mockCall`
    with selector and agent-ID prefix matching, no mock contract
    deployed) and validator callbacks (delivered via
    `vm.prank(somniaPlatform)`).
  - 14 Vitest tests for the agent runtime
    (PositionTracker 9, HealthMonitor 5).

## What's next

In order:

1. Frontend dashboard.
2. Optional: anvil-fork integration tests for the agent runtime that
   exercise the full Watcher / Coordinator / Executor handshake without
   a live Somnia connection.
