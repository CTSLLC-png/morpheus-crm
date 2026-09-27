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

// ── Campaign attribution ─────────────────────────────────────────────────
// Mirrors public/legacy/attribution.js (same key and shape) so visitors who
// land straight on /signin from a campaign link are counted too.
const ATTR_KEY = 'lp_attr_v1'
const ATTR_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000
const clip = (v, n) => (v ? String(v).slice(0, n) : null)

/** Remembers this visit's UTM tags in the browser (first touch wins). */
export function captureAttribution() {
  try {
    const q = new URLSearchParams(window.location.search)
    const ref = document.referrer ? new URL(document.referrer).hostname : null
    const external = ref && ref !== window.location.hostname
    const tagged = !!q.get('utm_source') || !!external
    const prev = JSON.parse(window.localStorage.getItem(ATTR_KEY) || 'null')
    const fresh = prev && Date.now() - (prev.t || 0) < ATTR_MAX_AGE_MS
    if (fresh && (prev.utm_source || prev.referrer_host || !tagged)) return
    window.localStorage.setItem(ATTR_KEY, JSON.stringify({
      utm_source: clip(q.get('utm_source'), 80),
      utm_medium: clip(q.get('utm_medium'), 80),
      utm_campaign: clip(q.get('utm_campaign'), 80),
      utm_content: clip(q.get('utm_content'), 80),
      utm_term: clip(q.get('utm_term'), 80),
      referrer_host: external ? clip(ref, 253) : null,
      landing_path: clip(window.location.pathname, 200),
      t: Date.now(),
    }))
  } catch { /* storage blocked: attribution is best-effort */ }
}

/**
 * Writes the stored first touch to lp_attribution once per account. A
 * duplicate (23505) means it was already recorded; any other failure is
 * ignored so attribution can never block someone from using the app.
 */
export async function recordAttribution(uid) {
  let a
  try { a = JSON.parse(window.localStorage.getItem(ATTR_KEY) || 'null') } catch { return }
  if (!a || a.recorded === uid) return
  const { error } = await supabase.from('lp_attribution').insert({
    user_id: uid,
    utm_source: a.utm_source, utm_medium: a.utm_medium, utm_campaign: a.utm_campaign,
    utm_content: a.utm_content, utm_term: a.utm_term,
    referrer_host: a.referrer_host, landing_path: a.landing_path,
    first_seen_at: a.t ? new Date(a.t).toISOString() : null,
  })
  if (!error || error.code === '23505') {
    try { window.localStorage.setItem(ATTR_KEY, JSON.stringify({ ...a, recorded: uid })) } catch { /* ignore */ }
  }
}

export { supabase }
