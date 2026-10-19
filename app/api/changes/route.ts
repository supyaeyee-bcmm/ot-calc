import { NextResponse } from "next/server";
import { clearChanges } from "@/lib/store";

/** Mark import changes as seen: { date } for one day, {} for all. */
export async function POST(req: Request) {
  const b = ((await req.json().catch(() => null)) ?? {}) as { date?: unknown };
  const date = typeof b.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : undefined;
  await clearChanges(date);
  return NextResponse.json({ ok: true });
}
