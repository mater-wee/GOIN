//! CREDENCE: protected peer-to-peer ticket resale on Stellar.
//!
//! MVP flow implemented by this contract:
//! 1. Seller creates a listing (`create_listing`). The resale price may not exceed
//!    the original price, and the same ticket cannot be listed twice.
//! 2. Administrator reviews the off-chain purchase evidence and approves or
//!    rejects the listing (`review_listing`).
//! 3. Buyer commits payment (`purchase`). The USDC moves from the buyer into this
//!    contract, which holds it in escrow.
//! 4. Seller marks that the ticket transfer has started (`start_transfer`).
//! 5. Administrator (or simulated ticket provider) confirms whether the transfer
//!    succeeded (`confirm_transfer`). On success the escrow is paid to the seller;
//!    on failure the escrow is refunded to the buyer.
//!
//! Personal information, ticket files, QR codes and receipts stay off-chain.
//! On-chain we only store a 32-byte reference (hash) of the ticket record,
//! prices, the parties' Stellar addresses and the transaction status.
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, BytesN,
    Env,
};

/// Roughly one day of ledgers (5-second close time).
const DAY_IN_LEDGERS: u32 = 17_280;
/// Keep contract data alive for ~30 days after each touch.
const TTL_EXTEND_TO: u32 = 30 * DAY_IN_LEDGERS;
/// Only extend when fewer than ~29 days remain, to avoid paying on every call.
const TTL_THRESHOLD: u32 = TTL_EXTEND_TO - DAY_IN_LEDGERS;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// No listing exists with the given ID.
    ListingNotFound = 1,
    /// Prices must be greater than zero.
    InvalidPrice = 2,
    /// Resale price is above the original ticket price (fair-price cap).
    PriceAboveOriginal = 3,
    /// This ticket reference has already been listed.
    DuplicateTicket = 4,
    /// The listing is not in the status this action requires.
    InvalidStatus = 5,
    /// A seller cannot buy their own listing.
    SellerCannotBuy = 6,
}

// ---------------------------------------------------------------------------
// Storage types
// ---------------------------------------------------------------------------

/// Lifecycle of a single resale listing.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ListingStatus {
    /// Seller submitted the listing; waiting for administrator review.
    PendingReview,
    /// Administrator approved the evidence; buyers can purchase.
    Approved,
    /// Administrator rejected the evidence; listing is closed.
    Rejected,
    /// Buyer paid; USDC is held in escrow by this contract.
    PaymentCommitted,
    /// Seller reports the ticket transfer has been started.
    TransferInitiated,
    /// Transfer confirmed; escrow released to the seller.
    Settled,
    /// Transfer failed; escrow returned to the buyer.
    Refunded,
}

/// On-chain record of a listing and its transaction.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Listing {
    pub id: u64,
    pub seller: Address,
    /// SHA-256 of the off-chain ticket record (event, seat, ticket ID).
    /// Used to block duplicate listings of the same ticket.
    pub ticket_ref: BytesN<32>,
    /// Original face value, in USDC base units (7 decimals).
    pub original_price: i128,
    /// Requested resale price, in USDC base units. Always <= original_price.
    pub resale_price: i128,
    /// Set once a buyer commits payment.
    pub buyer: Option<Address>,
    pub status: ListingStatus,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Administrator who reviews listings and confirms transfers.
    Admin,
    /// Address of the USDC token contract (Stellar Asset Contract).
    Token,
    /// Number of listings created; also the last assigned listing ID.
    ListingCount,
    /// Listing record by ID.
    Listing(u64),
    /// Marks a ticket reference as already listed.
    TicketRef(BytesN<32>),
}

// ---------------------------------------------------------------------------
// Events (picked up by the web app to show transaction status)
// ---------------------------------------------------------------------------

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ListingCreated {
    #[topic]
    pub listing_id: u64,
    pub seller: Address,
    pub resale_price: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ListingReviewed {
    #[topic]
    pub listing_id: u64,
    pub approved: bool,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentCommitted {
    #[topic]
    pub listing_id: u64,
    pub buyer: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TransferInitiated {
    #[topic]
    pub listing_id: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Settled {
    #[topic]
    pub listing_id: u64,
    pub seller: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Refunded {
    #[topic]
    pub listing_id: u64,
    pub buyer: Address,
    pub amount: i128,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct Credence;

#[contractimpl]
impl Credence {
    /// Runs once at deployment. Sets the administrator and the USDC token
    /// contract. Using a constructor means nobody can front-run initialization.
    pub fn __constructor(env: Env, admin: Address, usdc_token: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &usdc_token);
        env.storage().instance().set(&DataKey::ListingCount, &0u64);
    }

    /// Step 1: seller lists a ticket.
    ///
    /// The seller signs the call. Purchase evidence is uploaded off-chain; only
    /// its hash (`ticket_ref`) is stored. Enforces the fair-price rule
    /// (resale <= original) and rejects tickets that were already listed.
    /// Returns the new listing ID.
    pub fn create_listing(
        env: Env,
        seller: Address,
        ticket_ref: BytesN<32>,
        original_price: i128,
        resale_price: i128,
    ) -> Result<u64, Error> {
        seller.require_auth();

        if original_price <= 0 || resale_price <= 0 {
            return Err(Error::InvalidPrice);
        }
        if resale_price > original_price {
            return Err(Error::PriceAboveOriginal);
        }

        // Duplicate protection: one listing per ticket, ever. A rejected or
        // refunded ticket stays blocked so the same ticket cannot be recycled.
        let ref_key = DataKey::TicketRef(ticket_ref.clone());
        if env.storage().persistent().has(&ref_key) {
            return Err(Error::DuplicateTicket);
        }

        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::ListingCount)
            .unwrap_or(0)
            + 1;

        let listing = Listing {
            id,
            seller: seller.clone(),
            ticket_ref,
            original_price,
            resale_price,
            buyer: None,
            status: ListingStatus::PendingReview,
        };

        save_listing(&env, &listing);
        env.storage().persistent().set(&ref_key, &id);
        env.storage()
            .persistent()
            .extend_ttl(&ref_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage().instance().set(&DataKey::ListingCount, &id);
        bump_instance(&env);

        ListingCreated {
            listing_id: id,
            seller,
            resale_price,
        }
        .publish(&env);

        Ok(id)
    }

    /// Step 2: administrator approves or rejects a pending listing after
    /// checking the off-chain purchase evidence.
    pub fn review_listing(env: Env, listing_id: u64, approved: bool) -> Result<(), Error> {
        read_admin(&env).require_auth();

        let mut listing = load_listing(&env, listing_id)?;
        if listing.status != ListingStatus::PendingReview {
            return Err(Error::InvalidStatus);
        }

        listing.status = if approved {
            ListingStatus::Approved
        } else {
            ListingStatus::Rejected
        };
        save_listing(&env, &listing);

        ListingReviewed {
            listing_id,
            approved,
        }
        .publish(&env);

        Ok(())
    }

    /// Steps 3–5: buyer commits payment for an approved listing.
    ///
    /// Transfers `resale_price` USDC from the buyer into this contract and
    /// records the buyer. The funds stay in escrow until `confirm_transfer`.
    /// The buyer's wallet must hold a USDC trustline and enough balance.
    pub fn purchase(env: Env, buyer: Address, listing_id: u64) -> Result<(), Error> {
        buyer.require_auth();

        let mut listing = load_listing(&env, listing_id)?;
        if listing.status != ListingStatus::Approved {
            return Err(Error::InvalidStatus);
        }
        if buyer == listing.seller {
            return Err(Error::SellerCannotBuy);
        }

        // Update state before the external token call.
        listing.buyer = Some(buyer.clone());
        listing.status = ListingStatus::PaymentCommitted;
        save_listing(&env, &listing);

        token_client(&env).transfer(
            &buyer,
            &env.current_contract_address(),
            &listing.resale_price,
        );

        PaymentCommitted {
            listing_id,
            buyer,
            amount: listing.resale_price,
        }
        .publish(&env);

        Ok(())
    }

    /// Step 6: seller reports that the ticket transfer has been started
    /// through the ticket provider (or the simulated MVP workflow).
    pub fn start_transfer(env: Env, listing_id: u64) -> Result<(), Error> {
        let mut listing = load_listing(&env, listing_id)?;
        // Only the seller of this listing can sign this call.
        listing.seller.require_auth();

        if listing.status != ListingStatus::PaymentCommitted {
            return Err(Error::InvalidStatus);
        }

        listing.status = ListingStatus::TransferInitiated;
        save_listing(&env, &listing);

        TransferInitiated { listing_id }.publish(&env);

        Ok(())
    }

    /// Steps 7–8: administrator (or simulated provider) confirms the outcome.
    ///
    /// - `success = true`: requires the seller to have started the transfer;
    ///   releases the escrow to the seller.
    /// - `success = false`: allowed after payment or after transfer start
    ///   (covers a seller who never transfers); refunds the buyer.
    pub fn confirm_transfer(env: Env, listing_id: u64, success: bool) -> Result<(), Error> {
        read_admin(&env).require_auth();

        let mut listing = load_listing(&env, listing_id)?;
        let buyer = listing.buyer.clone().ok_or(Error::InvalidStatus)?;
        let amount = listing.resale_price;

        if success {
            if listing.status != ListingStatus::TransferInitiated {
                return Err(Error::InvalidStatus);
            }
            listing.status = ListingStatus::Settled;
            save_listing(&env, &listing);

            token_client(&env).transfer(
                &env.current_contract_address(),
                &listing.seller,
                &amount,
            );

            Settled {
                listing_id,
                seller: listing.seller.clone(),
                amount,
            }
            .publish(&env);
        } else {
            if listing.status != ListingStatus::PaymentCommitted
                && listing.status != ListingStatus::TransferInitiated
            {
                return Err(Error::InvalidStatus);
            }
            listing.status = ListingStatus::Refunded;
            save_listing(&env, &listing);

            token_client(&env).transfer(&env.current_contract_address(), &buyer, &amount);

            Refunded {
                listing_id,
                buyer,
                amount,
            }
            .publish(&env);
        }

        Ok(())
    }

    // ----------------------------- Read-only -----------------------------

    /// Returns a listing so the web app can show its status and parties.
    pub fn get_listing(env: Env, listing_id: u64) -> Result<Listing, Error> {
        load_listing(&env, listing_id)
    }

    /// Total number of listings created (also the highest listing ID).
    pub fn listing_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::ListingCount)
            .unwrap_or(0)
    }

    pub fn admin(env: Env) -> Address {
        read_admin(&env)
    }

    pub fn usdc_token(env: Env) -> Address {
        read_token(&env)
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn read_admin(env: &Env) -> Address {
    // Set in the constructor, so it always exists.
    env.storage().instance().get(&DataKey::Admin).unwrap()
}

fn read_token(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Token).unwrap()
}

fn token_client(env: &Env) -> token::Client<'_> {
    token::Client::new(env, &read_token(env))
}

fn load_listing(env: &Env, listing_id: u64) -> Result<Listing, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Listing(listing_id))
        .ok_or(Error::ListingNotFound)
}

fn save_listing(env: &Env, listing: &Listing) {
    let key = DataKey::Listing(listing.id);
    env.storage().persistent().set(&key, listing);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

#[cfg(test)]
mod test;
