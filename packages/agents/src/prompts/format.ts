import { formatUnits } from "viem";

/**
 * Formatting helpers used by the Scorer and Router prompt builders.
 *
 * These convert internal bigint representations into the strings that
 * appear in the rendered prompt. No formatting choice is made elsewhere
 * so the prompts produced by the builders are byte-deterministic across
 * machines, matching the requirement that the validator subcommittee
 * reaches consensus on the same input.
 */

/** Trims trailing zeros from a fixed-decimal viem-formatted string,
 *  while keeping at least one decimal digit so the value reads as a
 *  decimal number. e.g. "10.000000000000000000" -> "10.0",
 *  "1.050000000000000000" -> "1.05", "0.500000" -> "0.5".
 */
function trimDecimal(s: string): string {
  if (!s.includes(".")) return `${s}.0`;
  const trimmed = s.replace(/0+$/, "").replace(/\.$/, ".0");
  return trimmed;
}

/** Token amount in human units (e.g. 1500000000n with 6 decimals -> "1500.0"). */
export function formatAmount(raw: bigint, decimals: number): string {
  return trimDecimal(formatUnits(raw, decimals));
}

/** USD value scaled to 18 decimals -> human-readable, two decimals.
 *  e.g. 3_000_500_000_000_000_000_000n -> "3000.50". */
export function formatPriceUsd(priceUsd18: bigint): string {
  const whole = priceUsd18 / 10n ** 18n;
  // Round to 2 decimals: multiply by 100 then divide by 10^18
  const cents = (priceUsd18 % 10n ** 18n) / 10n ** 16n; // 2-digit
  const centsStr = cents.toString().padStart(2, "0");
  return `${whole.toString()}.${centsStr}`;
}

/** USD value scaled to 18 decimals -> human-readable with two decimals.
 *  Identical layout to formatPriceUsd; renamed for prompt-call-site clarity. */
export const formatValueUsd = formatPriceUsd;

/** Health factor scaled to 18 decimals -> short human string.
 *  e.g. 1_500_000_000_000_000_000n -> "1.5",
 *       950_000_000_000_000_000n -> "0.95".
 *  type(uint256).max is treated as "infinity" since the contract uses
 *  that sentinel for no-debt positions. */
export function formatHealthFactor(hf18: bigint): string {
  // The contract returns type(uint256).max when no debt exists. We use
  // a high threshold (>= 1e30) as a safe sentinel check.
  if (hf18 >= 10n ** 30n) return "infinity (no debt)";
  return trimDecimal(formatUnits(hf18, 18));
}
