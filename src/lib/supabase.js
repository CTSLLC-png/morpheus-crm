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

/** Get role from user metadata: 'super_admin' | 'trainer' | 'participant' */
export function getUserRole(user) {
  return user?.user_metadata?.role ?? null
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
