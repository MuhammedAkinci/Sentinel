import type { Address, PublicClient } from "viem";

import { lendingPoolAbi, priceOracleAdapterAbi, mintableErc20Abi } from "../core/abis.js";
import type { PositionSnapshot } from "./types.js";

/**
 * Reserve configuration as returned by `LendingPool.reserveConfig`.
 * The fields are mirrored from `ILendingPool.ReserveConfig` and
 * narrowed here because our ABI is consumed at runtime through a loose
 * `Abi` cast.
 */
interface OnchainReserveConfig {
  isActive: boolean;
  canBeCollateral: boolean;
  canBeBorrowed: boolean;
  liquidationThresholdBps: number;
  liquidationBonusBps: number;
  closeFactorBps: number;
  underlying: Address;
  sToken: Address;
  underlyingDecimals: number;
}

export interface ContextLoaderArgs {
  lendingPool: Address;
  user: Address;
  collateralAsset: Address;
  debtAsset: Address;
}

/**
 * Reads everything the Scorer / Router prompts need from the live chain
 * state. Calls are issued in two batches: first the reserve configs and
 * oracle address (so we know which sToken to call and which decimals to
 * apply), then balances, prices, and symbols in parallel.
 */
export async function loadPositionSnapshot(
  client: PublicClient,
  args: ContextLoaderArgs,
): Promise<PositionSnapshot> {
  const collReserve = (await client.readContract({
    address: args.lendingPool,
    abi: lendingPoolAbi,
    functionName: "reserveConfig",
    args: [args.collateralAsset],
  })) as OnchainReserveConfig;

  const debtReserve = (await client.readContract({
    address: args.lendingPool,
    abi: lendingPoolAbi,
    functionName: "reserveConfig",
    args: [args.debtAsset],
  })) as OnchainReserveConfig;

  const oracleAddress = (await client.readContract({
    address: args.lendingPool,
    abi: lendingPoolAbi,
    functionName: "oracle",
  })) as Address;

  const [
    collateralBalance,
    debtBalance,
    collateralPriceUsd18,
    debtPriceUsd18,
    collateralSymbol,
    debtSymbol,
    healthFactor18,
  ] = await Promise.all([
    client.readContract({
      address: collReserve.sToken,
      abi: mintableErc20Abi,
      functionName: "balanceOf",
      args: [args.user],
    }) as Promise<bigint>,
    client.readContract({
      address: args.lendingPool,
      abi: lendingPoolAbi,
      functionName: "debtOf",
      args: [args.user, args.debtAsset],
    }) as Promise<bigint>,
    client.readContract({
      address: oracleAddress,
      abi: priceOracleAdapterAbi,
      functionName: "getAssetPrice",
      args: [args.collateralAsset],
    }) as Promise<bigint>,
    client.readContract({
      address: oracleAddress,
      abi: priceOracleAdapterAbi,
      functionName: "getAssetPrice",
      args: [args.debtAsset],
    }) as Promise<bigint>,
    client.readContract({
      address: args.collateralAsset,
      abi: mintableErc20Abi,
      functionName: "symbol",
    }) as Promise<string>,
    client.readContract({
      address: args.debtAsset,
      abi: mintableErc20Abi,
      functionName: "symbol",
    }) as Promise<string>,
    client.readContract({
      address: args.lendingPool,
      abi: lendingPoolAbi,
      functionName: "healthFactor",
      args: [args.user],
    }) as Promise<bigint>,
  ]);

  return {
    user: args.user,

    collateralAsset: args.collateralAsset,
    collateralSymbol,
    collateralDecimals: collReserve.underlyingDecimals,
    collateralBalance,
    collateralPriceUsd18,
    liquidationThresholdBps: collReserve.liquidationThresholdBps,
    liquidationBonusBps: collReserve.liquidationBonusBps,

    debtAsset: args.debtAsset,
    debtSymbol,
    debtDecimals: debtReserve.underlyingDecimals,
    debtBalance,
    debtPriceUsd18,
    closeFactorBps: debtReserve.closeFactorBps,

    healthFactor18,
  };
}
