import {Address} from '@stellar/stellar-sdk';

    /**
 * Error Enum: Error
 */
export const Error = {
  /**
   * No listing exists with the given ID.
   */
  1 : { message: "ListingNotFound" },
  /**
   * Prices must be greater than zero.
   */
  2 : { message: "InvalidPrice" },
  /**
   * Resale price is above the original ticket price (fair-price cap).
   */
  3 : { message: "PriceAboveOriginal" },
  /**
   * This ticket reference has already been listed.
   */
  4 : { message: "DuplicateTicket" },
  /**
   * The listing is not in the status this action requires.
   */
  5 : { message: "InvalidStatus" },
  /**
   * A seller cannot buy their own listing.
   */
  6 : { message: "SellerCannotBuy" }
}

/**
 * On-chain record of a listing and its transaction.
 */
export interface Listing {
  /**
   * Set once a buyer commits payment.
   */
  buyer: string | null;
  id: bigint;
  /**
   * Original face value, in USDC base units (7 decimals).
   */
  original_price: bigint;
  /**
   * Requested resale price, in USDC base units. Always <= original_price.
   */
  resale_price: bigint;
  seller: string;
  status: ListingStatus;
  /**
   * SHA-256 of the off-chain ticket record (event, seat, ticket ID).
   * Used to block duplicate listings of the same ticket.
   */
  ticket_ref: Uint8Array;
}

/**
 * Event: Settled
 */
export interface SettledEvent {
  name: "Settled";
  data: {
    listing_id: bigint;
    seller?: string;
    amount?: bigint;
  };
}

/**
 * Event: Refunded
 */
export interface RefundedEvent {
  name: "Refunded";
  data: {
    listing_id: bigint;
    buyer?: string;
    amount?: bigint;
  };
}

/**
 * Lifecycle of a single resale listing.
 */
 export type ListingStatus =
  /**
   * Seller submitted the listing; waiting for administrator review.
   */
  { tag: "PendingReview"; values: void } |
  /**
   * Administrator approved the evidence; buyers can purchase.
   */
  { tag: "Approved"; values: void } |
  /**
   * Administrator rejected the evidence; listing is closed.
   */
  { tag: "Rejected"; values: void } |
  /**
   * Buyer paid; USDC is held in escrow by this contract.
   */
  { tag: "PaymentCommitted"; values: void } |
  /**
   * Seller reports the ticket transfer has been started.
   */
  { tag: "TransferInitiated"; values: void } |
  /**
   * Transfer confirmed; escrow released to the seller.
   */
  { tag: "Settled"; values: void } |
  /**
   * Transfer failed; escrow returned to the buyer.
   */
  { tag: "Refunded"; values: void };

/**
 * Event: ListingCreated
 */
export interface ListingCreatedEvent {
  name: "ListingCreated";
  data: {
    listing_id: bigint;
    seller?: string;
    resale_price?: bigint;
  };
}

/**
 * Event: ListingReviewed
 */
export interface ListingReviewedEvent {
  name: "ListingReviewed";
  data: {
    listing_id: bigint;
    approved?: boolean;
  };
}

/**
 * Event: PaymentCommitted
 */
export interface PaymentCommittedEvent {
  name: "PaymentCommitted";
  data: {
    listing_id: bigint;
    buyer?: string;
    amount?: bigint;
  };
}

/**
 * Event: TransferInitiated
 */
export interface TransferInitiatedEvent {
  name: "TransferInitiated";
  data: {
    listing_id: bigint;
  };
}
    export type ContractEvent = SettledEvent | RefundedEvent | ListingCreatedEvent | ListingReviewedEvent | PaymentCommittedEvent | TransferInitiatedEvent;
    