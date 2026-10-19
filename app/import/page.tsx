"use client";

import { useEffect, useState } from "react";
import { fmtAt } from "@/lib/time";
import { IMPORT_KIND_LABEL } from "@/lib/types";
import type { ImportDiff, ImportLog } from "@/lib/types";


export default function ImportPage() {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ImportDiff | null>(null);
  const [last, setLast] = useState<ImportLog | null>(null);
  const [justApplied, setJustApplied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/import")
      .then((r) => r.json())
      .then((j) => setLast(j as ImportLog | null))
      .catch(() => undefined);
  }, []);

  async function call(apply: boolean) {
    setBusy(true);
    setError("");
    const res = await fetch(apply ? "/api/import" : "/api/import?preview=1", { method: "POST", body: text });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError((json as { error: string }).error);
    if (apply) {
      setLast(json as ImportLog);
      setJustApplied(true);
      setPreview(null);
      setText("");
    } else {
      setJustApplied(false);
      setPreview(json as ImportDiff);
    }
  }

  async function onFile(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    setText(await f.text());
    setPreview(null);
  }

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-xl font-bold">Import from Bamawl</h1>
      <p className="text-sm text-slate-600">Four kinds of JSON are accepted. The app detects which one you give it.</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
        <li>
          <b>Attendance Calendar</b> (one month) — your office IN/OUT times and holidays.
        </li>
        <li>
          <b>After Overtime Request list</b> — the OT you submitted. Import every page. Weekday office time after 17:00
          only counts as OT on days that have a request (or that you mark by hand).
        </li>
        <li>
          <b>Allowance Request list</b> — the allowances you submitted. Used by the request checker on the month page.
        </li>
        <li>
          <b>Taxi Fee Request list</b> (HR → Office Management → Taxi Fee Request) — checked against 🚕 taxi-eligible days.
        </li>
      </ul>
      <p className="text-sm text-slate-500">
        How: open the Bamawl page, press F12 → Network, find the request that returns the JSON, copy its response and
        paste it below (or choose the .json file). Click <b>Preview</b> to see what would change — nothing is saved until
        you click <b>Apply</b>. Your own entries, notes and exchanges are never touched.
      </p>

      <input type="file" accept=".json,application/json" onChange={(e) => onFile(e.target.files)} className="text-sm" />

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPreview(null);
        }}
        placeholder='{"status":"OK","data":[ ... ]}'
        className="h-48 w-full rounded border border-slate-300 p-2 font-mono text-xs"
      />
      <button
        onClick={() => call(false)}
        disabled={busy || !text.trim()}
        className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
      >
        Preview
      </button>

      {error && <p className="text-red-600">Error: {error}</p>}

      {preview && (
        <section className="space-y-3 rounded-lg border border-sky-300 bg-white p-4">
          <h2 className="font-semibold">Preview — {IMPORT_KIND_LABEL[preview.kind]} (not saved yet)</h2>
          <DiffView diff={preview} />
          <div className="flex gap-2">
            <button
              onClick={() => call(true)}
              disabled={busy}
              className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Apply import
            </button>
            <button onClick={() => setPreview(null)} className="rounded px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
          </div>
        </section>
      )}

      {last && (
        <section className={`space-y-3 rounded-lg border p-4 ${justApplied ? "border-emerald-300 bg-emerald-50" : "bg-white"}`}>
          <h2 className="font-semibold">
            {justApplied ? "✓ Saved — " : "Last import — "}
            {IMPORT_KIND_LABEL[last.kind]} · {fmtAt(last.at)}
          </h2>
          <DiffView diff={last} />
          {last.changed.length > 0 && (
            <p className="text-xs text-slate-500">Changed days show a blue ● on the month page until you click “seen”.</p>
          )}
        </section>
      )}
    </div>
  );
}

function DiffView({ diff }: { diff: ImportDiff }) {
  const changedKeys = new Set(diff.changed.map((c) => c.key)).size;
  return (
    <div className="space-y-3 text-sm">
      <p>
        <b>{diff.total}</b> in file · <span className="text-emerald-700">{diff.added.length} new</span> ·{" "}
        <span className="text-sky-700">{changedKeys} changed</span> · <span className="text-slate-500">{diff.unchanged} unchanged</span>
      </p>

      {diff.changed.length > 0 && (
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100 text-slate-500">
            <tr>
              <th className="px-2 py-1">{diff.kind === "calendar" ? "Date" : "Date / ID"}</th>
              <th className="px-2 py-1">Field</th>
              <th className="px-2 py-1">Before</th>
              <th className="px-2 py-1">After</th>
            </tr>
          </thead>
          <tbody>
            {diff.changed.map((c, i) => (
              <tr key={i} className="border-t">
                <td className="px-2 py-1 whitespace-nowrap">
                  {c.date}
                  {diff.kind !== "calendar" && <span className="text-slate-400"> #{c.key}</span>}
                </td>
                <td className="px-2 py-1 font-medium">{c.label}</td>
                <td className="px-2 py-1 text-slate-500 line-through decoration-slate-300">{c.before}</td>
                <td className="px-2 py-1 font-semibold text-sky-800">{c.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {diff.added.length > 0 && (
        <details>
          <summary className="cursor-pointer text-emerald-700">{diff.added.length} new</summary>
          <ul className="mt-1 space-y-0.5 pl-4 text-xs text-slate-600">
            {diff.added.map((a) => (
              <li key={a.key}>
                {a.date}
                {diff.kind !== "calendar" && <span className="text-slate-400"> #{a.key}</span>} — {a.text}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
