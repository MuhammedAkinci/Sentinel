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

- Somnia native agent platform (proxy): `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776`
- Somnia native agent registry (proxy): `0x08D1Fc808f1983d2Ea7B63a28ECD4d8C885Cd02A`
- Protofire ETH/USD feed: `0x604CF5063eC760A78d1C089AA55dFf29B90937f9`
- Protofire BTC/USD feed: `0x3dF17dbaa3BA861D03772b501ADB343B4326C676`
- Protofire USDC/USD feed: `0xA4a08Eb26f85A53d40E3f908B406b2a69B1A2441`

### Live Sentinel deployment on Shannon testnet

Deployed May 2026 from `0x9221b59a01372e0c55Fe72cCd5e7F3982ae2Fd9c`. All
contract pages link to Shannon Explorer.

| Contract | Address |
| --- | --- |
| MintableERC20 WETH | [`0x7d37e2Eca6AbE57d683dfF4c75F503A42d3dA8e2`](https://shannon-explorer.somnia.network/address/0x7d37e2Eca6AbE57d683dfF4c75F503A42d3dA8e2) |
| MintableERC20 USDC | [`0x36d208fF8F7A55d966aE02F3Fcd829A46F3ADf67`](https://shannon-explorer.somnia.network/address/0x36d208fF8F7A55d966aE02F3Fcd829A46F3ADf67) |
| PriceOracleAdapter | [`0x6ac0acd7beD3eF43C38a31d40e7cC279C63E2437`](https://shannon-explorer.somnia.network/address/0x6ac0acd7beD3eF43C38a31d40e7cC279C63E2437) |
| LendingPool | [`0x8d63881b34ed9c2C55862DBbc563555c32F4fF7e`](https://shannon-explorer.somnia.network/address/0x8d63881b34ed9c2C55862DBbc563555c32F4fF7e) |
| sWETH | [`0x5E1a8b28965c2E72E10431cc75127fA5c143C6A1`](https://shannon-explorer.somnia.network/address/0x5E1a8b28965c2E72E10431cc75127fA5c143C6A1) |
| sUSDC | [`0xA0d858BDC0A5ed8f02A21EF6c2EB3Ae4a007f23A`](https://shannon-explorer.somnia.network/address/0xA0d858BDC0A5ed8f02A21EF6c2EB3Ae4a007f23A) |
| AgentRegistry | [`0xb2Cd2a2d058364dC16f5604aB6171E9D6e88d62d`](https://shannon-explorer.somnia.network/address/0xb2Cd2a2d058364dC16f5604aB6171E9D6e88d62d) |
| Reputation | [`0x81c6796d66aA5a0F6810DBF8Aa4a52E48d42aF56`](https://shannon-explorer.somnia.network/address/0x81c6796d66aA5a0F6810DBF8Aa4a52E48d42aF56) |
| Splitter | [`0x8C426852cdF01120222421013Cc5325d4d24446a`](https://shannon-explorer.somnia.network/address/0x8C426852cdF01120222421013Cc5325d4d24446a) |
| Coordinator (v2, current) | [`0x414B08B04e38F2460e3Fb29078fCdD87d8CbAf80`](https://shannon-explorer.somnia.network/address/0x414B08B04e38F2460e3Fb29078fCdD87d8CbAf80) |
| Coordinator (v1, legacy) | [`0x30607df78D484BdD70F3c33285803F21d484E390`](https://shannon-explorer.somnia.network/address/0x30607df78D484BdD70F3c33285803F21d484E390) |
| AutoProtectionVault | [`0xD3fF0Af1F7A806a68fC95711D4D6E85799d4C530`](https://shannon-explorer.somnia.network/address/0xD3fF0Af1F7A806a68fC95711D4D6E85799d4C530) |

Sentinel-side agent registry IDs:

| Role | Agent ID | Operator |
| --- | --- | --- |
| Watcher | 1 | AutoProtectionVault (auto-registered) |
| Watcher | 2 | Deployer |
| Scorer | 3 | Deployer |
| Router | 4 | Deployer |
| Executor | 5 | Deployer |

Somnia native agent IDs wired into the Coordinator:

- `scorerSomniaAgentId = routerSomniaAgentId = 12847293847561029384` (the
  `llm-inference` base agent; both Scorer and Router roles share it,
  differentiated by prompt). See
  [`docs/agents.md`](docs/agents.md) for the base-agent ID lookup.

Smoke test verified on-chain (HF before crash: `1.5`, HF after $1,800 oracle
override: `0.9`). Tx hashes are in
[`deployments/shannon-testnet.json`](contracts/deployments/shannon-testnet.json)
and the broadcast directory at `contracts/broadcast/Deploy.s.sol/50312/`.

### Live end-to-end run against Somnia native agents

The Coordinator v2 invokes the public `llm-inference` base agent (Somnia
agent ID `12847293847561029384`) for both Scorer and Router roles. The
following case ran the full pipeline end to end on Shannon testnet.

**Case 3 — successful liquidation through Somnia validator consensus:**

| Step | Tx | Block | Wall-clock |
| --- | --- | --- | --- |
| `flagPosition` (Watcher → Coordinator → `createRequest`) | [`0xcb47956f...172218f9e`](https://shannon-explorer.somnia.network/tx/0xcb47956f96c6500b4d6f91332ce220f367f75225fc810b39ee9c04d172218f9e) | 387,416,402 | T0 |
| `handleScorerResponse` (Somnia validator → Coordinator) | [`0xa6f4ff08...8e9a6a3b391`](https://shannon-explorer.somnia.network/tx/0xa6f4ff084f6752295afdc776475b6490b3f9ebfb53b256a8a37d38e9a6a3b391) | 387,416,414 | T0 + **1s** |
| `advanceToRouter` (keeper → Coordinator → `createRequest`) | [`0x10323f66...df3900f39`](https://shannon-explorer.somnia.network/tx/0x10323f6651aa53bd1330761f0d4bc067b03964178ef812cc5bfa6b3df3900f39) | 387,417,580 | demo-paced |
| `handleRouterResponse` (Somnia validator → Coordinator) | _next block after advanceToRouter_ | 387,417,5xx | < 1s |
| `execute` (Executor → Coordinator → LendingPool + Splitter) | [`0x18182a22...c1296d71e`](https://shannon-explorer.somnia.network/tx/0x18182a22aff21bad78187ade75d8d528971713ee79f307768c65aacc1296d71e) | 387,418,618 | demo-paced |

**Validator consensus latency on Shannon: 1 second wall-clock for a
3-validator subcommittee to run `llm-inference`, reach consensus, and
deliver the callback transaction to the Coordinator.** Twelve sub-second
blocks elapsed between flagPosition and Scorer callback.

**Case 3 final state, verified on-chain:**

| Field | Value |
| --- | --- |
| status | `4` (Executed) |
| score (from Scorer) | `10000` |
| route.debtToCover (from Router) | `7,500,000,000` (50% close factor of 15k USDC debt) |
| collateralSeized | `4,375,000,000,000,000,000` wei (4.375 WETH) |

The liquidation math holds precisely:

- ETH at $1,800 (override-crashed), USDC at $1
- `7,500 USDC × 1.05 bonus = $7,875` equivalent collateral seized
- `$7,875 / $1,800 = 4.375 WETH` ✓
- Deployer HF before: `0.9`. HF after: `1.0125` (healthy again) ✓

**Splitter distribution of the 4.375 WETH proceeds:**

| Tranche | Share | Amount (WETH) |
| --- | --- | --- |
| Agents (4 × 60% / 4, equal split at score=0) | 60% | 2.625 (0.65625 each) |
| Treasury | 30% | 1.3125 |
| Bounty pool (held) | 10% | 0.4375 |

**Reputation after the case (Coordinator awarded `+100` to each
participating agent):**

| Agent ID | Role | Successes | Failures | Score |
| --- | --- | --- | --- | --- |
| 2 | Watcher (deployer) | 1 | 0 | 100 |
| 3 | Scorer (deployer) | 1 | 3 | 100 |
| 4 | Router (deployer) | 1 | 0 | 100 |
| 5 | Executor (deployer) | 1 | 0 | 100 |

(Scorer's 3 failures are from earlier Cases 1 and 2 where prompt
content did not produce a parseable numeric response from the LLM. The
clamped-at-zero score recovered to 100 on the first successful case.)

The end-to-end demonstration confirms that Sentinel runs autonomously
through Somnia native validator consensus at sub-second per-step
latency. The Coordinator's payload pass-through design accepts any
ABI-shaped prompt the configured agent expects — the current
`llm-inference` `inferNumber(string,string,int256,int256,bool)` schema is
documented in [`docs/agents.md`](docs/agents.md).

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

```
sentinel/
├── contracts/                Foundry workspace (Solidity 0.8.28)
├── packages/
│   ├── agents/               Off-chain Watcher + Executor TypeScript runtime
│   ├── frontend/             Next.js 14 dashboard + landing
│   └── shared/               Chains, addresses, env validation
├── scripts/                  Smoke + Sentinel configuration shell scripts
└── docs/                     Architecture notes, agent wire format
```

---

## Toolchain

- Node.js >= 22 (developed against v25)
- Foundry (forge >= 1.5)
- npm workspaces (no pnpm dependency)

```bash
npm install                  # install workspace dependencies
npm run contracts:build      # forge build
npm run contracts:test       # forge test -vvv
npm run typecheck            # tsc -p across all packages
npm test                     # vitest across off-chain packages
npm run frontend:dev         # next dev (packages/frontend, port 3000)
npm run frontend:build       # next build (verifies the bundle)
```

### Running the off-chain agents

Both agent processes read their configuration from `.env` (see
`.env.example`) and assume the Coordinator + LendingPool addresses are
populated from the deployment script's env-paste block.

```bash
npm run -w @sentinel/agents watcher     # WSS-bootstrapped Watcher loop
npm run -w @sentinel/agents executor    # Routed-event-driven Executor loop
```

The Watcher does three things autonomously:

1. Replays LendingPool events in chunked 1000-block windows (Shannon's
   eth_getLogs cap) to rebuild the active-borrower set on startup.
2. Polls `lendingPool.healthFactor` for every active borrower at
   `WATCHER_POLL_INTERVAL_MS` and calls `Coordinator.flagPosition` with
   a freshly built `inferNumber(...)` Scorer payload whenever a
   position drops below `WATCHER_HEALTH_THRESHOLD`.
3. Subscribes to the Coordinator's `Scored` event over WSS; for every
   case the Watcher itself initiated, it rebuilds the position snapshot
   at Routing time, encodes the Router payload (close-factor-capped),
   and calls `Coordinator.advanceToRouter`.

The Executor subscribes to the `Routed` event and runs
`Coordinator.execute(caseId, executorAgentId)`. Wrong-status reverts
(another Executor settled first) are skipped without halting the loop.

### Frontend

`packages/frontend/` is a Next.js 14 application with two routes:

- `/` — landing page with the FaultyTerminal hero, live metrics pulled
  from the Coordinator, a three-step pipeline explainer with verified
  Solidity snippets, and the on-chain architecture index.
- `/dashboard` — operational dashboard rendering live LendingPool
  positions, an aggregated WSS event stream across Coordinator /
  LendingPool / Reputation / Splitter, agent reputation with bars,
  recent liquidations with flag → execute latency, and a deployer-gated
  Demo Controls panel for recorded demos.

Copy `packages/frontend/.env.local.example` to
`packages/frontend/.env.local` and fill in
`NEXT_PUBLIC_DEPLOYER_ADDRESS` plus any updated SENTINEL_* addresses
when the deployment moves.

### Deploying

Configure `.env` (see `.env.example`) and broadcast the deploy script
against the target network. The script prints both a human-readable
summary and an env-paste-ready block; pipe the latter into `.env.local`
to seed the agent runtimes with the deployed addresses:

```bash
forge script script/Deploy.s.sol \
  --root contracts \
  --rpc-url $SOMNIA_RPC_HTTP \
  --broadcast \
  --slow \
  | tee deployments/last-run.log \
  | grep -E "^SENTINEL_" >> .env.local
```

A canonical `deployments/<chain>.json` is also written by the script
for later programmatic consumption.

---

## Custom agent migration path

Confirmed by Somnia DevRel (May 2026): custom agent registration is not
yet active on the Agentic L1. Sentinel therefore points both the
Scorer and Router agent IDs at the public `llm-inference` base agent,
configured through the prompts defined in
[`docs/agents.md`](docs/agents.md) and built off-chain by the Watcher in
[packages/agents/src/prompts/](packages/agents/src/prompts/).

The Coordinator's `scorerSomniaAgentId` and `routerSomniaAgentId` slots
are owner-settable, so swapping in a custom agent in the future is a
single transaction with no contract upgrade and no Watcher / Executor
binary change.

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
  - `Coordinator` - on-chain orchestrator. A payload pass-through: the
    Watcher constructs the Scorer payload bytes off-chain and the
    Coordinator forwards them verbatim through
    `ISomniaAgents.createRequest`. The Scorer callback transitions the
    case to `Scored` and emits an event; an off-chain keeper (the
    Watcher in our deployment) then calls `advanceToRouter(caseId, routerPayload)`
    to issue the Router request. State machine:
    `None -> Flagged -> Scored -> Routed -> Executed | Cancelled`.
    Executor runs the liquidation, Coordinator transfers seized
    collateral to the Splitter, and reputation is credited to all four
    participating agents. Scorer and Router agent IDs are split into
    Somnia-native and Sentinel-registry pairs, both owner-settable so
    we can swap between the public `llm-inference` base agent and our
    own custom registered agents without redeploying.
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
  - `Watcher` - bootstraps in-memory position state by chunk-replaying
    the LendingPool event history (1000 blocks per call to stay under
    Shannon's eth_getLogs cap), subscribes to live deposit / withdraw /
    borrow / repay / liquidation events over WSS, and on a configurable
    poll interval calls `lendingPool.healthFactor` for every active
    borrower. Positions whose HF drops below
    `WATCHER_HEALTH_THRESHOLD` (default 1.05) are flagged through
    `Coordinator.flagPosition` with a freshly built `inferNumber(...)`
    Scorer payload that encodes a deterministic prompt built from the
    on-chain position snapshot. Per-user cooldown prevents duplicate
    flags during a scoring window. Every revert path is simulated
    first so failures surface as typed errors before spending gas. The
    Watcher also subscribes to the Coordinator's `Scored` event over
    WSS; for every case it initiated, it rebuilds the snapshot at
    Routing time, encodes the close-factor-capped Router payload, and
    calls `Coordinator.advanceToRouter`. The Watcher therefore drives
    the full Flagged -> Scored -> Routed transition autonomously.
  - `Executor` - subscribes to the Coordinator's `Routed` event and
    runs `Coordinator.execute(caseId, executorAgentId)`. Wrong-status
    reverts (typically another Executor already settled the case) are
    logged and skipped without halting the loop. Past-but-unsettled
    Routed events are replayed on startup in 1000-block chunks.
  - `prompts/` - deterministic Scorer and Router prompt builders that
    implement `docs/agents.md` verbatim, a payload encoder that wraps
    them in the `llm-inference` base agent's
    `inferNumber(string,string,int256,int256,bool)` ABI, plus a
    `contextLoader` that pulls reserve config, balances, prices,
    symbols, and the on-chain health factor through viem reads to
    populate the builders' input snapshot. Shared by the Watcher's
    flag path and Router-advance path.
  - Both processes share `@sentinel/shared` for chain configuration,
    deployment addresses, and zod-validated env loading. Strict
    TypeScript end to end; no `any` in application code.
- **126 tests passing in total**:
  - 94 Foundry tests (LendingPool 27, AgentRegistry 16, Reputation 8,
    Splitter 13, Coordinator 18, AutoProtectionVault 9, Deploy 3).
    The Coordinator suite covers the full end-to-end flow including
    the real `createRequest` shape (intercepted via `vm.mockCall`
    with selector and agent-ID prefix matching, no mock contract
    deployed) and validator callbacks (delivered via
    `vm.prank(somniaPlatform)`).
  - 32 Vitest tests for the agent runtime
    (PositionTracker 9, HealthMonitor 5, ScorerPrompt 5, RouterPrompt 5,
    Payload encoder 8 - selector parity, prompt round-trip, close-factor cap).

## Agent specifications

The wire format and prompt templates for both Somnia agents are defined in
[`docs/agents.md`](docs/agents.md). That document is the source of truth
the Coordinator's encode / decode logic mirrors.

In short:

- Scorer receives the encoded position and returns a single
  `uint256` score in `[0, 10_000]`. Below `scoreThreshold` cancels the case
  without penalty; at or above it the Router is invoked.
- Router receives the scored position and returns a single `uint256`
  `debtToCover` denominated in the debt asset's underlying decimals. The
  Coordinator carries `collateralAsset` and `debtAsset` forward from the
  Watcher's original flag.

### Router production roadmap

The Router wire format is deliberately room-to-grow. Each stage below adds
fields to the agent output and a decoder branch on the Coordinator without
altering the `LiquidationRoute` storage layout, the Executor, or the
Splitter:

1. **Today** — output `uint256 debtToCover`. Coordinator constructs the
   route from carried-forward asset choices.
2. **Multi-collateral selection** — output `(uint8 collateralIndex, uint256 debtToCover)`
   so a position with multiple collaterals can have the most liquidatable
   one targeted.
3. **DEX path and slippage budget** — output the full struct
   `(uint8 collateralIndex, uint256 debtToCover, uint8 dexIndex, uint256 minOut, bytes routeHints)`.
   The Executor swaps the seized collateral back to the debt asset through
   the chosen DEX before forwarding to the Splitter.
4. **Multi-protocol orchestration** — output also names a target protocol
   so Sentinel can liquidate positions on third-party lending markets via
   per-protocol adapters registered on the Coordinator.

See [`docs/agents.md`](docs/agents.md) for the prompt templates and the
exact byte layout of each stage.

## What's next

In order:

1. Anvil-fork integration tests for the agent runtime that exercise the
   full Watcher / Coordinator / Executor handshake without a live Somnia
   connection.
2. Router roadmap stage 2 (multi-collateral selection) once the demo flow
   is recorded.
3. Cut over from `llm-inference` to a Sentinel-registered custom agent
   once Somnia opens custom agent registration. Single `setScorerSomniaAgentId` /
   `setRouterSomniaAgentId` transaction, no redeploys.
