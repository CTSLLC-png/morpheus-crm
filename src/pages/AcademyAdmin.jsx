// src/pages/AcademyAdmin.jsx
// ── MORPHEUS.EDU — Claude Academy (trainer/admin view) ─────────
// Cohort-wide course progress, checkpoint results, and the
// EDU.REGISTRY credential registry with issue/revoke controls.

import { useState, useEffect } from 'react'
import { listCourses, getCourse, getAcademyOverview, getCredentialRegistry, issueCredential, revokeCredential,
         getCourseQuestionBank } from '../lib/edu.js'
import { generateEduCertificatePDF } from '../lib/educert.js'
import { SITE_URL } from '../lib/site.js'
import { BARE_BUTTON, Tabs, TabPanel } from '../components/a11y.jsx'

function pctColor(p) { return p >= 80 ? '#0F6E56' : p >= 40 ? '#854F0B' : '#5D768A' }

/** Checkpoint pass mark. Mirrors saveCheckpointAttempt's `passed = score >= 80`. */
const PASS_MARK = 80

function scoreColor(s) {
  if (s === undefined || s === null) return '#5D768A'
  return s >= PASS_MARK ? '#0F6E56' : s >= 60 ? '#854F0B' : '#993C1D'
}

export default function AcademyAdmin({ staffProfileId }) {
  const [courses, setCourses]   = useState(null)
  const [code, setCode]         = useState(null)
  const [course, setCourse]     = useState(null)
  const [rows, setRows]         = useState([])
  const [registry, setRegistry] = useState([])
  const [bank, setBank]         = useState([])
  const [tab, setTab]           = useState('curriculum') // curriculum | questions | matrix | progress | registry
  const [openModule, setOpenModule] = useState(null)
  const [busy, setBusy]         = useState(null)
  const [error, setError]       = useState(null)

  // Staff see drafts as well as published courses — RLS decides, listCourses
  // just asks. Selecting a course reloads everything scoped to it.
  useEffect(() => {
    listCourses()
      .then(cs => { setCourses(cs); setCode(prev => prev ?? cs[0]?.code ?? null) })
      .catch(e => setError(e.message))
  }, [])

  async function load() {
    if (!code) return
    try {
      const c = await getCourse(code)
      setCourse(c)
      const [ov, reg, qb] = await Promise.all([
        getAcademyOverview(c.id),
        getCredentialRegistry(),
        getCourseQuestionBank(c.id),
      ])
      setRows(ov)
      setRegistry(reg)
      setBank(qb)
    } catch (e) { setError(e.message) }
  }
  useEffect(() => { setCourse(null); setOpenModule(null); load() }, [code])

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

  if (error)                return <div style={st.error}>Academy error: {error}</div>
  if (courses && !courses.length)
    return <div style={st.loading}>No courses in the registry yet.</div>
  if (!courses || !course)  return <div style={st.loading}>Loading Academy…</div>

  const availableModules = course.modules.filter(m => m.status === 'available')
  // Everything on this page is scoped to the selected course, the registry
  // included — otherwise the issued count contradicts the course header.
  const courseRegistry = registry.filter(r => r.course_id === course.id)
  const credentialed = new Set(courseRegistry.filter(r => r.status === 'active').map(r => r.participant_id))
  const totalLessons = course.modules.reduce((n, m) => n + (m.edu_lessons?.length ?? 0), 0)
  const totalQuestions = bank.reduce((n, m) => n + m.questions.length, 0)

  return (
    <div>
      {/* Course selector — drafts included, so a course can be built before release */}
      {courses.length > 1 && (
        <Tabs
          label="Course"
          idPrefix="course"
          value={code}
          onChange={setCode}
          style={st.courseTabs}
          itemStyle={st.courseTab}
          activeItemStyle={st.courseTabActive}
          items={courses.map(c => ({
            value: c.code,
            label: (<>{c.code}{!c.is_published && <span style={st.draftPill}>draft</span>}</>),
          }))}
        />
      )}

      {/* Header stats */}
      <div style={st.statRow}>
        {[
          { label: 'Course', value: course.code, sub: course.credential_name },
          { label: 'Modules live', value: availableModules.length, sub: `${course.modules.length} total (rest post-pilot)` },
          { label: 'Learners active', value: rows.filter(r => r.lessonsDone > 0).length, sub: `${rows.length} enrolled in Morpheus` },
          { label: 'Credentials issued', value: courseRegistry.filter(r => r.status === 'active').length, sub: 'EDU.REGISTRY' },
        ].map((m, i) => (
          <div key={i} style={st.stat}>
            <div style={st.statLabel}>{m.label}</div>
            <div style={st.statVal}>{m.value}</div>
            <div style={st.statSub}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs
        label="Academy sections"
        idPrefix="academy"
        value={tab}
        onChange={setTab}
        style={st.tabs}
        itemStyle={st.tab}
        activeItemStyle={st.tabActive}
        items={[
          ['curriculum', `Curriculum (${course.modules.length} modules · ${totalLessons} lessons)`],
          ['questions',  `Question bank (${totalQuestions})`],
          ['matrix',     'Score matrix'],
          ['progress',   'Learner progress'],
          ['registry',   `Credential registry (${courseRegistry.length})`],
        ].map(([value, label]) => ({ value, label }))}
      />

      {/* ── Curriculum: modules and their lessons ─────────────── */}
      {tab === 'curriculum' && (
        <div>
          {course.modules.map(m => {
            const lessons = m.edu_lessons ?? []
            const open = openModule === m.id
            const qCount = bank.find(b => b.id === m.id)?.questions.length ?? 0
            return (
              <div key={m.id} style={st.moduleCard}>
                <button type="button"
                  style={{ ...BARE_BUTTON, ...st.moduleHead, width: '100%' }}
                  aria-expanded={open}
                  aria-controls={`module-panel-${m.id}`}
                  onClick={() => setOpenModule(open ? null : m.id)}>
                  <div style={st.moduleNum}>{String(m.sort_order).padStart(2, '0')}</div>
                  <div style={{ flex: 1 }}>
                    <div style={st.moduleTitle}>{m.title}</div>
                    {m.subtitle && <div style={st.moduleSub}>{m.subtitle}</div>}
                  </div>
                  <div style={st.moduleMeta}>
                    {lessons.length} lessons · {qCount} questions
                    {m.duration_minutes ? ` · ${m.duration_minutes} min` : ''}
                  </div>
                  <span style={{ ...st.statusPill, background: m.status === 'available' ? '#E1F5EE' : '#EEF2F7', color: m.status === 'available' ? '#0F6E56' : '#5B6B7F' }}>
                    {m.status}
                  </span>
                  <span aria-hidden="true" style={st.chevron}>{open ? '▾' : '▸'}</span>
                </button>
                {open && (
                  <div id={`module-panel-${m.id}`} style={st.lessonList}>
                    {lessons.length === 0 && <div style={st.emptyRow}>No lessons in this module.</div>}
                    {lessons.map(l => (
                      <div key={l.id} style={st.lessonRow}>
                        <span style={st.lessonNum}>{m.sort_order}.{l.sort_order}</span>
                        <span style={{ flex: 1 }}>{l.title}</span>
                        <span style={st.kindPill}>{l.kind ?? 'lesson'}</span>
                        <span style={st.lessonMeta}>{l.duration_minutes ? `${l.duration_minutes} min` : '—'}</span>
                        <span style={st.lessonMeta}>{l.content_md ? `${l.content_md.length.toLocaleString()} chars` : 'no content'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Question bank ─────────────────────────────────────── */}
      {tab === 'questions' && (
        <div>
          <div style={st.note}>
            Staff-only view. Correct answers and explanations are shown here and are never
            sent to the participant client.
          </div>
          {bank.length === 0 && <div style={st.tableCard}><div style={st.emptyRow}>No checkpoint questions found.</div></div>}
          {bank.map(m => (
            <div key={m.id} style={st.moduleCard}>
              <button type="button"
                style={{ ...BARE_BUTTON, ...st.moduleHead, width: '100%' }}
                aria-expanded={openModule === `q${m.id}`}
                aria-controls={`qbank-panel-${m.id}`}
                onClick={() => setOpenModule(openModule === `q${m.id}` ? null : `q${m.id}`)}>
                <div style={st.moduleNum}>{String(m.sortOrder).padStart(2, '0')}</div>
                <div style={{ flex: 1 }}><div style={st.moduleTitle}>{m.title}</div></div>
                <div style={st.moduleMeta}>{m.questions.length} questions</div>
                <span aria-hidden="true" style={st.chevron}>{openModule === `q${m.id}` ? '▾' : '▸'}</span>
              </button>
              {openModule === `q${m.id}` && (
                <div id={`qbank-panel-${m.id}`} style={st.lessonList}>
                  {m.questions.map((q, qi) => {
                    const opts = Array.isArray(q.options) ? q.options : []
                    return (
                      <div key={q.id} style={st.questionBlock}>
                        <div style={st.questionText}><b>Q{qi + 1}.</b> {q.question}</div>
                        <ol style={st.optionList}>
                          {opts.map((o, oi) => (
                            <li key={oi} style={{ ...st.option, ...(oi === q.correct_index ? st.optionCorrect : {}) }}>
                              {typeof o === 'string' ? o : (o?.text ?? JSON.stringify(o))}
                              {oi === q.correct_index && <span style={st.correctTag}>correct</span>}
                            </li>
                          ))}
                        </ol>
                        {q.explanation && <div style={st.explanation}>{q.explanation}</div>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Score matrix: learners × modules ──────────────────── */}
      {tab === 'matrix' && (
        <div style={st.tableCard}>
          <div style={{ overflowX: 'auto' }}>
            <table style={st.table}>
              <thead><tr style={{ background: '#F7F9FC' }}>
                <th style={st.th}>CTS ID</th>
                <th style={st.th}>Name</th>
                {availableModules.map(m => (
                  <th key={m.id} style={{ ...st.th, textAlign: 'center' }} title={m.title}>
                    M{m.sort_order}
                  </th>
                ))}
                <th style={{ ...st.th, textAlign: 'center' }}>Passed</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: i < rows.length - 1 ? '1px solid #F0F4F8' : 'none' }}>
                    <td style={st.tdMono}>{r.cts_id}</td>
                    <td style={{ ...st.td, fontWeight: 500, whiteSpace: 'nowrap' }}>{r.full_name}</td>
                    {availableModules.map(m => {
                      const s = r.bestByModule?.[m.id]
                      return (
                        <td key={m.id} style={{ ...st.tdScore, color: scoreColor(s) }}>
                          {s === undefined ? '·' : Math.round(s)}
                        </td>
                      )
                    })}
                    <td style={{ ...st.tdScore, fontWeight: 600 }}>
                      {r.checkpointsPassed}/{availableModules.length}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={availableModules.length + 3} style={st.emptyRow}>
                    No participants enrolled yet.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={st.matrixLegend}>
            Best checkpoint score per module. Pass mark {PASS_MARK}.
            <span style={{ color: '#0F6E56', marginLeft: '12px' }}>■ passed</span>
            <span style={{ color: '#854F0B', marginLeft: '10px' }}>■ 60–79</span>
            <span style={{ color: '#993C1D', marginLeft: '10px' }}>■ below 60</span>
            <span style={{ color: '#5D768A', marginLeft: '10px' }}>· not attempted</span>
          </div>
        </div>
      )}

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
              {courseRegistry.map((c, i) => (
                <tr key={c.id} style={{ borderBottom: i < courseRegistry.length - 1 ? '1px solid #F0F4F8' : 'none' }}>
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
              {courseRegistry.length === 0 && <tr><td colSpan={7} style={st.emptyRow}>No credentials issued for this course yet. Issue one from the Learner progress tab.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <div style={st.note}>
        Every credential is a permanent registry record, publicly verifiable at
        <b> {SITE_URL}/verify/&lt;code&gt;</b>.
        {' '}{course.disclaimer ?? `${course.code} is issued independently by ${course.issuer_org}.`}
      </div>
    </div>
  )
}

const st = {
  loading: { padding: '40px', color: '#5D768A', fontSize: '13px' },
  error:   { background: '#FAECE7', color: '#993C1D', borderRadius: '10px', padding: '14px 16px', fontSize: '13px' },
  statRow: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '16px' },
  stat:    { background: '#fff', border: '1px solid #CBD8E6', borderRadius: '12px', padding: '14px 16px' },
  statLabel:{ fontSize: '10px', color: '#5D768A', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '5px' },
  statVal: { fontSize: '24px', fontWeight: 300, color: '#0D1B2A', fontFamily: "'DM Mono',monospace", lineHeight: 1 },
  statSub: { fontSize: '10.5px', color: '#5D768A', marginTop: '5px' },
  tabs:    { display: 'flex', gap: '4px', marginBottom: '12px' },
  tab:     { padding: '7px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, color: '#4A6080', cursor: 'pointer', border: '1px solid transparent' },
  tabActive:{ background: '#fff', border: '1px solid #CBD8E6', color: '#0D1B2A' },
  courseTabs:{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' },
  courseTab:{ display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 14px', borderRadius: '10px', border: '1px solid #CBD8E6', background: '#fff', color: '#4A6080', fontSize: '12px', fontWeight: 600, letterSpacing: '0.03em', cursor: 'pointer' },
  courseTabActive:{ background: '#0D1B2A', borderColor: '#0D1B2A', color: '#fff' },
  draftPill:{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 6px', borderRadius: '8px', background: '#FAEEDA', color: '#854F0B' },
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
  emptyRow:{ padding: '24px', textAlign: 'center', color: '#5D768A', fontStyle: 'italic' },
  note:    { fontSize: '10.5px', color: '#5D768A', lineHeight: 1.6, padding: '14px 4px' },

  // curriculum / question bank
  moduleCard:{ background: '#fff', border: '1px solid #CBD8E6', borderRadius: '12px', marginBottom: '8px', overflow: 'hidden' },
  moduleHead:{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', cursor: 'pointer' },
  moduleNum: { fontFamily: "'DM Mono',monospace", fontSize: '12px', color: '#5D768A', minWidth: '22px' },
  moduleTitle:{ fontSize: '13.5px', fontWeight: 500, color: '#0D1B2A' },
  moduleSub: { fontSize: '11.5px', color: '#5B6B7F', marginTop: '2px' },
  moduleMeta:{ fontSize: '11px', color: '#5D768A', whiteSpace: 'nowrap' },
  chevron:   { fontSize: '11px', color: '#5D768A', width: '12px', textAlign: 'center' },
  lessonList:{ borderTop: '1px solid #F0F4F8', background: '#FBFCFE', padding: '4px 0' },
  lessonRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 16px 8px 50px', fontSize: '12.5px', color: '#0D1B2A', borderBottom: '1px solid #F4F7FA' },
  lessonNum: { fontFamily: "'DM Mono',monospace", fontSize: '10.5px', color: '#5D768A', minWidth: '28px' },
  lessonMeta:{ fontSize: '10.5px', color: '#5D768A', minWidth: '70px', textAlign: 'right' },
  kindPill:  { fontSize: '9.5px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px', background: '#EEF2F7', color: '#4A6080', textTransform: 'uppercase', letterSpacing: '0.04em' },

  questionBlock:{ padding: '12px 16px 14px 50px', borderBottom: '1px solid #F4F7FA' },
  questionText: { fontSize: '13px', color: '#0D1B2A', lineHeight: 1.5, marginBottom: '7px' },
  optionList:   { margin: 0, paddingLeft: '18px', listStyle: 'lower-alpha' },
  option:       { fontSize: '12.5px', color: '#4A6080', padding: '2px 0', lineHeight: 1.45 },
  optionCorrect:{ color: '#0F6E56', fontWeight: 500 },
  correctTag:   { fontSize: '9px', fontWeight: 600, marginLeft: '8px', padding: '1px 7px', borderRadius: '10px', background: '#E1F5EE', color: '#0F6E56', textTransform: 'uppercase', letterSpacing: '0.05em' },
  explanation:  { fontSize: '11.5px', color: '#5B6B7F', marginTop: '7px', paddingLeft: '18px', borderLeft: '2px solid #E6EDF5', lineHeight: 1.5 },

  tdScore:  { padding: '10px 14px', textAlign: 'center', fontFamily: "'DM Mono',monospace", fontSize: '12px' },
  matrixLegend:{ fontSize: '10.5px', color: '#5D768A', padding: '10px 16px', borderTop: '1px solid #F0F4F8' },
}
