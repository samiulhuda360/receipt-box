import { centsToDecimal, gstFromInclusive, isValidIsoDate } from "@receipt-box/shared";

import type { Extraction, ExtractedField } from "../domain";

/**
 * Turn the plain text of a receipt into fields. Used for the local OCR (Tesseract), and to normalise
 * dates and amounts that Textract returns as printed ("12/09/26", "$115.00").
 * The rules are deliberately simple and readable; every field carries a confidence so the UI can
 * point the person at what to check.
 */

const MONEY = /(?:NZ\$|\$)?\s?(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?!\d)/g;
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

export function amounts(line: string): number[] {
  return [...line.matchAll(MONEY)].map((m) => Number(m[1]!.replace(/,/g, "")) * 100 + Number(m[2]));
}

const field = (value: string, confidence: number): ExtractedField => ({ value, confidence: Math.round(confidence * 100) / 100 });

function year(y: string): number {
  const n = Number(y);
  return y.length === 2 ? 2000 + n : n;
}

/** Dates are read day-first, the New Zealand way: 03/04/26 is 3 April 2026. */
export function dateFrom(text: string): { iso: string; ambiguous: boolean } | null {
  const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const tries: Array<() => { iso: string; ambiguous: boolean } | null> = [
    () => {
      const m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
      return m ? { iso: iso(+m[1]!, +m[2]!, +m[3]!), ambiguous: false } : null;
    },
    () => {
      const m = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/.exec(text);
      if (!m) return null;
      const d = +m[1]!, mo = +m[2]!;
      return { iso: iso(year(m[3]!), mo, d), ambiguous: d <= 12 && mo <= 12 && d !== mo };
    },
    () => {
      const m = /\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?[\s-]+(\d{4}|\d{2})\b/i.exec(text);
      return m ? { iso: iso(year(m[3]!), MONTHS[m[2]!.toLowerCase()]!, +m[1]!), ambiguous: false } : null;
    },
    () => {
      const m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i.exec(text);
      return m ? { iso: iso(+m[3]!, MONTHS[m[1]!.toLowerCase()]!, +m[2]!), ambiguous: false } : null;
    },
  ];
  for (const t of tries) {
    const r = t();
    const y = r ? Number(r.iso.slice(0, 4)) : 0;
    if (r && isValidIsoDate(r.iso) && y >= 2000 && y <= new Date().getFullYear() + 1) return r;
  }
  return null;
}

function findDate(lines: string[]): ExtractedField | undefined {
  const ordered = [...lines.filter((l) => /\bdate\b/i.test(l)), ...lines];
  for (const line of ordered) {
    const d = dateFrom(line);
    if (d) return field(d.iso, (/\bdate\b/i.test(line) ? 0.9 : 0.8) - (d.ambiguous ? 0.1 : 0));
  }
  return undefined;
}

const NOT_TOTAL = /sub\s*-?\s*total|total\s*(gst|tax)|(gst|tax)\s*total|total\s+(items?|qty|savings|discount)|change|tender|cash\s+out|rounding/i;
const TOTAL_RULES: Array<[RegExp, number]> = [
  [/\b(total\s+due|amount\s+due|balance\s+due|grand\s+total|total\s+(nzd|incl|inc\b|to\s+pay))/i, 0.92],
  [/\btotal\b/i, 0.88],
  [/\b(eftpos|visa|mastercard|card|amount\s+paid|paid)\b/i, 0.6],
];

function findTotal(lines: string[]): ExtractedField | undefined {
  for (const [rule, confidence] of TOTAL_RULES) {
    const values = lines.filter((l) => rule.test(l) && !NOT_TOTAL.test(l)).flatMap((l) => amounts(l).slice(-1));
    if (values.length) return field(centsToDecimal(Math.max(...values)), confidence);
  }
  const all = lines.filter((l) => !/change|tender|cash/i.test(l)).flatMap(amounts);
  return all.length ? field(centsToDecimal(Math.max(...all)), 0.35) : undefined;
}

function findGst(lines: string[], totalCents: number | null): ExtractedField | undefined {
  const gstLines = lines.filter((l) => /\b(gst|g\.s\.t|tax)\b/i.test(l) && !/(gst|tax)\s*(no\b|number|#|reg)|tax\s+invoice/i.test(l));
  const candidates = gstLines.flatMap(amounts).filter((c) => totalCents === null || (c !== totalCents && c <= gstFromInclusive(totalCents) + 1));
  if (!candidates.length) return undefined;
  if (totalCents === null) return field(centsToDecimal(candidates[0]!), 0.6);
  const expected = gstFromInclusive(totalCents);
  const best = candidates.reduce((a, b) => (Math.abs(b - expected) < Math.abs(a - expected) ? b : a));
  return field(centsToDecimal(best), Math.abs(best - expected) <= 2 ? 0.95 : 0.7);
}

const NOT_VENDOR =
  /tax\s+invoice|receipt|invoice|\bgst\b|ph(one)?\b|\btel\b|fax|www\.|https?:|@|\.co\.nz|\.com|\b(st|street|rd|road|ave|avenue|drive|lane|place|cres|crescent|highway|hwy)\b|\d{3,}|welcome|thank/i;

function titleCase(s: string): string {
  return s === s.toUpperCase() ? s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : s;
}

function findVendor(lines: string[]): ExtractedField | undefined {
  for (const line of lines.slice(0, 6)) {
    const clean = line.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9)]+$/g, "").trim();
    // OCR invents short junk lines ("EEE", "REESE") from paper edges and shadows: a name has 4+ different letters.
    const distinctLetters = new Set(clean.toLowerCase().replace(/[^a-z]/g, "")).size;
    if (distinctLetters >= 4 && !NOT_VENDOR.test(clean)) {
      return field(titleCase(clean), clean === clean.toUpperCase() ? 0.7 : 0.6);
    }
  }
  return undefined;
}

export function parseReceiptText(text: string, ocrConfidence = 1): Omit<Extraction, "engine" | "ms"> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const total = findTotal(lines);
  const totalCents = total ? amounts(`${total.value}`)[0] ?? null : null;
  const out = { vendor: findVendor(lines), date: findDate(lines), total, gst: findGst(lines, totalCents) };
  // Scale by how clearly the OCR read the page: a blurry photo lowers every field.
  for (const f of Object.values(out)) if (f) f.confidence = Math.round(f.confidence * ocrConfidence * 100) / 100;
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v)) as Omit<Extraction, "engine" | "ms">;
}
