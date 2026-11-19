import { NETWORK } from "../config";
import type { ListingStatusTag } from "./contract";

export const STATUS_LABEL: Record<ListingStatusTag, string> = {
  PendingReview: "Pending review",
  Approved: "Available",
  Rejected: "Rejected",
  PaymentCommitted: "Paid · awaiting transfer",
  TransferInitiated: "Transfer in progress",
  Settled: "Completed",
  Refunded: "Refunded",
};

export const STATUS_TONE: Record<ListingStatusTag, "neutral" | "good" | "bad" | "info" | "warn"> = {
  PendingReview: "warn",
  Approved: "good",
  Rejected: "bad",
  PaymentCommitted: "info",
  TransferInitiated: "info",
  Settled: "good",
  Refunded: "neutral",
};

export function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function formatEventDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-PH", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

export const txUrl = (hash: string) => `${NETWORK.explorerUrl}/tx/${hash}`;
export const contractUrl = (id: string) => `${NETWORK.explorerUrl}/contract/${id}`;
export const accountUrl = (id: string) => `${NETWORK.explorerUrl}/account/${id}`;
