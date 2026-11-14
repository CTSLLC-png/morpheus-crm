// src/lib/vendorAdmin.js
// ── Nguzo OS — staff administration of partner (vendor) access ──
//
// Create partner organisations, attach their users, grant and revoke cohort
// scope. Everything here is gated at the database by
// current_user_role() = ANY('{super_admin,trainer}') via the *_staff_all
// policies; these helpers add no client-side authorisation of their own.
//
// WHY YOU PASTE A USER ID AND NOT AN EMAIL ADDRESS
//
// There is deliberately no email -> user_id lookup in this file and there
// must not be one. Such a lookup is a user-enumeration oracle: anyone who can
// reach it learns which email addresses hold accounts in a system whose users
// are justice-involved people in a reentry programme. The operator copies the
// id out of the Supabase dashboard (or out of the account-creation result)
// and pastes it here. That is slower on purpose.
//
// WHAT THIS CANNOT DO
//
// Attaching a vendor_user row makes current_vendor_id() resolve, which is
// what every vendor RLS policy and vendor_* function keys off. It does NOT
// set app_metadata.role = 'vendor' on the account — only the service role can
// write app_metadata, from a server. So a newly attached partner user still
// routes by whatever role their account already carries until an
// administrator sets it server-side. See the report accompanying this change.

import { supabase } from './supabase.js'

export const VENDOR_KINDS    = ['VENDOR', 'FUNDER', 'AGENCY', 'FACILITY']
export const VENDOR_STATUSES = ['ACTIVE', 'SUSPENDED']

/** Matches the vendor_slug_shape CHECK constraint. */
export const SLUG_SHAPE = /^[a-z][a-z0-9-]{1,40}$/

export function slugify(name) {
  return (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 41)
}

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUserId(v) {
  return UUID_SHAPE.test((v ?? '').trim())
}

// ── Organisations ──────────────────────────────────────────────

export async function listVendors() {
  const { data, error } = await supabase
    .from('vendor')
    .select('id, slug, name, kind, status, contact_email, created_at')
    .order('name')
  if (error) throw error
  return data ?? []
}

export async function createVendor({ name, slug, kind = 'VENDOR', contactEmail }) {
  const trimmedName = (name ?? '').trim()
  const finalSlug   = (slug?.trim() || slugify(trimmedName))
  if (!trimmedName) throw new Error('A partner organisation needs a name.')
  if (!SLUG_SHAPE.test(finalSlug)) {
    throw new Error('The slug must start with a letter and use 2–41 lower-case letters, digits or hyphens.')
  }
  if (!VENDOR_KINDS.includes(kind)) throw new Error('Unknown organisation kind.')

  const { data, error } = await supabase
    .from('vendor')
    .insert({
      name:          trimmedName,
      slug:          finalSlug,
      kind,
      contact_email: contactEmail?.trim() || null,
    })
    .select('id, slug, name, kind, status, contact_email, created_at')
    .single()
  if (error) throw error
  return data
}

/**
 * Suspend or reactivate an organisation.
 *
 * Suspending is the big hammer: current_vendor_id() only resolves ACTIVE
 * vendors, so every one of that partner's users loses every row on their next
 * request. No cache, no session to invalidate.
 */
export async function setVendorStatus(vendorId, status, reason = null) {
  if (!VENDOR_STATUSES.includes(status)) throw new Error('Unknown status.')

  // Suspending goes through the RPC so a trainer can do it: cutting off a
  // partner is the safety-increasing direction and must not wait on the one
  // super admin. The function records who and why.
  if (status === 'SUSPENDED') {
    const { error } = await supabase.rpc('vendor_suspend', {
      p_vendor_id: vendorId,
      p_reason: reason ?? '',
    })
    if (error) throw error
    return { id: vendorId, status }
  }

  // Reinstating is the granting direction, so it stays an ordinary write and
  // RLS allows it only for a super admin.
  const { data, error } = await supabase
    .from('vendor')
    .update({ status, suspended_at: null, suspended_by: null, suspend_reason: null })
    .eq('id', vendorId)
    .select('id, status')
    .single()
  if (error) throw error
  return data
}

// ── Users ──────────────────────────────────────────────────────

/**
 * Users attached to a partner. Returns ids only — there is no join to
 * auth.users here, and adding one would recreate the enumeration oracle this
 * file exists to avoid.
 */
export async function listVendorUsers(vendorId) {
  const { data, error } = await supabase
    .from('vendor_user')
    .select('vendor_id, user_id, added_at')
    .eq('vendor_id', vendorId)
    .order('added_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function attachVendorUser(vendorId, userId, addedBy = null) {
  const id = (userId ?? '').trim()
  if (!isUserId(id)) {
    throw new Error('Paste the account’s user id (a UUID from the Supabase dashboard), not an email address.')
  }
  const { data, error } = await supabase
    .from('vendor_user')
    .insert({ vendor_id: vendorId, user_id: id, added_by: addedBy || null })
    .select('vendor_id, user_id, added_at')
    .single()
  if (error) throw error
  return data
}

/**
 * Detach a user. current_vendor_id() reads vendor_user live, so the next
 * request that account makes resolves no vendor and sees nothing.
 */
export async function detachVendorUser(vendorId, userId) {
  // Through the RPC: removing someone's access is a revoke, so trainers may
  // do it even though they cannot attach.
  const { error } = await supabase.rpc('vendor_detach_user', {
    p_vendor_id: vendorId,
    p_user_id: userId,
  })
  if (error) throw error
}

// ── Cohort scope ───────────────────────────────────────────────

export async function listVendorCohortGrants(vendorId) {
  const { data, error } = await supabase
    .from('vendor_cohort')
    .select('vendor_id, cohort_id, granted_at, revoked_at')
    .eq('vendor_id', vendorId)
    .order('granted_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * Grant a cohort to a partner.
 *
 * vendor_cohort's primary key is (vendor_id, cohort_id), so re-granting a
 * previously revoked cohort is an UPDATE that clears revoked_at rather than a
 * second row — hence the upsert.
 */
export async function grantVendorCohort(vendorId, cohortId, grantedBy = null) {
  const { data, error } = await supabase
    .from('vendor_cohort')
    .upsert(
      {
        vendor_id:  vendorId,
        cohort_id:  cohortId,
        revoked_at: null,
        granted_at: new Date().toISOString(),
        granted_by: grantedBy || null,
      },
      { onConflict: 'vendor_id,cohort_id' },
    )
    .select('vendor_id, cohort_id, granted_at, revoked_at')
    .single()
  if (error) throw error
  return data
}

/**
 * Revoke a cohort grant. Effective immediately: vendor_cohort_ids() filters
 * on `revoked_at IS NULL` at query time, and every vendor read goes through
 * it, so the partner's very next request no longer returns those rows. The
 * row is kept rather than deleted so the grant history survives.
 */
export async function revokeVendorCohort(vendorId, cohortId) {
  // Through the RPC so trainers can withdraw a grant they cannot make. It
  // stamps revoked_by as well as revoked_at — "when" without "who" is not an
  // answer after an access question.
  const { error } = await supabase.rpc('vendor_revoke_cohort', {
    p_vendor_id: vendorId,
    p_cohort_id: cohortId,
  })
  if (error) throw error
  return { vendor_id: vendorId, cohort_id: cohortId }
}
