export type DayType = "weekday" | "weekend" | "holiday";
export type Band = "early" | "regular" | "midnight";
export type Place = "home" | "office";
export type FloorMode = "day_total" | "per_segment" | "clock_grid";

export const FLOOR_MODES: Record<FloorMode, string> = {
  day_total: "floor day total",
  per_segment: "floor each part",
  clock_grid: "snap to clock (start up, end down)",
};

/** One day from the Bamawl attendance-calendar JSON. */
export type BamawlDay = {
  date: string; // YYYY-MM-DD
  holiday: boolean;
  shift: string; // holiday name when holiday
  inTime: string | null; // HH:MM
  outTime: string | null;
  manualIn: boolean; // "forget card access" = time set by HR
  manualOut: boolean;
  inDes: string;
  outDes: string;
  tripDes: string;
  leaveName: string;
  leaveDes: string;
  exchange: boolean;
  exchangeWay: string;
  originDate: string;
  raw: unknown;
  importedAt: string;
};

/** OT that Bamawl does not record (home OT, or an office day that replaces Bamawl's times). */
export type Entry = {
  id: string;
  date: string;
  place: Place;
  start: string; // HH:MM
  end: string; // HH:MM, end <= start means next day
  breakMinutes: number;
  task: string;
  createdAt: string;
};

/** One submitted OT request from Bamawl (after-overtime-requests list). */
export type OtRequest = {
  id: string; // employee_overtime_id
  date: string;
  minutes: number; // overtime_time
  status: string; // approver_status, e.g. "Confirmed"
  rejected: boolean;
  remark: string;
  amount: number | null; // MMK, as Bamawl calculated it
  importedAt: string;
  raw: unknown;
};

/** Allowance type, sorted from the Bamawl allowance name by keywords. */
export type AllowanceKind = "holiday" | "holiday_midnight" | "weekday_midnight" | "substitute" | "unknown";

/** One submitted Allowance Request from Bamawl. Has no hours, only a total amount (may cover several days). */
export type AllowanceRequest = {
  id: string; // allowance_request_id
  dates: string[];
  name: string;
  kind: AllowanceKind;
  amount: number | null;
  payment: string; // "Pay"
  status: string; // approver_status
  rejected: boolean;
  description: string;
  importedAt: string;
  raw: unknown;
};

// ---------------- Import changes (preview → apply, "updated" marks until seen)
export type ImportKind = "calendar" | "requests" | "allowances" | "taxi";

export const IMPORT_KIND_LABEL: Record<ImportKind, string> = {
  calendar: "Attendance calendar",
  requests: "OT requests",
  allowances: "Allowance requests",
  taxi: "Taxi fee requests",
};

/** One field changed by an import (or a new request). Kept as an unseen mark until the user clicks "seen". */
export type FieldChange = {
  id: string;
  at: string; // when the import was applied (ISO)
  kind: ImportKind;
  key: string; // date for calendar, Bamawl id for requests
  date: string; // day it belongs to on the month page
  field: string; // e.g. "outTime", or "new" for a new request
  label: string; // e.g. "OUT"
  before: string;
  after: string;
};

/** Result of comparing an import with what is stored. */
export type ImportDiff = {
  kind: ImportKind;
  total: number;
  added: { key: string; date: string; text: string }[];
  changed: Omit<FieldChange, "id" | "at">[];
  unchanged: number;
};

export type ImportLog = ImportDiff & { at: string };

/** One Taxi Fee Request from Bamawl (HR > Office Management > Taxi Fee Request). */
export type TaxiRequest = {
  id: string;
  date: string;
  fee: number | null;
  type: string; // request_type_label, e.g. "Overtime Taxi"
  status: string; // "Pending", …
  rejected: boolean;
  deniedReason: string;
  importedAt: string;
  raw: unknown;
};

/** One line of the request checker for a day. */
export type RequestCheck = {
  kind: "ot" | "allowance" | "leave" | "taxi";
  label: string;
  status: "ok" | "missing" | "wrong" | "rejected" | "extra" | "info";
  expected: string;
  submitted: string;
  note: string;
  expectedAmount: number | null;
  submittedAmount: number | null;
  secretAmount: boolean; // OT amounts reveal salary → hidden with the eye button
};

/**
 * claimOffice: should weekday office time after work end count as OT?
 * null/undefined = automatic (yes if an OT request exists that day), true/false = set by hand.
 */
export type DayNote = {
  date: string;
  elecOn: boolean | null;
  note: string;
  claimOffice?: boolean | null;
  // Office IN/OUT typed by hand (e.g. from the team OT sheet) when Bamawl has none. NOT Bamawl data.
  inOverride?: string | null;
  outOverride?: string | null;
  // "Keep mine": the Bamawl time the user already saw and rejected. Warn again only if Bamawl changes.
  inKeep?: string | null;
  outKeep?: string | null;
  // Bamawl IN/OUT on this day was set to what HR asked for (forget-card OUT that folds home OT in),
  // not the real time. Real office time = typed times (other side from Bamawl); none typed = no office time.
  hrAdjusted?: boolean | null;
};

/**
 * Exchange: when weekly OT is over the limit, 4 or 8 consecutive OT hours from ONE day are swapped
 * for rest (a half or full day off). Those hours lose the base hourly pay, but the allowance stays.
 */
export type Exchange = { id: string; otDate: string; restDate: string; hours: 4 | 8; note: string; createdAt: string };

/** Company bonus per OT hour (the "allowance" on top of base hourly). */
export const BAND_BONUS: Record<"weekday" | "off", Record<Band, number>> = {
  weekday: { early: 1000, regular: 1000, midnight: 3000 },
  off: { early: 2000, regular: 2000, midnight: 4000 }, // weekend & public holiday
};

/** Band name for display. "regular" is the weekday 17:00–22:00 rate; on Sat/Sun/holidays it is the weekend/holiday rate. */
export function bandLabel(band: Band, dayType: DayType): string {
  if (dayType === "weekday") return { early: "early", regular: "regular", midnight: "mid-night" }[band];
  const day = dayType === "holiday" ? "holiday" : "weekend";
  return { early: `${day} early`, regular: day, midnight: `${day} mid-night` }[band];
}

/** Why the Bamawl office time does or doesn't count. */
export type OfficeClaim = "offday" | "request" | "manual_yes" | "manual_no" | "unclaimed" | "none";

export type Settings = {
  floorMode: FloorMode;
  floorMinutes: number;
  weeklyLimitMinutes: number;
  weekendLunchMinutes: number;
  workStart: string;
  workEnd: string;
  weekStartDay: number; // 0 = Sunday … 6 = Saturday; the week ends 6 days later
  taxiFee: number; // usual taxi fee to request (reference: Grab Taxi quote office → home)
};

export const DEFAULT_SETTINGS: Settings = {
  floorMode: "day_total",
  floorMinutes: 15,
  weeklyLimitMinutes: 20 * 60,
  weekendLunchMinutes: 60,
  workStart: "08:00",
  workEnd: "17:00",
  weekStartDay: 0,
  taxiFee: 20000,
};

/** Minutes from 00:00 of the day (may go past 1440 = next day). */
export type Segment = { source: Place | "mixed"; start: number; end: number };

export type BandMinutes = Record<Band, number>;

export type DayResult = {
  date: string;
  dow: number; // 0 = Sun
  dayType: DayType;
  holidayName: string;
  inPeriod: boolean;
  weekStart: string;
  bamawl: Omit<BamawlDay, "raw"> | null;
  entries: Entry[];
  note: DayNote | null;
  segments: Segment[]; // counted, merged, before floor
  unclaimed: Segment[]; // office time after work end that is NOT counted (done for free)
  officeClaim: OfficeClaim;
  // Electricity 17:00–21:00. Manual value, or guessed: power alternates 1 day on / 1 day off
  // counting from the last day set by hand before this day.
  elec: { on: boolean | null; auto: boolean };
  // Taxi fee (handbook p.32): trip home after office OT that ends at 19:00 or later, approved in advance.
  taxi: { eligible: boolean; officeEnd: number | null; notes: string[] };
  times: {
    in: string | null; // office IN/OUT actually used
    out: string | null;
    inManual: boolean;
    outManual: boolean;
    bamawlIn: string | null; // what Bamawl itself says
    bamawlOut: string | null;
    inConflict: boolean; // typed time ≠ Bamawl time, and not yet "kept"
    outConflict: boolean;
    hrAdjusted: boolean; // Bamawl times are HR-adjusted, not real (see DayNote.hrAdjusted)
  };
  exchangedMinutes: number; // OT minutes swapped for rest (no base pay, allowance stays)
  payableMinutes: number; // flooredMinutes − exchangedMinutes
  exchangesOut: Exchange[]; // exchanges taken from this day's OT
  restFor: Exchange[]; // exchanges whose rest day is this day
  longestBlock: number; // longest consecutive floored OT block (lunch gap on off days doesn't break it)
  checks: RequestCheck[]; // request checker (filled by calcMonth)
  submitted: { minutes: number; amount: number | null; items: { status: string; remark: string; minutes: number }[] } | null;
  rawMinutes: number;
  flooredMinutes: number;
  bands: BandMinutes; // floored minutes per band
  pay: number | null; // MMK, rounded per day
  warnings: string[];
  infos: string[];
};

export type WeekResult = {
  start: string;
  end: string;
  minutes: number; // after exchanges
  exchangedMinutes: number;
  over: boolean;
  partial: boolean;
  exchangeHint: number[]; // suggested exchange blocks in hours, e.g. [4] or [8, 4]
};

export type MonthResult = {
  period: string; // YYYY-MM = salary month
  start: string;
  end: string;
  days: DayResult[];
  weeks: WeekResult[];
  totals: {
    minutes: number;
    pay: number | null;
    bands: BandMinutes;
    daysWithOt: number;
    taxiDays: number;
    taxiRequested: number; // sum of taxi fees requested (not rejected) in the month
    exchangedMinutes: number;
    checksOk: number;
    checksBad: number; // missing / wrong / rejected / extra
    submittedMinutes: number;
    submittedAmount: number | null;
  };
  settings: Settings;
  exchanges: Exchange[]; // touching the shown weeks
  changes: FieldChange[]; // all unseen import changes (any date)
};
