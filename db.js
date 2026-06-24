// src/lib/db.js
// ── Morpheus CRM — Database operations ─────────────────────────
// All reads and writes to Supabase go through this file.
// RLS on Supabase enforces access — these functions trust that.

import { supabase } from './supabase.js'

// ── SESSIONS ───────────────────────────────────────────────────

/**
 * Create a new call session record when a call starts.
 * Returns the session ID to track through the call lifecycle.
 */
export async function createCallSession({
  participantId,
  cohortId = null,
  scoredBy = null,       // staff_profile id if trainer-initiated; null = self-serve
  scenarioType,
  difficulty,
  scenarioBrief,
}) {
  const { data, error } = await supabase
    .from('call_sessions')
    .insert({
      participant_id:  participantId,
      cohort_id:       cohortId,
      scored_by:       scoredBy,
      scenario_type:   scenarioType,
      difficulty,
      scenario_brief:  scenarioBrief,
      status:          'In Progress',
      started_at:      new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

/**
 * Save the completed session: full transcript + status.
 * Called when the user clicks "End call" — before scoring.
 */
export async function completeCallSession(sessionId, transcriptArray) {
  const { error } = await supabase
    .from('call_sessions')
    .update({
      transcript: transcriptArray,   // [{role, content, ts}]
      status:     'Completed',
      ended_at:   new Date().toISOString(),
    })
    .eq('id', sessionId)

  if (error) throw error
}

/**
 * Save AI scores for a completed session.
 * Returns the inserted score record.
 */
export async function saveCallScores(sessionId, scores, aiFeedback, trainerNotes = null) {
  const { data, error } = await supabase
    .from('call_scores')
    .insert({
      session_id:       sessionId,
      score_opening:    scores.opening,
      score_listening:  scores.listening,
      score_empathy:    scores.empathy,
      score_resolution: scores.resolution,
      score_policy:     scores.policy,
      score_closing:    scores.closing,
      total_score:      scores.total,
      ai_feedback:      aiFeedback,
      trainer_notes:    trainerNotes,
      scored_at:        new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Full call save pipeline — call this after scoring is complete.
 * 1. Marks session as Completed with transcript
 * 2. Saves scores
 * 3. Checks certification eligibility
 * 4. Issues cert if eligible
 * Returns { sessionId, scores, certified }
 */
export async function saveCompletedCall({
  sessionId,
  participantId,
  transcriptArray,
  scores,
  issuedBy = null,   // staff_profile id; null if self-scored
}) {
  await completeCallSession(sessionId, transcriptArray)
  const scoreRecord = await saveCallScores(
    sessionId, scores, scores.feedback, null
  )

  // Check eligibility via the view
  const eligible = await checkCertEligibility(participantId)
  let certified = false

  if (eligible && !eligible.already_certified) {
    await issueCertification(participantId, eligible.avg_score, eligible.completed_calls, issuedBy)
    certified = true
  }

  return { sessionId, scoreRecord, certified }
}

// ── CERTIFICATION ──────────────────────────────────────────────

export async function checkCertEligibility(participantId) {
  const { data, error } = await supabase
    .from('v_certification_eligibility')
    .select('*')
    .eq('participant_id', participantId)
    .single()

  if (error) return null
  return data
}

export async function issueCertification(participantId, qualifyingAvg, qualifyingCalls, issuedBy) {
  const { data, error } = await supabase
    .from('certifications')
    .insert({
      participant_id:   participantId,
      qualifying_avg:   Math.round(qualifyingAvg),
      qualifying_calls: qualifyingCalls,
      issued_by:        issuedBy,
      issued_date:      new Date().toISOString().split('T')[0],
      status:           'Issued',
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// ── PARTICIPANTS ───────────────────────────────────────────────

export async function getParticipantPerformance(participantId = null) {
  let query = supabase.from('v_participant_performance').select('*')
  if (participantId) query = query.eq('participant_id', participantId)
  const { data, error } = await query.order('full_name')
  if (error) throw error
  return data
}

export async function getParticipantProfile(participantId) {
  const { data, error } = await supabase
    .from('participants')
    .select(`
      *,
      staff_profiles!assigned_trainer ( full_name, title )
    `)
    .eq('id', participantId)
    .single()
  if (error) throw error
  return data
}

export async function getParticipantByUserId(userId) {
  const { data, error } = await supabase
    .from('participants')
    .select('*')
    .eq('user_id', userId)
    .single()
  if (error) throw error
  return data
}

export async function createParticipant(fields) {
  const { data, error } = await supabase
    .from('participants')
    .insert(fields)
    .select()
    .single()
  if (error) throw error
  return data
}

// ── CALL HISTORY ───────────────────────────────────────────────

export async function getCallHistory(participantId, limit = 20) {
  const { data, error } = await supabase
    .from('call_sessions')
    .select(`
      id, scenario_type, difficulty, scenario_brief,
      started_at, ended_at, status,
      call_scores ( total_score, ai_feedback, score_opening,
                    score_listening, score_empathy, score_resolution,
                    score_policy, score_closing )
    `)
    .eq('participant_id', participantId)
    .eq('status', 'Completed')
    .order('started_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data
}

// ── COHORTS ────────────────────────────────────────────────────

export async function getCohortOverview() {
  const { data, error } = await supabase
    .from('v_cohort_overview')
    .select('*')
    .order('start_date', { ascending: false })
  if (error) throw error
  return data
}

export async function getCohortById(cohortId) {
  const { data, error } = await supabase
    .from('cohorts')
    .select('*')
    .eq('id', cohortId)
    .single()
  if (error) throw error
  return data
}

export async function createCohort(fields) {
  const { data, error } = await supabase
    .from('cohorts')
    .insert(fields)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function enrollParticipant(cohortId, participantId) {
  const { data, error } = await supabase
    .from('cohort_enrollments')
    .upsert({ cohort_id: cohortId, participant_id: participantId, enrollment_status: 'Enrolled' })
    .select()
    .single()
  if (error) throw error
  return data
}

// ── SCORE MATRIX WEIGHTS ───────────────────────────────────────

export async function getScoreWeights(cohortId = null) {
  let query = supabase.from('score_matrix_weights').select('*')
  query = cohortId
    ? query.eq('cohort_id', cohortId)
    : query.is('cohort_id', null)
  const { data, error } = await query.single()
  if (error) {
    // Fall back to global default if cohort-specific not found
    const { data: def, error: defErr } = await supabase
      .from('score_matrix_weights')
      .select('*')
      .is('cohort_id', null)
      .single()
    if (defErr) throw defErr
    return def
  }
  return data
}

export async function updateScoreWeights(weights, cohortId = null, updatedBy = null) {
  const upsertData = {
    cohort_id:         cohortId,
    weight_opening:    weights.opening,
    weight_listening:  weights.listening,
    weight_empathy:    weights.empathy,
    weight_resolution: weights.resolution,
    weight_policy:     weights.policy,
    weight_closing:    weights.closing,
    updated_by:        updatedBy,
    updated_at:        new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('score_matrix_weights')
    .upsert(upsertData, { onConflict: 'cohort_id' })
    .select()
    .single()
  if (error) throw error
  return data
}

// ── DASHBOARD STATS ────────────────────────────────────────────

export async function getDashboardStats() {
  const [cohorts, parts, certs] = await Promise.all([
    supabase.from('v_cohort_overview').select('participant_count, total_calls, cohort_avg_score, status'),
    supabase.from('v_participant_performance').select('avg_score, is_certified'),
    supabase.from('certifications').select('id').eq('status', 'Issued'),
  ])

  const activeParts = parts.data?.length ?? 0
  const totalCalls  = cohorts.data?.reduce((s, c) => s + (c.total_calls ?? 0), 0) ?? 0
  const avgScore    = parts.data?.length
    ? Math.round(parts.data.reduce((s, p) => s + (p.avg_score ?? 0), 0) / parts.data.length)
    : 0
  const certsIssued = certs.data?.length ?? 0

  return { activeParts, totalCalls, avgScore, certsIssued }
}
