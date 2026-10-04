/**
 * Generate the evaluation set: 30 synthetic New Zealand receipts with known answers.
 *   npm run eval:make -w @receipt-box/api
 * Rendered by headless Chromium from HTML in three layouts (thermal till slip, cafe docket, tax invoice),
 * with fictional vendors, NZ date formats, 15% GST, and noise: slight rotation, blur and JPEG compression.
 * Synthetic data has no personal information and exact ground truth; real photos are harder (see README).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import { centsToDecimal, gstFromInclusive } from "@receipt-box/shared";

export type Truth = { file: string; layout: string; vendor: string; date: string; totalCents: number; gstCents: number };

const OUT = join(dirname(fileURLToPath(import.meta.url)), "receipts");
const VENDORS = [
  "Kauri Hardware",
  "Harbourside Fuel",
  "Tūī Stationery",
  "Pōhutukawa Café",
  "Southern Cross Pharmacy",
  "Ruru Tech Supplies",
  "Matai Motors",
  "Kea Office Co",
  "Fantail Printing",
  "Rimu Timber Yard",
];
const ITEMS = ["Screws 8g x 50", "Printer paper A4", "Flat white", "Fuel 91", "USB-C cable", "Masking tape", "Notebook", "Bagel", "Toner cartridge", "Timber 90x45"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Deterministic randomness, so the set is the same every time it is generated.
let seed = 20261004;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
const money = (c: number) => centsToDecimal(c);

function receipt(i: number): { truth: Truth; html: string; type: "png" | "jpeg" } {
  const layout = ["thermal", "cafe", "invoice"][i % 3]!;
  const vendor = VENDORS[i % VENDORS.length]!;
  const d = 1 + Math.floor(rand() * 28);
  const m = 1 + Math.floor(rand() * 9);
  const date = `2026-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const lines = Array.from({ length: 2 + Math.floor(rand() * 4) }, () => ({ name: pick(ITEMS), cents: 150 + Math.floor(rand() * 9000) }));
  const totalCents = lines.reduce((s, l) => s + l.cents, 0);
  const gstCents = gstFromInclusive(totalCents);
  const rows = lines.map((l) => `<tr><td>${l.name}</td><td class="r">${money(l.cents)}</td></tr>`).join("");
  const dd = String(d).padStart(2, "0");
  const mm = String(m).padStart(2, "0");

  const body = {
    thermal: `<div class="c b">${vendor.toUpperCase()}</div><div class="c">${10 + i} Queen Street, Auckland</div><div class="c">GST No: 1${i}2-345-678</div>
      <div class="c b">TAX INVOICE</div><p>Date: ${dd}/${mm}/2026 ${10 + (i % 8)}:${String(i * 7 % 60).padStart(2, "0")}</p>
      <table>${rows}<tr class="sep"><td>Subtotal</td><td class="r">${money(totalCents)}</td></tr><tr class="b"><td>TOTAL</td><td class="r">${money(totalCents)}</td></tr>
      <tr><td>Includes GST</td><td class="r">${money(gstCents)}</td></tr><tr><td>EFTPOS</td><td class="r">${money(totalCents)}</td></tr></table><div class="c">Thank you!</div>`,
    cafe: `<h1>${vendor}</h1><div class="s">www.${vendor.toLowerCase().replace(/[^a-z]/g, "")}.co.nz</div><p>${d} ${MONTHS[m - 1]} 2026</p>
      <table>${rows}</table><p class="b">Total NZD $${money(totalCents)}</p><p>GST (15%) incl $${money(gstCents)}</p>
      <p>Cash tendered ${money(Math.ceil(totalCents / 1000) * 1000)}</p>`,
    invoice: `<h1>${vendor}</h1><div class="s">PO Box ${100 + i}, Wellington · Ph 04 555 0${100 + i}</div><h2>Tax invoice</h2><p>Date: 2026-${mm}-${dd}</p>
      <table>${rows}<tr class="sep"><td>Subtotal (excl GST)</td><td class="r">${money(totalCents - gstCents)}</td></tr>
      <tr><td>GST 15%</td><td class="r">${money(gstCents)}</td></tr><tr class="b"><td>Amount due</td><td class="r">$${money(totalCents)}</td></tr></table>`,
  }[layout]!;

  const font = { thermal: "'Courier New', monospace", cafe: "Georgia, serif", invoice: "Arial, sans-serif" }[layout];
  const rotate = (rand() * 4 - 2).toFixed(2);
  const blur = (rand() * 0.6).toFixed(2);
  const html = `<html><body style="margin:0;background:#cfc8bb;padding:28px">
    <div id="r" style="width:${layout === "invoice" ? 420 : 330}px;background:#fdfcf8;padding:22px 20px;font:15px/1.45 ${font};color:#222;transform:rotate(${rotate}deg);filter:blur(${blur}px);box-shadow:0 2px 8px #0003">
    <style>table{width:100%;border-collapse:collapse}.r{text-align:right}.c{text-align:center}.b{font-weight:bold}.s{font-size:12px;color:#555}
    h1{font-size:21px;margin:0 0 4px}h2{font-size:16px;margin:12px 0}.sep td{border-top:1px dashed #999;padding-top:4px}</style>${body}</div></body></html>`;
  const type = i % 4 === 3 ? "jpeg" : "png";
  return { truth: { file: `${String(i + 1).padStart(2, "0")}.${type === "jpeg" ? "jpg" : "png"}`, layout, vendor, date, totalCents, gstCents }, html, type };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1.5 });
  const truths: Truth[] = [];
  for (let i = 0; i < 30; i++) {
    const { truth, html, type } = receipt(i);
    await page.setContent(html);
    await page.locator("#r").screenshot({ path: join(OUT, truth.file), type, ...(type === "jpeg" ? { quality: 72 } : {}) });
    truths.push(truth);
  }
  await browser.close();
  writeFileSync(join(OUT, "truth.json"), JSON.stringify(truths, null, 1));
  console.log(`wrote ${truths.length} receipts to ${OUT}`);
}

void main();
