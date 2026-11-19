import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { AccountChecklist } from "../components/AccountChecklist";
import { TxFeedback } from "../components/ui";
import { MAX_EVIDENCE_BYTES, PHP_PER_USDC } from "../config";
import { credence, submit } from "../lib/contract";
import { useAccountStatus, useAction } from "../lib/hooks";
import { formatPhp, formatUsdc, phpToUsdcUnits } from "../lib/money";
import { computeTicketRef, saveDetails } from "../lib/offchain";
import { useWallet } from "../lib/wallet";

const CATEGORIES = ["VIP", "Patron", "Lower Box", "Upper Box", "General Admission", "Floor Standing", "Other"];

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

export function SellPage() {
  const wallet = useWallet();
  const navigate = useNavigate();
  const account = useAccountStatus(wallet.address);
  const action = useAction();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [evidence, setEvidence] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const update = (field: keyof FormState) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const original = Number(form.originalPrice);
  const resale = Number(form.resalePrice || form.originalPrice);
  const pricesValid = original > 0 && resale > 0;

  const validate = (): string | null => {
    if (!form.eventName.trim() || !form.eventDate || !form.venue.trim() || !form.orderRef.trim())
      return "Fill in the event name, date, venue, and order number.";
    if (!pricesValid) return "Enter the original ticket price in pesos.";
    if (resale > original) return `The resale price can't be higher than the original price (${formatPhp(original)}).`;
    if (!evidence) return "Upload your purchase evidence (receipt or ticket screenshot).";
    if (evidence.size > MAX_EVIDENCE_BYTES) return "The evidence file must be 5 MB or smaller.";
    if (!evidence.type.startsWith("image/") && evidence.type !== "application/pdf")
      return "Upload an image or a PDF as purchase evidence.";
    return null;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = validate();
    setFormError(problem);
    if (problem || !wallet.address || !evidence) return;

    const seller = wallet.address;
    const fields = {
      eventName: form.eventName.trim(),
      eventDate: form.eventDate,
      venue: form.venue.trim(),
      category: form.category,
      seat: form.seat.trim(),
      orderRef: form.orderRef.trim(),
    };
    const ticketRef = await computeTicketRef(fields);

    const outcome = await action.run(() =>
      submit(
        credence(seller).create_listing({
          seller,
          ticket_ref: ticketRef,
          original_price: phpToUsdcUnits(original),
          resale_price: phpToUsdcUnits(resale),
        }),
      ),
    );
    if (!outcome) return;

    // The contract assigned the listing ID; store the off-chain details under it.
    await saveDetails(outcome.value, {
      ...fields,
      originalPricePhp: original,
      resalePricePhp: resale,
      sellerAddress: seller,
      createdAt: new Date().toISOString(),
      evidence: { name: evidence.name, type: evidence.type, blob: evidence },
    });
    navigate(`/listing/${outcome.value}`);
  };

  return (
    <section className="narrow">
      <h1>Sell a ticket</h1>
      <p className="lead">
        List a ticket you can't use. An administrator checks your purchase evidence before buyers can see it.
      </p>

      {!wallet.address ? (
        <div className="card">
          <p>Connect your Freighter wallet to list a ticket. Your payout will be sent to this wallet.</p>
          <button className="btn btn-primary" onClick={() => void wallet.connect()}>
            Connect Freighter
          </button>
        </div>
      ) : (
        <form className="card form" onSubmit={(e) => void onSubmit(e)} noValidate>
          <fieldset disabled={action.busy}>
            <legend>Event</legend>
            <label>
              Event name
              <input value={form.eventName} onChange={update("eventName")} placeholder="e.g. Sample Concert Manila 2026" required />
            </label>
            <div className="row">
              <label>
                Event date
                <input type="date" value={form.eventDate} onChange={update("eventDate")} required />
              </label>
              <label>
                Venue
                <input value={form.venue} onChange={update("venue")} placeholder="e.g. Philippine Arena" required />
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
              </label>
              <label>
                Seat <span className="muted">(optional)</span>
                <input value={form.seat} onChange={update("seat")} placeholder="e.g. Section 112, Row C, Seat 8" />
              </label>
            </div>
            <label>
              Order or ticket number
              <input value={form.orderRef} onChange={update("orderRef")} placeholder="From your ticket provider's receipt" required />
              <span className="hint">Stays off-chain. Only a hash is stored, so the same ticket can't be listed twice.</span>
            </label>
          </fieldset>

          <fieldset disabled={action.busy}>
            <legend>Price</legend>
            <div className="row">
              <label>
                Original price (₱)
                <input type="number" min="1" step="1" inputMode="numeric" value={form.originalPrice} onChange={update("originalPrice")} placeholder="2500" required />
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

          <fieldset disabled={action.busy}>
            <legend>Purchase evidence</legend>
            <label>
              Receipt or ticket screenshot
              <input type="file" accept="image/*,application/pdf" onChange={(e) => setEvidence(e.target.files?.[0] ?? null)} required />
              <span className="hint">Image or PDF, up to 5 MB. Only the administrator sees this. It never goes on-chain.</span>
            </label>
          </fieldset>

          <div className="form-section">
            <h4>Payout wallet</h4>
            <AccountChecklist address={wallet.address} status={account.status} onChanged={() => void account.reload()} purpose="receive" />
          </div>

          {formError && <p className="notice notice-bad">{formError}</p>}
          <TxFeedback error={action.error} hash={action.hash} />
          <button className="btn btn-primary btn-large" type="submit" disabled={action.busy || !wallet.onTestnet}>
            {action.busy ? "Waiting for Freighter…" : "Submit listing for review"}
          </button>
        </form>
      )}
    </section>
  );
}
