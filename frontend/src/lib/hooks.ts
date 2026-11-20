import { useCallback, useEffect, useState } from "react";
import { fetchPublicListing, fetchPublicListings, type PublicDetails } from "./api";
import { describeError, fetchAdmin, fetchListing, fetchListings, type Listing, type TxOutcome } from "./contract";
import { fetchAccountStatus, type AccountStatus } from "./horizon";
import { useWallet } from "./wallet";

export interface ListingView {
  listing: Listing;
  /** Off-chain details from the GOIN server. Missing if it's offline. */
  details?: PublicDetails;
}

const errorMessage = (r: PromiseSettledResult<unknown>) => (r.status === "rejected" ? describeError(r.reason) : null);

/**
 * All listings (newest first): the on-chain record from Stellar merged with
 * the off-chain details from the GOIN server. If the server is down, the
 * on-chain data still shows and `detailsError` explains why details are missing.
 */
export function useListings() {
  const { address } = useWallet();
  const [listings, setListings] = useState<ListingView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [chain, details] = await Promise.allSettled([fetchListings(), fetchPublicListings(address)]);
    if (chain.status === "fulfilled") {
      const byId = new Map((details.status === "fulfilled" ? details.value : []).map((d) => [d.listingId, d]));
      setListings(chain.value.map((listing) => ({ listing, details: byId.get(Number(listing.id)) })).reverse());
    } else {
      setError(errorMessage(chain));
    }
    setDetailsError(errorMessage(details));
    setLoading(false);
  }, [address]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { listings, loading, error, detailsError, reload };
}

/** One listing with its off-chain details. `view` is null if it doesn't exist. */
export function useListing(id: bigint | null) {
  const { address } = useWallet();
  const [view, setView] = useState<ListingView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (id === null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const [chain, details] = await Promise.allSettled([fetchListing(id), fetchPublicListing(id, address)]);
    if (chain.status === "fulfilled") {
      setView(chain.value ? { listing: chain.value, details: details.status === "fulfilled" ? details.value ?? undefined : undefined } : null);
    } else {
      setError(errorMessage(chain));
    }
    setDetailsError(errorMessage(details));
    setLoading(false);
  }, [id, address]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { view, loading, error, detailsError, reload };
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
