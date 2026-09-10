-- Itemised bonus points per team.
-- Each entry is { "label": string, "points": number }; the team's bonus_points
-- column stays the authoritative total (sum of the entries) so the projector,
-- award slides and scoreboard keep reading a single number.
alter table public.bingo_teams
  add column if not exists bonus_breakdown jsonb not null default '[]'::jsonb;
