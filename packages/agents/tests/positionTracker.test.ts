import { describe, it, expect } from "vitest";
import type { Address } from "viem";

import { PositionTracker, type PositionEvent } from "../src/watcher/positionTracker.js";

const alice = "0x000000000000000000000000000000000000a11c" as Address;
const bob = "0x0000000000000000000000000000000000000B0B" as Address;
const weth = "0x0000000000000000000000000000000000000111" as Address;
const usdc = "0x0000000000000000000000000000000000000222" as Address;

describe("PositionTracker", () => {
  it("starts empty", () => {
    const t = new PositionTracker();
    expect(t.activeBorrowers()).toEqual([]);
    expect(t.collateralOf(alice, weth)).toBe(0n);
    expect(t.debtOf(alice, usdc)).toBe(0n);
    expect(t.hasDebt(alice)).toBe(false);
  });

  it("records deposits and withdrawals net-of", () => {
    const t = new PositionTracker();
    t.apply({ kind: "deposit", user: alice, asset: weth, amount: 10n });
    t.apply({ kind: "deposit", user: alice, asset: weth, amount: 5n });
    expect(t.collateralOf(alice, weth)).toBe(15n);

    t.apply({ kind: "withdraw", user: alice, asset: weth, amount: 4n });
    expect(t.collateralOf(alice, weth)).toBe(11n);
  });

  it("clamps subtractions at zero rather than going negative", () => {
    const t = new PositionTracker();
    t.apply({ kind: "deposit", user: alice, asset: weth, amount: 3n });
    t.apply({ kind: "withdraw", user: alice, asset: weth, amount: 10n });
    expect(t.collateralOf(alice, weth)).toBe(0n);
  });

  it("records debt via borrow and reduces it via repay", () => {
    const t = new PositionTracker();
    t.apply({ kind: "borrow", user: alice, asset: usdc, amount: 1_000n });
    t.apply({ kind: "borrow", user: alice, asset: usdc, amount: 500n });
    expect(t.debtOf(alice, usdc)).toBe(1_500n);
    expect(t.hasDebt(alice)).toBe(true);

    t.apply({ kind: "repay", user: alice, asset: usdc, amount: 400n });
    expect(t.debtOf(alice, usdc)).toBe(1_100n);
  });

  it("removes the user from active-borrowers when debt is fully repaid", () => {
    const t = new PositionTracker();
    t.apply({ kind: "borrow", user: alice, asset: usdc, amount: 100n });
    t.apply({ kind: "repay", user: alice, asset: usdc, amount: 100n });
    expect(t.hasDebt(alice)).toBe(false);
    expect(t.activeBorrowers()).toEqual([]);
  });

  it("applies liquidation: subtracts from both debt and collateral", () => {
    const t = new PositionTracker();
    t.apply({ kind: "deposit", user: alice, asset: weth, amount: 10n });
    t.apply({ kind: "borrow", user: alice, asset: usdc, amount: 1_500n });

    t.apply({
      kind: "liquidation",
      user: alice,
      collateralAsset: weth,
      debtAsset: usdc,
      debtCovered: 750n,
      collateralSeized: 4n,
    });

    expect(t.debtOf(alice, usdc)).toBe(750n);
    expect(t.collateralOf(alice, weth)).toBe(6n);
  });

  it("lists multiple active borrowers exactly once each", () => {
    const t = new PositionTracker();
    t.apply({ kind: "borrow", user: alice, asset: usdc, amount: 1n });
    t.apply({ kind: "borrow", user: bob, asset: usdc, amount: 2n });
    t.apply({ kind: "borrow", user: bob, asset: usdc, amount: 3n }); // duplicate user
    const borrowers = t.activeBorrowers();
    expect(borrowers).toHaveLength(2);
    expect(borrowers).toContain(alice);
    expect(borrowers).toContain(bob);
  });

  it("anyCollateralAsset / anyDebtAsset return the first asset with non-zero balance", () => {
    const t = new PositionTracker();
    t.apply({ kind: "deposit", user: alice, asset: weth, amount: 10n });
    t.apply({ kind: "borrow", user: alice, asset: usdc, amount: 500n });

    expect(t.anyCollateralAsset(alice)).toBe(weth);
    expect(t.anyDebtAsset(alice)).toBe(usdc);
    expect(t.anyCollateralAsset(bob)).toBeNull();
  });

  it("applyAll replays a chronological event sequence", () => {
    const events: PositionEvent[] = [
      { kind: "deposit", user: alice, asset: weth, amount: 10n },
      { kind: "borrow", user: alice, asset: usdc, amount: 1_500n },
      { kind: "repay", user: alice, asset: usdc, amount: 500n },
      {
        kind: "liquidation",
        user: alice,
        collateralAsset: weth,
        debtAsset: usdc,
        debtCovered: 500n,
        collateralSeized: 2n,
      },
    ];
    const t = new PositionTracker();
    t.applyAll(events);

    expect(t.collateralOf(alice, weth)).toBe(8n);
    expect(t.debtOf(alice, usdc)).toBe(500n);
  });
});
