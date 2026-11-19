import type { ReactNode } from "react";
import type { ListingStatusTag } from "../lib/contract";
import { STATUS_LABEL, STATUS_TONE, txUrl } from "../lib/format";

export function StatusBadge({ status }: { status: ListingStatusTag }) {
  return <span className={`badge badge-${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  );
}

/** Shows the outcome of an action: an error, or a link to the transaction. */
export function TxFeedback({ error, hash, success }: { error: string | null; hash: string | null; success?: string }) {
  if (error) return <p className="notice notice-bad" role="alert">{error}</p>;
  if (hash)
    return (
      <p className="notice notice-good" role="status">
        {success ?? "Transaction confirmed."} <ExternalLink href={txUrl(hash)}>View on Stellar Expert</ExternalLink>
      </p>
    );
  return null;
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="muted spinner" role="status">
      {label}
    </p>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
