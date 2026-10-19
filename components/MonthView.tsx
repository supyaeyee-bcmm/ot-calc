"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import EntryForm from "./EntryForm";
import ExchangePanel from "./ExchangePanel";
import { DOW, fmtShort, periodLabel, shiftPeriod } from "@/lib/dates";
import { fmtAt, fmtClock, fmtHM, fmtMMK } from "@/lib/time";
import { BAND_BONUS, FLOOR_MODES, bandLabel } from "@/lib/types";
import type { Band, DayNote, DayResult, Entry, FieldChange, MonthResult, RequestCheck, WeekResult } from "@/lib/types";

type Editing = { date: string; entry?: Entry } | null;

export default function MonthView() {
  const [period, setPeriod] = useState<string | null>(null);
  const [data, setData] = useState<MonthResult | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Editing>(null);
  const [showPay, setShowPay] = useState(false); // pay hidden by default

  // Period lives in the URL (?p=2026-10) so reloads keep it.
  useEffect(() => {
    setPeriod(new URLSearchParams(window.location.search).get("p") ?? "");
  }, []);

  const load = useCallback(async () => {
    if (period === null) return;
    const res = await fetch(`/api/month${period ? `?p=${period}` : ""}`);
    if (!res.ok) return setError("Could not load data");
    const json = (await res.json()) as MonthResult;
    setData(json);
    setError("");
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  function go(n: number) {
    if (!data) return;
    const p = shiftPeriod(data.period, n);
    window.history.replaceState(null, "", `?p=${p}`);
    setEditing(null);
    setPeriod(p);
  }

  /** Mark import changes as seen (one day, or all). */
  async function seen(date?: string) {
    await fetch("/api/changes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date }) });
    load();
  }

  async function saveNote(n: DayNote) {
    await fetch("/api/notes", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(n) });
    load();
  }

  async function remove(e: Entry) {
    if (!confirm(`Delete ${e.place} OT ${e.start}–${e.end} on ${e.date}?`)) return;
    await fetch(`/api/entries/${e.id}`, { method: "DELETE" });
    load();
  }

  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return <p className="text-slate-500">Loading…</p>;

  const weeksOver = data.weeks.filter((w) => w.over);
  const byWeek = new Map<string, DayResult[]>();
  for (const d of data.days) byWeek.set(d.weekStart, [...(byWeek.get(d.weekStart) ?? []), d]);

  const conflicts = data.days.filter((d) => d.times.inConflict || d.times.outConflict);
  const changesByDate = new Map<string, FieldChange[]>();
  for (const c of data.changes) changesByDate.set(c.date, [...(changesByDate.get(c.date) ?? []), c]);
  const changeDays = Array.from(changesByDate.keys()).sort();

  return (
    <div className="space-y-5">
      {changeDays.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-4 py-2 text-sm text-sky-900">
          <span className="text-sky-600">●</span> Updated by import on {changeDays.length} day{changeDays.length > 1 ? "s" : ""}:{" "}
          <b>{changeDays.map(fmtShort).join(", ")}</b>
          <button onClick={() => seen()} className="ml-auto rounded border border-sky-300 bg-white px-2 py-0.5 text-xs hover:bg-sky-100">
            mark all seen
          </button>
        </div>
      )}
      {conflicts.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          ⚠ Bamawl now has its own IN/OUT on {conflicts.length} day{conflicts.length > 1 ? "s" : ""} where you typed a time:{" "}
          <b>{conflicts.map((d) => fmtShort(d.date)).join(", ")}</b>. Choose which one to use on each day below.
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => go(-1)} className="rounded border bg-white px-3 py-1 hover:bg-slate-100">
          ◀
        </button>
        <div>
          <h1 className="text-xl font-bold">{periodLabel(data.period)}</h1>
          <p className="text-sm text-slate-500">
            {fmtShort(data.start)} – {fmtShort(data.end)} · floor: {data.settings.floorMinutes} min,{" "}
            {FLOOR_MODES[data.settings.floorMode]}
          </p>
        </div>
        <button onClick={() => go(1)} className="rounded border bg-white px-3 py-1 hover:bg-slate-100">
          ▶
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card
          label="OT hours (my calc)"
          value={fmtHM(data.totals.minutes)}
          sub={data.totals.exchangedMinutes > 0 ? `${fmtHM(data.totals.exchangedMinutes)} exchanged for rest` : undefined}
        />
        <Card
          label="Request check"
          value={`${data.totals.checksOk} ✓  ${data.totals.checksBad} ✗`}
          alert={data.totals.checksBad > 0}
          sub={`OT requests submitted: ${fmtHM(data.totals.submittedMinutes)}`}
        />
        <Card
          label="OT pay (MMK)"
          value={!showPay ? "••••••" : data.totals.pay === null ? "—" : fmtMMK(data.totals.pay)}
          action={
            <button
              onClick={() => setShowPay(!showPay)}
              title={showPay ? "Hide pay" : "Show pay"}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <EyeIcon open={showPay} />
            </button>
          }
        />
        <Card
          label="Days with OT"
          value={String(data.totals.daysWithOt)}
          sub={
            data.totals.taxiDays > 0 || data.totals.taxiRequested > 0
              ? `🚕 ${data.totals.taxiDays} taxi-eligible · ${fmtMMK(data.totals.taxiRequested)} requested`
              : undefined
          }
        />
        <Card
          label={`Weeks over ${fmtHM(data.settings.weeklyLimitMinutes)}`}
          value={String(weeksOver.length)}
          alert={weeksOver.length > 0}
        />
      </div>

      <ExchangePanel exchanges={data.exchanges} onChange={load} />

      <div className="space-y-4">
        {data.weeks.map((w) => {
          const days = byWeek.get(w.start);
          if (!days) return null;
          return (
            <section key={w.start} className={`overflow-hidden rounded-lg border bg-white ${w.over ? "border-red-300" : ""}`}>
              <WeekHeader week={w} limit={data.settings.weeklyLimitMinutes} />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[60rem] table-fixed text-sm">
                  <colgroup>
                    <col className="w-28" />
                    <col className="w-32" />
                    <col />
                    <col className="w-20" />
                    <col className="w-44" />
                    <col className="w-64" />
                    <col className="w-16" />
                    <col className="w-32" />
                  </colgroup>
                  <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-400">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">Date</th>
                      <th className="px-3 py-1.5 font-medium">Office in–out</th>
                      <th className="px-3 py-1.5 font-medium">OT time</th>
                      <th className="px-3 py-1.5 text-right font-medium">Floored</th>
                      <th className="px-3 py-1.5 font-medium">OT + allowance</th>
                      <th className="px-3 py-1.5 font-medium" title="What to submit in Bamawl, checked against what you imported">
                        Bamawl requests
                      </th>
                      <th className="px-3 py-1.5 font-medium">Elec</th>
                      <th className="px-3 py-1.5 font-medium">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((d) => (
                      <DayRows
                        key={d.date}
                        day={d}
                        editing={editing?.date === d.date ? editing : null}
                        onAdd={() => setEditing({ date: d.date })}
                        onEdit={(entry) => setEditing({ date: d.date, entry })}
                        onRemove={remove}
                        onCloseForm={() => setEditing(null)}
                        onSaved={() => {
                          setEditing(null);
                          load();
                        }}
                        onNote={saveNote}
                        changes={changesByDate.get(d.date) ?? []}
                        onSeen={() => seen(d.date)}
                        showPay={showPay}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

type CardProps = { label: string; value: string; sub?: string; alert?: boolean; action?: ReactNode };

function Card({ label, value, sub, alert, action }: CardProps) {
  return (
    <div className={`rounded-lg border p-3 ${alert ? "border-red-300 bg-red-50" : "bg-white"}`}>
      <div className="flex items-center justify-between text-xs text-slate-500">
        {label}
        {action}
      </div>
      <div className={`text-2xl font-semibold ${alert ? "text-red-700" : ""}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {!open && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  );
}

function WeekHeader({ week, limit }: { week: WeekResult; limit: number }) {
  const pct = limit > 0 ? Math.min(100, (week.minutes / limit) * 100) : 0;
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 ${week.over ? "bg-red-50" : "bg-slate-100"}`}>
      <div className={`font-semibold ${week.over ? "text-red-800" : "text-slate-700"}`}>
        Week {fmtShort(week.start)} – {fmtShort(week.end)}
      </div>
      <div className="flex items-center gap-2 text-sm">
        <div className="h-2 w-32 overflow-hidden rounded-full bg-white">
          <div className={`h-full ${week.over ? "bg-red-500" : "bg-sky-500"}`} style={{ width: `${pct}%` }} />
        </div>
        <span className={week.over ? "font-semibold text-red-700" : "text-slate-600"}>
          {fmtHM(week.minutes)} / {fmtHM(limit)}
        </span>
        {week.over && <span className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">OVER LIMIT</span>}
        {week.exchangedMinutes > 0 && <span className="text-xs text-violet-700">⇄ {fmtHM(week.exchangedMinutes)} exchanged</span>}
      </div>
      {week.over && (
        <div className="text-xs text-red-700">
          over by {fmtHM(week.minutes - limit)} → exchange {week.exchangeHint.map((h) => `${h}h`).join(" + ")}
        </div>
      )}
      {week.partial && <div className="text-xs text-slate-500">includes days outside this salary month</div>}
    </div>
  );
}

type ConflictProps = { label: string; typed: string; bamawl: string; onUseBamawl: () => void; onKeep: () => void };

/** Bamawl now has its own time that differs from the one typed by hand: let the user pick. */
function Conflict({ label, typed, bamawl, onUseBamawl, onKeep }: ConflictProps) {
  return (
    <div className="mt-1 whitespace-normal rounded border border-amber-300 bg-amber-50 p-1.5 text-[11px] text-amber-900">
      ⚠ Bamawl {label} is now <b>{bamawl}</b> (you typed <b>{typed}</b>)
      <div className="mt-1 flex flex-wrap gap-1 whitespace-nowrap">
        <button onClick={onUseBamawl} className="rounded bg-amber-600 px-1.5 py-0.5 font-medium text-white hover:bg-amber-700">
          use Bamawl
        </button>
        <button onClick={onKeep} className="rounded border border-amber-300 px-1.5 py-0.5 text-amber-800 hover:bg-amber-100">
          keep mine
        </button>
      </div>
    </div>
  );
}

/** A clock time; orange when typed by hand instead of coming from Bamawl; blue dot when changed by an import. */
function Time({ value, manual, change }: { value: string; manual: boolean; change?: FieldChange }) {
  const dot = change && (
    <span className="text-sky-600" title={`Updated by import ${fmtAt(change.at)} · was: ${change.before}`}>
      ●
    </span>
  );
  return manual ? (
    <span className="font-medium text-orange-600" title="Typed by hand (e.g. from the team OT sheet), not Bamawl">
      {value}
      {dot}
    </span>
  ) : (
    <>
      {value}
      {dot}
    </>
  );
}

const CHECK_STYLE: Record<RequestCheck["status"], { icon: string; cls: string }> = {
  ok: { icon: "✓", cls: "text-emerald-700" },
  missing: { icon: "✗", cls: "text-red-700" },
  wrong: { icon: "✗", cls: "text-red-700" },
  rejected: { icon: "✗", cls: "text-red-700" },
  extra: { icon: "⚠", cls: "text-amber-700" },
  info: { icon: "•", cls: "text-slate-500" },
};

/** Request checker lines for one day. */
function Checks({ checks, showPay }: { checks: RequestCheck[]; showPay: boolean }) {
  if (!checks.length) return null;
  const amount = (c: RequestCheck, v: number | null) => (v === null ? "" : c.secretAmount && !showPay ? "•••" : fmtMMK(v));
  return (
    <div className="flex flex-col gap-1 text-xs">
      {checks.map((c, i) => {
        const st = CHECK_STYLE[c.status];
        const bad = c.status === "missing" || c.status === "wrong" || c.status === "rejected";
        return (
          <div
            key={i}
            className={`rounded px-1.5 py-0.5 ${bad ? "bg-red-50" : c.status === "extra" ? "bg-amber-50" : ""}`}
            title={`expected: ${c.expected || "—"} ${amount(c, c.expectedAmount)} | submitted: ${c.submitted || "—"} ${amount(c, c.submittedAmount)}`}
          >
            <span className={`font-semibold ${st.cls}`}>{st.icon}</span> <span className="font-medium">{c.label}</span>{" "}
            <span className="text-slate-600">{c.status === "ok" ? c.submitted : c.expected}</span>
            {c.note && <div className={`pl-3 ${st.cls}`}>{c.note}</div>}
          </div>
        );
      })}
    </div>
  );
}

type DayRowsProps = {
  day: DayResult;
  editing: Editing;
  onAdd: () => void;
  onEdit: (e: Entry) => void;
  onRemove: (e: Entry) => void;
  onCloseForm: () => void;
  onSaved: () => void;
  onNote: (n: DayNote) => void;
  changes: FieldChange[];
  onSeen: () => void;
  showPay: boolean;
};

function DayRows({ day: d, editing, onAdd, onEdit, onRemove, onCloseForm, onSaved, onNote, showPay, changes, onSeen }: DayRowsProps) {
  const changeOf = (field: string) => changes.find((c) => c.kind === "calendar" && c.field === field);
  const off = d.dayType !== "weekday";
  const b = d.bamawl;
  const note: DayNote = d.note ?? { date: d.date, elecOn: null, note: "" };
  const [noteText, setNoteText] = useState(note.note);
  useEffect(() => setNoteText(note.note), [note.note]);

  const t = d.times;
  const claim = (v: boolean | null) => onNote({ ...note, note: noteText, claimOffice: v });

  function editTimes() {
    const ok = (v: string) => v === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
    const i = prompt("Office IN (HH:MM), typed by hand, not Bamawl. Leave empty to use Bamawl.", note.inOverride ?? "");
    if (i === null) return;
    const o = prompt("Office OUT (HH:MM), typed by hand, not Bamawl. Leave empty to use Bamawl.", note.outOverride ?? "");
    if (o === null) return;
    if (!ok(i.trim()) || !ok(o.trim())) return alert("Use HH:MM, e.g. 17:50");
    onNote({ ...note, note: noteText, inOverride: i.trim() || null, outOverride: o.trim() || null, inKeep: null, outKeep: null });
  }
  // Click: auto value → set the opposite by hand; by hand yes → no → back to auto.
  const elec = d.elec;
  const nextElec = note.elecOn === null ? (elec.on === null ? true : !elec.on) : note.elecOn ? false : null;

  return (
    <>
      <tr className={`border-t align-top ${off ? "bg-slate-50/70" : ""}`}>
        <td className="whitespace-nowrap px-3 py-2">
          <div className={`font-medium ${off ? "text-red-600" : ""}`}>
            {fmtShort(d.date)} <span className="text-xs">{DOW[d.dow]}</span>
          </div>
          {d.holidayName && <div className="text-xs text-red-600">{d.holidayName}</div>}
          {changes.length > 0 && (
            <div className="mt-1 flex items-center gap-1 text-xs">
              <span
                className="cursor-help rounded bg-sky-100 px-1.5 font-medium text-sky-800"
                title={changes.map((c) => `${c.label}: ${c.before} → ${c.after}  (${c.kind}, ${fmtAt(c.at)})`).join("\n")}
              >
                ● updated
              </span>
              <button onClick={onSeen} className="text-sky-600 hover:underline">
                seen
              </button>
            </div>
          )}
          {d.taxi.eligible && (
            <div
              className="mt-1 inline-block rounded bg-yellow-100 px-1.5 text-xs font-medium text-yellow-900"
              title={`Office OT ended ${fmtClock(d.taxi.officeEnd ?? 0)} (19:00 or later): taxi fee for the trip home can be requested in Bamawl — needs approval in advance.`}
            >
              🚕 taxi eligible
            </div>
          )}
          {d.taxi.notes.map((n) => (
            <div key={n} className="whitespace-normal text-[11px] text-amber-700">
              ⚠ {n}
            </div>
          ))}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-slate-600">
          {t.in ? (
            <span>
              <Time value={t.in} manual={t.inManual} change={changeOf("inTime")} />–
              {t.out ? <Time value={t.out} manual={t.outManual} change={changeOf("outTime")} /> : "?"}
              {(b?.manualIn || b?.manualOut) && <span title="Time set by HR (forgot scan)"> *</span>}
            </span>
          ) : (
            <span className="text-slate-300">—</span>
          )}
          <div className="flex gap-2 text-[11px]">
            <button onClick={editTimes} className="text-slate-300 hover:text-sky-600" title="Type office IN/OUT by hand (not Bamawl)">
              edit
            </button>
            <button
              onClick={() => onNote({ ...note, note: noteText, hrAdjusted: !t.hrAdjusted })}
              className={t.hrAdjusted ? "font-medium text-violet-700" : "text-slate-300 hover:text-violet-600"}
              title="Bamawl IN/OUT here is the time HR asked for (e.g. forget-card OUT incl. home OT), not the real one. Count only the typed times + entries. Click to toggle."
            >
              {t.hrAdjusted ? "⇆ HR-adjusted" : "HR-adj"}
            </button>
          </div>
          {t.hrAdjusted ? (
            (t.bamawlIn || t.bamawlOut) && (
              <div className="text-[11px] text-violet-700">
                Bamawl: {t.bamawlIn || "—"}–{t.bamawlOut || "—"}
              </div>
            )
          ) : (
            (t.inManual || t.outManual) && <div className="text-[11px] text-orange-600">✎ typed, not Bamawl</div>
          )}
          {t.inConflict && (
            <Conflict
              label="IN"
              typed={note.inOverride ?? ""}
              bamawl={t.bamawlIn ?? ""}
              onUseBamawl={() => onNote({ ...note, note: noteText, inOverride: null, inKeep: null })}
              onKeep={() => onNote({ ...note, note: noteText, inKeep: t.bamawlIn })}
            />
          )}
          {t.outConflict && (
            <Conflict
              label="OUT"
              typed={note.outOverride ?? ""}
              bamawl={t.bamawlOut ?? ""}
              onUseBamawl={() => onNote({ ...note, note: noteText, outOverride: null, outKeep: null })}
              onKeep={() => onNote({ ...note, note: noteText, outKeep: t.bamawlOut })}
            />
          )}
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-col gap-1">
            {d.segments.map((s, i) => (
              <span key={i} className="whitespace-nowrap">
                {fmtClock(s.start)}–{fmtClock(s.end)}{" "}
                <span
                  className={`rounded px-1.5 text-xs ${
                    s.source === "home" ? "bg-emerald-100 text-emerald-800" : s.source === "office" ? "bg-sky-100 text-sky-800" : "bg-violet-100 text-violet-800"
                  }`}
                >
                  {s.source}
                </span>
              </span>
            ))}
            {d.unclaimed.map((s, i) => (
              <span key={`u${i}`} className="text-slate-400">
                <span className="line-through">
                  {fmtClock(s.start)}–{fmtClock(s.end)}
                </span>{" "}
                <span className="rounded bg-slate-100 px-1.5 text-xs">not counted</span>{" "}
                <button onClick={() => claim(true)} className="text-xs text-sky-600 hover:underline">
                  count as OT
                </button>
              </span>
            ))}
            {d.officeClaim === "request" && (
              <span className="text-xs text-emerald-700">
                ✓ office time counted (OT request in Bamawl){" "}
                <button onClick={() => claim(false)} className="text-slate-400 hover:underline">
                  don&apos;t count
                </button>
              </span>
            )}
            {(d.officeClaim === "manual_yes" || d.officeClaim === "manual_no") && (
              <span className="text-xs text-slate-500">
                office time {d.officeClaim === "manual_yes" ? "counted" : "not counted"} (set by hand){" "}
                <button onClick={() => claim(null)} className="text-sky-600 hover:underline">
                  reset
                </button>
              </span>
            )}
            {d.exchangesOut.map((x) => (
              <span key={x.id} className="text-xs font-medium text-violet-700">
                ⇄ {x.hours}h exchanged → rest on {fmtShort(x.restDate)}
              </span>
            ))}
            {d.restFor.map((x) => (
              <span key={x.id} className="self-start rounded bg-violet-100 px-1.5 text-xs font-medium text-violet-800">
                Rest day ({x.hours}h) ⇄ OT from {fmtShort(x.otDate)}
              </span>
            ))}
            {d.entries.map((e) => (
              <span key={e.id} className="text-xs text-slate-500">
                {e.place} {e.start}–{e.end}
                {e.breakMinutes > 0 && ` −${e.breakMinutes}m`}
                {e.task && ` · ${e.task}`}{" "}
                <button onClick={() => onEdit(e)} className="text-sky-600 hover:underline">
                  edit
                </button>{" "}
                <button onClick={() => onRemove(e)} className="text-red-500 hover:underline">
                  delete
                </button>
              </span>
            ))}
            {d.warnings.map((w) => (
              <span key={w} className="text-xs text-amber-700">
                ⚠ {w}
              </span>
            ))}
            {d.infos.map((w) => (
              <span key={w} className="text-xs text-slate-400">
                {w}
              </span>
            ))}
            {!editing && (
              <button onClick={onAdd} className="self-start text-xs text-sky-600 hover:underline">
                + add OT
              </button>
            )}
          </div>
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right">
          {d.flooredMinutes > 0 && <div className="font-semibold">{fmtHM(d.flooredMinutes)}</div>}
          {d.rawMinutes > 0 && d.rawMinutes !== d.flooredMinutes && (
            <div className="text-[11px] text-slate-400">raw {fmtHM(d.rawMinutes)}</div>
          )}
          {d.pay !== 0 && (
            <div className="text-[11px] text-slate-500" title="OT pay (MMK)">
              {d.pay === null ? "—" : showPay ? fmtMMK(d.pay) : "•••"}
            </div>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-xs">
          {d.flooredMinutes > 0 && (
            <>
              <div className="text-sm">
                OT <b>{fmtHM(d.payableMinutes)}</b>
                {d.exchangedMinutes > 0 && <span className="text-violet-700"> (−{fmtHM(d.exchangedMinutes)} ⇄)</span>}
              </div>
              {(Object.keys(d.bands) as Band[])
                .filter((k) => d.bands[k] > 0)
                .map((k) => (
                  <div key={k} className="text-slate-600">
                    + {fmtHM(d.bands[k])} × {fmtMMK(BAND_BONUS[off ? "off" : "weekday"][k])}{" "}
                    <span className="text-slate-400">{bandLabel(k, d.dayType)}</span>
                  </div>
                ))}
            </>
          )}
        </td>
        <td className="px-3 py-2">
          <Checks checks={d.checks} showPay={showPay} />
        </td>
        <td className="px-3 py-2">
          <button
            onClick={() => onNote({ ...note, note: noteText, elecOn: nextElec })}
            title={`Electricity 17:00–21:00 — ${elec.auto ? "guessed (1 day on, 1 day off)" : elec.on === null ? "not set" : "set by hand"}. Click to change.`}
            className={`rounded px-2 py-0.5 text-xs ${
              elec.on === null
                ? "text-slate-300 hover:bg-slate-100"
                : elec.auto
                ? `border border-dashed ${elec.on ? "border-yellow-400 text-yellow-700" : "border-slate-300 text-slate-400"}`
                : elec.on
                ? "bg-yellow-200 text-yellow-900"
                : "bg-slate-300 text-slate-700"
            }`}
          >
            {elec.on === true ? "⚡ yes" : elec.on === false ? "no" : "—"}
          </button>
        </td>
        <td className="px-3 py-2">
          <input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onBlur={() => noteText !== note.note && onNote({ ...note, note: noteText })}
            className="w-full rounded border border-transparent px-1 py-0.5 text-xs hover:border-slate-200 focus:border-slate-300"
          />
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={8} className="px-3 pb-3">
            <EntryForm date={d.date} offDay={off} entry={editing.entry} onDone={onSaved} onCancel={onCloseForm} />
          </td>
        </tr>
      )}
    </>
  );
}
