// Write-path smoke test. Uses a throwaway testnet account (not Freighter) to
// exercise the same simulate -> sign -> send -> result flow the app uses,
// plus the duplicate-ticket and fair-price errors.
// Creates one PendingReview listing on testnet and prints its ID.
// Usage (from the frontend folder): node scripts/smoke-write.mjs
import { readFileSync } from "node:fs";
import { contract, Keypair, Networks } from "@stellar/stellar-sdk";

const raw = readFileSync(new URL("../../contracts/deployments/testnet.json", import.meta.url), "utf8");
const { goin_contract_id: contractId } = JSON.parse(raw.replace(/^\uFEFF/, ""));

const seller = Keypair.random();
const fund = await fetch(`https://friendbot.stellar.org?addr=${seller.publicKey()}`);
console.log(`friendbot funded throwaway seller: ${fund.ok}`);

const client = await contract.Client.from({
  contractId,
  networkPassphrase: Networks.TESTNET,
  rpcUrl: "https://soroban-testnet.stellar.org",
  publicKey: seller.publicKey(),
  signTransaction: contract.basicNodeSigner(seller, Networks.TESTNET).signTransaction,
});

const price = 446400000n;
const ticketRef = crypto.getRandomValues(new Uint8Array(32));
const args = { seller: seller.publicKey(), ticket_ref: ticketRef, original_price: price, resale_price: price };

const tx = await client.create_listing(args);
console.log(`simulation ok: ${tx.result.isOk()}`);
const sent = await tx.signAndSend();
console.log(`created listing id: ${sent.result.unwrap()}`);
console.log(`tx hash: ${sent.sendTransactionResponse?.hash}`);

const dup = (await client.create_listing(args)).result;
console.log(`duplicate -> isErr=${dup.isErr()} message="${dup.isErr() ? dup.unwrapErr().message : ""}"`);

const over = (
  await client.create_listing({ ...args, ticket_ref: crypto.getRandomValues(new Uint8Array(32)), resale_price: price + 1n })
).result;
console.log(`over cap -> isErr=${over.isErr()} message="${over.isErr() ? over.unwrapErr().message : ""}"`);
