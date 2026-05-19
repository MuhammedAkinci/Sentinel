import { describe, it, expect } from "vitest";
import type { Address } from "viem";

import { buildRouterPrompt } from "../src/prompts/router.js";
import type { RouterInput } from "../src/prompts/types.js";

const alice = "0x000000000000000000000000000000000000a11c" as Address;
const weth = "0x0000000000000000000000000000000000000111" as Address;
const usdc = "0x0000000000000000000000000000000000000222" as Address;

const baseInput: RouterInput = {
  user: alice,
  collateralAsset: weth,
  collateralSymbol: "WETH",
  collateralDecimals: 18,
  collateralBalance: 10n * 10n ** 18n,
  collateralPriceUsd18: 1_800n * 10n ** 18n,
  liquidationThresholdBps: 7_500,
  liquidationBonusBps: 500,

  debtAsset: usdc,
  debtSymbol: "USDC",
  debtDecimals: 6,
  debtBalance: 15_000n * 10n ** 6n,
  debtPriceUsd18: 10n ** 18n,
  closeFactorBps: 5_000,

  healthFactor18: 900_000_000_000_000_000n,
  score: 9_000n,
};

describe("buildRouterPrompt", () => {
  it("renders the position fields and the Scorer's score", () => {
    const out = buildRouterPrompt(baseInput);

    expect(out).toContain("You are Sentinel's route selector.");
    expect(out).toContain(`user:                   ${alice}`);
    expect(out).toContain(`debtAsset:              ${usdc}        (USDC)`);
    expect(out).toContain("debtBalance:            15000000000 (underlying base units)");
    expect(out).toContain("debtBalanceHuman:       15000.0");
    expect(out).toContain("closeFactorBps:         5000            (max share per pass)");

    expect(out).toContain(`collateralAsset:        ${weth}  (WETH)`);
    expect(out).toContain("collateralBalanceHuman: 10.0");
    expect(out).toContain("collateralPriceUSD:     1800.00");
    expect(out).toContain("liquidationBonusBps:    500");

    expect(out).toContain("scorerOutput:           9000            (0..10000)");
    expect(out).toContain("currentHF:              0.9");
  });

  it("references the debt asset decimals in the output instruction", () => {
    const out = buildRouterPrompt(baseInput);
    expect(out).toContain("(USDC: 6 decimals).");
  });

  it("includes the full routing guidance block from docs/agents.md", () => {
    const out = buildRouterPrompt(baseInput);
    expect(out).toContain("Routing guidance:");
    expect(out).toContain("Maximum allowed: debtBalanceRaw * closeFactorBps / 10000.");
    expect(out).toContain("score >= 8000 and currentHF < 0.9");
    expect(out).toContain("Never return 0.");
  });

  it("byte-deterministic across invocations with identical input", () => {
    const a = buildRouterPrompt(baseInput);
    const b = buildRouterPrompt(baseInput);
    expect(a).toBe(b);
  });

  it("varies score representation as a plain integer (no decimal scaling)", () => {
    const out = buildRouterPrompt({ ...baseInput, score: 5_500n });
    expect(out).toContain("scorerOutput:           5500            (0..10000)");
  });
});
