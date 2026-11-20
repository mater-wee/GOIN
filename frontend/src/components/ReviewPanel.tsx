import { useCallback, useEffect, useState } from "react";
import { fetchEvidence, fetchReview, isSignedIn, type Review } from "../lib/api";
import { describeError } from "../lib/contract";
import { formatEventDate } from "../lib/format";
import { formatPhp } from "../lib/money";
import { ChecksList } from "./ChecksList";
import { EvidencePreview } from "./EvidencePreview";

/**
 * Step 6 for administrators: the evidence, what the receipt reader found, and
 * how it compares with the listing. The reader assists; the person decides.
 */
export function ReviewPanel({ address, listingId }: { address: string; listingId: bigint }) {
  const [review, setReview] = useState<Review | null>(null);
  const [evidence, setEvidence] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, file] = await Promise.all([fetchReview(address, listingId), fetchEvidence(address, listingId)]);
      setReview(r);
      setEvidence(file);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  }, [address, listingId]);

  // Load automatically if already signed in; otherwise wait for a click, since it opens Freighter.
  useEffect(() => {
    if (isSignedIn(address)) void load();
  }, [address, load]);

  if (!review) {
    return (
      <div className="review">
        {error && <p className="notice notice-bad">{error}</p>}
        <button className="btn btn-secondary" disabled={loading} onClick={() => void load()}>
          {loading ? "Loading evidence…" : "Sign in to view evidence"}
        </button>
      </div>
    );
  }

  const { extraction: ex, details } = review;
  const rows: [string, string | undefined, string][] = [
    ["Event", ex.fields.eventName, details.eventName],
    ["Date", ex.fields.eventDate && formatEventDate(ex.fields.eventDate), formatEventDate(details.eventDate)],
    ["Venue", ex.fields.venue, details.venue],
    ["Category", ex.fields.category, details.category],
    ["Seat", ex.fields.seat, details.seat || "—"],
    ["Order no.", ex.fields.orderRef, details.orderRef],
    ["Price", ex.fields.originalPricePhp !== undefined ? formatPhp(ex.fields.originalPricePhp) : undefined, formatPhp(details.originalPricePhp)],
  ];

  return (
    <div className="review">
      {evidence && <EvidencePreview blob={evidence} name={review.evidence.name} />}

      <h4>Receipt check</h4>
      <ChecksList checks={review.checks} />

      <table className="compare">
        <thead>
          <tr>
            <th />
            <th>On receipt</th>
            <th>In listing</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, found, listed]) => (
            <tr key={label}>
              <th>{label}</th>
              <td className={found ? "" : "muted"}>{found ?? "not found"}</td>
              <td>{listed}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        Read with {ex.engine === "ocr" ? `OCR (confidence ${ex.confidence ?? "?"}%)` : "the PDF's text"}
        {ex.usedAi ? " plus AI extraction" : " and built-in rules"}. These are hints: confirm against the evidence before
        approving.
      </p>
      <details className="small">
        <summary>Text read from the evidence</summary>
        <pre className="ocr-text">{ex.textPreview || "(no text found)"}</pre>
      </details>
    </div>
  );
}
