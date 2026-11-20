import { createHash } from "node:crypto";
import { config } from "./config.ts";
import { HttpError } from "./http.ts";

export const CATEGORIES = [
  "VIP",
  "Patron",
  "Lower Box",
  "Upper Box",
  "General Admission",
  "Floor Standing",
  "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Ticket details a seller submits. Validated before anything is stored. */
export interface TicketInput {
  eventName: string;
  eventDate: string;
  venue: string;
  category: Category;
  seat: string;
  orderRef: string;
  originalPricePhp: number;
  resalePricePhp: number;
}

function text(value: unknown, field: string, max: number, required = true): string {
  const s = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (required && !s) throw new HttpError(400, `${field} is required.`);
  if (s.length > max) throw new HttpError(400, `${field} must be ${max} characters or fewer.`);
  return s;
}

function price(value: unknown, field: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) throw new HttpError(400, `${field} must be between ₱1 and ₱1,000,000.`);
  if (Math.round(n * 100) !== n * 100) throw new HttpError(400, `${field} can have at most 2 decimal places.`);
  return n;
}

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

export function parseTicketInput(raw: unknown): TicketInput {
  if (typeof raw !== "object" || raw === null) throw new HttpError(400, "Ticket details are missing.");
  const r = raw as Record<string, unknown>;
  const eventDate = text(r.eventDate, "Event date", 10);
  if (!isIsoDate(eventDate)) throw new HttpError(400, "Event date must be a valid date.");
  const category = text(r.category, "Ticket category", 40) as Category;
  if (!CATEGORIES.includes(category)) throw new HttpError(400, "Choose a ticket category from the list.");

  const input: TicketInput = {
    eventName: text(r.eventName, "Event name", 120),
    eventDate,
    venue: text(r.venue, "Venue", 120),
    category,
    seat: text(r.seat, "Seat", 80, false),
    orderRef: text(r.orderRef, "Order number", 60),
    originalPricePhp: price(r.originalPricePhp, "Original price"),
    resalePricePhp: price(r.resalePricePhp, "Resale price"),
  };
  if (input.resalePricePhp > input.originalPricePhp) {
    throw new HttpError(400, "The resale price can't be higher than the original price.");
  }
  return input;
}

const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * The on-chain ticket_ref (hex). Hashing normalized ticket fields means the
 * same ticket always produces the same hash, so the contract's DuplicateTicket
 * check blocks a second listing of it. The order number stays private.
 */
export function computeTicketRef(t: TicketInput): string {
  const canonical = JSON.stringify([
    normalize(t.eventName),
    t.eventDate,
    normalize(t.venue),
    normalize(t.category),
    normalize(t.seat),
    normalize(t.orderRef),
  ]);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** Must match frontend/src/lib/money.ts so on-chain prices can be verified. */
export function phpToUsdcUnits(php: number): bigint {
  return BigInt(Math.round((php / config.phpPerUsdc) * 100)) * 100_000n;
}
