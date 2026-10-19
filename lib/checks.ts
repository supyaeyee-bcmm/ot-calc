import { fmtHM, fmtMMK } from "./time";
import { AllowanceKind, AllowanceRequest, BAND_BONUS, DayResult, OtRequest, RequestCheck, TaxiRequest } from "./types";

// Request checker: what the app expects you to submit in Bamawl for a day, compared with what you did.
// Bamawl split (see CLAUDE.md): OT request = hours × (base + 1,000); allowance request = the rest of the
// band bonus; exchanged hours = no OT request, full bonus as "… for Substitute Leave".

export const ALLOWANCE_LABEL: Record<AllowanceKind, string> = {
  holiday: "Sat/Sun/holiday",
  holiday_midnight: "weekend mid-night",
  weekday_midnight: "weekday mid-night",
  substitute: "substitute leave",
  unknown: "unknown",
};

/** Sort an allowance name into a type by keywords (exact names vary). */
export function allowanceKind(name: string): AllowanceKind {
  const n = name.toLowerCase().replace(/&/g, "and");
  if (n.includes("substitute")) return "substitute";
  if (/mid-?night/.test(n)) return /weekend|holiday|sat|sun/.test(n) ? "holiday_midnight" : "weekday_midnight";
  if (/holiday|sat|sun|no ?shift/.test(n)) return "holiday";
  return "unknown";
}

/** Allowance rate per hour for a type (substitute depends on the day). */
function rateOf(kind: AllowanceKind, off: boolean): number {
  if (kind === "holiday") return 1000;
  if (kind === "holiday_midnight") return 3000;
  if (kind === "weekday_midnight") return 2000;
  if (kind === "substitute") return off ? 2000 : 1000;
  return 0;
}

type Expect = { minutes: number; amount: number };

/** Allowance requests this day should have, by type. Exchanged minutes come from early/regular first. */
export function expectedAllowances(d: DayResult): Partial<Record<AllowanceKind, Expect>> {
  const off = d.dayType !== "weekday";
  const bonus = BAND_BONUS[off ? "off" : "weekday"];
  const earlyReg = d.bands.early + d.bands.regular;
  const exER = Math.min(d.exchangedMinutes, earlyReg);
  const exMid = d.exchangedMinutes - exER;
  const out: Partial<Record<AllowanceKind, Expect>> = {};
  const add = (k: AllowanceKind, minutes: number, perHour: number) => {
    if (minutes > 0) out[k] = { minutes, amount: Math.round((minutes / 60) * perHour) };
  };
  if (d.exchangedMinutes > 0) {
    out.substitute = { minutes: d.exchangedMinutes, amount: Math.round((exER * bonus.regular + exMid * bonus.midnight) / 60) };
  }
  if (off) {
    add("holiday", earlyReg - exER, 1000);
    add("holiday_midnight", d.bands.midnight - exMid, 3000);
  } else {
    add("weekday_midnight", d.bands.midnight - exMid, 2000);
  }
  return out;
}

type Ctx = {
  otRequests: OtRequest[];
  allowances: AllowanceRequest[];
  taxi: TaxiRequest[];
  taxiFee: number; // reference fee
  baseHourlyOn: (date: string) => number | null;
  today: string;
  getDay: (date: string) => DayResult; // any date, for allowance requests that cover several days
};

const close = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;

export function checkDay(d: DayResult, ctx: Ctx): RequestCheck[] {
  const checks: RequestCheck[] = [];
  const past = d.date < ctx.today; // "missing" only once the day is over
  const off = d.dayType !== "weekday";

  // --- OT request: payable hours (after exchange) at base + 1,000
  const reqs = ctx.otRequests.filter((r) => r.date === d.date);
  for (const r of reqs.filter((x) => x.rejected)) {
    checks.push({ kind: "ot", label: "OT request", status: "rejected", expected: "", submitted: fmtHM(r.minutes), note: r.status || "rejected", expectedAmount: null, submittedAmount: r.amount, secretAmount: true });
  }
  const okReqs = reqs.filter((r) => !r.rejected);
  const expMin = d.payableMinutes;
  if (expMin > 0 || okReqs.length) {
    const base = ctx.baseHourlyOn(d.date);
    const expAmt = base === null ? null : Math.round((expMin / 60) * (base + 1000));
    const subMin = okReqs.reduce((n, r) => n + r.minutes, 0);
    const subAmt = okReqs.some((r) => r.amount === null) ? null : okReqs.reduce((n, r) => n + (r.amount ?? 0), 0);
    let status: RequestCheck["status"];
    let note = "";
    if (!okReqs.length) {
      status = past ? "missing" : "info";
      note = past ? "not submitted" : "submit after the day";
    } else if (expMin === 0) {
      status = "extra";
      note = "app shows no OT this day";
    } else if (subMin !== expMin) {
      status = "wrong";
      note = `sent ${fmtHM(subMin)}, app says ${fmtHM(expMin)}`;
    } else if (expAmt !== null && subAmt !== null && !close(subAmt, expAmt, 2 * okReqs.length)) {
      status = "wrong";
      note = "amount differs";
    } else status = "ok";
    checks.push({ kind: "ot", label: "OT request", status, expected: fmtHM(expMin), submitted: okReqs.length ? fmtHM(subMin) : "", note, expectedAmount: expAmt, submittedAmount: subAmt, secretAmount: true });
  }

  // --- Allowance requests, by type
  const exp = expectedAllowances(d);
  const covering = ctx.allowances.filter((a) => a.dates.includes(d.date));
  for (const a of covering.filter((x) => x.rejected)) {
    checks.push({ kind: "allowance", label: `Allowance – ${ALLOWANCE_LABEL[a.kind]}`, status: "rejected", expected: "", submitted: a.amount === null ? "" : fmtMMK(a.amount), note: a.status || "rejected", expectedAmount: null, submittedAmount: a.amount, secretAmount: false });
  }
  const good = covering.filter((a) => !a.rejected);
  const kinds = new Set<AllowanceKind>([...(Object.keys(exp) as AllowanceKind[]), ...good.map((a) => a.kind)]);
  for (const k of Array.from(kinds)) {
    const label = `Allowance – ${ALLOWANCE_LABEL[k]}`;
    const rate = rateOf(k, off);
    const e = exp[k];
    const subs = good.filter((a) => a.kind === k);
    if (k === "unknown") {
      for (const a of subs) checks.push({ kind: "allowance", label: `Allowance "${a.name}"`, status: "info", expected: "", submitted: a.amount === null ? "" : fmtMMK(a.amount), note: "unknown allowance name — can't check", expectedAmount: null, submittedAmount: a.amount, secretAmount: false });
      continue;
    }
    if (!subs.length) {
      if (e) checks.push({ kind: "allowance", label, status: past ? "missing" : "info", expected: `${fmtHM(e.minutes)} × ${fmtMMK(rate)}`, submitted: "", note: past ? "not submitted" : "submit after the day", expectedAmount: e.amount, submittedAmount: null, secretAmount: false });
      continue;
    }
    for (const a of subs) {
      // A request can cover several days: compare its total with the total expected for all its days.
      const expTotal = a.dates.reduce((n, dt) => n + (expectedAllowances(ctx.getDay(dt))[k]?.amount ?? 0), 0);
      const subHours = a.amount !== null && rate ? Math.round((a.amount / rate) * 60) : null;
      let status: RequestCheck["status"] = "ok";
      let note = a.dates.length > 1 ? `one request for ${a.dates.length} days` : "";
      if (expTotal === 0) {
        status = "extra";
        note = "app expects no such allowance this day";
      } else if (a.amount === null || !close(a.amount, expTotal, a.dates.length)) {
        status = "wrong";
        note = `sent ${a.amount === null ? "?" : fmtMMK(a.amount)}, app says ${fmtMMK(expTotal)}`;
      }
      if (a.payment && !/^pay/i.test(a.payment)) note = `${note ? note + "; " : ""}payment: ${a.payment}`;
      checks.push({
        kind: "allowance",
        label,
        status,
        expected: e ? `${fmtHM(e.minutes)} × ${fmtMMK(rate)}` : "",
        submitted: subHours === null ? "" : `${fmtHM(subHours)} × ${fmtMMK(rate)}`,
        note,
        expectedAmount: expTotal,
        submittedAmount: a.amount,
        secretAmount: false,
      });
    }
  }

  // --- Taxi fee: optional, only for office OT ending at 19:00 or later; fee should match the reference
  const taxis = ctx.taxi.filter((t) => t.date === d.date);
  for (const t of taxis) {
    const fee = t.fee === null ? "?" : fmtMMK(t.fee);
    let status: RequestCheck["status"] = "ok";
    const notes: string[] = [];
    if (t.rejected) {
      status = "rejected";
      notes.push(t.deniedReason || t.status || "rejected");
    } else {
      if (!d.taxi.eligible) {
        status = "extra";
        notes.push("office OT didn't end at 19:00 or later");
      }
      if (t.fee !== ctx.taxiFee) {
        status = status === "ok" ? "wrong" : status;
        notes.push(`fee ${fee} ≠ usual ${fmtMMK(ctx.taxiFee)}`);
      }
      if (t.status) notes.push(t.status);
    }
    checks.push({ kind: "taxi", label: "Taxi request", status, expected: d.taxi.eligible ? fmtMMK(ctx.taxiFee) : "", submitted: fee, note: notes.join(" · "), expectedAmount: ctx.taxiFee, submittedAmount: t.fee, secretAmount: false });
  }
  if (d.taxi.eligible && !taxis.length && past) {
    checks.push({ kind: "taxi", label: "Taxi request", status: "info", expected: fmtMMK(ctx.taxiFee), submitted: "", note: "not requested (optional)", expectedAmount: ctx.taxiFee, submittedAmount: null, secretAmount: false });
  }

  // --- Substitute leave on the rest day of an exchange (leave requests aren't imported yet)
  for (const x of d.restFor) {
    checks.push({ kind: "leave", label: "Leave – Substitute Leave", status: "info", expected: `${x.hours}h rest`, submitted: "", note: `for OT on ${x.otDate} — not checked`, expectedAmount: null, submittedAmount: null, secretAmount: false });
  }
  return checks;
}
