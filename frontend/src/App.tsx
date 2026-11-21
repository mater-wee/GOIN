import { Link, Route, Routes } from "react-router";
import { Header } from "./components/Header";
import { Starfield } from "./components/Starfield";
import { EmptyState, ExternalLink } from "./components/ui";
import { GOIN_CONTRACT_ID } from "./config";
import { contractUrl } from "./lib/format";
import { ActivityPage } from "./pages/ActivityPage";
import { AdminPage } from "./pages/AdminPage";
import { BrowsePage } from "./pages/BrowsePage";
import { ListingPage } from "./pages/ListingPage";
import { SellPage } from "./pages/SellPage";

export function App() {
  return (
    <div className="app">
      <Starfield />
      <Header />
      <main className="container main">
        <Routes>
          <Route path="/" element={<BrowsePage />} />
          <Route path="/listing/:id" element={<ListingPage />} />
          <Route path="/sell" element={<SellPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route
            path="*"
            element={
              <EmptyState title="Page not found">
                <Link to="/">Back to tickets</Link>
              </EmptyState>
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
