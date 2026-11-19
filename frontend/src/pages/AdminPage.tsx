import type { ReactNode } from "react";
import { ListingCard } from "../components/ListingCard";
import { EmptyState, ExternalLink, Spinner } from "../components/ui";
import type { ListingStatusTag } from "../lib/contract";
import { accountUrl, shortAddress } from "../lib/format";
import { useAdmin, useListings, type ListingView } from "../lib/hooks";
import { useWallet } from "../lib/wallet";

export function AdminPage() {
  const wallet = useWallet();
  const admin = useAdmin();
  const { listings, loading, error, reload } = useListings();

  if (!admin) return <Spinner label="Loading contract administrator…" />;

  if (wallet.address !== admin) {
    return (
      <section className="narrow">
        <h1>Administrator</h1>
        <div className="card">
          <p>
            Only the CREDENCE administrator can review listings and confirm transfers. Connect the administrator wallet{" "}
            <ExternalLink href={accountUrl(admin)}>{shortAddress(admin)}</ExternalLink> in Freighter.
          </p>
          {!wallet.address && (
            <button className="btn btn-primary" onClick={() => void wallet.connect()}>
              Connect Freighter
            </button>
          )}
        </div>
      </section>
    );
  }

  const byStatus = (...statuses: ListingStatusTag[]) =>
    listings.filter((v) => statuses.includes(v.listing.status.tag));

  return (
    <section>
      <div className="section-head">
        <h1>Administrator</h1>
        <button className="btn btn-ghost btn-small" onClick={() => void reload()} disabled={loading}>
          Refresh
        </button>
      </div>
      <p className="lead">Open a listing to review its evidence or confirm a transfer.</p>
      {error && <p className="notice notice-bad">{error}</p>}
      {loading ? (
        <Spinner />
      ) : (
        <>
          <Queue title="Pending review" hint="Check purchase evidence, then approve or reject." views={byStatus("PendingReview")} />
          <Queue
            title="Awaiting transfer confirmation"
            hint="Confirm whether the ticket transfer succeeded. Paid listings without a transfer can be refunded."
            views={byStatus("TransferInitiated", "PaymentCommitted")}
          />
          <Queue title="Live listings" views={byStatus("Approved")} />
          <Queue title="Closed" views={byStatus("Settled", "Refunded", "Rejected")} />
        </>
      )}
    </section>
  );
}

function Queue({ title, hint, views }: { title: string; hint?: ReactNode; views: ListingView[] }) {
  return (
    <section className="subsection">
      <h2>
        {title} <span className="count">{views.length}</span>
      </h2>
      {hint && <p className="muted small">{hint}</p>}
      {views.length === 0 ? (
        <EmptyState title="Nothing in this queue" />
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
