import { Check, X } from "lucide-react";
import type { ListingStatusTag } from "../lib/contract";
import { Icon } from "./Icon";

type StepState = "done" | "current" | "todo" | "failed";

const HAPPY_PATH: { status: ListingStatusTag; label: string }[] = [
  { status: "PendingReview", label: "Listed by seller" },
  { status: "Approved", label: "Approved by admin" },
  { status: "PaymentCommitted", label: "Buyer paid into escrow" },
  { status: "TransferInitiated", label: "Seller started transfer" },
  { status: "Settled", label: "Seller paid" },
];

/** Visual progress of a listing through the MVP flow, including dead ends. */
export function StatusTimeline({ status }: { status: ListingStatusTag }) {
  let steps: { label: string; state: StepState }[];

  if (status === "Rejected") {
    steps = [
      { label: "Listed by seller", state: "done" },
      { label: "Rejected by admin", state: "failed" },
    ];
  } else if (status === "Refunded") {
    steps = [
      { label: "Listed by seller", state: "done" },
      { label: "Approved by admin", state: "done" },
      { label: "Buyer paid into escrow", state: "done" },
      { label: "Transfer failed · buyer refunded", state: "failed" },
    ];
  } else {
    const index = HAPPY_PATH.findIndex((s) => s.status === status);
    steps = HAPPY_PATH.map((s, i) => ({
      label: s.label,
      state: i <= index ? "done" : i === index + 1 ? "current" : "todo",
    }));
  }

  return (
    <ol className="timeline">
      {steps.map((s) => (
        <li key={s.label} className={`timeline-step step-${s.state}`}>
          <span className="timeline-dot" aria-hidden>
            {s.state === "done" ? (
              <Icon icon={Check} size={14} strong />
            ) : s.state === "failed" ? (
              <Icon icon={X} size={14} strong />
            ) : null}
          </span>
          <span>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}
