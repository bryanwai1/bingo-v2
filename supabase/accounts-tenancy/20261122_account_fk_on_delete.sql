-- Fix: owner_delete_account fails with
--   update or delete on table "bingo_accounts" violates foreign key constraint
--   "bingo_event_members_account_id_fkey" on table "bingo_event_members" (23503)
--
-- The table files in this folder declare these foreign keys with ON DELETE
-- CASCADE / SET NULL, but the live database was created without them (plain
-- NO ACTION, see schema-raw.sql), so deleting any account that has an event
-- membership, or that created an event or added a board to one, is refused.
--
-- This re-creates every foreign key that points at bingo_accounts and still has
-- NO ACTION, with the rule the table files intend:
--   column NOT NULL  -> ON DELETE CASCADE   (e.g. bingo_event_members.account_id)
--   column nullable  -> ON DELETE SET NULL  (e.g. bingo_events.created_by, bingo_event_boards.added_by)
-- Safe to re-run: constraints that already cascade / set null are skipped.
-- Run it in the Supabase SQL editor.
do $$
declare
  c record;
  rule text;
begin
  for c in
    select con.conname,
           con.conrelid::regclass as tbl,
           att.attname,
           att.attnotnull,
           pg_get_constraintdef(con.oid) as def
      from pg_constraint con
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
     where con.contype = 'f'
       and con.confrelid = 'public.bingo_accounts'::regclass
       and con.confdeltype = 'a'          -- NO ACTION
       and array_length(con.conkey, 1) = 1
  loop
    rule := case when c.attnotnull then 'cascade' else 'set null' end;
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
    execute format('alter table %s add constraint %I foreign key (%I) references public.bingo_accounts(id) on delete %s',
                   c.tbl, c.conname, c.attname, rule);
    raise notice 'fixed %.% -> on delete %', c.tbl, c.conname, rule;
  end loop;
end $$;

notify pgrst, 'reload schema';
