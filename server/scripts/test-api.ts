// End-to-end test of the backend against Stellar testnet.
//
// Starts the server on a throwaway data folder, pointed at a TEST contract
// whose admin is the local goin-admin identity (so this never touches
// the real contract). Then: wallet sign-in, receipt OCR, draft + checks,
// on-chain create_listing, confirm, and access control for evidence.
//
// Usage: TEST_CONTRACT_ID=C... npm run test:api
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { contract, Keypair, Networks } from "@stellar/stellar-sdk";

const contractId = process.env.TEST_CONTRACT_ID ?? "";
if (!/^C[A-Z2-7]{55}$/.test(contractId)) throw new Error("Set TEST_CONTRACT_ID to a test contract whose admin is goin-admin.");

const port = 8799;
const base = `http://localhost:${port}/api`;
const receipt = readFileSync(resolve(import.meta.dirname, "../../samples/sample-receipt.png"));
const dataDir = mkdtempSync(join(tmpdir(), "goin-api-test-"));

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const server = spawn(process.execPath, ["src/index.ts"], {
  cwd: resolve(import.meta.dirname, ".."),
  env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, GOIN_CONTRACT_ID: contractId, LLM_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Server did not start");
}

async function signIn(kp: Keypair): Promise<string> {
  const ch = await (await fetch(`${base}/auth/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: kp.publicKey() }),
  })).json();
  const hash = createHash("sha256").update(Buffer.concat([Buffer.from("Stellar Signed Message:\n"), Buffer.from(ch.message)])).digest();
  const signature = Buffer.from(kp.sign(hash)).toString("base64");
  const res = await fetch(`${base}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: kp.publicKey(), nonce: ch.nonce, signature }),
  });
  return (await res.json()).token;
}

function form(details: object | null, file: Buffer, type = "image/png", name = "receipt.png"): FormData {
  const fd = new FormData();
  if (details) fd.append("details", JSON.stringify(details));
  fd.append("evidence", new Blob([new Uint8Array(file)], { type }), name);
  return fd;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

try {
  await waitForServer();
  const health = await (await fetch(`${base}/health`)).json();
  check("health reports the test contract", health.contractId === contractId);

  // Sign-in
  const seller = Keypair.random();
  const outsider = Keypair.random();
  const funded = await fetch(`https://friendbot.stellar.org?addr=${seller.publicKey()}`);
  check("friendbot funded test seller", funded.ok);
  const sellerToken = await signIn(seller);
  check("seller signs in with a SEP-53 signature", typeof sellerToken === "string" && sellerToken.length > 20);

  const badVerify = await fetch(`${base}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: seller.publicKey(), nonce: "0".repeat(32), signature: Buffer.alloc(64).toString("base64") }),
  });
  check("unknown or forged sign-in is rejected", badVerify.status === 401, `status ${badVerify.status}`);

  // Step 6: OCR
  const unauthOcr = await fetch(`${base}/ocr`, { method: "POST", body: form(null, receipt) });
  check("OCR requires sign-in", unauthOcr.status === 401);

  const started = Date.now();
  const ocr = await (await fetch(`${base}/ocr`, { method: "POST", headers: auth(sellerToken), body: form(null, receipt) })).json();
  console.log(`      OCR took ${Date.now() - started} ms, confidence ${ocr.confidence}, fields:`, ocr.fields);
  check("OCR reads the event name", ocr.fields.eventName === "Sample Concert Manila 2026", ocr.fields.eventName);
  check("OCR reads the event date (not the order date)", ocr.fields.eventDate === "2026-12-12", ocr.fields.eventDate);
  check("OCR reads the venue", ocr.fields.venue === "Philippine Arena", ocr.fields.venue);
  check("OCR reads the category", ocr.fields.category === "VIP", ocr.fields.category);
  check("OCR reads the order number", ocr.fields.orderRef === "SMT-2026-0042817", ocr.fields.orderRef);
  check("OCR reads the ticket price, not the total with fees", ocr.fields.originalPricePhp === 2500, String(ocr.fields.originalPricePhp));
  check("OCR reads the seat", /112/.test(ocr.fields.seat ?? "") && /Row C/i.test(ocr.fields.seat ?? ""), ocr.fields.seat);

  const notAReceipt = await fetch(`${base}/ocr`, {
    method: "POST",
    headers: auth(sellerToken),
    body: form(null, Buffer.from("just some text, not an image"), "image/png", "fake.png"),
  });
  check("non-image upload is rejected by content, not file name", notAReceipt.status === 415, `status ${notAReceipt.status}`);

  // Step 5: draft with consistency checks
  // A per-run suffix keeps ticket_ref unique, because the contract blocks
  // re-listing the same ticket (DuplicateTicket) across test runs.
  const details = {
    eventName: `Sample Concert Manila 2026 (test ${Date.now()})`,
    eventDate: "2026-12-12",
    venue: "Philippine Arena",
    category: "VIP",
    seat: "Section 112, Row C, Seat 8",
    orderRef: `SMT-2026-0042817`,
    originalPricePhp: 2500,
    resalePricePhp: 2500,
  };

  const mismatched = await (await fetch(`${base}/drafts`, {
    method: "POST",
    headers: auth(sellerToken),
    body: form({ ...details, originalPricePhp: 2800, resalePricePhp: 2800 }, receipt),
  })).json();
  const priceCheck = mismatched.checks.find((c: { field: string }) => c.field === "originalPrice");
  check("price mismatch is flagged", priceCheck?.status === "warn", priceCheck?.message);

  const overCap = await fetch(`${base}/drafts`, {
    method: "POST",
    headers: auth(sellerToken),
    body: form({ ...details, resalePricePhp: 3000 }, receipt),
  });
  check("resale above original is rejected", overCap.status === 400);

  const draftRes = await fetch(`${base}/drafts`, { method: "POST", headers: auth(sellerToken), body: form(details, receipt) });
  const draft = await draftRes.json();
  check("draft is created", draftRes.status === 201, `issues: ${draft.issueCount}`);
  check("matching details pass every check", draft.issueCount === 0, JSON.stringify(draft.checks.filter((c: { status: string }) => c.status !== "ok")));

  // On-chain create_listing with the backend's ticket_ref
  const client = await contract.Client.from({
    contractId,
    networkPassphrase: Networks.TESTNET,
    rpcUrl: "https://soroban-testnet.stellar.org",
    publicKey: seller.publicKey(),
    signTransaction: contract.basicNodeSigner(seller, Networks.TESTNET).signTransaction,
  });
  const tx = await (client as any).create_listing({
    seller: seller.publicKey(),
    ticket_ref: Buffer.from(draft.ticketRef, "hex"),
    original_price: 446400000n,
    resale_price: 446400000n,
  });
  const sent = await tx.signAndSend();
  const listingId = Number(sent.result.unwrap());
  check("listing created on-chain with the backend's ticket_ref", listingId > 0, `listing ${listingId}`);

  const outsiderToken = await signIn(outsider);
  const stolen = await fetch(`${base}/drafts/${draft.draftId}/confirm`, {
    method: "POST",
    headers: { ...auth(outsiderToken), "Content-Type": "application/json" },
    body: JSON.stringify({ listingId }),
  });
  check("another wallet can't confirm the seller's draft", stolen.status === 404);

  // No listing ID hint: the server must find the listing by ticket_ref.
  const confirm = await fetch(`${base}/drafts/${draft.draftId}/confirm`, {
    method: "POST",
    headers: { ...auth(sellerToken), "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const confirmed = await confirm.json();
  check("draft is confirmed against the chain", confirm.ok && confirmed.listingId === listingId, `status ${confirm.status}`);

  const dup = await fetch(`${base}/drafts`, { method: "POST", headers: auth(sellerToken), body: form(details, receipt) });
  check("the same ticket can't be submitted again", dup.status === 409);

  // Public data and access control
  const pub = await (await fetch(`${base}/listings/${listingId}`)).json();
  check("public details are available", pub.eventName === details.eventName);
  check("public details hide the order number and checks", !("orderRef" in pub) && !("issueCount" in pub));

  const outsiderReview = await fetch(`${base}/listings/${listingId}/review`, { headers: auth(outsiderToken) });
  const outsiderEvidence = await fetch(`${base}/listings/${listingId}/evidence`, { headers: auth(outsiderToken) });
  check("other wallets can't see the review data", outsiderReview.status === 403);
  check("other wallets can't download the evidence", outsiderEvidence.status === 403);

  const sellerEvidence = await fetch(`${base}/listings/${listingId}/evidence`, { headers: auth(sellerToken) });
  const bytes = Buffer.from(await sellerEvidence.arrayBuffer());
  check("seller can download their evidence", sellerEvidence.ok && bytes.equals(receipt));

  const adminSecret = execFileSync("stellar", ["keys", "secret", "goin-admin"], { encoding: "utf8" }).trim();
  const admin = Keypair.fromSecret(adminSecret);
  const adminToken = await signIn(admin);
  const me = await (await fetch(`${base}/me`, { headers: auth(adminToken) })).json();
  check("contract admin is recognized as admin", me.isAdmin === true);
  const review = await fetch(`${base}/listings/${listingId}/review`, { headers: auth(adminToken) });
  const reviewData = await review.json();
  check("admin sees order number, OCR result, and checks", review.ok && reviewData.details.orderRef === details.orderRef && reviewData.checks.length > 0);
  const adminList = await (await fetch(`${base}/listings`, { headers: auth(adminToken) })).json();
  check("admin listing view includes issue counts", adminList.every((l: object) => "issueCount" in l));
} catch (e) {
  failures++;
  console.error("FAIL  unexpected error:", e);
} finally {
  server.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dataDir, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
