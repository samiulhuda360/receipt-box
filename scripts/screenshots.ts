/**
 * README screenshots, taken from the real app in local mode with synthetic receipts.
 * Start the stack first (`npm run dev` with RESET_DATA=1 for the API), then: npx tsx scripts/screenshots.ts
 */
import { readFileSync } from "node:fs";

import { chromium, type Page } from "@playwright/test";

type Truth = { file: string; vendor: string; date: string };
const BASE = "http://localhost:5173";
const OUT = "docs/screenshots";
const CATEGORY: Record<string, string> = {
  "Kauri Hardware": "Tools and equipment",
  "Harbourside Fuel": "Vehicle and fuel",
  "Pōhutukawa Café": "Meals and entertainment",
  "Southern Cross Pharmacy": "Other",
  "Ruru Tech Supplies": "Office and supplies",
  "Matai Motors": "Vehicle and fuel",
  "Kea Office Co": "Office and supplies",
  "Fantail Printing": "Professional services",
  "Rimu Timber Yard": "Tools and equipment",
};
// Receipts the local OCR reads perfectly (see eval/results-tesseract.md), dated inside tax year 2026/27.
const MISREAD = new Set(["03.png", "16.jpg", "19.png", "23.png", "24.jpg"]);
const plain = (s: string) => s === s.normalize("NFD").replace(/[̀-ͯ]/g, ""); // OCR drops macrons and accents
const truths = (JSON.parse(readFileSync("services/api/eval/receipts/truth.json", "utf8")) as Truth[]).filter(
  (t, i, all) => t.date >= "2026-04-01" && !MISREAD.has(t.file) && CATEGORY[t.vendor] && plain(t.vendor) && all.findIndex((x) => x.vendor === t.vendor && x.date >= "2026-04-01" && !MISREAD.has(x.file)) === i,
);
const toReview = truths.slice(0, 6);
const leaveInInbox = truths.slice(6, 8);

async function waitForInbox(page: Page, count: number) {
  await page.waitForFunction((n) => document.querySelectorAll(".inbox .chip-warn").length >= n, count, { timeout: 120_000 });
}

const browser = await chromium.launch({ args: ["--lang=en-NZ"] }); // date inputs follow the browser language
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1.5, locale: "en-NZ" });
const page = await context.newPage();
await page.goto(BASE);
await page.getByRole("button", { name: "Continue as demo user" }).click();

const files = [...toReview, ...leaveInInbox].map((t) => `services/api/eval/receipts/${t.file}`);
await page.getByTestId("file-input").setInputFiles(files);
await waitForInbox(page, files.length);

for (const t of toReview) {
  await page.goto(`${BASE}/`);
  await page.getByRole("link", { name: `Check ${t.vendor}` }).click();
  await page.getByLabel("Category").selectOption({ label: CATEGORY[t.vendor]! });
  await page.getByRole("button", { name: "Looks right, save" }).click();
  await page.waitForURL(`${BASE}/`);
}

const taxYear = async (p: Page) => {
  await p.getByRole("combobox", { name: "Period" }).selectOption({ label: "Tax year 2026/27" });
  await p.waitForTimeout(800);
};

await page.goto(`${BASE}/`);
await taxYear(page);
await page.screenshot({ path: `${OUT}/receipts.png`, fullPage: true });

await page.getByRole("link", { name: `Check ${leaveInInbox[0]!.vendor}` }).click();
await page.getByLabel("Vendor").waitFor();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/review.png` });

await page.getByRole("link", { name: "Export" }).click();
await taxYear(page);
await page.screenshot({ path: `${OUT}/export.png` });

const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "en-NZ", storageState: await context.storageState() });
const mobile = await phone.newPage();
await mobile.goto(`${BASE}/`);
await taxYear(mobile);
await mobile.screenshot({ path: `${OUT}/mobile.png` });

const dark = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1.5, locale: "en-NZ", colorScheme: "dark", storageState: await context.storageState() });
const night = await dark.newPage();
await night.goto(`${BASE}/`);
await taxYear(night);
await night.screenshot({ path: `${OUT}/dark.png` });

await browser.close();
console.log(`screenshots in ${OUT}: reviewed ${toReview.map((t) => t.vendor).join(", ")}; left ${leaveInInbox.map((t) => t.vendor).join(", ")}`);
