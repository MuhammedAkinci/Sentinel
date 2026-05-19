#!/usr/bin/env node
import { loadExecutorRuntimeEnv } from "../core/env.js";
import { createHttpReader, createWssReader, createSigner } from "../core/rpc.js";
import { childLogger } from "../core/logger.js";
import { startExecutor } from "../executor/orchestrator.js";

async function main(): Promise<void> {
  const env = loadExecutorRuntimeEnv();
  const logger = childLogger("executor", { chainId: env.SOMNIA_CHAIN_ID });

  if (!env.SENTINEL_COORDINATOR) {
    logger.error("SENTINEL_COORDINATOR must be set after deployment");
    process.exit(1);
  }

  const rpcCfg = {
    chainId: env.SOMNIA_CHAIN_ID,
    httpUrl: env.SOMNIA_RPC_HTTP,
    wssUrl: env.SOMNIA_RPC_WSS,
  };

  const { stop } = await startExecutor(
    {
      readClient: createHttpReader(rpcCfg),
      wssClient: createWssReader(rpcCfg),
      walletClient: createSigner(rpcCfg, env.EXECUTOR_PRIVATE_KEY),
      logger,
    },
    {
      coordinator: env.SENTINEL_COORDINATOR,
      executorAgentId: env.EXECUTOR_AGENT_ID,
      startBlock: env.EXECUTOR_START_BLOCK,
    },
  );

  logger.info("executor running");

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
  console.error("executor fatal:", err);
  process.exit(1);
});
