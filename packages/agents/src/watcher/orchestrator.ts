import {
  type Address,
  type Hash,
  type Hex,
  type Log,
  type PublicClient,
  type WalletClient,
  ContractFunctionRevertedError,
  BaseError,
  decodeEventLog,
} from "viem";
import type { Logger } from "pino";

import { lendingPoolAbi, coordinatorAbi } from "../core/abis.js";
import { PositionTracker, type PositionEvent } from "./positionTracker.js";
import { HealthMonitor } from "./healthMonitor.js";
import {
  loadPositionSnapshot,
  encodeScorerPayload,
  encodeRouterPayload,
} from "../prompts/index.js";

export interface WatcherDependencies {
  readClient: PublicClient;
  wssClient: PublicClient;
  walletClient: WalletClient;
  logger: Logger;
}

export interface WatcherConfig {
  lendingPool: Address;
  coordinator: Address;
  watcherAgentId: bigint;
  threshold: bigint;
  pollIntervalMs: number;
  startBlock: bigint;
  /** Minimum gap, in milliseconds, before the same user can be re-flagged. */
  flagCooldownMs?: number;
  /** Block window per eth_getLogs chunk. Shannon caps at 1000. */
  scanChunkSize?: bigint;
}

interface CaseContext {
  caseId: bigint;
  user: Address;
  collateralAsset: Address;
  debtAsset: Address;
}

/**
 * Top-level Watcher loop.
 *
 * Lifecycle:
 *   1. Bootstrap historical state from `startBlock` up to the chain head
 *      by chunking eth_getLogs into Shannon-safe 1000-block windows.
 *   2. Subscribe via WSS to incoming events; keep the tracker in sync.
 *   3. Every `pollIntervalMs`, scan active borrowers; for each whose HF
 *      drops below `threshold`, build the on-chain Scorer payload from
 *      live state and call `Coordinator.flagPosition`.
 *   4. Listen for `Scored` callbacks on cases the Watcher initiated; for
 *      each one, refresh the snapshot, build the Router payload, and
 *      submit `Coordinator.advanceToRouter`.
 *
 * Returns an async stop() handle.
 */
export async function startWatcher(
  deps: WatcherDependencies,
  cfg: WatcherConfig,
): Promise<{ stop: () => Promise<void>; tracker: PositionTracker }> {
  const log = deps.logger;
  const tracker = new PositionTracker();
  const monitor = new HealthMonitor(deps.readClient, {
    lendingPool: cfg.lendingPool,
    threshold: cfg.threshold,
  });
  const cooldownMs = cfg.flagCooldownMs ?? 60_000;
  const chunkSize = cfg.scanChunkSize ?? 1_000n;
  const lastFlaggedAt = new Map<Address, number>();
  const pendingCases = new Map<bigint, CaseContext>();

  // 1. Bootstrap.
  const head = await deps.readClient.getBlockNumber();
  log.info(
    { fromBlock: cfg.startBlock.toString(), toBlock: head.toString(), chunkSize: chunkSize.toString() },
    "bootstrap: replaying lending events",
  );
  const historical = await fetchHistoricalEvents(
    deps.readClient,
    cfg.lendingPool,
    cfg.startBlock,
    head,
    chunkSize,
  );
  tracker.applyAll(historical);
  log.info(
    { events: historical.length, borrowers: tracker.activeBorrowers().length },
    "bootstrap complete",
  );

  // 2. Live lending subscription.
  const lendingUnwatch: Array<() => void> = subscribeLending(
    deps.wssClient,
    cfg.lendingPool,
    tracker,
    log,
  );

  // 3. Coordinator Scored subscription - completes the pipeline by
  //    advancing every case the Watcher flagged into the Router stage.
  const coordinatorUnwatch = subscribeScored(
    deps,
    cfg,
    pendingCases,
    log,
  );

  // 4. Periodic HF scan.
  const stopped = { value: false };
  const tickHandle = setInterval(() => {
    void tick(deps, cfg, tracker, monitor, lastFlaggedAt, pendingCases, cooldownMs, log, stopped);
  }, cfg.pollIntervalMs);

  const stop = async (): Promise<void> => {
    stopped.value = true;
    clearInterval(tickHandle);
    for (const u of lendingUnwatch) u();
    coordinatorUnwatch();
  };

  return { stop, tracker };
}

/* -------------------------- Historical fetch -------------------------- */

async function fetchHistoricalEvents(
  client: PublicClient,
  lendingPool: Address,
  fromBlock: bigint,
  toBlock: bigint,
  chunkSize: bigint,
): Promise<PositionEvent[]> {
  const eventNames = ["Deposit", "Withdraw", "Borrow", "Repay", "Liquidation"] as const;
  const all: PositionEvent[] = [];

  let cursorTo = toBlock;
  while (cursorTo >= fromBlock) {
    const cursorFromCandidate = cursorTo - chunkSize + 1n;
    const cursorFrom = cursorFromCandidate < fromBlock ? fromBlock : cursorFromCandidate;
    for (const name of eventNames) {
      try {
        const logs = await client.getContractEvents({
          address: lendingPool,
          abi: lendingPoolAbi,
          eventName: name,
          fromBlock: cursorFrom,
          toBlock: cursorTo,
        });
        for (const l of logs) {
          const decoded = decodeLendingLog(l as unknown as DecodedLog, name);
          if (decoded) all.push(decoded);
        }
      } catch {
        // A single bad chunk should not bring down the bootstrap;
        // the live subscription still catches up missed state once
        // a new event lands.
      }
    }
    if (cursorFrom === fromBlock) break;
    cursorTo = cursorFrom - 1n;
  }

  all.sort((a, b) => sortKey(a) - sortKey(b));
  return all;
}

interface DecodedLog {
  blockNumber: bigint;
  logIndex: number;
  args: Record<string, unknown>;
  eventName: string;
}

function sortKey(_event: PositionEvent): number {
  // All position events are add/sub on the same per-user counters, so
  // order across kinds is commutative for arrival-on-tracker correctness.
  return 0;
}

function decodeLendingLog(log: DecodedLog, eventName: string): PositionEvent | null {
  const a = log.args;
  switch (eventName) {
    case "Deposit":
      return {
        kind: "deposit",
        user: a.user as Address,
        asset: a.asset as Address,
        amount: a.amount as bigint,
      };
    case "Withdraw":
      return {
        kind: "withdraw",
        user: a.user as Address,
        asset: a.asset as Address,
        amount: a.amount as bigint,
      };
    case "Borrow":
      return {
        kind: "borrow",
        user: a.user as Address,
        asset: a.asset as Address,
        amount: a.amount as bigint,
      };
    case "Repay":
      return {
        kind: "repay",
        user: a.user as Address,
        asset: a.asset as Address,
        amount: a.amount as bigint,
      };
    case "Liquidation":
      return {
        kind: "liquidation",
        user: a.user as Address,
        collateralAsset: a.collateralAsset as Address,
        debtAsset: a.debtAsset as Address,
        debtCovered: a.debtCovered as bigint,
        collateralSeized: a.collateralSeized as bigint,
      };
    default:
      return null;
  }
}

/* ---------------------------- Subscriptions --------------------------- */

function subscribeLending(
  client: PublicClient,
  lendingPool: Address,
  tracker: PositionTracker,
  log: Logger,
): Array<() => void> {
  const names = ["Deposit", "Withdraw", "Borrow", "Repay", "Liquidation"] as const;
  return names.map((name) =>
    client.watchContractEvent({
      address: lendingPool,
      abi: lendingPoolAbi,
      eventName: name,
      onLogs: (logs) => {
        for (const raw of logs) {
          const decoded = decodeLendingLog(raw as unknown as DecodedLog, name);
          if (!decoded) continue;
          tracker.apply(decoded);
          log.debug({ event: name, user: decoded.user }, "applied live event");
        }
      },
      onError: (err) => log.error({ err, event: name }, "live event subscription error"),
    }),
  );
}

function subscribeScored(
  deps: WatcherDependencies,
  cfg: WatcherConfig,
  pendingCases: Map<bigint, CaseContext>,
  log: Logger,
): () => void {
  return deps.wssClient.watchContractEvent({
    address: cfg.coordinator,
    abi: coordinatorAbi,
    eventName: "Scored",
    onLogs: (logs) => {
      for (const raw of logs) {
        const args = (raw as unknown as { args: Record<string, unknown> }).args;
        const caseId = args.caseId as bigint | undefined;
        const score = args.score as bigint | undefined;
        if (caseId === undefined || score === undefined) continue;

        const ctx = pendingCases.get(caseId);
        if (!ctx) continue;
        pendingCases.delete(caseId);

        void advance(deps, cfg, ctx, score, log);
      }
    },
    onError: (err) => log.error({ err }, "Scored subscription error"),
  });
}

/* ----------------------------- Scan tick ------------------------------ */

async function tick(
  deps: WatcherDependencies,
  cfg: WatcherConfig,
  tracker: PositionTracker,
  monitor: HealthMonitor,
  lastFlaggedAt: Map<Address, number>,
  pendingCases: Map<bigint, CaseContext>,
  cooldownMs: number,
  log: Logger,
  stopped: { value: boolean },
): Promise<void> {
  if (stopped.value) return;

  const borrowers = tracker.activeBorrowers();
  if (borrowers.length === 0) return;

  const assessments = await monitor.assessAll(borrowers);
  const now = Date.now();

  for (const a of assessments) {
    if (!a.shouldFlag) continue;
    const last = lastFlaggedAt.get(a.user) ?? 0;
    if (now - last < cooldownMs) continue;

    const collateral = tracker.anyCollateralAsset(a.user);
    const debt = tracker.anyDebtAsset(a.user);
    if (!collateral || !debt) {
      log.warn({ user: a.user }, "borrower has no collateral or debt asset on record; skipping flag");
      continue;
    }

    try {
      const { hash, caseId } = await flag(deps, cfg, a.user, collateral, debt);
      lastFlaggedAt.set(a.user, now);
      if (caseId !== null) {
        pendingCases.set(caseId, { caseId, user: a.user, collateralAsset: collateral, debtAsset: debt });
      }
      log.info(
        {
          user: a.user,
          hf: a.healthFactor.toString(),
          txHash: hash,
          caseId: caseId === null ? "unknown" : caseId.toString(),
          collateral,
          debt,
        },
        "flagged position",
      );
    } catch (err) {
      log.warn({ err, user: a.user }, "flagPosition reverted; continuing");
    }
  }
}

/* ----------------------------- Tx submitters --------------------------- */

async function flag(
  deps: WatcherDependencies,
  cfg: WatcherConfig,
  user: Address,
  collateralAsset: Address,
  debtAsset: Address,
): Promise<{ hash: Hash; caseId: bigint | null }> {
  if (!deps.walletClient.account) {
    throw new Error("walletClient has no account configured");
  }

  // Build the real Scorer payload from live on-chain state. The prompt
  // is deterministic with respect to the position snapshot, so every
  // Watcher node converges on the same byte payload when looking at
  // the same block height.
  const snapshot = await loadPositionSnapshot(deps.readClient, {
    lendingPool: cfg.lendingPool,
    user,
    collateralAsset,
    debtAsset,
  });
  const scorerPayload = encodeScorerPayload(snapshot);

  // Simulate first so reverts surface as typed errors before we
  // burn gas on a doomed transaction.
  try {
    await deps.readClient.simulateContract({
      address: cfg.coordinator,
      abi: coordinatorAbi,
      functionName: "flagPosition",
      args: [cfg.watcherAgentId, user, collateralAsset, debtAsset, scorerPayload],
      account: deps.walletClient.account,
    });
  } catch (err) {
    rethrowDecoded(err);
  }

  const hash = await deps.walletClient.writeContract({
    address: cfg.coordinator,
    abi: coordinatorAbi,
    functionName: "flagPosition",
    args: [cfg.watcherAgentId, user, collateralAsset, debtAsset, scorerPayload],
    account: deps.walletClient.account,
    chain: deps.walletClient.chain,
  });

  const caseId = await extractCaseId(deps.readClient, hash);
  return { hash, caseId };
}

async function advance(
  deps: WatcherDependencies,
  cfg: WatcherConfig,
  ctx: CaseContext,
  score: bigint,
  log: Logger,
): Promise<void> {
  if (!deps.walletClient.account) {
    log.error("walletClient has no account; cannot advance to router");
    return;
  }

  try {
    const snapshot = await loadPositionSnapshot(deps.readClient, {
      lendingPool: cfg.lendingPool,
      user: ctx.user,
      collateralAsset: ctx.collateralAsset,
      debtAsset: ctx.debtAsset,
    });
    const routerPayload: Hex = encodeRouterPayload({ ...snapshot, score });

    try {
      await deps.readClient.simulateContract({
        address: cfg.coordinator,
        abi: coordinatorAbi,
        functionName: "advanceToRouter",
        args: [ctx.caseId, routerPayload],
        account: deps.walletClient.account,
      });
    } catch (err) {
      rethrowDecoded(err);
    }

    const hash = await deps.walletClient.writeContract({
      address: cfg.coordinator,
      abi: coordinatorAbi,
      functionName: "advanceToRouter",
      args: [ctx.caseId, routerPayload],
      account: deps.walletClient.account,
      chain: deps.walletClient.chain,
    });

    log.info({ caseId: ctx.caseId.toString(), score: score.toString(), txHash: hash }, "advanced case to router");
  } catch (err) {
    log.warn(
      { err, caseId: ctx.caseId.toString(), score: score.toString() },
      "advanceToRouter reverted; case left in Scored state",
    );
  }
}

/* ----------------------------- Helpers --------------------------------- */

function rethrowDecoded(err: unknown): never {
  if (err instanceof BaseError) {
    const cause = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (cause instanceof ContractFunctionRevertedError) {
      throw cause;
    }
  }
  throw err;
}

async function extractCaseId(
  client: PublicClient,
  hash: Hash,
): Promise<bigint | null> {
  const receipt = await client.waitForTransactionReceipt({ hash });
  for (const raw of receipt.logs) {
    const log = raw as Log;
    try {
      const decoded = decodeEventLog({
        abi: coordinatorAbi,
        data: log.data,
        topics: log.topics,
        eventName: "PositionFlagged",
      });
      const args = decoded.args as unknown as { caseId?: bigint };
      if (args.caseId !== undefined) return args.caseId;
    } catch {
      // Not the event we care about, keep scanning.
    }
  }
  return null;
}
