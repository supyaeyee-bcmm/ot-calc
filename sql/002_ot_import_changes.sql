-- Import change tracking. Run in the Supabase SQL Editor after 001 (only needed when OT_STORAGE=supabase).

-- Unseen "updated" marks: one row per field changed by an import (deleted when the user clicks "seen")
create table if not exists ot_import_changes (
  id         text primary key,
  at         timestamptz not null,
  kind       text not null check (kind in ('calendar', 'requests', 'allowances', 'taxi')),
  key        text not null,
  work_date  date not null,
  field      text not null,
  label      text not null,
  before     text not null default '',
  after      text not null default ''
);
create index if not exists ot_import_changes_date_idx on ot_import_changes (work_date);

-- The last applied import (single row id = 1), shown on the Import page
create table if not exists ot_last_import (
  id   smallint primary key default 1 check (id = 1),
  log  jsonb not null
);

alter table ot_import_changes enable row level security;
alter table ot_last_import    enable row level security;
