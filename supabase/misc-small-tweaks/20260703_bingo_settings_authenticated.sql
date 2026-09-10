-- ── bingo_settings: authenticated access (pre-C1 interim) ────────────────────
-- The legacy policy allow_all_bingo_settings (supabase-migration-bingo-timer-
-- categories.sql) is TO anon only. Since the admin became login-gated, owner
-- sessions run as `authenticated` and silently match 0 rows on this table —
-- the Accounts page could neither read nor save the template board pointer.
--
-- Additive + safe anytime: authenticated read for everyone, writes only for
-- the owner (is_bingo_owner() from 20260619_bingo_accounts.sql). Anonymous
-- pages keep working through the untouched anon policy. C1
-- (20260703_multitenant_rls.sql) drops all policies on this table dynamically
-- and recreates its final set, so this interim policy disappears with it.

create policy bingo_settings_auth_read on public.bingo_settings
  for select to authenticated using (true);

create policy bingo_settings_owner_write on public.bingo_settings
  for all to authenticated
  using (public.is_bingo_owner())
  with check (public.is_bingo_owner());

notify pgrst, 'reload schema';
