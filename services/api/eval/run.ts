/**
 * Score a receipt reader against the synthetic set's ground truth.
 *   npm run eval -w @receipt-box/api                       # Tesseract, runs anywhere
 *   npm run eval -w @receipt-box/api -- --engine textract  # Amazon Textract, needs AWS credentials
 * Writes eval/results-<engine>.md and prints the summary.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { TextractClient } from "@aws-sdk/client-textract";
import { parseMoney } from "@receipt-box/shared";

import type { Extractor } from "../src/domain";
import { TesseractExtractor } from "../src/extract/tesseract";
import { TextractExtractor } from "../src/extract/textract";
import type { Truth } from "./make-receipts";

const HERE = dirname(fileURLToPath(import.meta.url));
const engine = process.argv.includes("--engine") ? process.argv[process.argv.indexOf("--engine") + 1] : "tesseract";

/** Vendors match ignoring case, punctuation and macrons (OCR often reads ū as u), or when one contains the other. */
export function sameVendor(a: string | undefined, b: string): boolean {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const x = norm(a ?? "");
  const y = norm(b);
  return !!x && (x === y || x.includes(y) || y.includes(x));
}

async function main() {
  const truths = JSON.parse(readFileSync(join(HERE, "receipts", "truth.json"), "utf8")) as Truth[];
  const extractor: Extractor & { close?: () => Promise<void> } =
    engine === "textract" ? new TextractExtractor(new TextractClient({})) : new TesseractExtractor(join(HERE, "..", ".data", "tesseract"));

  const rows: Array<Truth & { vendorOk: boolean; dateOk: boolean; totalOk: boolean; gstOk: boolean; ms: number; got: string }> = [];
  for (const t of truths) {
    const ex = await extractor.extract(new Uint8Array(readFileSync(join(HERE, "receipts", t.file))), t.file.endsWith(".png") ? "image/png" : "image/jpeg");
    const total = ex.total ? parseMoney(ex.total.value) : null;
    const gst = ex.gst ? parseMoney(ex.gst.value) : null;
    const row = {
      ...t,
      vendorOk: sameVendor(ex.vendor?.value, t.vendor),
      dateOk: ex.date?.value === t.date,
      totalOk: total === t.totalCents,
      gstOk: gst === t.gstCents,
      ms: ex.ms,
      got: `${ex.vendor?.value ?? "-"} | ${ex.date?.value ?? "-"} | ${ex.total?.value ?? "-"} | ${ex.gst?.value ?? "-"}`,
    };
    rows.push(row);
    process.stdout.write(`${t.file} ${[row.vendorOk, row.dateOk, row.totalOk, row.gstOk].map((ok) => (ok ? "ok" : "--")).join(" ")}  ${row.got}\n`);
  }
  await extractor.close?.();

  const pct = (f: (r: (typeof rows)[number]) => boolean, xs = rows) => `${Math.round((xs.filter(f).length / xs.length) * 100)}%`;
  const all = (r: (typeof rows)[number]) => r.vendorOk && r.dateOk && r.totalOk && r.gstOk;
  const money = (r: (typeof rows)[number]) => r.totalOk && r.gstOk;
  const median = [...rows.map((r) => r.ms)].sort((a, b) => a - b)[Math.floor(rows.length / 2)]!;
  const layouts = [...new Set(rows.map((r) => r.layout))];

  const md = [
    `# Receipt reading: ${engine}`,
    "",
    `${rows.length} synthetic NZ receipts (\`eval/receipts\`, made by \`npm run eval:make\`). Median ${(median / 1000).toFixed(1)} s per receipt.`,
    "",
    "| Layout | Receipts | Vendor | Date | Total | GST | Total and GST both right | All four right |",
    "|---|---|---|---|---|---|---|---|",
    ...[...layouts, "all"].map((l) => {
      const xs = l === "all" ? rows : rows.filter((r) => r.layout === l);
      return `| ${l} | ${xs.length} | ${pct((r) => r.vendorOk, xs)} | ${pct((r) => r.dateOk, xs)} | ${pct((r) => r.totalOk, xs)} | ${pct((r) => r.gstOk, xs)} | ${pct(money, xs)} | ${pct(all, xs)} |`;
    }),
    "",
    "## Misses",
    "",
    "| File | Expected (vendor, date, total, GST) | Vendor read | Date read | Total read | GST read |",
    "|---|---|---|---|---|---|",
    ...rows.filter((r) => !all(r)).map((r) => `| ${r.file} | ${r.vendor}, ${r.date}, ${(r.totalCents / 100).toFixed(2)}, ${(r.gstCents / 100).toFixed(2)} | ${r.got} |`),
    "",
  ].join("\n");
  writeFileSync(join(HERE, `results-${engine}.md`), md);
  console.log(`\nall four fields right: ${pct(all)} | total+GST: ${pct(money)} | median ${median} ms -> eval/results-${engine}.md`);
}

void main();
