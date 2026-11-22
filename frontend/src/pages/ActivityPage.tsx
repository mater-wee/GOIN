import { RefreshCw } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router";
import { isSignedIn, retryPendingDrafts } from "../lib/api";
import { AccountChecklist } from "../components/AccountChecklist";
import { Icon } from "../components/Icon";
import { ListingCard } from "../components/ListingCard";
import { EmptyState, ExternalLink, Spinner } from "../components/ui";
import { accountUrl } from "../lib/format";
import { useAccountStatus, useListings, type ListingView } from "../lib/hooks";
import { useWallet } from "../lib/wallet";

/** Statuses where the seller has something to do. */
const SELLER_TODO = new Set(["PaymentCommitted"]);

export function ActivityPage() {
  const wallet = useWallet();
  const account = useAccountStatus(wallet.address);
  const { listings, loading, error, detailsError, reload } = useListings();

  // Link any listing created on-chain whose details weren't saved (e.g. the tab was closed mid-way).
  useEffect(() => {
    const address = wallet.address;
    if (!address || !isSignedIn(address)) return;
    void retryPendingDrafts(address).then((linked) => {
      if (linked) void reload();
    });
  }, [wallet.address, reload]);

  if (!wallet.address) {
    return (
      <section className="narrow">
        <h1>My activity</h1>
        <div className="card">
          <p>Connect Freighter to see the tickets you're selling and buying.</p>
          <button className="btn btn-primary" onClick={() => void wallet.connect()}>
            Connect Freighter
          </button>
        </div>
      </section>
    );
  }

  const me = wallet.address;
  const selling = listings.filter((v) => v.listing.seller === me);
  const buying = listings.filter((v) => v.listing.buyer === me);
  const needsAction = selling.filter((v) => SELLER_TODO.has(v.listing.status.tag));

  return (
    <section>
      <div className="section-head">
        <h1>My activity</h1>
        <button className="btn btn-ghost btn-small" onClick={() => void reload()} disabled={loading}>
          <Icon icon={RefreshCw} size={16} />
          Refresh
        </button>
      </div>

      <div className="card" data-reveal>
        <h3>Wallet</h3>
        <p className="small">
          <ExternalLink href={accountUrl(me)}>{me}</ExternalLink>
        </p>
        <AccountChecklist address={me} status={account.status} onChanged={() => void account.reload()} purpose="pay" />
      </div>

      {error && <p className="notice notice-bad">{error}</p>}
      {detailsError && <p className="notice notice-info">{detailsError}</p>}
      {loading ? (
        <Spinner />
      ) : (
        <>
          {needsAction.length > 0 && (
            <p className="notice notice-info">
              {needsAction.length === 1 ? "A buyer has paid for your ticket." : `Buyers have paid for ${needsAction.length} of your tickets.`}{" "}
              Open the listing to start the ticket transfer.
            </p>
          )}
          <Section title="Tickets I'm selling" views={selling} empty={<Link to="/sell">List a ticket</Link>} />
          <Section title="Tickets I bought" views={buying} empty={<Link to="/">Browse tickets</Link>} />
        </>
      )}
    </section>
  );
}

function Section({ title, views, empty }: { title: string; views: ListingView[]; empty: ReactNode }) {
  return (
    <section className="subsection">
      <h2>{title}</h2>
      {views.length === 0 ? (
        <EmptyState title="Nothing here yet">{empty}</EmptyState>
      ) : (
        <div className="grid">
          {views.map((v) => (
            <ListingCard key={v.listing.id.toString()} view={v} />
          ))}
        </div>
      )}
    </section>
  );
}
