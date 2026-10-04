import { describe, expect, it } from "vitest";

import {
  centsToDecimal,
  formatMoney,
  gstFromInclusive,
  isValidIsoDate,
  lastTwoMonths,
  monthPeriod,
  parseMoney,
  presets,
  receiptInputSchema,
  receiptsToCsv,
  taxYear,
  uploadRequestSchema,
} from "./index";

describe("money", () => {
  it("takes GST as 3/23 of a GST-inclusive total", () => {
    expect(gstFromInclusive(11500)).toBe(1500); // $115.00 -> $15.00
    expect(gstFromInclusive(999)).toBe(130); // $9.99 -> $1.30 (rounded to the cent)
    expect(gstFromInclusive(0)).toBe(0);
  });

  it("parses what people type and rejects the rest", () => {
    expect(parseMoney("$1,234.50")).toBe(123450);
    expect(parseMoney("NZ$ 12")).toBe(1200);
    expect(parseMoney("7.5")).toBe(750);
    expect(parseMoney("12.345")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
  });

  it("formats without float drift", () => {
    expect(centsToDecimal(10)).toBe("0.10");
    expect(centsToDecimal(123456)).toBe("1234.56");
    expect(formatMoney(123456)).toBe("$1,234.56");
  });
});

describe("periods", () => {
  it("knows the NZ tax year runs April to March", () => {
    expect(taxYear("2026-03-31")).toMatchObject({ from: "2025-04-01", to: "2026-03-31" });
    expect(taxYear("2026-04-01")).toMatchObject({ from: "2026-04-01", to: "2027-03-31" });
  });

  it("handles month and year edges", () => {
    expect(monthPeriod(2026, 0)).toMatchObject({ from: "2025-12-01", to: "2025-12-31" });
    expect(monthPeriod(2028, 2)).toMatchObject({ to: "2028-02-29" }); // leap year
    expect(lastTwoMonths("2026-01-15")).toMatchObject({ from: "2025-12-01", to: "2026-01-31" });
    expect(presets("2026-10-04").map((p) => p.from)).toEqual(["2026-10-01", "2026-09-01", "2026-09-01", "2026-04-01"]);
  });

  it("validates real calendar dates only", () => {
    expect(isValidIsoDate("2026-02-28")).toBe(true);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("28/02/2026")).toBe(false);
  });
});

describe("validation", () => {
  const ok = { vendor: "Mitre 10", date: "2026-09-12", totalCents: 11500, gstCents: 1500, category: "TOOLS" as const, notes: "" };

  it("accepts a normal receipt and a GST-free one", () => {
    expect(receiptInputSchema.safeParse(ok).success).toBe(true);
    expect(receiptInputSchema.safeParse({ ...ok, gstCents: 0 }).success).toBe(true);
  });

  it("rejects GST above 15% of the price", () => {
    const r = receiptInputSchema.safeParse({ ...ok, gstCents: 2000 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["gstCents"]);
  });

  it("rejects future dates, empty vendors and fractional cents", () => {
    expect(receiptInputSchema.safeParse({ ...ok, date: "2099-01-01" }).success).toBe(false);
    expect(receiptInputSchema.safeParse({ ...ok, vendor: "  " }).success).toBe(false);
    expect(receiptInputSchema.safeParse({ ...ok, totalCents: 10.5 }).success).toBe(false);
  });

  it("only takes JPEG and PNG up to 10 MB", () => {
    expect(uploadRequestSchema.safeParse({ fileName: "a.jpg", contentType: "image/jpeg", size: 1000 }).success).toBe(true);
    expect(uploadRequestSchema.safeParse({ fileName: "a.pdf", contentType: "application/pdf", size: 1000 }).success).toBe(false);
    expect(uploadRequestSchema.safeParse({ fileName: "a.jpg", contentType: "image/jpeg", size: 11 * 1024 * 1024 }).success).toBe(false);
  });
});

describe("csv", () => {
  it("sorts by date, quotes awkward cells and defuses formulas", () => {
    const csv = receiptsToCsv([
      { id: "b", date: "2026-09-02", vendor: 'Joe\'s "Café", Ltd', category: "MEALS", totalCents: 2300, gstCents: 300, notes: "" },
      { id: "a", date: "2026-09-01", vendor: "=HYPERLINK(1)", category: "OFFICE", totalCents: 1150, gstCents: 150, notes: "pens" },
    ]);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toContain("Total incl GST (NZD)");
    expect(lines[1]).toBe("2026-09-01,'=HYPERLINK(1),Office and supplies,11.50,1.50,10.00,pens,a");
    expect(lines[2]).toBe('2026-09-02,"Joe\'s ""Café"", Ltd",Meals and entertainment,23.00,3.00,20.00,,b');
  });
});
