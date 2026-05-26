import type { Address, Hex } from "viem";
import { formatUnits } from "viem";

export function shortAddress(addr: Address | Hex | undefined | null, head = 6, tail = 4): string {
  if (!addr) return "-";
  const s = addr.toString();
  if (s.length <= head + tail + 2) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

export function formatAmount(raw: bigint, decimals: number, displayDecimals = 4): string {
  const s = formatUnits(raw, decimals);
  const [whole, frac = ""] = s.split(".");
  if (!frac || displayDecimals === 0) return whole ?? "0";
  const trimmed = frac.slice(0, displayDecimals).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : (whole ?? "0");
}

/** Health factor in 1e18 scale → short decimal string. type(uint256).max
 *  (no debt) renders as the infinity glyph. */
export function formatHealthFactor(hf18: bigint): string {
  if (hf18 >= 10n ** 30n) return "∞";
  return formatAmount(hf18, 18, 4);
}

export function formatTimeAgo(unixSeconds: number, now = Date.now() / 1000): string {
  const delta = Math.max(0, Math.floor(now - unixSeconds));
  if (delta < 5) return "just now";
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86_400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86_400)}d ago`;
}

export const EXPLORER_BASE = "https://shannon-explorer.somnia.network";

export const explorer = {
  tx: (hash: string) => `${EXPLORER_BASE}/tx/${hash}`,
  address: (addr: string) => `${EXPLORER_BASE}/address/${addr}`,
  block: (n: number | bigint) => `${EXPLORER_BASE}/block/${n.toString()}`,
};
