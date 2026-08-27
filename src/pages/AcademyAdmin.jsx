// src/pages/AcademyAdmin.jsx
// ── MORPHEUS.EDU — Claude Academy (trainer/admin view) ─────────
// Cohort-wide course progress, checkpoint results, and the
// EDU.REGISTRY credential registry with issue/revoke controls.

import { useState, useEffect } from 'react'
import { getCourse, getAcademyOverview, getCredentialRegistry, issueCredential, revokeCredential } from '../lib/edu.js'
import { generateEduCertificatePDF } from '../lib/educert.js'
import {
  listMediaAssets, createMediaAsset, updateMediaAsset, deleteMediaAsset,
  listLessonMedia, attachAssetToLesson, detachAssetFromLesson, reorderLessonMedia,
  validateAssetDraft, formatDuration,
  MEDIA_KINDS, MEDIA_PROVIDERS, EVIDENCE_LEVELS, ATTACHMENT_ROLES,
} from '../lib/media.js'

function pctColor(p) { return p >= 80 ? '#0F6E56' : p >= 40 ? '#BA7517' : '#8BA0B8' }

export default function AcademyAdmin({ staffProfileId }) {
  const [course, setCourse]     = useState(null)
  const [rows, setRows]         = useState([])
  const [registry, setRegistry] = useState([])
  const [tab, setTab]           = useState('progress') // progress | registry | media
  const [busy, setBusy]         = useState(null)
  const [error, setError]       = useState(null)

  async function load() {
    try {
      const c = await getCourse('CAP-C')
      setCourse(c)
      const [ov, reg] = await Promise.all([getAcademyOverview(c.id), getCredentialRegistry()])
      setRows(ov)
      setRegistry(reg)
    } catch (e) { setError(e.message) }
  }
  useEffect(() => { load() }, [])

  async function handleIssue(row) {
    if (!course) return
    if (!window.confirm(`Issue "${course.credential_name}" to ${row.full_name}? This writes a permanent record to the credential registry.`)) return
    setBusy(row.id)
    try {
      await issueCredential({
        course,
        participantId: row.id,
        holderName: row.full_name,
        issuedBy: staffProfileId ?? null,
        expiresMonths: 24,
      })
      await load()
      setTab('registry')
    } catch (e) { setError(e.message) }
    setBusy(null)
  }

  async function handleRevoke(cred) {
    if (!window.confirm(`Revoke ${cred.credential_code} (${cred.holder_name})? The public verify page will show it as revoked.`)) return
    try { await revokeCredential(cred.id); await load() } catch (e) { setError(e.message) }
  }

  if (error)   return <div style={st.error}>Academy error: {error}</div>
  if (!course) return <div style={st.loading}>Loading Academy…</div>

  const availableModules = course.modules.filter(m => m.status === 'available')
  const credentialed = new Set(registry.filter(r => r.status === 'active').map(r => r.participant_id))

  return (
    <div>
      {/* Header stats */}
      <div style={st.statRow}>
        {[
          { label: 'Course', value: course.code, sub: course.credential_name },
          { label: 'Modules live', value: availableModules.length, sub: `${course.modules.length} total (rest post-pilot)` },
          { label: 'Learners active', value: rows.filter(r => r.lessonsDone > 0).length, sub: `${rows.length} enrolled in Morpheus` },
          { label: 'Credentials issued', value: registry.filter(r => r.status === 'active').length, sub: 'EDU.REGISTRY' },
        ].map((m, i) => (
          <div key={i} style={st.stat}>
            <div style={st.statLabel}>{m.label}</div>
            <div style={st.statVal}>{m.value}</div>
            <div style={st.statSub}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={st.tabs}>
        {[['progress', 'Learner progress'], ['registry', `Credential registry (${registry.length})`], ['media', 'Media library']].map(([k, label]) => (
          <div key={k} style={{ ...st.tab, ...(tab === k ? st.tabActive : {}) }} onClick={() => setTab(k)}>{label}</div>
        ))}
      </div>

      {tab === 'progress' && (
        <div style={st.tableCard}>
          <table style={st.table}>
            <thead><tr style={{ background: '#F7F9FC' }}>
              {['CTS ID', 'Name', 'Lessons', 'Progress', 'Checkpoints passed', 'Credential'].map(h => (
                <th key={h} style={st.th}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: i < rows.length - 1 ? '1px solid #F0F4F8' : 'none' }}>
                  <td style={st.tdMono}>{r.cts_id}</td>
                  <td style={{ ...st.td, fontWeight: 500 }}>{r.full_name}</td>
                  <td style={st.td}>{r.lessonsDone}/{r.lessonsTotal}</td>
                  <td style={st.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={st.pbar}><div style={{ ...st.pfill, width: `${r.pct}%`, background: pctColor(r.pct) }} /></div>
                      <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '11px', color: pctColor(r.pct), width: '32px' }}>{r.pct}%</span>
                    </div>
                  </td>
                  <td style={st.td}>{r.checkpointsPassed}/{availableModules.length}</td>
                  <td style={st.td}>
                    {credentialed.has(r.id)
                      ? <span style={st.certPill}>Issued ✓</span>
                      : <button style={{ ...st.btnSm, opacity: busy === r.id ? 0.5 : 1 }} disabled={busy === r.id}
                          onClick={() => handleIssue(r)}>
                          {busy === r.id ? 'Issuing…' : 'Issue credential'}
                        </button>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} style={st.emptyRow}>No participants enrolled yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'registry' && (
        <div style={st.tableCard}>
          <table style={st.table}>
            <thead><tr style={{ background: '#F7F9FC' }}>
              {['Code', 'Holder', 'Credential', 'Issued', 'Expires', 'Status', ''].map(h => (
                <th key={h} style={st.th}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {registry.map((c, i) => (
                <tr key={c.id} style={{ borderBottom: i < registry.length - 1 ? '1px solid #F0F4F8' : 'none' }}>
                  <td style={st.tdMono}>
                    <a href={`/verify/${c.credential_code}`} target="_blank" rel="noreferrer" style={{ color: '#2176AE', textDecoration: 'none' }}>
                      {c.credential_code}
                    </a>
                  </td>
                  <td style={{ ...st.td, fontWeight: 500 }}>{c.holder_name}</td>
                  <td style={st.td}>{c.credential_name}</td>
                  <td style={st.tdMono}>{new Date(c.issued_at).toLocaleDateString()}</td>
                  <td style={st.tdMono}>{c.expires_at ? new Date(c.expires_at).toLocaleDateString() : '—'}</td>
                  <td style={st.td}>
                    <span style={{ ...st.statusPill, background: c.status === 'active' ? '#E1F5EE' : '#FAECE7', color: c.status === 'active' ? '#0F6E56' : '#993C1D' }}>
                      {c.status}
                    </span>
                  </td>
                  <td style={st.td}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {c.status === 'active' && <button style={st.btnSm} onClick={() => generateEduCertificatePDF(c)}>PDF ↓</button>}
                      {c.status === 'active' && <button style={st.btnDanger} onClick={() => handleRevoke(c)}>Revoke</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {registry.length === 0 && <tr><td colSpan={7} style={st.emptyRow}>No credentials issued yet. Issue one from the Learner progress tab.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'media' && <MediaLibrary lessons={flattenLessons(course)} />}

      <div style={st.note}>
        Every credential is a permanent registry record, publicly verifiable at
        <b> {window.location.origin}/verify/&lt;code&gt;</b>. CAP-C is issued by CTS LLC and is
        not an Anthropic certification.
      </div>
    </div>
  )
}

// ── MEDIA LIBRARY ─────────────────────────────────────────────
// The reuse-first surface over edu_media_asset / edu_lesson_media.
// One asset can be attached to many lessons, so the list leads with
// where each asset is already used rather than with the asset itself.

/** Course tree → flat, ordered lesson options for the attach picker. */
function flattenLessons(course) {
  return (course?.modules ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .flatMap(m => (m.edu_lessons ?? []).map(l => ({
      id:    l.id,
      title: l.title,
      label: `M${String(m.sort_order).padStart(2, '0')} · ${l.title}`,
    })))
}

const EMPTY_ASSET = {
  kind: 'video', title: '', description: '', media_url: '', poster_url: '', caption_url: '',
  transcript_text: '', duration_seconds: '', aspect_ratio: '', provider: 'upload',
  external_ref: '', manifest_url: '', evidence_level: '', source_note: '',
  requires_disclosure: false, disclosure_note: '', is_published: false,
}

/** DB row → form draft. Nulls become '' so inputs stay controlled. */
function assetToDraft(a) {
  const draft = { ...EMPTY_ASSET }
  for (const k of Object.keys(EMPTY_ASSET)) {
    const v = a[k]
    draft[k] = typeof EMPTY_ASSET[k] === 'boolean' ? !!v : (v ?? '')
  }
  return draft
}

function MediaLibrary({ lessons }) {
  const [assets, setAssets]   = useState(null)     // null = loading
  const [err, setErr]         = useState(null)
  const [busy, setBusy]       = useState(false)

  const [draft, setDraft]     = useState(null)     // form state, null = form closed
  const [editingId, setEditingId] = useState(null) // null = creating

  const [attach, setAttach]   = useState(null)     // { assetId, lessonId, role, sortOrder, contextNote, autoplay }
  const [inspectId, setInspectId] = useState('')   // lesson whose attachments are shown
  const [inspect, setInspect] = useState([])

  async function reload() {
    try {
      setErr(null)
      setAssets(await listMediaAssets())
    } catch (e) { setErr(e.message); setAssets([]) }
  }
  useEffect(() => { reload() }, [])

  async function reloadInspect(lessonId) {
    if (!lessonId) { setInspect([]); return }
    try { setInspect(await listLessonMedia(lessonId)) }
    catch (e) { setErr(e.message); setInspect([]) }
  }
  useEffect(() => { reloadInspect(inspectId) }, [inspectId])

  const problems = draft ? validateAssetDraft(draft) : []

  async function saveAsset() {
    if (problems.length) return
    setBusy(true)
    try {
      if (editingId) await updateMediaAsset(editingId, draft)
      else           await createMediaAsset(draft)
      setDraft(null); setEditingId(null)
      await reload()
      if (inspectId) await reloadInspect(inspectId)
      setErr(null)
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  async function removeAsset(a) {
    if (!window.confirm(`Delete "${a.title}" from the media library? This cannot be undone.`)) return
    setBusy(true)
    try { await deleteMediaAsset(a.id); await reload(); setErr(null) }
    catch (e) { setErr(e.message) }   // includes the "still attached to …" message
    setBusy(false)
  }

  async function submitAttach() {
    setBusy(true)
    try {
      await attachAssetToLesson({
        lessonId:    attach.lessonId,
        assetId:     attach.assetId,
        role:        attach.role,
        sortOrder:   attach.sortOrder === '' ? 0 : Number(attach.sortOrder),
        contextNote: attach.contextNote,
        autoplay:    attach.autoplay,
      })
      const lessonId = attach.lessonId
      setAttach(null)
      await reload()
      setInspectId(lessonId)
      await reloadInspect(lessonId)
      setErr(null)
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  async function detach(row) {
    if (!window.confirm(`Detach "${row.asset_title}" from "${row.lesson_title}"? The asset stays in the library.`)) return
    setBusy(true)
    try { await detachAssetFromLesson(row.lesson_id, row.asset_id); await reload(); await reloadInspect(inspectId); setErr(null) }
    catch (e) { setErr(e.message) }
    setBusy(false)
  }

  async function move(index, dir) {
    const next = [...inspect]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setBusy(true)
    try { await reorderLessonMedia(inspectId, next.map(r => r.asset_id)); await reloadInspect(inspectId); setErr(null) }
    catch (e) { setErr(e.message) }
    setBusy(false)
  }

  if (assets === null) return <div style={st.loading}>Loading media library…</div>

  const orphans = assets.filter(a => a.lesson_count === 0).length
  const reused  = assets.filter(a => a.lesson_count > 1).length

  return (
    <div>
      {err && <div style={{ ...st.error, marginBottom: '12px' }}>{err}</div>}

      <div style={st.mediaBar}>
        <div style={st.mediaCounts}>
          <b>{assets.length}</b> asset{assets.length === 1 ? '' : 's'}
          {assets.length > 0 && <> · <b>{reused}</b> reused in more than one lesson · <b>{orphans}</b> not attached to any lesson</>}
        </div>
        <button
          style={st.btnSm}
          onClick={() => { setEditingId(null); setDraft({ ...EMPTY_ASSET }); setAttach(null) }}
        >
          + New asset
        </button>
      </div>

      {/* ── Create / edit form ── */}
      {draft && (
        <div style={st.panel}>
          <div style={st.panelTitle}>{editingId ? 'Edit asset' : 'New media asset'}</div>

          <div style={st.formGrid}>
            <Field label="Title *">
              <input style={st.input} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
            </Field>
            <Field label="Kind">
              <select style={st.input} value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value })}>
                {MEDIA_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </Field>
            <Field label="Media URL *" wide>
              <input style={st.input} value={draft.media_url} onChange={e => setDraft({ ...draft, media_url: e.target.value })} placeholder="https://…" />
            </Field>
            <Field label="Description" wide>
              <textarea style={{ ...st.input, minHeight: '52px' }} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />
            </Field>
            <Field label="Poster URL">
              <input style={st.input} value={draft.poster_url} onChange={e => setDraft({ ...draft, poster_url: e.target.value })} />
            </Field>
            <Field label="Caption / VTT URL">
              <input style={st.input} value={draft.caption_url} onChange={e => setDraft({ ...draft, caption_url: e.target.value })} />
            </Field>
            <Field label="Duration (seconds)">
              <input style={st.input} type="number" min="0" step="1" value={draft.duration_seconds}
                onChange={e => setDraft({ ...draft, duration_seconds: e.target.value })} />
            </Field>
            <Field label="Aspect ratio">
              <input style={st.input} value={draft.aspect_ratio} placeholder="16:9 · 9:16 · 1:1"
                onChange={e => setDraft({ ...draft, aspect_ratio: e.target.value })} />
            </Field>
            <Field label="Provider">
              <select style={st.input} value={draft.provider} onChange={e => setDraft({ ...draft, provider: e.target.value })}>
                {MEDIA_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="External reference">
              <input style={st.input} value={draft.external_ref} onChange={e => setDraft({ ...draft, external_ref: e.target.value })} />
            </Field>
            <Field label="Manifest URL">
              <input style={st.input} value={draft.manifest_url} onChange={e => setDraft({ ...draft, manifest_url: e.target.value })} />
            </Field>
            <Field label="Evidence level">
              <select style={st.input} value={draft.evidence_level} onChange={e => setDraft({ ...draft, evidence_level: e.target.value })}>
                <option value="">— not recorded —</option>
                {EVIDENCE_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>
            <Field label="Source note" wide>
              <textarea style={{ ...st.input, minHeight: '52px' }} value={draft.source_note}
                onChange={e => setDraft({ ...draft, source_note: e.target.value })} />
            </Field>
            <Field label="Transcript" wide>
              <textarea style={{ ...st.input, minHeight: '52px' }} value={draft.transcript_text}
                onChange={e => setDraft({ ...draft, transcript_text: e.target.value })} />
            </Field>
          </div>

          <label style={st.checkRow}>
            <input type="checkbox" checked={draft.requires_disclosure}
              onChange={e => setDraft({ ...draft, requires_disclosure: e.target.checked })} />
            <span>Requires disclosure (AI-generated visuals, synthetic voice, re-enactment…)</span>
          </label>

          {draft.requires_disclosure && (
            <Field label="Disclosure note *" wide>
              <textarea style={{ ...st.input, minHeight: '52px' }} value={draft.disclosure_note}
                onChange={e => setDraft({ ...draft, disclosure_note: e.target.value })}
                placeholder="Shown to every learner next to the player before playback." />
            </Field>
          )}

          <label style={st.checkRow}>
            <input type="checkbox" checked={draft.is_published}
              onChange={e => setDraft({ ...draft, is_published: e.target.checked })} />
            <span>Published (unpublished assets are visible to staff only)</span>
          </label>

          {problems.length > 0 && (
            <ul style={st.problems}>{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
          )}

          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button style={{ ...st.btnSm, opacity: problems.length || busy ? 0.5 : 1 }}
              disabled={problems.length > 0 || busy} onClick={saveAsset}>
              {busy ? 'Saving…' : editingId ? 'Save changes' : 'Create asset'}
            </button>
            <button style={st.btnGhost} onClick={() => { setDraft(null); setEditingId(null) }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Attach an existing asset to a lesson ── */}
      {attach && (
        <div style={st.panel}>
          <div style={st.panelTitle}>Attach to a lesson</div>
          <div style={st.panelHint}>
            Attaching reuses the asset. Nothing is copied — a caption fix or a disclosure change on
            the asset reaches every lesson it is attached to.
          </div>
          <div style={st.formGrid}>
            <Field label="Asset" wide>
              <select style={st.input} value={attach.assetId} onChange={e => setAttach({ ...attach, assetId: e.target.value })}>
                <option value="">— pick an asset —</option>
                {assets.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.title} ({a.kind}{a.lesson_count > 0 ? ` · already in ${a.lesson_count} lesson${a.lesson_count === 1 ? '' : 's'}` : ' · unused'})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Lesson" wide>
              <select style={st.input} value={attach.lessonId} onChange={e => setAttach({ ...attach, lessonId: e.target.value })}>
                <option value="">— pick a lesson —</option>
                {lessons.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
              {lessons.length === 0 && <div style={st.panelHint}>This course has no lessons to attach to yet.</div>}
            </Field>
            <Field label="Role">
              <select style={st.input} value={attach.role} onChange={e => setAttach({ ...attach, role: e.target.value })}>
                {ATTACHMENT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Sort order">
              <input style={st.input} type="number" min="0" step="1" value={attach.sortOrder}
                onChange={e => setAttach({ ...attach, sortOrder: e.target.value })} />
            </Field>
            <Field label="Context note (why it is here)" wide>
              <input style={st.input} value={attach.contextNote} onChange={e => setAttach({ ...attach, contextNote: e.target.value })} />
            </Field>
          </div>
          <label style={st.checkRow}>
            <input type="checkbox" checked={attach.autoplay}
              onChange={e => setAttach({ ...attach, autoplay: e.target.checked })} />
            <span>Autoplay — honoured only for the first primary video, and only muted. Never for an asset that requires disclosure.</span>
          </label>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button style={{ ...st.btnSm, opacity: !attach.assetId || !attach.lessonId || busy ? 0.5 : 1 }}
              disabled={!attach.assetId || !attach.lessonId || busy} onClick={submitAttach}>
              {busy ? 'Attaching…' : 'Attach'}
            </button>
            <button style={st.btnGhost} onClick={() => setAttach(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── The library ── */}
      <div style={st.tableCard}>
        <table style={st.table}>
          <thead><tr style={{ background: '#F7F9FC' }}>
            {['Asset', 'Kind', 'Duration', 'Provider', 'Published', 'Used in', ''].map(h => (
              <th key={h} style={st.th}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {assets.map((a, i) => (
              <tr key={a.id} style={{ borderBottom: i < assets.length - 1 ? '1px solid #F0F4F8' : 'none' }}>
                <td style={{ ...st.td, fontWeight: 500 }}>
                  {a.title}
                  {a.requires_disclosure && <span style={st.discPill}>disclosure</span>}
                </td>
                <td style={st.td}>{a.kind}</td>
                <td style={st.tdMono}>{formatDuration(a.duration_seconds) ?? '—'}</td>
                <td style={st.tdMono}>{a.provider}</td>
                <td style={st.td}>
                  <span style={{ ...st.statusPill, background: a.is_published ? '#E1F5EE' : '#F0F4F8', color: a.is_published ? '#0F6E56' : '#8BA0B8' }}>
                    {a.is_published ? 'published' : 'draft'}
                  </span>
                </td>
                <td style={st.td}>
                  {a.lesson_count === 0
                    ? <span style={st.orphanPill}>Not used in any lesson</span>
                    : (
                      <div>
                        <span style={{ ...st.usePill, background: a.lesson_count > 1 ? '#E6F1FB' : '#F0F4F8', color: a.lesson_count > 1 ? '#0C447C' : '#4A6080' }}>
                          {a.lesson_count} lesson{a.lesson_count === 1 ? '' : 's'}
                          {a.course_count > 1 ? ` · ${a.course_count} courses` : ''}
                        </span>
                        {a.used_in && <div style={st.usedIn}>{a.used_in}</div>}
                      </div>
                    )}
                </td>
                <td style={st.td}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button style={st.btnSm} disabled={busy}
                      onClick={() => setAttach({ assetId: a.id, lessonId: '', role: 'primary', sortOrder: 0, contextNote: '', autoplay: false })}>
                      Attach →
                    </button>
                    <button style={st.btnGhost} disabled={busy}
                      onClick={() => { setEditingId(a.id); setDraft(assetToDraft(a)); setAttach(null) }}>
                      Edit
                    </button>
                    <button style={st.btnDanger} disabled={busy} onClick={() => removeAsset(a)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {assets.length === 0 && (
              <tr><td colSpan={7} style={st.emptyCell}>
                <div style={{ fontWeight: 600, color: '#4A6080', marginBottom: '6px' }}>The media library is empty.</div>
                <div>
                  Add an asset with <b>+ New asset</b> above — a video, audio clip, image or document, with
                  its URL and (for produced or synthetic content) its evidence level and disclosure note.
                  Once an asset exists you can attach it to any number of lessons; it is stored once and
                  reused, so a caption or disclosure fix reaches every lesson at the same time.
                </div>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── One lesson's attachments, in render order ── */}
      <div style={{ ...st.panel, marginTop: '14px' }}>
        <div style={st.panelTitle}>Media on a lesson</div>
        <select style={{ ...st.input, maxWidth: '420px' }} value={inspectId} onChange={e => setInspectId(e.target.value)}>
          <option value="">— pick a lesson to see what plays on it —</option>
          {lessons.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>

        {inspectId && inspect.length === 0 && (
          <div style={st.panelHint}>This lesson has no media attached. Use <b>Attach →</b> on any asset above.</div>
        )}

        {inspect.map((row, i) => (
          <div key={row.asset_id} style={st.attachRow}>
            <span style={st.tdMono}>{i + 1}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 500, color: '#0D1B2A' }}>
                {row.asset_title}
                {row.requires_disclosure && <span style={st.discPill}>disclosure</span>}
                {row.autoplay && <span style={st.autoPill}>autoplay</span>}
              </div>
              <div style={{ fontSize: '11px', color: '#8BA0B8', marginTop: '2px' }}>
                {row.kind} · {row.role} · {formatDuration(row.duration_seconds) ?? 'duration not recorded'}
                {row.caption_url ? ' · captions' : ' · no captions'}
                {row.is_published ? '' : ' · asset not published (learners will not see it)'}
              </div>
              {row.context_note && <div style={{ fontSize: '11.5px', color: '#4A6080', marginTop: '3px' }}>{row.context_note}</div>}
            </div>
            <button style={st.btnGhost} disabled={busy || i === 0} onClick={() => move(i, -1)}>↑</button>
            <button style={st.btnGhost} disabled={busy || i === inspect.length - 1} onClick={() => move(i, 1)}>↓</button>
            <button style={st.btnDanger} disabled={busy} onClick={() => detach(row)}>Detach</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function Field({ label, wide = false, children }) {
  return (
    <label style={{ ...st.field, ...(wide ? { gridColumn: '1 / -1' } : {}) }}>
      <span style={st.fieldLabel}>{label}</span>
      {children}
    </label>
  )
}

const st = {
  loading: { padding: '40px', color: '#8BA0B8', fontSize: '13px' },
  error:   { background: '#FAECE7', color: '#993C1D', borderRadius: '10px', padding: '14px 16px', fontSize: '13px' },
  statRow: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '16px' },
  stat:    { background: '#fff', border: '1px solid #CBD8E6', borderRadius: '12px', padding: '14px 16px' },
  statLabel:{ fontSize: '10px', color: '#8BA0B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '5px' },
  statVal: { fontSize: '24px', fontWeight: 300, color: '#0D1B2A', fontFamily: "'DM Mono',monospace", lineHeight: 1 },
  statSub: { fontSize: '10.5px', color: '#8BA0B8', marginTop: '5px' },
  tabs:    { display: 'flex', gap: '4px', marginBottom: '12px' },
  tab:     { padding: '7px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, color: '#4A6080', cursor: 'pointer', border: '1px solid transparent' },
  tabActive:{ background: '#fff', border: '1px solid #CBD8E6', color: '#0D1B2A' },
  tableCard:{ background: '#fff', border: '1px solid #CBD8E6', borderRadius: '16px', overflow: 'hidden' },
  table:   { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th:      { padding: '9px 14px', textAlign: 'left', fontWeight: 500, fontSize: '11px', color: '#4A6080', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #CBD8E6' },
  td:      { padding: '10px 14px', color: '#0D1B2A' },
  tdMono:  { padding: '10px 14px', fontFamily: "'DM Mono',monospace", fontSize: '11px', color: '#4A6080' },
  pbar:    { flex: 1, maxWidth: '120px', height: '6px', background: '#F0F4F8', borderRadius: '3px', overflow: 'hidden' },
  pfill:   { height: '100%', borderRadius: '3px', transition: 'width 0.5s ease' },
  certPill:{ fontSize: '10px', fontWeight: 600, padding: '3px 10px', borderRadius: '12px', background: '#E1F5EE', color: '#0F6E56' },
  statusPill:{ fontSize: '10px', fontWeight: 600, padding: '2px 9px', borderRadius: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' },
  btnSm:   { padding: '5px 12px', border: 'none', borderRadius: '7px', background: '#0D1B2A', color: '#fff', fontSize: '11px', fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" },
  btnDanger:{ padding: '4px 10px', border: '1px solid #E8C4B8', borderRadius: '7px', background: '#fff', color: '#993C1D', fontSize: '11px', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" },
  emptyRow:{ padding: '24px', textAlign: 'center', color: '#8BA0B8', fontStyle: 'italic' },
  note:    { fontSize: '10.5px', color: '#8BA0B8', lineHeight: 1.6, padding: '14px 4px' },

  // ── media library ──
  mediaBar:   { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' },
  mediaCounts:{ flex: 1, fontSize: '12px', color: '#4A6080' },
  panel:      { background: '#fff', border: '1px solid #CBD8E6', borderRadius: '16px', padding: '18px', marginBottom: '14px' },
  panelTitle: { fontSize: '13px', fontWeight: 600, color: '#0D1B2A', marginBottom: '4px' },
  panelHint:  { fontSize: '11.5px', color: '#8BA0B8', lineHeight: 1.6, marginBottom: '10px' },
  formGrid:   { display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '10px 14px', marginTop: '10px' },
  field:      { display: 'flex', flexDirection: 'column', gap: '4px' },
  fieldLabel: { fontSize: '10px', color: '#8BA0B8', textTransform: 'uppercase', letterSpacing: '0.07em' },
  input:      { width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: '1px solid #CBD8E6', borderRadius: '8px', fontSize: '12.5px', color: '#0D1B2A', background: '#fff', fontFamily: "'DM Sans',sans-serif" },
  checkRow:   { display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12px', color: '#33475E', lineHeight: 1.5, marginTop: '12px' },
  problems:   { margin: '12px 0 0', padding: '10px 14px 10px 30px', background: '#FAEEDA', border: '1px solid #E6C98A', borderRadius: '9px', color: '#7A4E0A', fontSize: '12px', lineHeight: 1.6 },
  btnGhost:   { padding: '5px 12px', border: '1px solid #CBD8E6', borderRadius: '7px', background: '#fff', color: '#0D1B2A', fontSize: '11px', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" },
  discPill:   { marginLeft: '7px', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', padding: '2px 7px', borderRadius: '10px', background: '#FAEEDA', color: '#BA7517' },
  autoPill:   { marginLeft: '7px', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', padding: '2px 7px', borderRadius: '10px', background: '#E6F1FB', color: '#0C447C' },
  usePill:    { display: 'inline-block', fontSize: '10px', fontWeight: 600, padding: '2px 9px', borderRadius: '12px' },
  orphanPill: { display: 'inline-block', fontSize: '10px', fontWeight: 600, padding: '2px 9px', borderRadius: '12px', background: '#FAECE7', color: '#993C1D' },
  usedIn:     { fontSize: '11px', color: '#8BA0B8', marginTop: '3px', lineHeight: 1.5 },
  emptyCell:  { padding: '26px 24px', textAlign: 'center', color: '#8BA0B8', fontSize: '12.5px', lineHeight: 1.7 },
  attachRow:  { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 0', borderTop: '1px solid #F0F4F8' },
}
