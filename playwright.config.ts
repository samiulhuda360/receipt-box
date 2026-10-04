import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the real app in local mode: the React app (Vite) and the API with the
 * same handlers as Lambda, real OCR (Tesseract), a folder for S3 and a JSON file for DynamoDB.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:5173", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run start -w @receipt-box/api",
      url: "http://localhost:8787/health",
      env: { RESET_DATA: "1", PORT: "8787", POWERTOOLS_LOG_LEVEL: "WARN" },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "npm run dev -w @receipt-box/web",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
