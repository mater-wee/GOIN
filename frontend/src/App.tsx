import { Link, Route, Routes } from "react-router";
import { Header } from "./components/Header";
import { Starfield } from "./components/Starfield";
import { EmptyState, ExternalLink } from "./components/ui";
import { GOIN_CONTRACT_ID } from "./config";
import { contractUrl } from "./lib/format";
import { useRevealObserver } from "./lib/motion";
import { ActivityPage } from "./pages/ActivityPage";
import { AdminPage } from "./pages/AdminPage";
import { BrowsePage } from "./pages/BrowsePage";
import { ListingPage } from "./pages/ListingPage";
import { SellPage } from "./pages/SellPage";

export function App() {
  useRevealObserver();
  return (
    <div className="app">
      <Starfield />
      <Header />
      <main className="main">
        <Routes>
          <Route path="/" element={<BrowsePage />} />
          <Route
            path="/listing/:id"
            element={
              <div className="container page">
                <ListingPage />
              </div>
            }
          />
          <Route
            path="/sell"
            element={
              <div className="container page">
                <SellPage />
              </div>
            }
          />
          <Route
            path="/activity"
            element={
              <div className="container page">
                <ActivityPage />
              </div>
            }
          />
          <Route
            path="/admin"
            element={
              <div className="container page">
                <AdminPage />
              </div>
            }
          />
          <Route
            path="*"
            element={
              <div className="container page">
                <EmptyState title="Page not found">
                  <Link to="/">Back to tickets</Link>
                </EmptyState>
              </div>
            }
          />
        </Routes>
      </main>
      <footer className="footer">
        <div className="container">
          GOIN · Stellar testnet demo · Contract{" "}
          <ExternalLink href={contractUrl(GOIN_CONTRACT_ID)}>{GOIN_CONTRACT_ID.slice(0, 8)}…</ExternalLink> · Test
          USDC has no real value.
        </div>
      </footer>
    </div>
  );
}
