// Read-only smoke test: loads every listing from the deployed contract the
// same way the web app does, and prints the fields the UI relies on.
// Usage (from the frontend folder): node scripts/smoke-read.mjs
import { readFileSync } from "node:fs";
import { contract, Networks } from "@stellar/stellar-sdk";

const raw = readFileSync(new URL("../../contracts/deployments/testnet.json", import.meta.url), "utf8");
const { goin_contract_id: contractId, admin } = JSON.parse(raw.replace(/^\uFEFF/, ""));

const client = await contract.Client.from({
  contractId,
  networkPassphrase: Networks.TESTNET,
  rpcUrl: "https://soroban-testnet.stellar.org",
});

const storedAdmin = (await client.admin()).result;
console.log(`admin matches deployment: ${storedAdmin === admin}`);

const count = Number((await client.listing_count()).result);
console.log(`listing_count: ${count}`);

for (let id = 1; id <= count; id++) {
  const result = (await client.get_listing({ listing_id: BigInt(id) })).result;
  const l = result.unwrap();
  console.log(
    `#${l.id} status=${l.status.tag} price=${l.resale_price} (${typeof l.resale_price}) ` +
      `seller=${l.seller.slice(0, 6)} buyer=${l.buyer ? l.buyer.slice(0, 6) : l.buyer} ticket_ref=${l.ticket_ref.length} bytes`,
  );
}

const missing = (await client.get_listing({ listing_id: 9999n })).result;
console.log(`missing listing -> isErr=${missing.isErr()} message=${missing.isErr() ? missing.unwrapErr().message : ""}`);
