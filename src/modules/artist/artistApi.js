// src/modules/artist/artistApi.js
// ── Artist Hub — Supabase calls.
//    Staff (trainer, super_admin) read/write everything through RLS.
//    The public artist page reads only published rows and only the columns
//    granted to anon in sql/0018_artist_hub.sql — never music_take.

import { supabase } from '../../lib/supabase.js'
import { FALLBACK_CATALOG, sortReleasesForDisplay } from './artistCatalog.js'

export const TRACK_STATUSES = ['writing', 'generated', 'keeper-selected', 'mastered', 'released']
export const RELEASE_STATUSES = ['in-production', 'mastering', 'scheduled', 'released', 'on-hold']

const must = ({ data, error }) => { if (error) throw error; return data }

// ── Public (anon-safe column lists) ─────────────────────────────────────────
const PUBLIC_ARTIST  = 'id, slug, name, tagline, bio, genre, label'
const PUBLIC_RELEASE = 'id, title, kind, status, release_date, summary, cover_url'
const PUBLIC_TRACK   = 'id, release_id, track_no, title, role, status, listen_url'
const PUBLIC_VIDEO   = 'id, title, kind, youtube_id, channel, sort'

/**
 * Loads one artist's public page. Falls back to the catalog bundled with the
 * app when the database is unreachable or the migration has not run yet, so
 * the fan page never shows a blank screen.
 */
export async function loadPublicArtist(slug) {
  try {
    const artist = await supabase.from('music_artist').select(PUBLIC_ARTIST)
      .eq('slug', slug).eq('is_public', true).maybeSingle().then(must)
    if (!artist) return { ...fallback(slug), source: 'bundled' }

    const [releases, videos] = await Promise.all([
      supabase.from('music_release').select(PUBLIC_RELEASE)
        .eq('artist_id', artist.id).eq('is_public', true).order('release_date', { ascending: false, nullsFirst: true }).then(must),
      supabase.from('music_video').select(PUBLIC_VIDEO)
        .eq('artist_id', artist.id).eq('is_public', true).order('sort').then(must),
    ])
    const tracks = releases.length
      ? await supabase.from('music_track').select(PUBLIC_TRACK)
          .in('release_id', releases.map(r => r.id)).eq('is_public', true).order('track_no').then(must)
      : []
    return {
      artist,
      releases: sortReleasesForDisplay(releases).map(r => ({ ...r, tracks: tracks.filter(t => t.release_id === r.id) })),
      videos,
      source: 'database',
    }
  } catch {
    return { ...fallback(slug), source: 'bundled' }
  }
}

function fallback(slug) {
  return FALLBACK_CATALOG[slug] ?? { artist: null, releases: [], videos: [] }
}

// ── Staff ───────────────────────────────────────────────────────────────────
export const listArtists = () =>
  supabase.from('music_artist').select('*').order('name').then(must)

export const listReleases = artistId =>
  supabase.from('music_release').select('*').eq('artist_id', artistId).order('created_at').then(must)

export const listTracks = releaseIds =>
  releaseIds.length
    ? supabase.from('music_track').select('*').in('release_id', releaseIds).order('track_no').then(must)
    : Promise.resolve([])

export const listTakes = trackIds =>
  trackIds.length
    ? supabase.from('music_take').select('*').in('track_id', trackIds).order('created_at').then(must)
    : Promise.resolve([])

export const listVideos = artistId =>
  supabase.from('music_video').select('*').eq('artist_id', artistId).order('sort').then(must)

export const updateTrack = (id, patch) =>
  supabase.from('music_track').update(patch).eq('id', id).select().single().then(must)

export const updateRelease = (id, patch) =>
  supabase.from('music_release').update(patch).eq('id', id).select().single().then(must)

export const updateVideo = (id, patch) =>
  supabase.from('music_video').update(patch).eq('id', id).select().single().then(must)

export const addVideo = row =>
  supabase.from('music_video').insert(row).select().single().then(must)

/**
 * Marks one take as the keeper. The partial unique index allows only one
 * keeper per track, so the old keeper is cleared first.
 */
export async function setKeeper(trackId, takeId) {
  await supabase.from('music_take').update({ is_keeper: false }).eq('track_id', trackId).eq('is_keeper', true).then(must)
  await supabase.from('music_take').update({ is_keeper: true }).eq('id', takeId).then(must)
  return updateTrack(trackId, { status: 'keeper-selected' })
}

/** Accepts a full YouTube URL or a bare 11-character id. */
export function youtubeId(input) {
  const s = String(input ?? '').trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s
  const m = s.match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}
