import type { EntryInput } from "./store";
import { isTime } from "./time";

/** Check an entry from the browser; returns an error message or the clean entry. */
export function parseEntry(body: unknown): EntryInput | string {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return "Bad date";
  if (b.place !== "home" && b.place !== "office") return "Place must be home or office";
  if (!isTime(b.start) || !isTime(b.end)) return "Times must be HH:MM";
  if (b.start === b.end) return "Start and end are the same";
  const breakMinutes = Number(b.breakMinutes ?? 0);
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 600) return "Bad break minutes";
  return {
    date: b.date,
    place: b.place,
    start: b.start,
    end: b.end,
    breakMinutes,
    task: typeof b.task === "string" ? b.task.trim().slice(0, 200) : "",
  };
}
