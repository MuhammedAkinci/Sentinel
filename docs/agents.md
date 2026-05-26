# Sentinel agent specifications

This document defines the **on-chain wire format** and **prompt contract** for
the two Somnia native agents Sentinel invokes per case: the **Scorer** and the
**Router**. It is the source of truth that the Coordinator's encode/decode
logic, the prompt files supplied to `llm-inference`, and the off-chain
validation step all derive from.

Both agents are invoked through `ISomniaAgents.createRequest`. The Coordinator
sets the `agentId` of each agent at deploy time via
`setScorerSomniaAgentId` / `setRouterSomniaAgentId`, so the same on-chain
Coordinator can swap between the public `llm-inference` base agent and any
domain-specific agents we register in the future without contract upgrades.

As of May 2026 Somnia DevRel has confirmed that custom agent registration is
not yet open. Sentinel therefore points both agent IDs at the public
`llm-inference` base agent and supplies the agent-specific behaviour through
prompt configuration.

### Base agent IDs on Shannon testnet

Decoded from the official AgentRegistry at
`0x08D1Fc808f1983d2Ea7B63a28ECD4d8C885Cd02A` via `getAllAgents()` and
`getAgent(uint256)`:

| Agent name        | Hex ID                | Decimal ID            |
| ----------------- | --------------------- | --------------------- |
| llm-inference     | `0xb24ac1afbcefc708`  | `12847293847561029384`|
| llm-parse-website | `0xb2ae9d1f35cc82fd`  | `12875401142070969085`|
| json-fetch        | `0xb6d47da8dbbcb1b1`  | `13174292974160097713`|

Sentinel sets `SCORER_AGENT_ID = ROUTER_AGENT_ID = 12847293847561029384` in
`.env`, then the Coordinator's `setScorerSomniaAgentId` and
`setRouterSomniaAgentId` route both roles into the same `llm-inference`
agent with role-specific prompts.

---

## Wire format

The Coordinator is a payload pass-through: callers (the Watcher for the
Scorer, and any keeper for the Router) build the bytes off-chain and the
Coordinator forwards them verbatim to the configured Somnia base agent
through `createRequest`. The decoders on the response side are
deliberately tight; any deviation from the exact byte length aborts the
case with `InvalidScorePayload` or `InvalidRoutePayload`.

| Agent  | Payload (caller → Coordinator → agent)                                                       | Result (agent → Coordinator)                  |
| ------ | -------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Scorer | `inferNumber(string prompt, string system, int256 0, int256 10000, bool false)` calldata     | `abi.encode(int256 score)` — 32 bytes; negatives revert |
| Router | `inferNumber(string prompt, string system, int256 1, int256 closeFactorCap, bool false)` calldata | `abi.encode(int256 debtToCover)` — 32 bytes; negatives revert |

Both responses are a single `int256` clamped by the agent into the range
declared in the payload. The Coordinator decodes as `int256`, rejects
negatives with `NegativeAgentResponse`, then casts to `uint256` for
business logic. This matches `llm-inference`'s clamped-numeric output
mode, which is the only structured output shape we can rely on from a
base agent today.

The selector for both payloads is
`keccak256("inferNumber(string,string,int256,int256,bool)")[:4]`. The
encoder lives in [packages/agents/src/prompts/payload.ts](../packages/agents/src/prompts/payload.ts)
and is shared between the Watcher (for the Scorer flag) and any keeper
that calls `advanceToRouter` (typically the same Watcher node).

The Coordinator carries `collateralAsset` and `debtAsset` forward from the
Watcher's original `flagPosition` call. Today's Router only chooses
`debtToCover`; the `LiquidationRoute` struct in the Case stays unchanged so a
future Router that returns collateral choice, DEX path, or slippage budget
can be wired in by extending the decoder without touching storage or the
Executor.

---

## Scorer

The Scorer assigns a liquidation priority between `0` and `10_000`.

### Inputs supplied in the payload

- `user` — the borrower under evaluation.
- `collateralAsset` — the asset proposed for seizure.
- `debtAsset` — the asset whose debt would be repaid.
- `healthFactor18` — the position's on-chain HF at flag time, scaled to 1e18.

The prompt template additionally surfaces market context that the Scorer
needs but is too heavy to ship as raw payload bytes (the prompt builder
reads these from the Coordinator's view functions at request time):

- Reserve LT, liquidation bonus, close factor.
- Collateral and debt balances of the user.
- Current price of each asset in USD.
- Adjusted collateral value (`bal × price × LT`) and total debt value.

### Score interpretation

- `< scoreThreshold` (default `5_000`): case cancelled at the Scorer
  callback. No Router invocation, no Executor work. The Scorer is NOT
  penalised — a low score is a legitimate finding.
- `>= scoreThreshold`: case advances to Routing.

The threshold is owner-settable via `Coordinator.setScoreThreshold`.

### Prompt template

```text
You are Sentinel's risk Scorer. Your job is to assess whether the
following lending position should be prioritised for immediate
liquidation, on a 0..10000 scale.

Inputs (already validated on-chain):
  user:                   {user}
  collateralAsset:        {collateralAsset}   ({collateralSymbol})
  collateralBalance:      {collateralBalanceHuman}
  collateralPriceUSD:     {collateralPriceUSDHuman}
  collateralValueUSD:     {collateralValueUSDHuman}
  reserveLiqThresholdBps: {ltBps}
  adjustedCollateralUSD:  {adjustedCollateralUSDHuman}

  debtAsset:              {debtAsset}        ({debtSymbol})
  debtBalance:            {debtBalanceHuman}
  debtPriceUSD:           {debtPriceUSDHuman}
  debtValueUSD:           {debtValueUSDHuman}

  healthFactor:           {hfHuman}
  liquidationBonusBps:    {lbBps}
  closeFactorBps:         {cfBps}

Score guidance:
  - 0 means do not liquidate. Below 5000 cancels the case.
  - 10000 means liquidate immediately at full close factor.
  - Use HF as the dominant signal: HF below 0.9 should score above 8000;
    HF in (0.9, 1.0) should score 6000..8500; HF above 1.0 indicates the
    position is no longer liquidatable on-chain and should score 0.
  - Penalise small positions (debtValueUSD below 100): cap at 3000 so
    Sentinel does not pay agent rewards out of dust.
  - Penalise very thin collateral cushions (adjusted/debt below 1.02) by
    scoring slightly higher (+500) because price recovery is unlikely
    to save them before consensus completes.

Return a single ABI-encoded uint256 between 0 and 10000.
```

`llm-inference` is configured with a fixed random seed and temperature 0 so
the validator subcommittee converges on a deterministic score.

---

## Router

The Router chooses how much debt the Executor should cover within the
reserve's close factor.

### Inputs supplied in the payload

- `user`, `collateralAsset`, `debtAsset` — already known to the Coordinator
  but mirrored so the agent's prompt is self-contained.
- `score` — the Scorer's output, 0..10_000.
- `currentHF18` — the position's HF at Routing time. Coordinator re-reads
  this between the two agent calls; the price may have moved during the
  Scorer's consensus window.

### Output

`abi.encode(uint256 debtToCover)`, denominated in the **debt asset's
underlying decimals** (so 7_500 USDC is encoded as `7_500_000_000`).

The Coordinator enforces `debtToCover <= userDebt × closeFactorBps / 10_000`
on the Executor path; values above the cap revert at execute time with
`CloseFactorExceeded`. The Router should always stay strictly inside this
cap.

### Prompt template

```text
You are Sentinel's route selector. The Scorer has cleared this position
for liquidation. Decide how much of the user's debt to repay in this pass.

Inputs (already validated on-chain):
  user:                   {user}
  debtAsset:              {debtAsset}        ({debtSymbol})
  debtBalance:            {debtBalanceRaw} (underlying base units)
  debtBalanceHuman:       {debtBalanceHuman}
  closeFactorBps:         {cfBps}            (max share per pass)

  collateralAsset:        {collateralAsset}  ({collateralSymbol})
  collateralBalanceHuman: {collateralBalanceHuman}
  collateralPriceUSD:     {collateralPriceUSDHuman}
  liquidationBonusBps:    {lbBps}

  scorerOutput:           {score}            (0..10000)
  currentHF:              {hfHuman}

Routing guidance:
  - Maximum allowed: debtBalanceRaw * closeFactorBps / 10000.
  - Default to the maximum allowed when score >= 8000 and currentHF < 0.9.
  - Step down to 50% of maximum when 5000 <= score < 8000 or
    0.9 <= currentHF < 1.0 — partial liquidation gives price a chance to
    recover and reduces realised slippage on the collateral seize.
  - Never return 0. If the case is unsafe to liquidate, the Scorer should
    have cancelled it; reaching the Router means the work proceeds.
  - The seized collateral must not exceed userCollateralBalance after the
    bonus is applied. If `debtToCover * (1 + bonus) / collateralPrice >
    userCollateralBalance`, cap debtToCover so the seize fits.

Return a single ABI-encoded uint256 expressed in the debt asset's
underlying decimals (USDC: 6 decimals).
```

The Coordinator stamps the chosen `debtToCover` into the case's
`LiquidationRoute` together with the carried-forward collateral and debt
assets, then emits `Routed`.

---

## Future Router roadmap

The wire format intentionally leaves room to grow without breaking the
Executor.

Stage 1 — current:

- Output: `uint256 debtToCover`.
- The Coordinator constructs the route from carried-forward asset choices.

Stage 2 — multi-collateral selection:

- Output: `(uint8 collateralIndex, uint256 debtToCover)` where
  `collateralIndex` selects from a user-specific candidate list the
  Coordinator builds from `lendingPool.reserveList()` and sToken balances.
- Coordinator's `_decodeDebtToCover` becomes
  `_decodeRouteV2`, expecting 33+ byte payload (or padded to 64).
- The `LiquidationRoute` struct already stores `collateralAsset`, so
  storage layout is preserved.

Stage 3 — DEX path + slippage budget:

- Output: full ABI-encoded struct
  `(uint8 collateralIndex, uint256 debtToCover, uint8 dexIndex, uint256 minOut, bytes routeHints)`.
- Executor extends to swap the seized collateral back to the debt asset
  through the chosen DEX path before settling with the Splitter.
- Splitter handles either token denomination via its asset-agnostic
  payout map (no Splitter change required).

Stage 4 — multi-protocol orchestration:

- Output also includes a target protocol address so Sentinel can liquidate
  positions on third-party lending markets, with per-protocol adapters
  registered on the Coordinator.

Each stage is a Router-side prompt change plus a Coordinator decoder
addition. None of them require redeploying the Splitter, AgentRegistry,
Reputation, or LendingPool.

---

## Off-chain prompt builder

The Watcher constructs the Scorer payload off-chain at `flagPosition`
time, and constructs the Router payload at `advanceToRouter` time. The
Coordinator forwards both byte strings verbatim to `llm-inference` via
`createRequest`. The validator subcommittee processes the call exactly as
it would for any direct `inferNumber` invocation, then the Coordinator's
callback decodes the clamped `int256` result.

The on-chain Coordinator is therefore strictly an orchestration layer
plus a tight result decoder. It does not know which template the prompt
was rendered from; it only enforces that:

1. The caller owns the agent ID claimed for the role (`AgentRegistry`).
2. The position is below health-factor 1 (Watcher entry only).
3. The result fits the expected 32-byte int256 shape.
4. The decoded value is non-negative.

That separation lets us roll forward to a richer Router (multi-collateral,
DEX path, slippage budget) by changing the prompt and the response
decoder without touching `flagPosition` or `advanceToRouter`. The Router
roadmap section below describes the staged extension.

The canonical prompt builders are in
[packages/agents/src/prompts/](../packages/agents/src/prompts) and import
[`loadPositionSnapshot`](../packages/agents/src/prompts/contextLoader.ts)
to assemble the position context from live on-chain reads. Each Watcher
node converges on the same payload bytes when looking at the same block,
which is what allows the Somnia validator subcommittee to reach
consensus on the response.
