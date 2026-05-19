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
  - 27 Foundry tests passing: deposit / withdraw / borrow / repay /
    liquidation happy paths, health-factor math across mixed decimals, every
    documented revert path, oracle override lock, close-factor enforcement.

## What's next

In order:

1. `AgentRegistry.sol` — register / discover specialist agents with metadata.
2. `Reputation.sol` — track per-agent performance (success count, average
   latency) as the basis for the Splitter's reputation-weighted distribution.
3. `Coordinator.sol` — on-chain orchestrator. Wraps
   `SomniaAgents.createRequest` for the Scorer and Router calls, persists the
   consolidated `Response` as the trust-anchor receipt, gates the Executor on
   the final routing decision.
4. `Splitter.sol` — 60% agent operators (reputation-weighted) / 30% treasury
   / 10% bounty pool. Pull payment pattern.
5. `AutoProtectionVault.sol` (consumer dApp) — minimal vault that opens a
   borrow position and pre-invokes Sentinel against itself.
6. `packages/agents/`: WSS-based Watcher, on-chain Executor.
7. Frontend dashboard.
