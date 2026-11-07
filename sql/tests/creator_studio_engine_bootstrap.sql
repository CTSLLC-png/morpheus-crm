-- CI-only parent fixture for sql/0020_creator_studio_engine.sql. Not production auth.
-- Mirrors the pieces of Supabase + the Nguzo kernel the migration depends on.
create extension if not exists pgcrypto;
create schema if not exists core;
create schema if not exists auth;
create schema if not exists storage;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role bypassrls; end if;
end $$;

create table if not exists auth.users (id uuid primary key);
-- auth.uid() comes from a session setting so tests can switch users.
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

create table if not exists core.tenant (id uuid primary key default gen_random_uuid(), slug text unique, name text, status text default 'ACTIVE');
create table if not exists core.membership (user_id uuid, tenant_id uuid references core.tenant(id), role text,
  primary key (user_id, tenant_id));
create table if not exists core.module (key text primary key, name text, description text, schema_name text,
  category text, status text, sort_order int);
create table if not exists core.tenant_module (tenant_id uuid, module_key text, enabled boolean,
  primary key (tenant_id, module_key));
create or replace function core.member_of(p_tenant uuid) returns boolean language sql stable security definer
  set search_path = core, public as
  $$ select exists (select 1 from core.membership m where m.tenant_id = p_tenant and m.user_id = auth.uid()) $$;
create or replace function core.has_role(p_tenant uuid, p_roles text[]) returns boolean language sql stable security definer
  set search_path = core, public as
  $$ select exists (select 1 from core.membership m where m.tenant_id = p_tenant and m.user_id = auth.uid() and m.role = any(p_roles)) $$;

create table if not exists public.studio_project (id uuid primary key default gen_random_uuid(), title text);

create table if not exists storage.buckets (id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema storage, auth, core to authenticated, anon, service_role;
grant select on storage.objects to authenticated;
grant execute on function auth.uid() to authenticated, anon, service_role;

do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;

insert into core.module (key, name, status) values ('growth.studio', 'Creator Studio', 'AVAILABLE') on conflict do nothing;
