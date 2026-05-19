import type { RouterInput } from "./types.js";
import { formatAmount, formatHealthFactor, formatPriceUsd } from "./format.js";

/**
 * Builds the deterministic Router prompt sent to the Somnia validator
 * subcommittee. The Router decides `debtToCover` only; the Coordinator
 * carries collateral and debt asset choices forward from the Watcher's
 * original flag. The roadmap in `docs/agents.md` (stages 2..4) extends
 * the output shape; this builder remains the canonical Stage 1
 * implementation.
 */
export function buildRouterPrompt(input: RouterInput): string {
  return [
    "You are Sentinel's route selector. The Scorer has cleared this position",
    "for liquidation. Decide how much of the user's debt to repay in this pass.",
    "",
    "Inputs (already validated on-chain):",
    `  user:                   ${input.user}`,
    `  debtAsset:              ${input.debtAsset}        (${input.debtSymbol})`,
    `  debtBalance:            ${input.debtBalance.toString()} (underlying base units)`,
    `  debtBalanceHuman:       ${formatAmount(input.debtBalance, input.debtDecimals)}`,
    `  closeFactorBps:         ${input.closeFactorBps}            (max share per pass)`,
    "",
    `  collateralAsset:        ${input.collateralAsset}  (${input.collateralSymbol})`,
    `  collateralBalanceHuman: ${formatAmount(input.collateralBalance, input.collateralDecimals)}`,
    `  collateralPriceUSD:     ${formatPriceUsd(input.collateralPriceUsd18)}`,
    `  liquidationBonusBps:    ${input.liquidationBonusBps}`,
    "",
    `  scorerOutput:           ${input.score.toString()}            (0..10000)`,
    `  currentHF:              ${formatHealthFactor(input.healthFactor18)}`,
    "",
    "Routing guidance:",
    "  - Maximum allowed: debtBalanceRaw * closeFactorBps / 10000.",
    "  - Default to the maximum allowed when score >= 8000 and currentHF < 0.9.",
    "  - Step down to 50% of maximum when 5000 <= score < 8000 or",
    "    0.9 <= currentHF < 1.0 — partial liquidation gives price a chance to",
    "    recover and reduces realised slippage on the collateral seize.",
    "  - Never return 0. If the case is unsafe to liquidate, the Scorer should",
    "    have cancelled it; reaching the Router means the work proceeds.",
    "  - The seized collateral must not exceed userCollateralBalance after the",
    "    bonus is applied. If `debtToCover * (1 + bonus) / collateralPrice >",
    "    userCollateralBalance`, cap debtToCover so the seize fits.",
    "",
    "Return a single ABI-encoded uint256 expressed in the debt asset's",
    `underlying decimals (${input.debtSymbol}: ${input.debtDecimals} decimals).`,
  ].join("\n");
}
