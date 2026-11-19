import {Listing, ContractEvent} from './types.js';
import {Result, Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  admin(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Steps 3–5: buyer commits payment for an approved listing.
   *
   * Transfers `resale_price` USDC from the buyer into this contract and
   * records the buyer. The funds stay in escrow until `confirm_transfer`.
   * The buyer's wallet must hold a USDC trustline and enough balance.
   */
  purchase(args: { buyer: string | Address; listing_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  usdc_token(options?: MethodOptions): Promise<AssembledTransaction<string>>;
  /**
   * Returns a listing so the web app can show its status and parties.
   */
  get_listing(args: { listing_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<Listing, Error>>>;
  /**
   * Total number of listings created (also the highest listing ID).
   */
  listing_count(options?: MethodOptions): Promise<AssembledTransaction<bigint>>;
  /**
   * Step 1: seller lists a ticket.
   *
   * The seller signs the call. Purchase evidence is uploaded off-chain; only
   * its hash (`ticket_ref`) is stored. Enforces the fair-price rule
   * (resale <= original) and rejects tickets that were already listed.
   * Returns the new listing ID.
   */
  create_listing(args: { seller: string | Address; ticket_ref: Uint8Array; original_price: bigint; resale_price: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<bigint, Error>>>;
  /**
   * Step 2: administrator approves or rejects a pending listing after
   * checking the off-chain purchase evidence.
   */
  review_listing(args: { listing_id: bigint; approved: boolean }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Step 6: seller reports that the ticket transfer has been started
   * through the ticket provider (or the simulated MVP workflow).
   */
  start_transfer(args: { listing_id: bigint }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
  /**
   * Steps 7–8: administrator (or simulated provider) confirms the outcome.
   *
   * - `success = true`: requires the seller to have started the transfer;
   * releases the escrow to the seller.
   * - `success = false`: allowed after payment or after transfer start
   * (covers a seller who never transfers); refunds the buyer.
   */
  confirm_transfer(args: { listing_id: bigint; success: boolean }, options?: MethodOptions): Promise<AssembledTransaction<Result<null, Error>>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABgAAACRObyBsaXN0aW5nIGV4aXN0cyB3aXRoIHRoZSBnaXZlbiBJRC4AAAAPTGlzdGluZ05vdEZvdW5kAAAAAAEAAAAhUHJpY2VzIG11c3QgYmUgZ3JlYXRlciB0aGFuIHplcm8uAAAAAAAADEludmFsaWRQcmljZQAAAAIAAABBUmVzYWxlIHByaWNlIGlzIGFib3ZlIHRoZSBvcmlnaW5hbCB0aWNrZXQgcHJpY2UgKGZhaXItcHJpY2UgY2FwKS4AAAAAAAASUHJpY2VBYm92ZU9yaWdpbmFsAAAAAAADAAAALlRoaXMgdGlja2V0IHJlZmVyZW5jZSBoYXMgYWxyZWFkeSBiZWVuIGxpc3RlZC4AAAAAAA9EdXBsaWNhdGVUaWNrZXQAAAAABAAAADZUaGUgbGlzdGluZyBpcyBub3QgaW4gdGhlIHN0YXR1cyB0aGlzIGFjdGlvbiByZXF1aXJlcy4AAAAAAA1JbnZhbGlkU3RhdHVzAAAAAAAABQAAACZBIHNlbGxlciBjYW5ub3QgYnV5IHRoZWlyIG93biBsaXN0aW5nLgAAAAAAD1NlbGxlckNhbm5vdEJ1eQAAAAAG", "AAAAAQAAADFPbi1jaGFpbiByZWNvcmQgb2YgYSBsaXN0aW5nIGFuZCBpdHMgdHJhbnNhY3Rpb24uAAAAAAAAAAAAAAdMaXN0aW5nAAAAAAcAAAAhU2V0IG9uY2UgYSBidXllciBjb21taXRzIHBheW1lbnQuAAAAAAAABWJ1eWVyAAAAAAAD6AAAABMAAAAAAAAAAmlkAAAAAAAGAAAANU9yaWdpbmFsIGZhY2UgdmFsdWUsIGluIFVTREMgYmFzZSB1bml0cyAoNyBkZWNpbWFscykuAAAAAAAADm9yaWdpbmFsX3ByaWNlAAAAAAALAAAARVJlcXVlc3RlZCByZXNhbGUgcHJpY2UsIGluIFVTREMgYmFzZSB1bml0cy4gQWx3YXlzIDw9IG9yaWdpbmFsX3ByaWNlLgAAAAAAAAxyZXNhbGVfcHJpY2UAAAALAAAAAAAAAAZzZWxsZXIAAAAAABMAAAAAAAAABnN0YXR1cwAAAAAH0AAAAA1MaXN0aW5nU3RhdHVzAAAAAAAAdVNIQS0yNTYgb2YgdGhlIG9mZi1jaGFpbiB0aWNrZXQgcmVjb3JkIChldmVudCwgc2VhdCwgdGlja2V0IElEKS4KVXNlZCB0byBibG9jayBkdXBsaWNhdGUgbGlzdGluZ3Mgb2YgdGhlIHNhbWUgdGlja2V0LgAAAAAAAAp0aWNrZXRfcmVmAAAAAAPuAAAAIA==", "AAAABQAAAAAAAAAAAAAAB1NldHRsZWQAAAAAAQAAAAdzZXR0bGVkAAAAAAMAAAAAAAAACmxpc3RpbmdfaWQAAAAAAAYAAAABAAAAAAAAAAZzZWxsZXIAAAAAABMAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==", "AAAABQAAAAAAAAAAAAAACFJlZnVuZGVkAAAAAQAAAAhyZWZ1bmRlZAAAAAMAAAAAAAAACmxpc3RpbmdfaWQAAAAAAAYAAAABAAAAAAAAAAVidXllcgAAAAAAABMAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==", "AAAAAgAAACVMaWZlY3ljbGUgb2YgYSBzaW5nbGUgcmVzYWxlIGxpc3RpbmcuAAAAAAAAAAAAAA1MaXN0aW5nU3RhdHVzAAAAAAAABwAAAAAAAAA/U2VsbGVyIHN1Ym1pdHRlZCB0aGUgbGlzdGluZzsgd2FpdGluZyBmb3IgYWRtaW5pc3RyYXRvciByZXZpZXcuAAAAAA1QZW5kaW5nUmV2aWV3AAAAAAAAAAAAADlBZG1pbmlzdHJhdG9yIGFwcHJvdmVkIHRoZSBldmlkZW5jZTsgYnV5ZXJzIGNhbiBwdXJjaGFzZS4AAAAAAAAIQXBwcm92ZWQAAAAAAAAAN0FkbWluaXN0cmF0b3IgcmVqZWN0ZWQgdGhlIGV2aWRlbmNlOyBsaXN0aW5nIGlzIGNsb3NlZC4AAAAACFJlamVjdGVkAAAAAAAAADRCdXllciBwYWlkOyBVU0RDIGlzIGhlbGQgaW4gZXNjcm93IGJ5IHRoaXMgY29udHJhY3QuAAAAEFBheW1lbnRDb21taXR0ZWQAAAAAAAAANFNlbGxlciByZXBvcnRzIHRoZSB0aWNrZXQgdHJhbnNmZXIgaGFzIGJlZW4gc3RhcnRlZC4AAAARVHJhbnNmZXJJbml0aWF0ZWQAAAAAAAAAAAAAMlRyYW5zZmVyIGNvbmZpcm1lZDsgZXNjcm93IHJlbGVhc2VkIHRvIHRoZSBzZWxsZXIuAAAAAAAHU2V0dGxlZAAAAAAAAAAALlRyYW5zZmVyIGZhaWxlZDsgZXNjcm93IHJldHVybmVkIHRvIHRoZSBidXllci4AAAAAAAhSZWZ1bmRlZA==", "AAAABQAAAAAAAAAAAAAADkxpc3RpbmdDcmVhdGVkAAAAAAABAAAAD2xpc3RpbmdfY3JlYXRlZAAAAAADAAAAAAAAAApsaXN0aW5nX2lkAAAAAAAGAAAAAQAAAAAAAAAGc2VsbGVyAAAAAAATAAAAAAAAAAAAAAAMcmVzYWxlX3ByaWNlAAAACwAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAD0xpc3RpbmdSZXZpZXdlZAAAAAABAAAAEGxpc3RpbmdfcmV2aWV3ZWQAAAACAAAAAAAAAApsaXN0aW5nX2lkAAAAAAAGAAAAAQAAAAAAAAAIYXBwcm92ZWQAAAABAAAAAAAAAAI=", "AAAABQAAAAAAAAAAAAAAEFBheW1lbnRDb21taXR0ZWQAAAABAAAAEXBheW1lbnRfY29tbWl0dGVkAAAAAAAAAwAAAAAAAAAKbGlzdGluZ19pZAAAAAAABgAAAAEAAAAAAAAABWJ1eWVyAAAAAAAAEwAAAAAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC", "AAAABQAAAAAAAAAAAAAAEVRyYW5zZmVySW5pdGlhdGVkAAAAAAAAAQAAABJ0cmFuc2Zlcl9pbml0aWF0ZWQAAAAAAAEAAAAAAAAACmxpc3RpbmdfaWQAAAAAAAYAAAABAAAAAg==", "AAAAAAAAAAAAAAAFYWRtaW4AAAAAAAAAAAAAAQAAABM=", "AAAAAAAAAQhTdGVwcyAz4oCTNTogYnV5ZXIgY29tbWl0cyBwYXltZW50IGZvciBhbiBhcHByb3ZlZCBsaXN0aW5nLgoKVHJhbnNmZXJzIGByZXNhbGVfcHJpY2VgIFVTREMgZnJvbSB0aGUgYnV5ZXIgaW50byB0aGlzIGNvbnRyYWN0IGFuZApyZWNvcmRzIHRoZSBidXllci4gVGhlIGZ1bmRzIHN0YXkgaW4gZXNjcm93IHVudGlsIGBjb25maXJtX3RyYW5zZmVyYC4KVGhlIGJ1eWVyJ3Mgd2FsbGV0IG11c3QgaG9sZCBhIFVTREMgdHJ1c3RsaW5lIGFuZCBlbm91Z2ggYmFsYW5jZS4AAAAIcHVyY2hhc2UAAAACAAAAAAAAAAVidXllcgAAAAAAABMAAAAAAAAACmxpc3RpbmdfaWQAAAAAAAYAAAABAAAD6QAAAAIAAAAD", "AAAAAAAAAAAAAAAKdXNkY190b2tlbgAAAAAAAAAAAAEAAAAT", "AAAAAAAAAEFSZXR1cm5zIGEgbGlzdGluZyBzbyB0aGUgd2ViIGFwcCBjYW4gc2hvdyBpdHMgc3RhdHVzIGFuZCBwYXJ0aWVzLgAAAAAAAAtnZXRfbGlzdGluZwAAAAABAAAAAAAAAApsaXN0aW5nX2lkAAAAAAAGAAAAAQAAA+kAAAfQAAAAB0xpc3RpbmcAAAAAAw==", "AAAAAAAAAItSdW5zIG9uY2UgYXQgZGVwbG95bWVudC4gU2V0cyB0aGUgYWRtaW5pc3RyYXRvciBhbmQgdGhlIFVTREMgdG9rZW4KY29udHJhY3QuIFVzaW5nIGEgY29uc3RydWN0b3IgbWVhbnMgbm9ib2R5IGNhbiBmcm9udC1ydW4gaW5pdGlhbGl6YXRpb24uAAAAAA1fX2NvbnN0cnVjdG9yAAAAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAp1c2RjX3Rva2VuAAAAAAATAAAAAA==", "AAAAAAAAAD9Ub3RhbCBudW1iZXIgb2YgbGlzdGluZ3MgY3JlYXRlZCAoYWxzbyB0aGUgaGlnaGVzdCBsaXN0aW5nIElEKS4AAAAADWxpc3RpbmdfY291bnQAAAAAAAAAAAAAAQAAAAY=", "AAAAAAAAAQdTdGVwIDE6IHNlbGxlciBsaXN0cyBhIHRpY2tldC4KClRoZSBzZWxsZXIgc2lnbnMgdGhlIGNhbGwuIFB1cmNoYXNlIGV2aWRlbmNlIGlzIHVwbG9hZGVkIG9mZi1jaGFpbjsgb25seQppdHMgaGFzaCAoYHRpY2tldF9yZWZgKSBpcyBzdG9yZWQuIEVuZm9yY2VzIHRoZSBmYWlyLXByaWNlIHJ1bGUKKHJlc2FsZSA8PSBvcmlnaW5hbCkgYW5kIHJlamVjdHMgdGlja2V0cyB0aGF0IHdlcmUgYWxyZWFkeSBsaXN0ZWQuClJldHVybnMgdGhlIG5ldyBsaXN0aW5nIElELgAAAAAOY3JlYXRlX2xpc3RpbmcAAAAAAAQAAAAAAAAABnNlbGxlcgAAAAAAEwAAAAAAAAAKdGlja2V0X3JlZgAAAAAD7gAAACAAAAAAAAAADm9yaWdpbmFsX3ByaWNlAAAAAAALAAAAAAAAAAxyZXNhbGVfcHJpY2UAAAALAAAAAQAAA+kAAAAGAAAAAw==", "AAAAAAAAAGtTdGVwIDI6IGFkbWluaXN0cmF0b3IgYXBwcm92ZXMgb3IgcmVqZWN0cyBhIHBlbmRpbmcgbGlzdGluZyBhZnRlcgpjaGVja2luZyB0aGUgb2ZmLWNoYWluIHB1cmNoYXNlIGV2aWRlbmNlLgAAAAAOcmV2aWV3X2xpc3RpbmcAAAAAAAIAAAAAAAAACmxpc3RpbmdfaWQAAAAAAAYAAAAAAAAACGFwcHJvdmVkAAAAAQAAAAEAAAPpAAAAAgAAAAM=", "AAAAAAAAAH1TdGVwIDY6IHNlbGxlciByZXBvcnRzIHRoYXQgdGhlIHRpY2tldCB0cmFuc2ZlciBoYXMgYmVlbiBzdGFydGVkCnRocm91Z2ggdGhlIHRpY2tldCBwcm92aWRlciAob3IgdGhlIHNpbXVsYXRlZCBNVlAgd29ya2Zsb3cpLgAAAAAAAA5zdGFydF90cmFuc2ZlcgAAAAAAAQAAAAAAAAAKbGlzdGluZ19pZAAAAAAABgAAAAEAAAPpAAAAAgAAAAM=", "AAAAAAAAAS9TdGVwcyA34oCTODogYWRtaW5pc3RyYXRvciAob3Igc2ltdWxhdGVkIHByb3ZpZGVyKSBjb25maXJtcyB0aGUgb3V0Y29tZS4KCi0gYHN1Y2Nlc3MgPSB0cnVlYDogcmVxdWlyZXMgdGhlIHNlbGxlciB0byBoYXZlIHN0YXJ0ZWQgdGhlIHRyYW5zZmVyOwpyZWxlYXNlcyB0aGUgZXNjcm93IHRvIHRoZSBzZWxsZXIuCi0gYHN1Y2Nlc3MgPSBmYWxzZWA6IGFsbG93ZWQgYWZ0ZXIgcGF5bWVudCBvciBhZnRlciB0cmFuc2ZlciBzdGFydAooY292ZXJzIGEgc2VsbGVyIHdobyBuZXZlciB0cmFuc2ZlcnMpOyByZWZ1bmRzIHRoZSBidXllci4AAAAAEGNvbmZpcm1fdHJhbnNmZXIAAAACAAAAAAAAAApsaXN0aW5nX2lkAAAAAAAGAAAAAAAAAAdzdWNjZXNzAAAAAAEAAAABAAAD6QAAAAIAAAAD"]),
      options
    );
  }

   static deploy<T = Client>(args: { admin: string | Address; usdc_token: string | Address }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(args, options);
  }
  public readonly fromJson = {
    admin : this.txFromJson<string>,  purchase : this.txFromJson<Result<null, Error>>,  usdc_token : this.txFromJson<string>,  get_listing : this.txFromJson<Result<Listing, Error>>,  listing_count : this.txFromJson<bigint>,  create_listing : this.txFromJson<Result<bigint, Error>>,  review_listing : this.txFromJson<Result<null, Error>>,  start_transfer : this.txFromJson<Result<null, Error>>,  confirm_transfer : this.txFromJson<Result<null, Error>>
  };

  /** @deprecated Use fromJson instead. */
  public readonly fromJSON = this.fromJson;

  /**
   * Parse a raw contract event (topics + data) into a typed {@link ContractEvent}.
   */
  parseEvent(topics: xdr.ScVal[] | string[], data: xdr.ScVal | string): ContractEvent | undefined {
    return this.spec.parseEvent(topics, data) as ContractEvent | undefined;
  }
  /**
   * Build a topics filter row for the "Settled" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  settledEventFilter(topicValues?: { listing_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("Settled", topicValues);
  }
  /**
   * Build a topics filter row for the "Refunded" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  refundedEventFilter(topicValues?: { listing_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("Refunded", topicValues);
  }
  /**
   * Build a topics filter row for the "ListingCreated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  listingCreatedEventFilter(topicValues?: { listing_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("ListingCreated", topicValues);
  }
  /**
   * Build a topics filter row for the "ListingReviewed" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  listingReviewedEventFilter(topicValues?: { listing_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("ListingReviewed", topicValues);
  }
  /**
   * Build a topics filter row for the "PaymentCommitted" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  paymentCommittedEventFilter(topicValues?: { listing_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("PaymentCommitted", topicValues);
  }
  /**
   * Build a topics filter row for the "TransferInitiated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  transferInitiatedEventFilter(topicValues?: { listing_id?: bigint }): string[] {
    return this.spec.eventTopicFilter("TransferInitiated", topicValues);
  }
}