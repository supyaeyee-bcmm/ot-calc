import "server-only";
import { db } from "./supabase";
import {
  AllowanceKind,
  AllowanceRequest,
  BamawlDay,
  DayNote,
  DEFAULT_SETTINGS,
  Entry,
  Exchange,
  FieldChange,
  FloorMode,
  ImportKind,
  ImportLog,
  OtRequest,
  Place,
  Settings,
  TaxiRequest,
} from "./types";

// The ONLY storage layer: Supabase tables with the ot_ prefix (sql/001_ot_schema.sql).
// Rows are mapped to the same app types the JSON store used, so nothing else had to change.

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const hm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null); // "07:52:00" → "07:52"
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Supabase: ${res.error.message}`);
  return res.data as T;
}

/** Read every row (PostgREST returns at most 1000 per request). */
async function selectAll(table: string, order: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = check(await db().from(table).select("*").order(order).range(from, from + 999)) as Row[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

async function upsert(table: string, rows: Row[], onConflict: string): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    check(await db().from(table).upsert(rows.slice(i, i + 500), { onConflict }));
  }
}

// ---------------- Bamawl days
const toBamawl = (r: Row): BamawlDay => ({
  date: r.work_date,
  holiday: r.holiday,
  shift: r.shift,
  inTime: hm(r.in_time),
  outTime: hm(r.out_time),
  manualIn: r.manual_in,
  manualOut: r.manual_out,
  inDes: r.in_des,
  outDes: r.out_des,
  tripDes: r.trip_des,
  leaveName: r.leave_name,
  leaveDes: r.leave_des,
  exchange: r.exchange,
  exchangeWay: r.exchange_way,
  originDate: r.origin_date,
  raw: r.raw,
  importedAt: r.imported_at,
});

export async function getBamawlDays(): Promise<Record<string, BamawlDay>> {
  const out: Record<string, BamawlDay> = {};
  for (const r of await selectAll("ot_bamawl_days", "work_date")) out[r.work_date] = toBamawl(r);
  return out;
}

export async function upsertBamawlDays(days: BamawlDay[]): Promise<void> {
  await upsert(
    "ot_bamawl_days",
    days.map((d) => ({
      work_date: d.date,
      holiday: d.holiday,
      shift: d.shift,
      in_time: d.inTime,
      out_time: d.outTime,
      manual_in: d.manualIn,
      manual_out: d.manualOut,
      in_des: d.inDes,
      out_des: d.outDes,
      trip_des: d.tripDes,
      leave_name: d.leaveName,
      leave_des: d.leaveDes,
      exchange: d.exchange,
      exchange_way: d.exchangeWay,
      origin_date: d.originDate,
      raw: d.raw ?? null,
      imported_at: d.importedAt,
    })),
    "work_date",
  );
}

// ---------------- Bamawl OT requests
export async function getOtRequests(): Promise<Record<string, OtRequest>> {
  const out: Record<string, OtRequest> = {};
  for (const r of await selectAll("ot_overtime_requests", "work_date")) {
    out[r.id] = {
      id: r.id,
      date: r.work_date,
      minutes: r.minutes,
      status: r.status,
      rejected: r.rejected,
      remark: r.remark,
      amount: num(r.amount),
      importedAt: r.imported_at,
      raw: r.raw,
    };
  }
  return out;
}

export async function upsertOtRequests(list: OtRequest[]): Promise<void> {
  await upsert(
    "ot_overtime_requests",
    list.map((r) => ({
      id: r.id,
      work_date: r.date,
      minutes: r.minutes,
      status: r.status,
      rejected: r.rejected,
      remark: r.remark,
      amount: r.amount,
      raw: r.raw ?? null,
      imported_at: r.importedAt,
    })),
    "id",
  );
}

// ---------------- Bamawl allowance requests
export async function getAllowances(): Promise<Record<string, AllowanceRequest>> {
  const out: Record<string, AllowanceRequest> = {};
  for (const r of await selectAll("ot_allowance_requests", "id")) {
    out[r.id] = {
      id: r.id,
      dates: r.dates ?? [],
      name: r.name,
      kind: r.kind as AllowanceKind,
      amount: num(r.amount),
      payment: r.payment,
      status: r.status,
      rejected: r.rejected,
      description: r.description,
      importedAt: r.imported_at,
      raw: r.raw,
    };
  }
  return out;
}

export async function upsertAllowances(list: AllowanceRequest[]): Promise<void> {
  await upsert(
    "ot_allowance_requests",
    list.map((a) => ({
      id: a.id,
      dates: a.dates,
      name: a.name,
      kind: a.kind,
      amount: a.amount,
      payment: a.payment,
      status: a.status,
      rejected: a.rejected,
      description: a.description,
      raw: a.raw ?? null,
      imported_at: a.importedAt,
    })),
    "id",
  );
}

// ---------------- Bamawl taxi fee requests
export async function getTaxiRequests(): Promise<Record<string, TaxiRequest>> {
  const out: Record<string, TaxiRequest> = {};
  for (const r of await selectAll("ot_taxi_requests", "work_date")) {
    out[r.id] = {
      id: r.id,
      date: r.work_date,
      fee: num(r.fee),
      type: r.type,
      status: r.status,
      rejected: r.rejected,
      deniedReason: r.denied_reason,
      importedAt: r.imported_at,
      raw: r.raw,
    };
  }
  return out;
}

export async function upsertTaxiRequests(list: TaxiRequest[]): Promise<void> {
  await upsert(
    "ot_taxi_requests",
    list.map((t) => ({
      id: t.id,
      work_date: t.date,
      fee: t.fee,
      type: t.type,
      status: t.status,
      rejected: t.rejected,
      denied_reason: t.deniedReason,
      raw: t.raw ?? null,
      imported_at: t.importedAt,
    })),
    "id",
  );
}

// ---------------- Entries (home OT / office override)
export type EntryInput = Omit<Entry, "id" | "createdAt">;

const toEntry = (r: Row): Entry => ({
  id: r.id,
  date: r.work_date,
  place: r.place as Place,
  start: hm(r.start_time) ?? "00:00",
  end: hm(r.end_time) ?? "00:00",
  breakMinutes: r.break_minutes,
  task: r.task,
  createdAt: r.created_at,
});

const entryRow = (e: EntryInput) => ({
  work_date: e.date,
  place: e.place,
  start_time: e.start,
  end_time: e.end,
  break_minutes: e.breakMinutes,
  task: e.task,
});

export async function getEntries(): Promise<Entry[]> {
  return (await selectAll("ot_entries", "work_date")).map(toEntry);
}

/** `id`/`createdAt` are only passed by the one-time copy from the JSON files. */
export async function addEntry(e: EntryInput & { id?: string; createdAt?: string }): Promise<Entry> {
  const row = { ...entryRow(e), ...(e.id ? { id: e.id } : {}), ...(e.createdAt ? { created_at: e.createdAt } : {}) };
  return toEntry(check(await db().from("ot_entries").insert(row).select().single()) as Row);
}

export async function updateEntry(id: string, patch: EntryInput): Promise<Entry | null> {
  const rows = check(await db().from("ot_entries").update(entryRow(patch)).eq("id", id).select()) as Row[];
  return rows.length ? toEntry(rows[0]) : null;
}

export async function deleteEntry(id: string): Promise<boolean> {
  const rows = check(await db().from("ot_entries").delete().eq("id", id).select("id")) as Row[];
  return rows.length > 0;
}

// ---------------- Day notes
export async function getNotes(): Promise<Record<string, DayNote>> {
  const out: Record<string, DayNote> = {};
  for (const r of await selectAll("ot_day_notes", "work_date")) {
    out[r.work_date] = {
      date: r.work_date,
      elecOn: r.elec_on,
      note: r.note,
      claimOffice: r.claim_office,
      inOverride: hm(r.in_override),
      outOverride: hm(r.out_override),
      inKeep: hm(r.in_keep),
      outKeep: hm(r.out_keep),
      hrAdjusted: r.hr_adjusted ?? null,
    };
  }
  return out;
}

export async function setNote(n: DayNote): Promise<void> {
  // inKeep/outKeep only matter while a typed time exists, so they don't keep a note alive.
  const empty =
    n.elecOn === null && !n.note && n.claimOffice == null && n.inOverride == null && n.outOverride == null && !n.hrAdjusted;
  if (empty) {
    check(await db().from("ot_day_notes").delete().eq("work_date", n.date));
    return;
  }
  check(
    await db().from("ot_day_notes").upsert(
      {
        work_date: n.date,
        elec_on: n.elecOn,
        note: n.note,
        claim_office: n.claimOffice ?? null,
        in_override: n.inOverride ?? null,
        out_override: n.outOverride ?? null,
        in_keep: n.inKeep ?? null,
        out_keep: n.outKeep ?? null,
        hr_adjusted: n.hrAdjusted ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "work_date" },
    ),
  );
}

// ---------------- Exchanges (OT hours swapped for rest)
const toExchange = (r: Row): Exchange => ({
  id: r.id,
  otDate: r.ot_date,
  restDate: r.rest_date,
  hours: r.hours as 4 | 8,
  note: r.note,
  createdAt: r.created_at,
});

export async function getExchanges(): Promise<Exchange[]> {
  return (await selectAll("ot_exchanges", "ot_date")).map(toExchange);
}

/** `id`/`createdAt` are only passed by the one-time copy from the JSON files. */
export async function addExchange(x: Omit<Exchange, "id" | "createdAt"> & { id?: string; createdAt?: string }): Promise<Exchange> {
  const row = {
    ot_date: x.otDate,
    rest_date: x.restDate,
    hours: x.hours,
    note: x.note,
    ...(x.id ? { id: x.id } : {}),
    ...(x.createdAt ? { created_at: x.createdAt } : {}),
  };
  return toExchange(check(await db().from("ot_exchanges").insert(row).select().single()) as Row);
}

export async function deleteExchange(id: string): Promise<boolean> {
  const rows = check(await db().from("ot_exchanges").delete().eq("id", id).select("id")) as Row[];
  return rows.length > 0;
}

// ---------------- Unseen import changes + last import (sql/002_ot_import_changes.sql)
export async function getChanges(): Promise<FieldChange[]> {
  return (await selectAll("ot_import_changes", "at")).map((r) => ({
    id: r.id,
    at: r.at,
    kind: r.kind as ImportKind,
    key: r.key,
    date: r.work_date,
    field: r.field,
    label: r.label,
    before: r.before,
    after: r.after,
  }));
}

export async function addChanges(list: FieldChange[]): Promise<void> {
  if (!list.length) return;
  await upsert(
    "ot_import_changes",
    list.map((c) => ({ id: c.id, at: c.at, kind: c.kind, key: c.key, work_date: c.date, field: c.field, label: c.label, before: c.before, after: c.after })),
    "id",
  );
}

export async function clearChanges(date?: string): Promise<void> {
  const q = db().from("ot_import_changes").delete();
  check(await (date ? q.eq("work_date", date) : q.neq("id", "")));
}

export async function getLastImport(): Promise<ImportLog | null> {
  const r = check(await db().from("ot_last_import").select("log").eq("id", 1).maybeSingle()) as Row | null;
  return r ? (r.log as ImportLog) : null;
}

export async function setLastImport(log: ImportLog): Promise<void> {
  check(await db().from("ot_last_import").upsert({ id: 1, log }, { onConflict: "id" }));
}

// ---------------- Settings (single row id = 1)
export async function getSettings(): Promise<Settings> {
  const r = check(await db().from("ot_settings").select("*").eq("id", 1).maybeSingle()) as Row | null;
  if (!r) return { ...DEFAULT_SETTINGS };
  return {
    floorMode: r.floor_mode as FloorMode,
    floorMinutes: r.floor_minutes,
    weeklyLimitMinutes: r.weekly_limit_minutes,
    weekendLunchMinutes: r.weekend_lunch_minutes,
    workStart: hm(r.work_start) ?? DEFAULT_SETTINGS.workStart,
    workEnd: hm(r.work_end) ?? DEFAULT_SETTINGS.workEnd,
    weekStartDay: r.week_start_day,
    taxiFee: r.taxi_fee,
  };
}

export async function saveSettings(s: Settings): Promise<void> {
  check(
    await db().from("ot_settings").upsert(
      {
        id: 1,
        floor_mode: s.floorMode,
        floor_minutes: s.floorMinutes,
        weekly_limit_minutes: s.weeklyLimitMinutes,
        weekend_lunch_minutes: s.weekendLunchMinutes,
        work_start: s.workStart,
        work_end: s.workEnd,
        week_start_day: s.weekStartDay,
        taxi_fee: s.taxiFee,
      },
      { onConflict: "id" },
    ),
  );
}
