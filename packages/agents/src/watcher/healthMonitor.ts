import type { Address, PublicClient } from "viem";

import { lendingPoolAbi } from "../core/abis.js";

const HF_SCALE = 10n ** 18n;

export interface HealthAssessment {
  user: Address;
  healthFactor: bigint;
  shouldFlag: boolean;
}

export interface HealthMonitorConfig {
  lendingPool: Address;
  threshold: bigint; // 18-decimal scaled (e.g. 1.05 → 1050000000000000000n)
}

export class HealthMonitor {
  constructor(
    private readonly client: PublicClient,
    private readonly cfg: HealthMonitorConfig,
  ) {}

  /**
   * Returns true when `hf` indicates the position is meaningfully drifting
   * toward liquidation and should be flagged through Sentinel.
   *
   * Sentinel flags a wider band than the on-chain liquidation threshold
   * (HF < 1) so the Scorer and Router consensus calls have time to
   * complete before another keeper races us to the on-chain liquidation.
   */
  shouldFlag(hf: bigint): boolean {
    return hf > 0n && hf < this.cfg.threshold;
  }

  async assess(user: Address): Promise<HealthAssessment> {
    const hf = (await this.client.readContract({
      address: this.cfg.lendingPool,
      abi: lendingPoolAbi,
      functionName: "healthFactor",
      args: [user],
    })) as bigint;
    return { user, healthFactor: hf, shouldFlag: this.shouldFlag(hf) };
  }

  async assessAll(users: readonly Address[]): Promise<HealthAssessment[]> {
    return Promise.all(users.map((u) => this.assess(u)));
  }
}

/** Convenience: returns the HF of a value-equality 1.0 position scaled 1e18. */
export const HF_ONE = HF_SCALE;
