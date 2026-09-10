// src/pages/Academy.jsx
// ── MORPHEUS.EDU — Academy (participant course player) ─────────
// Any course in the registry the participant may see: module list →
// lesson viewer → checkpoint quizzes, progress, and their credentials.
// Multi-course, so CAP-C and ClearCall CSR share one player.

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import Markdown from '../lib/markdown.jsx'
import { generateEduCertificatePDF } from '../lib/educert.js'
import { verifyUrlFor } from '../lib/site.js'
import { BARE_BUTTON, Tabs, RadioCard } from '../components/a11y.jsx'
import {
  listCourses, getCourse, getProgress, markLessonComplete,
  getCheckpointQuestions, getCheckpointAttempts, saveCheckpointAttempt,
  getMyCredentials,
} from '../lib/edu.js'

const KIND_LABEL = { lesson: 'Lesson', lab: 'Hands-on lab', checkpoint: 'Checkpoint' }
const KIND_COLOR = { lesson: '#2176AE', lab: '#0F6E56', checkpoint: '#854F0B' }

export default function Academy() {
  const { participantId } = useAuth()
  const [courses, setCourses]     = useState(null)   // catalogue: null = loading
  const [code, setCode]           = useState(null)   // selected course code
  const [course, setCourse]       = useState(null)   // full tree of the selected course
  const [doneIds, setDoneIds]     = useState(new Set())
  const [attempts, setAttempts]   = useState([])
  const [creds, setCreds]         = useState([])
  const [view, setView]           = useState({ page: 'overview' }) // overview | lesson {moduleIdx, lessonIdx}
  const [error, setError]         = useState(null)

  // Catalogue + the participant's own records. Loaded once; switching
  // course re-fetches only the tree, since progress and credentials are
  // per-participant and already cover every course.
  useEffect(() => {
    if (!participantId) return
    Promise.all([
      listCourses(),
      getProgress(participantId),
      getCheckpointAttempts(participantId),
      getMyCredentials(participantId),
    ]).then(([cs, g, a, cr]) => {
      setCourses(cs)
      // Prefer a course with content over an empty shell, so a learner
      // never lands on a blank page when a second course is mid-build.
      setCode(prev => prev ?? cs[0]?.code ?? null)
      setDoneIds(new Set(g.map(x => x.lesson_id)))
      setAttempts(a)
      setCreds(cr)
    }).catch(e => setError(e.message))
  }, [participantId])

  useEffect(() => {
    if (!code) return
    setCourse(null)
    setView({ page: 'overview' })
    getCourse(code).then(setCourse).catch(e => setError(e.message))
  }, [code])

  const bestByModule = useMemo(() => {
    const best = {}
    attempts.forEach(a => { best[a.module_id] = Math.max(best[a.module_id] ?? 0, Number(a.score)) })
    return best
  }, [attempts])

  if (error)               return <div style={st.error}>Could not load the Academy: {error}</div>
  if (courses && !courses.length)
    return <div style={st.empty}>No courses are open to you yet. Your trainer assigns coursework from the Academy.</div>
  if (!courses || !course) return <div style={st.loading}>Loading the Academy…</div>

  const available = course.modules.filter(m => m.status === 'available')
  const allLessons = available.flatMap(m => m.edu_lessons ?? [])
  const doneCount = allLessons.filter(l => doneIds.has(l.id)).length
  const pct = allLessons.length ? Math.round((doneCount / allLessons.length) * 100) : 0

  async function completeLesson(lessonId) {
    try {
      await markLessonComplete(participantId, lessonId)
      setDoneIds(prev => new Set([...prev, lessonId]))
    } catch (e) { setError(e.message) }
  }

  async function submitCheckpoint(moduleId, score, answers) {
    try {
      await saveCheckpointAttempt(participantId, moduleId, score, answers)
      setAttempts(prev => [{ module_id: moduleId, score, passed: score >= 80, attempted_at: new Date().toISOString() }, ...prev])
    } catch (e) { setError(e.message) }
  }

  if (view.page === 'lesson') {
    const module = course.modules[view.moduleIdx]
    const lesson = module.edu_lessons[view.lessonIdx]
    return (
      <LessonView
        course={course} module={module} lesson={lesson}
        isDone={doneIds.has(lesson.id)}
        bestScore={bestByModule[module.id]}
        onComplete={() => completeLesson(lesson.id)}
        onSubmitCheckpoint={(score, answers) => submitCheckpoint(module.id, score, answers)}
        onBack={() => setView({ page: 'overview' })}
        onNav={(dir) => {
          let li = view.lessonIdx + dir
          if (li >= 0 && li < module.edu_lessons.length) setView({ ...view, lessonIdx: li })
          else setView({ page: 'overview' })
        }}
      />
    )
  }

  return (
    <div>
      {/* Course picker — only when there is a choice to make */}
      {courses.length > 1 && (
        <Tabs
          label="Course"
          idPrefix="learner-course"
          value={code}
          onChange={setCode}
          style={st.courseTabs}
          itemStyle={st.courseTab}
          activeItemStyle={st.courseTabActive}
          items={courses.map(c => ({
            value: c.code,
            label: (<>{c.title}{!c.is_published && <span style={st.draftPill}>draft</span>}</>),
          }))}
        />
      )}

      {/* Course hero */}
      <div style={st.hero}>
        <div style={st.heroKicker}>MORPHEUS.EDU · {course.issuer_org}</div>
        <div style={st.heroTitle}>{course.title}</div>
        <div style={st.heroSub}>{course.subtitle} · {course.hours} hours · {course.modules.length} modules</div>
        <div style={st.progressWrap}>
          <div style={st.progressBar}><div style={{ ...st.progressFill, width: `${pct}%` }} /></div>
          <span style={st.progressLabel}>{doneCount} / {allLessons.length} lessons · {pct}%</span>
        </div>
      </div>

      {/* Credential card(s) */}
      {creds.map(c => (
        <div key={c.id} style={st.credCard}>
          <div style={{ fontSize: '18px' }}>🎓</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>{c.credential_name}</div>
            <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '2px', fontFamily: "'DM Mono',monospace" }}>
              {c.credential_code} · issued {new Date(c.issued_at).toLocaleDateString()}
            </div>
            <div style={{ fontSize: '11px', opacity: 0.75, marginTop: '4px' }}>
              Anyone can verify this credential at <b>{verifyUrlFor(c.credential_code)}</b>
            </div>
          </div>
          <span style={{ ...st.credStatus, background: c.status === 'active' ? 'rgba(255,255,255,0.18)' : '#993C1D' }}>
            {c.status}
          </span>
          {c.status === 'active' && (
            <button style={st.credBtn} onClick={() => generateEduCertificatePDF(c)}>
              Download certificate ↓
            </button>
          )}
        </div>
      ))}

      {/* Modules */}
      {course.modules.map((m, mi) => {
        const lessons = m.edu_lessons ?? []
        const done = lessons.filter(l => doneIds.has(l.id)).length
        const isOutline = m.status !== 'available'
        const best = bestByModule[m.id]
        return (
          <div key={m.id} style={{ ...st.moduleCard, ...(isOutline ? { opacity: 0.62 } : {}) }}>
            <div style={st.moduleHead}>
              <div style={st.moduleNum}>{String(m.sort_order).padStart(2, '0')}</div>
              <div style={{ flex: 1 }}>
                <div style={st.moduleTitle}>{m.title}</div>
                <div style={st.moduleSub}>{m.subtitle}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {isOutline
                  ? <span style={st.outlinePill}>Coming after pilot</span>
                  : <span style={st.donePill}>{done}/{lessons.length} done{best != null ? ` · best ${Math.round(best)}` : ''}</span>}
                <div style={st.moduleMins}>{Math.round((m.duration_minutes ?? 0) / 60 * 10) / 10} hrs</div>
              </div>
            </div>
            <div style={st.moduleSummary}>{m.summary}</div>
            {!isOutline && lessons.map((l, li) => (
              <button key={l.id} type="button"
                style={{ ...BARE_BUTTON, ...st.lessonRow, width: '100%' }}
                onClick={() => setView({ page: 'lesson', moduleIdx: mi, lessonIdx: li })}>
                <span aria-hidden="true" style={{ ...st.lessonCheck, ...(doneIds.has(l.id) ? st.lessonCheckDone : {}) }}>
                  {doneIds.has(l.id) ? '✓' : ''}
                </span>
                <span className="sr-only">{doneIds.has(l.id) ? 'Completed. ' : 'Not started. '}</span>
                <span style={{ ...st.kindPill, color: KIND_COLOR[l.kind], borderColor: KIND_COLOR[l.kind] }}>
                  {KIND_LABEL[l.kind]}
                </span>
                <span style={st.lessonTitle}>{l.title}</span>
                <span style={st.lessonMins}>{l.duration_minutes} min</span>
              </button>
            ))}
          </div>
        )
      })}

      <div style={st.disclaimer}>
        {/* Comes from the course record: an Anthropic disclaimer belongs on
            CAP-C and would be a non-sequitur on a call centre credential. */}
        {course.disclaimer
          ?? `${course.code} is developed and issued independently by ${course.issuer_org}.`}
      </div>
    </div>
  )
}

// ── Lesson / checkpoint view ──────────────────────────────────
function LessonView({ course, module, lesson, isDone, bestScore, onComplete, onSubmitCheckpoint, onBack, onNav }) {
  const isCheckpoint = lesson.kind === 'checkpoint'
  return (
    <div style={{ maxWidth: '760px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <button style={st.btn} onClick={onBack}>← Course</button>
        <span style={{ fontSize: '12px', color: '#5D768A' }}>
          Module {module.sort_order} · {module.title}
        </span>
      </div>

      <div style={st.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <span style={{ ...st.kindPill, color: KIND_COLOR[lesson.kind], borderColor: KIND_COLOR[lesson.kind] }}>
            {KIND_LABEL[lesson.kind]}
          </span>
          <span style={{ fontSize: '11px', color: '#5D768A' }}>{lesson.duration_minutes} min</span>
          {isDone && <span style={st.donePillSm}>✓ completed</span>}
        </div>
        <h1 style={st.lessonH1}>{lesson.title}</h1>
        <Markdown text={lesson.content_md} />

        {isCheckpoint
          ? <CheckpointQuiz moduleId={module.id} bestScore={bestScore} onSubmit={onSubmitCheckpoint} onDone={onComplete} />
          : (
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #F0F4F8' }}>
              {!isDone && <button style={st.btnTeal} onClick={onComplete}>Mark lesson complete ✓</button>}
              <button style={st.btn} onClick={() => onNav(-1)}>← Previous</button>
              <button style={st.btnPrimary} onClick={() => { if (!isDone) onComplete(); onNav(1) }}>
                {isDone ? 'Next →' : 'Complete & next →'}
              </button>
            </div>
          )}
      </div>
    </div>
  )
}

// ── Checkpoint quiz ───────────────────────────────────────────
function CheckpointQuiz({ moduleId, bestScore, onSubmit, onDone }) {
  const [questions, setQuestions] = useState(null)
  const [answers, setAnswers]     = useState({})
  const [result, setResult]       = useState(null)

  useEffect(() => {
    getCheckpointQuestions(moduleId).then(setQuestions).catch(() => setQuestions([]))
  }, [moduleId])

  if (!questions) return <div style={st.loading}>Loading checkpoint…</div>
  if (!questions.length) return <div style={st.empty}>Checkpoint questions coming soon.</div>

  function grade() {
    const correct = questions.filter(q => answers[q.id] === q.correct_index).length
    const score = Math.round((correct / questions.length) * 100)
    setResult({ score, correct })
    onSubmit(score, answers)
    if (score >= 80) onDone()
  }

  const answered = Object.keys(answers).length

  return (
    <div style={{ marginTop: '10px' }}>
      {bestScore != null && (
        <div style={{ ...st.banner, background: bestScore >= 80 ? '#E1F5EE' : '#FAEEDA', color: bestScore >= 80 ? '#0F6E56' : '#854F0B' }}>
          Best score so far: <b>{Math.round(bestScore)}</b>{bestScore >= 80 ? ' — passed ✓' : ' — 80 needed to pass'}
        </div>
      )}

      {questions.map((q, qi) => {
        const chosen = answers[q.id]
        const showFeedback = result != null
        return (
          <div key={q.id} style={st.qCard}>
            <div style={st.qText}><b>{qi + 1}.</b> {q.question}</div>
            {q.options.map((opt, oi) => {
              const isChosen = chosen === oi
              const isCorrect = q.correct_index === oi
              let bg = '#fff', border = '#CBD8E6', color = '#33475E'
              if (showFeedback && isCorrect)              { bg = '#E1F5EE'; border = '#0F6E56'; color = '#0F6E56' }
              else if (showFeedback && isChosen)          { bg = '#FAECE7'; border = '#993C1D'; color = '#993C1D' }
              else if (isChosen)                          { bg = '#E6F1FB'; border = '#2176AE'; color = '#0C447C' }
              return (
                <RadioCard key={oi}
                  name={`checkpoint-${q.id}`}
                  value={oi}
                  checked={isChosen}
                  disabled={showFeedback}
                  onChange={v => !showFeedback && setAnswers(a => ({ ...a, [q.id]: v }))}
                  style={{ ...st.opt, background: bg, borderColor: border, color }}>
                  {opt}
                  {showFeedback && isCorrect && <span className="sr-only"> — correct answer</span>}
                  {showFeedback && isChosen && !isCorrect && <span className="sr-only"> — your answer, incorrect</span>}
                </RadioCard>
              )
            })}
            {showFeedback && q.explanation && (
              <div style={st.explain}>{q.explanation}</div>
            )}
          </div>
        )
      })}

      {!result ? (
        <button style={{ ...st.btnPrimary, opacity: answered === questions.length ? 1 : 0.5 }}
          disabled={answered !== questions.length} onClick={grade}>
          Submit checkpoint ({answered}/{questions.length} answered)
        </button>
      ) : (
        <div style={{ ...st.banner, background: result.score >= 80 ? '#0F6E56' : '#854F0B', color: '#fff' }}>
          {result.score >= 80
            ? <>Passed — <b>{result.score}</b> ({result.correct}/{questions.length} correct). Checkpoint recorded. 🎉</>
            : <>Score <b>{result.score}</b> ({result.correct}/{questions.length}). 80 needed — review the module and retake. Your best score counts.</>}
          <button style={{ ...st.btn, marginLeft: 'auto' }} onClick={() => { setResult(null); setAnswers({}) }}>Retake</button>
        </div>
      )}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────
const st = {
  loading:  { padding: '40px', color: '#5D768A', fontSize: '13px' },
  error:    { background: '#FAECE7', color: '#993C1D', borderRadius: '10px', padding: '14px 16px', fontSize: '13px' },
  empty:    { color: '#5D768A', fontSize: '13px', fontStyle: 'italic' },
  courseTabs:{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' },
  courseTab:{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 14px', borderRadius: '10px', border: '1px solid #CBD8E6', background: '#fff', color: '#4A6080', fontSize: '12.5px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.12s' },
  courseTabActive:{ background: '#0D1B2A', borderColor: '#0D1B2A', color: '#fff' },
  draftPill:{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 6px', borderRadius: '8px', background: '#FAEEDA', color: '#854F0B' },
  hero:     { background: '#0D1B2A', borderRadius: '16px', padding: '24px', marginBottom: '14px', color: '#fff' },
  heroKicker:{ fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#5DCAA5', fontFamily: "'DM Mono',monospace", marginBottom: '6px' },
  heroTitle:{ fontSize: '22px', fontWeight: 300 },
  heroSub:  { fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '4px', marginBottom: '16px' },
  progressWrap:{ display: 'flex', alignItems: 'center', gap: '12px' },
  progressBar:{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.12)', borderRadius: '4px', overflow: 'hidden' },
  progressFill:{ height: '100%', background: '#5DCAA5', borderRadius: '4px', transition: 'width 0.6s ease' },
  progressLabel:{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', fontFamily: "'DM Mono',monospace", flexShrink: 0 },
  credCard: { display: 'flex', alignItems: 'center', gap: '14px', background: '#0F6E56', color: '#fff', borderRadius: '12px', padding: '14px 18px', marginBottom: '14px' },
  credStatus:{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '3px 10px', borderRadius: '12px' },
  credBtn:  { padding: '7px 12px', border: '1px solid rgba(255,255,255,0.35)', borderRadius: '8px', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: '11px', fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", flexShrink: 0 },
  moduleCard:{ background: '#fff', border: '1px solid #CBD8E6', borderRadius: '16px', padding: '18px', marginBottom: '12px' },
  moduleHead:{ display: 'flex', alignItems: 'flex-start', gap: '14px' },
  moduleNum:{ fontFamily: "'DM Mono',monospace", fontSize: '20px', fontWeight: 500, color: '#5DCAA5', flexShrink: 0, paddingTop: '2px' },
  moduleTitle:{ fontSize: '15px', fontWeight: 600, color: '#0D1B2A' },
  moduleSub:{ fontSize: '12px', color: '#5D768A', marginTop: '2px' },
  moduleMins:{ fontSize: '10px', color: '#5D768A', marginTop: '4px' },
  moduleSummary:{ fontSize: '12.5px', color: '#4A6080', lineHeight: 1.65, margin: '10px 0 12px', paddingLeft: '38px' },
  outlinePill:{ fontSize: '10px', fontWeight: 600, padding: '3px 10px', borderRadius: '12px', background: '#F0F4F8', color: '#4A5D73' },
  donePill: { fontSize: '10px', fontWeight: 600, padding: '3px 10px', borderRadius: '12px', background: '#E1F5EE', color: '#0F6E56' },
  donePillSm:{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px', background: '#E1F5EE', color: '#0F6E56' },
  lessonRow:{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 0 9px 38px', borderTop: '1px solid #F0F4F8', cursor: 'pointer' },
  lessonCheck:{ width: '18px', height: '18px', borderRadius: '50%', border: '1.5px solid #CBD8E6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#fff', flexShrink: 0 },
  lessonCheckDone:{ background: '#0F6E56', borderColor: '#0F6E56' },
  kindPill: { fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', padding: '2px 8px', borderRadius: '10px', border: '1px solid', flexShrink: 0 },
  lessonTitle:{ flex: 1, fontSize: '13px', color: '#0D1B2A' },
  lessonMins:{ fontSize: '11px', color: '#5D768A', fontFamily: "'DM Mono',monospace" },
  card:     { background: '#fff', border: '1px solid #CBD8E6', borderRadius: '16px', padding: '24px' },
  lessonH1: { fontSize: '20px', fontWeight: 600, color: '#0D1B2A', margin: '8px 0 14px' },
  btn:      { padding: '8px 14px', border: '1px solid #CBD8E6', borderRadius: '8px', background: '#fff', color: '#0D1B2A', fontSize: '12px', fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" },
  btnPrimary:{ padding: '8px 16px', border: 'none', borderRadius: '8px', background: '#0D1B2A', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" },
  btnTeal:  { padding: '8px 14px', border: 'none', borderRadius: '8px', background: '#0F6E56', color: '#fff', fontSize: '12px', fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" },
  banner:   { display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '10px', padding: '12px 16px', fontSize: '13px', marginBottom: '14px' },
  qCard:    { background: '#F7F9FC', border: '1px solid #E8EFF6', borderRadius: '12px', padding: '14px 16px', marginBottom: '12px' },
  qText:    { fontSize: '13.5px', color: '#0D1B2A', lineHeight: 1.6, marginBottom: '10px' },
  opt:      { border: '1.5px solid', borderRadius: '8px', padding: '8px 12px', fontSize: '12.5px', lineHeight: 1.5, marginBottom: '6px', transition: 'all 0.12s' },
  explain:  { fontSize: '12px', color: '#4A6080', lineHeight: 1.6, background: '#fff', borderRadius: '8px', padding: '10px 12px', marginTop: '6px', borderLeft: '3px solid #5DCAA5' },
  disclaimer:{ fontSize: '10.5px', color: '#5D768A', lineHeight: 1.6, padding: '14px 4px', textAlign: 'center' },
}
