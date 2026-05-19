import { z } from "zod";
import type { Address, Hex } from "viem";
import { isAddress, isHex } from "viem";

/**
 * Strict environment validation. Every field is verified at process start —
 * misconfiguration crashes loudly rather than silently failing later.
 */

const addressSchema = z
  .string()
  .refine(isAddress, { message: "Not a checksum-valid 0x address" })
  .transform((s): Address => s as Address);

const optionalAddressSchema = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => s === "" || isAddress(s), {
    message: "Not a checksum-valid 0x address",
  })
  .transform((s): Address | null => (s === "" ? null : (s as Address)));

const privateKeySchema = z
  .string()
  .refine((s) => isHex(s) && s.length === 66, {
    message: "Must be a 0x-prefixed 32-byte hex string",
  })
  .transform((s): Hex => s as Hex);

const optionalUint = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => s === "" || /^\d+$/.test(s), { message: "Not a uint" })
  .transform((s): bigint | null => (s === "" ? null : BigInt(s)));

const baseSchema = z.object({
  SOMNIA_CHAIN_ID: z.coerce.number().int().positive(),
  SOMNIA_RPC_HTTP: z.string().url(),
  SOMNIA_RPC_WSS: z.string().startsWith("ws"),
  SOMNIA_EXPLORER: z.string().url(),

  SOMNIA_AGENTS_PLATFORM: addressSchema,
  SOMNIA_AGENT_SUBCOMMITTEE_SIZE: z.coerce.number().int().min(1).max(10),
  SOMNIA_AGENT_TIMEOUT_SECONDS: z.coerce.number().int().positive(),

  SCORER_AGENT_ID: optionalUint,
  ROUTER_AGENT_ID: optionalUint,

  ORACLE_ETH_USD: addressSchema,
  ORACLE_BTC_USD: addressSchema,
  ORACLE_USDC_USD: addressSchema,

  SENTINEL_AGENT_REGISTRY: optionalAddressSchema,
  SENTINEL_REPUTATION: optionalAddressSchema,
  SENTINEL_COORDINATOR: optionalAddressSchema,
  SENTINEL_SPLITTER: optionalAddressSchema,
  SENTINEL_LENDING_POOL: optionalAddressSchema,
  SENTINEL_PRICE_ORACLE_ADAPTER: optionalAddressSchema,
  SENTINEL_AUTO_PROTECTION_VAULT: optionalAddressSchema,

  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
});

const watcherSchema = baseSchema.extend({
  WATCHER_PRIVATE_KEY: privateKeySchema,
});

const executorSchema = baseSchema.extend({
  EXECUTOR_PRIVATE_KEY: privateKeySchema,
});

const deployerSchema = baseSchema.extend({
  DEPLOYER_PRIVATE_KEY: privateKeySchema,
});

export type SentinelBaseEnv = z.infer<typeof baseSchema>;
export type SentinelWatcherEnv = z.infer<typeof watcherSchema>;
export type SentinelExecutorEnv = z.infer<typeof executorSchema>;
export type SentinelDeployerEnv = z.infer<typeof deployerSchema>;

/**
 * Load and validate the shared env block. Read-only callers (frontend, indexer)
 * use this — agents needing signing keys call loadWatcherEnv / loadExecutorEnv.
 */
export function loadBaseEnv(source: NodeJS.ProcessEnv = process.env): SentinelBaseEnv {
  return baseSchema.parse(source);
}

export function loadWatcherEnv(source: NodeJS.ProcessEnv = process.env): SentinelWatcherEnv {
  return watcherSchema.parse(source);
}

export function loadExecutorEnv(source: NodeJS.ProcessEnv = process.env): SentinelExecutorEnv {
  return executorSchema.parse(source);
}

export function loadDeployerEnv(source: NodeJS.ProcessEnv = process.env): SentinelDeployerEnv {
  return deployerSchema.parse(source);
}
