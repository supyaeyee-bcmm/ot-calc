import { NextResponse } from "next/server";
import { deleteEntry, updateEntry } from "@/lib/store";
import { parseEntry } from "@/lib/validate";

type Params = { params: { id: string } };

export async function PUT(req: Request, { params }: Params) {
  const e = parseEntry(await req.json().catch(() => null));
  if (typeof e === "string") return NextResponse.json({ error: e }, { status: 400 });
  const updated = await updateEntry(params.id, e);
  return updated ? NextResponse.json(updated) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: Params) {
  return (await deleteEntry(params.id))
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}
