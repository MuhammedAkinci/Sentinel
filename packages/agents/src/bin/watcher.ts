#!/usr/bin/env node
import { loadWatcherRuntimeEnv } from "../core/env.js";
import { createHttpReader, createWssReader, createSigner } from "../core/rpc.js";
import { childLogger } from "../core/logger.js";
import { startWatcher } from "../watcher/orchestrator.js";

async function main(): Promise<void> {
  const env = loadWatcherRuntimeEnv();
  const logger = childLogger("watcher", { chainId: env.SOMNIA_CHAIN_ID });

  if (!env.SENTINEL_LENDING_POOL || !env.SENTINEL_COORDINATOR) {
    logger.error("SENTINEL_LENDING_POOL and SENTINEL_COORDINATOR must be set after deployment");
    process.exit(1);
  }

  const rpcCfg = {
    chainId: env.SOMNIA_CHAIN_ID,
    httpUrl: env.SOMNIA_RPC_HTTP,
    wssUrl: env.SOMNIA_RPC_WSS,
  };

  const { stop } = await startWatcher(
    {
      readClient: createHttpReader(rpcCfg),
      wssClient: createWssReader(rpcCfg),
      walletClient: createSigner(rpcCfg, env.WATCHER_PRIVATE_KEY),
      logger,
    },
    {
      lendingPool: env.SENTINEL_LENDING_POOL,
      coordinator: env.SENTINEL_COORDINATOR,
      watcherAgentId: env.WATCHER_AGENT_ID,
      threshold: env.WATCHER_HEALTH_THRESHOLD,
      pollIntervalMs: env.WATCHER_POLL_INTERVAL_MS,
      startBlock: env.WATCHER_START_BLOCK,
    },
  );

  logger.info("watcher running");

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "shutting down");
    await stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console -- bin entry, logger may not be ready
  console.error("watcher fatal:", err);
  process.exit(1);
});
