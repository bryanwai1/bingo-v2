-- ============================================================
-- Interactive-module results for bundle activities (Nerf cups, jingle
-- roulette, cinematic card deal, retro game tracker) — the team-agreed
-- result for whichever module the activity carries, mirroring the words
-- column already used by aitb_progress / bingo_scans for the same purpose.
-- ============================================================

alter table public.bingo_bundle_progress
  add column if not exists words text[] not null default '{}';

comment on column public.bingo_bundle_progress.words is
  'Result slots for this activity''s interactive module (cup words, roulette genre/topic, dealt cards, retro game tracker) — set once by whichever phone completes it first, then read by every teammate.';

-- ── Save the module result for one activity ─────────────────
create or replace function public.save_bundle_words(
  p_team uuid, p_activity uuid, p_words text[]
) returns json language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from bingo_bundle_progress
   where team_id = p_team and activity_id = p_activity;
  if not found then raise exception 'NOT_CHECKED_IN'; end if;
  if r.status = 'approved' then raise exception 'ALREADY_APPROVED'; end if;

  update bingo_bundle_progress set words = p_words where id = r.id;

  return json_build_object('ok', true);
end; $$;

grant execute on function public.save_bundle_words(uuid,uuid,text[]) to anon, authenticated;

notify pgrst, 'reload schema';
