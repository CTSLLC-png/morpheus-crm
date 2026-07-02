// api/claude.js
// ── Morpheus OS — Secure Anthropic proxy (Vercel serverless) ────
// The Anthropic API key lives ONLY here, server-side, read from
// process.env.ANTHROPIC_API_KEY (no VITE_ prefix — never bundled
// into the browser). The frontend calls /api/claude instead of
// calling Anthropic directly.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

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

  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    })

    const data = await upstream.json()
    return res.status(upstream.status).json(data)
  } catch (err) {
    return res.status(502).json({ error: `Proxy error: ${err.message}` })
  }
}
