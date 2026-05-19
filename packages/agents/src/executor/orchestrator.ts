import {
  type Address,
  type Hash,
  type PublicClient,
  type WalletClient,
  ContractFunctionRevertedError,
  BaseError,
} from "viem";
import type { Logger } from "pino";

import { coordinatorAbi } from "../core/abis.js";

export interface ExecutorDependencies {
  readClient: PublicClient;
  wssClient: PublicClient;
  walletClient: WalletClient;
  logger: Logger;
}

export interface ExecutorConfig {
  coordinator: Address;
  executorAgentId: bigint;
  startBlock: bigint;
}

/**
 * Executor loop. Listens to Coordinator's `Routed` event and runs
 * Coordinator.execute(caseId, executorAgentId). Reverts during simulation
 * are logged and skipped — they typically mean another Executor in the
 * network already settled the case.
 */
export async function startExecutor(
  deps: ExecutorDependencies,
  cfg: ExecutorConfig,
): Promise<{ stop: () => Promise<void> }> {
  const log = deps.logger;

  // Replay any past Routed events that have not been executed. The
  // Coordinator's wrong-status revert will skip the ones already done.
  const head = await deps.readClient.getBlockNumber();
  log.info(
    { fromBlock: cfg.startBlock.toString(), toBlock: head.toString() },
    "bootstrap: replaying Routed events",
  );
  const past = await deps.readClient.getContractEvents({
    address: cfg.coordinator,
    abi: coordinatorAbi,
    eventName: "Routed",
    fromBlock: cfg.startBlock,
    toBlock: head,
  });
  for (const ev of past) {
    const args = (ev as unknown as { args: Record<string, unknown> }).args;
    const caseId = args.caseId as bigint | undefined;
    if (caseId !== undefined) await tryExecute(deps, cfg, caseId, log);
  }

  const unwatch = deps.wssClient.watchContractEvent({
    address: cfg.coordinator,
    abi: coordinatorAbi,
    eventName: "Routed",
    onLogs: (logs) => {
      for (const ev of logs) {
        const args = (ev as unknown as { args: Record<string, unknown> }).args;
        const caseId = args.caseId as bigint | undefined;
        if (caseId === undefined) continue;
        void tryExecute(deps, cfg, caseId, log);
      }
    },
    onError: (err) => log.error({ err }, "Routed subscription error"),
  });

  const stop = async (): Promise<void> => {
    unwatch();
  };
  return { stop };
}

async function tryExecute(
  deps: ExecutorDependencies,
  cfg: ExecutorConfig,
  caseId: bigint,
  log: Logger,
): Promise<void> {
  if (!deps.walletClient.account) {
    log.error("walletClient has no account; cannot execute");
    return;
  }

  try {
    await deps.readClient.simulateContract({
      address: cfg.coordinator,
      abi: coordinatorAbi,
      functionName: "execute",
      args: [caseId, cfg.executorAgentId],
      account: deps.walletClient.account,
    });
  } catch (err) {
    if (err instanceof BaseError) {
      const cause = err.walk((e) => e instanceof ContractFunctionRevertedError);
      if (cause instanceof ContractFunctionRevertedError) {
        log.warn({ caseId: caseId.toString(), reason: cause.shortMessage }, "execute simulation reverted");
        return;
      }
    }
    log.error({ err, caseId: caseId.toString() }, "execute simulation failed");
    return;
  }

  try {
    const hash: Hash = await deps.walletClient.writeContract({
      address: cfg.coordinator,
      abi: coordinatorAbi,
      functionName: "execute",
      args: [caseId, cfg.executorAgentId],
      account: deps.walletClient.account,
      chain: deps.walletClient.chain,
    });
    log.info({ caseId: caseId.toString(), txHash: hash }, "executed case");
  } catch (err) {
    log.error({ err, caseId: caseId.toString() }, "execute submission failed");
  }
}
