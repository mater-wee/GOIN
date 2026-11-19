import { useCallback, useEffect, useState } from "react";
import { describeError, fetchAdmin, fetchListing, fetchListings, type Listing, type TxOutcome } from "./contract";
import { fetchAccountStatus, type AccountStatus } from "./horizon";
import { getDetails, type TicketDetails } from "./offchain";

export interface ListingView {
  listing: Listing;
  details?: TicketDetails;
}

/** All listings (newest first) merged with their off-chain details. */
export function useListings() {
  const [listings, setListings] = useState<ListingView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const onChain = await fetchListings();
      const views = await Promise.all(
        onChain.map(async (listing) => ({ listing, details: await getDetails(listing.id) })),
      );
      setListings(views.reverse());
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { listings, loading, error, reload };
}

/** One listing with its off-chain details. `view` is null if it doesn't exist. */
export function useListing(id: bigint | null) {
  const [view, setView] = useState<ListingView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (id === null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const listing = await fetchListing(id);
      setView(listing ? { listing, details: await getDetails(id) } : null);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { view, loading, error, reload };
}

let adminRequest: Promise<string> | null = null;

/** The administrator address stored in the contract. */
export function useAdmin(): string | null {
  const [admin, setAdmin] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    adminRequest ??= fetchAdmin();
    adminRequest
      .then((a) => {
        if (alive) setAdmin(a);
      })
      .catch(() => {
        adminRequest = null;
      });
    return () => {
      alive = false;
    };
  }, []);
  return admin;
}

/** XLM funding, USDC trustline, and USDC balance for a wallet. */
export function useAccountStatus(address: string | null) {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!address) {
      setStatus(null);
      return;
    }
    try {
      setError(null);
      setStatus(await fetchAccountStatus(address));
    } catch (e) {
      setError(describeError(e));
    }
  }, [address]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { status, error, reload };
}

/** Tracks one blockchain action: busy flag, readable error, and tx hash. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);

  const run = useCallback(async <T,>(fn: () => Promise<TxOutcome<T>>): Promise<TxOutcome<T> | null> => {
    setBusy(true);
    setError(null);
    setHash(null);
    try {
      const outcome = await fn();
      setHash(outcome.hash ?? null);
      return outcome;
    } catch (e) {
      setError(describeError(e));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, hash, run };
}
