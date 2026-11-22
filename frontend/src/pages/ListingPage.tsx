import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router";
import { AccountChecklist, accountReady } from "../components/AccountChecklist";
import { Icon } from "../components/Icon";
import { ReviewPanel } from "../components/ReviewPanel";
import { StatusTimeline } from "../components/StatusTimeline";
import { EmptyState, ExternalLink, Spinner, StatusBadge, TxFeedback } from "../components/ui";
import { GOIN_CONTRACT_ID } from "../config";
import { goin, submit, type Listing, type TxOutcome } from "../lib/contract";
import { accountUrl, contractUrl, formatEventDate, shortAddress } from "../lib/format";
import { useAccountStatus, useAction, useAdmin, useListing } from "../lib/hooks";
import { formatPhp, formatUsdc } from "../lib/money";
import { useWallet } from "../lib/wallet";

function parseId(raw: string | undefined): bigint | null {
  return raw && /^\d+$/.test(raw) ? BigInt(raw) : null;
}

export function ListingPage() {
  const id = parseId(useParams().id);
  const { view, loading, error, detailsError, reload } = useListing(id);

  if (loading) return <Spinner label="Loading listing from Stellar…" />;
  if (error) return <p className="notice notice-bad">{error}</p>;
  if (!view)
    return (
      <EmptyState title="Listing not found">
        <Link to="/">Back to tickets</Link>
      </EmptyState>
    );

  const { listing, details } = view;

  return (
    <div className="detail">
      <section className="detail-main">
        <Link to="/" className="back">
          <Icon icon={ArrowLeft} size={16} /> All tickets
        </Link>
        <div className="detail-title">
          <h1>{details?.eventName ?? `Ticket listing #${listing.id}`}</h1>
          <StatusBadge status={listing.status.tag} />
        </div>

        {details ? (
          <dl className="facts">
            <div>
              <dt>Date</dt>
              <dd>{formatEventDate(details.eventDate)}</dd>
            </div>
            <div>
              <dt>Venue</dt>
              <dd>{details.venue}</dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{details.category}</dd>
            </div>
            {details.seat && (
              <div>
                <dt>Seat</dt>
                <dd>{details.seat}</dd>
              </div>
            )}
            <div>
              <dt>Original price</dt>
              <dd>{formatPhp(details.originalPricePhp)}</dd>
            </div>
            <div>
              <dt>Resale price</dt>
              <dd>
                {formatPhp(details.resalePricePhp)}
                {details.resalePricePhp <= details.originalPricePhp && <span className="pill pill-good">Fair price</span>}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="notice notice-info">
            {detailsError ?? "This listing has no ticket details on the GOIN server."} The on-chain record below is
            still authoritative.
          </p>
        )}

        <h2>On-chain record</h2>
        <dl className="facts facts-chain">
          <div>
            <dt>Listing ID</dt>
            <dd>#{listing.id.toString()}</dd>
          </div>
          <div>
            <dt>Price</dt>
            <dd>{formatUsdc(listing.resale_price)}</dd>
          </div>
          <div>
            <dt>Original price</dt>
            <dd>{formatUsdc(listing.original_price)}</dd>
          </div>
          <div>
            <dt>Seller</dt>
            <dd>
              <ExternalLink href={accountUrl(listing.seller)}>{shortAddress(listing.seller)}</ExternalLink>
            </dd>
          </div>
          <div>
            <dt>Buyer</dt>
            <dd>
              {listing.buyer ? (
                <ExternalLink href={accountUrl(listing.buyer)}>{shortAddress(listing.buyer)}</ExternalLink>
              ) : (
                "None yet"
              )}
            </dd>
          </div>
          <div>
            <dt>Contract</dt>
            <dd>
              <ExternalLink href={contractUrl(GOIN_CONTRACT_ID)}>{shortAddress(GOIN_CONTRACT_ID)}</ExternalLink>
            </dd>
          </div>
        </dl>
      </section>

      <aside className="detail-side">
        <div className="card">
          <h3>Progress</h3>
          <StatusTimeline status={listing.status.tag} />
        </div>
        <ActionPanel listing={listing} onDone={() => void reload()} />
        <AdminPanel listing={listing} onDone={() => void reload()} />
      </aside>
    </div>
  );
}

/** What the connected buyer or seller can do next. */
function ActionPanel({ listing, onDone }: { listing: Listing; onDone: () => void }) {
  const wallet = useWallet();
  const account = useAccountStatus(wallet.address);
  const action = useAction();
  const me = wallet.address;
  const status = listing.status.tag;
  const isSeller = me === listing.seller;
  const isBuyer = !!me && me === listing.buyer;

  const run = async (fn: () => Promise<TxOutcome<null>>) => {
    const outcome = await action.run(fn);
    if (outcome) {
      onDone();
      void account.reload();
    }
  };

  let body = null;

  if (status === "Approved" && !isSeller) {
    const ready = accountReady(account.status, listing.resale_price);
    body = !me ? (
      <>
        <p>Connect Freighter to buy this ticket for {formatUsdc(listing.resale_price)}.</p>
        <button className="btn btn-primary" onClick={() => void wallet.connect()}>
          Connect Freighter
        </button>
      </>
    ) : (
      <>
        <p>
          Pay <strong>{formatUsdc(listing.resale_price)}</strong>. The USDC is held by the GOIN contract and only
          released to the seller after the ticket transfer is confirmed. If it fails, you get a full refund.
        </p>
        <AccountChecklist
          address={me}
          status={account.status}
          onChanged={() => void account.reload()}
          requiredUsdc={listing.resale_price}
          purpose="pay"
        />
        <button
          className="btn btn-primary btn-large"
          disabled={!ready || action.busy || !wallet.onTestnet}
          onClick={() => void run(() => submit(goin(me).purchase({ buyer: me, listing_id: listing.id })))}
        >
          {action.busy ? "Waiting for Freighter…" : `Buy for ${formatUsdc(listing.resale_price)}`}
        </button>
      </>
    );
  } else if (status === "Approved" && isSeller) {
    body = <p>Your ticket is live. You'll be notified here when a buyer pays.</p>;
  } else if (status === "PendingReview" && isSeller && me) {
    body = (
      <>
        <p>Your listing is waiting for an administrator to review your purchase evidence. This is what they'll see:</p>
        <ReviewPanel address={me} listingId={listing.id} />
      </>
    );
  } else if (status === "PaymentCommitted" && isSeller) {
    body = (
      <>
        <p>
          A buyer paid {formatUsdc(listing.resale_price)}. It's held by the contract. Transfer the ticket to the buyer
          through the ticket provider, then confirm here.
        </p>
        <p className="muted small">MVP: the ticket provider transfer is simulated.</p>
        <button
          className="btn btn-primary"
          disabled={action.busy || !wallet.onTestnet}
          onClick={() => void run(() => submit(goin(listing.seller).start_transfer({ listing_id: listing.id })))}
        >
          {action.busy ? "Waiting for Freighter…" : "I've started the ticket transfer"}
        </button>
      </>
    );
  } else if (status === "PaymentCommitted" && isBuyer) {
    body = <p>Your payment is held by the contract. Waiting for the seller to start the ticket transfer.</p>;
  } else if (status === "TransferInitiated" && (isSeller || isBuyer)) {
    body = <p>The seller started the transfer. An administrator will confirm whether it succeeded.</p>;
  } else if (status === "Settled") {
    body = <p>Completed. The seller received {formatUsdc(listing.resale_price)}.</p>;
  } else if (status === "Refunded") {
    body = <p>The transfer failed. The buyer was refunded {formatUsdc(listing.resale_price)}.</p>;
  } else if (status === "Rejected") {
    body = <p>An administrator rejected this listing's purchase evidence.</p>;
  } else if (status === "PaymentCommitted" || status === "TransferInitiated") {
    body = <p>This ticket has been sold.</p>;
  }

  if (!body) return null;
  return (
    <div className="card card-feature">
      <h3>{isSeller ? "Your listing" : isBuyer ? "Your purchase" : "Buy this ticket"}</h3>
      {body}
      <TxFeedback error={action.error} hash={action.hash} />
    </div>
  );
}

/** Administrator review and transfer confirmation for this listing. */
function AdminPanel({ listing, onDone }: { listing: Listing; onDone: () => void }) {
  const wallet = useWallet();
  const admin = useAdmin();
  const action = useAction();
  if (!admin || wallet.address !== admin) return null;

  const status = listing.status.tag;
  const run = async (fn: () => Promise<TxOutcome<null>>) => {
    if (await action.run(fn)) onDone();
  };
  const client = goin(admin);
  const id = listing.id;

  let body = null;
  if (status === "PendingReview") {
    body = (
      <>
        <p>Check the purchase evidence matches the event, category, and original price.</p>
        <ReviewPanel address={admin} listingId={id} />
        <div className="actions">
          <button className="btn btn-primary" disabled={action.busy} onClick={() => void run(() => submit(client.review_listing({ listing_id: id, approved: true })))}>
            Approve
          </button>
          <button className="btn btn-danger" disabled={action.busy} onClick={() => void run(() => submit(client.review_listing({ listing_id: id, approved: false })))}>
            Reject
          </button>
        </div>
      </>
    );
  } else if (status === "TransferInitiated") {
    body = (
      <>
        <p>Did the ticket provider confirm the transfer to the buyer?</p>
        <div className="actions">
          <button className="btn btn-primary" disabled={action.busy} onClick={() => void run(() => submit(client.confirm_transfer({ listing_id: id, success: true })))}>
            Succeeded · pay seller
          </button>
          <button className="btn btn-danger" disabled={action.busy} onClick={() => void run(() => submit(client.confirm_transfer({ listing_id: id, success: false })))}>
            Failed · refund buyer
          </button>
        </div>
      </>
    );
  } else if (status === "PaymentCommitted") {
    body = (
      <>
        <p>The seller hasn't started the transfer yet. If they won't, you can refund the buyer.</p>
        <button className="btn btn-danger" disabled={action.busy} onClick={() => void run(() => submit(client.confirm_transfer({ listing_id: id, success: false })))}>
          Refund buyer
        </button>
      </>
    );
  }

  if (!body) return null;
  return (
    <div className="card card-admin">
      <h3>Administrator</h3>
      {body}
      <TxFeedback error={action.error} hash={action.hash} />
    </div>
  );
}
