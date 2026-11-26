-- CI-only parent fixture for sql/0016_creator_studio.sql and
-- sql/0022_creator_studio_render_queue.sql. Not production auth: the role and
-- user come from session settings so tests can switch between them.
create schema if not exists core;
create schema if not exists auth;
create schema if not exists storage;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role bypassrls; end if;  -- as on Supabase
end $$;
create extension if not exists pgcrypto;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create table if not exists core.tenant (id uuid primary key default gen_random_uuid(), slug text unique);
create table if not exists core.module (key text primary key, name text, description text, schema_name text,
  category text, status text, sort_order int);
create table if not exists core.tenant_module (tenant_id uuid, module_key text, enabled boolean,
  primary key (tenant_id, module_key));
insert into core.tenant (slug) values ('cts') on conflict do nothing;

create table if not exists storage.buckets (id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;

create table if not exists public.growth_campaign_asset (id uuid primary key default gen_random_uuid(), media_url text);

create or replace function public.current_user_role() returns text language sql stable as
  $$ select nullif(current_setting('test.role', true), '') $$;
grant execute on function public.current_user_role() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),  -- trainer
  ('22222222-2222-2222-2222-222222222222')   -- participant
on conflict do nothing;
