/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Locally the API runs on :8787. Proxying keeps the browser on one origin, exactly like production,
// where CloudFront routes /api/* and /graphql to API Gateway (so no CORS anywhere).
const api = "http://localhost:8787";
const proxy = { "/api": api, "/graphql": api, "/local-blob": api };

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, proxy },
  preview: { port: 5173, strictPort: true, proxy },
  build: { sourcemap: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
