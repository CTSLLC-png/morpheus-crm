// src/lib/media.js
// ── MORPHEUS.EDU — reusable media library (edu_media_asset) ─────
// One asset, many lessons. Reads and writes go through RLS: learners
// see published assets, staff (current_user_role() in super_admin /
// trainer) manage everything. Nothing here tries to decide authority
// itself — the database does that.
//
// See db/migrations/0010_edu_media_assets.sql for why the library and
// the lesson attachment are separate tables.

import { supabase } from './supabase.js'

export const MEDIA_KINDS      = ['video', 'audio', 'image', 'document']
export const MEDIA_PROVIDERS  = ['creator_studio', 'upload', 'external']
export const EVIDENCE_LEVELS  = ['DOCUMENTED', 'INFERRED', 'DRAMATIZED', 'UNVERIFIED']
export const ATTACHMENT_ROLES = ['primary', 'supplement', 'reference']

/** Postgres foreign-key violation — edu_lesson_media.asset_id is ON DELETE RESTRICT. */
const FK_VIOLATION = '23503'

// ── helpers ────────────────────────────────────────────────────

/** '' / whitespace → null, so optional text columns stay NULL rather than empty. */
function nullIfBlank(v) {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

/**
 * Seconds → 'm:ss' / 'h:mm:ss'. Returns null for null/negative/non-finite,
 * so callers render a dash instead of 'NaN:NaN'.
 */
export function formatDuration(seconds) {
  const n = Number(seconds)
  if (seconds == null || !Number.isFinite(n) || n < 0) return null
  const total = Math.round(n)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (x) => String(x).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/**
 * aspect_ratio text → a CSS `aspect-ratio` value, so a 9:16 vertical
 * asset gets a vertical frame instead of being letterboxed into 16:9.
 * Accepts '16:9', '16/9' or a bare decimal. Unparseable/absent → fallback.
 */
export function aspectRatioCss(aspectRatio, fallback = '16 / 9') {
  const raw = nullIfBlank(aspectRatio)
  if (!raw) return fallback
  const pair = raw.match(/^\s*(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)\s*$/i)
  if (pair) {
    const w = Number(pair[1]), h = Number(pair[2])
    if (w > 0 && h > 0) return `${w} / ${h}`
    return fallback
  }
  const dec = Number(raw)
  if (Number.isFinite(dec) && dec > 0) return `${dec} / 1`
  return fallback
}

/**
 * Client-side mirror of the table's CHECK constraints. Returns an array of
 * human-readable problems ([] means valid). Validating here is not a
 * security control — the database still enforces every one of these — it
 * exists so a trainer sees "a disclosure note is required" instead of
 * `new row violates check constraint "media_disclosure_has_note"`.
 */
export function validateAssetDraft(draft = {}) {
  const problems = []
  if (!nullIfBlank(draft.title))      problems.push('Title is required.')
  if (!nullIfBlank(draft.media_url))  problems.push('Media URL is required — an asset with no file cannot be played.')
  if (!MEDIA_KINDS.includes(draft.kind))         problems.push(`Kind must be one of: ${MEDIA_KINDS.join(', ')}.`)
  if (!MEDIA_PROVIDERS.includes(draft.provider)) problems.push(`Provider must be one of: ${MEDIA_PROVIDERS.join(', ')}.`)

  const evidence = nullIfBlank(draft.evidence_level)
  if (evidence && !EVIDENCE_LEVELS.includes(evidence)) {
    problems.push(`Evidence level must be one of: ${EVIDENCE_LEVELS.join(', ')}.`)
  }

  if (draft.requires_disclosure && !nullIfBlank(draft.disclosure_note)) {
    problems.push(
      'This asset is marked as requiring disclosure, so a disclosure note is required. ' +
      'The note is what learners are shown next to the player before playback (for example, ' +
      '"Narration is a synthetic voice"), so there is nothing to show without it. ' +
      'The database enforces this too and will reject the save.',
    )
  }

  const dur = draft.duration_seconds
  if (dur !== null && dur !== undefined && dur !== '') {
    const n = Number(dur)
    if (!Number.isFinite(n) || n < 0)             problems.push('Duration must be a number of seconds, zero or more.')
    else if (!Number.isInteger(n))                problems.push('Duration must be a whole number of seconds.')
  }
  return problems
}

/** Shape a form draft into a row the table will accept. */
function toAssetRow(draft) {
  const dur = draft.duration_seconds
  return {
    kind:                draft.kind,
    title:               nullIfBlank(draft.title),
    description:         nullIfBlank(draft.description),
    media_url:           nullIfBlank(draft.media_url),
    poster_url:          nullIfBlank(draft.poster_url),
    caption_url:         nullIfBlank(draft.caption_url),
    transcript_text:     nullIfBlank(draft.transcript_text),
    duration_seconds:    dur === '' || dur == null ? null : Math.round(Number(dur)),
    aspect_ratio:        nullIfBlank(draft.aspect_ratio),
    provider:            draft.provider,
    external_ref:        nullIfBlank(draft.external_ref),
    manifest_url:        nullIfBlank(draft.manifest_url),
    evidence_level:      nullIfBlank(draft.evidence_level),
    source_note:         nullIfBlank(draft.source_note),
    requires_disclosure: !!draft.requires_disclosure,
    disclosure_note:     nullIfBlank(draft.disclosure_note),
    is_published:        !!draft.is_published,
  }
}

// ── LIBRARY ────────────────────────────────────────────────────

/**
 * Every asset visible to the caller, each joined to its reuse report from
 * v_media_asset_usage: lesson_count, course_count and `used_in` (the lesson
 * titles). lesson_count = 0 is an orphan; > 1 is real reuse.
 *
 * The asset list itself comes from the RLS-enforced table. The usage view is
 * not security_invoker (see listLessonMedia), so its rows are only ever
 * merged onto assets the caller could already read — a row in the view for
 * an asset the caller cannot see is dropped rather than surfaced.
 */
export async function listMediaAssets() {
  const [{ data: assets, error: aErr }, { data: usage, error: uErr }] = await Promise.all([
    supabase.from('edu_media_asset').select('*').order('created_at', { ascending: false }),
    supabase.from('v_media_asset_usage').select('*'),
  ])
  if (aErr) throw aErr
  if (uErr) throw uErr

  const byId = new Map((usage ?? []).map(u => [u.asset_id, u]))
  return (assets ?? []).map(a => {
    const u = byId.get(a.id)
    return {
      ...a,
      lesson_count: Number(u?.lesson_count ?? 0),
      course_count: Number(u?.course_count ?? 0),
      used_in:      u?.used_in ?? null,
    }
  })
}

/** One asset by id, or null if it does not exist / is not visible. */
export async function getMediaAsset(assetId) {
  const { data, error } = await supabase
    .from('edu_media_asset')
    .select('*')
    .eq('id', assetId)
    .maybeSingle()
  if (error) throw error
  return data
}

/** Reuse report for one asset (lesson_count, course_count, used_in). */
export async function getMediaAssetUsage(assetId) {
  const { data, error } = await supabase
    .from('v_media_asset_usage')
    .select('*')
    .eq('asset_id', assetId)
    .maybeSingle()
  if (error) throw error
  return data
}

/** Staff: create a library asset. Throws with the validation problems joined. */
export async function createMediaAsset(draft) {
  const problems = validateAssetDraft(draft)
  if (problems.length) throw new Error(problems.join(' '))

  const { data, error } = await supabase
    .from('edu_media_asset')
    .insert(toAssetRow(draft))
    .select()
    .single()
  if (error) throw error
  return data
}

/** Staff: update a library asset. */
export async function updateMediaAsset(assetId, draft) {
  const problems = validateAssetDraft(draft)
  if (problems.length) throw new Error(problems.join(' '))

  const { data, error } = await supabase
    .from('edu_media_asset')
    .update({ ...toAssetRow(draft), updated_at: new Date().toISOString() })
    .eq('id', assetId)
    .select()
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Asset was not updated — it may have been deleted, or your role does not permit editing it.')
  return data
}

/**
 * Staff: delete a library asset.
 *
 * edu_lesson_media.asset_id is ON DELETE RESTRICT, so deleting an attached
 * asset fails at the database rather than silently blanking a video out of a
 * published course. Turn that into a message that names the lessons.
 */
export async function deleteMediaAsset(assetId) {
  const { data, error } = await supabase
    .from('edu_media_asset')
    .delete()
    .eq('id', assetId)
    .select('id')

  if (error) {
    if (error.code === FK_VIOLATION) throw new Error(await stillAttachedMessage(assetId))
    throw error
  }
  if (!data || data.length === 0) {
    throw new Error('Nothing was deleted — the asset may already be gone, or your role does not permit deleting it.')
  }
}

/** Build "still used by …" from the usage view; degrade gracefully if that read fails. */
async function stillAttachedMessage(assetId) {
  let usage = null
  try { usage = await getMediaAssetUsage(assetId) } catch { /* fall through to the generic message */ }

  const count  = Number(usage?.lesson_count ?? 0)
  const titles = usage?.used_in ?? null

  if (count > 0 && titles) {
    return `Cannot delete "${usage.title}" — it is still attached to ${count} ` +
           `lesson${count === 1 ? '' : 's'}: ${titles}. Detach it from those lessons first, ` +
           'or unpublish it instead so it stays available where it is already used.'
  }
  return 'Cannot delete this asset — it is still attached to at least one lesson. ' +
         'Detach it everywhere it is used first, or unpublish it instead.'
}

// ── LESSON ATTACHMENTS ─────────────────────────────────────────

/**
 * One lesson's media in render order, with the provenance fields
 * (evidence_level, source_note, requires_disclosure, disclosure_note) the
 * player needs to honour.
 *
 * Returns exactly the v_lesson_media column shape, but reads the base
 * tables rather than the view — DELIBERATELY.
 *
 * v_lesson_media (and v_media_asset_usage) are plain views owned by
 * `postgres` with no `security_invoker = true`, so a SELECT through them
 * runs as the owner and does NOT apply RLS on edu_media_asset. Reading
 * v_lesson_media from the learner player would hand every learner every
 * attachment, including assets with is_published = false — silently
 * defeating the "Authenticated can read published media" policy.
 *
 * The `!inner` embed below is the fix that is available from the client:
 * edu_lesson_media and edu_media_asset are both RLS-enforced, and an inner
 * join drops the whole row when the caller may not read the asset. Staff
 * still see everything, because their policy says so.
 *
 * The view itself still wants fixing server-side:
 *   alter view v_lesson_media      set (security_invoker = true);
 *   alter view v_media_asset_usage set (security_invoker = true);
 * That is a migration, so it is out of scope for this change.
 */
export async function listLessonMedia(lessonId) {
  if (!lessonId) return []

  const { data, error } = await supabase
    .from('edu_lesson_media')
    .select(`
      lesson_id, role, sort_order, context_note, autoplay,
      edu_lessons!inner ( title, edu_modules!inner ( sort_order ) ),
      edu_media_asset!inner (
        id, kind, title, media_url, poster_url, caption_url,
        duration_seconds, aspect_ratio, provider,
        evidence_level, source_note, requires_disclosure, disclosure_note,
        is_published
      )
    `)
    .eq('lesson_id', lessonId)
    .order('sort_order', { ascending: true })
  if (error) throw error

  return (data ?? []).map(r => {
    const a = r.edu_media_asset ?? {}
    const l = r.edu_lessons ?? {}
    return {
      lesson_id:           r.lesson_id,
      lesson_title:        l.title ?? null,
      module_order:        l.edu_modules?.sort_order ?? null,
      role:                r.role,
      sort_order:          r.sort_order,
      context_note:        r.context_note,
      autoplay:            r.autoplay,
      asset_id:            a.id,
      kind:                a.kind,
      asset_title:         a.title,
      media_url:           a.media_url,
      poster_url:          a.poster_url,
      caption_url:         a.caption_url,
      duration_seconds:    a.duration_seconds,
      aspect_ratio:        a.aspect_ratio,
      provider:            a.provider,
      evidence_level:      a.evidence_level,
      source_note:         a.source_note,
      requires_disclosure: a.requires_disclosure,
      disclosure_note:     a.disclosure_note,
      is_published:        a.is_published,
    }
  })
}

/** Attach one library asset to one lesson. Unique on (lesson_id, asset_id). */
export async function attachAssetToLesson({
  lessonId,
  assetId,
  role = 'primary',
  sortOrder = 0,
  contextNote = null,
  autoplay = false,
}) {
  if (!lessonId) throw new Error('Pick a lesson to attach this asset to.')
  if (!assetId)  throw new Error('Pick an asset to attach.')
  if (!ATTACHMENT_ROLES.includes(role)) {
    throw new Error(`Role must be one of: ${ATTACHMENT_ROLES.join(', ')}.`)
  }
  const order = Number(sortOrder)
  if (!Number.isFinite(order) || !Number.isInteger(order) || order < 0) {
    throw new Error('Sort order must be a whole number, zero or more.')
  }

  const { data, error } = await supabase
    .from('edu_lesson_media')
    .insert({
      lesson_id:    lessonId,
      asset_id:     assetId,
      role,
      sort_order:   order,
      context_note: nullIfBlank(contextNote),
      autoplay:     !!autoplay,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('That asset is already attached to this lesson. Edit the existing attachment instead of adding a second one.')
    }
    throw error
  }
  return data
}

/** Change role / sort order / context note / autoplay on an existing attachment. */
export async function updateLessonMedia(lessonId, assetId, patch = {}) {
  const update = {}
  if (patch.role !== undefined) {
    if (!ATTACHMENT_ROLES.includes(patch.role)) {
      throw new Error(`Role must be one of: ${ATTACHMENT_ROLES.join(', ')}.`)
    }
    update.role = patch.role
  }
  if (patch.sortOrder !== undefined) {
    const order = Number(patch.sortOrder)
    if (!Number.isInteger(order) || order < 0) throw new Error('Sort order must be a whole number, zero or more.')
    update.sort_order = order
  }
  if (patch.contextNote !== undefined) update.context_note = nullIfBlank(patch.contextNote)
  if (patch.autoplay !== undefined)    update.autoplay = !!patch.autoplay
  if (Object.keys(update).length === 0) return

  const { error } = await supabase
    .from('edu_lesson_media')
    .update(update)
    .eq('lesson_id', lessonId)
    .eq('asset_id', assetId)
  if (error) throw error
}

/** Detach an asset from a lesson. The asset itself stays in the library. */
export async function detachAssetFromLesson(lessonId, assetId) {
  const { data, error } = await supabase
    .from('edu_lesson_media')
    .delete()
    .eq('lesson_id', lessonId)
    .eq('asset_id', assetId)
    .select('id')
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('Nothing was detached — the attachment may already be gone, or your role does not permit changing it.')
  }
}

/**
 * Rewrite render order for one lesson. `orderedAssetIds` is the asset ids in
 * the order they should play; sort_order becomes the index.
 */
export async function reorderLessonMedia(lessonId, orderedAssetIds) {
  for (let i = 0; i < orderedAssetIds.length; i++) {
    const { error } = await supabase
      .from('edu_lesson_media')
      .update({ sort_order: i })
      .eq('lesson_id', lessonId)
      .eq('asset_id', orderedAssetIds[i])
    if (error) throw error
  }
}

// Lesson options for the attach picker are derived in AcademyAdmin from the
// course tree it has already loaded (getCourse), rather than re-queried here.
