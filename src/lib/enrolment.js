// src/lib/enrolment.js
// ── Nguzo OS — enrolment codes: redemption + staff administration ──
//
// An enrolment code is a BEARER SECRET. Anybody holding it can join the
// cohort it points at. That is why public.cohort_invite_code has no
// participant, vendor or anon SELECT policy, and why the only thing a
// non-staff session can do with a code is hand it to the redeem RPC.
//
// THE ONE RULE THAT MATTERS HERE
//
// public.redeem_cohort_invite() raises the SAME sentence — "That enrolment
// code is not valid." — for a code that is wrong, expired, revoked or used
// up. That is deliberate. Any client code that told those apart would turn
// the registration form into an oracle: a guesser could walk the keyspace
// and learn which guesses name a real cohort. So:
//
//   * surface the RPC's message verbatim;
//   * never branch on it, never pattern-match it, never add a pre-flight
//     "does this code exist" lookup;
//   * the one client-side check we do make (shape) answers with the exact
//     same sentence, so a well-formed guess and a malformed one are
//     indistinguishable from the outside.
//
// The staff helpers below are gated at the database by
// current_user_role() = ANY('{super_admin,trainer}'). They add no
// client-side authorisation of their own and must not be trusted to.

import { supabase } from './supabase.js'

/** The single sentence the whole invalid-code surface is allowed to say. */
export const INVALID_CODE_MESSAGE = 'That enrolment code is not valid.'

/** Matches the cohort_invite_code_shape CHECK constraint. */
export const CODE_SHAPE = /^[A-Z0-9-]{8,32}$/

/** Normalise anything a human typed into the stored form. */
export function normaliseCode(raw) {
  return (raw ?? '').trim().toUpperCase()
}

/**
 * Redeem a code for the signed-in session.
 *
 * Requires an authenticated session: the RPC raises SQLSTATE 28000 without
 * one. On first redemption it creates the participants row (cts_id comes from
 * the trg_generate_cts_id trigger, program_source is copied from the cohort),
 * binds cohort_enrollments, writes the audit ledger and increments `uses`.
 */
export async function redeemCohortInvite(rawCode, fullName) {
  const code = normaliseCode(rawCode)
  if (!CODE_SHAPE.test(code)) {
    // Same sentence the RPC uses. Saying anything else here would leak the
    // shape of a real code, which is most of the search space.
    throw new Error(INVALID_CODE_MESSAGE)
  }

  const { data, error } = await supabase.rpc('redeem_cohort_invite', {
    p_code:      code,
    p_full_name: fullName?.trim() || null,
  })
  if (error) throw new Error(error.message)

  const row = Array.isArray(data) ? data[0] : data
  if (!row?.bound_participant_id) throw new Error(INVALID_CODE_MESSAGE)

  return {
    cohortId:      row.bound_cohort_id,
    cohortName:    row.bound_cohort_name,
    participantId: row.bound_participant_id,
  }
}

// ── Staff administration ───────────────────────────────────────

const CODE_COLUMNS =
  'id, cohort_id, code, label, max_uses, uses, expires_at, revoked_at, created_at'

/** Codes for one cohort, or every code when cohortId is null. Staff only. */
export async function listInviteCodes(cohortId = null) {
  let q = supabase
    .from('cohort_invite_code')
    .select(CODE_COLUMNS)
    .order('created_at', { ascending: false })
  if (cohortId) q = q.eq('cohort_id', cohortId)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

/**
 * Suggest a code that satisfies cohort_invite_code_shape.
 *
 * crypto.getRandomValues, not Math.random: this is a bearer secret and a
 * predictable PRNG would make the gate ornamental.
 *
 * The alphabet omits I, O, 0 and 1. These codes get typed off a printed
 * sheet by someone who has never seen the code before, and a transcription
 * slip is indistinguishable from a wrong code by design — so the code has to
 * be hard to mistype in the first place.
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateInviteCode(groups = 3, groupSize = 4) {
  const n = new Uint32Array(groups * groupSize)
  crypto.getRandomValues(n)
  const chars = Array.from(n, v => CODE_ALPHABET[v % CODE_ALPHABET.length])
  const out = []
  for (let i = 0; i < groups; i++) {
    out.push(chars.slice(i * groupSize, (i + 1) * groupSize).join(''))
  }
  return out.join('-')
}

/**
 * Issue a code for a cohort.
 *
 * `uses` is deliberately not settable here: redeem_cohort_invite() maintains
 * it, and writing it by hand would corrupt the cap.
 */
export async function issueInviteCode({ cohortId, code, label, maxUses, expiresAt, createdBy }) {
  const normalised = normaliseCode(code)
  if (!CODE_SHAPE.test(normalised)) {
    throw new Error('A code must be 8–32 characters using A–Z, 0–9 and hyphens only.')
  }
  const { data, error } = await supabase
    .from('cohort_invite_code')
    .insert({
      cohort_id:  cohortId,
      code:       normalised,
      label:      label?.trim() || null,
      max_uses:   maxUses ? Number(maxUses) : null,
      expires_at: expiresAt || null,
      created_by: createdBy || null,
    })
    .select(CODE_COLUMNS)
    .single()
  if (error) throw error
  return data
}

/** Change a code's label, cap or expiry. Never the code string itself. */
export async function updateInviteCode(id, { label, maxUses, expiresAt }) {
  const patch = {}
  if (label     !== undefined) patch.label      = label?.trim() || null
  if (maxUses   !== undefined) patch.max_uses   = maxUses ? Number(maxUses) : null
  if (expiresAt !== undefined) patch.expires_at = expiresAt || null

  const { data, error } = await supabase
    .from('cohort_invite_code')
    .update(patch)
    .eq('id', id)
    .select(CODE_COLUMNS)
    .single()
  if (error) throw error
  return data
}

/**
 * Revoke a code: a timestamp, not a delete. Past redemptions keep their audit
 * trail in cohort_invite_redemption.
 *
 * Effective immediately — redeem_cohort_invite() reads revoked_at live inside
 * the same transaction as the redemption, so there is no cache to bust and no
 * propagation window.
 */
export async function revokeInviteCode(id) {
  const { data, error } = await supabase
    .from('cohort_invite_code')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .select(CODE_COLUMNS)
    .single()
  if (error) throw error
  return data
}

/** Expire a code now (same visible effect as revoking, kept as a distinct act). */
export async function expireInviteCodeNow(id) {
  return updateInviteCode(id, { expiresAt: new Date().toISOString() })
}

/** How a code reads to staff. Staff may see the real reason; redeemers may not. */
export function codeState(code, now = new Date()) {
  if (code.revoked_at) return 'Revoked'
  if (code.expires_at && new Date(code.expires_at) <= now) return 'Expired'
  if (code.max_uses != null && code.uses >= code.max_uses) return 'Used up'
  return 'Live'
}
