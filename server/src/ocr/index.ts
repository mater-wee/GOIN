import { createHash } from "node:crypto";
import { createWorker, type Worker } from "tesseract.js";
import { extractText, getDocumentProxy } from "unpdf";
import { config, llmEnabled, paths } from "../config.ts";
import { db } from "../db.ts";
import { extractWithAi } from "./ai.ts";
import { extractWithRules, type ExtractedFields } from "./rules.ts";

export type { ExtractedFields };
export type FieldName = keyof ExtractedFields;

export interface Extraction {
  fields: ExtractedFields;
  /** Where each value came from: the AI model or the built-in rules. */
  sources: Partial<Record<FieldName, "ai" | "rules">>;
  engine: "ocr" | "pdf-text";
  usedAi: boolean;
  /** Tesseract's mean confidence (0-100), for images only. */
  confidence: number | null;
  textLength: number;
  textPreview: string;
  warnings: string[];
}

let worker: Promise<Worker> | null = null;

/** One shared Tesseract worker. The English model downloads once, then is cached. */
function ocrWorker(): Promise<Worker> {
  worker ??= createWorker("eng", undefined, { cachePath: paths.ocrCache });
  worker.catch(() => {
    worker = null;
  });
  return worker;
}

async function readText(file: Buffer, type: string): Promise<{ text: string; confidence: number | null; engine: Extraction["engine"] }> {
  if (type === "application/pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(file));
    const { text } = await extractText(pdf, { mergePages: true });
    return { text, confidence: null, engine: "pdf-text" };
  }
  const result = await (await ocrWorker()).recognize(file);
  return { text: result.data.text, confidence: Math.round(result.data.confidence), engine: "ocr" };
}

/**
 * Reads purchase evidence: OCR for images, the text layer for PDFs, then
 * rule-based extraction, then (if configured) AI extraction on top.
 * Results are cached by file hash, so the same receipt is only read once.
 */
export async function readEvidence(file: Buffer, type: string): Promise<Extraction> {
  // The cache key includes the AI setting, so turning AI on (or changing the
  // model) re-reads receipts instead of returning an older rules-only result.
  const sha = `${createHash("sha256").update(file).digest("hex")}:${llmEnabled ? config.llm.model : "rules"}`;
  const cached = db.prepare("SELECT result FROM ocr_cache WHERE sha256 = ?").get(sha) as { result: string } | undefined;
  if (cached) return JSON.parse(cached.result) as Extraction;

  const warnings: string[] = [];
  const { text, confidence, engine } = await readText(file, type);
  const trimmed = text.trim();

  const rules = extractWithRules(trimmed);
  const sources: Extraction["sources"] = {};
  for (const key of Object.keys(rules) as FieldName[]) if (rules[key] !== undefined) sources[key] = "rules";

  let fields: ExtractedFields = { ...rules };
  let usedAi = false;
  let aiFailed = false;
  if (llmEnabled && trimmed.length >= 20) {
    try {
      const ai = await extractWithAi(trimmed);
      for (const key of Object.keys(ai) as FieldName[]) {
        if (ai[key] !== undefined) {
          (fields as Record<string, unknown>)[key] = ai[key];
          sources[key] = "ai";
        }
      }
      usedAi = true;
    } catch (e) {
      // Logged for whoever runs the server (wrong key, model name, or provider outage).
      console.warn(`AI extraction failed: ${e instanceof Error ? e.message : String(e)}`);
      warnings.push("AI extraction was unavailable, so only the built-in rules were used.");
      aiFailed = true;
    }
  }
  fields = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) as ExtractedFields;

  if (engine === "pdf-text" && trimmed.length < 20) {
    warnings.push("This PDF has no readable text layer. Upload a screenshot or photo of the receipt instead.");
  } else if (trimmed.length < 30) {
    warnings.push("Almost no text was found. The file may not be a receipt, or the photo is too blurry.");
  } else if (confidence !== null && confidence < 60) {
    warnings.push("The receipt image is hard to read. A sharper, well-lit photo will give better results.");
  }

  const extraction: Extraction = {
    fields,
    sources,
    engine,
    usedAi,
    confidence,
    textLength: trimmed.length,
    textPreview: trimmed.slice(0, 1500),
    warnings,
  };
  // Don't cache a result where the AI call failed, so the next upload retries it.
  if (!aiFailed) {
    db.prepare("INSERT OR REPLACE INTO ocr_cache (sha256, result, created_at) VALUES (?, ?, ?)").run(
      sha,
      JSON.stringify(extraction),
      new Date().toISOString(),
    );
  }
  return extraction;
}

export async function shutdownOcr(): Promise<void> {
  if (worker) await (await worker).terminate();
}
