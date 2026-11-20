import { useState } from "react";
import { describeError } from "../lib/contract";
import { addUsdcTrustline, fundWithFriendbot, type AccountStatus } from "../lib/horizon";
import { formatUsdc } from "../lib/money";
import { txUrl } from "../lib/format";
import { ExternalLink } from "./ui";

interface Props {
  address: string;
  status: AccountStatus | null;
  onChanged: () => void;
  /** Amount the wallet must hold, in USDC base units (for buyers). */
  requiredUsdc?: bigint;
  /** Why the wallet needs USDC, shown in the trustline step. */
  purpose: "pay" | "receive";
}

/** True when the wallet can take part in a USDC payment. */
export function accountReady(status: AccountStatus | null, requiredUsdc?: bigint): boolean {
  if (!status?.funded || status.usdc === null) return false;
  return requiredUsdc === undefined || status.usdc >= requiredUsdc;
}

/**
 * Walks a wallet through the testnet setup a USDC payment needs:
 * a funded account, a USDC trustline, and (for buyers) enough USDC.
 */
export function AccountChecklist({ address, status, onChanged, requiredUsdc, purpose }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);

  if (!status) return <p className="muted small">Checking your wallet…</p>;

  const act = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setError(null);
    try {
      const h = await fn();
      if (h) setHash(h);
      onChanged();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  let step = null;
  if (!status.funded) {
    step = (
      <>
        <p>This wallet doesn't exist on testnet yet. Fund it with free test XLM to pay network fees.</p>
        <button className="btn btn-secondary" disabled={busy} onClick={() => void act(() => fundWithFriendbot(address))}>
          {busy ? "Funding…" : "Fund with Friendbot"}
        </button>
      </>
    );
  } else if (status.usdc === null) {
    step = (
      <>
        <p>
          Add a USDC trustline so this wallet can {purpose === "pay" ? "pay with" : "receive"} USDC. Freighter will ask
          you to approve it.
        </p>
        <button className="btn btn-secondary" disabled={busy} onClick={() => void act(() => addUsdcTrustline(address))}>
          {busy ? "Adding trustline…" : "Add USDC trustline"}
        </button>
      </>
    );
  } else if (requiredUsdc !== undefined && status.usdc < requiredUsdc) {
    step = (
      <>
        <p>
          You have {formatUsdc(status.usdc)} but this ticket costs {formatUsdc(requiredUsdc)}. On testnet, the GOIN
          admin can send you test USDC with:
        </p>
        <code className="code-block">scripts\mint-test-usdc.ps1 -To {address}</code>
        <button className="btn btn-ghost btn-small" onClick={onChanged}>
          Refresh balance
        </button>
      </>
    );
  }

  return (
    <div className={`checklist ${step ? "checklist-todo" : "checklist-ok"}`}>
      {step ?? <p className="small">Wallet ready · USDC balance {formatUsdc(status.usdc ?? 0n)}</p>}
      {error && <p className="notice notice-bad">{error}</p>}
      {hash && !error && (
        <p className="small">
          Done. <ExternalLink href={txUrl(hash)}>View transaction</ExternalLink>
        </p>
      )}
    </div>
  );
}
