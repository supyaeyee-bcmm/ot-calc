/** "HH:MM" -> minutes from 00:00. */
export function toMin(t: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec((t ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Duration: 125 -> "2:05". */
export function fmtHM(min: number): string {
  const sign = min < 0 ? "-" : "";
  const a = Math.abs(min);
  return `${sign}${Math.floor(a / 60)}:${pad(a % 60)}`;
}

/** Clock time: 1500 -> "01:00+1" (next day). */
export function fmtClock(min: number): string {
  const day = Math.floor(min / 1440);
  const m = min % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}${day ? "+1" : ""}`;
}

export const isTime = (t: unknown): t is string => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

export const fmtMMK = (n: number) => Math.round(n).toLocaleString("en-US");

/** ISO timestamp → local "YYYY-MM-DD HH:MM". */
export function fmtAt(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
