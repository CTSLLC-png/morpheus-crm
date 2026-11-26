-- CI-only parent fixture for sql/0021_tenant_scope_growth_modules.sql.
-- Stands in for the Supabase auth/storage schemas and the Morpheus kernel so
-- the real module migrations (0014, 0015, 0016, 0018, 0019) and 0021 can be
-- installed into a disposable Postgres. Not production auth.
create schema if not exists core;
create schema if not exists auth;
create schema if not exists storage;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
grant usage on schema public, core, auth, storage to anon, authenticated;

create table if not exists auth.users (id uuid primary key, raw_app_meta_data jsonb default '{}'::jsonb);
-- The test's "signed-in user" and role come from session settings.
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create or replace function public.current_user_role() returns text language sql stable as
  $$ select nullif(current_setting('test.role', true), '') $$;
grant execute on function auth.uid(), public.current_user_role() to anon, authenticated;

create table if not exists core.tenant (id uuid primary key default gen_random_uuid(), slug text unique, name text);
create table if not exists core.module (key text primary key, name text, description text, schema_name text,
  category text, status text, sort_order int);
create table if not exists core.tenant_module (tenant_id uuid, module_key text, enabled boolean,
  primary key (tenant_id, module_key));
create table if not exists core.membership (user_id uuid, tenant_id uuid, role text, primary key (user_id, tenant_id));

-- Same behaviour as the kernel: membership is self-scoped, and tenant_id()
-- resolves only for members (it reads core.tenant through RLS).
alter table core.membership enable row level security;
drop policy if exists own on core.membership;
create policy own on core.membership for select to authenticated using (user_id = auth.uid());
grant select on core.membership to authenticated;
alter table core.tenant enable row level security;
drop policy if exists member on core.tenant;
create policy member on core.tenant for select to authenticated
  using (exists (select 1 from core.membership m where m.tenant_id = id and m.user_id = auth.uid()));
grant select on core.tenant to authenticated;
create or replace function core.member_of(p_tenant uuid) returns boolean language sql stable as
  $$ select exists (select 1 from core.membership where user_id = auth.uid() and tenant_id = p_tenant) $$;
create or replace function core.tenant_id(p_slug text) returns uuid language sql stable as
  $$ select id from core.tenant where slug = p_slug $$;
grant execute on function core.member_of(uuid), core.tenant_id(text) to anon, authenticated;

create table if not exists storage.buckets (id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id), name text, owner uuid default auth.uid());
alter table storage.objects enable row level security;
grant select, insert, delete on storage.objects to authenticated;

-- Referenced by lp_campaign_funnel() in 0014 (body only, never called here).
create table if not exists public.lp_purchases (user_id uuid, org_id text, status text,
  amount_cents int, amount_refunded_cents int);

insert into core.tenant (id, slug, name) values
  ('00000000-0000-0000-0000-0000000000c1', 'cts', 'CTS'),
  ('00000000-0000-0000-0000-0000000000b2', 'other', 'Other client')
on conflict do nothing;
