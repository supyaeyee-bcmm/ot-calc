import { addDays, daysBetween, dow, eachDate, periodRange, todayLocal, weekStart } from "./dates";
import { toMin } from "./time";
import { checkDay } from "./checks";
import {
  Band,
  BandMinutes,
  BamawlDay,
  DayNote,
  DayResult,
  DayType,
  AllowanceRequest,
  BAND_BONUS,
  TaxiRequest,
  Entry,
  Exchange,
  MonthResult,
  OfficeClaim,
  OtRequest,
  Segment,
  Settings,
  WeekResult,
} from "./types";

// Company OT rule: hourly = salary ÷ 240 + bonus per band (BAND_BONUS).

/** Taxi fee only when office OT ends at or after 19:00 (handbook p.32). */
const TAXI_FROM = 19 * 60;

const emptyBands = (): BandMinutes => ({ early: 0, regular: 0, midnight: 0 });

/** Early 05:00–08:00, mid-night 22:00–05:00, regular otherwise. */
function bandOf(minute: number): Band {
  const t = ((minute % 1440) + 1440) % 1440;
  if (t >= 300 && t < 480) return "early";
  if (t >= 1320 || t < 300) return "midnight";
  return "regular";
}

function bandMinutes(segs: Segment[]): BandMinutes {
  const b = emptyBands();
  for (const s of segs) for (let m = s.start; m < s.end; m++) b[bandOf(m)]++;
  return b;
}

const len = (segs: Segment[]) => segs.reduce((n, s) => n + s.end - s.start, 0);

/** Remove [a, b) from a segment. */
function cut(seg: Segment, a: number, b: number): Segment[] {
  if (seg.end <= a || seg.start >= b) return [seg];
  const out: Segment[] = [];
  if (seg.start < a) out.push({ ...seg, end: a });
  if (seg.end > b) out.push({ ...seg, start: b });
  return out;
}

function merge(segs: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of [...segs].sort((x, y) => x.start - y.start)) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) {
      last.end = Math.max(last.end, s.end);
      if (last.source !== s.source) last.source = "mixed";
    } else out.push({ ...s });
  }
  return out;
}

/** Drop `minutes` from the end of the day (flooring cuts the last minutes worked). */
function trimEnd(segs: Segment[], minutes: number): Segment[] {
  const out = segs.map((s) => ({ ...s }));
  for (let i = out.length - 1; i >= 0 && minutes > 0; i--) {
    const t = Math.min(out[i].end - out[i].start, minutes);
    out[i].end -= t;
    minutes -= t;
  }
  return out.filter((s) => s.end > s.start);
}

/** Longest run of consecutive OT; on off days the lunch gap does not break a run. */
function longestBlock(segs: Segment[], bridge: [number, number] | null): number {
  let best = 0;
  let run = 0;
  let prevEnd = -1;
  for (const s of segs) {
    const joined = s.start === prevEnd || (bridge !== null && prevEnd >= bridge[0] && s.start <= bridge[1] && s.start > prevEnd);
    run = (joined ? run : 0) + (s.end - s.start);
    best = Math.max(best, run);
    prevEnd = s.end;
  }
  return best;
}

/** Suggest 4h/8h exchange blocks that bring `excess` minutes back under the limit. */
function exchangeHint(excess: number): number[] {
  const out: number[] = [];
  for (let r = excess; r > 0; ) {
    const h = r > 240 ? 8 : 4;
    out.push(h);
    r -= h * 60;
  }
  return out;
}

/** Elec for a day: the manual value, else alternate on/off from the last manual day before it. */
function elecFor(date: string, notes: Record<string, DayNote>): { on: boolean | null; auto: boolean } {
  const own = notes[date]?.elecOn;
  if (own === true || own === false) return { on: own, auto: false };
  let last: DayNote | null = null;
  for (const n of Object.values(notes)) {
    if ((n.elecOn === true || n.elecOn === false) && n.date < date && (!last || n.date > last.date)) last = n;
  }
  if (!last) return { on: null, auto: false };
  const odd = daysBetween(last.date, date) % 2 === 1;
  return { on: odd ? !last.elecOn : (last.elecOn as boolean), auto: true };
}

/** A typed time conflicts when Bamawl now has a different time the user hasn't chosen to ignore. */
function conflict(typed?: string | null, bamawl?: string | null, kept?: string | null): boolean {
  return !!typed && !!bamawl && typed !== bamawl && kept !== bamawl;
}

function span(start: string, end: string): [number, number] {
  const s = toMin(start) ?? 0;
  let e = toMin(end) ?? 0;
  if (e <= s) e += 1440;
  return [s, e];
}

type Ctx = {
  settings: Settings;
  bamawl: Record<string, BamawlDay>;
  entries: Entry[];
  notes: Record<string, DayNote>;
  requests: OtRequest[];
  allowances: AllowanceRequest[];
  taxi: TaxiRequest[];
  exchanges: Exchange[];
  baseHourlyOn: (date: string) => number | null;
  today: string;
  period: { start: string; end: string };
};

export function calcDay(date: string, ctx: Ctx): DayResult {
  const { settings } = ctx;
  const b = ctx.bamawl[date] ?? null;
  const entries = ctx.entries.filter((e) => e.date === date).sort((x, y) => x.start.localeCompare(y.start));
  const d = dow(date);
  const dayType: DayType = b?.holiday ? "holiday" : d === 0 || d === 6 ? "weekend" : "weekday";
  const off = dayType !== "weekday";
  const workStart = toMin(settings.workStart) ?? 480;
  const workEnd = toMin(settings.workEnd) ?? 1020;
  const lunchStart = 12 * 60;
  const warnings: string[] = [];
  const infos: string[] = [];

  const raw: Segment[] = [];
  const unclaimed: Segment[] = [];
  const note = ctx.notes[date] ?? null;

  // OT requests submitted in Bamawl for this day (rejected ones don't count).
  const reqs = ctx.requests.filter((r) => r.date === date && !r.rejected);
  const submitted = reqs.length
    ? {
        minutes: reqs.reduce((n, r) => n + r.minutes, 0),
        amount: reqs.some((r) => r.amount === null) ? null : reqs.reduce((n, r) => n + (r.amount ?? 0), 0),
        items: reqs.map((r) => ({ status: r.status, remark: r.remark, minutes: r.minutes })),
      }
    : null;

  // Office IN/OUT: Bamawl, or typed by hand when Bamawl has none (marked as not Bamawl).
  const inManual = !!note?.inOverride;
  const outManual = !!note?.outOverride;
  // HR-adjusted day: Bamawl holds the time HR asked for, not the real one. Real times are the typed
  // ones (+ home entries); with nothing typed, the Bamawl office time is not used at all.
  const hrAdjusted = !!note?.hrAdjusted;
  const useBamawl = !hrAdjusted || inManual || outManual;
  const inTime = note?.inOverride || (useBamawl ? b?.inTime : null) || null;
  const outTime = note?.outOverride || (useBamawl ? b?.outTime : null) || null;
  // Office time, unless an office entry replaces it for this day.
  let officeClaim: OfficeClaim = "none";
  const officeOverride = entries.some((e) => e.place === "office");
  if (officeOverride && inTime) infos.push("Office entry replaces Bamawl times");
  if (!officeOverride && inTime && outTime) {
    const [s, e] = span(inTime, outTime);
    if (off) {
      // Weekend/holiday: whole day is OT, minus lunch 12:00–13:00.
      officeClaim = "offday";
      raw.push(...cut({ source: "office", start: s, end: e }, lunchStart, lunchStart + settings.weekendLunchMinutes));
    } else if (e - workEnd >= settings.floorMinutes) {
      // Leaving a few minutes late (OUT before 17:15) is ignored: less than one floor step, never OT.
      // Weekday time after work end counts only when claimed: OT request in Bamawl, or set by hand.
      const seg: Segment = { source: "office", start: Math.max(s, workEnd), end: e };
      const manual = note?.claimOffice ?? null;
      officeClaim = manual === true ? "manual_yes" : manual === false ? "manual_no" : submitted ? "request" : "unclaimed";
      if (officeClaim === "manual_yes" || officeClaim === "request") raw.push(seg);
      else unclaimed.push(seg);
    } else if (hrAdjusted && e > workEnd) {
      // HR-adjusted day: HR's total includes even a few minutes after work end (e.g. OUT 17:03 → 0:03).
      raw.push({ source: "office", start: Math.max(s, workEnd), end: e });
    }
  }
  if (inTime && !outTime && date < ctx.today) warnings.push("Bamawl OUT missing");
  if (b?.manualIn || b?.manualOut) infos.push("Time set by HR (forgot scan)");
  if (b?.leaveName) infos.push(`Leave: ${b.leaveName}`);
  if (b?.tripDes || /business trip/i.test(b?.inDes ?? "")) infos.push("Business trip");

  for (const en of entries) {
    const [s, e0] = span(en.start, en.end);
    const e = Math.max(s, e0 - (en.breakMinutes || 0)); // break comes off the end of the entry
    if (!off && s < workEnd && e > workStart) warnings.push(`${en.start}–${en.end} overlaps work hours`);
    if (e > s) raw.push({ source: en.place, start: s, end: e });
  }

  // Taxi: counted office OT (not home) must end at 19:00 or later.
  const officeEnds = raw.filter((s) => s.source === "office").map((s) => s.end);
  const officeEnd = officeEnds.length ? Math.max(...officeEnds) : null;
  const taxiEligible = officeEnd !== null && officeEnd >= TAXI_FROM;
  const taxiNotes: string[] = [];
  if (taxiEligible && !off && inTime && (toMin(inTime) ?? 0) > workStart) {
    taxiNotes.push(`IN ${inTime} is late — taxi needs the full 8 hours worked`);
  }
  if (taxiEligible && b?.leaveName) taxiNotes.push("Leave on this day — no taxi for OT caused by leave");

  const segments = merge(raw);
  const rawMinutes = len(segments);
  const f = Math.max(1, settings.floorMinutes);

  let floored: Segment[];
  if (settings.floorMode === "per_segment") {
    floored = segments.flatMap((s) => trimEnd([s], (s.end - s.start) % f));
  } else if (settings.floorMode === "clock_grid") {
    // Start rounds UP and end rounds DOWN to the 15-min clock grid: 18:50–23:00 → 19:00–23:00.
    floored = segments
      .map((s) => ({ ...s, start: Math.ceil(s.start / f) * f, end: Math.floor(s.end / f) * f }))
      .filter((s) => s.end > s.start);
  } else {
    floored = trimEnd(segments, rawMinutes % f);
  }
  const flooredMinutes = len(floored);
  const bands = bandMinutes(floored);

  // Exchanges: OT hours from this day swapped for rest. Each block must fit in one consecutive run.
  const exchangesOut = ctx.exchanges.filter((x) => x.otDate === date);
  const restFor = ctx.exchanges.filter((x) => x.restDate === date);
  const block = longestBlock(floored, off ? [lunchStart, lunchStart + settings.weekendLunchMinutes] : null);
  const wanted = exchangesOut.reduce((n, x) => n + x.hours * 60, 0);
  const exchangedMinutes = Math.min(wanted, flooredMinutes);
  if (wanted > flooredMinutes) warnings.push(`Exchange ${wanted / 60}h is more than this day's OT`);
  for (const x of exchangesOut) {
    if (x.hours * 60 > block) warnings.push(`No ${x.hours}h consecutive OT on this day for the exchange`);
  }
  const payableMinutes = flooredMinutes - exchangedMinutes;

  // Pay = base hourly for payable minutes + allowance (bonus) for ALL floored minutes.
  let pay: number | null = 0;
  if (flooredMinutes > 0) {
    const base = ctx.baseHourlyOn(date);
    if (base === null) {
      pay = null;
      warnings.push("No salary set for this date");
    } else {
      const bonus = BAND_BONUS[off ? "off" : "weekday"];
      const allowance = (Object.keys(bands) as Band[]).reduce((sum, k) => sum + (bands[k] / 60) * bonus[k], 0);
      pay = Math.round((payableMinutes / 60) * base + allowance);
    }
  }

  const { raw: _raw, ...bamawl } = b ?? ({} as BamawlDay);
  return {
    date,
    dow: d,
    dayType,
    holidayName: b?.holiday ? b.shift : "",
    inPeriod: date >= ctx.period.start && date <= ctx.period.end,
    weekStart: weekStart(date, settings.weekStartDay),
    bamawl: b ? bamawl : null,
    entries,
    note,
    segments,
    unclaimed,
    officeClaim,
    elec: elecFor(date, ctx.notes),
    taxi: { eligible: taxiEligible, officeEnd, notes: taxiNotes },
    times: {
      in: inTime,
      out: outTime,
      inManual,
      outManual,
      bamawlIn: b?.inTime ?? null,
      bamawlOut: b?.outTime ?? null,
      inConflict: !hrAdjusted && conflict(note?.inOverride, b?.inTime, note?.inKeep),
      outConflict: !hrAdjusted && conflict(note?.outOverride, b?.outTime, note?.outKeep),
      hrAdjusted,
    },
    exchangedMinutes,
    payableMinutes,
    exchangesOut,
    restFor,
    longestBlock: block,
    checks: [],
    submitted,
    rawMinutes,
    flooredMinutes,
    bands,
    pay,
    warnings,
    infos,
  };
}

export function calcMonth(period: string, data: Omit<Ctx, "period" | "today">): MonthResult {
  const range = periodRange(period);
  const ctx: Ctx = { ...data, period: range, today: todayLocal() };
  // Compute whole weeks so weekly totals are right at the edges of the salary month.
  const from = weekStart(range.start, data.settings.weekStartDay);
  const to = addDays(weekStart(range.end, data.settings.weekStartDay), 6);
  const all = eachDate(from, to).map((d) => calcDay(d, ctx));

  // Request checker: compare expected Bamawl requests with the imported ones.
  const byDate = new Map(all.map((d) => [d.date, d]));
  const getDay = (date: string) => byDate.get(date) ?? calcDay(date, ctx);
  for (const d of all) {
    d.checks = checkDay(d, {
      otRequests: data.requests,
      allowances: data.allowances,
      taxi: data.taxi,
      taxiFee: data.settings.taxiFee,
      baseHourlyOn: data.baseHourlyOn,
      today: ctx.today,
      getDay,
    });
  }

  const weeks: WeekResult[] = [];
  for (let i = 0; i < all.length; i += 7) {
    const w = all.slice(i, i + 7);
    const minutes = w.reduce((n, d) => n + d.payableMinutes, 0);
    const over = minutes > data.settings.weeklyLimitMinutes;
    weeks.push({
      start: w[0].date,
      end: w[w.length - 1].date,
      minutes,
      exchangedMinutes: w.reduce((n, d) => n + d.exchangedMinutes, 0),
      over,
      partial: w.some((d) => !d.inPeriod),
      exchangeHint: over ? exchangeHint(minutes - data.settings.weeklyLimitMinutes) : [],
    });
  }

  const days = all.filter((d) => d.inPeriod);
  const bands = emptyBands();
  let minutes = 0;
  let exchangedMinutes = 0;
  let pay: number | null = 0;
  let submittedMinutes = 0;
  let submittedAmount: number | null = 0;
  for (const d of days) {
    if (d.submitted) {
      submittedMinutes += d.submitted.minutes;
      submittedAmount = submittedAmount === null || d.submitted.amount === null ? null : submittedAmount + d.submitted.amount;
    }
    minutes += d.payableMinutes;
    exchangedMinutes += d.exchangedMinutes;
    (Object.keys(bands) as Band[]).forEach((k) => (bands[k] += d.bands[k]));
    pay = pay === null || d.pay === null ? null : pay + d.pay;
  }

  return {
    period,
    ...range,
    days,
    weeks,
    totals: {
      minutes,
      pay,
      bands,
      daysWithOt: days.filter((d) => d.flooredMinutes > 0).length,
      taxiDays: days.filter((d) => d.taxi.eligible).length,
      taxiRequested: data.taxi
        .filter((t) => !t.rejected && t.date >= range.start && t.date <= range.end)
        .reduce((n, t) => n + (t.fee ?? 0), 0),
      exchangedMinutes,
      checksOk: days.reduce((n, d) => n + d.checks.filter((c) => c.status === "ok").length, 0),
      checksBad: days.reduce((n, d) => n + d.checks.filter((c) => ["missing", "wrong", "rejected", "extra"].includes(c.status)).length, 0),
      submittedMinutes,
      submittedAmount,
    },
    settings: data.settings,
    changes: [], // filled by the month route
    exchanges: data.exchanges
      .filter((x) => (x.otDate >= from && x.otDate <= to) || (x.restDate >= from && x.restDate <= to))
      .sort((a, b) => a.otDate.localeCompare(b.otDate)),
  };
}
