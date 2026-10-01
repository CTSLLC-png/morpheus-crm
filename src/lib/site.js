// src/lib/site.js
// ── The canonical public address of MorpheusOS ────────────────
// One place, because this string ends up in three kinds of place that must
// agree: printed on credentials, sent to Supabase as an auth redirect, and
// shown in the app chrome. When the domain changes, it changes here.
//
// The apex (morpheuscr.com) redirects to www at the edge — see vercel.json —
// so www is the address every link, certificate and redirect should carry.

export const SITE_URL = (import.meta.env?.VITE_APP_URL || 'https://www.morpheuscr.com')
  .replace(/\/$/, '')

/** The host on its own, for footers and brand lines. */
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, '')

/**
 * The public verification URL for a credential code.
 *
 * Deliberately built from SITE_URL rather than window.location.origin. A
 * certificate is a permanent artifact: one generated from a Vercel preview
 * deploy would otherwise be stamped with a preview hostname that stops
 * resolving, and the credential registry it points at is the same production
 * database in every environment.
 */
export function verifyUrlFor(credentialCode) {
  return `${SITE_URL}/verify/${credentialCode}`
}
