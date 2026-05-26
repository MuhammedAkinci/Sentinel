"use client";

import { useEffect, useState } from "react";
import type { Address, PublicClient } from "viem";
import { usePublicClient } from "wagmi";

import { addresses } from "~/lib/env";
import { lendingPoolAbi, mintableErc20Abi } from "~/lib/abis";

export interface Position {
  user: Address;
  collateralAsset: Address;
  collateralBalance: bigint;
  collateralDecimals: number;
  collateralSymbol: string;
  debtAsset: Address;
  debtBalance: bigint;
  debtDecimals: number;
  debtSymbol: string;
  healthFactor18: bigint;
}

interface UseActivePositionsResult {
  positions: ReadonlyArray<Position>;
  loading: boolean;
  refetch: () => void;
}

const SCAN_CHUNK = 1_000n; // Shannon RPC caps eth_getLogs at 1000 blocks/call.
const SCAN_CHUNKS = 8; // 8k-block window covers ~10-15 minutes at Shannon block rate.
const POLL_MS = 8_000;

/**
 * Builds and refreshes the active-borrower set:
 *
 * 1. On mount we chunk-scan the recent Borrow logs (the RPC caps each
 *    eth_getLogs call at 1000 blocks, so we paginate manually).
 * 2. New borrowers detected through the dashboard's WSS subscription
 *    can be folded in via `addUser` (exposed for the orchestrator to
 *    wire up if needed).
 * 3. A timer reads the current debt and HF for every known borrower.
 */
export function useActivePositions(extraUsers: ReadonlyArray<Address> = []): UseActivePositionsResult {
  const client = usePublicClient();
  const [users, setUsers] = useState<Set<Address>>(() => new Set());
  const [positions, setPositions] = useState<ReadonlyArray<Position>>([]);
  const [loading, setLoading] = useState(true);
  const [reserveContext, setReserveContext] = useState<ReserveContext | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = () => setTick((n) => n + 1);

  // Fold WSS-derived users into the known set without dropping existing ones.
  useEffect(() => {
    if (extraUsers.length === 0) return;
    setUsers((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const u of extraUsers) {
        if (!next.has(u)) {
          next.add(u);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [extraUsers]);

  // 1. Resolve reserve context once.
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    (async () => {
      try {
        const ctx = await loadReserveContext(client);
        if (!cancelled) setReserveContext(ctx);
      } catch {
        if (!cancelled) setReserveContext(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  // 2. Bootstrap the borrower set from recent Borrow logs. Repeats on
  //    every poll tick so positions opened after the page mounted are
  //    picked up within POLL_MS without requiring a manual refresh.
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    (async () => {
      try {
        const discovered = await scanRecentBorrowers(client);
        if (!cancelled && discovered.size > 0) {
          setUsers((prev) => mergeSets(prev, discovered));
        }
      } catch {
        // Tolerant; next tick retries. WSS Borrow events fed through
        // `extraUsers` still surface new positions instantly.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, tick]);

  // 3. Periodically refresh balances + HF for every known borrower.
  useEffect(() => {
    if (!client || !reserveContext) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (users.size === 0) {
          if (!cancelled) setPositions([]);
          return;
        }
        const built: Position[] = [];
        for (const user of users) {
          const p = await loadUserPosition(client, reserveContext, user);
          if (p) built.push(p);
        }
        built.sort((a, b) => (a.healthFactor18 < b.healthFactor18 ? -1 : 1));
        if (!cancelled) setPositions(built);
      } catch {
        if (!cancelled) setPositions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, reserveContext, users, tick]);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), POLL_MS);
    return () => clearInterval(id);
  }, []);

  return { positions, loading, refetch };
}

interface ReserveContext {
  collateralAsset: Address;
  collateralDecimals: number;
  collateralSymbol: string;
  collateralSToken: Address;
  debtAsset: Address;
  debtDecimals: number;
  debtSymbol: string;
}

async function loadReserveContext(client: PublicClient): Promise<ReserveContext> {
  const reserveList = (await client.readContract({
    address: addresses.pool,
    abi: lendingPoolAbi,
    functionName: "reserveList",
  })) as readonly Address[];

  let collateralAsset: Address | null = null;
  let debtAsset: Address | null = null;
  let collateralSToken: Address | null = null;

  for (const asset of reserveList) {
    const cfg = (await client.readContract({
      address: addresses.pool,
      abi: lendingPoolAbi,
      functionName: "reserveConfig",
      args: [asset],
    })) as {
      canBeCollateral: boolean;
      canBeBorrowed: boolean;
      sToken: Address;
    };
    if (!collateralAsset && cfg.canBeCollateral) {
      collateralAsset = asset;
      collateralSToken = cfg.sToken;
    }
    if (!debtAsset && cfg.canBeBorrowed) debtAsset = asset;
  }
  if (!collateralAsset || !debtAsset || !collateralSToken) {
    throw new Error("Reserves not configured for collateral + debt pair");
  }

  const [collateralSymbol, collateralDecimals, debtSymbol, debtDecimals] = await Promise.all([
    client.readContract({
      address: collateralAsset,
      abi: mintableErc20Abi,
      functionName: "symbol",
    }) as Promise<string>,
    client.readContract({
      address: collateralAsset,
      abi: mintableErc20Abi,
      functionName: "decimals",
    }) as Promise<number>,
    client.readContract({
      address: debtAsset,
      abi: mintableErc20Abi,
      functionName: "symbol",
    }) as Promise<string>,
    client.readContract({
      address: debtAsset,
      abi: mintableErc20Abi,
      functionName: "decimals",
    }) as Promise<number>,
  ]);

  return {
    collateralAsset,
    collateralDecimals: Number(collateralDecimals),
    collateralSymbol,
    collateralSToken,
    debtAsset,
    debtDecimals: Number(debtDecimals),
    debtSymbol,
  };
}

async function scanRecentBorrowers(client: PublicClient): Promise<Set<Address>> {
  const head = await client.getBlockNumber();
  const set = new Set<Address>();
  for (let i = 0; i < SCAN_CHUNKS; i += 1) {
    const to = head - BigInt(i) * SCAN_CHUNK;
    const fromCandidate = to - SCAN_CHUNK + 1n;
    const from = fromCandidate < 0n ? 0n : fromCandidate;
    try {
      const logs = await client.getContractEvents({
        address: addresses.pool,
        abi: lendingPoolAbi,
        eventName: "Borrow",
        fromBlock: from,
        toBlock: to,
      });
      for (const log of logs) {
        const args = (log as { args?: { user?: Address } }).args;
        if (args?.user) set.add(args.user);
      }
    } catch {
      // One bad chunk should not stop the rest.
    }
    if (from === 0n) break;
  }
  return set;
}

async function loadUserPosition(
  client: PublicClient,
  ctx: ReserveContext,
  user: Address,
): Promise<Position | null> {
  try {
    const [debtBalance, collateralBalance, hf] = await Promise.all([
      client.readContract({
        address: addresses.pool,
        abi: lendingPoolAbi,
        functionName: "debtOf",
        args: [user, ctx.debtAsset],
      }) as Promise<bigint>,
      client.readContract({
        address: ctx.collateralSToken,
        abi: mintableErc20Abi,
        functionName: "balanceOf",
        args: [user],
      }) as Promise<bigint>,
      client.readContract({
        address: addresses.pool,
        abi: lendingPoolAbi,
        functionName: "healthFactor",
        args: [user],
      }) as Promise<bigint>,
    ]);
    if (debtBalance === 0n && collateralBalance === 0n) return null;
    return {
      user,
      collateralAsset: ctx.collateralAsset,
      collateralBalance,
      collateralDecimals: ctx.collateralDecimals,
      collateralSymbol: ctx.collateralSymbol,
      debtAsset: ctx.debtAsset,
      debtBalance,
      debtDecimals: ctx.debtDecimals,
      debtSymbol: ctx.debtSymbol,
      healthFactor18: hf,
    };
  } catch {
    return null;
  }
}

function mergeSets<T>(a: Set<T>, b: Set<T>): Set<T> {
  const out = new Set(a);
  let changed = false;
  for (const v of b) {
    if (!out.has(v)) {
      out.add(v);
      changed = true;
    }
  }
  return changed ? out : a;
}
