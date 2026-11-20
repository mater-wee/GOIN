import type { NextFunction, Request, Response } from "express";

/** An error with an HTTP status and a message that is safe to show users. */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Tiny in-memory rate limiter (per key, sliding window). Enough for a single
 * server instance; use a shared store if the backend is ever scaled out.
 */
export function rateLimit(opts: { windowMs: number; max: number; key: (req: Request, res: Response) => string }) {
  const hits = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = opts.key(req, res);
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < opts.windowMs);
    if (recent.length >= opts.max) {
      res.status(429).json({ error: "Too many requests. Wait a few minutes and try again." });
      return;
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}
