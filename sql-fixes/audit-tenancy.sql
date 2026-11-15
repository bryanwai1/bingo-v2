-- READ-ONLY. Run after adding any new table or admin feature.
-- 1) Any permissive "allow everything" policy left on a table (should only be player tables).
select tablename, policyname, cmd, roles::text
from pg_policies
where schemaname = 'public' and (qual = 'true' or with_check = 'true') and cmd <> 'SELECT'
order by 1, 2;

-- 2) Admin/owner functions that anonymous (signed-out) visitors can still execute.
select p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname ~ '^(owner_|admin_|set_account|set_active|create_facilitator|end_facilitator|remove_crew)'
  and has_function_privilege('anon', p.oid, 'execute');
