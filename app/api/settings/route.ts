import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/store";
import { isTime } from "@/lib/time";
import { FLOOR_MODES, FloorMode, Settings } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getSettings());
}

export async function PUT(req: Request) {
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const n = (v: unknown, min: number, max: number) => {
    const x = Number(v);
    return Number.isInteger(x) && x >= min && x <= max ? x : null;
  };
  const floorMinutes = n(b.floorMinutes, 1, 60);
  const weeklyLimitMinutes = n(b.weeklyLimitMinutes, 0, 168 * 60);
  const weekendLunchMinutes = n(b.weekendLunchMinutes, 0, 180);
  const weekStartDay = n(b.weekStartDay, 0, 6);
  const taxiFee = n(b.taxiFee, 0, 1000000);
  if (
    typeof b.floorMode !== "string" ||
    !(b.floorMode in FLOOR_MODES) ||
    floorMinutes === null ||
    weeklyLimitMinutes === null ||
    weekendLunchMinutes === null ||
    weekStartDay === null ||
    taxiFee === null ||
    !isTime(b.workStart) ||
    !isTime(b.workEnd)
  ) {
    return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
  }
  const s: Settings = { floorMode: b.floorMode as FloorMode, floorMinutes, weeklyLimitMinutes, weekendLunchMinutes, workStart: b.workStart, workEnd: b.workEnd, weekStartDay, taxiFee };
  await saveSettings(s);
  return NextResponse.json(s);
}
