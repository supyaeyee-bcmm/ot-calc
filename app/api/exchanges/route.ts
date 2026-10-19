import { NextResponse } from "next/server";
import { addExchange } from "@/lib/store";

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function POST(req: Request) {
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  if (!isDate(b.otDate) || !isDate(b.restDate)) return NextResponse.json({ error: "Pick both dates" }, { status: 400 });
  if (b.hours !== 4 && b.hours !== 8) return NextResponse.json({ error: "Hours must be 4 or 8" }, { status: 400 });
  if (b.otDate === b.restDate) return NextResponse.json({ error: "OT day and rest day must differ" }, { status: 400 });
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 200) : "";
  return NextResponse.json(await addExchange({ otDate: b.otDate, restDate: b.restDate, hours: b.hours, note }));
}
