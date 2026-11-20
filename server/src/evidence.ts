import { randomBytes } from "node:crypto";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Request } from "express";
import multer from "multer";
import { config, paths } from "./config.ts";
import { HttpError } from "./http.ts";

/** Uploads are kept in memory (max 5 MB, one file) until validated. */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1, fields: 5, fieldSize: 16 * 1024 },
});

export type EvidenceType = "image/png" | "image/jpeg" | "image/webp" | "application/pdf";

const EXTENSIONS: Record<EvidenceType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** Detects the real file type from its first bytes, ignoring what the browser claims. */
export function detectType(buf: Buffer): EvidenceType | null {
  if (buf.length < 12) return null;
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

export interface UploadedEvidence {
  buffer: Buffer;
  type: EvidenceType;
  name: string;
}

export function requireEvidence(req: Request): UploadedEvidence {
  const file = req.file;
  if (!file) throw new HttpError(400, "Upload your purchase evidence (receipt or ticket screenshot).");
  const type = detectType(file.buffer);
  if (!type) throw new HttpError(415, "Upload a JPG, PNG, or WEBP image, or a PDF.");
  const name = basename(file.originalname).replace(/[^\w.\- ]+/g, "_").slice(0, 80) || `evidence.${EXTENSIONS[type]}`;
  return { buffer: file.buffer, type, name };
}

/** Stores evidence under a random name. The seller's file name is never used as a path. */
export function saveEvidence(file: UploadedEvidence): string {
  const stored = `${randomBytes(16).toString("hex")}.${EXTENSIONS[file.type]}`;
  writeFileSync(join(paths.evidence, stored), file.buffer, { flag: "wx" });
  return stored;
}

export function evidencePath(stored: string): string {
  return join(paths.evidence, basename(stored));
}

export function deleteEvidence(stored: string): void {
  const path = evidencePath(stored);
  if (existsSync(path)) rmSync(path);
}

export const evidenceExtension = (type: string) => EXTENSIONS[type as EvidenceType] ?? "bin";
