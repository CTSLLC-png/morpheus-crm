// src/lib/supabase.js
// ── Morpheus CRM — Supabase client + auth helpers ──────────────

import { createClient } from '@supabase/supabase-js'

// Baked-in defaults (public-by-design values — the anon key is the
// browser key, protected by Row Level Security). Env vars, when set
// in Vercel, override these. This guarantees Morpheus always boots.
const DEFAULT_URL  = 'https://ymavrmekxiwdphdyteau.supabase.co'
const DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InltYXZybWVreGl3ZHBoZHl0ZWF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4Mjg0MDIsImV4cCI6MjA5ODQwNDQwMn0.EdXN9Bw90VuhFTmTnCK11woGBX1dS30H_jewetwuWi0'

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  || DEFAULT_URL
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON

// Never blank-screen: if config is somehow still missing, show a
// readable diagnostic instead of crashing the whole app at load.
if (!SUPABASE_URL || !SUPABASE_ANON) {
  const el = document.getElementById('root')
  if (el) {
    el.innerHTML =
      '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0D1B2A;color:#5DCAA5;font-family:monospace;padding:24px;text-align:center">' +
      'Morpheus configuration error: Supabase connection values are missing.<br/>Contact your administrator.' +
      '</div>'
  }
  throw new Error('Morpheus: missing Supabase configuration')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})

// ── Auth helpers ───────────────────────────────────────────────

/** Sign in with email + password */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

/** Sign out current user */
export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

/** Get current session (null if not logged in) */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}

// ── Role: app_metadata is the single source of truth ───────────
//
// There are two places a role could live on a Supabase user and they are NOT
// equivalent:
//
//   user.app_metadata  → auth.users.raw_app_meta_data
//                        Writable ONLY by the service role. This is what
//                        public.current_user_role() reads, so it is what
//                        every RLS policy in this database actually enforces.
//
//   user.user_metadata → auth.users.raw_user_meta_data
//                        Writable by the END USER with nothing but the anon
//                        key: supabase.auth.updateUser({ data: { role: … } }).
//
// This client used to read user_metadata. That meant the UI's idea of "who
// you are" was a value the user could set on themselves, and it disagreed
// with the database's idea, which is the bug this module exists to close.
//
// Rule: authorization reads app_metadata and nothing else. user_metadata is
// still written by the account-creation paths, but only as a display mirror
// (full_name, and a copy of role for human legibility in the dashboard).
// Nothing in this app may branch on it.

/** Every role the app knows. An unlisted value is treated as no role at all. */
export const KNOWN_ROLES = ['super_admin', 'trainer', 'participant', 'vendor']

/**
 * The signed-in user's role, from app_metadata only.
 * Returns null for "no role the app recognises" — callers must treat that as
 * "not authorised", never as a default.
 */
export function getUserRole(user) {
  const role = user?.app_metadata?.role ?? null
  return KNOWN_ROLES.includes(role) ? role : null
}

/**
 * What user_metadata claims. Display and diagnostics ONLY — never gate
 * anything on this. Exported so the staff admin screen can show an operator
 * when the two surfaces disagree instead of leaving it invisible.
 */
export function getClaimedRole(user) {
  return user?.user_metadata?.role ?? null
}

/** Sign up with email + password. The registered email IS the username. */
export async function signUp(email, password, fullName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // Goes to raw_user_meta_data. Deliberately carries NO role: a role
    // asserted by the browser is worthless, and accepting one here would
    // invite exactly the confusion this module removes.
    options: { data: fullName ? { full_name: fullName } : {} },
  })
  if (error) throw error
  return data
}

/**
 * Re-mint the access token so freshly stamped app_metadata reaches the client.
 *
 * RLS does not need this — current_user_role() reads auth.users live — but the
 * browser's `user` object comes from the JWT, which was minted before the role
 * was written. Failure is non-fatal: the caller falls back to resolving
 * identity from the database.
 */
export async function refreshSession() {
  try {
    const { data } = await supabase.auth.refreshSession()
    return data?.session ?? null
  } catch {
    return null
  }
}

/** Get current user object */
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw error
  return user
}

// ── Password reset flow ────────────────────────────────────────

export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${import.meta.env.VITE_APP_URL || 'https://morpheuscr.com'}/reset-password`,
  })
  if (error) throw error
}

export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}
