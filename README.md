# CREDENCE

Protected peer-to-peer ticket resale for Filipino concertgoers, using USDC payments held by a Soroban smart contract until the ticket transfer is confirmed.

## Problem

Students and young professionals in Metro Manila who can no longer attend concerts or events often resell their tickets through Facebook groups. This exposes buyers to fake or duplicated tickets and overpriced listings, and exposes sellers to unpaid transactions and fraudulent buyers.

## Solution

CREDENCE lets ticket sellers list eligible tickets and lets buyers purchase them through a protected transaction workflow. Buyers pay in USDC on Stellar. A Soroban smart contract records the listing, holds the payment, records the transfer confirmation, and then releases the payment to the seller or refunds the buyer.

### MVP transaction

| Item | Value |
|---|---|
| Original ticket price | ₱2,500 |
| Maximum resale price | ₱2,500 (resale can never exceed the original price) |
| Buyer's USDC payment | $44.64 |
| Seller payout | $44.64 |

1. **Seller creates a listing** with the event name, date, venue, ticket category, original price, resale price, and purchase evidence.
2. **Administrator reviews** the evidence and approves or rejects the listing.
3. **Buyer selects** an approved ticket.
4. **Buyer commits payment.** The USDC moves into the contract and stays there.
5. **The contract records** the listing ID, buyer, seller, payment, and status.
6. **Seller starts the ticket transfer** through the ticket provider (simulated for the MVP).
7. **Administrator confirms** whether the transfer succeeded or failed.
8. **The contract settles.** On success the seller is paid. On failure the buyer is refunded.

## Vision and Purpose

Filipino concertgoers who buy resold tickets through informal Facebook groups and direct bank or e-wallet transfers have no protection if the other side cheats. Buyers lose money to fake sellers, and honest sellers deal with buyers who never pay.

CREDENCE aims to make secondary ticket sales safe and fair:

- **Safe:** the buyer's money is held by the contract, not by the seller or by CREDENCE, until the transfer is confirmed.
- **Fair:** the contract rejects any resale price above the original ticket price, so scalping is blocked by code.
- **Transparent:** every listing, payment, payout, and refund is a public Stellar transaction. Independent event organizers can see resale activity for their events.

Its differentiator is the combination of fair resale pricing and protected peer-to-peer payment, rather than another ticket marketplace.

**Privacy:** personal information, ticket files, QR codes, and purchase receipts stay off-chain. The contract stores only a SHA-256 hash of the ticket record (`ticket_ref`), the prices, the Stellar addresses, and the transaction status.

## Stellar Features Used

| Feature | How CREDENCE uses it |
|---|---|
| **USDC transfers** | Buyers pay for tickets in USDC. Sellers receive USDC after a confirmed transfer. Buyers are refunded in USDC if the transfer fails. |
| **Soroban smart contracts** | Record listings, payment commitments, transfer confirmations, payouts, and refunds. Enforce the price cap and block duplicate listings. |
| **Trustlines** | Seller and buyer accounts hold a USDC trustline so they can send and receive the asset. |

Not used in the MVP: custom tokens (USDC is enough), the built-in DEX (currency swaps are outside the resale flow), and clawback/compliance (production custody and regulation need separate work).

## Timeline

| Phase | Work | Status |
|---|---|---|
| 1. Smart contract | Soroban contract, 5 unit tests, Wasm build | Done |
| 2. Testnet deployment | Deploy script, test USDC, full payout and refund flows on testnet | Done |
| 3. Web app | Seller, administrator, and buyer screens with Freighter wallet connection | Done |
| 4. Off-chain backend | Shared database and file storage for ticket details and evidence (the web app currently keeps them in the browser) | Next |
| 5. AI-assisted OCR | Extract event details from uploaded receipts and flag missing or inconsistent fields | Planned (bonus) |
| 6. Demo and pitch | End-to-end demo on testnet | Planned |

## Smart Contract

### Project structure

```
CREDENCE/
├── README.md
├── contracts/
│   ├── Cargo.toml
│   ├── src/
│   │   ├── lib.rs                 # the CREDENCE contract
│   │   └── test.rs                # 5 unit tests
│   ├── scripts/
│   │   ├── deploy-testnet.ps1     # deploy and run the MVP flow on testnet
│   │   └── mint-test-usdc.ps1     # send test USDC to a wallet
│   └── deployments/
│       └── testnet.json           # deployed contract IDs and addresses
└── frontend/                      # React web app (see "Web App" below)
    ├── src/
    │   ├── contracts/credence/    # generated typed contract client
    │   ├── lib/                   # wallet, contract, Horizon, off-chain storage
    │   ├── components/
    │   └── pages/                 # Tickets, Listing, Sell, My activity, Admin
    └── scripts/                   # client generator and testnet smoke tests
```

### Functions

| Function | Caller | What it does |
|---|---|---|
| `__constructor(admin, usdc_token)` | Deployer | Sets the administrator and the USDC token contract. Runs once at deployment. |
| `create_listing(seller, ticket_ref, original_price, resale_price)` | Seller | Creates a listing in `PendingReview`. Rejects a resale price above the original price and rejects a ticket that was already listed. Returns the listing ID. |
| `review_listing(listing_id, approved)` | Administrator | Moves the listing to `Approved` or `Rejected`. |
| `purchase(buyer, listing_id)` | Buyer | Transfers `resale_price` USDC from the buyer into the contract. Moves the listing to `PaymentCommitted`. |
| `start_transfer(listing_id)` | Seller of that listing | Moves the listing to `TransferInitiated`. |
| `confirm_transfer(listing_id, success)` | Administrator | `true`: pays the seller, status `Settled`. `false`: refunds the buyer, status `Refunded`. |
| `get_listing(listing_id)` | Anyone | Returns the listing record. |
| `listing_count()` | Anyone | Returns the number of listings created. |
| `admin()`, `usdc_token()` | Anyone | Return the configured administrator and USDC token. |

Prices are in USDC base units (7 decimals), so `446400000` = 44.64 USDC.

### Listing status

```
PendingReview ──> Approved ──> PaymentCommitted ──> TransferInitiated ──> Settled
      │                              │                     │
      └──> Rejected                  └─────────────────────┴──> Refunded
```

### Errors

| Code | Error | Meaning |
|---|---|---|
| 1 | `ListingNotFound` | No listing with that ID |
| 2 | `InvalidPrice` | A price is zero or negative |
| 3 | `PriceAboveOriginal` | Resale price is above the original price |
| 4 | `DuplicateTicket` | This ticket has already been listed |
| 5 | `InvalidStatus` | The action is not allowed in the listing's current status |
| 6 | `SellerCannotBuy` | The seller tried to buy their own listing |

Each step also emits an event (`listing_created`, `listing_reviewed`, `payment_committed`, `transfer_initiated`, `settled`, `refunded`) that the web app can use to show transaction status.

## Prerequisites

Tested with these versions:

| Tool | Version | Install |
|---|---|---|
| Rust | 1.100.0 | https://rustup.rs |
| Wasm target | `wasm32v1-none` | `rustup target add wasm32v1-none` |
| Stellar CLI | 30.0.1 | `cargo install --locked stellar-cli` |
| soroban-sdk | 29.0.1 | Pulled in by `Cargo.toml` |

The Stellar CLI was formerly called the Soroban CLI. The `soroban` command was renamed to `stellar`, so `soroban contract build` is now `stellar contract build`.

All commands below run from the `contracts` folder.

## Build

```
stellar contract build
```

Output: `target/wasm32v1-none/release/credence.wasm` (about 11.5 KB).

## Test

```
cargo test
```

Runs 5 tests:

1. **Happy path:** list, approve, buy, transfer, confirm. The seller receives exactly 44.64 USDC.
2. **Edge case:** listing the same ticket twice is rejected with `DuplicateTicket`.
3. **State verification:** after payment, storage shows the buyer, `PaymentCommitted`, and the contract holding the USDC.
4. **Refund path:** a failed transfer returns the full payment to the buyer.
5. **Fair-price rule:** a resale price above the original is rejected, and an unapproved listing cannot be bought.

## Deploy to Testnet

### Option A: one script (Windows PowerShell)

```
powershell -ExecutionPolicy Bypass -File scripts\deploy-testnet.ps1
```

The script creates and funds testnet accounts, issues a test USDC token, deploys CREDENCE, runs both the payout flow and the refund flow, and checks balances and statuses at every step. It saves the IDs to `deployments/testnet.json` and logs every transaction to `deployments/testnet-run.log`. The previous deployment file and log are kept as `*.previous.*`.

To make your own wallet (for example a Freighter account) the administrator, pass its address:

```
powershell -ExecutionPolicy Bypass -File scripts\deploy-testnet.ps1 -Admin <YOUR_WALLET_ADDRESS>
```

The script can't sign for an external wallet, so it deploys and skips the demo flows. Run the flow in the web app instead. After any redeploy, update `CREDENCE_CONTRACT_ID` in `frontend/src/config.ts` (or set `VITE_CREDENCE_CONTRACT_ID` in `frontend/.env.local`).

### Option B: manual commands

1. Create and fund an administrator account:

   ```
   stellar keys generate admin --network testnet --fund
   ```

2. Get the USDC token contract address. For your own test asset, wrap it in a Stellar Asset Contract:

   ```
   stellar contract asset deploy --asset USDC:<ISSUER_ADDRESS> --source-account admin --network testnet
   ```

3. Deploy CREDENCE. The values after `--` are passed to the constructor:

   ```
   stellar contract deploy \
     --wasm target/wasm32v1-none/release/credence.wasm \
     --source-account admin \
     --network testnet \
     --alias credence \
     -- \
     --admin <ADMIN_ADDRESS> \
     --usdc_token <USDC_CONTRACT_ID>
   ```

   In PowerShell, replace the trailing `\` with a backtick (`` ` ``) or put the command on one line.

### Current testnet deployment

| Item | Value |
|---|---|
| CREDENCE contract | `CCGP3BS7EB37RRVJLL4HLZ6KEZX2TEM3U6SNWLNKDIFPDHSYKCP2R5YI` |
| Administrator | `GCOQKGO767TJCUGXT3CUCP6BDIHPTFZVP6DESKVG3KQ75MO5DGE5UFAO` |
| Test USDC contract | `CARMCC5OAHU7HX6BDWWAYIZ7R6O7VBDRIWIPHJ7ALP2U6WNS745IOQ32` |
| Wasm hash | `b7380eacbeb98b36b36a221301d10abf4d202e15b00f9a36a717940727ddbf8a` |
| Explorer | https://stellar.expert/explorer/testnet/contract/CCGP3BS7EB37RRVJLL4HLZ6KEZX2TEM3U6SNWLNKDIFPDHSYKCP2R5YI |

The USDC here is a test asset issued for this demo, not Circle's USDC. Stellar resets testnet periodically; if the contract disappears, re-run the deploy script.

## Sample CLI Invocation

Seller lists a ₱2,500 ticket for 44.64 USDC (dummy arguments):

```
stellar contract invoke \
  --id CCGP3BS7EB37RRVJLL4HLZ6KEZX2TEM3U6SNWLNKDIFPDHSYKCP2R5YI \
  --source-account seller \
  --network testnet \
  -- \
  create_listing \
  --seller GCJH3Z6MF5FU2L7DL7K7EUYX5AW3ECZENXDGTEJG67QPDWGFQUVHJJGM \
  --ticket_ref 1111111111111111111111111111111111111111111111111111111111111111 \
  --original_price 446400000 \
  --resale_price 446400000
```

Returns the new listing ID. The rest of the flow:

```
# Administrator approves listing 1
stellar contract invoke --id <CONTRACT_ID> --source-account admin --network testnet -- review_listing --listing_id 1 --approved true

# Buyer pays into the contract
stellar contract invoke --id <CONTRACT_ID> --source-account buyer --network testnet -- purchase --buyer <BUYER_ADDRESS> --listing_id 1

# Seller starts the ticket transfer
stellar contract invoke --id <CONTRACT_ID> --source-account seller --network testnet -- start_transfer --listing_id 1

# Administrator confirms: true pays the seller, false refunds the buyer
stellar contract invoke --id <CONTRACT_ID> --source-account admin --network testnet -- confirm_transfer --listing_id 1 --success true

# Read the listing
stellar contract invoke --id <CONTRACT_ID> --source-account admin --network testnet -- get_listing --listing_id 1
```

`--source-account seller` must be a Stellar CLI identity that signs as the `--seller` address. In real use, `ticket_ref` is the SHA-256 hash of the off-chain ticket record, and each ticket can be listed only once.

## Web App

A React + TypeScript app (Vite) in `frontend/` that runs the full MVP flow in the browser against the testnet contract, with Freighter for signing.

| Page | Who | What it does |
|---|---|---|
| **Tickets** (`/`) | Buyers | Lists approved tickets read directly from the contract. |
| **Listing** (`/listing/:id`) | Everyone | Ticket details, on-chain record, and progress. Shows the next action for the connected wallet: buy, start the transfer, or (for the administrator) approve, reject, confirm, or refund. |
| **Sell** (`/sell`) | Sellers | Listing form with event details, prices in pesos, and an evidence upload. Blocks resale prices above the original. |
| **My activity** (`/activity`) | Sellers and buyers | Tickets you're selling and buying, plus wallet setup. |
| **Admin** (`/admin`) | Administrator | Review and confirmation queues. Only shown to the contract's admin wallet. |

The app also handles testnet wallet setup: funding a new wallet with Friendbot and adding the USDC trustline through Freighter.

### Run it

Requires Node.js 20 or later and the [Freighter](https://www.freighter.app) browser extension set to **Testnet**.

```
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. On Windows PowerShell, if `npm` is blocked by the script execution policy, use `npm.cmd` instead.

Other commands:

| Command | What it does |
|---|---|
| `npm run build` | Type-checks and builds to `frontend/dist` |
| `npm run generate:contract` | Regenerates `src/contracts/credence` from the contract ID in `contracts/deployments/testnet.json`. Run it after redeploying the contract. |
| `node scripts/smoke-read.mjs` | Reads every listing from testnet the same way the app does |
| `node scripts/smoke-write.mjs` | Creates one listing with a throwaway account and checks the duplicate and price-cap errors |

### Demo walkthrough

The administrator is your own Freighter wallet `GCOQKGO7…UFAO`. The deploy script created ready-to-use seller and buyer accounts. Import them into Freighter (Add account → Import with secret key). Print a secret key with:

```
stellar keys secret credence-seller
```

Do the same for `credence-buyer`. These are testnet-only keys; never use them on mainnet. (`credence-admin` now only deploys contracts and pays their fees. It is not the administrator of the current contract.)

1. **Seller** account → **Sell**: fill in the ticket, upload a receipt screenshot, submit, and approve in Freighter.
2. **Admin** account → **Admin** → open the listing → check the evidence → **Approve**.
3. **Buyer** account → **Tickets** → open the ticket → **Buy**. The USDC moves into the contract.
4. **Seller** account → open the listing → **I've started the ticket transfer**.
5. **Admin** account → open the listing → **Succeeded · pay seller** (or **Failed · refund buyer**).

Every step links to the transaction on Stellar Expert. To give a new Freighter wallet test USDC, add the trustline in the app, then run from `contracts/`:

```
powershell -ExecutionPolicy Bypass -File scripts\mint-test-usdc.ps1 -To <WALLET_ADDRESS>
```

**MVP limitation:** ticket details and evidence are stored in the browser (IndexedDB), not on a server. Switching Freighter accounts in the same browser works for the demo, but a different browser or device only sees the on-chain data. Step 4 of the timeline (off-chain backend) replaces this.

## License

This project is licensed under the MIT License.

```
MIT License

Copyright (c) 2026 CREDENCE

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
