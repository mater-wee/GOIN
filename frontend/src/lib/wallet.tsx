import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getAddress,
  getNetwork,
  isAllowed,
  isConnected,
  requestAccess,
  signTransaction,
  WatchWalletChanges,
} from "@stellar/freighter-api";
import { NETWORK } from "../config";

/**
 * Signs a transaction with Freighter. Matches the `signTransaction` shape the
 * Stellar SDK contract client expects, and throws if the user declines.
 */
export async function signWithFreighter(
  xdr: string,
  opts?: { networkPassphrase?: string; address?: string },
): Promise<{ signedTxXdr: string; signerAddress?: string }> {
  const res = await signTransaction(xdr, {
    networkPassphrase: opts?.networkPassphrase ?? NETWORK.passphrase,
    address: opts?.address,
  });
  if (res.error) throw new Error(res.error.message ?? "Freighter could not sign the transaction.");
  return { signedTxXdr: res.signedTxXdr, signerAddress: res.signerAddress };
}

interface WalletContextValue {
  /** null while checking; false if the Freighter extension is not installed. */
  installed: boolean | null;
  address: string | null;
  onTestnet: boolean;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

// Freighter has no "disconnect" call, so the app remembers the choice locally.
const DISCONNECTED_KEY = "goin:wallet-disconnected";

export function WalletProvider({ children }: { children: ReactNode }) {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore an existing Freighter connection on page load.
  useEffect(() => {
    let alive = true;
    (async () => {
      const conn = await isConnected();
      const ok = !conn.error && conn.isConnected;
      if (!alive) return;
      setInstalled(ok);
      if (!ok) return;

      const net = await getNetwork();
      if (alive && !net.error) setPassphrase(net.networkPassphrase);

      if (localStorage.getItem(DISCONNECTED_KEY)) return;
      const allowed = await isAllowed();
      if (!allowed.isAllowed) return;
      const res = await getAddress();
      if (alive && !res.error && res.address) setAddress(res.address);
    })().catch(() => alive && setInstalled(false));
    return () => {
      alive = false;
    };
  }, []);

  // Follow account and network switches made inside Freighter.
  useEffect(() => {
    if (!installed) return;
    const watcher = new WatchWalletChanges(2000);
    watcher.watch(({ address: next, networkPassphrase, error: watchError }) => {
      if (watchError) return;
      if (networkPassphrase) setPassphrase(networkPassphrase);
      if (!localStorage.getItem(DISCONNECTED_KEY)) setAddress(next || null);
    });
    return () => watcher.stop();
  }, [installed]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const res = await requestAccess();
      if (res.error) throw new Error(res.error.message ?? "Freighter denied access.");
      localStorage.removeItem(DISCONNECTED_KEY);
      setAddress(res.address);
      const net = await getNetwork();
      if (!net.error) setPassphrase(net.networkPassphrase);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    localStorage.setItem(DISCONNECTED_KEY, "1");
    setAddress(null);
  }, []);

  const value = useMemo<WalletContextValue>(
    () => ({
      installed,
      address,
      onTestnet: passphrase === NETWORK.passphrase,
      connecting,
      error,
      connect,
      disconnect,
    }),
    [installed, address, passphrase, connecting, error, connect, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
