-- p_template is optional: omit it to use the designated default template.
drop function if exists public.admin_clone_template_for(uuid);
create or replace function public.admin_clone_template_for(p_target uuid, p_template uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  tmpl uuid;
  new_board uuid;
begin
  if not public.is_bingo_owner() then
    raise exception 'owner only';
  end if;
  tmpl := p_template;
  if tmpl is null then
    select template_section_id into tmpl from bingo_settings where id = 'main';
  end if;
  if tmpl is null then
    raise exception 'no template board designated';
  end if;
  new_board := public.clone_bingo_board(tmpl, p_target);
  update bingo_accounts
     set active_section_id = coalesce(active_section_id, new_board)
   where id = p_target;
  return new_board;
end;
$$;

grant execute on function public.admin_clone_template_for(uuid, uuid) to authenticated;
