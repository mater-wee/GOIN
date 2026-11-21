import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { purgeExpiredAuth } from "./auth.ts";
import { config, llmEnabled } from "./config.ts";
import { db } from "./db.ts";
import { deleteEvidence } from "./evidence.ts";
import { HttpError } from "./http.ts";
import { shutdownOcr } from "./ocr/index.ts";
import { api } from "./routes.ts";

const app = express();
app.disable("x-powered-by");
// Locally, only Vite's proxy is trusted. When hosted, TRUST_PROXY counts the host's proxies.
app.set("trust proxy", config.trustProxy);

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

// CORS: when the web app is hosted on another domain (e.g. Vercel), only the
// addresses in ALLOWED_ORIGINS may call the API from a browser.
app.use("/api", (req, res, next) => {
  const origin = req.headers.origin;
  const allowed = !!origin && config.allowedOrigins.includes(origin);
  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Max-Age", "600");
  }
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") {
    res.sendStatus(allowed ? 204 : 403);
    return;
  }
  next();
});
app.use(express.json({ limit: "20kb" }));
app.use("/api", api);
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found." });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
  } else if (err instanceof multer.MulterError) {
    const tooBig = err.code === "LIMIT_FILE_SIZE";
    res.status(tooBig ? 413 : 400).json({ error: tooBig ? "The evidence file must be 5 MB or smaller." : "Invalid upload." });
  } else if (err instanceof SyntaxError) {
    res.status(400).json({ error: "Invalid request body." });
  } else {
    console.error(err);
    res.status(500).json({ error: "Something went wrong on the GOIN server. Try again." });
  }
});

/** Removes expired sign-ins and drafts that were never listed on-chain. */
function cleanup(): void {
  purgeExpiredAuth();
  const cutoff = new Date(Date.now() - config.draftMs).toISOString();
  const stale = db
    .prepare("SELECT id, evidence_file FROM tickets WHERE listing_id IS NULL AND created_at < ?")
    .all(cutoff) as { id: string; evidence_file: string }[];
  for (const row of stale) {
    deleteEvidence(row.evidence_file);
    db.prepare("DELETE FROM tickets WHERE id = ?").run(row.id);
  }
}
cleanup();
const cleanupTimer = setInterval(cleanup, 60 * 60 * 1000);

const server = app.listen(config.port, () => {
  console.log(`GOIN server on http://localhost:${config.port}`);
  console.log(`  contract  ${config.contractId}`);
  console.log(`  AI extraction ${llmEnabled ? `on (${config.llm.model})` : "off (OCR + rules only)"}`);
});
server.on("error", (err) => {
  console.error(`Could not start the server: ${err.message}`);
  process.exit(1);
});

async function shutdown(): Promise<void> {
  clearInterval(cleanupTimer);
  server.close();
  await shutdownOcr().catch(() => {});
  db.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
