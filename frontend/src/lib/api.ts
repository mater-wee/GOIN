import { signMessage } from "@stellar/freighter-api";
import { GOIN_CONTRACT_ID, NETWORK } from "../config";

/**
 * Client for the GOIN backend (server/). In development, Vite proxies
 * /api to http://localhost:8787. Set VITE_API_URL if the backend is elsewhere.
 */
const API = `${(import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "")}/api`;

export const CATEGORIES = ["VIP", "Patron", "Lower Box", "Upper Box", "General Admission", "Floor Standing", "Other"] as const;

export interface TicketInput {
  eventName: string;
  eventDate: string;
  venue: string;
  category: string;
  seat: string;
  orderRef: string;
  originalPricePhp: number;
  resalePricePhp: number;
}

/** Off-chain ticket details anyone can see. */
export interface PublicDetails {
  listingId: number;
  eventName: string;
  eventDate: string;
  venue: string;
  category: string;
  seat: string;
  originalPricePhp: number;
  resalePricePhp: number;
  seller: string;
  createdAt: string;
  /** Receipt checks that need attention. Only sent to the admin and the seller. */
  issueCount?: number;
}

export interface ExtractedFields {
  eventName?: string;
  eventDate?: string;
  venue?: string;
  category?: string;
  seat?: string;
  orderRef?: string;
  originalPricePhp?: number;
}

export interface Extraction {
  fields: ExtractedFields;
  sources: Partial<Record<keyof ExtractedFields, "ai" | "rules">>;
  engine: "ocr" | "pdf-text";
  usedAi: boolean;
  confidence: number | null;
  textLength: number;
  textPreview: string;
  warnings: string[];
}

export interface Check {
  field: string;
  label: string;
  status: "ok" | "warn" | "missing";
  message: string;
}

export interface DraftResult {
  draftId: string;
  ticketRef: string;
  checks: Check[];
  issueCount: number;
  extraction: Extraction;
}

export interface Review {
  details: PublicDetails & { orderRef: string };
  extraction: Extraction;
  checks: Check[];
  evidence: { name: string; type: string };
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body && !(init.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  } catch {
    throw new ApiError(0, "The GOIN server isn't reachable. Start it with `npm start` in the server folder.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? `The GOIN server returned an error (${res.status}).`);
  }
  const isJson = res.headers.get("content-type")?.includes("application/json");
  return (isJson ? res.json() : res.blob()) as Promise<T>;
}

// ------------------------------ Wallet sign-in ------------------------------

const sessionKey = (address: string) => `goin:session:${address}`;

function storedToken(address: string): string | null {
  try {
    const s = JSON.parse(localStorage.getItem(sessionKey(address)) ?? "null") as { token: string; expiresAt: number } | null;
    return s && s.expiresAt - 60_000 > Date.now() ? s.token : null;
  } catch {
    return null;
  }
}

function toBase64(bytes: ArrayLike<number>): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

/** Proves wallet ownership by signing a one-time message (SEP-53). No transaction, no fee. */
async function signIn(address: string): Promise<string> {
  const { nonce, message } = await call<{ nonce: string; message: string }>("/auth/challenge", {
    method: "POST",
    body: JSON.stringify({ address }),
  });
  const res = await signMessage(message, { networkPassphrase: NETWORK.passphrase, address });
  if (res.error) throw new Error(res.error.message ?? "Freighter declined to sign the sign-in message.");
  const signed = res.signedMessage as unknown;
  const signature =
    typeof signed === "string" ? signed : signed ? toBase64(new Uint8Array(signed as ArrayLike<number>)) : null;
  if (!signature) throw new Error("Freighter didn't return a signature.");

  const session = await call<{ token: string; expiresAt: number }>("/auth/verify", {
    method: "POST",
    body: JSON.stringify({ address, nonce, signature }),
  });
  localStorage.setItem(sessionKey(address), JSON.stringify(session));
  return session.token;
}

const signingIn = new Map<string, Promise<string>>();

/** Returns a valid session token, asking Freighter to sign in only if needed. */
function ensureSession(address: string): Promise<string> {
  const token = storedToken(address);
  if (token) return Promise.resolve(token);
  let pending = signingIn.get(address);
  if (!pending) {
    pending = signIn(address).finally(() => signingIn.delete(address));
    signingIn.set(address, pending);
  }
  return pending;
}

export const isSignedIn = (address: string | null) => !!address && !!storedToken(address);

async function authed<T>(address: string, path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await call<T>(path, init, await ensureSession(address));
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401) throw e;
    localStorage.removeItem(sessionKey(address));
    return call<T>(path, init, await ensureSession(address));
  }
}

// --------------------------------- Calls ---------------------------------

/** Public details for all listings. Sends the session if one exists, without prompting. */
export function fetchPublicListings(viewer: string | null): Promise<PublicDetails[]> {
  return call("/listings", {}, viewer ? storedToken(viewer) : null);
}

export async function fetchPublicListing(id: bigint, viewer: string | null): Promise<PublicDetails | null> {
  try {
    return await call(`/listings/${id}`, {}, viewer ? storedToken(viewer) : null);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

const evidenceForm = (file: File, details?: TicketInput) => {
  const form = new FormData();
  if (details) form.append("details", JSON.stringify(details));
  form.append("evidence", file);
  return form;
};

/** Step 6: AI-assisted reading of a receipt. Suggests values; decides nothing. */
export function readReceipt(address: string, file: File): Promise<Extraction> {
  return authed(address, "/ocr", { method: "POST", body: evidenceForm(file) });
}

/** Step 5: store details and evidence, get the ticket_ref and receipt checks. */
export function createDraft(address: string, details: TicketInput, file: File): Promise<DraftResult> {
  return authed(address, "/drafts", { method: "POST", body: evidenceForm(file, details) });
}

export function confirmDraft(address: string, draftId: string, listingId?: bigint): Promise<PublicDetails> {
  return authed(address, `/drafts/${encodeURIComponent(draftId)}/confirm`, {
    method: "POST",
    body: JSON.stringify(listingId ? { listingId: Number(listingId) } : {}),
  });
}

export function fetchReview(address: string, listingId: bigint): Promise<Review> {
  return authed(address, `/listings/${listingId}/review`);
}

export function fetchEvidence(address: string, listingId: bigint): Promise<Blob> {
  return authed(address, `/listings/${listingId}/evidence`);
}

// ------------------- Drafts listed on-chain but not yet linked -------------------

// If the page closes after create_listing but before the backend confirms it,
// the draft ID is kept here and confirmed the next time the seller opens the app.
const pendingKey = (address: string) => `goin:pending:${GOIN_CONTRACT_ID}:${address}`;

function pendingDrafts(address: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(pendingKey(address)) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function rememberPendingDraft(address: string, draftId: string): void {
  localStorage.setItem(pendingKey(address), JSON.stringify([...new Set([...pendingDrafts(address), draftId])]));
}

export function forgetPendingDraft(address: string, draftId: string): void {
  localStorage.setItem(pendingKey(address), JSON.stringify(pendingDrafts(address).filter((d) => d !== draftId)));
}

/** Retries linking drafts whose on-chain listing exists. Returns how many were linked. */
export async function retryPendingDrafts(address: string): Promise<number> {
  let linked = 0;
  for (const draftId of pendingDrafts(address)) {
    try {
      await confirmDraft(address, draftId);
      forgetPendingDraft(address, draftId);
      linked++;
    } catch (e) {
      // 404 "Draft not found" means it expired or was never listed: stop retrying it.
      if (e instanceof ApiError && e.status === 404 && /draft/i.test(e.message)) forgetPendingDraft(address, draftId);
    }
  }
  return linked;
}
