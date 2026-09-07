// src/lib/identity.js
// ── Morpheus CRM — who the signed-in user actually is ──────────
//
// WHY THIS FILE EXISTS
//
// app_metadata.role is the source of truth for authorization (see
// lib/supabase.js). But it is written by a service-role process, and on this
// project that process is not reliably wired: `on-user-signup` is present in
// the repo but no trigger or webhook on auth.users invokes it, so it has never
// run. A brand-new self-registered account therefore has NO role for at least
// as long as it takes an operator to wire that up — and possibly forever.
//
// Bouncing such a user to /login is what the app did before, and it produces
// an infinite loop: sign in, no role, back to /login.
//
// So when app_metadata carries no recognised role we do NOT guess. We ask the
// database who this user is, using only rows RLS already lets them see:
//
//   participants     "Participants can read own record"  (user_id = auth.uid())
//   vendor_user      "vendor_user_self_read"             (user_id = auth.uid())
//
// A row coming back is not a claim by the user; it is the database confirming
// a relationship a staff member created. That makes it a legitimate, auditable
// basis for routing — unlike user_metadata, which the user writes themselves.
//
// This fallback only ever resolves to `participant` or `vendor`, the two
// least-privileged shells. It can NEVER produce `trainer` or `super_admin`:
// staff privilege comes from app_metadata or not at all. A user with a
// staff_profiles row but no app_metadata role stays unresolved on purpose.

import { supabase, getUserRole } from './supabase.js'

/**
 * @typedef {Object} Identity
 * @property {'super_admin'|'trainer'|'participant'|'vendor'|null} role
 * @property {'metadata'|'membership'|'none'} basis  where `role` came from
 * @property {string|null} participantId
 * @property {string|null} vendorId
 */

/** @type {Identity} */
const UNRESOLVED = { role: null, basis: 'none', participantId: null, vendorId: null }

/**
 * Resolve the signed-in user's identity.
 *
 * Order matters. app_metadata wins outright; the membership lookup runs only
 * when app_metadata has nothing the app recognises.
 *
 * @param {import('@supabase/supabase-js').User|null} user
 * @returns {Promise<Identity>}
 */
export async function resolveIdentity(user) {
  if (!user) return UNRESOLVED

  const role = getUserRole(user)

  if (role === 'trainer' || role === 'super_admin') {
    return { role, basis: 'metadata', participantId: null, vendorId: null }
  }

  // For participant and vendor we still want the id, so fall through to the
  // lookups either way and only the `basis` differs.
  const [participantId, vendorId] = await Promise.all([
    lookupParticipantId(user.id),
    lookupVendorId(),
  ])

  if (role) return { role, basis: 'metadata', participantId, vendorId }

  // No usable role in app_metadata. Derive one from confirmed membership.
  // Participant takes precedence: a participant is the subject of the record,
  // a vendor is only ever an observer of it.
  if (participantId) return { role: 'participant', basis: 'membership', participantId, vendorId }
  if (vendorId)      return { role: 'vendor',      basis: 'membership', participantId, vendorId }

  return UNRESOLVED
}

/** participants.id for the current user, or null. RLS-scoped to own row. */
async function lookupParticipantId(userId) {
  const { data, error } = await supabase
    .from('participants')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return null
  return data?.id ?? null
}

/**
 * The vendor this user belongs to, or null.
 *
 * Read `public.vendor` directly rather than `vendor_user`. Its vendor_self_read
 * policy is `id = current_vendor_id()`, and current_vendor_id() resolves only
 * ACTIVE vendors — so this one query answers "is this user a vendor user of a
 * live vendor" with exactly the definition the rest of the vendor RLS uses.
 * Querying vendor_user instead would happily return a membership in a
 * SUSPENDED vendor, and the shell would render with every panel empty.
 *
 * Suspension is therefore immediate: it takes effect on the next resolve, with
 * no metadata to rewrite and no token to revoke.
 */
async function lookupVendorId() {
  const { data, error } = await supabase
    .from('vendor')
    .select('id')
    .limit(1)
    .maybeSingle()
  if (error) return null
  return data?.id ?? null
}

// ── Enrolment ──────────────────────────────────────────────────

/**
 * Redeem a cohort enrolment code for the signed-in user.
 *
 * On first redemption the RPC creates the participants row, binds the cohort
 * enrolment and writes the ledger — all in one transaction, so there is no
 * half-enrolled state to clean up.
 *
 * Every rejection (unknown / expired / revoked / exhausted) raises the SAME
 * message by design: distinguishing them would turn this into an oracle that
 * tells an attacker which guessed codes are real. Surface the message verbatim
 * and do not try to be more helpful than it is.
 *
 * @returns {Promise<{cohortId: string, cohortName: string, participantId: string}>}
 */
export async function redeemCohortInvite(code, fullName) {
  const { data, error } = await supabase.rpc('redeem_cohort_invite', {
    p_code: code,
    p_full_name: fullName ?? null,
  })
  if (error) throw error

  const row = Array.isArray(data) ? data[0] : data
  if (!row?.bound_participant_id) {
    throw new Error('That enrolment code is not valid.')
  }
  return {
    cohortId: row.bound_cohort_id,
    cohortName: row.bound_cohort_name,
    participantId: row.bound_participant_id,
  }
}
