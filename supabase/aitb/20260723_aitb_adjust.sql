-- Manual per-team points adjustment, editable in the AITB admin. Positive or
-- negative; added on top of the computed progress points everywhere totals show.
alter table aitb_teams add column if not exists adjust int not null default 0;

notify pgrst, 'reload schema';
