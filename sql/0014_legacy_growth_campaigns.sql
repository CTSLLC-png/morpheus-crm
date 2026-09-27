-- Legacy Path growth campaigns — attribution, AI campaign asset library, funnel.
-- Registers the Morpheus module growth.campaigns (Campaign Studio) for the CTS tenant.
--
-- Guardrails carried over from lp_content_versions:
--   * AI output lands as a draft. Only an authenticated super_admin can approve
--     or publish; the service role and automation cannot (trigger below).
--   * Attribution holds campaign tags only — no names, IPs or free text from
--     the visitor. One first-touch row per user, written by that user.

-- ── 1. First-touch attribution ───────────────────────────────────────────────
create table if not exists public.lp_attribution (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  utm_source    text check (char_length(utm_source)   <= 80),
  utm_medium    text check (char_length(utm_medium)   <= 80),
  utm_campaign  text check (char_length(utm_campaign) <= 80),
  utm_content   text check (char_length(utm_content)  <= 80),
  utm_term      text check (char_length(utm_term)     <= 80),
  referrer_host text check (char_length(referrer_host) <= 253),
  landing_path  text check (char_length(landing_path) <= 200),
  first_seen_at timestamptz,
  created_at    timestamptz not null default now()
);
comment on table public.lp_attribution is
  'First-touch campaign tags for a Legacy Path account (UTM params, referrer host, landing path). Written once by the account holder from the browser; readable by super_admin only. No names, IPs or free text.';

alter table public.lp_attribution enable row level security;

drop policy if exists lp_attribution_own_insert on public.lp_attribution;
create policy lp_attribution_own_insert on public.lp_attribution
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists lp_attribution_admin_read on public.lp_attribution;
create policy lp_attribution_admin_read on public.lp_attribution
  for select to authenticated using (public.current_user_role() = 'super_admin');

revoke all on public.lp_attribution from anon;
grant insert on public.lp_attribution to authenticated;
grant select on public.lp_attribution to authenticated;

-- ── 2. Campaign asset library (AI drafts → human approval) ──────────────────
create table if not exists public.growth_campaign_asset (
  id               uuid primary key default gen_random_uuid(),
  product          text not null default 'legacy-path',
  campaign         text not null check (campaign ~ '^[a-z0-9-]{2,60}$'),
  channel          text not null check (channel in (
                     'email','facebook','instagram','tiktok','youtube','linkedin',
                     'google-search','meta-ads','sms','partner','print','video-script','blog')),
  audience         text,
  title            text not null check (char_length(title) <= 200),
  body             text not null check (char_length(body) <= 20000),
  landing_url      text check (landing_url is null or landing_url like 'https://legacy.morpheuscr.com/%'),
  status           text not null default 'draft'
                     check (status in ('draft','approved','scheduled','published','retired')),
  compliance_flags jsonb not null default '[]'::jsonb,
  generated_by     text not null default 'human' check (generated_by in ('human','ai')),
  scheduled_for    date,
  created_by       uuid references auth.users(id) default auth.uid(),
  approved_by      uuid references auth.users(id),
  approved_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.growth_campaign_asset is
  'Marketing copy for CTS products (emails, posts, ads, scripts). AI-generated rows start as draft. Human review gate: only an authenticated super_admin session can move a row out of draft; service-role/automation cannot approve or publish.';

create index if not exists growth_campaign_asset_campaign_idx
  on public.growth_campaign_asset (campaign, status, scheduled_for);

alter table public.growth_campaign_asset enable row level security;

drop policy if exists growth_asset_staff_read on public.growth_campaign_asset;
create policy growth_asset_staff_read on public.growth_campaign_asset
  for select to authenticated using (public.current_user_role() in ('trainer','super_admin'));

drop policy if exists growth_asset_staff_write on public.growth_campaign_asset;
create policy growth_asset_staff_write on public.growth_campaign_asset
  for insert to authenticated with check (public.current_user_role() in ('trainer','super_admin'));

drop policy if exists growth_asset_staff_update on public.growth_campaign_asset;
create policy growth_asset_staff_update on public.growth_campaign_asset
  for update to authenticated
  using (public.current_user_role() in ('trainer','super_admin'))
  with check (public.current_user_role() in ('trainer','super_admin'));

drop policy if exists growth_asset_admin_delete on public.growth_campaign_asset;
create policy growth_asset_admin_delete on public.growth_campaign_asset
  for delete to authenticated using (public.current_user_role() = 'super_admin');

revoke all on public.growth_campaign_asset from anon;
grant select, insert, update, delete on public.growth_campaign_asset to authenticated;

-- The approval gate. Runs for every writer, including the service role, so an
-- automated generator can create drafts but never approve its own output.
create or replace function public.growth_asset_review_gate()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.status <> 'draft' and coalesce(public.current_user_role(), '') <> 'super_admin' then
      raise exception 'New campaign assets must start as draft';
    end if;
  elsif new.status is distinct from old.status and new.status <> 'draft' then
    if auth.uid() is null or coalesce(public.current_user_role(), '') <> 'super_admin' then
      raise exception 'Only a signed-in super_admin can approve, schedule or publish campaign assets';
    end if;
    if old.status = 'draft' then
      new.approved_by := auth.uid();
      new.approved_at := now();
    end if;
  end if;
  -- Editing approved copy sends it back through review.
  if tg_op = 'UPDATE' and old.status <> 'draft' and new.status = old.status
     and (new.body is distinct from old.body or new.title is distinct from old.title) then
    new.status := 'draft';
    new.approved_by := null;
    new.approved_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists growth_asset_review_gate on public.growth_campaign_asset;
create trigger growth_asset_review_gate
  before insert or update on public.growth_campaign_asset
  for each row execute function public.growth_asset_review_gate();

revoke execute on function public.growth_asset_review_gate() from public, anon, authenticated;

-- ── 3. Funnel report ─────────────────────────────────────────────────────────
-- Aggregates only: counts and revenue per campaign tag. No user ids leave.
create or replace function public.lp_campaign_funnel(since timestamptz default now() - interval '90 days')
returns table (
  utm_source text, utm_medium text, utm_campaign text,
  signups bigint, purchases bigint, refunds bigint, revenue_cents bigint
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if coalesce(public.current_user_role(), '') <> 'super_admin' then
    raise exception 'Campaign funnel is restricted to super_admin';
  end if;
  return query
    select coalesce(a.utm_source, '(direct)'),
           coalesce(a.utm_medium, '(none)'),
           coalesce(a.utm_campaign, '(none)'),
           count(*)::bigint,
           count(*) filter (where p.status = 'paid')::bigint,
           count(*) filter (where p.status = 'refunded')::bigint,
           coalesce(sum(p.amount_cents - p.amount_refunded_cents) filter (where p.status in ('paid','refunded')), 0)::bigint
      from auth.users u
      left join public.lp_attribution a on a.user_id = u.id
      left join public.lp_purchases  p on p.user_id = u.id and p.org_id = 'ctsllc'
     where u.raw_app_meta_data->>'role' = 'lp_customer'
       and u.created_at >= since
     group by 1, 2, 3
     order by 4 desc;
end;
$$;

revoke execute on function public.lp_campaign_funnel(timestamptz) from public, anon;
grant execute on function public.lp_campaign_funnel(timestamptz) to authenticated;

-- ── 4. Module registration (navigation contract) ─────────────────────────────
insert into core.module (key, name, description, schema_name, category, status, sort_order)
values ('growth.campaigns', 'Campaign Studio',
        'AI-assisted marketing campaigns for CTS products, with attribution and a human approval gate',
        'public', 'crm', 'BETA', 60)
on conflict (key) do update set
  name = excluded.name, description = excluded.description, schema_name = excluded.schema_name,
  category = excluded.category, status = excluded.status, sort_order = excluded.sort_order;

insert into core.tenant_module (tenant_id, module_key, enabled)
select t.id, 'growth.campaigns', true from core.tenant t where t.slug = 'cts'
on conflict (tenant_id, module_key) do update set enabled = true;
