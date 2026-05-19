import { describe, it, expect, vi } from "vitest";
import type { Address, PublicClient } from "viem";

import { HealthMonitor, HF_ONE } from "../src/watcher/healthMonitor.js";

const user = "0x000000000000000000000000000000000000a11c" as Address;
const lendingPool = "0x000000000000000000000000000000000000d00d" as Address;

function makeClient(returnValue: bigint): PublicClient {
  // Only readContract is exercised; cast keeps the test isolated from the
  // wider viem surface.
  return {
    readContract: vi.fn(async () => returnValue),
  } as unknown as PublicClient;
}

describe("HealthMonitor.shouldFlag", () => {
  // 1.05 in 18-decimal scale (the default Sentinel watcher threshold).
  const threshold = 1_050_000_000_000_000_000n;
  const monitor = new HealthMonitor(makeClient(0n), { lendingPool, threshold });

  it("flags positions strictly below threshold", () => {
    expect(monitor.shouldFlag(threshold - 1n)).toBe(true);
    expect(monitor.shouldFlag(threshold)).toBe(false);
    expect(monitor.shouldFlag(threshold + 1n)).toBe(false);
  });

  it("does not flag positions at HF=1", () => {
    expect(monitor.shouldFlag(HF_ONE)).toBe(true); // 1.0 is below 1.05
  });

  it("does not flag positions with zero HF (no debt — sentinel value)", () => {
    expect(monitor.shouldFlag(0n)).toBe(false);
  });

  it("does not flag positions far above threshold", () => {
    expect(monitor.shouldFlag(2n * HF_ONE)).toBe(false);
  });
});

describe("HealthMonitor.assess", () => {
  it("delegates HF retrieval to the public client", async () => {
    const client = makeClient(900_000_000_000_000_000n); // 0.9
    const monitor = new HealthMonitor(client, {
      lendingPool,
      threshold: 1_050_000_000_000_000_000n,
    });

    const a = await monitor.assess(user);
    expect(a.user).toBe(user);
    expect(a.healthFactor).toBe(900_000_000_000_000_000n);
    expect(a.shouldFlag).toBe(true);
  });
});
