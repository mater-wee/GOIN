import { createHash, randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import {
  createChallenge,
  decodeSignature,
  isStellarAccount,
  optionalAuth,
  requireAuth,
  signedInAddress,
  verifyChallenge,
} from "./auth.ts";
import { contractAdmin, getListing, listingCount, toHex, type ChainListing } from "./chain.ts";
import { config, llmEnabled } from "./config.ts";
import { db, type TicketRow } from "./db.ts";
import { evidenceExtension, evidencePath, requireEvidence, saveEvidence, upload } from "./evidence.ts";
import { HttpError, rateLimit } from "./http.ts";
import { readEvidence } from "./ocr/index.ts";
import { issueCount, runChecks } from "./ocr/checks.ts";
import { computeTicketRef, parseTicketInput, phpToUsdcUnits } from "./tickets.ts";

export const api = Router();

const byIp = rateLimit({ windowMs: 10 * 60_000, max: 40, key: (req) => `ip:${req.ip}` });
const byWallet = rateLimit({ windowMs: 10 * 60_000, max: 30, key: (_req, res) => `wallet:${signedInAddress(res)}` });

// ------------------------------- Helpers -------------------------------

/** Ticket details anyone can see. No order number, no evidence. */
function publicDetails(row: TicketRow, includeIssues: boolean) {
  return {
    listingId: row.listing_id,
    eventName: row.event_name,
    eventDate: row.event_date,
    venue: row.venue,
    category: row.category,
    seat: row.seat,
    originalPricePhp: row.original_price_php,
    resalePricePhp: row.resale_price_php,
    seller: row.seller,
    createdAt: row.created_at,
    ...(includeIssues ? { issueCount: row.issue_count } : {}),
  };
}

function listingIdParam(req: Request): number {
  const raw = String(req.params.listingId ?? "");
  if (!/^\d{1,9}$/.test(raw)) throw new HttpError(400, "Invalid listing ID.");
  return Number(raw);
}

function confirmedTicket(listingId: number): TicketRow {
  const row = db
    .prepare("SELECT * FROM tickets WHERE contract_id = ? AND listing_id = ?")
    .get(config.contractId, listingId) as TicketRow | undefined;
  if (!row) throw new HttpError(404, "No ticket details for this listing.");
  return row;
}

async function viewerIsAdmin(address: string | null): Promise<boolean> {
  if (!address) return false;
  try {
    return address === (await contractAdmin());
  } catch {
    return false;
  }
}

/** Evidence and checks are visible only to the administrator and the seller. */
async function assertCanReview(row: TicketRow, res: Response): Promise<void> {
  const address = signedInAddress(res);
  if (address !== row.seller && !(await viewerIsAdmin(address))) {
    throw new HttpError(403, "Only the administrator and the seller can see this ticket's evidence.");
  }
}

/** Finds the on-chain listing for a draft by its ticket_ref. */
async function findOnChain(row: TicketRow, hint?: number): Promise<{ id: number; listing: ChainListing } | null> {
  const matches = (l: ChainListing | null): l is ChainListing => !!l && toHex(l.ticket_ref) === row.ticket_ref;
  if (hint) {
    const listing = await getListing(hint);
    if (matches(listing)) return { id: hint, listing };
  }
  const count = await listingCount();
  for (let id = count; id >= Math.max(1, count - 50); id--) {
    const listing = await getListing(id);
    if (matches(listing)) return { id, listing };
  }
  return null;
}

// -------------------------------- Routes -------------------------------

api.get("/health", (_req, res) => {
  res.json({ ok: true, contractId: config.contractId, ai: llmEnabled });
});

/** Step 1 of wallet sign-in: get a one-time message to sign. */
api.post("/auth/challenge", byIp, (req, res) => {
  const address = req.body?.address;
  if (!isStellarAccount(address)) throw new HttpError(400, "Invalid wallet address.");
  res.json(createChallenge(address));
});

/** Step 2 of wallet sign-in: send the signature, get a session token. */
api.post("/auth/verify", byIp, (req, res) => {
  const { address, nonce, signature } = req.body ?? {};
  if (!isStellarAccount(address) || typeof nonce !== "string") throw new HttpError(400, "Invalid sign-in request.");
  const sig = decodeSignature(signature);
  if (!sig) throw new HttpError(400, "The wallet returned a signature in an unknown format.");
  res.json(verifyChallenge(address, nonce, sig));
});

api.get("/me", requireAuth, async (_req, res) => {
  const address = signedInAddress(res);
  res.json({ address, isAdmin: await viewerIsAdmin(address) });
});

/** Step 6: read a receipt and suggest form values. Nothing is stored except an OCR cache entry. */
api.post("/ocr", requireAuth, byWallet, upload.single("evidence"), async (req, res) => {
  const evidence = requireEvidence(req);
  res.json(await readEvidence(evidence.buffer, evidence.type));
});

/**
 * Step 5: the seller submits details and evidence. The backend validates them,
 * computes ticket_ref, reads the receipt, runs consistency checks, and stores
 * a draft. The seller then calls create_listing on-chain with that ticket_ref.
 */
api.post("/drafts", requireAuth, byWallet, upload.single("evidence"), async (req, res) => {
  const seller = signedInAddress(res);
  const evidence = requireEvidence(req);
  let raw: unknown;
  try {
    raw = JSON.parse(String(req.body?.details ?? ""));
  } catch {
    throw new HttpError(400, "Ticket details are missing.");
  }
  const input = parseTicketInput(raw);
  const ticketRef = computeTicketRef(input);

  const duplicate = db
    .prepare("SELECT 1 FROM tickets WHERE contract_id = ? AND ticket_ref = ? AND listing_id IS NOT NULL")
    .get(config.contractId, ticketRef);
  if (duplicate) throw new HttpError(409, "This ticket has already been listed on GOIN.");

  const extraction = await readEvidence(evidence.buffer, evidence.type);
  const checks = runChecks(input, extraction);
  const stored = saveEvidence(evidence);
  const id = randomUUID();

  db.prepare(
    `INSERT INTO tickets (id, contract_id, seller, ticket_ref, event_name, event_date, venue, category, seat, order_ref,
      original_price_php, resale_price_php, evidence_file, evidence_type, evidence_name, evidence_sha256,
      extraction, checks, issue_count, listing_id, created_at, confirmed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL)`,
  ).run(
    id,
    config.contractId,
    seller,
    ticketRef,
    input.eventName,
    input.eventDate,
    input.venue,
    input.category,
    input.seat,
    input.orderRef,
    input.originalPricePhp,
    input.resalePricePhp,
    stored,
    evidence.type,
    evidence.name,
    createHash("sha256").update(evidence.buffer).digest("hex"),
    JSON.stringify(extraction),
    JSON.stringify(checks),
    issueCount(checks),
    new Date().toISOString(),
  );

  res.status(201).json({ draftId: id, ticketRef, checks, issueCount: issueCount(checks), extraction });
});

/**
 * Links a draft to its on-chain listing after the seller's create_listing
 * transaction. The backend verifies seller, ticket_ref, and prices on Stellar,
 * so details can't be attached to someone else's listing.
 */
api.post("/drafts/:id/confirm", requireAuth, async (req, res) => {
  const seller = signedInAddress(res);
  const row = db.prepare("SELECT * FROM tickets WHERE id = ? AND contract_id = ?").get(String(req.params.id), config.contractId) as
    | TicketRow
    | undefined;
  if (!row || row.seller !== seller) throw new HttpError(404, "Draft not found.");
  if (row.listing_id !== null) {
    res.json(publicDetails(row, true));
    return;
  }

  const hint = Number(req.body?.listingId);
  const found = await findOnChain(row, Number.isInteger(hint) && hint > 0 ? hint : undefined);
  if (!found) throw new HttpError(404, "The listing isn't on Stellar yet. Wait a few seconds and try again.");

  const chain = found.listing;
  if (chain.seller !== seller) throw new HttpError(403, "This listing belongs to a different wallet.");
  if (chain.original_price !== phpToUsdcUnits(row.original_price_php) || chain.resale_price !== phpToUsdcUnits(row.resale_price_php)) {
    throw new HttpError(409, "The on-chain prices don't match the submitted ticket details.");
  }

  try {
    db.prepare("UPDATE tickets SET listing_id = ?, confirmed_at = ? WHERE id = ?").run(found.id, new Date().toISOString(), row.id);
  } catch {
    throw new HttpError(409, "This listing already has ticket details.");
  }
  res.json(publicDetails({ ...row, listing_id: found.id }, true));
});

/** Public details for every listing of the current contract. */
api.get("/listings", optionalAuth, async (_req, res) => {
  const viewer = (res.locals.address as string | null) ?? null;
  const admin = await viewerIsAdmin(viewer);
  const rows = db
    .prepare("SELECT * FROM tickets WHERE contract_id = ? AND listing_id IS NOT NULL ORDER BY listing_id DESC")
    .all(config.contractId) as unknown as TicketRow[];
  res.json(rows.map((r) => publicDetails(r, admin || r.seller === viewer)));
});

api.get("/listings/:listingId", optionalAuth, async (req, res) => {
  const row = confirmedTicket(listingIdParam(req));
  const viewer = (res.locals.address as string | null) ?? null;
  res.json(publicDetails(row, row.seller === viewer || (await viewerIsAdmin(viewer))));
});

/** Everything the administrator needs to review a listing. */
api.get("/listings/:listingId/review", requireAuth, async (req, res) => {
  const row = confirmedTicket(listingIdParam(req));
  await assertCanReview(row, res);
  res.json({
    details: { ...publicDetails(row, true), orderRef: row.order_ref },
    extraction: JSON.parse(row.extraction),
    checks: JSON.parse(row.checks),
    evidence: { name: row.evidence_name, type: row.evidence_type },
  });
});

api.get("/listings/:listingId/evidence", requireAuth, async (req, res) => {
  const row = confirmedTicket(listingIdParam(req));
  await assertCanReview(row, res);
  res.setHeader("Content-Type", row.evidence_type);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Disposition", `inline; filename="evidence-${row.listing_id}.${evidenceExtension(row.evidence_type)}"`);
  res.sendFile(evidencePath(row.evidence_file));
});
