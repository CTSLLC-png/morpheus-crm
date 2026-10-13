-- CI-only parent fixture for sql/0018_artist_hub.sql. Not production auth.
create schema if not exists core;
create schema if not exists auth;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
create table if not exists auth.users (id uuid primary key);
create table if not exists core.tenant (id uuid primary key default gen_random_uuid(), slug text unique);
create table if not exists core.module (key text primary key, name text, description text, schema_name text,
  category text, status text, sort_order int);
create table if not exists core.tenant_module (tenant_id uuid, module_key text, enabled boolean,
  primary key (tenant_id, module_key));
insert into core.tenant (slug) values ('cts') on conflict do nothing;
-- Role comes from a session setting so tests can switch between staff and public.
create or replace function public.current_user_role() returns text language sql stable as
  $$ select nullif(current_setting('test.role', true), '') $$;
grant execute on function public.current_user_role() to anon, authenticated;
grant usage on schema public to anon, authenticated;
