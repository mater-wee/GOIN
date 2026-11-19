import { Networks } from "@stellar/stellar-sdk";

// Defaults match contracts/deployments/testnet.json. Override with .env.local.
const env = import.meta.env;

export const NETWORK = {
  passphrase: Networks.TESTNET,
  rpcUrl: env.VITE_RPC_URL ?? "https://soroban-testnet.stellar.org",
  horizonUrl: env.VITE_HORIZON_URL ?? "https://horizon-testnet.stellar.org",
  friendbotUrl: "https://friendbot.stellar.org",
  explorerUrl: "https://stellar.expert/explorer/testnet",
};

export const CREDENCE_CONTRACT_ID =
  env.VITE_CREDENCE_CONTRACT_ID ?? "CCGP3BS7EB37RRVJLL4HLZ6KEZX2TEM3U6SNWLNKDIFPDHSYKCP2R5YI";

/** Test USDC issued for the demo by contracts/scripts/deploy-testnet.ps1. */
export const USDC_ASSET = {
  code: "USDC",
  issuer: env.VITE_USDC_ISSUER ?? "GAK5OFCY24HGG2RGGGSOW6ECTEZ2QRJIV4DNWNWB6OH7G6XNCXJXWQD6",
};

/**
 * Fixed demo exchange rate. ₱2,500 / 56 = 44.64 USDC, matching the MVP
 * example in the idea document. A production app would use a live rate.
 */
export const PHP_PER_USDC = 56;

export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
