import { createHash, randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { config } from "./config.ts";
import { db } from "./db.ts";
import { HttpError } from "./http.ts";

/**
 * Wallet sign-in. The server issues a one-time message, the wallet signs it
 * (Freighter `signMessage`, SEP-53), and the server returns a session token.
 * Signing a message is not a transaction and costs nothing.
 */

const SEP53_PREFIX = "Stellar Signed Message:\n";
const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest();

export function isStellarAccount(address: unknown): address is string {
  return typeof address === "string" && StrKey.isValidEd25519PublicKey(address);
}

/** Verifies a SEP-53 signature: ed25519 over SHA256(prefix + message). */
export function verifySep53(address: string, message: string, signature: Buffer): boolean {
  if (signature.length !== 64) return false;
  const keypair = Keypair.fromPublicKey(address);
  const hash = sha256(Buffer.concat([Buffer.from(SEP53_PREFIX, "utf8"), Buffer.from(message, "utf8")]));
  return keypair.verify(hash, signature);
}

/** Wallets return the signature as base64 (Freighter) or hex. */
export function decodeSignature(value: unknown): Buffer | null {
  if (typeof value !== "string") return null;
  if (/^[0-9a-f]{128}$/i.test(value)) return Buffer.from(value, "hex");
  const decoded = Buffer.from(value, "base64");
  return decoded.length === 64 ? decoded : null;
}

export function createChallenge(address: string): { nonce: string; message: string } {
  const nonce = randomBytes(16).toString("hex");
  const message = [
    "GOIN sign-in",
    "",
    "Sign this message to prove you own this wallet.",
    "It is not a transaction and costs nothing.",
    "",
    `Wallet: ${address}`,
    `Nonce: ${nonce}`,
    `Issued: ${new Date().toISOString()}`,
  ].join("\n");
  db.prepare("INSERT INTO challenges (nonce, address, message, expires_at) VALUES (?, ?, ?, ?)").run(
    nonce,
    address,
    message,
    Date.now() + config.challengeMs,
  );
  return { nonce, message };
}

export function verifyChallenge(address: string, nonce: string, signature: Buffer): { token: string; expiresAt: number } {
  const row = db.prepare("SELECT address, message, expires_at FROM challenges WHERE nonce = ?").get(nonce) as
    | { address: string; message: string; expires_at: number }
    | undefined;
  // Each challenge can be used once, whether or not verification succeeds.
  db.prepare("DELETE FROM challenges WHERE nonce = ?").run(nonce);

  if (!row || row.address !== address || row.expires_at < Date.now()) {
    throw new HttpError(401, "This sign-in request expired. Try again.");
  }
  if (!verifySep53(address, row.message, signature)) {
    throw new HttpError(401, "The wallet signature is not valid for this address.");
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + config.sessionMs;
  db.prepare("INSERT INTO sessions (token_hash, address, expires_at) VALUES (?, ?, ?)").run(
    sha256(token).toString("hex"),
    address,
    expiresAt,
  );
  return { token, expiresAt };
}

function sessionAddress(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const tokenHash = sha256(header.slice(7).trim()).toString("hex");
  const row = db.prepare("SELECT address FROM sessions WHERE token_hash = ? AND expires_at > ?").get(tokenHash, Date.now()) as
    | { address: string }
    | undefined;
  return row?.address ?? null;
}

/** Rejects the request unless it carries a valid session token. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const address = sessionAddress(req);
  if (!address) {
    res.status(401).json({ error: "Sign in with your wallet first." });
    return;
  }
  res.locals.address = address;
  next();
}

/** Attaches the signed-in address if there is one, without requiring it. */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  res.locals.address = sessionAddress(req);
  next();
}

export function signedInAddress(res: Response): string {
  return res.locals.address as string;
}

export function purgeExpiredAuth(): void {
  const now = Date.now();
  db.prepare("DELETE FROM challenges WHERE expires_at < ?").run(now);
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
}
