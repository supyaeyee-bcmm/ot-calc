import { AllowanceRequest, BamawlDay, OtRequest, TaxiRequest } from "./types";
import { allowanceKind } from "./checks";
import { toMin } from "./time";

type RawRecord = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const time = (v: unknown) => (/^\d{1,2}:\d{2}$/.test(str(v)) ? str(v).padStart(5, "0") : null);

export type Parsed =
  | { kind: "calendar"; days: BamawlDay[] }
  | { kind: "requests"; requests: OtRequest[] }
  | { kind: "allowances"; allowances: AllowanceRequest[] }
  | { kind: "taxi"; taxi: TaxiRequest[] };

/** Detect which Bamawl JSON this is: attendance calendar or after-overtime-request list. */
export function parseAny(text: string): Parsed {
  const json = JSON.parse(text) as { data?: { data?: unknown } } | null;
  const inner = json?.data?.data;
  if (Array.isArray(inner) && inner.some((r) => (r as RawRecord)?.overtime_date)) {
    return { kind: "requests", requests: parseRequests(inner as RawRecord[]) };
  }
  if (Array.isArray(inner) && inner.some((r) => (r as RawRecord)?.request_type_label !== undefined && (r as RawRecord)?.fee !== undefined)) {
    return { kind: "taxi", taxi: parseTaxi(inner as RawRecord[]) };
  }
  if (Array.isArray(inner) && inner.some((r) => (r as RawRecord)?.allowance_request_id !== undefined)) {
    return { kind: "allowances", allowances: parseAllowances(inner as RawRecord[]) };
  }
  return { kind: "calendar", days: parseBamawl(text) };
}

function parseTaxi(rows: RawRecord[]): TaxiRequest[] {
  const now = new Date().toISOString();
  return rows
    .filter((r) => r.id !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(str(r.date)))
    .map((r) => {
      const status = str(r.status);
      const fee = Number(r.fee);
      return {
        id: String(r.id),
        date: str(r.date),
        fee: Number.isFinite(fee) ? fee : null,
        type: str(r.request_type_label),
        status,
        rejected: /reject|denied|cancel|withdraw/i.test(status) || str(r.denied_reason) !== "",
        deniedReason: str(r.denied_reason),
        importedAt: now,
        raw: r,
      };
    });
}

function parseAllowances(rows: RawRecord[]): AllowanceRequest[] {
  const now = new Date().toISOString();
  return rows
    .filter((r) => r.allowance_request_id !== undefined && r.allowance_request_id !== null)
    .map((r) => {
      const status = str(r.approver_status);
      const dates = (Array.isArray(r.allowance_request_date) ? r.allowance_request_date : [r.allowance_request_date])
        .map(str)
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
      const amount = Number(r.total_amount);
      const name = str(r.allowance_name);
      return {
        id: String(r.allowance_request_id),
        dates,
        name,
        kind: allowanceKind(name),
        amount: Number.isFinite(amount) ? amount : null,
        payment: str(r.allowance_payment),
        status,
        rejected: /reject|denied|cancel/i.test(status) || str(r.denied_reason) !== "",
        description: str(r.description),
        importedAt: now,
        raw: r,
      };
    })
    .filter((a) => a.dates.length > 0);
}

function parseRequests(rows: RawRecord[]): OtRequest[] {
  const now = new Date().toISOString();
  return rows
    .filter((r) => str(r.employee_overtime_id) && /^\d{4}-\d{2}-\d{2}$/.test(str(r.overtime_date)))
    .map((r) => {
      const status = str(r.approver_status);
      const amounts = Array.isArray(r.overtime_amount) ? r.overtime_amount : [];
      const amount = Number(amounts[0]);
      return {
        id: str(r.employee_overtime_id),
        date: str(r.overtime_date),
        minutes: toMin(str(r.overtime_time)) ?? 0,
        status,
        rejected: /reject|denied|cancel/i.test(status) || str(r.denied_reason) !== "",
        remark: str(r.remark),
        amount: Number.isFinite(amount) ? amount : null,
        importedAt: now,
        raw: r,
      };
    });
}

/** Parse the attendance-calendar JSON ({status, data:[...]} or a bare array). */
export function parseBamawl(text: string): BamawlDay[] {
  const json = JSON.parse(text) as unknown;
  const rows = Array.isArray(json) ? json : (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(rows)) throw new Error("No `data` array found in the JSON.");
  const now = new Date().toISOString();
  return (rows as RawRecord[])
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(str(r.start)))
    .map((r) => ({
      date: str(r.start),
      holiday: str(r.classNames) === "holiday",
      shift: str(r.shift),
      inTime: time(r.in_hour),
      outTime: time(r.out_hour),
      manualIn: str(r.forget_card_access_in) === "1",
      manualOut: str(r.forget_card_access_out) === "1",
      inDes: str(r.in_des),
      outDes: str(r.out_des),
      tripDes: str(r.trip_des),
      leaveName: str(r.leave_name),
      leaveDes: str(r.leave_des),
      exchange: r.exchange === true,
      exchangeWay: str(r.exchange_way),
      originDate: str(r.origin_date),
      raw: r,
      importedAt: now,
    }));
}
