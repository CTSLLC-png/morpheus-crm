-- Artist Hub: public visitors see only published rows and never working takes;
-- staff see and edit everything; one keeper per track. Run after the bootstrap
-- and sql/0018_artist_hub.sql.
\set ON_ERROR_STOP on

-- Seed is idempotent.
\i sql/0018_artist_hub.sql

do $$
declare n int;
begin
  select count(*) into n from public.music_track; assert n = 10, 'expected 10 tracks, got ' || n;
  select count(*) into n from public.music_take; assert n = 22, 'expected 22 takes, got ' || n;
  select count(*) into n from public.music_take where is_keeper; assert n = 8, 'expected 8 keepers, got ' || n;
  select count(*) into n from core.tenant_module where module_key = 'media.artist' and enabled; assert n = 1, 'module not enabled';
end $$;

-- ── Public visitor ──────────────────────────────────────────────────────────
set role anon;
do $$
declare n int;
begin
  select count(*) into n from public.music_artist where slug = 'jace'; assert n = 1, 'anon cannot see published artist';
  select count(*) into n from public.music_release; assert n = 1, 'anon cannot see published release';
  select count(*) into n from public.music_video; assert n = 1, 'anon should see 1 public video';
  -- Tracks are unpublished in the seed, so the public sees none yet.
  select count(*) into n from public.music_track; assert n = 0, 'anon must not see unpublished tracks';
end $$;

do $$ begin
  perform 1 from public.music_take limit 1;
  raise exception 'anon could read music_take';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  perform created_at from public.music_artist limit 1;
  raise exception 'anon could read a non-public column';
exception when insufficient_privilege then null;
end $$;

do $$ begin
  update public.music_track set is_public = true;
  raise exception 'anon could update tracks';
exception when insufficient_privilege then null;
end $$;
reset role;

-- ── Staff publishes one track; public now sees exactly that one ─────────────
set role authenticated;
set test.role = 'trainer';
update public.music_track set is_public = true where track_no = 2;
do $$
declare n int;
begin
  select count(*) into n from public.music_take; assert n = 22, 'staff should see all takes';
end $$;

-- One keeper per track.
do $$ begin
  update public.music_take set is_keeper = true
   where track_id = (select id from public.music_track where track_no = 1)
     and not is_keeper;
  raise exception 'second keeper was allowed';
exception when unique_violation then null;
end $$;

-- Trainers cannot delete.
do $$
declare n int;
begin
  delete from public.music_video;
  get diagnostics n = row_count;
  assert n = 0, 'trainer deleted videos';
end $$;
reset test.role;
reset role;

set role anon;
do $$
declare n int;
begin
  select count(*) into n from public.music_track; assert n = 1, 'anon should see the one published track, saw ' || n;
end $$;
reset role;

\echo 'artist hub integration: all checks passed'
