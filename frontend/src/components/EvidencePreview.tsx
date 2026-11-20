import { useEffect, useState } from "react";

/** Shows purchase evidence fetched from the server (image inline, PDF as a link). */
export function EvidencePreview({ blob, name }: { blob: Blob; name: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  if (!url) return null;
  return (
    <div className="evidence">
      {blob.type.startsWith("image/") ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={`Purchase evidence: ${name}`} />
        </a>
      ) : (
        <a className="btn btn-ghost btn-small" href={url} target="_blank" rel="noreferrer">
          Open {name}
        </a>
      )}
    </div>
  );
}
