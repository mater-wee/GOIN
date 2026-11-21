import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { WalletProvider } from "./lib/wallet";
// Inter (bundled, no external requests): the closest free match for Apple's San Francisco
// font. The "opsz" build adjusts letter shapes for small and large text, like SF Text/Display.
import "@fontsource-variable/inter/opsz.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <WalletProvider>
        <App />
      </WalletProvider>
    </BrowserRouter>
  </StrictMode>,
);
