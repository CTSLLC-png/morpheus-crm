-- 0009 — close a privilege-escalation hole in current_user_role().
-- Applied to production as `harden_current_user_role_to_app_metadata`.
--
-- THE HOLE
-- current_user_role() read raw_user_meta_data->>'role' from auth.users.
-- That field is what supabase.auth.updateUser({ data: {...} }) writes,
-- so it is USER-WRITABLE from the browser with the public anon key.
-- Every edu_* policy authorises staff via
--   current_user_role() = ANY (ARRAY['super_admin','trainer'])
-- so any authenticated participant could run
--   supabase.auth.updateUser({ data: { role: 'super_admin' } })
-- and gain ALL on edu_courses, edu_modules, edu_lessons and
-- edu_checkpoint_questions -- which holds correct_index, the answer key
-- for every checkpoint -- plus read access to all participant progress.
--
-- Note this was missed by an earlier audit that grepped pg_policies for
-- 'user_metadata': the policies do not name the field, they call
-- current_user_role(), which reads it inside the function body.
--
-- THE FIX
-- raw_app_meta_data is writable only by the service role. Move the role
-- source there, with no fallback -- a fallback to raw_user_meta_data
-- would leave the escalation path fully open.
--
-- ORDER MATTERS: backfill first, then switch the function. The reverse
-- would leave all existing users with a NULL role and lock every staff
-- member out until someone with service-role access noticed.

update auth.users
set raw_app_meta_data =
      coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('role', raw_user_meta_data->>'role')
where raw_user_meta_data ? 'role'
  and coalesce(raw_app_meta_data->>'role', '') is distinct from (raw_user_meta_data->>'role');

create or replace function public.current_user_role()
returns text language sql stable security definer set search_path to 'public'
as $function$
  select raw_app_meta_data->>'role' from auth.users where id = auth.uid();
$function$;

comment on function public.current_user_role is
  'Role from raw_app_meta_data (service-role writable only). Never read '
  'raw_user_meta_data here -- the browser can rewrite it via '
  'auth.updateUser, which would make every staff-gated RLS policy '
  'self-grantable.';

-- Verification:
--   select email, raw_user_meta_data->>'role', raw_app_meta_data->>'role'
--   from auth.users;                                  -- both populated
--   select pg_get_functiondef(oid) like '%raw_user_meta_data%'
--   from pg_proc where proname='current_user_role';   -- expect false
--
-- ALSO REQUIRED: supabase/functions/on-user-signup/index.ts now stamps
-- app_metadata, or newly created users get a NULL role and no access.
