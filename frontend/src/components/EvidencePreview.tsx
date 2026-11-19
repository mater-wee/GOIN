import { useEffect, useState } from "react";
import type { TicketDetails } from "../lib/offchain";

/** Shows the seller's uploaded purchase evidence (image inline, PDF as a link). */
export function EvidencePreview({ evidence }: { evidence?: TicketDetails["evidence"] }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!evidence) return;
    const objectUrl = URL.createObjectURL(evidence.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [evidence]);

  if (!evidence) return <p className="muted small">No purchase evidence available in this browser.</p>;
  if (!url) return null;

  return (
    <div className="evidence">
      {evidence.type.startsWith("image/") ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={`Purchase evidence: ${evidence.name}`} />
        </a>
      ) : (
        <a className="btn btn-ghost btn-small" href={url} target="_blank" rel="noreferrer">
          Open {evidence.name}
        </a>
      )}
    </div>
  );
}
