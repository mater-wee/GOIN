// Regenerates the typed GOIN contract client from the deployed contract.
//
// Reads the contract ID from contracts/deployments/testnet.json (written by
// contracts/scripts/deploy-testnet.ps1), runs the Stellar JS SDK bindings
// generator, and copies the generated sources into src/contracts/goin.
//
// Usage (from the frontend folder): npm run generate:contract
import { execSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const deploymentFile = resolve(frontendDir, "../contracts/deployments/testnet.json");
const outputDir = join(frontendDir, "src", "contracts", "goin");

const raw = readFileSync(deploymentFile, "utf8").replace(/^\uFEFF/, "");
const { goin_contract_id: contractId, network } = JSON.parse(raw);
if (!/^C[A-Z2-7]{55}$/.test(contractId)) {
  throw new Error(`Invalid contract ID in ${deploymentFile}: ${contractId}`);
}

const tmp = mkdtempSync(join(tmpdir(), "goin-bindings-"));
try {
  execSync(
    `npx stellar-js generate --contract-id ${contractId} --network ${network} --output-dir "${tmp}" --contract-name goin --overwrite`,
    { cwd: frontendDir, stdio: "inherit" },
  );
  rmSync(outputDir, { recursive: true, force: true });
  cpSync(join(tmp, "src"), outputDir, { recursive: true });
  console.log(`Generated GOIN client for ${contractId} in ${outputDir}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
