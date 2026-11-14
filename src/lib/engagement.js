// src/lib/engagement.js
// ── Nguzo OS — engagement telemetry ────────────────────────────
//
// WHAT THIS IS NOT
//
// This is NOT attendance and it is NOT contact hours. It is wall-clock time a
// browser tab spent on a module, and sign-in/sign-out stamps. Nobody attested
// to any of it; a tab left open on a train counts the same as a person
// reading. The staff-attested record is empowercare.attendance, and
// `contact_hours` lives there and only there.
//
// So: never label anything produced by this file "attendance", "contact
// hours", "hours completed" or anything a caseworker could hand to a funder.
// The word in the UI is "engagement", and the screen says what it is.
//
// HOW IT BEHAVES
//
// Telemetry must never delay or break a page. Every call here:
//   * swallows its own errors (a failed insert is logged at debug level and
//     forgotten — there is nothing a participant could do about it);
//   * is fire-and-forget, with one bounded exception noted on recordSignOut;
//   * does nothing at all when it has no participant id or no session, rather
//     than throwing or queueing.
//
// RLS does the authorisation: engagement_login_event accepts an insert only
// where user_id = auth.uid(), and engagement_module_time only where
// participant_id = current_participant_id(). Passing someone else's id here
// fails at the database, which is the point.

import { supabase } from './supabase.js'

const MAX_SECONDS = 43200   // engagement_module_time_seconds_sane
const MIN_SECONDS = 5       // below this it is navigation noise, not engagement

function quiet(label, promise) {
  // Returns the promise so callers CAN bound it, but never rejects.
  return Promise.resolve(promise).catch(err => {
    if (typeof console !== 'undefined') {
      console.debug(`[engagement] ${label} not recorded:`, err?.message ?? err)
    }
    return null
  })
}

function userAgent() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : null
  // The column is text with no length cap, but there is no reason to store a
  // kilobyte of it.
  return ua ? ua.slice(0, 400) : null
}

async function insertLoginEvent(event, userId, participantId) {
  if (!userId) return null
  const { error } = await supabase.from('engagement_login_event').insert({
    user_id:        userId,
    participant_id: participantId || null,
    event,
    user_agent:     userAgent(),
    source:         'web',
  })
  if (error) throw error
  return true
}

// ── Sign in / sign out ─────────────────────────────────────────

// One SIGN_IN per browser session per account. supabase-js fires SIGNED_IN on
// the initial session too in some versions, and a tab reload must not look
// like a new sign-in.
const SIGNED_IN_KEY = 'nguzo.engagement.signedIn'
const signedInThisLoad = new Set()

function alreadyRecorded(userId) {
  if (signedInThisLoad.has(userId)) return true
  try {
    return sessionStorage.getItem(`${SIGNED_IN_KEY}.${userId}`) === '1'
  } catch {
    // Private mode, blocked storage: fall back to the in-memory set only.
    return false
  }
}

function markRecorded(userId) {
  signedInThisLoad.add(userId)
  try { sessionStorage.setItem(`${SIGNED_IN_KEY}.${userId}`, '1') } catch { /* ignore */ }
}

/** Record a SIGN_IN once per browser session. Fire and forget. */
export function recordSignIn(userId, participantId = null) {
  if (!userId || alreadyRecorded(userId)) return
  markRecorded(userId)
  quiet('SIGN_IN', insertLoginEvent('SIGN_IN', userId, participantId))
}

/**
 * Record a SIGN_OUT. Returns a promise the caller may await.
 *
 * This is the one bounded wait in the file: the insert needs the session that
 * is about to be destroyed, so it has to be issued before supabase.auth
 * .signOut(). Callers bound it (see signOut() in lib/supabase.js) so a slow
 * or dead network delays the click by a fraction of a second at most and then
 * signs out regardless.
 */
export function recordSignOut(userId, participantId = null) {
  if (!userId) return Promise.resolve(null)
  try { sessionStorage.removeItem(`${SIGNED_IN_KEY}.${userId}`) } catch { /* ignore */ }
  signedInThisLoad.delete(userId)
  return quiet('SIGN_OUT', insertLoginEvent('SIGN_OUT', userId, participantId))
}

/** Occasional liveness stamp. Nothing calls this on a timer today. */
export function recordSessionPing(userId, participantId = null) {
  if (!userId) return
  quiet('SESSION_PING', insertLoginEvent('SESSION_PING', userId, participantId))
}

// ── Time in module ─────────────────────────────────────────────

/**
 * Record one engagement segment.
 *
 * `moduleKey` must be a core.module key (the column is a foreign key to it) —
 * 'workforce.cer', 'workforce.academy', 'workforce.empowercare'. A key that
 * does not exist is rejected by the database, not silently stored.
 */
export function recordModuleTime({ participantId, moduleKey, lessonId = null, startedAt, endedAt = new Date() }) {
  if (!participantId || !moduleKey || !startedAt) return

  const start = startedAt instanceof Date ? startedAt : new Date(startedAt)
  const end   = endedAt   instanceof Date ? endedAt   : new Date(endedAt)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return

  const raw = Math.floor((end.getTime() - start.getTime()) / 1000)
  if (raw < MIN_SECONDS) return

  // A tab left open overnight, or a clock that moved, must not produce a
  // 400 from the seconds CHECK — clamp and record the real window end.
  const seconds = Math.min(raw, MAX_SECONDS)
  const boundedEnd = seconds === raw ? end : new Date(start.getTime() + seconds * 1000)

  quiet('module time', (async () => {
    const { error } = await supabase.from('engagement_module_time').insert({
      participant_id: participantId,
      module_key:     moduleKey,
      lesson_id:      lessonId || null,
      started_at:     start.toISOString(),
      ended_at:       boundedEnd.toISOString(),
      seconds,
      source:         'web',
    })
    if (error) throw error
  })())
}

/**
 * The participant's own engagement rollup, for showing them their own time.
 *
 * v_engagement_hours is a plain rollup over engagement_module_time, so the
 * base table's RLS decides the rows: a participant sees only their own.
 * Returns [] rather than throwing — a dashboard tile is not worth a crash.
 */
export async function getEngagementHours(participantId) {
  if (!participantId) return []
  try {
    const { data, error } = await supabase
      .from('v_engagement_hours')
      .select('participant_id, module_key, segments, engagement_seconds, engagement_hours, first_seen, last_seen')
      .eq('participant_id', participantId)
    if (error) throw error
    return data ?? []
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.debug('[engagement] rollup unavailable:', err?.message ?? err)
    }
    return []
  }
}
