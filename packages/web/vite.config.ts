// Vite build of the website; in development /api is forwarded to the API server on :8787.
// The static GitHub Pages build is made by scripts/site/build-pages.mjs (VITE_STATIC=1).
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:8787" } },
  build: { outDir: "dist", sourcemap: true },
});
