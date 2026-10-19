import { NextResponse } from "next/server";
import { deleteExchange } from "@/lib/store";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  return (await deleteExchange(params.id))
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}
