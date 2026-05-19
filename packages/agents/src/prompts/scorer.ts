import type { ScorerInput } from "./types.js";
import { formatAmount, formatHealthFactor, formatPriceUsd, formatValueUsd } from "./format.js";

/**
 * Builds the deterministic Scorer prompt sent to the Somnia validator
 * subcommittee. The template mirrors `docs/agents.md` verbatim; any
 * change to the layout in this file must be reflected there and vice
 * versa.
 *
 * The output is a single uint256 in `[0, 10_000]` and is decoded on-
 * chain by Coordinator's `_decodeScore`. Score thresholding is
 * performed in the Coordinator; the prompt only describes how the
 * agent should reach that score.
 */
export function buildScorerPrompt(input: ScorerInput): string {
  const collateralValueUsd18 =
    (input.collateralBalance * input.collateralPriceUsd18) / 10n ** BigInt(input.collateralDecimals);
  const adjustedCollateralUsd18 =
    (collateralValueUsd18 * BigInt(input.liquidationThresholdBps)) / 10_000n;
  const debtValueUsd18 =
    (input.debtBalance * input.debtPriceUsd18) / 10n ** BigInt(input.debtDecimals);

  return [
    "You are Sentinel's risk Scorer. Your job is to assess whether the",
    "following lending position should be prioritised for immediate",
    "liquidation, on a 0..10000 scale.",
    "",
    "Inputs (already validated on-chain):",
    `  user:                   ${input.user}`,
    `  collateralAsset:        ${input.collateralAsset}   (${input.collateralSymbol})`,
    `  collateralBalance:      ${formatAmount(input.collateralBalance, input.collateralDecimals)}`,
    `  collateralPriceUSD:     ${formatPriceUsd(input.collateralPriceUsd18)}`,
    `  collateralValueUSD:     ${formatValueUsd(collateralValueUsd18)}`,
    `  reserveLiqThresholdBps: ${input.liquidationThresholdBps}`,
    `  adjustedCollateralUSD:  ${formatValueUsd(adjustedCollateralUsd18)}`,
    "",
    `  debtAsset:              ${input.debtAsset}        (${input.debtSymbol})`,
    `  debtBalance:            ${formatAmount(input.debtBalance, input.debtDecimals)}`,
    `  debtPriceUSD:           ${formatPriceUsd(input.debtPriceUsd18)}`,
    `  debtValueUSD:           ${formatValueUsd(debtValueUsd18)}`,
    "",
    `  healthFactor:           ${formatHealthFactor(input.healthFactor18)}`,
    `  liquidationBonusBps:    ${input.liquidationBonusBps}`,
    `  closeFactorBps:         ${input.closeFactorBps}`,
    "",
    "Score guidance:",
    "  - 0 means do not liquidate. Below 5000 cancels the case.",
    "  - 10000 means liquidate immediately at full close factor.",
    "  - Use HF as the dominant signal: HF below 0.9 should score above 8000;",
    "    HF in (0.9, 1.0) should score 6000..8500; HF above 1.0 indicates the",
    "    position is no longer liquidatable on-chain and should score 0.",
    "  - Penalise small positions (debtValueUSD below 100): cap at 3000 so",
    "    Sentinel does not pay agent rewards out of dust.",
    "  - Penalise very thin collateral cushions (adjusted/debt below 1.02) by",
    "    scoring slightly higher (+500) because price recovery is unlikely",
    "    to save them before consensus completes.",
    "",
    "Return a single ABI-encoded uint256 between 0 and 10000.",
  ].join("\n");
}
