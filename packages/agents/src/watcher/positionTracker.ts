import type { Address } from "viem";

/**
 * In-memory mirror of every active LendingPool position.
 *
 * The tracker is intentionally pure: it consumes already-decoded event
 * payloads and exposes synchronous lookups. Network I/O lives elsewhere
 * (bootstrap and live subscription wrap this), so all behaviour here is
 * deterministic and unit-testable.
 */

export type PositionEvent =
  | { kind: "deposit"; user: Address; asset: Address; amount: bigint }
  | { kind: "withdraw"; user: Address; asset: Address; amount: bigint }
  | { kind: "borrow"; user: Address; asset: Address; amount: bigint }
  | { kind: "repay"; user: Address; asset: Address; amount: bigint }
  | {
      kind: "liquidation";
      user: Address;
      collateralAsset: Address;
      debtAsset: Address;
      debtCovered: bigint;
      collateralSeized: bigint;
    };

export class PositionTracker {
  private readonly _collateral = new Map<Address, Map<Address, bigint>>();
  private readonly _debt = new Map<Address, Map<Address, bigint>>();

  apply(event: PositionEvent): void {
    switch (event.kind) {
      case "deposit":
        this._add(this._collateral, event.user, event.asset, event.amount);
        return;
      case "withdraw":
        this._sub(this._collateral, event.user, event.asset, event.amount);
        return;
      case "borrow":
        this._add(this._debt, event.user, event.asset, event.amount);
        return;
      case "repay":
        this._sub(this._debt, event.user, event.asset, event.amount);
        return;
      case "liquidation":
        this._sub(this._debt, event.user, event.debtAsset, event.debtCovered);
        this._sub(this._collateral, event.user, event.collateralAsset, event.collateralSeized);
        return;
    }
  }

  applyAll(events: readonly PositionEvent[]): void {
    for (const e of events) this.apply(e);
  }

  collateralOf(user: Address, asset: Address): bigint {
    return this._collateral.get(user)?.get(asset) ?? 0n;
  }

  debtOf(user: Address, asset: Address): bigint {
    return this._debt.get(user)?.get(asset) ?? 0n;
  }

  hasDebt(user: Address): boolean {
    const positions = this._debt.get(user);
    if (!positions) return false;
    for (const amount of positions.values()) if (amount > 0n) return true;
    return false;
  }

  activeBorrowers(): Address[] {
    const out: Address[] = [];
    for (const [user, positions] of this._debt.entries()) {
      for (const amount of positions.values()) {
        if (amount > 0n) {
          out.push(user);
          break;
        }
      }
    }
    return out;
  }

  anyCollateralAsset(user: Address): Address | null {
    return this._anyAssetWithBalance(this._collateral, user);
  }

  anyDebtAsset(user: Address): Address | null {
    return this._anyAssetWithBalance(this._debt, user);
  }

  /* ----------------------------- Internals ----------------------------- */

  private _add(
    book: Map<Address, Map<Address, bigint>>,
    user: Address,
    asset: Address,
    amount: bigint,
  ): void {
    let positions = book.get(user);
    if (!positions) {
      positions = new Map();
      book.set(user, positions);
    }
    positions.set(asset, (positions.get(asset) ?? 0n) + amount);
  }

  private _sub(
    book: Map<Address, Map<Address, bigint>>,
    user: Address,
    asset: Address,
    amount: bigint,
  ): void {
    const positions = book.get(user);
    if (!positions) return;
    const current = positions.get(asset) ?? 0n;
    const next = current > amount ? current - amount : 0n;
    if (next === 0n) positions.delete(asset);
    else positions.set(asset, next);
    if (positions.size === 0) book.delete(user);
  }

  private _anyAssetWithBalance(
    book: Map<Address, Map<Address, bigint>>,
    user: Address,
  ): Address | null {
    const positions = book.get(user);
    if (!positions) return null;
    for (const [asset, amount] of positions.entries()) {
      if (amount > 0n) return asset;
    }
    return null;
  }
}
