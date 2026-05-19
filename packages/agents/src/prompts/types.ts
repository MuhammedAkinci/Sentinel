import type { Address } from "viem";

/**
 * Snapshot of an at-risk lending position, captured at the moment a
 * Sentinel agent is about to be invoked against it. Every value is in
 * the contract's native representation: token balances in underlying
 * base units, prices in 18-decimal USD scale, health factor in
 * 18-decimal scale, basis points as integers.
 */
export interface PositionSnapshot {
  user: Address;

  collateralAsset: Address;
  collateralSymbol: string;
  collateralDecimals: number;
  collateralBalance: bigint;
  collateralPriceUsd18: bigint;
  liquidationThresholdBps: number;
  liquidationBonusBps: number;

  debtAsset: Address;
  debtSymbol: string;
  debtDecimals: number;
  debtBalance: bigint;
  debtPriceUsd18: bigint;
  closeFactorBps: number;

  healthFactor18: bigint;
}

/** Input to the Scorer prompt builder. Pure rename of PositionSnapshot
 *  to make call sites explicit about which builder consumes the value. */
export type ScorerInput = PositionSnapshot;

/** Input to the Router prompt builder. Extends the snapshot with the
 *  upstream Scorer's output. */
export interface RouterInput extends PositionSnapshot {
  /** Scorer's verdict for this case, 0..10_000. */
  score: bigint;
}
