import { NextResponse } from "next/server";
import * as json from "@/lib/store-json";
import * as sb from "@/lib/store-supabase";

// One-time copy: data/*.json → Supabase (always, whatever OT_STORAGE says). Delete after the move.
export async function POST() {
  const [days, reqs, allows, taxi, entries, notes, exchanges, settings] = await Promise.all([
    json.getBamawlDays(),
    json.getOtRequests(),
    json.getAllowances(),
    json.getTaxiRequests(),
    json.getEntries(),
    json.getNotes(),
    json.getExchanges(),
    json.getSettings(),
  ]);

  await sb.upsertBamawlDays(Object.values(days));
  await sb.upsertOtRequests(Object.values(reqs));
  await sb.upsertAllowances(Object.values(allows));
  await sb.upsertTaxiRequests(Object.values(taxi));
  for (const n of Object.values(notes)) await sb.setNote({ ...n, elecOn: n.elecOn ?? null, note: n.note ?? "" });
  await sb.saveSettings(settings);

  // Inserts keep their ids; only copied when the table is still empty, so a re-run can't duplicate.
  let entriesCopied = 0;
  if ((await sb.getEntries()).length === 0) {
    for (const e of entries) await sb.addEntry(e);
    entriesCopied = entries.length;
  }
  let exchangesCopied = 0;
  if ((await sb.getExchanges()).length === 0) {
    for (const x of exchanges) await sb.addExchange(x);
    exchangesCopied = exchanges.length;
  }

  return NextResponse.json({
    bamawlDays: Object.keys(days).length,
    otRequests: Object.keys(reqs).length,
    allowances: Object.keys(allows).length,
    taxi: Object.keys(taxi).length,
    notes: Object.keys(notes).length,
    entries: `${entriesCopied} of ${entries.length}`,
    exchanges: `${exchangesCopied} of ${exchanges.length}`,
    settings,
  });
}
