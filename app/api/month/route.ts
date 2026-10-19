import { NextResponse } from "next/server";
import { calcMonth } from "@/lib/calc";
import { periodOf, todayLocal } from "@/lib/dates";
import { baseHourlyOn } from "@/lib/salary";
import { getAllowances, getBamawlDays, getChanges, getEntries, getExchanges, getNotes, getOtRequests, getSettings, getTaxiRequests } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams.get("p");
  const period = p && /^\d{4}-\d{2}$/.test(p) ? p : periodOf(todayLocal());
  const [settings, bamawl, entries, notes, reqMap, exchanges, allowMap, taxiMap, changes] = await Promise.all([
    getSettings(),
    getBamawlDays(),
    getEntries(),
    getNotes(),
    getOtRequests(),
    getExchanges(),
    getAllowances(),
    getTaxiRequests(),
    getChanges(),
  ]);
  const taxi = Object.values(taxiMap);
  const allowances = Object.values(allowMap);
  const requests = Object.values(reqMap);
  // Salary is used here on the server; only pay results go to the browser.
  const month = calcMonth(period, { settings, bamawl, entries, notes, requests, allowances, taxi, exchanges, baseHourlyOn });
  return NextResponse.json({ ...month, changes });
}
