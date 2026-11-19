import { get, set } from "idb-keyval";
import { CREDENCE_CONTRACT_ID } from "../config";

/**
 * Off-chain ticket data. The contract only stores a SHA-256 hash of these
 * fields (ticket_ref), the prices, the addresses, and the status.
 *
 * For the MVP this is kept in the browser's IndexedDB, so seller, admin, and
 * buyer must use the same browser to see the details. Step 5 (backend)
 * replaces this module with a shared database and file storage.
 */
export interface TicketFields {
  eventName: string;
  eventDate: string;
  venue: string;
  category: string;
  seat: string;
  /** Order or ticket number from the original ticket provider. */
  orderRef: string;
}

export interface TicketDetails extends TicketFields {
  originalPricePhp: number;
  resalePricePhp: number;
  sellerAddress: string;
  createdAt: string;
  evidence?: { name: string; type: string; blob: Blob };
}

// Listing IDs restart at 1 for every deployed contract, so include the contract ID.
const key = (id: bigint) => `credence:${CREDENCE_CONTRACT_ID}:listing:${id.toString()}`;

export async function saveDetails(id: bigint, details: TicketDetails): Promise<void> {
  await set(key(id), details);
}

export async function getDetails(id: bigint): Promise<TicketDetails | undefined> {
  return get<TicketDetails>(key(id));
}

const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * The on-chain ticket_ref. Hashing normalized ticket fields means the same
 * ticket always produces the same hash, so the contract's DuplicateTicket
 * check blocks a second listing of it.
 */
export async function computeTicketRef(f: TicketFields): Promise<Uint8Array> {
  const canonical = JSON.stringify([
    normalize(f.eventName),
    f.eventDate,
    normalize(f.venue),
    normalize(f.category),
    normalize(f.seat),
    normalize(f.orderRef),
  ]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return new Uint8Array(digest);
}
