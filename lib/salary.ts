import "server-only";

// Salary is secret: read from .env.local on the server only, never sent to the browser.
// SALARY_HISTORY=[{"from":"2026-01-01","amount":1000000}, ...]  (add a row when salary changes)
type SalaryEntry = { from: string; amount: number };

function history(): SalaryEntry[] {
  try {
    const list = JSON.parse(process.env.SALARY_HISTORY ?? "[]") as SalaryEntry[];
    return list.filter((s) => s.from && s.amount > 0).sort((a, b) => a.from.localeCompare(b.from));
  } catch {
    return [];
  }
}

/** Base hourly = salary ÷ (30 days × 8 hr), using the salary valid on that date. */
export function baseHourlyOn(date: string): number | null {
  let amount: number | null = null;
  for (const s of history()) if (s.from <= date) amount = s.amount;
  return amount === null ? null : amount / 240;
}
