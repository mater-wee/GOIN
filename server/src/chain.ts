import { contract } from "@stellar/stellar-sdk";
import { config } from "./config.ts";

/** The parts of the on-chain Listing struct (lib.rs) the backend reads. */
export interface ChainListing {
  id: bigint;
  seller: string;
  buyer?: string | null;
  ticket_ref: Uint8Array;
  original_price: bigint;
  resale_price: bigint;
  status: { tag: string };
}

// The SDK builds this client from the contract's on-chain spec, so methods
// are untyped here. These wrappers give them the types we rely on.
interface ResultLike<T> {
  isOk(): boolean;
  unwrap(): T;
}
type ContractMethods = {
  admin(): Promise<{ result: string }>;
  listing_count(): Promise<{ result: bigint }>;
  get_listing(args: { listing_id: bigint }): Promise<{ result: ResultLike<ChainListing> }>;
};

let client: Promise<ContractMethods> | null = null;

function goin(): Promise<ContractMethods> {
  client ??= contract.Client.from({
    contractId: config.contractId,
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
  }).then((c) => c as unknown as ContractMethods);
  client.catch(() => {
    client = null;
  });
  return client;
}

export async function getListing(id: number): Promise<ChainListing | null> {
  const result = (await (await goin()).get_listing({ listing_id: BigInt(id) })).result;
  return result.isOk() ? result.unwrap() : null;
}

export async function listingCount(): Promise<number> {
  return Number((await (await goin()).listing_count()).result);
}

let adminCache: { address: string; at: number } | null = null;

/** The contract's administrator, cached for a minute. */
export async function contractAdmin(): Promise<string> {
  if (adminCache && Date.now() - adminCache.at < 60_000) return adminCache.address;
  const address = (await (await goin()).admin()).result;
  adminCache = { address, at: Date.now() };
  return address;
}

export const toHex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
