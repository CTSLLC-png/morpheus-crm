// src/legacy/api.js
// ── Legacy Path — Supabase calls (all protected by RLS on the lp_ tables) ──

import { supabase } from '../lib/supabase.js'

export const CONTENT_KEYS = ['ageBands', 'vehicles', 'trusts', 'insurance', 'leverage', 'funeral']
const EMPLOYMENT = ['w2', 'self-employed', 'both', 'retired', 'unemployed', 'student']

/** True when the signed-in user has a paid, unrefunded purchase. */
export async function hasAccess(uid) {
  const { data, error } = await supabase.rpc('has_access', { uid })
  if (error) throw error
  return data === true
}

/**
 * Latest published version of each guide. RLS only returns paid rows to
 * users with access, so this resolves to null for everyone else.
 */
export async function loadContent() {
  const { data, error } = await supabase
    .from('lp_content_versions')
    .select('content_key, body, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
  if (error) throw error
  const out = {}
  for (const row of data ?? []) if (!(row.content_key in out)) out[row.content_key] = row.body
  return CONTENT_KEYS.every((k) => out[k]) ? out : null
}

/** The account holder's current screener answers, or null. */
export async function loadIntake(uid) {
  const { data, error } = await supabase
    .from('lp_intakes')
    .select('answers')
    .eq('user_id', uid)
    .is('family_member_id', null)
    .eq('is_current', true)
    .maybeSingle()
  if (error) throw error
  return data?.answers ?? null
}

/** Saves a new version of the screener answers (older versions are kept). */
export async function saveIntake(uid, d) {
  const row = {
    user_id: uid,
    answers: d,
    state: String(d.state || '').toUpperCase(),
    age: Number(d.age),
    marital_status: d.maritalStatus || null,
    employment: EMPLOYMENT.includes(d.employment) ? d.employment : null,
    faith_tradition: d.faithTradition || null,
  }
  const { error } = await supabase.from('lp_intakes').insert(row)
  if (error) throw error
}

/**
 * Opens Stripe Checkout for the $20 lifetime purchase.
 * Resolves 'already_purchased' when the account already has access.
 */
export async function startCheckout() {
  const { data, error } = await supabase.functions.invoke('create-checkout', { body: {} })
  if (error) {
    const status = error.context?.status
    if (status === 409) return 'already_purchased'
    if (status === 401) return 'signed_out'
    throw new Error('Checkout is unavailable right now. Please try again in a minute.')
  }
  if (!data?.url) throw new Error('Checkout is unavailable right now. Please try again in a minute.')
  window.location.assign(data.url)
  return 'redirecting'
}

/** Creates a Legacy-only account (role lp_customer, set by the database). */
export async function signUp(email, password, redirectTo) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { signup_source: 'legacy-path' }, emailRedirectTo: redirectTo },
  })
  if (error) throw error
  return data
}

export async function signInWithPassword(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function sendReset(email, redirectTo) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
  if (error) throw error
}

export { supabase }
