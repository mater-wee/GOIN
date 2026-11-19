import type { AssembledTransaction, Result } from "@stellar/stellar-sdk/contract";
import { Client, type Listing } from "../contracts/credence";
import { CREDENCE_CONTRACT_ID, NETWORK } from "../config";
import { signWithFreighter } from "./wallet";

export type { Listing };
export type ListingStatusTag = Listing["status"]["tag"];

/**
 * Typed CREDENCE client. Pass the connected wallet address for calls that
 * must be signed; omit it for read-only calls, which are only simulated.
 */
export function credence(publicKey?: string): Client {
  return new Client({
    contractId: CREDENCE_CONTRACT_ID,
    networkPassphrase: NETWORK.passphrase,
    rpcUrl: NETWORK.rpcUrl,
    publicKey,
    signTransaction: publicKey ? signWithFreighter : undefined,
  });
}

/**
 * Contract errors mapped to messages for people. The SDK reports a contract
 * error using the doc comment on the variant in lib.rs, so those are the keys.
 */
const CONTRACT_ERRORS: Record<string, string> = {
  "No listing exists with the given ID.": "This listing does not exist.",
  "Prices must be greater than zero.": "Prices must be greater than zero.",
  "Resale price is above the original ticket price (fair-price cap).":
    "The resale price cannot be higher than the original ticket price.",
  "This ticket reference has already been listed.": "This ticket has already been listed on CREDENCE.",
  "The listing is not in the status this action requires.":
    "This action isn't allowed at the listing's current stage. Refresh the page and try again.",
  "A seller cannot buy their own listing.": "You can't buy your own listing.",
};

export function describeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (CONTRACT_ERRORS[msg]) return CONTRACT_ERRORS[msg];
  if (/trustline/i.test(msg)) return "This wallet needs a USDC trustline before it can send or receive USDC.";
  if (/balance is not sufficient|insufficient|underfunded/i.test(msg)) return "Not enough funds in this wallet for this transaction.";
  if (/declin|reject|denied|cancel/i.test(msg)) return "The request was cancelled in Freighter.";
  if (/account not found|404/i.test(msg)) return "This wallet isn't funded on testnet yet. Fund it with Friendbot first.";
  return msg.length > 300 ? `${msg.slice(0, 300)}…` : msg;
}

export interface TxOutcome<T> {
  value: T;
  /** Transaction hash, for the Stellar Expert link. */
  hash?: string;
}

/**
 * Simulates a contract call, stops early with a readable message if the
 * contract would reject it, then asks Freighter to sign and submits it.
 */
export async function submit<T>(build: Promise<AssembledTransaction<Result<T, Error>>>): Promise<TxOutcome<T>> {
  try {
    const tx = await build;
    const simulated = tx.result;
    if (simulated.isErr()) throw new Error(simulated.unwrapErr().message);

    const sent = await tx.signAndSend();
    const final = sent.result;
    if (final.isErr()) throw new Error(final.unwrapErr().message);
    return { value: final.unwrap(), hash: sent.sendTransactionResponse?.hash };
  } catch (e) {
    throw new Error(describeError(e));
  }
}

// ----------------------------- Read-only calls -----------------------------

export async function fetchListing(id: bigint): Promise<Listing | null> {
  const result = (await credence().get_listing({ listing_id: id })).result;
  return result.isOk() ? result.unwrap() : null;
}

/** Loads every listing. The contract numbers listings 1..listing_count. */
export async function fetchListings(): Promise<Listing[]> {
  const client = credence();
  const count = Number((await client.listing_count()).result);
  const ids = Array.from({ length: count }, (_, i) => BigInt(i + 1));
  const txs = await Promise.all(ids.map((id) => client.get_listing({ listing_id: id })));
  return txs.map((tx) => tx.result).filter((r) => r.isOk()).map((r) => r.unwrap());
}

export async function fetchAdmin(): Promise<string> {
  return (await credence().admin()).result;
}
