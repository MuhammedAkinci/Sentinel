import { z } from "zod";
import {
  loadWatcherEnv as loadSharedWatcherEnv,
  loadExecutorEnv as loadSharedExecutorEnv,
  type SentinelWatcherEnv,
  type SentinelExecutorEnv,
} from "@sentinel/shared/env";

/**
 * Strict env validation for the off-chain agent runtimes. Builds on top of
 * @sentinel/shared and adds the agent-specific runtime knobs.
 */

const bigintFromUint = z
  .string()
  .refine((s) => /^\d+$/.test(s.trim()), { message: "Not a uint" })
  .transform((s) => BigInt(s.trim()));

/**
 * Parses a decimal string like "1.05" and scales it to an 18-decimal bigint.
 * Used for the watcher's health-factor threshold so operators can express it
 * naturally without typing 19-digit integers in `.env`.
 */
const scaledDecimal18 = z
  .string()
  .refine((s) => /^\d+(\.\d+)?$/.test(s.trim()), {
    message: "Must be a non-negative decimal number",
  })
  .transform((s) => {
    const [whole, frac = ""] = s.trim().split(".");
    const padded = (frac + "0".repeat(18)).slice(0, 18);
    return BigInt(whole ?? "0") * 10n ** 18n + BigInt(padded || "0");
  });

const positiveInt = z.coerce.number().int().positive();

const watcherRuntimeSchema = z.object({
  WATCHER_AGENT_ID: bigintFromUint,
  WATCHER_HEALTH_THRESHOLD: scaledDecimal18.default("1.05"),
  WATCHER_POLL_INTERVAL_MS: positiveInt.default(5_000),
  WATCHER_START_BLOCK: bigintFromUint.default("0"),
});

const executorRuntimeSchema = z.object({
  EXECUTOR_AGENT_ID: bigintFromUint,
  EXECUTOR_START_BLOCK: bigintFromUint.default("0"),
});

export type WatcherRuntimeEnv = SentinelWatcherEnv & z.infer<typeof watcherRuntimeSchema>;
export type ExecutorRuntimeEnv = SentinelExecutorEnv & z.infer<typeof executorRuntimeSchema>;

export function loadWatcherRuntimeEnv(
  source: NodeJS.ProcessEnv = process.env,
): WatcherRuntimeEnv {
  return {
    ...loadSharedWatcherEnv(source),
    ...watcherRuntimeSchema.parse(source),
  };
}

export function loadExecutorRuntimeEnv(
  source: NodeJS.ProcessEnv = process.env,
): ExecutorRuntimeEnv {
  return {
    ...loadSharedExecutorEnv(source),
    ...executorRuntimeSchema.parse(source),
  };
}
