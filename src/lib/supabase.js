// src/lib/supabase.js
// ── Morpheus CRM — Supabase client + auth helpers ──────────────

import { createClient } from '@supabase/supabase-js'
import { SITE_URL } from './site.js'

// Baked-in defaults (public-by-design values — the anon key is the
// browser key, protected by Row Level Security). Env vars, when set
// in Vercel, override these. This guarantees Morpheus always boots.
const DEFAULT_URL  = 'https://ymavrmekxiwdphdyteau.supabase.co'
const DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InltYXZybWVreGl3ZHBoZHl0ZWF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4Mjg0MDIsImV4cCI6MjA5ODQwNDQwMn0.EdXN9Bw90VuhFTmTnCK11woGBX1dS30H_jewetwuWi0'

// Only accept env values that actually look like Supabase config. A
// placeholder pasted into Vercel (e.g. "The active project's publishable
// key") otherwise overrides the good default and every sign-in fails with
// "Invalid API key".
const ENV_URL  = (import.meta.env.VITE_SUPABASE_URL || '').trim()
const ENV_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()
const isValidUrl  = (v) => /^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(v)
const isValidAnon = (v) =>
  /^eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+$/.test(v) || /^sb_publishable_[\w-]+$/.test(v)

if (ENV_URL && !isValidUrl(ENV_URL)) {
  console.warn('Morpheus: VITE_SUPABASE_URL is not a valid Supabase URL; using built-in default.')
}
if (ENV_ANON && !isValidAnon(ENV_ANON)) {
  console.warn('Morpheus: VITE_SUPABASE_ANON_KEY is not a valid Supabase key; using built-in default.')
}

// URL and key must come from the same project, so only use the env pair
// when both are valid; otherwise use the built-in pair.
const useEnv = isValidUrl(ENV_URL) && isValidAnon(ENV_ANON)
const SUPABASE_URL  = useEnv ? ENV_URL.replace(/\/$/, '')  : DEFAULT_URL
const SUPABASE_ANON = useEnv ? ENV_ANON : DEFAULT_ANON

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

/**
 * Get role from app metadata: 'super_admin' | 'trainer' | 'participant'
 *
 * SECURITY: this reads app_metadata, NOT user_metadata. app_metadata can
 * only be written by a trusted server (the service_role key, used inside
 * our edge functions and the set_default_participant_app_role DB
 * trigger) -- a signed-in user can never set it on themselves. Every RLS
 * policy in the database is gated the same way via current_user_role(),
 * which also reads app_metadata. If this ever reads user_metadata again,
 * any user could grant themselves super_admin at signup by passing
 * options.data.role to supabase.auth.signUp().
 */
export function getUserRole(user) {
  return user?.app_metadata?.role ?? null
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
    redirectTo: `${SITE_URL}/reset-password`,
  })
  if (error) throw error
}

export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}
