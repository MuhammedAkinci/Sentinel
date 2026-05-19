import { describe, it, expect } from "vitest";
import type { Address } from "viem";

import { buildScorerPrompt } from "../src/prompts/scorer.js";
import type { ScorerInput } from "../src/prompts/types.js";

const alice = "0x000000000000000000000000000000000000a11c" as Address;
const weth = "0x0000000000000000000000000000000000000111" as Address;
const usdc = "0x0000000000000000000000000000000000000222" as Address;

const crashedScenario: ScorerInput = {
  user: alice,
  collateralAsset: weth,
  collateralSymbol: "WETH",
  collateralDecimals: 18,
  collateralBalance: 10n * 10n ** 18n, // 10 WETH
  collateralPriceUsd18: 1_800n * 10n ** 18n, // $1,800
  liquidationThresholdBps: 7_500,
  liquidationBonusBps: 500,

  debtAsset: usdc,
  debtSymbol: "USDC",
  debtDecimals: 6,
  debtBalance: 15_000n * 10n ** 6n, // 15,000 USDC
  debtPriceUsd18: 10n ** 18n, // $1
  closeFactorBps: 5_000,

  healthFactor18: 900_000_000_000_000_000n, // 0.9
};

describe("buildScorerPrompt", () => {
  it("renders a deterministic prompt with the supplied position fields", () => {
    const out = buildScorerPrompt(crashedScenario);

    expect(out).toContain("You are Sentinel's risk Scorer.");
    expect(out).toContain(`user:                   ${alice}`);
    expect(out).toContain(`collateralAsset:        ${weth}   (WETH)`);
    expect(out).toContain("collateralBalance:      10.0");
    expect(out).toContain("collateralPriceUSD:     1800.00");
    expect(out).toContain("collateralValueUSD:     18000.00");
    expect(out).toContain("reserveLiqThresholdBps: 7500");
    expect(out).toContain("adjustedCollateralUSD:  13500.00");

    expect(out).toContain(`debtAsset:              ${usdc}        (USDC)`);
    expect(out).toContain("debtBalance:            15000.0");
    expect(out).toContain("debtPriceUSD:           1.00");
    expect(out).toContain("debtValueUSD:           15000.00");

    expect(out).toContain("healthFactor:           0.9");
    expect(out).toContain("liquidationBonusBps:    500");
    expect(out).toContain("closeFactorBps:         5000");
    expect(out).toContain("Return a single ABI-encoded uint256 between 0 and 10000.");
  });

  it("renders adjustedCollateralUSD as collateralValueUSD * LT / 10000", () => {
    const out = buildScorerPrompt(crashedScenario);
    // 10 WETH * $1,800 = $18,000; * 0.75 = $13,500.
    expect(out).toContain("collateralValueUSD:     18000.00");
    expect(out).toContain("adjustedCollateralUSD:  13500.00");
  });

  it("handles healthy positions (HF >= 1) without truncating values", () => {
    const healthy: ScorerInput = {
      ...crashedScenario,
      collateralPriceUsd18: 3_000n * 10n ** 18n, // ETH at $3,000
      healthFactor18: 1_500_000_000_000_000_000n, // 1.5
    };
    const out = buildScorerPrompt(healthy);
    expect(out).toContain("collateralPriceUSD:     3000.00");
    expect(out).toContain("healthFactor:           1.5");
  });

  it("byte-deterministic across invocations with identical input", () => {
    const a = buildScorerPrompt(crashedScenario);
    const b = buildScorerPrompt(crashedScenario);
    expect(a).toBe(b);
  });

  it("includes the full guidance block from docs/agents.md", () => {
    const out = buildScorerPrompt(crashedScenario);
    expect(out).toContain("Score guidance:");
    expect(out).toContain("HF below 0.9 should score above 8000");
    expect(out).toContain("debtValueUSD below 100");
    expect(out).toContain("adjusted/debt below 1.02");
  });
});
