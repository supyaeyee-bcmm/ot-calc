"use client";

import { useState } from "react";
import type { Entry, Place } from "@/lib/types";

type Props = {
  date: string;
  offDay: boolean;
  entry?: Entry;
  onDone: () => void;
  onCancel: () => void;
};

export default function EntryForm({ date, offDay, entry, onDone, onCancel }: Props) {
  const [place, setPlace] = useState<Place>(entry?.place ?? "home");
  const [start, setStart] = useState(entry?.start ?? (offDay ? "08:00" : "18:00"));
  const [end, setEnd] = useState(entry?.end ?? (offDay ? "17:00" : "20:00"));
  const [breakMinutes, setBreak] = useState(entry?.breakMinutes ?? (offDay ? 60 : 0));
  const [task, setTask] = useState(entry?.task ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError("");
    const res = await fetch(entry ? `/api/entries/${entry.id}` : "/api/entries", {
      method: entry ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, place, start, end, breakMinutes, task }),
    });
    setSaving(false);
    if (res.ok) onDone();
    else setError(((await res.json()) as { error?: string }).error ?? "Save failed");
  }

  const input = "rounded border border-slate-300 px-2 py-1 text-sm";
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md bg-sky-50 p-3 text-sm">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-slate-500">Place</span>
        <select className={input} value={place} onChange={(e) => setPlace(e.target.value as Place)}>
          <option value="home">Home</option>
          <option value="office">Office (replaces Bamawl)</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-slate-500">From</span>
        <input type="time" className={input} value={start} onChange={(e) => setStart(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-slate-500">To (earlier = next day)</span>
        <input type="time" className={input} value={end} onChange={(e) => setEnd(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-slate-500">Break (min)</span>
        <input
          type="number"
          min={0}
          step={15}
          className={`${input} w-20`}
          value={breakMinutes}
          onChange={(e) => setBreak(Number(e.target.value))}
        />
      </label>
      <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
        <span className="text-xs text-slate-500">Task / ticket</span>
        <input className={input} value={task} placeholder="CORE-2042, Anac…" onChange={(e) => setTask(e.target.value)} />
      </label>
      <button
        onClick={save}
        disabled={saving}
        className="rounded bg-sky-600 px-3 py-1.5 font-medium text-white hover:bg-sky-700 disabled:opacity-50"
      >
        {entry ? "Save" : "Add"}
      </button>
      <button onClick={onCancel} className="rounded px-3 py-1.5 text-slate-600 hover:bg-slate-200">
        Cancel
      </button>
      {error && <p className="w-full text-red-600">{error}</p>}
    </div>
  );
}
