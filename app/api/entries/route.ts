import { NextResponse } from "next/server";
import { addEntry } from "@/lib/store";
import { parseEntry } from "@/lib/validate";

export async function POST(req: Request) {
  const e = parseEntry(await req.json().catch(() => null));
  if (typeof e === "string") return NextResponse.json({ error: e }, { status: 400 });
  return NextResponse.json(await addEntry(e));
}
