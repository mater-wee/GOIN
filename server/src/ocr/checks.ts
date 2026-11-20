import type { TicketInput } from "../tickets.ts";
import type { Extraction } from "./index.ts";

export type CheckStatus = "ok" | "warn" | "missing";

export interface Check {
  field: "eventName" | "eventDate" | "venue" | "category" | "seat" | "orderRef" | "originalPrice" | "evidence";
  label: string;
  status: CheckStatus;
  message: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const compact = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Loose text match that tolerates OCR noise and extra words. */
function similar(a: string, b: string): boolean {
  const [x, y] = [norm(a), norm(b)];
  if (!x || !y) return false;
  if (x.includes(y) || y.includes(x)) return true;
  const A = new Set(x.split(" ").filter((w) => w.length >= 2));
  const B = new Set(y.split(" ").filter((w) => w.length >= 2));
  let common = 0;
  for (const w of A) if (B.has(w)) common++;
  return common / Math.max(1, Math.min(A.size, B.size)) >= 0.6;
}

const peso = (n: number) => `₱${n.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;

/**
 * Compares what the seller entered with what was read from the receipt.
 * These are hints for the seller and the administrator, not decisions:
 * a mismatch can be an OCR mistake, and a match doesn't prove authenticity.
 */
export function runChecks(input: TicketInput, ex: Extraction, today = new Date()): Check[] {
  const f = ex.fields;
  const checks: Check[] = [];
  const add = (field: Check["field"], label: string, status: CheckStatus, message: string) =>
    checks.push({ field, label, status, message });

  for (const warning of ex.warnings) add("evidence", "Evidence", "warn", warning);

  if (!f.eventName) add("eventName", "Event name", "missing", "Not found on the receipt.");
  else if (similar(input.eventName, f.eventName)) add("eventName", "Event name", "ok", "Matches the receipt.");
  else add("eventName", "Event name", "warn", `The receipt shows “${f.eventName}”.`);

  if (!f.eventDate) add("eventDate", "Event date", "missing", "Not found on the receipt.");
  else if (f.eventDate === input.eventDate) add("eventDate", "Event date", "ok", "Matches the receipt.");
  else add("eventDate", "Event date", "warn", `The receipt shows ${f.eventDate}.`);
  if (input.eventDate < today.toISOString().slice(0, 10)) add("eventDate", "Event date", "warn", "This event date has already passed.");

  if (!f.venue) add("venue", "Venue", "missing", "Not found on the receipt.");
  else if (similar(input.venue, f.venue)) add("venue", "Venue", "ok", "Matches the receipt.");
  else add("venue", "Venue", "warn", `The receipt shows “${f.venue}”.`);

  if (f.category && f.category !== "Other") {
    if (f.category === input.category) add("category", "Category", "ok", "Matches the receipt.");
    else add("category", "Category", "warn", `The receipt suggests ${f.category}.`);
  } else {
    add("category", "Category", "missing", "Not found on the receipt.");
  }

  if (input.seat && f.seat && !similar(input.seat, f.seat)) add("seat", "Seat", "warn", `The receipt shows “${f.seat}”.`);

  if (!f.orderRef) add("orderRef", "Order number", "missing", "Not found on the receipt.");
  else if (compact(f.orderRef) === compact(input.orderRef)) add("orderRef", "Order number", "ok", "Matches the receipt.");
  else add("orderRef", "Order number", "warn", `The receipt shows ${f.orderRef}.`);

  if (f.originalPricePhp === undefined) add("originalPrice", "Original price", "missing", "Not found on the receipt.");
  else if (Math.abs(f.originalPricePhp - input.originalPricePhp) < 1) add("originalPrice", "Original price", "ok", "Matches the receipt.");
  else
    add(
      "originalPrice",
      "Original price",
      "warn",
      `The receipt shows ${peso(f.originalPricePhp)}, but the listing says ${peso(input.originalPricePhp)}.`,
    );

  return checks;
}

export const issueCount = (checks: Check[]) => checks.filter((c) => c.status !== "ok").length;
