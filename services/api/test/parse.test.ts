import { describe, expect, it } from "vitest";

import { dateFrom, parseReceiptText } from "../src/extract/parse";

const HARDWARE = `
MITRE 10 MEGA
123 Great South Road, Penrose
Ph 09 555 0101   GST No 123-456-789
TAX INVOICE
Date: 12/09/2026  14:32
Hammer claw 16oz          29.90
Screws 8g x 50            12.50
Subtotal                  42.40
TOTAL                     42.40
Includes GST              5.53
EFTPOS                    42.40
`;

const CAFE = `
Kowhai Kitchen Cafe
www.kowhaikitchen.co.nz
3 Sep 2026
Flat white x2   11.00
Bagel           12.50
Total NZD $23.50
GST (15%) incl $3.07
Cash tendered 30.00
Change 6.50
`;

describe("parseReceiptText", () => {
  it("reads a hardware store receipt", () => {
    const r = parseReceiptText(HARDWARE);
    expect(r.vendor?.value).toBe("Mitre 10 Mega");
    expect(r.date?.value).toBe("2026-09-12");
    expect(r.total?.value).toBe("42.40");
    expect(r.gst?.value).toBe("5.53");
    expect(r.gst!.confidence).toBeGreaterThan(0.9); // 5.53 is exactly 3/23 of 42.40
  });

  it("ignores cash tendered and change, and skips website lines for the vendor", () => {
    const r = parseReceiptText(CAFE);
    expect(r.vendor?.value).toBe("Kowhai Kitchen Cafe");
    expect(r.date?.value).toBe("2026-09-03");
    expect(r.total?.value).toBe("23.50");
    expect(r.gst?.value).toBe("3.07");
  });

  it("falls back to the biggest amount with low confidence when there is no total line", () => {
    const r = parseReceiptText("Corner Dairy\nMilk 3.50\nBread 4.20\n");
    expect(r.total).toEqual({ value: "4.20", confidence: 0.35 });
  });

  it("scales confidence by OCR quality", () => {
    expect(parseReceiptText(HARDWARE, 0.5).total!.confidence).toBeCloseTo(0.44, 2);
  });
});

describe("dateFrom", () => {
  it("reads New Zealand day-first dates and flags ambiguous ones", () => {
    expect(dateFrom("03/04/26")).toEqual({ iso: "2026-04-03", ambiguous: true });
    expect(dateFrom("25/12/2025")).toEqual({ iso: "2025-12-25", ambiguous: false });
    expect(dateFrom("2026-09-30")).toEqual({ iso: "2026-09-30", ambiguous: false });
    expect(dateFrom("Sep 5, 2026")?.iso).toBe("2026-09-05");
    expect(dateFrom("31/02/2026")).toBeNull();
  });
});
