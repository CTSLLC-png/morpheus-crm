-- Campaign Studio → Creator Studio handoff: where the finished media lives.
-- Saving a media link does not touch title/body, so the review gate leaves
-- the asset's approval intact.
alter table public.growth_campaign_asset
  add column if not exists media_url text
  check (media_url is null or (media_url ~ '^https://\S+$' and char_length(media_url) <= 2000));

comment on column public.growth_campaign_asset.media_url is
  'Link to the finished video/image produced in Creator Studio for this approved asset.';
