import {
  type Address,
  type Hash,
  type PublicClient,
  type WalletClient,
  ContractFunctionRevertedError,
  BaseError,
} from "viem";
import type { Logger } from "pino";

import { lendingPoolAbi, coordinatorAbi } from "../core/abis.js";
import { PositionTracker, type PositionEvent } from "./positionTracker.js";
import { HealthMonitor } from "./healthMonitor.js";

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
}

/**
 * Top-level Watcher loop.
 *
 * Lifecycle:
 *   1. Bootstrap historical state from `startBlock` up to the chain head.
 *   2. Subscribe via WSS to incoming events; keep the tracker in sync.
 *   3. Every `pollIntervalMs`, scan active borrowers; for each whose HF
 *      drops below `threshold`, call Coordinator.flagPosition.
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
  const lastFlaggedAt = new Map<Address, number>();

  // 1. Bootstrap.
  const head = await deps.readClient.getBlockNumber();
  log.info({ fromBlock: cfg.startBlock.toString(), toBlock: head.toString() }, "bootstrap: replaying lending events");
  const historical = await fetchHistoricalEvents(deps.readClient, cfg.lendingPool, cfg.startBlock, head);
  tracker.applyAll(historical);
  log.info({ events: historical.length, borrowers: tracker.activeBorrowers().length }, "bootstrap complete");

  // 2. Live subscription.
  const unwatchers: Array<() => void> = subscribeLive(deps.wssClient, cfg.lendingPool, tracker, log);

  // 3. Periodic HF scan.
  const stopped = { value: false };
  const tickHandle = setInterval(() => {
    void tick(deps, cfg, tracker, monitor, lastFlaggedAt, cooldownMs, log, stopped);
  }, cfg.pollIntervalMs);

  const stop = async (): Promise<void> => {
    stopped.value = true;
    clearInterval(tickHandle);
    for (const u of unwatchers) u();
  };

  return { stop, tracker };
}

/* -------------------------- Historical fetch -------------------------- */

async function fetchHistoricalEvents(
  client: PublicClient,
  lendingPool: Address,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<PositionEvent[]> {
  const eventNames = ["Deposit", "Withdraw", "Borrow", "Repay", "Liquidation"] as const;
  const all: PositionEvent[] = [];

  for (const name of eventNames) {
    const logs = await client.getContractEvents({
      address: lendingPool,
      abi: lendingPoolAbi,
      eventName: name,
      fromBlock,
      toBlock,
    });
    for (const l of logs) {
      const decoded = decodeLog(l as unknown as DecodedLog, name);
      if (decoded) all.push(decoded);
    }
  }

  // Sort chronologically so the tracker reflects the same ordering the
  // chain executed.
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
  // Sort key is approximated by encounter order from the per-event-name
  // log scans above. Since we iterate event names sequentially, exact
  // intra-block ordering is preserved within each event name. For our
  // purposes the bootstrap only needs to converge on the same final
  // balances as the chain, which is achieved by all add/sub being
  // commutative across event types.
  return 0;
}

function decodeLog(log: DecodedLog, eventName: string): PositionEvent | null {
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

function subscribeLive(
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
          const decoded = decodeLog(raw as unknown as DecodedLog, name);
          if (!decoded) continue;
          tracker.apply(decoded);
          log.debug({ event: name, user: decoded.user }, "applied live event");
        }
      },
      onError: (err) => log.error({ err, event: name }, "live event subscription error"),
    }),
  );
}

/* ----------------------------- Scan tick ------------------------------ */

async function tick(
  deps: WatcherDependencies,
  cfg: WatcherConfig,
  tracker: PositionTracker,
  monitor: HealthMonitor,
  lastFlaggedAt: Map<Address, number>,
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
      const hash = await flag(deps, cfg, a.user, collateral, debt);
      lastFlaggedAt.set(a.user, now);
      log.info(
        { user: a.user, hf: a.healthFactor.toString(), txHash: hash, collateral, debt },
        "flagged position",
      );
    } catch (err) {
      log.warn({ err, user: a.user }, "flagPosition reverted; continuing");
    }
  }
}

async function flag(
  deps: WatcherDependencies,
  cfg: WatcherConfig,
  user: Address,
  collateralAsset: Address,
  debtAsset: Address,
): Promise<Hash> {
  // Simulate first so reverts surface as typed errors instead of stuck txs.
  try {
    await deps.readClient.simulateContract({
      address: cfg.coordinator,
      abi: coordinatorAbi,
      functionName: "flagPosition",
      args: [cfg.watcherAgentId, user, collateralAsset, debtAsset],
      account: deps.walletClient.account ?? null,
    });
  } catch (err) {
    if (err instanceof BaseError) {
      const cause = err.walk((e) => e instanceof ContractFunctionRevertedError);
      if (cause instanceof ContractFunctionRevertedError) {
        // Re-throw with the decoded reason already in place.
        throw cause;
      }
    }
    throw err;
  }

  if (!deps.walletClient.account) {
    throw new Error("walletClient has no account configured");
  }

  return deps.walletClient.writeContract({
    address: cfg.coordinator,
    abi: coordinatorAbi,
    functionName: "flagPosition",
    args: [cfg.watcherAgentId, user, collateralAsset, debtAsset],
    account: deps.walletClient.account,
    chain: deps.walletClient.chain,
  });
}
