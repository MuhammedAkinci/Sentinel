import {
  concat,
  encodeAbiParameters,
  toFunctionSelector,
  type Hex,
} from "viem";

import type { PositionSnapshot, RouterInput } from "./types.js";
import { buildScorerPrompt } from "./scorer.js";
import { buildRouterPrompt } from "./router.js";

/**
 * Wire format helpers that turn a (snapshot, prompt) pair into the
 * `bytes` payload the Coordinator forwards to the Somnia native
 * `llm-inference` base agent through `createRequest`.
 *
 * The base agent's structured output mode is invoked through the
 * `inferNumber(string,string,int256,int256,bool)` entry point. The
 * payload is the selector concatenated with ABI-encoded arguments:
 *
 *   prompt   : the role-specific instructions assembled by the
 *              prompt builder.
 *   system   : a short system message that locks the validator
 *              subcommittee into the expected output shape.
 *   minValue : lower clamp for the returned int256.
 *   maxValue : upper clamp; chosen per role so the value stays in
 *              range the Coordinator's decoder accepts.
 *   useTools : disabled - the agent reasons from the prompt alone,
 *              no external tool calls.
 *
 * The Coordinator decodes the response as int256 and rejects
 * negatives, so we always submit non-negative ranges.
 */

const SCORER_SYSTEM =
  "You are Sentinel's risk Scorer. Return a single integer between minValue and maxValue. No prose, no units, no explanation.";

const ROUTER_SYSTEM =
  "You are Sentinel's route selector. Return a single integer between minValue and maxValue denominated in the debt asset's underlying base units. No prose, no units, no explanation.";

const INFER_NUMBER_SIGNATURE =
  "inferNumber(string,string,int256,int256,bool)" as const;

const INFER_NUMBER_SELECTOR: Hex = toFunctionSelector(INFER_NUMBER_SIGNATURE);

const INFER_NUMBER_PARAM_TYPES = [
  { type: "string" },
  { type: "string" },
  { type: "int256" },
  { type: "int256" },
  { type: "bool" },
] as const;

/** Hard upper bound the Scorer is allowed to return. Matches the
 *  0..10_000 score domain in `docs/agents.md` and the Coordinator's
 *  `scoreThreshold` semantics. */
export const SCORER_MAX_VALUE = 10_000n;

/**
 * Encodes a real Scorer call. The prompt body is built from on-chain
 * state via [[buildScorerPrompt]], so each call carries the
 * position-specific context the validator subcommittee needs to
 * converge on a deterministic score.
 */
export function encodeScorerPayload(snapshot: PositionSnapshot): Hex {
  const prompt = buildScorerPrompt(snapshot);
  return encodeInferNumber({
    prompt,
    system: SCORER_SYSTEM,
    minValue: 0n,
    maxValue: SCORER_MAX_VALUE,
  });
}

/**
 * Encodes a real Router call. The maxValue is computed from the
 * snapshot itself - `debtBalance * closeFactorBps / 10_000` - so the
 * returned value cannot exceed the on-chain close-factor cap. If the
 * Router returns the maximum, `execute` settles a full close-factor
 * liquidation; values below the maximum are partial liquidations.
 */
export function encodeRouterPayload(input: RouterInput): Hex {
  const prompt = buildRouterPrompt(input);
  const maxDebtToCover =
    (input.debtBalance * BigInt(input.closeFactorBps)) / 10_000n;
  return encodeInferNumber({
    prompt,
    system: ROUTER_SYSTEM,
    minValue: 1n,
    maxValue: maxDebtToCover > 0n ? maxDebtToCover : 1n,
  });
}

interface InferNumberArgs {
  prompt: string;
  system: string;
  minValue: bigint;
  maxValue: bigint;
}

function encodeInferNumber(args: InferNumberArgs): Hex {
  const encoded = encodeAbiParameters(INFER_NUMBER_PARAM_TYPES, [
    args.prompt,
    args.system,
    args.minValue,
    args.maxValue,
    false,
  ]);
  return concat([INFER_NUMBER_SELECTOR, encoded]);
}
