import { Link } from "react-router";
import { ListingCard } from "../components/ListingCard";
import { EmptyState, ExternalLink, Spinner } from "../components/ui";
import { CREDENCE_CONTRACT_ID } from "../config";
import { contractUrl } from "../lib/format";
import { useListings } from "../lib/hooks";

const STEPS = [
  { title: "Seller lists", text: "Upload proof of purchase. Resale price can't exceed the original price." },
  { title: "Admin verifies", text: "CREDENCE checks the evidence before the ticket goes live." },
  { title: "Buyer pays USDC", text: "Payment is held by a Soroban smart contract, not by the seller." },
  { title: "Transfer confirmed", text: "Seller is paid after the transfer succeeds. If it fails, the buyer is refunded." },
];

export function BrowsePage() {
  const { listings, loading, error, reload } = useListings();
  const available = listings.filter((v) => v.listing.status.tag === "Approved");

  return (
    <>
      <section className="hero">
        <h1>Resell concert tickets without the Facebook-group risk.</h1>
        <p className="lead">
          Verified tickets at fair prices, paid in USDC on Stellar. The buyer's money stays locked in a smart contract
          until the ticket transfer is confirmed.
        </p>
        <div className="hero-actions">
          <a className="btn btn-primary" href="#tickets">
            Browse tickets
          </a>
          <Link className="btn btn-ghost" to="/sell">
            Sell a ticket
          </Link>
        </div>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="step">
              <span className="step-number">{i + 1}</span>
              <div>
                <strong>{s.title}</strong>
                <p className="muted small">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section id="tickets">
        <div className="section-head">
          <h2>Available tickets</h2>
          <button className="btn btn-ghost btn-small" onClick={() => void reload()} disabled={loading}>
            Refresh
          </button>
        </div>
        {error && <p className="notice notice-bad">{error}</p>}
        {loading ? (
          <Spinner label="Loading tickets from Stellar…" />
        ) : available.length === 0 ? (
          <EmptyState title="No tickets available right now">
            <p className="muted">
              Have a ticket you can't use? <Link to="/sell">List it on CREDENCE</Link>.
            </p>
          </EmptyState>
        ) : (
          <div className="grid">
            {available.map((v) => (
              <ListingCard key={v.listing.id.toString()} view={v} />
            ))}
          </div>
        )}
        <p className="muted small footnote">
          Listings are read directly from the CREDENCE contract{" "}
          <ExternalLink href={contractUrl(CREDENCE_CONTRACT_ID)}>on Stellar testnet</ExternalLink>.
        </p>
      </section>
    </>
  );
}
