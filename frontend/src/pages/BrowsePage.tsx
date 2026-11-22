import { ArrowRight, RefreshCw } from "lucide-react";
import { Link } from "react-router";
import { DotWave, HeroVisual } from "../components/HeroVisual";
import { Icon } from "../components/Icon";
import { ListingCard } from "../components/ListingCard";
import { EmptyState, ExternalLink, Spinner } from "../components/ui";
import { GOIN_CONTRACT_ID } from "../config";
import { contractUrl } from "../lib/format";
import { useListings } from "../lib/hooks";
import { useHeroMotion } from "../lib/motion";

const STEPS = [
  { title: "Seller lists", text: "Upload the receipt and GOIN reads the details. Resale price can't exceed the original." },
  { title: "Admin verifies", text: "GOIN checks the evidence before the ticket goes live." },
  { title: "Buyer pays USDC", text: "Payment is held by a Soroban smart contract, not by the seller." },
  { title: "Transfer confirmed", text: "Seller is paid after the transfer succeeds. If it fails, the buyer is refunded." },
];

export function BrowsePage() {
  const { listings, loading, error, detailsError, reload } = useListings();
  const available = listings.filter((v) => v.listing.status.tag === "Approved");
  const heroRef = useHeroMotion<HTMLElement>();

  return (
    <>
      <section className="hero" ref={heroRef} aria-labelledby="hero-title">
        <div className="hero-backdrop" aria-hidden="true">
          <div className="hero-glow" />
          <div className="hero-planet-edge" />
          <DotWave className="hero-dots" />
          <div className="hero-grain" />
        </div>
        <div className="container hero-inner">
          <div className="hero-copy">
            <h1 id="hero-title">
              Resell concert tickets <span className="text-gradient">without the Facebook-group risk.</span>
            </h1>
            <p className="lead">
              Verified tickets at fair prices, paid in USDC on Stellar. The buyer's money stays locked in a smart
              contract until the ticket transfer is confirmed.
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary btn-hero" href="#tickets">
                Browse tickets <Icon icon={ArrowRight} />
              </a>
              <Link className="btn btn-ghost btn-hero" to="/sell">
                Sell a ticket
              </Link>
            </div>
          </div>
          <HeroVisual />
        </div>
      </section>

      <div className="container">
        <ol className="steps" aria-label="How GOIN works">
          {STEPS.map((s, i) => (
            <li key={s.title} className="step" data-reveal>
              <span className="step-number">{i + 1}</span>
              <div>
                <strong>{s.title}</strong>
                <p className="muted small">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <section id="tickets">
          <div className="section-head">
            <h2>Available tickets</h2>
            <button className="btn btn-ghost btn-small" onClick={() => void reload()} disabled={loading}>
              <Icon icon={RefreshCw} size={16} />
              Refresh
            </button>
          </div>
          {error && <p className="notice notice-bad">{error}</p>}
          {detailsError && <p className="notice notice-info">{detailsError}</p>}
          {loading ? (
            <Spinner label="Loading tickets from Stellar…" />
          ) : available.length === 0 ? (
            <EmptyState title="No tickets available right now">
              <p className="muted">
                Have a ticket you can't use? <Link to="/sell">List it on GOIN</Link>.
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
            Listings are read directly from the GOIN contract{" "}
            <ExternalLink href={contractUrl(GOIN_CONTRACT_ID)}>on Stellar testnet</ExternalLink>.
          </p>
        </section>
      </div>
    </>
  );
}
