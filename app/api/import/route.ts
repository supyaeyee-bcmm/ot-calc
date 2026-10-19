import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { parseAny } from "@/lib/bamawl";
import { diffAllowances, diffCalendar, diffRequests, diffTaxi } from "@/lib/importDiff";
import * as store from "@/lib/store";
import type { FieldChange, ImportDiff, ImportLog } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Last applied import (for the Import page). */
export async function GET() {
  return NextResponse.json(await store.getLastImport());
}

/**
 * POST ?preview=1 → compare only, nothing saved.
 * POST            → save, keep the changed fields as unseen "updated" marks, remember as last import.
 */
export async function POST(req: Request) {
  const preview = new URL(req.url).searchParams.get("preview") === "1";
  try {
    const parsed = parseAny(await req.text());
    let diff: ImportDiff;
    let save: () => Promise<void>;
    if (parsed.kind === "taxi") {
      diff = diffTaxi(parsed.taxi, await store.getTaxiRequests());
      save = () => store.upsertTaxiRequests(parsed.taxi);
    } else if (parsed.kind === "allowances") {
      diff = diffAllowances(parsed.allowances, await store.getAllowances());
      save = () => store.upsertAllowances(parsed.allowances);
    } else if (parsed.kind === "requests") {
      diff = diffRequests(parsed.requests, await store.getOtRequests());
      save = () => store.upsertOtRequests(parsed.requests);
    } else {
      diff = diffCalendar(parsed.days, await store.getBamawlDays());
      save = () => store.upsertBamawlDays(parsed.days);
    }
    if (diff.total === 0) return NextResponse.json({ error: "Nothing found in the JSON." }, { status: 400 });
    if (preview) return NextResponse.json(diff);

    await save();
    const at = new Date().toISOString();
    // Marks: every changed field, plus new requests (new calendar days are not marked — a new month would mark every day).
    const marks: FieldChange[] = diff.changed.map((c) => ({ ...c, id: randomUUID(), at }));
    if (diff.kind !== "calendar") {
      for (const a of diff.added) {
        marks.push({ id: randomUUID(), at, kind: diff.kind, key: a.key, date: a.date, field: "new", label: "New", before: "—", after: a.text });
      }
    }
    await store.addChanges(marks);
    const log: ImportLog = { ...diff, at };
    await store.setLastImport(log);
    return NextResponse.json(log);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
