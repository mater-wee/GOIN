import { CircleCheck, TriangleAlert } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { AccountChecklist } from "../components/AccountChecklist";
import { ChecksList } from "../components/ChecksList";
import { Icon } from "../components/Icon";
import { TxFeedback } from "../components/ui";
import { MAX_EVIDENCE_BYTES, PHP_PER_USDC } from "../config";
import {
  CATEGORIES,
  confirmDraft,
  createDraft,
  forgetPendingDraft,
  readReceipt,
  rememberPendingDraft,
  type DraftResult,
  type Extraction,
  type ExtractedFields,
  type TicketInput,
} from "../lib/api";
import { goin, describeError, submit } from "../lib/contract";
import { useAccountStatus } from "../lib/hooks";
import { formatPhp, formatUsdc, phpToUsdcUnits } from "../lib/money";
import { useWallet } from "../lib/wallet";

interface FormState {
  eventName: string;
  eventDate: string;
  venue: string;
  category: string;
  seat: string;
  orderRef: string;
  originalPrice: string;
  resalePrice: string;
}

const EMPTY: FormState = {
  eventName: "",
  eventDate: "",
  venue: "",
  category: CATEGORIES[0],
  seat: "",
  orderRef: "",
  originalPrice: "",
  resalePrice: "",
};

type Stage = "draft" | "tx" | "link";
const STAGE_LABEL: Record<Stage, string> = {
  draft: "Checking your ticket…",
  tx: "Waiting for Freighter…",
  link: "Saving your listing…",
};

const hexToBytes = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Maps what the receipt reader found onto the form's fields. */
function fieldsFromReceipt(f: ExtractedFields): Partial<FormState> {
  return {
    eventName: f.eventName,
    eventDate: f.eventDate,
    venue: f.venue,
    category: f.category && f.category !== "Other" ? f.category : undefined,
    seat: f.seat,
    orderRef: f.orderRef,
    originalPrice: f.originalPricePhp !== undefined ? String(f.originalPricePhp) : undefined,
  };
}

export function SellPage() {
  const wallet = useWallet();
  const navigate = useNavigate();
  const account = useAccountStatus(wallet.address);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [evidence, setEvidence] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [receipt, setReceipt] = useState<Extraction | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  // A draft whose checks found issues, waiting for the seller to confirm or edit.
  const [review, setReview] = useState<{ draft: DraftResult; key: string } | null>(null);

  const busy = stage !== null || reading;
  const update = (field: keyof FormState) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const original = Number(form.originalPrice);
  const resale = Number(form.resalePrice || form.originalPrice);
  const pricesValid = original > 0 && resale > 0;
  const suggested = receipt ? fieldsFromReceipt(receipt.fields) : {};

  /** Step 6: read the receipt as soon as it's chosen and fill in empty fields. */
  const onEvidence = async (file: File | null) => {
    setEvidence(file);
    setReceipt(null);
    setReceiptError(null);
    setReview(null);
    if (!file || !wallet.address) return;
    if (file.size > MAX_EVIDENCE_BYTES) {
      setReceiptError("The evidence file must be 5 MB or smaller.");
      return;
    }
    setReading(true);
    try {
      const result = await readReceipt(wallet.address, file);
      setReceipt(result);
      const found = fieldsFromReceipt(result.fields);
      setForm((f) => {
        const next = { ...f };
        for (const [key, value] of Object.entries(found) as [keyof FormState, string | undefined][]) {
          // Only fill fields the seller hasn't typed in (category always starts at a default).
          if (value && (!f[key] || (key === "category" && f.category === EMPTY.category))) next[key] = value;
        }
        return next;
      });
    } catch (e) {
      setReceiptError(describeError(e));
    } finally {
      setReading(false);
    }
  };

  const details = (): TicketInput => ({
    eventName: form.eventName.trim(),
    eventDate: form.eventDate,
    venue: form.venue.trim(),
    category: form.category,
    seat: form.seat.trim(),
    orderRef: form.orderRef.trim(),
    originalPricePhp: original,
    resalePricePhp: resale,
  });

  const validate = (): string | null => {
    if (!evidence) return "Upload your purchase evidence (receipt or ticket screenshot).";
    if (!form.eventName.trim() || !form.eventDate || !form.venue.trim() || !form.orderRef.trim())
      return "Fill in the event name, date, venue, and order number.";
    if (!pricesValid) return "Enter the original ticket price in pesos.";
    if (resale > original) return `The resale price can't be higher than the original price (${formatPhp(original)}).`;
    return null;
  };

  const onSubmit = async (e: FormEvent, acceptIssues = false) => {
    e.preventDefault();
    const problem = validate();
    setError(problem);
    if (problem || !wallet.address || !evidence) return;
    const seller = wallet.address;
    const input = details();
    const key = JSON.stringify([input, evidence.name, evidence.size, evidence.lastModified]);

    try {
      // Step 5: the backend validates and stores the details, computes ticket_ref, and checks the receipt.
      let draft = review?.key === key ? review.draft : null;
      if (!draft) {
        setStage("draft");
        draft = await createDraft(seller, input, evidence);
      }
      if (draft.issueCount > 0 && !acceptIssues) {
        setReview({ draft, key });
        setStage(null);
        return;
      }

      setStage("tx");
      rememberPendingDraft(seller, draft.draftId);
      const outcome = await submit(
        goin(seller).create_listing({
          seller,
          ticket_ref: hexToBytes(draft.ticketRef),
          original_price: phpToUsdcUnits(original),
          resale_price: phpToUsdcUnits(resale),
        }),
      );
      setTxHash(outcome.hash ?? null);

      // Link the off-chain details to the new on-chain listing. RPC can lag a few seconds.
      setStage("link");
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await confirmDraft(seller, draft.draftId, outcome.value);
          forgetPendingDraft(seller, draft.draftId);
          break;
        } catch (err) {
          if (attempt === 3) throw err;
          await sleep(2500);
        }
      }
      navigate(`/listing/${outcome.value}`);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setStage(null);
    }
  };

  const receiptHint = (field: keyof FormState) => {
    const value = suggested[field];
    if (!value || value === form[field])
      return value ? (
        <span className="hint hint-ai">
          <Icon icon={CircleCheck} size={16} />
          Matches your receipt
        </span>
      ) : null;
    return (
      <span className="hint hint-warn">
        Receipt shows “{value}”.{" "}
        <button type="button" className="link-button" onClick={() => setForm((f) => ({ ...f, [field]: value }))}>
          Use this
        </button>
      </span>
    );
  };

  if (!wallet.address) {
    return (
      <section className="narrow">
        <h1>Sell a ticket</h1>
        <div className="card">
          <p>Connect your Freighter wallet to list a ticket. Your payout will be sent to this wallet.</p>
          <button className="btn btn-primary" onClick={() => void wallet.connect()}>
            Connect Freighter
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="narrow">
      <h1>Sell a ticket</h1>
      <p className="lead">
        Upload your receipt and GOIN fills in the details for you. An administrator checks your evidence before
        buyers can see the ticket.
      </p>

      <form className="card form" onSubmit={(e) => void onSubmit(e)} noValidate>
        <fieldset disabled={busy}>
          <legend>1. Purchase evidence</legend>
          <label>
            Receipt or ticket screenshot
            <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => void onEvidence(e.target.files?.[0] ?? null)} />
            <span className="hint">
              JPG, PNG, WEBP, or PDF up to 5 MB. Only you and the administrator can see it. It never goes on-chain. The
              first time, Freighter asks you to sign in (a free signature, not a transaction).
            </span>
          </label>
          {reading && <p className="muted spinner">Reading your receipt…</p>}
          {receiptError && <p className="notice notice-bad">{receiptError}</p>}
          {receipt && (
            <div className="notice notice-info">
              <strong>
                Read {Object.keys(receipt.fields).length} of 7 details from your receipt
                {receipt.usedAi ? " with AI assistance" : ""}.
              </strong>{" "}
              Check every field below. The reader suggests values; it doesn't verify that the ticket is real.
              {receipt.warnings.map((w) => (
                <div key={w} className="small notice-line">
                  <Icon icon={TriangleAlert} size={16} />
                  {w}
                </div>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset disabled={busy}>
          <legend>2. Event</legend>
          <label>
            Event name
            <input value={form.eventName} onChange={update("eventName")} placeholder="e.g. Sample Concert Manila 2026" />
            {receiptHint("eventName")}
          </label>
          <div className="row">
            <label>
              Event date
              <input type="date" value={form.eventDate} onChange={update("eventDate")} />
              {receiptHint("eventDate")}
            </label>
            <label>
              Venue
              <input value={form.venue} onChange={update("venue")} placeholder="e.g. Philippine Arena" />
              {receiptHint("venue")}
            </label>
          </div>
          <div className="row">
            <label>
              Ticket category
              <select value={form.category} onChange={update("category")}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              {receiptHint("category")}
            </label>
            <label>
              Seat <span className="muted">(optional)</span>
              <input value={form.seat} onChange={update("seat")} placeholder="e.g. Section 112, Row C, Seat 8" />
              {receiptHint("seat")}
            </label>
          </div>
          <label>
            Order or ticket number
            <input value={form.orderRef} onChange={update("orderRef")} placeholder="From your ticket provider's receipt" />
            {receiptHint("orderRef") ?? (
              <span className="hint">Stays private. Only a hash goes on-chain, so the same ticket can't be listed twice.</span>
            )}
          </label>
        </fieldset>

        <fieldset disabled={busy}>
          <legend>3. Price</legend>
          <div className="row">
            <label>
              Original price (₱)
              <input type="number" min="1" step="1" inputMode="numeric" value={form.originalPrice} onChange={update("originalPrice")} placeholder="2500" />
              {receiptHint("originalPrice")}
            </label>
            <label>
              Resale price (₱)
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={form.resalePrice}
                onChange={update("resalePrice")}
                placeholder={form.originalPrice || "Same as original"}
              />
            </label>
          </div>
          {pricesValid && (
            <p className={`notice ${resale > original ? "notice-bad" : "notice-info"}`}>
              {resale > original
                ? `Fair-price rule: resale can't exceed ${formatPhp(original)}.`
                : `Buyer pays ${formatUsdc(phpToUsdcUnits(resale))} (${formatPhp(resale)} at ₱${PHP_PER_USDC} = 1 USDC). You receive the full amount.`}
            </p>
          )}
        </fieldset>

        <div className="form-section">
          <h4>Payout wallet</h4>
          <AccountChecklist address={wallet.address} status={account.status} onChanged={() => void account.reload()} purpose="receive" />
        </div>

        {review && (
          <div className="card card-warn">
            <h3>Check these before submitting</h3>
            <p className="small">
              Some details don't match what was read from your receipt. Fix them, or submit anyway and the administrator
              will see the same notes.
            </p>
            <ChecksList checks={review.draft.checks} />
            <div className="actions">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={(e) => void onSubmit(e, true)}>
                Submit anyway
              </button>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setReview(null)}>
                Edit details
              </button>
            </div>
          </div>
        )}

        {error && <p className="notice notice-bad">{error}</p>}
        <TxFeedback error={null} hash={txHash} success="Listing created on Stellar." />
        {!review && (
          <button className="btn btn-primary btn-large" type="submit" disabled={busy || !wallet.onTestnet}>
            {stage ? STAGE_LABEL[stage] : "Submit listing for review"}
          </button>
        )}
      </form>
    </section>
  );
}
