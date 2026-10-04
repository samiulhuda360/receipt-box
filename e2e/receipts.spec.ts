import { readFileSync } from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const RECEIPT = "services/api/eval/receipts/01.png"; // Kauri Hardware, 13 June 2026, $292.85 incl $38.20 GST

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Continue as demo user" }).click();
  await expect(page.getByRole("heading", { name: "Add receipts" })).toBeVisible();
}

async function noSeriousA11yIssues(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.length} element(s)`)).toEqual([]);
}

test("upload a receipt, check what was read, and export it", async ({ page }) => {
  await signIn(page);
  await page.getByTestId("file-input").setInputFiles(RECEIPT);

  // The browser posts straight to storage; the processor reads it and the inbox updates by itself.
  const row = page.getByRole("listitem").filter({ hasText: "Kauri Hardware" });
  await expect(row.getByText("Check me")).toBeVisible({ timeout: 60_000 });
  await noSeriousA11yIssues(page);

  await row.getByRole("link", { name: "Check Kauri Hardware" }).click();
  await expect(page.getByLabel("Vendor")).toHaveValue("Kauri Hardware");
  await expect(page.getByLabel("Date")).toHaveValue("2026-06-13");
  await expect(page.getByLabel("Total incl GST ($)")).toHaveValue("292.85");
  await expect(page.getByLabel("GST ($)", { exact: true })).toHaveValue("38.20");
  await noSeriousA11yIssues(page);

  await page.getByLabel("Category").selectOption({ label: "Tools and equipment" });
  await page.getByRole("button", { name: "Looks right, save" }).click();

  // Back on the list: nothing left to check, and the receipt counts in the tax year's totals.
  await expect(page.getByText("Nothing to check.")).toBeVisible();
  await page.getByRole("combobox", { name: "Period" }).selectOption({ label: "Tax year 2026/27" });
  await expect(page.getByRole("row", { name: /Kauri Hardware/ })).toContainText("$292.85");
  await expect(page.getByText("GST to claim").locator("..")).toContainText("$38.20");

  await page.getByRole("link", { name: "Export" }).click();
  await page.getByRole("combobox", { name: "Period" }).selectOption({ label: "Tax year 2026/27" });
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download CSV" }).click()]);
  const csv = readFileSync(await download.path(), "utf8");
  expect(csv).toContain("2026-06-13,Kauri Hardware,Tools and equipment,292.85,38.20,254.65");
});

test("an unreadable file can still be entered by hand", async ({ page }) => {
  await signIn(page);
  await page.getByTestId("file-input").setInputFiles({ name: "smudged.png", mimeType: "image/png", buffer: Buffer.from("not really an image") });

  const row = page.getByRole("listitem").filter({ hasText: "smudged.png" });
  await expect(row.getByText("Enter by hand")).toBeVisible({ timeout: 60_000 });
  await row.getByRole("link").click();
  await expect(page.getByText("We couldn't read this receipt. Enter the details by hand.")).toBeVisible();

  await page.getByLabel("Vendor").fill("Corner Dairy");
  await page.getByLabel("Date").fill("2026-09-30");
  await page.getByLabel("Total incl GST ($)").fill("23.00");
  await page.getByRole("button", { name: "Set GST to 15% of the total" }).click();
  await expect(page.getByLabel("GST ($)", { exact: true })).toHaveValue("3.00");
  await page.getByRole("button", { name: "Looks right, save" }).click();
  await expect(page.getByText("Nothing to check.")).toBeVisible();
});

test("refuses files it can't read, before uploading", async ({ page }) => {
  await signIn(page);
  await page.getByTestId("file-input").setInputFiles({ name: "invoice.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7") });
  await expect(page.getByRole("alert")).toHaveText("invoice.pdf: only JPEG and PNG photos");
});
