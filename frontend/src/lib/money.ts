import { PHP_PER_USDC } from "../config";

/** USDC on Stellar has 7 decimals. */
const UNITS_PER_CENT = 100_000n;
const UNITS_PER_USDC = 10_000_000n;

/** Converts a peso price to USDC base units, rounded to the nearest cent. */
export function phpToUsdcUnits(php: number): bigint {
  const cents = Math.round((php / PHP_PER_USDC) * 100);
  return BigInt(cents) * UNITS_PER_CENT;
}

/** Parses a Horizon balance string such as "55.3600000" into base units. */
export function usdcStringToUnits(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * UNITS_PER_USDC + BigInt(fraction.padEnd(7, "0").slice(0, 7));
}

export function formatUsdc(units: bigint): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const whole = abs / UNITS_PER_USDC;
  const cents = (abs % UNITS_PER_USDC) / UNITS_PER_CENT;
  return `${negative ? "-" : ""}${whole.toLocaleString("en-US")}.${cents.toString().padStart(2, "0")} USDC`;
}

export function formatPhp(php: number): string {
  return `₱${php.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
}
