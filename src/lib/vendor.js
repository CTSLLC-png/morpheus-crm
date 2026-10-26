// src/lib/vendor.js
// ── Nguzo OS — vendor / funder / agency read-only data access ──
//
// =====================================================================
// READ THIS BEFORE ADDING A QUERY TO THIS FILE
// =====================================================================
//
// 1. A participant's NAME and their EmpowerCare STATUS reach a vendor
//    through exactly two functions: public.vendor_roster() and
//    public.vendor_empowercare_status(). Nothing else. Do not "just join
//    participants to get the name". `participants`, `empowercare.enrollment`
//    and `empowercare.credential` have NO vendor RLS policy on purpose:
//    RLS filters ROWS, not COLUMNS, and those tables carry dob,
//    ldss_case_number, retain_until and revoked_reason. A vendor policy on
//    any of them would hand an outside agency a participant's date of birth
//    and welfare case number.
//
// 2. `completion_status` from vendor_empowercare_status() is deliberately
//    coarse: IN_PROGRESS / COMPLETED / EXITED. The underlying
//    empowercare.enrollment.state also carries WEEK_TWO_BLOCKED, which IS
//    the day-3 caller-authentication gate failure. That is a named
//    compliance failure about a justice-involved person and it is not an
//    outside agency's business. Never display it, never fetch it, and never
//    infer it — including by arithmetic ("attended two days then stopped, so
//    they must have failed the gate"). Render what the function returns and
//    stop there. That is why nothing below derives a status, and why the
//    attendance figures come from the aggregate rather than the rows.
//
// 3. empowercare.attendance does carry a vendor read policy
//    (vendor_sees_ec_enrollment) but it is keyed by enrollment_id, and
//    empowercare.enrollment is NOT vendor-readable — so a vendor cannot map
//    an attendance row back to a person anyway. The per-participant totals
//    below therefore come from vendor_empowercare_status(), which aggregates
//    server-side. This file deliberately does not query attendance directly.
//
// 4. Everything here is SELECT. There is no write path in the vendor portal
//    and none should be added: every vendor policy is FOR SELECT, so a write
//    would fail at the database anyway — but it would fail as a confusing
//    error instead of a button that was never there.
//
// 5. public.cohorts and public.cohort_enrollments have NO vendor SELECT
//    policy on this database (verified against the live schema). So the
//    cohort list is derived from vendor_roster(), which already returns
//    cohort_id and cohort_name through a SECURITY DEFINER function scoped by
//    vendor_cohort_ids(). Do not add a direct `from('cohorts')` read here
//    expecting it to work; it returns zero rows for a vendor.

import { supabase } from './supabase.js'

/** The vendor organisation the signed-in user belongs to (RLS: own row only). */
export async function getMyVendor() {
  const { data, error } = await supabase
    .from('vendor')
    .select('id, slug, name, kind, status')
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ?? null
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
 *
 * `contact_hours` here IS the staff-attested record (empowercare.attendance),
 * which is the one place in this product where that phrase is correct.
 * Engagement telemetry is a different thing entirely and never appears in
 * vendor UI.
 */
export async function getVendorEmpowerCareStatus() {
  const { data, error } = await supabase.rpc('vendor_empowercare_status')
  if (error) throw error
  return data ?? []
}

/**
 * Course progress as a completed-lesson count per participant.
 *
 * edu_progress has a vendor policy (vendor_sees_participant); the course
 * structure tables are readable by any authenticated session, so the
 * denominator is safe to fetch. Returns { total, byParticipant: Map }.
 */
export async function getVendorProgress() {
  const [progress, lessons] = await Promise.all([
    supabase.from('edu_progress').select('participant_id, lesson_id, completed_at'),
    supabase.from('edu_lessons').select('id'),
  ])
  if (progress.error) throw progress.error
  if (lessons.error)  throw lessons.error

  const byParticipant = new Map()
  for (const row of progress.data ?? []) {
    const e = byParticipant.get(row.participant_id) ?? { completed: 0, lastAt: null }
    e.completed += 1
    if (!e.lastAt || row.completed_at > e.lastAt) e.lastAt = row.completed_at
    byParticipant.set(row.participant_id, e)
  }
  return { total: (lessons.data ?? []).length, byParticipant }
}

/**
 * Credentials issued to participants in this vendor's cohorts.
 * edu_credentials' vendor policy is vendor_sees_participant(participant_id).
 *
 * `holder_name` and `meta` are deliberately not selected: the name already
 * comes from vendor_roster(), and `meta` is a free-form jsonb column whose
 * contents nobody has promised are vendor-safe.
 */
export async function getVendorCredentials() {
  const { data, error } = await supabase
    .from('edu_credentials')
    .select('id, participant_id, credential_code, credential_name, issued_at, expires_at, status')
    .order('issued_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * Everything the vendor portal renders, in one pass.
 *
 * Each read is reported independently: a vendor seeing "roster unavailable"
 * is a different situation from a vendor seeing an empty roster, and the two
 * must not look the same on screen.
 */
export async function loadVendorWorkspace() {
  const [vendor, roster, empowercare, progress, credentials] = await Promise.allSettled([
    getMyVendor(),
    getVendorRoster(),
    getVendorEmpowerCareStatus(),
    getVendorProgress(),
    getVendorCredentials(),
  ])

  const take = (r, fallback) => (r.status === 'fulfilled' ? r.value : fallback)
  const why  = (r) => (r.status === 'rejected' ? (r.reason?.message ?? 'read failed') : null)

  const rosterRows = take(roster, [])

  // Cohort list is derived from the roster, not read from public.cohorts —
  // see note 5 at the top of this file.
  const cohorts = []
  const seen = new Set()
  for (const r of rosterRows) {
    if (!r.cohort_id || seen.has(r.cohort_id)) continue
    seen.add(r.cohort_id)
    cohorts.push({ id: r.cohort_id, name: r.cohort_name })
  }
  cohorts.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))

  return {
    vendor:      take(vendor, null),
    roster:      rosterRows,
    empowercare: take(empowercare, []),
    progress:    take(progress, { total: 0, byParticipant: new Map() }),
    credentials: take(credentials, []),
    cohorts,
    errors: {
      vendor:      why(vendor),
      roster:      why(roster),
      empowercare: why(empowercare),
      progress:    why(progress),
      credentials: why(credentials),
    },
  }
}
