import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The GOIN backend (server/) runs on port 8787.
    proxy: { "/api": "http://localhost:8787" },
  },
  preview: {
    proxy: { "/api": "http://localhost:8787" },
  },
});
