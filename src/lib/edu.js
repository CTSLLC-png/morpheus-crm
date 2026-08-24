// src/lib/edu.js
// ── MORPHEUS.EDU — data operations for the Claude Academy module ──
// Courses, lessons, progress, checkpoints, and the credential registry.

import { supabase } from './supabase.js'

// ── COURSE CONTENT ─────────────────────────────────────────────

/** Full course tree: course → modules → lessons (content included). */
export async function getCourse(code = 'CAP-C') {
  const { data: course, error } = await supabase
    .from('edu_courses')
    .select('*')
    .eq('code', code)
    .single()
  if (error) throw error

  const { data: modules, error: mErr } = await supabase
    .from('edu_modules')
    .select('*, edu_lessons(*)')
    .eq('course_id', course.id)
    .order('sort_order')
  if (mErr) throw mErr

  modules.forEach(m => m.edu_lessons?.sort((a, b) => a.sort_order - b.sort_order))
  return { ...course, modules }
}

/** Checkpoint questions for a module. */
export async function getCheckpointQuestions(moduleId) {
  const { data, error } = await supabase
    .from('edu_checkpoint_questions')
    .select('*')
    .eq('module_id', moduleId)
    .order('sort_order')
  if (error) throw error
  return data
}

// ── PROGRESS ───────────────────────────────────────────────────

/** All completed lesson ids for a participant. */
export async function getProgress(participantId) {
  const { data, error } = await supabase
    .from('edu_progress')
    .select('lesson_id, completed_at')
    .eq('participant_id', participantId)
  if (error) throw error
  return data
}

/** Mark one lesson complete (idempotent). */
export async function markLessonComplete(participantId, lessonId) {
  const { error } = await supabase
    .from('edu_progress')
    .upsert(
      { participant_id: participantId, lesson_id: lessonId },
      { onConflict: 'participant_id,lesson_id', ignoreDuplicates: true },
    )
  if (error) throw error
}

/** Checkpoint attempts for a participant (all modules). */
export async function getCheckpointAttempts(participantId) {
  const { data, error } = await supabase
    .from('edu_checkpoint_attempts')
    .select('module_id, score, passed, attempted_at')
    .eq('participant_id', participantId)
    .order('attempted_at', { ascending: false })
  if (error) throw error
  return data
}

/** Save a checkpoint attempt. passed = score >= 80. */
export async function saveCheckpointAttempt(participantId, moduleId, score, answers) {
  const { error } = await supabase
    .from('edu_checkpoint_attempts')
    .insert({
      participant_id: participantId,
      module_id: moduleId,
      score,
      passed: score >= 80,
      answers,
    })
  if (error) throw error
}

// ── CREDENTIALS (EDU.REGISTRY) ─────────────────────────────────

/** Credentials held by a participant. */
export async function getMyCredentials(participantId) {
  const { data, error } = await supabase
    .from('edu_credentials')
    .select('*')
    .eq('participant_id', participantId)
    .order('issued_at', { ascending: false })
  if (error) throw error
  return data
}

/** Staff: full registry. */
export async function getCredentialRegistry() {
  const { data, error } = await supabase
    .from('edu_credentials')
    .select('*')
    .order('issued_at', { ascending: false })
  if (error) throw error
  return data
}

/** Staff: issue a credential. Generates the registry code server-side. */
export async function issueCredential({ course, participantId, holderName, issuedBy = null, expiresMonths = null }) {
  const { data: codeData, error: codeErr } = await supabase
    .rpc('edu_next_credential_code', { p_prefix: course.credential_prefix, p_course_code: course.code })
  if (codeErr) throw codeErr

  const expires_at = expiresMonths
    ? new Date(Date.now() + expiresMonths * 30.44 * 24 * 3600 * 1000).toISOString()
    : null

  const { data, error } = await supabase
    .from('edu_credentials')
    .insert({
      credential_code: codeData,
      course_id: course.id,
      participant_id: participantId,
      holder_name: holderName,
      credential_name: course.credential_name,
      issuer_org: course.issuer_org,
      issued_by: issuedBy,
      expires_at,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

/** Staff: revoke a credential. */
export async function revokeCredential(credentialId) {
  const { error } = await supabase
    .from('edu_credentials')
    .update({ status: 'revoked' })
    .eq('id', credentialId)
  if (error) throw error
}

/** PUBLIC (EDU.VERIFY): look up a credential by code. Works logged out. */
export async function verifyCredential(code) {
  const { data, error } = await supabase.rpc('edu_verify_credential', { p_code: code })
  if (error) throw error
  return data?.[0] ?? null
}

// ── STAFF DASHBOARD ────────────────────────────────────────────

/** Staff: per-participant academy progress rollup. */
export async function getAcademyOverview(courseId) {
  const [{ data: participants, error: pErr }, { data: progress, error: gErr },
         { data: attempts, error: aErr }, { data: lessons, error: lErr }] = await Promise.all([
    supabase.from('participants').select('id, full_name, cts_id, program_source'),
    supabase.from('edu_progress').select('participant_id, lesson_id'),
    supabase.from('edu_checkpoint_attempts').select('participant_id, module_id, score, passed'),
    supabase.from('edu_lessons').select('id, module_id, edu_modules!inner(course_id, status)')
      .eq('edu_modules.course_id', courseId).eq('edu_modules.status', 'available'),
  ])
  if (pErr) throw pErr
  if (gErr) throw gErr
  if (aErr) throw aErr
  if (lErr) throw lErr

  const lessonIds = new Set(lessons.map(l => l.id))
  const total = lessonIds.size

  return (participants ?? []).map(p => {
    const done = (progress ?? []).filter(g => g.participant_id === p.id && lessonIds.has(g.lesson_id)).length
    const myAttempts = (attempts ?? []).filter(a => a.participant_id === p.id)
    const bestByModule = {}
    myAttempts.forEach(a => {
      bestByModule[a.module_id] = Math.max(bestByModule[a.module_id] ?? 0, Number(a.score))
    })
    const passedModules = Object.values(bestByModule).filter(s => s >= 80).length
    return {
      ...p,
      lessonsDone: done,
      lessonsTotal: total,
      pct: total ? Math.round((done / total) * 100) : 0,
      checkpointsPassed: passedModules,
      bestByModule,
    }
  })
}
