import { Link } from "react-router";
import type { ListingView } from "../lib/hooks";
import { formatEventDate, shortAddress } from "../lib/format";
import { formatPhp, formatUsdc } from "../lib/money";
import { StatusBadge } from "./ui";

export function ListingCard({ view }: { view: ListingView }) {
  const { listing, details } = view;
  return (
    <Link to={`/listing/${listing.id}`} className="card listing-card">
      <div className="listing-card-top">
        <span className="pill">{details?.category ?? `Listing #${listing.id}`}</span>
        <StatusBadge status={listing.status.tag} />
      </div>
      <h3>{details?.eventName ?? `Ticket listing #${listing.id}`}</h3>
      {details ? (
        <p className="muted">
          {formatEventDate(details.eventDate)} · {details.venue}
        </p>
      ) : (
        <p className="muted">Ticket details aren't available right now.</p>
      )}
      <div className="listing-card-price">
        <strong>{formatUsdc(listing.resale_price)}</strong>
        {details && <span className="muted">{formatPhp(details.resalePricePhp)}</span>}
      </div>
      <p className="muted small">Seller {shortAddress(listing.seller)}</p>
      {details?.issueCount !== undefined && listing.status.tag === "PendingReview" && (
        <p className={`small ${details.issueCount ? "issue-flag" : "issue-clear"}`}>
          {details.issueCount
            ? `⚠ ${details.issueCount} receipt check${details.issueCount === 1 ? "" : "s"} to review`
            : "✓ Receipt matches the listing"}
        </p>
      )}
    </Link>
  );
}
