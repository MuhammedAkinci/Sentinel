import { z } from "zod";
import type { Address } from "viem";
import { isAddress } from "viem";

const optionalAddress = z
  .string()
  .optional()
  .transform((s) => s?.trim())
  .refine((s) => !s || isAddress(s), {
    message: "Not a checksum-valid 0x address",
  })
  .transform((s): Address | undefined => (s ? (s as Address) : undefined));

const requiredAddress = z
  .string()
  .refine(isAddress, { message: "Not a checksum-valid 0x address" })
  .transform((s): Address => s as Address);

const schema = z.object({
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: z.string().optional(),
  NEXT_PUBLIC_DEPLOYER_ADDRESS: optionalAddress,
  NEXT_PUBLIC_SENTINEL_WETH: requiredAddress,
  NEXT_PUBLIC_SENTINEL_USDC: requiredAddress,
  NEXT_PUBLIC_SENTINEL_PRICE_ORACLE_ADAPTER: requiredAddress,
  NEXT_PUBLIC_SENTINEL_LENDING_POOL: requiredAddress,
  NEXT_PUBLIC_SENTINEL_AGENT_REGISTRY: requiredAddress,
  NEXT_PUBLIC_SENTINEL_REPUTATION: requiredAddress,
  NEXT_PUBLIC_SENTINEL_SPLITTER: requiredAddress,
  NEXT_PUBLIC_SENTINEL_COORDINATOR: requiredAddress,
  NEXT_PUBLIC_SENTINEL_AUTO_PROTECTION_VAULT: requiredAddress,
});

/**
 * Frontend env is parsed once at module load. Next.js bakes
 * NEXT_PUBLIC_* into the client bundle automatically; this helper guards
 * against typos and missing addresses with the same zod surface the
 * agent runtime uses.
 */
export const env = schema.parse({
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  NEXT_PUBLIC_DEPLOYER_ADDRESS: process.env.NEXT_PUBLIC_DEPLOYER_ADDRESS,
  NEXT_PUBLIC_SENTINEL_WETH: process.env.NEXT_PUBLIC_SENTINEL_WETH,
  NEXT_PUBLIC_SENTINEL_USDC: process.env.NEXT_PUBLIC_SENTINEL_USDC,
  NEXT_PUBLIC_SENTINEL_PRICE_ORACLE_ADAPTER:
    process.env.NEXT_PUBLIC_SENTINEL_PRICE_ORACLE_ADAPTER,
  NEXT_PUBLIC_SENTINEL_LENDING_POOL: process.env.NEXT_PUBLIC_SENTINEL_LENDING_POOL,
  NEXT_PUBLIC_SENTINEL_AGENT_REGISTRY: process.env.NEXT_PUBLIC_SENTINEL_AGENT_REGISTRY,
  NEXT_PUBLIC_SENTINEL_REPUTATION: process.env.NEXT_PUBLIC_SENTINEL_REPUTATION,
  NEXT_PUBLIC_SENTINEL_SPLITTER: process.env.NEXT_PUBLIC_SENTINEL_SPLITTER,
  NEXT_PUBLIC_SENTINEL_COORDINATOR: process.env.NEXT_PUBLIC_SENTINEL_COORDINATOR,
  NEXT_PUBLIC_SENTINEL_AUTO_PROTECTION_VAULT:
    process.env.NEXT_PUBLIC_SENTINEL_AUTO_PROTECTION_VAULT,
});

export const addresses = {
  weth: env.NEXT_PUBLIC_SENTINEL_WETH,
  usdc: env.NEXT_PUBLIC_SENTINEL_USDC,
  oracle: env.NEXT_PUBLIC_SENTINEL_PRICE_ORACLE_ADAPTER,
  pool: env.NEXT_PUBLIC_SENTINEL_LENDING_POOL,
  registry: env.NEXT_PUBLIC_SENTINEL_AGENT_REGISTRY,
  reputation: env.NEXT_PUBLIC_SENTINEL_REPUTATION,
  splitter: env.NEXT_PUBLIC_SENTINEL_SPLITTER,
  coordinator: env.NEXT_PUBLIC_SENTINEL_COORDINATOR,
  vault: env.NEXT_PUBLIC_SENTINEL_AUTO_PROTECTION_VAULT,
} as const;
