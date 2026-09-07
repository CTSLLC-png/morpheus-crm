// src/lib/vendor.js
// ── Morpheus CRM — vendor read-only data access ────────────────
//
// ===================================================================
// READ THIS BEFORE ADDING A QUERY TO THIS FILE
// ===================================================================
//
// 1. A participant's NAME and their EmpowerCare STATUS reach a vendor through
//    exactly two functions: public.vendor_roster() and
//    public.vendor_empowercare_status(). Nothing else. Do not "just join
//    participants to get the name" — `participants`, `empowercare.enrollment`
//    and `empowercare.credential` have NO vendor RLS policy on purpose,
//    because RLS filters ROWS and not COLUMNS, and those tables carry dob,
//    ldss_case_number, retain_until and revoked_reason. A vendor policy on
//    them would hand a funder a participant's date of birth and case number.
//
// 2. `completion_status` from vendor_empowercare_status() is deliberately
//    coarse: IN_PROGRESS / COMPLETED / EXITED. The underlying
//    empowercare.enrollment.state also has WEEK_TWO_BLOCKED, which IS the
//    day-3 caller-authentication gate failure. That is a discipline outcome
//    about a person and it is not a vendor's business. Never display it,
//    never fetch it, and never infer it — including by arithmetic, e.g.
//    "attended 2 days then stopped, must have failed the gate". Show what the
//    function returns and stop.
//
// 3. empowercare.attendance carries a vendor read policy
//    (vendor_sees_ec_enrollment) but it is keyed by enrollment_id, and
//    empowercare.enrollment is not vendor-readable — so a vendor cannot map an
//    attendance row to a person anyway. The per-participant attendance totals
//    below come from vendor_empowercare_status(), which aggregates them
//    server-side. This file deliberately does not query attendance directly.
//
// 4. Everything here is SELECT. There is no write path in the vendor shell,
//    and none should be added: the vendor RLS policies are all `FOR SELECT`,
//    so a write would fail at the database anyway — but it would fail as a
//    confusing error instead of a button that was never there.

import { supabase } from './supabase.js'

/** The vendor organisation the signed-in user belongs to (RLS: own row only). */
export async function getMyVendor() {
  const { data, error } = await supabase
    .from('vendor')
    .select('id, slug, name, kind, contact_email, status')
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

/**
 * Cohorts this vendor currently has scope over.
 *
 * Reads public.cohorts, whose vendor policy is `id IN (vendor_cohort_ids())`.
 * vendor_cohort_ids() excludes revoked grants, so a revocation removes the
 * cohort from this list on the very next load — no cache to bust.
 */
export async function getVendorCohorts() {
  const { data, error } = await supabase
    .from('cohorts')
    .select('id, name, program_source, start_date, end_date, status')
    .order('start_date', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * The roster: one row per (participant, cohort) this vendor may see.
 * The ONLY sanctioned source of a participant's name for a vendor.
 */
export async function getVendorRoster() {
  const { data, error } = await supabase.rpc('vendor_roster')
  if (error) throw error
  return data ?? []
}

/**
 * EmpowerCare attendance totals and coarse completion status.
 * The ONLY sanctioned source of EmpowerCare state for a vendor.
 */
export async function getVendorEmpowerCareStatus() {
  const { data, error } = await supabase.rpc('vendor_empowercare_status')
  if (error) throw error
  return data ?? []
}

/**
 * Course progress, as a lesson count per participant.
 *
 * edu_progress has a vendor policy (vendor_sees_participant), and the course
 * structure tables are readable by any authenticated user, so the denominator
 * is safe to fetch. Returns a Map participant_id -> { completed, lessons }.
 */
export async function getVendorProgress() {
  const [{ data: progress, error: pErr }, { data: lessons, error: lErr }] = await Promise.all([
    supabase.from('edu_progress').select('participant_id, lesson_id, completed_at'),
    supabase.from('edu_lessons').select('id'),
  ])
  if (pErr) throw pErr
  if (lErr) throw lErr

  const total = (lessons ?? []).length
  const byParticipant = new Map()
  for (const row of progress ?? []) {
    const entry = byParticipant.get(row.participant_id) ?? { completed: 0, lastAt: null }
    entry.completed += 1
    if (!entry.lastAt || row.completed_at > entry.lastAt) entry.lastAt = row.completed_at
    byParticipant.set(row.participant_id, entry)
  }
  return { total, byParticipant }
}

/**
 * Credentials issued to participants in this vendor's cohorts.
 * edu_credentials.vendor policy is vendor_sees_participant(participant_id).
 */
export async function getVendorCredentials() {
  const { data, error } = await supabase
    .from('edu_credentials')
    .select('id, participant_id, credential_code, credential_name, issued_at, expires_at, status')
    .order('issued_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/** Everything the vendor shell renders, in one round trip. */
export async function loadVendorWorkspace() {
  const [vendor, cohorts, roster, ec, progress, credentials] = await Promise.all([
    getMyVendor(),
    getVendorCohorts(),
    getVendorRoster(),
    getVendorEmpowerCareStatus(),
    getVendorProgress(),
    getVendorCredentials(),
  ])
  return { vendor, cohorts, roster, ec, progress, credentials }
}
