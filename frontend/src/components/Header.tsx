import { NavLink } from "react-router";
import { useAdmin } from "../lib/hooks";
import { shortAddress } from "../lib/format";
import { useWallet } from "../lib/wallet";
import { ExternalLink } from "./ui";

export function Header() {
  const wallet = useWallet();
  const admin = useAdmin();
  const isAdmin = !!wallet.address && wallet.address === admin;

  return (
    <>
      <header className="header">
        <div className="container header-inner">
          <NavLink to="/" className="brand">
            <span className="brand-mark" aria-hidden>
              G
            </span>
            GOIN
          </NavLink>
          <nav className="nav">
            <NavLink to="/" end>
              Tickets
            </NavLink>
            <NavLink to="/sell">Sell</NavLink>
            <NavLink to="/activity">My activity</NavLink>
            {isAdmin && <NavLink to="/admin">Admin</NavLink>}
          </nav>
          <WalletButton />
        </div>
      </header>
      <WalletBanner />
    </>
  );
}

function WalletButton() {
  const { installed, address, connecting, connect, disconnect } = useWallet();
  if (address) {
    return (
      <div className="wallet">
        <span className="wallet-address" title={address}>
          {shortAddress(address)}
        </span>
        <button className="btn btn-ghost btn-small" onClick={disconnect}>
          Disconnect
        </button>
      </div>
    );
  }
  return (
    <button className="btn btn-primary" onClick={() => void connect()} disabled={connecting || installed === false}>
      {connecting ? "Connecting…" : "Connect Freighter"}
    </button>
  );
}

function WalletBanner() {
  const { installed, address, onTestnet, error } = useWallet();
  let message = null;
  if (installed === false) {
    message = (
      <>
        GOIN uses the Freighter wallet. <ExternalLink href="https://www.freighter.app">Install Freighter</ExternalLink>{" "}
        and reload this page.
      </>
    );
  } else if (address && !onTestnet) {
    message = <>Freighter is not on Testnet. Open Freighter, switch the network to Testnet, and try again.</>;
  } else if (error) {
    message = <>{error}</>;
  }
  if (!message) return null;
  return (
    <div className="banner" role="alert">
      <div className="container">{message}</div>
    </div>
  );
}
