// api/claude.js
// ── Morpheus OS — Secure Anthropic proxy (Vercel serverless) ────
// The Anthropic API key lives ONLY here, server-side, read from
// process.env.ANTHROPIC_API_KEY (no VITE_ prefix — never bundled
// into the browser). The frontend calls /api/claude instead of
// calling Anthropic directly.
//
// SECURITY (2026-10-19): this route spends CTS money on every call, so it
//   1. requires a signed-in Morpheus participant, trainer or super_admin
//      (Supabase access token, verified with Supabase Auth — not just decoded),
//   2. only forwards an allowlisted model and caps max_tokens,
//   3. forwards only the fields Morpheus uses (model, max_tokens, system,
//      messages, temperature) — nothing else from the browser reaches Anthropic,
//   4. caps request size and rate per user (best effort, per warm instance;
//      the Vercel WAF rate-limit rule on /api/* is the hard limit).

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL ||
  'https://ymavrmekxiwdphdyteau.supabase.co').replace(/\/$/, '')
// Public browser key (same value the site already ships). Used only to ask
// Supabase Auth "who owns this token?".
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InltYXZybWVreGl3ZHBoZHl0ZWF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4Mjg0MDIsImV4cCI6MjA5ODQwNDQwMn0.EdXN9Bw90VuhFTmTnCK11woGBX1dS30H_jewetwuWi0'

const AI_ROLES = new Set(['participant', 'trainer', 'super_admin'])
const ALLOWED_MODELS = new Set(['claude-sonnet-5-5'])
const DEFAULT_MODEL = 'claude-sonnet-5-5'
const MAX_TOKENS_CAP = 3000
const MAX_BODY_CHARS = 60_000          // ~15k tokens of prompt
const RATE_LIMIT = 30                  // requests…
const RATE_WINDOW_MS = 10 * 60 * 1000  // …per user per 10 minutes

const hits = new Map() // userId -> [timestamps]; resets when the instance recycles

function rateLimited(userId) {
  const now = Date.now()
  const recent = (hits.get(userId) || []).filter((t) => now - t < RATE_WINDOW_MS)
  recent.push(now)
  hits.set(userId, recent)
  return recent.length > RATE_LIMIT
}

async function verifyUser(req) {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return null
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
    })
    if (!r.ok) return null
    const user = await r.json()
    // Role comes from app_metadata (server-set), never user_metadata (user-editable).
    // Public sign-up is open for Legacy Path customers; they do not get AI access.
    const role = user?.app_metadata?.role
    return user?.id && AI_ROLES.has(role) ? user : null
  } catch {
    return null
  }
}

function buildUpstreamBody(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.messages) || body.messages.length === 0) {
    return null
  }
  const model = ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_MODEL
  const requested = Number(body.max_tokens) || 1000
  const out = {
    model,
    max_tokens: Math.min(Math.max(requested, 1), MAX_TOKENS_CAP),
    messages: body.messages,
  }
  if (typeof body.system === 'string') out.system = body.system
  if (typeof body.temperature === 'number') out.temperature = body.temperature
  return out
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({
      error: 'Server misconfigured: ANTHROPIC_API_KEY is not set in Vercel environment variables.',
    })
  }

  const user = await verifyUser(req)
  if (!user) {
    return res.status(401).json({ error: 'Sign in with a Morpheus training or staff account to use AI features.' })
  }

  if (rateLimited(user.id)) {
    return res.status(429).json({ error: 'Too many AI requests. Please wait a few minutes and try again.' })
  }

  const upstreamBody = buildUpstreamBody(req.body)
  if (!upstreamBody) {
    return res.status(400).json({ error: 'Request must include a messages array.' })
  }
  const serialized = JSON.stringify(upstreamBody)
  if (serialized.length > MAX_BODY_CHARS) {
    return res.status(413).json({ error: 'Request too large.' })
  }

  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: serialized,
    })

    const data = await upstream.json()

    // Anthropic states the reason for a rejection in the response body.
    // Log it: the browser turns any failure into one generic sentence, so
    // without this line an upstream 400 leaves no record of its cause
    // anywhere. The body carries no key or prompt content — just the
    // error type, message and request_id.
    if (!upstream.ok) {
      console.error(
        `[api/claude] Anthropic returned ${upstream.status} for user ${user.id}:`,
        JSON.stringify(data?.error ?? data),
      )
    }

    return res.status(upstream.status).json(data)
  } catch (err) {
    console.error('[api/claude] proxy error:', err.message)
    return res.status(502).json({ error: 'AI service is temporarily unavailable.' })
  }
}
