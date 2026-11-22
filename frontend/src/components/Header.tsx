import { Contrast, Moon, Sun, Wallet, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router";
import { useAdmin } from "../lib/hooks";
import { shortAddress } from "../lib/format";
import { type Theme, useTheme } from "../lib/theme";
import { useWallet } from "../lib/wallet";
import { Icon } from "./Icon";
import { ExternalLink } from "./ui";

const THEME_OPTIONS: { id: Theme; label: string; icon: LucideIcon }[] = [
  { id: "midnight", label: "Midnight Galaxy", icon: Moon },
  { id: "lavender", label: "Cloud Lavender", icon: Sun },
  { id: "graphite", label: "Graphite", icon: Contrast },
];

/** Picks one of the three themes. A radio group, so arrow keys move between options. */
function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  return (
    <fieldset className="theme-switch">
      <legend className="sr-only">Appearance</legend>
      {THEME_OPTIONS.map(({ id, label, icon }) => (
        <label key={id} title={label} data-checked={theme === id || undefined}>
          <input
            type="radio"
            name="goin-theme"
            className="sr-only"
            checked={theme === id}
            onChange={() => setTheme(id)}
          />
          <Icon icon={icon} />
          <span className="sr-only">{label}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** True once the page is scrolled past `threshold` px. Passive listener, at most one read per frame. */
function useScrolled(threshold: number) {
  const [scrolled, setScrolled] = useState(() => window.scrollY > threshold);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setScrolled(window.scrollY > threshold);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [threshold]);
  return scrolled;
}

export function Header() {
  const wallet = useWallet();
  const admin = useAdmin();
  const isAdmin = !!wallet.address && wallet.address === admin;
  const { pathname } = useLocation();
  const scrolled = useScrolled(8);

  return (
    <>
      <header className="header" data-overlay={pathname === "/" && !scrolled}>
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
          <ThemeSwitcher />
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
    <button
      className="btn btn-primary wallet-connect"
      onClick={() => void connect()}
      disabled={connecting || installed === false}
    >
      <Icon icon={Wallet} size={16} />
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
