"use client";

import { useState } from "react";
import { DOW, fmtShort } from "@/lib/dates";
import type { Exchange } from "@/lib/types";

type Props = { exchanges: Exchange[]; onChange: () => void };

const dow = (s: string) => DOW[new Date(`${s}T00:00:00Z`).getUTCDay()];

export default function ExchangePanel({ exchanges, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [otDate, setOtDate] = useState("");
  const [restDate, setRestDate] = useState("");
  const [hours, setHours] = useState<4 | 8>(8);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function add() {
    setError("");
    const res = await fetch("/api/exchanges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otDate, restDate, hours, note }),
    });
    if (!res.ok) return setError(((await res.json()) as { error: string }).error);
    setOtDate("");
    setRestDate("");
    setNote("");
    setOpen(false);
    onChange();
  }

  async function remove(x: Exchange) {
    if (!confirm(`Delete exchange ${x.hours}h from ${x.otDate} → rest ${x.restDate}?`)) return;
    await fetch(`/api/exchanges/${x.id}`, { method: "DELETE" });
    onChange();
  }

  const input = "rounded border border-slate-300 px-2 py-1 text-sm";
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">Exchanges</h2>
        <span className="text-xs text-slate-500">
          4h or 8h of consecutive OT from one day → rest. Those hours lose the base pay; the allowance stays.
        </span>
        {!open && (
          <button onClick={() => setOpen(true)} className="ml-auto text-sm text-sky-600 hover:underline">
            + add exchange
          </button>
        )}
      </div>

      {exchanges.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {exchanges.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-violet-100 px-1.5 text-xs font-semibold text-violet-800">⇄ {x.hours}h</span>
              OT on <b>{fmtShort(x.otDate)}</b> <span className="text-xs text-slate-500">{dow(x.otDate)}</span> → rest on{" "}
              <b>{fmtShort(x.restDate)}</b> <span className="text-xs text-slate-500">{dow(x.restDate)}</span>
              {x.note && <span className="text-slate-500">· {x.note}</span>}
              <button onClick={() => remove(x)} className="text-xs text-red-500 hover:underline">
                delete
              </button>
            </li>
          ))}
        </ul>
      )}
      {exchanges.length === 0 && !open && <p className="mt-1 text-sm text-slate-400">No exchanges in these weeks.</p>}

      {open && (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-md bg-violet-50 p-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">OT day (hours taken from)</span>
            <input type="date" className={input} value={otDate} onChange={(e) => setOtDate(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Rest day</span>
            <input type="date" className={input} value={restDate} onChange={(e) => setRestDate(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Hours</span>
            <select className={input} value={hours} onChange={(e) => setHours(Number(e.target.value) as 4 | 8)}>
              <option value={8}>8 hours (full day)</option>
              <option value={4}>4 hours (half day)</option>
            </select>
          </label>
          <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
            <span className="text-xs text-slate-500">Note</span>
            <input className={input} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button onClick={add} className="rounded bg-violet-600 px-3 py-1.5 font-medium text-white hover:bg-violet-700">
            Add
          </button>
          <button onClick={() => setOpen(false)} className="rounded px-3 py-1.5 text-slate-600 hover:bg-slate-200">
            Cancel
          </button>
          {error && <p className="w-full text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
