-- The public demo page (/bingo-dash/sample) lights tiles while signed out.
-- Board writes are owner-only now, so this one cosmetic field gets its own
-- narrow function: it can change glow_slots and nothing else.
create or replace function public.set_section_glow(p_section uuid, p_slots integer[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_slots is null or coalesce(array_length(p_slots, 1), 0) > 100 then
    raise exception 'invalid slots';
  end if;
  update bingo_sections set glow_slots = p_slots where id = p_section;
end; $$;
revoke execute on function public.set_section_glow(uuid, integer[]) from public;
grant execute on function public.set_section_glow(uuid, integer[]) to anon, authenticated;
