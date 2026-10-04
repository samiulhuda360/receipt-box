/**
 * Money is stored and sent as integer cents (NZD). Floats never touch an amount, so totals
 * always add up to the cent.
 */

/** NZ GST is 15%. On a GST-inclusive amount the GST share is 15/115 = 3/23. */
export const GST_RATE = 0.15;

export function gstFromInclusive(totalCents: number): number {
  return Math.round((totalCents * 3) / 23);
}

export function exclusiveOf(totalCents: number, gstCents: number): number {
  return totalCents - gstCents;
}

/** "$1,234.50", "1234.5", "NZ$ 12" -> cents; anything else -> null. */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/NZ\$|\$|,|\s/gi, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole = "0", frac = ""] = cleaned.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return cleaned.startsWith("-") ? -cents : cents;
}

const nzd = new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" });

export function formatMoney(cents: number): string {
  return nzd.format(cents / 100);
}

/** Plain "1234.50" for CSV files and form inputs. */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
