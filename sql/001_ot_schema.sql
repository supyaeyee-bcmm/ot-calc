-- OT Calc schema. Run once in the Supabase SQL Editor.
-- All tables use the ot_ prefix so other apps in this project are untouched.
-- RLS is ON with no policies: the anon key can read nothing; the app uses the service role key (server only).

-- Office IN/OUT from the Bamawl attendance calendar (one row per date, re-import overwrites)
create table if not exists ot_bamawl_days (
  work_date     date primary key,
  holiday       boolean not null default false,
  shift         text not null default '',
  in_time       time,
  out_time      time,
  manual_in     boolean not null default false,  -- "forget card access": time set by HR
  manual_out    boolean not null default false,
  in_des        text not null default '',
  out_des       text not null default '',
  trip_des      text not null default '',
  leave_name    text not null default '',
  leave_des     text not null default '',
  exchange      boolean not null default false,
  exchange_way  text not null default '',
  origin_date   text not null default '',
  raw           jsonb,
  imported_at   timestamptz not null default now()
);

-- Submitted After-Overtime requests from Bamawl
create table if not exists ot_overtime_requests (
  id           text primary key,                 -- employee_overtime_id
  work_date    date not null,
  minutes      integer not null default 0,
  status       text not null default '',
  rejected     boolean not null default false,
  remark       text not null default '',
  amount       numeric,
  raw          jsonb,
  imported_at  timestamptz not null default now()
);
create index if not exists ot_overtime_requests_date_idx on ot_overtime_requests (work_date);

-- Submitted Allowance requests from Bamawl (one request can cover several dates; no hours, only an amount)
create table if not exists ot_allowance_requests (
  id           text primary key,                 -- allowance_request_id
  dates        date[] not null,
  name         text not null default '',
  kind         text not null default 'unknown'
               check (kind in ('holiday', 'holiday_midnight', 'weekday_midnight', 'substitute', 'unknown')),
  amount       numeric,
  payment      text not null default '',
  status       text not null default '',
  rejected     boolean not null default false,
  description  text not null default '',
  raw          jsonb,
  imported_at  timestamptz not null default now()
);
create index if not exists ot_allowance_requests_dates_idx on ot_allowance_requests using gin (dates);

-- Taxi Fee requests from Bamawl
create table if not exists ot_taxi_requests (
  id             text primary key,
  work_date      date not null,
  fee            numeric,
  type           text not null default '',
  status         text not null default '',
  rejected       boolean not null default false,
  denied_reason  text not null default '',
  raw            jsonb,
  imported_at    timestamptz not null default now()
);
create index if not exists ot_taxi_requests_date_idx on ot_taxi_requests (work_date);

-- OT that Bamawl does not record (home OT, or an office day that replaces Bamawl times)
create table if not exists ot_entries (
  id             uuid primary key default gen_random_uuid(),
  work_date      date not null,
  place          text not null check (place in ('home', 'office')),
  start_time     time not null,
  end_time       time not null,                  -- end <= start means next day
  break_minutes  integer not null default 0 check (break_minutes between 0 and 600),
  task           text not null default '',
  created_at     timestamptz not null default now()
);
create index if not exists ot_entries_date_idx on ot_entries (work_date);

-- Per-day notes: electricity, note, claim toggle, hand-typed office times
create table if not exists ot_day_notes (
  work_date     date primary key,
  elec_on       boolean,
  note          text not null default '',
  claim_office  boolean,
  in_override   time,                            -- typed by hand, not Bamawl
  out_override  time,
  in_keep       time,                            -- "keep mine": the Bamawl time already rejected
  out_keep      time,
  updated_at    timestamptz not null default now()
);

-- Exchanges: 4 or 8 consecutive OT hours from one day swapped for rest
create table if not exists ot_exchanges (
  id          uuid primary key default gen_random_uuid(),
  ot_date     date not null,
  rest_date   date not null,
  hours       smallint not null check (hours in (4, 8)),
  note        text not null default '',
  created_at  timestamptz not null default now(),
  check (ot_date <> rest_date)
);
create index if not exists ot_exchanges_ot_date_idx on ot_exchanges (ot_date);
create index if not exists ot_exchanges_rest_date_idx on ot_exchanges (rest_date);

-- App settings (single row, id = 1)
create table if not exists ot_settings (
  id                     smallint primary key default 1 check (id = 1),
  floor_mode             text not null default 'day_total'
                         check (floor_mode in ('day_total', 'per_segment', 'clock_grid')),
  floor_minutes          integer not null default 15 check (floor_minutes between 1 and 60),
  weekly_limit_minutes   integer not null default 1200,
  weekend_lunch_minutes  integer not null default 60,
  work_start             time not null default '08:00',
  work_end               time not null default '17:00',
  week_start_day         smallint not null default 0 check (week_start_day between 0 and 6),
  taxi_fee               integer not null default 20000
);

alter table ot_bamawl_days         enable row level security;
alter table ot_overtime_requests   enable row level security;
alter table ot_allowance_requests  enable row level security;
alter table ot_taxi_requests       enable row level security;
alter table ot_entries             enable row level security;
alter table ot_day_notes           enable row level security;
alter table ot_exchanges           enable row level security;
alter table ot_settings            enable row level security;
