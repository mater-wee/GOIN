import { CATEGORIES, type Category } from "../tickets.ts";

/** Fields the receipt reader looks for. Any of them can be missing. */
export interface ExtractedFields {
  eventName?: string;
  eventDate?: string;
  venue?: string;
  category?: Category;
  seat?: string;
  orderRef?: string;
  originalPricePhp?: number;
}

const KNOWN_VENUES = [
  "Philippine Arena",
  "SM Mall of Asia Arena",
  "Mall of Asia Arena",
  "Smart Araneta Coliseum",
  "Araneta Coliseum",
  "New Frontier Theater",
  "Newport Performing Arts Theater",
  "Samsung Performing Arts Theater",
  "Philippine International Convention Center",
  "PICC",
  "Cultural Center of the Philippines",
  "SMX Convention Center",
  "World Trade Center Metro Manila",
  "Rizal Memorial Coliseum",
  "Ninoy Aquino Stadium",
  "The Theatre at Solaire",
  "Music Museum",
  "Metropolitan Theater",
  "UP Theater",
  "Circuit Makati",
  "Quezon Memorial Circle",
];

/** Receipt wording mapped to the app's ticket categories. */
const CATEGORY_PATTERNS: [RegExp, Category, boolean][] = [
  // [pattern, category, safe to match anywhere in the text]
  [/\b(s\s?vip|vip|platinum)\b/i, "VIP", true],
  [/\bpatron\b/i, "Patron", true],
  [/\blower\s*box\b/i, "Lower Box", true],
  [/\bupper\s*box\b/i, "Upper Box", true],
  [/\bgen(eral)?\.?\s*ad(mission)?\b/i, "General Admission", true],
  [/\bfloor(\s*standing)?\b|\bmosh\s*pit\b/i, "Floor Standing", true],
  [/\blbx?\b/i, "Lower Box", false],
  [/\bubx?\b/i, "Upper Box", false],
  [/\bga\b|\bbleachers?\b|\bstanding\b/i, "General Admission", false],
];

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH_NAMES = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec";

const clean = (s: string) => s.replace(/\s+/g, " ").replace(/^[\s:#|\-–]+|[\s|]+$/g, "").trim();
const pad = (n: number) => String(n).padStart(2, "0");

function toIso(y: number, m: number, d: number): string | undefined {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return undefined;
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  return new Date(`${iso}T00:00:00Z`).toISOString().startsWith(iso) ? iso : undefined;
}

/** Finds a date in a line of text and returns it as YYYY-MM-DD. */
export function parseDate(s: string): string | undefined {
  let m = s.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) return toIso(+m[1], +m[2], +m[3]);
  m = s.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2})\b/);
  if (m) {
    // Philippine receipts usually use MM/DD/YYYY; DD/MM when the first part can't be a month.
    const [a, b] = [+m[1], +m[2]];
    return a > 12 ? toIso(+m[3], b, a) : toIso(+m[3], a, b);
  }
  m = s.match(new RegExp(`\\b(${MONTH_NAMES})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d{2})\\b`, "i"));
  if (m) return toIso(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]);
  m = s.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_NAMES})[a-z]*\\.?,?\\s+(20\\d{2})\\b`, "i"));
  if (m) return toIso(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]);
  return undefined;
}

/** Finds a peso amount, e.g. "PHP 2,500.00", "₱2500", "P 2,500". */
export function parseAmount(s: string): number | undefined {
  const m =
    s.match(/(?:₱|php|p)\s*\.?\s*([0-9]{1,3}(?:[,\s][0-9]{3})+(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i) ??
    s.match(/\b([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{2})?|[0-9]+\.[0-9]{2})\b/);
  if (!m) return undefined;
  const n = Number(m[1].replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Value of a "Label: value" line, or of the line after a label on its own. */
function labeled(lines: string[], label: string): string | undefined {
  const inline = new RegExp(`^\\s*(?:${label})\\s*(?:[:#|\\-–]\\s*|\\s{2,})(.+)$`, "i");
  const alone = new RegExp(`^\\s*(?:${label})\\s*:?\\s*$`, "i");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(inline);
    if (m && clean(m[1])) return clean(m[1]);
    if (alone.test(lines[i]) && lines[i + 1]) return clean(lines[i + 1]);
  }
  return undefined;
}

export function normalizeCategory(value: string, anywhere = false): Category | undefined {
  for (const [pattern, category, safe] of CATEGORY_PATTERNS) {
    if ((anywhere ? safe : true) && pattern.test(value)) return category;
  }
  const exact = CATEGORIES.find((c) => c.toLowerCase() === value.trim().toLowerCase());
  return exact;
}

const FEE = /fee|charge|tax|vat|service|convenience|handling|delivery/i;
const PRICE_LABELS = [
  /(ticket\s*)?(price|face\s*value|unit\s*price|ticket\s*amount)/i,
  /sub\s*-?\s*total/i,
  /(grand\s*)?total|amount\s*(paid|due)?/i,
];

/** Rule-based extraction from OCR text. Works offline; no AI involved. */
export function extractWithRules(text: string): ExtractedFields {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const fields: ExtractedFields = {};

  const eventName = labeled(lines, "event(?:\\s*name)?|concert|show|title|performance");
  if (eventName && !parseDate(eventName)) fields.eventName = eventName;

  // Event date: prefer lines labeled as the event/show date, avoid purchase dates.
  let best: { iso: string; score: number } | undefined;
  for (const line of lines) {
    const iso = parseDate(line);
    if (!iso) continue;
    let score = 0;
    if (/(event|show|concert)\s*date|date\s*of\s*(the\s*)?(event|show)|schedule/i.test(line)) score += 3;
    else if (/^\s*date\b/i.test(line)) score += 1;
    if (/order|purchase|transaction|issued|printed|paid|booking|payment/i.test(line)) score -= 5;
    if (!best || score > best.score) best = { iso, score };
  }
  if (best && best.score >= 0) fields.eventDate = best.iso;

  const venue = labeled(lines, "venue|location|place");
  const knownVenue = KNOWN_VENUES.find((v) => text.toLowerCase().includes(v.toLowerCase()));
  if (venue) fields.venue = venue;
  else if (knownVenue) fields.venue = knownVenue;

  const categoryValue = labeled(lines, "(?:ticket\\s*)?(?:category|class|tier|type|zone)");
  fields.category = (categoryValue && normalizeCategory(categoryValue)) || normalizeCategory(text, true);

  const seat = labeled(lines, "seat(?:\\s*(?:no\\.?|number|#|details))?");
  const section = labeled(lines, "section|sec\\.?");
  const row = labeled(lines, "row");
  if (seat && /section|row/i.test(seat)) fields.seat = seat;
  else {
    const parts = [section && `Section ${section}`, row && `Row ${row}`, seat && `Seat ${seat}`].filter(Boolean);
    if (parts.length) fields.seat = parts.join(", ");
  }

  for (const line of lines) {
    if (/date|time/i.test(line)) continue; // "Booking date 2026-11-02" is not an order number
    const m = line.match(
      /^\s*(?:order|booking|reference|ref|transaction|confirmation|ticket)\s*(?:no\.?|number|#|id|code)?\s*[:#|\-–]?\s*(.+)$/i,
    );
    const token = m?.[1].match(/\b(?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{4,29}\b/i)?.[0];
    if (token) {
      fields.orderRef = token;
      break;
    }
  }

  outer: for (const label of PRICE_LABELS) {
    for (const line of lines) {
      if (!label.test(line) || FEE.test(line)) continue;
      const amount = parseAmount(line);
      if (amount) {
        fields.originalPricePhp = amount;
        break outer;
      }
    }
  }

  return fields;
}
