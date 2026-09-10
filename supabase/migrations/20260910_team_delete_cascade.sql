-- Deleting a team must take its scans and members with it — same bug as
-- 024_photo_submission_cascade.sql, on two more tables.
--
-- bingo_scans.team_id and bingo_members.team_id have no cascading foreign
-- key (some accounts may have no FK there at all), so wipeSectionTeams()
-- in BingoDashAdmin.tsx — used by both "Reset Game" and the single-team
-- delete — only ever issues `bingo_teams.delete()` and relies entirely on
-- the database to take scans/members with it. It doesn't. Verified live:
-- deleting a team left its scans and members behind, still pointing at a
-- team that no longer exists, requiring manual cleanup.
--
-- Enforcing the cascade in the database means Reset Game actually clears a
-- session's data as intended, and no future code path can reintroduce this.

-- Any rows already orphaned (from past resets that didn't cascade) would
-- block the constraint, so clear them first.
delete from bingo_scans s
where not exists (select 1 from bingo_teams t where t.id = s.team_id);

delete from bingo_members m
where not exists (select 1 from bingo_teams t where t.id = m.team_id);

alter table bingo_scans
  drop constraint if exists bingo_scans_team_id_fkey;

alter table bingo_scans
  add constraint bingo_scans_team_id_fkey
  foreign key (team_id) references bingo_teams(id) on delete cascade;

alter table bingo_members
  drop constraint if exists bingo_members_team_id_fkey;

alter table bingo_members
  add constraint bingo_members_team_id_fkey
  foreign key (team_id) references bingo_teams(id) on delete cascade;

notify pgrst, 'reload schema';
