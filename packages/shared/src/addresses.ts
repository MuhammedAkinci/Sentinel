import type { Address } from "viem";

/**
 * Known on-chain addresses on Somnia networks.
 *
 * Every entry below is sourced from official documentation and verified at the
 * time of writing (May 2026). Do NOT add unverified addresses — every consumer
 * of this module treats these as production constants.
 */

/* ----------------------------- Shannon Testnet ---------------------------- */

/** Somnia native agent invocation platform (Shannon testnet, chain 50312).
 *  Source: docs.somnia.network/agents/invoking-agents/from-solidity */
export const SOMNIA_AGENTS_PLATFORM_TESTNET: Address =
  "0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776";

/** Protofire Chainlink-compatible price feeds on Shannon testnet.
 *  Source: docs.somnia.network/developer/building-dapps/oracles/protofire-price-feeds */
export const PROTOFIRE_FEEDS_TESTNET = {
  ETH_USD: "0x604CF5063eC760A78d1C089AA55dFf29B90937f9",
  BTC_USD: "0x3dF17dbaa3BA861D03772b501ADB343B4326C676",
  USDC_USD: "0xA4a08Eb26f85A53d40E3f908B406b2a69B1A2441",
} as const satisfies Record<string, Address>;

/** Off-chain receipt service for Somnia agent execution traces.
 *  Note: receipts are stored on centralized infrastructure as of May 2026;
 *  only the final consensus result is on-chain. */
export const SOMNIA_RECEIPTS_ENDPOINT_TESTNET =
  "https://receipts.testnet.agents.somnia.host";

/** Agent Explorer UI (browse, test, invoke). */
export const SOMNIA_AGENT_EXPLORER_TESTNET =
  "https://agents.testnet.somnia.network";

/* -------------------------------- Mainnet -------------------------------- */

/** Somnia native agent invocation platform (mainnet, chain 5031). */
export const SOMNIA_AGENTS_PLATFORM_MAINNET: Address =
  "0x5E5205CF39E766118C01636bED000A54D93163E6";

/** Canonical mainnet protocol contracts.
 *  Source: docs.somnia.network/developer/smart-contracts */
export const SOMNIA_CANONICAL_MAINNET = {
  MULTICALL_V3: "0x5e44F178E8cF9B2F5409B6f18ce936aB817C5a11",
  WSOMI: "0x046EDe9564A72571df6F5e44d0405360c0f4dCab",
  USDC: "0x28bec7e30e6faee657a03e19bf1128aad7632a00",
  USDT: "0x67B302E35Aef5EEE8c32D934F5856869EF428330",
  WETH: "0x936Ab8C674bcb567CD5dEB85D8A216494704E9D8",
  WBTC: "0xC5098b3cA516784323872F17235fa074E167D3D2",
  DIA_ORACLE: "0xbA0E0750A56e995506CA458b2BdD752754CF39C4",
} as const satisfies Record<string, Address>;

export const SOMNIA_RECEIPTS_ENDPOINT_MAINNET =
  "https://receipts.mainnet.agents.somnia.host";

/* ------------------------- Sentinel deployments -------------------------- */

/**
 * Deployed Sentinel contracts.
 *
 * Populated by the deploy script and consumed by agents/frontend. Values are
 * `null` until deployment runs against the configured network — every consumer
 * MUST handle the null case explicitly (no silent fallbacks, no zero-address).
 */
export interface SentinelDeployment {
  agentRegistry: Address | null;
  reputation: Address | null;
  coordinator: Address | null;
  splitter: Address | null;
  lendingPool: Address | null;
  priceOracleAdapter: Address | null;
  autoProtectionVault: Address | null;
}

export const EMPTY_SENTINEL_DEPLOYMENT: SentinelDeployment = {
  agentRegistry: null,
  reputation: null,
  coordinator: null,
  splitter: null,
  lendingPool: null,
  priceOracleAdapter: null,
  autoProtectionVault: null,
};
