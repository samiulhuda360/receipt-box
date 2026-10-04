import { centsToDecimal } from "./money";
import { categoryLabel } from "./receipt";

export type CsvReceipt = {
  id: string;
  date: string | null;
  vendor: string | null;
  category: string;
  totalCents: number | null;
  gstCents: number | null;
  notes: string;
};

const HEADER = ["Date", "Vendor", "Category", "Total incl GST (NZD)", "GST (NZD)", "Total excl GST (NZD)", "Notes", "Receipt ID"];

function cell(value: string): string {
  // Quote everything that could break a row, and defuse spreadsheet formulas (CSV injection).
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** A spreadsheet-ready export: one row per reviewed receipt, oldest first, money as plain decimals. */
export function receiptsToCsv(rows: CsvReceipt[]): string {
  const sorted = [...rows].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.id.localeCompare(b.id));
  const lines = sorted.map((r) => {
    const total = r.totalCents ?? 0;
    const gst = r.gstCents ?? 0;
    return [r.date ?? "", r.vendor ?? "", categoryLabel(r.category), centsToDecimal(total), centsToDecimal(gst), centsToDecimal(total - gst), r.notes, r.id]
      .map(cell)
      .join(",");
  });
  return [HEADER.join(","), ...lines].join("\r\n") + "\r\n";
}
