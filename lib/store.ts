import "server-only";
import * as json from "./store-json";
import * as supabase from "./store-supabase";

// The ONLY storage entry point. The rest of the app imports from here.
// .env.local: OT_STORAGE=json (default, data/*.json files) or OT_STORAGE=supabase (ot_ tables).
// Restart `npm run dev` after changing it.
export type { EntryInput } from "./store-json";

export const storageName = (): "json" | "supabase" => (process.env.OT_STORAGE === "supabase" ? "supabase" : "json");
const s = () => (storageName() === "supabase" ? supabase : json);

type Fn<K extends keyof typeof json> = (typeof json)[K];
const pass =
  <K extends keyof typeof json>(name: K) =>
  (...args: Parameters<Extract<Fn<K>, (...a: never[]) => unknown>>) =>
    (s()[name] as (...a: unknown[]) => ReturnType<Extract<Fn<K>, (...a: never[]) => unknown>>)(...args);

export const getBamawlDays = pass("getBamawlDays");
export const upsertBamawlDays = pass("upsertBamawlDays");
export const getOtRequests = pass("getOtRequests");
export const upsertOtRequests = pass("upsertOtRequests");
export const getAllowances = pass("getAllowances");
export const upsertAllowances = pass("upsertAllowances");
export const getTaxiRequests = pass("getTaxiRequests");
export const upsertTaxiRequests = pass("upsertTaxiRequests");
export const getEntries = pass("getEntries");
export const addEntry = pass("addEntry");
export const updateEntry = pass("updateEntry");
export const deleteEntry = pass("deleteEntry");
export const getNotes = pass("getNotes");
export const setNote = pass("setNote");
export const getExchanges = pass("getExchanges");
export const addExchange = pass("addExchange");
export const deleteExchange = pass("deleteExchange");
export const getSettings = pass("getSettings");
export const saveSettings = pass("saveSettings");
export const getChanges = pass("getChanges");
export const addChanges = pass("addChanges");
export const clearChanges = pass("clearChanges");
export const getLastImport = pass("getLastImport");
export const setLastImport = pass("setLastImport");
