import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Networks } from "@stellar/stellar-sdk";

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Reads the contract ID written by contracts/scripts/deploy-testnet.ps1. */
function deployedContractId(): string | undefined {
  try {
    const raw = readFileSync(resolve(serverDir, "../contracts/deployments/testnet.json"), "utf8");
    return JSON.parse(raw.replace(/^\uFEFF/, "")).goin_contract_id;
  } catch {
    return undefined;
  }
}

const env = process.env;

export const config = {
  port: Number(env.PORT ?? 8787),
  contractId: env.GOIN_CONTRACT_ID ?? deployedContractId() ?? "",
  rpcUrl: env.RPC_URL ?? "https://soroban-testnet.stellar.org",
  networkPassphrase: env.NETWORK_PASSPHRASE ?? Networks.TESTNET,
  dataDir: resolve(env.DATA_DIR ?? join(serverDir, "data")),
  /**
   * Web app addresses allowed to call this API from a browser (CORS), comma separated,
   * e.g. "https://goin.vercel.app". Not needed locally, where Vite proxies /api.
   */
  allowedOrigins: (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean),
  /**
   * How many proxies sit in front of the server, so rate limiting sees each visitor's
   * real address. Set TRUST_PROXY=1 on Railway or Render. Locally only Vite's proxy is trusted.
   */
  trustProxy: /^\d+$/.test(env.TRUST_PROXY ?? "") ? Number(env.TRUST_PROXY) : (env.TRUST_PROXY ?? "loopback"),
  /** How long a wallet sign-in stays valid. */
  sessionMs: 12 * 60 * 60 * 1000,
  challengeMs: 5 * 60 * 1000,
  /** Unconfirmed drafts (never listed on-chain) are deleted after this. */
  draftMs: 24 * 60 * 60 * 1000,
  maxUploadBytes: 5 * 1024 * 1024,
  /** Same fixed demo rate as the web app: ₱2,500 = 44.64 USDC. */
  phpPerUsdc: 56,
  /**
   * Optional AI extraction through any OpenAI-compatible chat completions API.
   * Without LLM_API_KEY the server uses OCR plus rule-based extraction only.
   */
  llm: {
    baseUrl: (env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, ""),
    apiKey: env.LLM_API_KEY ?? "",
    model: env.LLM_MODEL ?? "",
  },
};

if (!/^C[A-Z2-7]{55}$/.test(config.contractId)) {
  throw new Error(
    "No GOIN contract ID. Deploy with contracts/scripts/deploy-testnet.ps1 or set GOIN_CONTRACT_ID.",
  );
}

export const llmEnabled = Boolean(config.llm.apiKey && config.llm.model);

export const paths = {
  db: join(config.dataDir, "goin.db"),
  evidence: join(config.dataDir, "evidence"),
  ocrCache: join(config.dataDir, "tesseract"),
};

for (const dir of [config.dataDir, paths.evidence, paths.ocrCache]) mkdirSync(dir, { recursive: true });
