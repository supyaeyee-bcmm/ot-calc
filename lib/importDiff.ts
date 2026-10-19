import { fmtHM, fmtMMK } from "./time";
import { AllowanceRequest, BamawlDay, ImportDiff, ImportKind, OtRequest, TaxiRequest } from "./types";

// Compare an import with what is stored, field by field. Technical fields (raw JSON, importedAt) are ignored.

type Spec<T> = { field: keyof T & string; label: string; fmt?: (v: unknown, t: T) => string };

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (Array.isArray(v)) return v.join(", ") || "—";
  return String(v);
}

function diff<T>(
  kind: ImportKind,
  incoming: T[],
  existing: Record<string, T>,
  keyOf: (t: T) => string,
  dateOf: (t: T) => string,
  describe: (t: T) => string,
  specs: Spec<T>[],
): ImportDiff {
  const out: ImportDiff = { kind, total: incoming.length, added: [], changed: [], unchanged: 0 };
  for (const t of incoming) {
    const key = keyOf(t);
    const old = existing[key];
    if (!old) {
      out.added.push({ key, date: dateOf(t), text: describe(t) });
      continue;
    }
    let changed = false;
    for (const s of specs) {
      const f = s.fmt ?? show;
      const before = f(old[s.field], old);
      const after = f(t[s.field], t);
      if (before !== after) {
        changed = true;
        out.changed.push({ kind, key, date: dateOf(t), field: s.field, label: s.label, before, after });
      }
    }
    if (!changed) out.unchanged++;
  }
  return out;
}

const hours = (v: unknown) => (typeof v === "number" ? fmtHM(v) : "—");
const money = (v: unknown) => (typeof v === "number" ? fmtMMK(v) : "—");

export function diffCalendar(days: BamawlDay[], existing: Record<string, BamawlDay>): ImportDiff {
  return diff("calendar", days, existing, (d) => d.date, (d) => d.date, (d) => (d.holiday ? d.shift : `${d.inTime ?? "—"}–${d.outTime ?? "—"}`), [
    { field: "holiday", label: "Holiday" },
    { field: "shift", label: "Shift / holiday name" },
    { field: "inTime", label: "IN" },
    { field: "outTime", label: "OUT" },
    { field: "manualIn", label: "IN set by HR" },
    { field: "manualOut", label: "OUT set by HR" },
    { field: "leaveName", label: "Leave" },
    { field: "leaveDes", label: "Leave note" },
    { field: "tripDes", label: "Business trip" },
    { field: "inDes", label: "IN note" },
    { field: "outDes", label: "OUT note" },
    { field: "exchange", label: "Exchange" },
    { field: "exchangeWay", label: "Exchange way" },
    { field: "originDate", label: "Exchange origin date" },
  ]);
}

export function diffRequests(list: OtRequest[], existing: Record<string, OtRequest>): ImportDiff {
  return diff("requests", list, existing, (r) => r.id, (r) => r.date, (r) => `OT request ${fmtHM(r.minutes)} ${r.status}`, [
    { field: "date", label: "Date" },
    { field: "minutes", label: "Hours", fmt: hours },
    { field: "status", label: "Status" },
    { field: "amount", label: "Amount", fmt: money },
    { field: "remark", label: "Remark" },
  ]);
}

export function diffAllowances(list: AllowanceRequest[], existing: Record<string, AllowanceRequest>): ImportDiff {
  return diff("allowances", list, existing, (a) => a.id, (a) => a.dates[0], (a) => `Allowance "${a.name}" ${a.amount === null ? "?" : fmtMMK(a.amount)} ${a.status}`, [
    { field: "dates", label: "Dates" },
    { field: "name", label: "Allowance name" },
    { field: "amount", label: "Amount", fmt: money },
    { field: "payment", label: "Payment" },
    { field: "status", label: "Status" },
    { field: "description", label: "Description" },
  ]);
}

export function diffTaxi(list: TaxiRequest[], existing: Record<string, TaxiRequest>): ImportDiff {
  return diff("taxi", list, existing, (t) => t.id, (t) => t.date, (t) => `Taxi ${t.fee === null ? "?" : fmtMMK(t.fee)} ${t.status}`, [
    { field: "date", label: "Date" },
    { field: "fee", label: "Fee", fmt: money },
    { field: "status", label: "Status" },
    { field: "deniedReason", label: "Denied reason" },
  ]);
}
