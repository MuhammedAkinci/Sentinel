import { describe, it, expect } from "vitest";
import {
  decodeAbiParameters,
  decodeFunctionData,
  toFunctionSelector,
  type Address,
} from "viem";

import {
  encodeScorerPayload,
  encodeRouterPayload,
  SCORER_MAX_VALUE,
} from "../src/prompts/payload.js";
import type { PositionSnapshot, RouterInput } from "../src/prompts/types.js";

const INFER_NUMBER_SIG = "inferNumber(string,string,int256,int256,bool)" as const;
const INFER_NUMBER_ABI = [
  {
    type: "function",
    name: "inferNumber",
    stateMutability: "view",
    inputs: [
      { name: "prompt", type: "string" },
      { name: "system", type: "string" },
      { name: "minValue", type: "int256" },
      { name: "maxValue", type: "int256" },
      { name: "useTools", type: "bool" },
    ],
    outputs: [{ name: "value", type: "int256" }],
  },
] as const;

const alice = "0x000000000000000000000000000000000000a11c" as Address;
const weth = "0x0000000000000000000000000000000000000111" as Address;
const usdc = "0x0000000000000000000000000000000000000222" as Address;

const baseSnapshot: PositionSnapshot = {
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
};

const baseRouterInput: RouterInput = { ...baseSnapshot, score: 9_500n };

describe("encodeScorerPayload", () => {
  it("uses the inferNumber selector", () => {
    const expected = toFunctionSelector(INFER_NUMBER_SIG);
    const out = encodeScorerPayload(baseSnapshot);
    expect(out.slice(0, 10)).toBe(expected);
  });

  it("decodes back to a non-empty prompt and a [0, SCORER_MAX] integer range", () => {
    const out = encodeScorerPayload(baseSnapshot);
    const decoded = decodeFunctionData({ abi: INFER_NUMBER_ABI, data: out });
    const [prompt, system, minValue, maxValue, useTools] = decoded.args;

    expect(prompt.length).toBeGreaterThan(200);
    expect(prompt).toContain("Sentinel's risk Scorer");
    expect(system.length).toBeGreaterThan(0);
    expect(minValue).toBe(0n);
    expect(maxValue).toBe(SCORER_MAX_VALUE);
    expect(useTools).toBe(false);
  });

  it("is byte-deterministic across calls with the same snapshot", () => {
    const a = encodeScorerPayload(baseSnapshot);
    const b = encodeScorerPayload(baseSnapshot);
    expect(a).toBe(b);
  });
});

describe("encodeRouterPayload", () => {
  it("uses the inferNumber selector", () => {
    const expected = toFunctionSelector(INFER_NUMBER_SIG);
    const out = encodeRouterPayload(baseRouterInput);
    expect(out.slice(0, 10)).toBe(expected);
  });

  it("caps maxValue at debtBalance * closeFactorBps / 10000", () => {
    const out = encodeRouterPayload(baseRouterInput);
    const decoded = decodeFunctionData({ abi: INFER_NUMBER_ABI, data: out });
    const [, , minValue, maxValue] = decoded.args;

    const expectedCap =
      (baseRouterInput.debtBalance * BigInt(baseRouterInput.closeFactorBps)) / 10_000n;
    expect(minValue).toBe(1n);
    expect(maxValue).toBe(expectedCap);
  });

  it("keeps maxValue >= 1 even when the close-factor cap rounds to zero", () => {
    const dustInput: RouterInput = {
      ...baseRouterInput,
      // 1 base unit of debt with a 50% close factor rounds the cap to 0.
      debtBalance: 1n,
      closeFactorBps: 5_000,
    };
    const out = encodeRouterPayload(dustInput);
    const decoded = decodeFunctionData({ abi: INFER_NUMBER_ABI, data: out });
    const [, , minValue, maxValue] = decoded.args;
    expect(minValue).toBe(1n);
    expect(maxValue).toBe(1n);
  });

  it("references the Scorer's score in the embedded prompt", () => {
    const out = encodeRouterPayload(baseRouterInput);
    const decoded = decodeFunctionData({ abi: INFER_NUMBER_ABI, data: out });
    const [prompt] = decoded.args;
    expect(prompt).toContain(baseRouterInput.score.toString());
  });

  it("encodes parameters that decode through decodeAbiParameters as well", () => {
    const out = encodeRouterPayload(baseRouterInput);
    // Drop the 4-byte selector and verify the raw parameter encoding.
    const argsHex = `0x${out.slice(10)}` as const;
    const [prompt, system, minValue, maxValue, useTools] = decodeAbiParameters(
      [
        { type: "string" },
        { type: "string" },
        { type: "int256" },
        { type: "int256" },
        { type: "bool" },
      ],
      argsHex,
    );
    expect(prompt).toContain("Sentinel's route selector");
    expect(system).toContain("Sentinel's route selector");
    expect(minValue).toBe(1n);
    expect(maxValue).toBeGreaterThan(0n);
    expect(useTools).toBe(false);
  });
});
