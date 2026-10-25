-- Campaign Studio scheduled publishing.
-- A super_admin schedules an approved asset (account + time). The publisher
-- (a scheduled Claude routine posting through the owner's Zapier connections)
-- posts it at the next publishing window and records the live link.
--
-- The review gate gains exactly one automation path: scheduled → published,
-- only once publish_at has passed and a published_url is recorded. Automation
-- still cannot approve, schedule, reschedule or edit anything.

alter table public.growth_campaign_asset
  add column if not exists publish_at       timestamptz,
  add column if not exists publish_target   text,
  add column if not exists published_at     timestamptz,
  add column if not exists published_url    text,
  add column if not exists publish_error    text,
  add column if not exists publish_attempts smallint not null default 0;

do $$ begin
  alter table public.growth_campaign_asset add constraint growth_asset_publish_target_chk
    check (publish_target is null or publish_target in ('facebook','instagram','linkedin','tiktok','youtube'));
  alter table public.growth_campaign_asset add constraint growth_asset_published_url_chk
    check (published_url is null or (published_url ~ '^https://\S+$' and char_length(published_url) <= 2000));
  alter table public.growth_campaign_asset add constraint growth_asset_publish_error_chk
    check (publish_error is null or char_length(publish_error) <= 1000);
  alter table public.growth_campaign_asset add constraint growth_asset_scheduled_needs_slot_chk
    check (status <> 'scheduled' or (publish_at is not null and publish_target is not null));
exception when duplicate_object then null; end $$;

comment on column public.growth_campaign_asset.publish_at is
  'When the publisher may post this asset (it posts at the first publishing window at or after this time). Set by a super_admin together with status=scheduled.';
comment on column public.growth_campaign_asset.publish_target is
  'Platform to post to: facebook | instagram | linkedin | tiktok | youtube.';

create index if not exists growth_campaign_asset_due_idx
  on public.growth_campaign_asset (publish_at) where status = 'scheduled';

create or replace function public.growth_asset_review_gate()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  is_admin boolean := auth.uid() is not null and coalesce(public.current_user_role(), '') = 'super_admin';
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.status <> 'draft' and not is_admin then
      raise exception 'New campaign assets must start as draft';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status and new.status <> 'draft' then
    -- The one automation path: complete a publish a person scheduled.
    if not is_admin then
      if not (old.status = 'scheduled' and new.status = 'published'
              and old.publish_at is not null and old.publish_at <= now()
              and new.published_url is not null
              and new.publish_at is not distinct from old.publish_at
              and new.publish_target is not distinct from old.publish_target
              and new.body = old.body and new.title = old.title) then
        raise exception 'Only a signed-in super_admin can approve, schedule or publish campaign assets';
      end if;
      new.published_at := coalesce(new.published_at, now());
      new.publish_error := null;
    end if;
    if old.status = 'draft' then
      new.approved_by := auth.uid();
      new.approved_at := now();
    end if;
  end if;

  -- Automation may not move a scheduled slot or retarget it.
  if not is_admin and old.status = 'scheduled'
     and (new.publish_at is distinct from old.publish_at or new.publish_target is distinct from old.publish_target) then
    raise exception 'Only a signed-in super_admin can change a scheduled post''s time or account';
  end if;

  -- Editing approved or scheduled copy sends it back through review and off the schedule.
  if old.status <> 'draft' and new.status = old.status
     and (new.body is distinct from old.body or new.title is distinct from old.title) then
    new.status := 'draft';
    new.approved_by := null;
    new.approved_at := null;
    new.publish_at := null;
    new.publish_target := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.growth_asset_review_gate() from public, anon, authenticated;
