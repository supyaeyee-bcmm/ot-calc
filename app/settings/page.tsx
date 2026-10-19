"use client";

import { useEffect, useState } from "react";
import type { Settings } from "@/lib/types";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setS);
  }, []);

  async function save() {
    const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
    setMsg(res.ok ? "Saved." : ((await res.json()) as { error: string }).error);
  }

  if (!s) return <p className="text-slate-500">Loading…</p>;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    setMsg("");
    setS({ ...s, [k]: v });
  };
  const input = "rounded border border-slate-300 px-2 py-1 text-sm";

  return (
    <div className="max-w-xl space-y-5">
      <h1 className="text-xl font-bold">Settings</h1>

      <fieldset className="space-y-2">
        <legend className="mb-1 font-medium">How OT time is floored</legend>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" checked={s.floorMode === "day_total"} onChange={() => set("floorMode", "day_total")} />
          <span>
            <b>Floor the day total</b> — 0:50 office + 4:10 home = 5:00 → <b>5:00</b>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" checked={s.floorMode === "per_segment"} onChange={() => set("floorMode", "per_segment")} />
          <span>
            <b>Floor each part</b> — 0:50 → 0:45, 4:10 → 4:00 = <b>4:45</b>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" checked={s.floorMode === "clock_grid"} onChange={() => set("floorMode", "clock_grid")} />
          <span>
            <b>Snap to the clock</b> — start rounds up, end rounds down to the 15-min mark:
            17:00–17:50 → 17:00–17:45, 18:50–23:00 → 19:00–23:00 = <b>4:45</b>
          </span>
        </label>
      </fieldset>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <label className="flex flex-col gap-1">
          Floor step (minutes)
          <input type="number" className={input} value={s.floorMinutes} onChange={(e) => set("floorMinutes", Number(e.target.value))} />
        </label>
        <label className="flex flex-col gap-1">
          Weekly OT limit (hours)
          <input
            type="number"
            className={input}
            value={s.weeklyLimitMinutes / 60}
            onChange={(e) => set("weeklyLimitMinutes", Math.round(Number(e.target.value) * 60))}
          />
        </label>
        <label className="flex flex-col gap-1">
          Weekend/holiday lunch (minutes, from 12:00)
          <input
            type="number"
            className={input}
            value={s.weekendLunchMinutes}
            onChange={(e) => set("weekendLunchMinutes", Number(e.target.value))}
          />
        </label>
        <label className="flex flex-col gap-1">
          Week starts on
          <select className={input} value={s.weekStartDay} onChange={(e) => set("weekStartDay", Number(e.target.value))}>
            {DAY_NAMES.map((name, i) => (
              <option key={i} value={i}>
                {name}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500">Ends on {DAY_NAMES[(s.weekStartDay + 6) % 7]} (automatic)</span>
        </label>
        <label className="flex flex-col gap-1">
          Usual taxi fee (MMK)
          <input type="number" step={100} className={input} value={s.taxiFee} onChange={(e) => set("taxiFee", Number(e.target.value))} />
          <span className="text-xs text-slate-500">Reference: Grab Taxi quote office → home (Ks 20,100). Other fees are flagged.</span>
        </label>
        <div />
        <label className="flex flex-col gap-1">
          Work starts
          <input type="time" className={input} value={s.workStart} onChange={(e) => set("workStart", e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          Work ends (weekday OT starts)
          <input type="time" className={input} value={s.workEnd} onChange={(e) => set("workEnd", e.target.value)} />
        </label>
      </div>

      <p className="text-xs text-slate-500">Salary is not shown here. Change it in <code>.env.local</code> (SALARY_HISTORY).</p>

      <button onClick={save} className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700">
        Save
      </button>
      {msg && <span className="ml-3 text-sm text-slate-600">{msg}</span>}
    </div>
  );
}
