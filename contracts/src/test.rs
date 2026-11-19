#[cfg(test)]
mod tests {
    use crate::{Credence, CredenceClient, Error, ListingStatus};
    use soroban_sdk::{
        testutils::Address as _,
        token::{StellarAssetClient, TokenClient},
        Address, BytesN, Env,
    };

    /// USDC on Stellar uses 7 decimals.
    /// MVP example: P2,500 ticket ≈ $44.64 USDC.
    const TICKET_PRICE: i128 = 446_400_000; // 44.64 USDC
    const BUYER_START_BALANCE: i128 = 1_000_000_000; // 100.00 USDC

    struct Setup {
        env: Env,
        client: CredenceClient<'static>,
        usdc: TokenClient<'static>,
        admin: Address,
        seller: Address,
        buyer: Address,
    }

    /// Creates the environment, a mock USDC asset, funds the buyer, and deploys
    /// CREDENCE with an administrator.
    fn setup() -> Setup {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);

        // Mock USDC as a Stellar Asset Contract.
        let usdc_issuer = Address::generate(&env);
        let usdc_sac = env.register_stellar_asset_contract_v2(usdc_issuer);
        let usdc_address = usdc_sac.address();
        StellarAssetClient::new(&env, &usdc_address).mint(&buyer, &BUYER_START_BALANCE);
        let usdc = TokenClient::new(&env, &usdc_address);

        let contract_id = env.register(Credence, (&admin, &usdc_address));
        let client = CredenceClient::new(&env, &contract_id);

        Setup {
            env,
            client,
            usdc,
            admin,
            seller,
            buyer,
        }
    }

    fn ticket_ref(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32])
    }

    /// Lists a ticket and has the administrator approve it.
    fn approved_listing(s: &Setup) -> u64 {
        let id = s.client.create_listing(
            &s.seller,
            &ticket_ref(&s.env, 1),
            &TICKET_PRICE,
            &TICKET_PRICE,
        );
        s.client.review_listing(&id, &true);
        id
    }

    /// Test 1 (Happy path): list -> approve -> buy -> transfer -> confirm.
    /// Seller receives exactly the buyer's payment.
    #[test]
    fn test_happy_path_end_to_end() {
        let s = setup();
        let id = approved_listing(&s);

        s.client.purchase(&s.buyer, &id);
        s.client.start_transfer(&id);
        s.client.confirm_transfer(&id, &true);

        assert_eq!(s.usdc.balance(&s.seller), TICKET_PRICE);
        assert_eq!(s.usdc.balance(&s.buyer), BUYER_START_BALANCE - TICKET_PRICE);
        assert_eq!(s.usdc.balance(&s.client.address), 0);
        assert_eq!(s.client.get_listing(&id).status, ListingStatus::Settled);
    }

    /// Test 2 (Edge case): the same ticket cannot be listed twice.
    #[test]
    fn test_duplicate_ticket_rejected() {
        let s = setup();
        let r = ticket_ref(&s.env, 7);

        s.client
            .create_listing(&s.seller, &r, &TICKET_PRICE, &TICKET_PRICE);

        let other_seller = Address::generate(&s.env);
        let result = s
            .client
            .try_create_listing(&other_seller, &r, &TICKET_PRICE, &TICKET_PRICE);

        assert_eq!(result, Err(Ok(Error::DuplicateTicket)));
        assert_eq!(s.client.listing_count(), 1);
    }

    /// Test 3 (State verification): after payment, storage records the buyer,
    /// the committed status, and the contract holds the escrow.
    #[test]
    fn test_state_after_payment_commitment() {
        let s = setup();
        let id = approved_listing(&s);

        s.client.purchase(&s.buyer, &id);

        let listing = s.client.get_listing(&id);
        assert_eq!(listing.id, id);
        assert_eq!(listing.seller, s.seller);
        assert_eq!(listing.buyer, Some(s.buyer.clone()));
        assert_eq!(listing.original_price, TICKET_PRICE);
        assert_eq!(listing.resale_price, TICKET_PRICE);
        assert_eq!(listing.ticket_ref, ticket_ref(&s.env, 1));
        assert_eq!(listing.status, ListingStatus::PaymentCommitted);

        assert_eq!(s.usdc.balance(&s.client.address), TICKET_PRICE);
        assert_eq!(s.usdc.balance(&s.seller), 0);
        assert_eq!(s.client.admin(), s.admin);
        assert_eq!(s.client.usdc_token(), s.usdc.address);
    }

    /// Test 4 (Refund path): a failed ticket transfer returns the full
    /// payment to the buyer and pays nothing to the seller.
    #[test]
    fn test_failed_transfer_refunds_buyer() {
        let s = setup();
        let id = approved_listing(&s);

        s.client.purchase(&s.buyer, &id);
        s.client.start_transfer(&id);
        s.client.confirm_transfer(&id, &false);

        assert_eq!(s.usdc.balance(&s.buyer), BUYER_START_BALANCE);
        assert_eq!(s.usdc.balance(&s.seller), 0);
        assert_eq!(s.usdc.balance(&s.client.address), 0);
        assert_eq!(s.client.get_listing(&id).status, ListingStatus::Refunded);
    }

    /// Test 5 (Fair-price rule): a resale price above the original price is
    /// rejected, and an unapproved listing cannot be bought.
    #[test]
    fn test_price_cap_and_review_required() {
        let s = setup();

        let over_cap = s.client.try_create_listing(
            &s.seller,
            &ticket_ref(&s.env, 2),
            &TICKET_PRICE,
            &(TICKET_PRICE + 1),
        );
        assert_eq!(over_cap, Err(Ok(Error::PriceAboveOriginal)));

        let id = s.client.create_listing(
            &s.seller,
            &ticket_ref(&s.env, 3),
            &TICKET_PRICE,
            &TICKET_PRICE,
        );
        let early_buy = s.client.try_purchase(&s.buyer, &id);
        assert_eq!(early_buy, Err(Ok(Error::InvalidStatus)));
        assert_eq!(s.usdc.balance(&s.buyer), BUYER_START_BALANCE);
    }
}
