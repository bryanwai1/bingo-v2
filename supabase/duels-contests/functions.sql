-- duels-contests business logic. Run after bingo_duels.sql and
-- bingo_duel_codes.sql (both reference these functions in triggers/policies,
-- but Postgres doesn't validate a plpgsql body's references until it's
-- actually called, so exact order only matters for readability here).

-- Issues a code the moment a duel goes active — the marshal reads it out,
-- both teams' phones show "ask your marshal for the code".
create or replace function public.issue_duel_code()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  c text := ''; i int;
begin
  if new.status = 'active' and (old.status is distinct from 'active') then
    for i in 1..5 loop
      c := c || substr(alphabet, 1 + floor(random()*length(alphabet))::int, 1);
    end loop;
    insert into bingo_duel_codes (duel_id, code) values (new.id, c)
      on conflict (duel_id) do nothing;
  end if;
  return new;
end; $$;

-- The only way to resolve a duel: validates the marshal code, sets
-- winner/status, credits the challenger's tile, and awards the sticker.
create or replace function public.resolve_duel(
  p_duel uuid, p_code text, p_winner uuid
) returns json language plpgsql security definer set search_path = public as $$
declare d record; want text; existing uuid;
begin
  select * into d from bingo_duels where id = p_duel;
  if not found            then raise exception 'DUEL_NOT_FOUND'; end if;
  if d.status <> 'active' then raise exception 'DUEL_NOT_ACTIVE'; end if;
  if p_winner not in (d.challenger_team_id, d.defender_team_id)
                          then raise exception 'WINNER_NOT_IN_DUEL'; end if;

  select code into want from bingo_duel_codes where duel_id = p_duel;
  if want is null then raise exception 'NO_CODE_ISSUED'; end if;
  if upper(trim(coalesce(p_code,''))) <> upper(want) then raise exception 'BAD_CODE'; end if;

  update bingo_duels set
    status          = 'done',
    winner_team_id  = p_winner,
    sticker_team_id = d.challenger_team_id,   -- challenger always
    resolved_at     = now()
  where id = p_duel and status = 'active';

  -- Challenger's tile crosses off either way: they spent it.
  select id into existing from bingo_scans
   where team_id = d.challenger_team_id and task_id = d.task_id;
  if existing is not null then
    update bingo_scans set completed = true, completed_at = now() where id = existing;
  else
    insert into bingo_scans (team_id, task_id, completed, completed_at)
    values (d.challenger_team_id, d.task_id, true, now());
  end if;

  delete from bingo_duel_codes where duel_id = p_duel;  -- single use
  return json_build_object('ok', true, 'winner', p_winner,
                           'sticker', d.challenger_team_id, 'bonus', d.bonus_points);
end; $$;

grant execute on function public.resolve_duel(uuid, text, uuid) to anon, authenticated;
