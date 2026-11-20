import { DatabaseSync } from "node:sqlite";
import { paths } from "./config.ts";

/**
 * SQLite database (built into Node, no native modules).
 *
 * `tickets` holds the off-chain half of each listing. A row starts as a draft
 * (listing_id NULL) when the seller submits the form, and is linked to the
 * on-chain listing once the backend has verified it on Stellar.
 */
export const db = new DatabaseSync(paths.db);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS tickets (
    id                 TEXT PRIMARY KEY,
    contract_id        TEXT NOT NULL,
    seller             TEXT NOT NULL,
    ticket_ref         TEXT NOT NULL,
    event_name         TEXT NOT NULL,
    event_date         TEXT NOT NULL,
    venue              TEXT NOT NULL,
    category           TEXT NOT NULL,
    seat               TEXT NOT NULL,
    order_ref          TEXT NOT NULL,
    original_price_php REAL NOT NULL,
    resale_price_php   REAL NOT NULL,
    evidence_file      TEXT NOT NULL,
    evidence_type      TEXT NOT NULL,
    evidence_name      TEXT NOT NULL,
    evidence_sha256    TEXT NOT NULL,
    extraction         TEXT NOT NULL,
    checks             TEXT NOT NULL,
    issue_count        INTEGER NOT NULL,
    listing_id         INTEGER,
    created_at         TEXT NOT NULL,
    confirmed_at       TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS tickets_listing
    ON tickets (contract_id, listing_id) WHERE listing_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS tickets_confirmed_ref
    ON tickets (contract_id, ticket_ref) WHERE listing_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    address    TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS challenges (
    nonce      TEXT PRIMARY KEY,
    address    TEXT NOT NULL,
    message    TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ocr_cache (
    sha256     TEXT PRIMARY KEY,
    result     TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

export interface TicketRow {
  id: string;
  contract_id: string;
  seller: string;
  ticket_ref: string;
  event_name: string;
  event_date: string;
  venue: string;
  category: string;
  seat: string;
  order_ref: string;
  original_price_php: number;
  resale_price_php: number;
  evidence_file: string;
  evidence_type: string;
  evidence_name: string;
  evidence_sha256: string;
  extraction: string;
  checks: string;
  issue_count: number;
  listing_id: number | null;
  created_at: string;
  confirmed_at: string | null;
}
