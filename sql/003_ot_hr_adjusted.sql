-- Day flag: Bamawl IN/OUT on this day is the HR-adjusted time (forget-card), not the real one.
alter table ot_day_notes add column if not exists hr_adjusted boolean;
