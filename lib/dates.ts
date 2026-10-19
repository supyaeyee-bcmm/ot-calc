// Dates are plain "YYYY-MM-DD" strings; Date objects here are UTC-only to avoid timezone shifts.

const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(s: string, n: number): string {
  const d = parse(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

export const dow = (s: string) => parse(s).getUTCDay();

/** First day of the 7-day week containing `s`; startDay 0 = Sunday (company default) … 6 = Saturday. */
export const weekStart = (s: string, startDay = 0) => addDays(s, -((dow(s) - startDay + 7) % 7));

/** Whole days from a to b (b − a). */
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);

export function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Salary month "YYYY-MM" covers the 26th of the previous month to the 25th. */
export function periodRange(p: string): { start: string; end: string } {
  const [y, m] = p.split("-").map(Number);
  return { start: fmt(new Date(Date.UTC(y, m - 2, 26))), end: fmt(new Date(Date.UTC(y, m - 1, 25))) };
}

export function periodOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return d >= 26 ? new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7) : date.slice(0, 7);
}

export function shiftPeriod(p: string, n: number): string {
  const [y, m] = p.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function fmtShort(s: string): string {
  const [, m, d] = s.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

export function periodLabel(p: string): string {
  const [y, m] = p.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y} salary`;
}
