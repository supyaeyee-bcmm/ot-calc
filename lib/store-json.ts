import "server-only";
// JSON-file storage (data/*.json). Used when OT_STORAGE is "json" (default). See lib/store.ts.
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { AllowanceRequest, BamawlDay, DayNote, DEFAULT_SETTINGS, Entry, Exchange, FieldChange, ImportLog, OtRequest, Settings, TaxiRequest } from "./types";

// Local JSON storage while the data shape settles. Later this file is swapped for Supabase;
// nothing else in the app touches the files directly.
const DIR = path.join(process.cwd(), "data");

async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(path.join(DIR, name), "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw e;
  }
}

async function writeJson(name: string, value: unknown): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  const file = path.join(DIR, name);
  await fs.writeFile(file + ".tmp", JSON.stringify(value, null, 2), "utf8");
  await fs.rename(file + ".tmp", file);
}

// Bamawl days, keyed by date
export const getBamawlDays = () => readJson<Record<string, BamawlDay>>("bamawl-days.json", {});

export async function upsertBamawlDays(days: BamawlDay[]): Promise<void> {
  const all = await getBamawlDays();
  for (const d of days) all[d.date] = d;
  await writeJson("bamawl-days.json", all);
}

// Bamawl OT requests, keyed by employee_overtime_id
export const getOtRequests = () => readJson<Record<string, OtRequest>>("ot-requests.json", {});

export async function upsertOtRequests(list: OtRequest[]): Promise<void> {
  const all = await getOtRequests();
  for (const r of list) all[r.id] = r;
  await writeJson("ot-requests.json", all);
}

// Bamawl allowance requests, keyed by allowance_request_id
export const getAllowances = () => readJson<Record<string, AllowanceRequest>>("allowance-requests.json", {});

export async function upsertAllowances(list: AllowanceRequest[]): Promise<void> {
  const all = await getAllowances();
  for (const a of list) all[a.id] = a;
  await writeJson("allowance-requests.json", all);
}

// Bamawl taxi fee requests, keyed by id
export const getTaxiRequests = () => readJson<Record<string, TaxiRequest>>("taxi-requests.json", {});

export async function upsertTaxiRequests(list: TaxiRequest[]): Promise<void> {
  const all = await getTaxiRequests();
  for (const t of list) all[t.id] = t;
  await writeJson("taxi-requests.json", all);
}

// Entries
export const getEntries = () => readJson<Entry[]>("entries.json", []);

export type EntryInput = Omit<Entry, "id" | "createdAt">;

export async function addEntry(e: EntryInput): Promise<Entry> {
  const all = await getEntries();
  const entry: Entry = { ...e, id: randomUUID(), createdAt: new Date().toISOString() };
  all.push(entry);
  await writeJson("entries.json", all);
  return entry;
}

export async function updateEntry(id: string, patch: EntryInput): Promise<Entry | null> {
  const all = await getEntries();
  const i = all.findIndex((e) => e.id === id);
  if (i < 0) return null;
  all[i] = { ...all[i], ...patch };
  await writeJson("entries.json", all);
  return all[i];
}

export async function deleteEntry(id: string): Promise<boolean> {
  const all = await getEntries();
  const rest = all.filter((e) => e.id !== id);
  if (rest.length === all.length) return false;
  await writeJson("entries.json", rest);
  return true;
}

// Day notes, keyed by date
export const getNotes = () => readJson<Record<string, DayNote>>("day-notes.json", {});

export async function setNote(n: DayNote): Promise<void> {
  const all = await getNotes();
  const empty =
    n.elecOn === null && !n.note && n.claimOffice == null && n.inOverride == null && n.outOverride == null && !n.hrAdjusted;
  // inKeep/outKeep only matter while a typed time exists, so they don't keep a note alive.
  if (empty) delete all[n.date];
  else all[n.date] = n;
  await writeJson("day-notes.json", all);
}

// Exchanges (OT hours swapped for rest)
export const getExchanges = () => readJson<Exchange[]>("exchanges.json", []);

export async function addExchange(x: Omit<Exchange, "id" | "createdAt">): Promise<Exchange> {
  const all = await getExchanges();
  const ex: Exchange = { ...x, id: randomUUID(), createdAt: new Date().toISOString() };
  all.push(ex);
  await writeJson("exchanges.json", all);
  return ex;
}

export async function deleteExchange(id: string): Promise<boolean> {
  const all = await getExchanges();
  const rest = all.filter((x) => x.id !== id);
  if (rest.length === all.length) return false;
  await writeJson("exchanges.json", rest);
  return true;
}

// Unseen import changes ("updated" marks) and the last import
export const getChanges = () => readJson<FieldChange[]>("import-changes.json", []);

export async function addChanges(list: FieldChange[]): Promise<void> {
  if (!list.length) return;
  await writeJson("import-changes.json", [...(await getChanges()), ...list]);
}

/** Mark as seen (= remove): one day, or everything when no date is given. */
export async function clearChanges(date?: string): Promise<void> {
  const all = await getChanges();
  await writeJson("import-changes.json", date ? all.filter((c) => c.date !== date) : []);
}

export const getLastImport = () => readJson<ImportLog | null>("last-import.json", null);
export const setLastImport = (log: ImportLog) => writeJson("last-import.json", log);

// Settings
export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await readJson<Partial<Settings>>("settings.json", {})) };
}

export const saveSettings = (s: Settings) => writeJson("settings.json", s);
