import { NextResponse } from "next/server";
import { setNote } from "@/lib/store";
import { isTime } from "@/lib/time";

export async function PUT(req: Request) {
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  if (typeof b.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) {
    return NextResponse.json({ error: "Bad date" }, { status: 400 });
  }
  const elecOn = b.elecOn === true ? true : b.elecOn === false ? false : null;
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 500) : "";
  const claimOffice = b.claimOffice === true ? true : b.claimOffice === false ? false : null;
  const time = (v: unknown) => (isTime(v) ? v : null);
  await setNote({
    date: b.date,
    elecOn,
    note,
    claimOffice,
    inOverride: time(b.inOverride),
    outOverride: time(b.outOverride),
    inKeep: time(b.inKeep),
    outKeep: time(b.outKeep),
    hrAdjusted: b.hrAdjusted === true ? true : null,
  });
  return NextResponse.json({ ok: true });
}
