// src/lib/lessonmedia.jsx
// ── MORPHEUS.EDU — lesson media player ─────────────────────────
// Renders a lesson's attached media (v_lesson_media) above its markdown.
//
// Three rules here are not cosmetic:
//   1. requires_disclosure => disclosure_note is rendered BEFORE the
//      player, is not dismissible, and there is no code path that hides
//      it. If the flag is set and no note exists, the media is withheld
//      rather than played undisclosed.
//   2. The element matches the asset kind. A non-video kind never gets a
//      <video>.
//   3. autoplay is honoured for at most one attachment per lesson — the
//      first `primary` — and only muted.

import { useState, useEffect } from 'react'
import { listLessonMedia, formatDuration, aspectRatioCss } from './media.js'

const KIND_LABEL = { video: 'Video', audio: 'Audio', image: 'Image', document: 'Document' }
const ROLE_LABEL = { primary: 'Primary', supplement: 'Supplement', reference: 'Reference' }
const PROVIDER_LABEL = { creator_studio: 'Creator Studio', upload: 'Upload', external: 'External' }

const EVIDENCE_COLOR = {
  DOCUMENTED: '#0F6E56',
  INFERRED:   '#2176AE',
  DRAMATIZED: '#BA7517',
  UNVERIFIED: '#993C1D',
}

const EVIDENCE_HINT = {
  DOCUMENTED: 'Backed by a cited source.',
  INFERRED:   'Reasoned from sources, not directly stated by one.',
  DRAMATIZED: 'A re-enactment or composite, not a record of real events.',
  UNVERIFIED: 'No source has been confirmed for this yet.',
}

function blank(v) { return v == null || String(v).trim() === '' }

/**
 * All media attached to one lesson, in render order.
 * Renders nothing at all when the lesson has no media.
 */
export default function LessonMedia({ lessonId }) {
  const [items, setItems]   = useState(null)   // null = still loading
  const [error, setError]   = useState(null)

  useEffect(() => {
    let cancelled = false
    setItems(null)
    setError(null)
    if (!lessonId) { setItems([]); return }

    listLessonMedia(lessonId)
      .then(rows => { if (!cancelled) setItems(rows) })
      .catch(e => { if (!cancelled) { setError(e?.message ?? 'Unknown error'); setItems([]) } })

    return () => { cancelled = true }
  }, [lessonId])

  if (error) {
    return <div style={ms.error}>This lesson&rsquo;s media could not be loaded: {error}</div>
  }
  if (items === null || items.length === 0) return null

  // Exactly one attachment may autoplay: the first `primary` that asked for
  // it, is a video, has a file, and carries no disclosure requirement — an
  // autoplaying clip would start before the notice had been read.
  const autoplayId = items.find(m =>
    m.role === 'primary' &&
    m.autoplay === true &&
    m.kind === 'video' &&
    !blank(m.media_url) &&
    !m.requires_disclosure,
  )?.asset_id ?? null

  return (
    <div style={ms.wrap}>
      {items.map(m => (
        <MediaItem key={`${m.lesson_id}:${m.asset_id}`} item={m} autoplay={m.asset_id === autoplayId} />
      ))}
    </div>
  )
}

function MediaItem({ item, autoplay }) {
  const title    = blank(item.asset_title) ? 'Untitled asset' : item.asset_title
  const duration = formatDuration(item.duration_seconds)
  const kind     = KIND_LABEL[item.kind] ?? 'Media'
  const provider = PROVIDER_LABEL[item.provider] ?? null

  // The disclosure gate. requires_disclosure with no note is a data fault:
  // withhold the media rather than play it with the disclosure missing.
  const needsDisclosure   = item.requires_disclosure === true
  const disclosureMissing = needsDisclosure && blank(item.disclosure_note)

  return (
    <figure style={ms.card}>
      <figcaption style={ms.head}>
        <span style={ms.kindPill}>{kind}</span>
        <span style={ms.title}>{title}</span>
        {ROLE_LABEL[item.role] && item.role !== 'primary' && (
          <span style={ms.rolePill}>{ROLE_LABEL[item.role]}</span>
        )}
        {duration && <span style={ms.meta}>{duration}</span>}
      </figcaption>

      {!blank(item.context_note) && <div style={ms.context}>{item.context_note}</div>}

      {needsDisclosure && (
        <div style={ms.disclosure} role="note">
          <span style={ms.disclosureLabel}>Disclosure</span>
          <span>
            {disclosureMissing
              ? 'This asset is flagged as requiring a disclosure, but no disclosure text has been ' +
                'recorded for it. It is withheld until a trainer adds one.'
              : item.disclosure_note}
          </span>
        </div>
      )}

      {disclosureMissing
        ? null
        : blank(item.media_url)
          ? <div style={ms.missing}>No media file is recorded for this asset, so there is nothing to play.</div>
          : <MediaElement item={item} autoplay={autoplay} title={title} />}

      <Provenance item={item} provider={provider} />
    </figure>
  )
}

/** The element for this asset's kind. Never a <video> for a non-video. */
function MediaElement({ item, autoplay, title }) {
  const hasCaptions = !blank(item.caption_url)

  if (item.kind === 'video') {
    return (
      <video
        controls
        playsInline
        preload="metadata"
        muted={autoplay || undefined}
        autoPlay={autoplay || undefined}
        poster={blank(item.poster_url) ? undefined : item.poster_url}
        src={item.media_url}
        style={{ ...ms.video, aspectRatio: aspectRatioCss(item.aspect_ratio, '16 / 9') }}
      >
        {hasCaptions && (
          <track kind="captions" src={item.caption_url} srcLang="en" label="Captions" default />
        )}
        Your browser cannot play this video.{' '}
        <a href={item.media_url} target="_blank" rel="noreferrer">Open the file directly</a>.
      </video>
    )
  }

  if (item.kind === 'audio') {
    return (
      <audio controls preload="metadata" src={item.media_url} style={ms.audio}>
        {hasCaptions && (
          <track kind="captions" src={item.caption_url} srcLang="en" label="Captions" default />
        )}
        Your browser cannot play this audio.{' '}
        <a href={item.media_url} target="_blank" rel="noreferrer">Open the file directly</a>.
      </audio>
    )
  }

  if (item.kind === 'image') {
    return (
      <img
        src={item.media_url}
        alt={title}
        style={{ ...ms.image, aspectRatio: aspectRatioCss(item.aspect_ratio, 'auto') }}
      />
    )
  }

  // document, and any kind added to the table later: a plain link, never a player.
  return (
    <a href={item.media_url} target="_blank" rel="noreferrer" style={ms.docLink}>
      Open “{title}” ↗
    </a>
  )
}

/** evidence_level + source_note, shown only when the asset carries them. */
function Provenance({ item, provider }) {
  const level  = blank(item.evidence_level) ? null : item.evidence_level
  const source = blank(item.source_note) ? null : item.source_note
  if (!level && !source && !provider) return null

  return (
    <div style={ms.provenance}>
      {level && (
        <span
          style={{ ...ms.evidencePill, color: EVIDENCE_COLOR[level] ?? '#4A6080', borderColor: EVIDENCE_COLOR[level] ?? '#CBD8E6' }}
          title={EVIDENCE_HINT[level] ?? undefined}
        >
          {level}
        </span>
      )}
      {source && <span style={ms.source}>{source}</span>}
      {provider && <span style={ms.provider}>{provider}</span>}
    </div>
  )
}

const ms = {
  wrap:      { marginBottom: '18px' },
  error:     { background: '#FAECE7', color: '#993C1D', borderRadius: '10px', padding: '12px 14px', fontSize: '12.5px', marginBottom: '14px' },
  card:      { margin: '0 0 14px', padding: '14px', background: '#F7F9FC', border: '1px solid #E8EFF6', borderRadius: '12px' },
  head:      { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' },
  kindPill:  { fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', padding: '2px 8px', borderRadius: '10px', border: '1px solid #CBD8E6', color: '#4A6080', flexShrink: 0 },
  rolePill:  { fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', padding: '2px 8px', borderRadius: '10px', background: '#F0F4F8', color: '#8BA0B8', flexShrink: 0 },
  title:     { flex: 1, fontSize: '13px', fontWeight: 600, color: '#0D1B2A', minWidth: '120px' },
  meta:      { fontSize: '11px', color: '#8BA0B8', fontFamily: "'DM Mono',monospace", flexShrink: 0 },
  context:   { fontSize: '12.5px', color: '#4A6080', lineHeight: 1.6, marginBottom: '8px' },
  disclosure:{ display: 'flex', alignItems: 'flex-start', gap: '9px', background: '#FAEEDA', border: '1px solid #E6C98A', borderRadius: '9px', padding: '10px 12px', marginBottom: '10px', fontSize: '12.5px', lineHeight: 1.6, color: '#7A4E0A' },
  disclosureLabel: { fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#BA7517', flexShrink: 0, paddingTop: '2px' },
  missing:   { fontSize: '12.5px', color: '#993C1D', background: '#FAECE7', borderRadius: '9px', padding: '10px 12px', lineHeight: 1.6 },
  video:     { width: '100%', maxWidth: '100%', maxHeight: '70vh', display: 'block', margin: '0 auto', background: '#0D1B2A', borderRadius: '10px', objectFit: 'contain' },
  audio:     { width: '100%', display: 'block' },
  image:     { width: '100%', maxWidth: '100%', maxHeight: '70vh', display: 'block', margin: '0 auto', borderRadius: '10px', objectFit: 'contain' },
  docLink:   { display: 'inline-block', padding: '8px 14px', border: '1px solid #CBD8E6', borderRadius: '8px', background: '#fff', color: '#0C447C', fontSize: '12.5px', fontWeight: 500, textDecoration: 'none' },
  provenance:{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '9px', paddingTop: '9px', borderTop: '1px solid #E8EFF6' },
  evidencePill: { fontSize: '9px', fontWeight: 700, letterSpacing: '0.07em', padding: '2px 8px', borderRadius: '10px', border: '1px solid', flexShrink: 0 },
  source:    { fontSize: '11.5px', color: '#4A6080', lineHeight: 1.55, flex: 1, minWidth: '140px' },
  provider:  { fontSize: '10.5px', color: '#8BA0B8', fontFamily: "'DM Mono',monospace", flexShrink: 0 },
}
