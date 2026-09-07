// src/lib/access.js
// ── Morpheus CRM — staff-side access administration ────────────
//
// Enrolment codes and vendor access. Everything here is gated at the database
// by `current_user_role() = ANY('{super_admin,trainer}')` — these helpers add
// no client-side authorization of their own and must not be trusted to.
//
// A note on codes: an invite code is a BEARER SECRET. Anyone holding it can
// join the cohort it points at. That is why cohort_invite_code has no
// participant, vendor or anon SELECT policy, and why the only thing a
// non-staff session can do with a code is redeem it.

import { supabase } from './supabase.js'

// ── Enrolment codes ────────────────────────────────────────────

/** Codes for one cohort (or all cohorts when cohortId is null). */
export async function listInviteCodes(cohortId = null) {
  let q = supabase
    .from('cohort_invite_code')
    .select('id, cohort_id, code, label, max_uses, uses, expires_at, revoked_at, created_at')
    .order('created_at', { ascending: false })
  if (cohortId) q = q.eq('cohort_id', cohortId)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

/**
 * Generate a code that satisfies cohort_invite_code_shape:
 * upper-case, ^[A-Z0-9-]{8,32}$.
 *
 * Uses crypto.getRandomValues, not Math.random — this is a bearer secret and a
 * predictable PRNG would make the whole gate ornamental.
 *
 * The alphabet omits I, O, 0 and 1: these get typed off a printed sheet by
 * someone who has never seen the code before, and a transcription error is
 * indistinguishable from a wrong code by design (the RPC gives the same
 * message either way), so it has to be hard to mistype in the first place.
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateInviteCode(groups = 3, groupSize = 4) {
  const bytes = new Uint32Array(groups * groupSize)
  crypto.getRandomValues(bytes)
  const chars = Array.from(bytes, n => CODE_ALPHABET[n % CODE_ALPHABET.length])
  const out = []
  for (let i = 0; i < groups; i++) out.push(chars.slice(i * groupSize, (i + 1) * groupSize).join(''))
  return out.join('-')
}

/** Normalise anything a human typed into the stored form. */
export function normaliseCode(raw) {
  return (raw ?? '').trim().toUpperCase()
}

export const CODE_SHAPE = /^[A-Z0-9-]{8,32}$/

/**
 * Issue a code for a cohort.
 *
 * `uses` is deliberately not settable: it is maintained by
 * redeem_cohort_invite() and writing it by hand would corrupt the cap.
 */
export async function issueInviteCode({ cohortId, code, label, maxUses, expiresAt, createdBy }) {
  const normalised = normaliseCode(code)
  if (!CODE_SHAPE.test(normalised)) {
    throw new Error('A code must be 8–32 characters, using A–Z, 0–9 and hyphens only.')
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
    .select('id, cohort_id, code, label, max_uses, uses, expires_at, revoked_at, created_at')
    .single()
  if (error) throw error
  return data
}

/** Change the label, cap or expiry of an existing code. Never the code itself. */
export async function updateInviteCode(id, { label, maxUses, expiresAt }) {
  const patch = {}
  if (label !== undefined)     patch.label      = label?.trim() || null
  if (maxUses !== undefined)   patch.max_uses   = maxUses ? Number(maxUses) : null
  if (expiresAt !== undefined) patch.expires_at = expiresAt || null

  const { data, error } = await supabase
    .from('cohort_invite_code')
    .update(patch)
    .eq('id', id)
    .select('id, cohort_id, code, label, max_uses, uses, expires_at, revoked_at, created_at')
    .single()
  if (error) throw error
  return data
}

/**
 * Revoke a code. This is a timestamp, not a delete: past redemptions keep
 * their audit trail, and cohort_invite_redemption's FK is ON DELETE RESTRICT
 * precisely so nobody can erase one.
 *
 * Takes effect on the next redemption attempt — redeem_cohort_invite() reads
 * revoked_at live, so there is no cache and no propagation delay.
 */
export async function revokeInviteCode(id) {
  const { data, error } = await supabase
    .from('cohort_invite_code')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, revoked_at')
    .single()
  if (error) throw error
  return data
}

/** Expire a code now, without marking it revoked. Reversible; revocation is not. */
export async function expireInviteCode(id) {
  return updateInviteCode(id, { expiresAt: new Date().toISOString() })
}

/** Derived state for display. Mirrors the checks inside redeem_cohort_invite(). */
export function codeState(code, now = Date.now()) {
  if (code.revoked_at) return 'REVOKED'
  if (code.expires_at && new Date(code.expires_at).getTime() <= now) return 'EXPIRED'
  if (code.max_uses != null && code.uses >= code.max_uses) return 'EXHAUSTED'
  return 'ACTIVE'
}

/** Who redeemed which code. Staff-readable ledger. */
export async function listRedemptions(cohortId = null) {
  let q = supabase
    .from('cohort_invite_redemption')
    .select('id, invite_code_id, participant_id, redeemed_at, cohort_invite_code!inner(code, cohort_id), participants(full_name, cts_id)')
    .order('redeemed_at', { ascending: false })
    .limit(200)
  if (cohortId) q = q.eq('cohort_invite_code.cohort_id', cohortId)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

// ── Vendors ────────────────────────────────────────────────────

export const VENDOR_KINDS  = ['VENDOR', 'FUNDER', 'AGENCY', 'FACILITY']
export const VENDOR_STATUS = ['ACTIVE', 'SUSPENDED']

export async function listVendors() {
  const { data, error } = await supabase
    .from('vendor')
    .select('id, slug, name, kind, contact_email, status, notes, created_at')
    .order('name')
  if (error) throw error
  return data ?? []
}

export async function createVendor({ slug, name, kind, contactEmail, notes }) {
  const { data, error } = await supabase
    .from('vendor')
    .insert({
      slug: (slug ?? '').trim().toLowerCase(),
      name: name?.trim(),
      kind,
      contact_email: contactEmail?.trim() || null,
      notes: notes?.trim() || null,
      status: 'ACTIVE',
    })
    .select('id, slug, name, kind, contact_email, status, notes, created_at')
    .single()
  if (error) throw error
  return data
}

/**
 * Suspend or reactivate a vendor.
 *
 * Suspension is the blunt instrument: current_vendor_id() resolves only ACTIVE
 * vendors, so suspending one cuts off every user of that vendor at once, on
 * their next query — no sign-out required, no token to revoke.
 */
export async function setVendorStatus(id, status) {
  if (!VENDOR_STATUS.includes(status)) throw new Error(`Unknown vendor status: ${status}`)
  const { data, error } = await supabase
    .from('vendor')
    .update({ status })
    .eq('id', id)
    .select('id, status')
    .single()
  if (error) throw error
  return data
}

export async function listVendorUsers(vendorId) {
  const { data, error } = await supabase
    .from('vendor_user')
    .select('vendor_id, user_id, added_at')
    .eq('vendor_id', vendorId)
    .order('added_at')
  if (error) throw error
  return data ?? []
}

/**
 * Attach an existing auth user to a vendor.
 *
 * Takes a user id, not an email: the anon key cannot look users up by email
 * (auth.users is not client-readable, and rightly so), and inventing a
 * lookup endpoint for it would be a user-enumeration oracle. The operator
 * pastes the id from the Supabase dashboard, or from the account-creation
 * response.
 *
 * This membership row IS the vendor's access — public.current_vendor_id()
 * reads it directly. app_metadata.role = 'vendor' governs which shell they
 * land in, not what they can read.
 */
export async function addVendorUser(vendorId, userId, addedBy = null) {
  const { data, error } = await supabase
    .from('vendor_user')
    .insert({ vendor_id: vendorId, user_id: userId, added_by: addedBy })
    .select('vendor_id, user_id, added_at')
    .single()
  if (error) throw error
  return data
}

/** Detach a user from a vendor. Immediate: current_vendor_id() goes null. */
export async function removeVendorUser(vendorId, userId) {
  const { error } = await supabase
    .from('vendor_user')
    .delete()
    .eq('vendor_id', vendorId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function listVendorCohorts(vendorId) {
  const { data, error } = await supabase
    .from('vendor_cohort')
    .select('vendor_id, cohort_id, granted_at, revoked_at, cohorts(name, program_source, status)')
    .eq('vendor_id', vendorId)
    .order('granted_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * Grant a vendor scope over a cohort.
 *
 * A previously revoked grant is un-revoked rather than duplicated —
 * (vendor_id, cohort_id) is the primary key, so a plain insert would conflict.
 */
export async function grantVendorCohort(vendorId, cohortId, grantedBy = null) {
  const { data, error } = await supabase
    .from('vendor_cohort')
    .upsert(
      { vendor_id: vendorId, cohort_id: cohortId, granted_by: grantedBy, revoked_at: null },
      { onConflict: 'vendor_id,cohort_id' },
    )
    .select('vendor_id, cohort_id, granted_at, revoked_at')
    .single()
  if (error) throw error
  return data
}

/**
 * Revoke a vendor's scope over a cohort.
 *
 * Kept as a timestamp so the grant history survives. vendor_cohort_ids()
 * filters on `revoked_at IS NULL`, so the vendor's roster, EmpowerCare status,
 * progress and credentials for that cohort all go dark on their next query.
 */
export async function revokeVendorCohort(vendorId, cohortId) {
  const { data, error } = await supabase
    .from('vendor_cohort')
    .update({ revoked_at: new Date().toISOString() })
    .eq('vendor_id', vendorId)
    .eq('cohort_id', cohortId)
    .select('vendor_id, cohort_id, revoked_at')
    .single()
  if (error) throw error
  return data
}
