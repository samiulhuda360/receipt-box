/**
 * Reporting periods as inclusive ISO dates (yyyy-mm-dd). Plain date strings, not Date objects,
 * so a receipt dated 31 March never slides into April because of a time zone.
 */

export type Period = { id: string; label: string; from: string; to: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function isoDate(y: number, m: number, d: number): string {
  // m is 1-12; Date.UTC normalises overflow (month 13 -> January next year, day 0 -> last day of previous month)
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}

function lastDay(y: number, m: number): string {
  return isoDate(y, m + 1, 0);
}

export function todayIso(now = new Date()): string {
  return isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function monthPeriod(y: number, m: number): Period {
  const first = isoDate(y, m, 1);
  const [yy, mm] = first.split("-").map(Number) as [number, number];
  return { id: `m-${first.slice(0, 7)}`, label: `${MONTHS[mm - 1]} ${yy}`, from: first, to: lastDay(yy, mm) };
}

/** The NZ income tax year runs 1 April to 31 March. */
export function taxYear(today: string): Period {
  const [y, m] = today.split("-").map(Number) as [number, number];
  const start = m >= 4 ? y : y - 1;
  return { id: `ty-${start + 1}`, label: `Tax year ${start}/${String(start + 1).slice(2)}`, from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

/** Two calendar months ending with the current month: the shape of a two-monthly GST return. */
export function lastTwoMonths(today: string): Period {
  const [y, m] = today.split("-").map(Number) as [number, number];
  const from = isoDate(y, m - 1, 1);
  const [fy, fm] = from.split("-").map(Number) as [number, number];
  return { id: `2m-${today.slice(0, 7)}`, label: `${MONTHS[fm - 1]} ${fy} - ${MONTHS[m - 1]} ${y}`, from, to: lastDay(y, m) };
}

export function presets(today: string): Period[] {
  const [y, m] = today.split("-").map(Number) as [number, number];
  return [monthPeriod(y, m), monthPeriod(y, m - 1), lastTwoMonths(today), taxYear(today)];
}

export function inPeriod(date: string | null | undefined, period: Pick<Period, "from" | "to">): boolean {
  return !!date && date >= period.from && date <= period.to;
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  return isoDate(y, m, d) === value;
}
