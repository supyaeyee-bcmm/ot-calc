# OT Calc

A small local web app that calculates **overtime (OT) hours and OT pay per salary month** from
Bamawl (the company HR system) data plus the work-from-home (WFH) OT that Bamawl does not record.
It also **checks your Bamawl requests** (After Overtime, Allowance, Taxi Fee) against what you should
have requested, so you can see at a glance what is missing or wrong.

- One user per installation. Each person runs their own copy with their own data and salary.
- Runs on your PC only (`http://localhost:3100`). **There is no login.** Do not deploy it to a public server.
- Your salary stays in `.env.local` on the server side. It is never shown in the UI or sent to the browser.

---

## Contents

1. [Requirements](#1-requirements)
2. [Setup](#2-setup)
3. [Personal data: what is never committed](#3-personal-data-what-is-never-committed)
4. [Monthly workflow (quick version)](#4-monthly-workflow-quick-version)
5. [What to import from Bamawl](#5-what-to-import-from-bamawl)
6. [Using the month page](#6-using-the-month-page)
7. [Calculation rules](#7-calculation-rules)
8. [Request checker](#8-request-checker)
9. [Settings](#9-settings)
10. [Storage: JSON files or Supabase](#10-storage-json-files-or-supabase)
11. [Code map](#11-code-map)
12. [Developer notes](#12-developer-notes)
13. [Known limits](#13-known-limits)

---

## 1. Requirements

| Tool | Version | Note |
|---|---|---|
| Node.js | **16.20.x** (`>=16.14 <17`) | The project is built for Node 16 on purpose. |
| npm | the one bundled with Node 16 | |

All dependency versions are **pinned exactly** because newer versions need Node 18+:
Next.js **13.5.11** (App Router), React 18.3.1, TypeScript 5.4.5, Tailwind 3.4, `@supabase/supabase-js` **2.45.4**.
Do not upgrade them without checking that they still support Node 16.

## 2. Setup

```bash
npm ci                      # install the exact versions from package-lock.json
cp .env.example .env.local  # then edit .env.local (see below)
npm run dev                 # http://localhost:3100
```

Production-style run: `npm run build && npm start` (also port 3100).

### `.env.local`

```env
OT_STORAGE=json
SALARY_HISTORY=[{"from":"2030-01-01","amount":1000000}]
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

| Variable | Required | Meaning |
|---|---|---|
| `OT_STORAGE` | no (default `json`) | `json` = data in `data/*.json`. `supabase` = data in Supabase `ot_` tables. Restart the dev server after changing it. |
| `SALARY_HISTORY` | yes, for pay | JSON list of `{from, amount}` (total monthly salary, MMK). Add a row when your salary changes. The row valid on each OT date is used. Without it, hours still work but pay shows as "No salary set". |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | only for `supabase` | Service role key, used on the server only (`lib/supabase.ts`). |

On the first run the `data/` folder is created automatically, and the settings start at the defaults
(see [Settings](#9-settings)). Floor mode defaults to **floor the day total**.

## 3. Personal data: what is never committed

`.gitignore` keeps all personal data out of the repo:

| Path | What it is |
|---|---|
| `.env.local` | salary, Supabase keys |
| `data/` | all your imported Bamawl data, WFH entries, notes, exchanges, settings |
| `samples/`, `screenshots/` | real Bamawl JSON / screenshots used during development |
| `docs/`, `ot-history-dump.md`, `CLAUDE.md` | personal notes |

`examples/` contains **fake** JSON files (made-up employee, dates in 2030). They show the exact format of each
importable file, and you can import them to try the app. Don't import them into your real data, though,
because they add fake days and requests.

Before you push, check with `git status` that none of the paths above show up.

## 4. Monthly workflow (quick version)

1. **Every day / week:** add your WFH OT on the month page (**+ add OT** on that day).
2. **Import the Bamawl Attendance Calendar** for the month (and the previous month if the salary month
   overlaps it). See [section 5](#5-what-to-import-from-bamawl).
3. On the month page, check each weekday where you stayed after 17:15 and decide whether it was OT
   (**count as OT**) or not.
4. If HR asked you to submit a forget-card OUT time that is not your real one, mark that day **HR-adj**
   and type your real OUT (see [HR-adjusted days](#hr-adjusted-days)).
5. If a week is over 20 h, add an **exchange** (4 h or 8 h block → rest day).
6. Submit your requests in Bamawl using the **Bamawl requests** column: OT request hours, allowance
   hours × rate, taxi fee.
7. **Import your After Overtime / Allowance / Taxi request lists** from Bamawl. The request checker turns
   ✗ into ✓ when they match.

A salary month runs from the **26th of the previous month to the 25th**: "Oct salary" = Sep 26 – Oct 25.
The month page URL keeps the period: `/?p=2030-10`.

## 5. What to import from Bamawl

Bamawl has no export button, but every list page loads its data as JSON. You copy that JSON
from the browser's developer tools:

1. Open the Bamawl page (table below).
2. Press **F12** → **Network** tab → reload the page (or change the month / search).
3. Find the request whose response is the JSON (filter by `search` or `Fetch/XHR`).
4. Click it → **Response** → copy everything (or *right-click → Save response* as a `.json` file).
5. In OT Calc open **Import Bamawl**, paste the JSON or choose the file → **Preview** → **Apply**.

The app **detects the type automatically**. **Preview** shows what is new, what changed (field: before → after)
and what is unchanged. Nothing is saved until you click **Apply**. Importing again is safe: records are
upserted by date (calendar) or by id (requests), and your own data (WFH entries, notes, exchanges,
typed times) is never touched.

| # | Import this | Bamawl page | API request (in Network tab) | How the app detects it | Used for | Example |
|---|---|---|---|---|---|---|
| 1 | **Attendance Calendar** (one month per file) | HR → Attendance Management → Attendance Calendar | the calendar data request (returns `{status, data:[…]}`) | `data` is an array of days with `start` | office IN/OUT, holidays, forget-card flags, business trips, leave | [`examples/attendance-calendar.json`](examples/attendance-calendar.json) |
| 2 | **After Overtime Request list** | the After Overtime Request list page | `api-hr.bamawl.com/api/<company>/after-overtime-requests/search` | rows have `overtime_date` | "Submitted" column, OT request check, weekday claim | [`examples/after-overtime-requests.json`](examples/after-overtime-requests.json) |
| 3 | **Allowance Request list** | the Allowance Request list page | the allowance request search | rows have `allowance_request_id` | allowance check | [`examples/allowance-requests.json`](examples/allowance-requests.json) |
| 4 | **Taxi Fee Request list** | HR → Office Management → Taxi Fee Request | `api-hr.bamawl.com/api/<company>/taxi-fee-request-list/search` | rows have `fee` + `request_type_label` | taxi check | [`examples/taxi-fee-requests.json`](examples/taxi-fee-requests.json) |

Notes:

- **Lists are paged (20 rows per page).** Import every page (`?page=1`, `?page=2`, …) or the older rows are missing.
- **Calendar:** import each month you need. A salary month covers 2 calendar months (e.g. Sep 26 – Oct 25 needs the
  September and October calendars). Only days with attendance, holidays or future placeholders appear in it.
- **Forget-card list** (`forgetcard-list/search`) is **not** imported. Approved forget-card times show up in
  the Attendance Calendar anyway (`forget_card_access_in/out = "1"`), so re-import the calendar after approval.
- Fields the app reads:
  - Calendar: `start, in_hour, out_hour, classNames ("holiday"), shift, forget_card_access_in/out, in_des, out_des,
    trip_des, leave_name, leave_des, exchange, exchange_way, origin_date`
  - OT requests: `employee_overtime_id, overtime_date, overtime_time ("02:00"), approver_status, remark,
    denied_reason, overtime_amount[0]`
  - Allowances: `allowance_request_id, allowance_request_date (list of dates), allowance_name, total_amount,
    allowance_payment, approver_status, denied_reason, description`. There are no hours: hours = amount ÷ rate.
  - Taxi: `id, date, fee, request_type_label, status, denied_reason`
- After an import, every changed field is marked **● updated** on the month page (tooltip: before → after) until
  you click **seen** / **mark all seen**. The Import page shows the last applied import.

## 6. Using the month page

One row per day, grouped by week. The top cards show: OT hours (after exchanges), request check (n ✓ n ✗),
OT pay (hidden behind the 👁 button), days with OT / taxi days, weeks over 20 h.

| Column | What it shows / what you can do |
|---|---|
| **Date** | day, holiday name, 🚕 *taxi eligible*, ● *updated* by last import |
| **Office in–out** | Bamawl IN/OUT. `*` = time set by HR (forget card). **edit** = type IN/OUT by hand (orange). **HR-adj** = see below. |
| **OT time** | the parts that count, coloured by source (office / home). Struck-through "not counted" = weekday office time not claimed → **count as OT**. **+ add OT** = WFH entry (start, end, break minutes, task). |
| **Floored** | OT after flooring, with the raw (unfloored) total below |
| **OT + allowance** | OT hours after exchange, then one line per band: `+ h:mm × bonus` (e.g. `+ 2:00 × 1,000 regular`) |
| **Bamawl requests** | request checker per day (see [section 8](#8-request-checker)) |
| **Elec** | power-cut planning note (on/off 17:00–21:00). Days you don't set are guessed (1 day on / 1 day off); click to set. |
| **Note** | free text |

### WFH / manual entries

- **home** entries are added on top of office OT. Overlapping time is merged, never counted twice.
- An **office** entry on a day *replaces* that day's Bamawl times (for days Bamawl got wrong).
- **Break minutes** come off the **end** of the entry. Example: 08:00–17:00 with a 60 min break counts as 08:00–16:00.
- An end time earlier than the start means the next day (e.g. 22:00–01:00).

### Typed office times

**edit** lets you type office IN/OUT when Bamawl has none or is wrong. Typed times always win over Bamawl.
If a later import brings a *different* Bamawl time, the day shows an amber choice:

- **use Bamawl** clears your typed time.
- **keep mine** keeps it and stops warning until Bamawl changes again.

### HR-adjusted days

HR sometimes asks you to submit a forget-card OUT time that **folds your WFH OT into the office OUT**, so the OT
request is easy to approve. Example: real OUT 17:03, WFH 19:00–21:20 → HR asks for OUT 19:23. Then Bamawl no
longer shows your real time.

Click **HR-adj** on that day:

- the Bamawl time is shown in violet ("Bamawl: 07:48–19:23") and **not used**. There is no conflict warning.
- the app counts your **real** times only: typed IN/OUT (type the real OUT with **edit**) plus your WFH entries.
  The other side (e.g. IN) still comes from Bamawl.
- if nothing is typed, the Bamawl office time is ignored completely (for a day that was really all WFH).
- a few minutes after 17:00 count here too, like HR's total (e.g. OUT 17:03 → 0:03).
- taxi eligibility also uses the real office OUT.

On these days, always type your **real** times, never HR's. Your After Overtime request should match the real OT.

### Exchanges (weekly OT over 20 h)

Use the **Exchanges** panel: pick the OT day, the rest day and **4 h** or **8 h**. Rules:

- the block must be **consecutive OT from one day** (the 12:00–13:00 lunch gap on off days doesn't break it)
- exchanged hours lose the **base hourly** pay, but the **allowance (band bonus) is still paid**
- exchanged hours come off the weekly total
- the OT day shows "⇄ 8h exchanged → rest on …", and the rest day shows "Rest day"
- a week over the limit shows a hint such as "over by 1:15 → exchange 4h"

## 7. Calculation rules

All rules live in `lib/calc.ts` (pure functions).

### Pay

**Base hourly = total salary ÷ (30 days × 8 h) = salary ÷ 240.** OT pay per hour = base hourly + band bonus:

| Day | Band | Time | Bonus (MMK/h) |
|---|---|---|---|
| Weekday | Early morning | 05:00–08:00 | +1,000 |
| Weekday | Regular | 17:00–22:00 | +1,000 |
| Weekday | Mid-night | 22:00–05:00 | +3,000 |
| Weekend / public holiday | Early morning | 05:00–08:00 | +2,000 |
| Weekend / public holiday | Regular | 08:00–22:00 | +2,000 |
| Weekend / public holiday | Mid-night | 22:00–05:00 | +4,000 |

Bamawl pays this in two parts. The app splits its expected amounts the same way:

1. **After Overtime request** = hours × (base + **1,000**). The basic +1,000 is always included.
2. **Allowance request** = only for the bonus above 1,000: hours × (bonus − 1,000).
   - weekday mid-night +2,000/h
   - weekend/holiday early & regular +1,000/h
   - weekend/holiday mid-night +3,000/h
   - weekday early & regular have no allowance.

Example, Sunday 8:15 regular: OT request 8.25 × (base + 1,000) + allowance 8.25 × 1,000 = 8.25 × (base + 2,000).

### Hours

- Working hours **08:00–17:00**. Work days Mon–Fri. Sat/Sun and Bamawl holidays are off days.
- **Weekday office OT** = time after 17:00 until Bamawl OUT, and **only if claimed**: an After Overtime request
  exists for that date, or you clicked **count as OT**. Otherwise it is shown struck through as "not counted"
  (staying a little late is not automatically OT).
- A weekday OUT less than one floor step after 17:00 (before 17:15) is ignored completely, except on HR-adjusted days.
- **Weekend / holiday office time** always counts: IN → OUT minus **1 h lunch** (12:00–13:00).
- **WFH entries** and manual **office** entries always count.
- Overlapping parts are merged.

### Flooring (15-min steps)

Set in Settings. The **default is "floor the day total"**.

| Mode | Example: office 17:00–17:50 + home 18:50–23:00 |
|---|---|
| **Floor the day total** (`day_total`, default) | 0:50 + 4:10 = 5:00 → **5:00** |
| Floor each part (`per_segment`) | 0:45 + 4:00 = **4:45** |
| Snap to clock (`clock_grid`): start up, end down | 17:00–17:45 + 19:00–23:00 = **4:45** |

Minutes are removed from the **end** of the day (or of each part), so bands shrink from the end.

### Week limit

Max **20 h OT per week**. A week over 20:00 (20:01 counts) is highlighted. The week start day is a setting
(company default: Sunday; the week ends 6 days later).

### Taxi

A day is **🚕 taxi eligible** when counted **office** OT ends at **19:00 or later**. WFH doesn't count, because the
taxi is for the trip home. Extra notes appear when IN was late on a weekday (the full 8 h are needed) or when
there was leave that day.

## 8. Request checker

`lib/checks.ts` builds the requests each day *should* have and compares them with the imported ones.

| Mark | Meaning |
|---|---|
| ✓ ok | submitted and matches |
| ✗ missing | expected but not submitted (only for days before today) |
| ✗ wrong | submitted but hours/amount differ |
| ✗ rejected | the request was rejected |
| ⚠ extra | submitted but not expected (e.g. taxi on a non-eligible day) |
| • info | for your information only |

- **OT request:** hours = payable minutes (after exchange). Amount = hours × (base + 1,000), with ±2 MMK tolerance.
  Amounts are hidden until you press 👁.
- **Allowance:** the type is recognised from the allowance name:

  | Name contains | Type | Rate/h |
  |---|---|---|
  | "substitute" | exchanged hours | 2,000 on off days / 1,000 on weekdays |
  | "mid-night" + weekend/holiday/sat/sun | off-day mid-night | 3,000 |
  | "mid-night" | weekday mid-night | 2,000 |
  | holiday / sat / sun / "no shift" | off-day early + regular | 1,000 |

  Known names: "Morning and Regular OT for Sat / Sun Holiday", "Morning & Regular OT for Substitute Leave".
  Unknown names are shown as info only. Exchanged minutes are taken from early/regular first.
  One allowance request can cover several dates; it is compared with the sum expected for all of them.
- **Taxi:** ✓ when eligible and fee = the `taxiFee` setting. ✗ wrong for any other fee. ⚠ extra when the day
  isn't eligible. • "not requested (optional)" for eligible days without a request.
- **Substitute leave** on a rest day is shown as info (leave requests are not imported).

## 9. Settings

`/settings`. Saved in `data/settings.json` (or the `ot_settings` table).

| Setting | Default | Meaning |
|---|---|---|
| Floor mode | **floor the day total** | see [Flooring](#flooring-15-min-steps) |
| Floor step | 15 min | |
| Weekly limit | 20:00 | weeks above it are highlighted |
| Weekend lunch | 60 min | cut from 12:00 on off days |
| Work start / end | 08:00 / 17:00 | |
| Week starts on | Sunday | set it to match how your team counts weeks (e.g. Monday) |
| Taxi fee | 20,000 | the usual fee you request; other values are flagged |

## 10. Storage: JSON files or Supabase

`lib/store.ts` is the **only** storage entry point. It switches on `OT_STORAGE`.

### JSON (default)

Files in `data/` (gitignored, created on first write):

| File | Content |
|---|---|
| `bamawl-days.json` | imported calendar, keyed by date |
| `ot-requests.json`, `allowance-requests.json`, `taxi-requests.json` | imported request lists, keyed by id |
| `entries.json` | your WFH / manual office entries |
| `day-notes.json` | per day: note, elec, count-as-OT, typed IN/OUT, keep, HR-adjusted |
| `exchanges.json` | OT ↔ rest exchanges |
| `settings.json` | settings |
| `import-changes.json`, `last-import.json` | "updated" marks and the last import |

To back up or move to another PC, copy `data/` and `.env.local`.

### Supabase

1. In your Supabase project's SQL editor, run `sql/001_ot_schema.sql`, `sql/002_ot_import_changes.sql` and
   `sql/003_ot_hr_adjusted.sql` in order. All tables have the `ot_` prefix, so they can share a project with other apps.
   RLS is on with no policies, so only the service role key can read them.
2. Put `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
3. Optional, to copy existing JSON data: `POST http://localhost:3100/api/admin/migrate`. It upserts everything;
   entries/exchanges are only copied if the tables are empty. Delete this route after the move.
4. Set `OT_STORAGE=supabase` and restart.

## 11. Code map

```
app/
  page.tsx                  month page (renders components/MonthView)
  import/page.tsx           Import Bamawl (paste / file → Preview → Apply)
  settings/page.tsx         Settings
  api/month                 GET ?p=YYYY-MM → calculated month (days, weeks, totals, checks)
  api/import                POST ?preview=1 (compare only) / POST (save); GET = last import
  api/entries, entries/[id] WFH / manual office entries
  api/notes                 per-day notes (claim, typed times, HR-adjusted, elec, text)
  api/exchanges, [id]       exchanges
  api/changes               mark "updated" as seen
  api/settings              settings
  api/admin/migrate         one-time JSON → Supabase copy
components/
  MonthView.tsx             month table, cards, conflicts, HR-adj, checks
  EntryForm.tsx             add/edit OT entry
  ExchangePanel.tsx         exchanges
lib/
  calc.ts                   ALL OT rules (segments, lunch cut, merge, floor modes, bands, pay, weeks, taxi)
  checks.ts                 request checker
  bamawl.ts                 parse/detect the 4 Bamawl JSON kinds
  importDiff.ts             preview diff (new / changed / unchanged)
  store.ts                  storage switch → store-json.ts | store-supabase.ts
  salary.ts                 salary from env (server only)
  types.ts                  types, defaults, band labels
  dates.ts, time.ts         date/time helpers
sql/                        Supabase schema
examples/                   fake Bamawl JSON, one per import type
```

## 12. Developer notes

- **Storage:** any new storage function must be added to **both** `lib/store-json.ts` and `lib/store-supabase.ts`
  (same name and types) **and** to the pass-through list in `lib/store.ts`. New columns need a new `sql/00N_*.sql`.
- **Salary is server-only:** `lib/salary.ts` and `lib/supabase.ts` import `server-only`. Never import them from a
  client component, and never return the salary or base hourly from an API. Pay totals may be returned.
- **Calc is pure:** `calcMonth(period, ctx)` in `lib/calc.ts` takes all data as input, so you can run it in a
  script against copies of `data/*.json` to test a change before you apply it.
- **Type check:** `npx tsc --noEmit -p .`. There are no automated tests yet.
- **UI check without clicking:** headless Chrome screenshot, e.g.
  `chrome --headless=new --virtual-time-budget=8000 --screenshot=out.png --window-size=1400,2200 "http://localhost:3100/?p=2030-03"`
- Imports never modify user data. They only upsert `bamawl-days` (by date) and the request lists (by id).

## 13. Known limits

- No login and single user: run it locally only.
- Leave requests are not imported, so substitute leave on rest days is info only.
- The exact Bamawl allowance name for **weekday mid-night** is not known yet. It is detected by "mid-night" in the name.
- Bamawl's calendar has `exchange / exchange_way / origin_date` fields, but they are not used yet. Exchanges are entered by hand.
- HR's exact flooring method is not documented. The three floor modes exist for that reason; the default
  (floor the day total) matches HR's totals seen so far.
