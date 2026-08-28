import { formatUnits, parseUnits } from "viem";

export function formatAmount(value: bigint | undefined, decimals: number, maxFractionDigits = 4): string {
  if (value === undefined) return "—";
  const [whole, fraction] = formatUnits(value, decimals).split(".");
  const grouped = BigInt(whole).toLocaleString("en-US");
  if (!fraction || maxFractionDigits === 0) return grouped;
  const trimmed = fraction.slice(0, maxFractionDigits).replace(/0+$/, "");
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}

/** Raw integer counts (the pool's internal liquidity units), grouped for readability. */
export function formatUnits0(value: bigint | undefined): string {
  if (value === undefined) return "—";
  return value.toLocaleString("en-US");
}

export function parseAmount(value: string, decimals: number): bigint {
  return parseUnits((value || "0").replace(",", "."), decimals);
}

export function shortAddress(address: string | undefined): string {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatTimestamp(seconds: bigint | undefined): string {
  if (seconds === undefined || seconds === BigInt(0)) return "—";
  return new Date(Number(seconds) * 1000).toLocaleString("en-US");
}

const STATUS_LABELS = ["Frozen", "Fluid", "Locked"];
export function statusLabel(status: number | undefined): string {
  if (status === undefined) return "—";
  return STATUS_LABELS[status] ?? `Unknown (${status})`;
}

/**
 * A share of a whole, as a percentage. Kept in bigint until the final divide
 * so large share counts (LSDS runs to 1e6 x the LSD amount) don't lose
 * precision through a Number conversion.
 */
export function formatPercent(part: bigint | undefined, total: bigint | undefined, decimals = 2): string {
  if (part === undefined || total === undefined || total === BigInt(0)) return "—";
  const scale = BigInt(10 ** decimals);
  const scaled = (part * BigInt(100) * scale) / total;
  return (Number(scaled) / Number(scale)).toFixed(decimals);
}

/**
 * The counter-token amount that pairs with `dollarRaw` at the pool's current
 * price, and its inverse.
 *
 * `price18` is the hook's `currentPrice()`: the human price of 1 LSD in
 * counter units, as 18-decimal fixed point. Exact for a full-range position
 * (which the pool holds: ±887220, the widest range tickSpacing 60 allows),
 * where the deposit ratio is just the spot price - the sqrtPriceA and
 * 1/sqrtPriceB terms of the general formula vanish at those bounds.
 */
export function pairedCounterAmount(dollarRaw: bigint, price18: bigint, counterDecimals: number): bigint {
  return (dollarRaw * price18 * BigInt(10) ** BigInt(counterDecimals)) / (BigInt(10) ** BigInt(18) * BigInt(10) ** BigInt(18));
}

export function pairedDollarAmount(counterRaw: bigint, price18: bigint, counterDecimals: number): bigint {
  if (price18 === BigInt(0)) return BigInt(0);
  return (counterRaw * BigInt(10) ** BigInt(18) * BigInt(10) ** BigInt(18)) / (price18 * BigInt(10) ** BigInt(counterDecimals));
}
