// src/lib/ai.js
// ── Morpheus CRM — Anthropic AI helpers ────────────────────────
// All three AI call types: scenario generation, caller roleplay,
// post-call scoring. Each writes nothing to DB — DB logging is
// handled by the callers in src/lib/db.js after the AI returns.

// All AI calls route through the secure serverless proxy at
// /api/claude — the Anthropic API key never reaches the browser.
const BASE_URL = '/api/claude'

// Model IDs are retired on a published schedule, and every request to a
// retired ID fails — the whole simulator goes down on a date, not on a
// deploy. The previous value here (Claude Sonnet 4) was retired on
// 15 June 2026, which is what broke scenario generation.
// Check before changing, and when the simulator breaks for no reason:
// https://platform.claude.com/docs/en/about-claude/model-deprecations
const MODEL    = 'claude-sonnet-5'

async function claudePost(body) {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 1000, ...body }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic API error ${res.status}: ${err}`)
  }
  const data = await res.json()
  return data.content.map(b => b.text ?? '').join('')
}

// ── 1. Generate call scenario ──────────────────────────────────
/**
 * @param {string} scenarioType  e.g. "Billing dispute – frustrated customer"
 * @param {string} difficulty    "Beginner" | "Intermediate" | "Advanced"
 * @returns {{ brief, caller_name, opening_line }}
 */
export async function generateScenario(scenarioType, difficulty) {
  const text = await claudePost({
    messages: [{
      role: 'user',
      content: `You are a training scenario designer for Certified Training Standards, a CX \
certification program in Albany NY that serves workforce development participants, including \
reentry individuals from LDSS Albany, LDSS Schenectady, and incarcerated/reentry programs.

Generate a realistic customer service inbound call scenario for a CSR trainee.
Scenario type: "${scenarioType}"
Difficulty: "${difficulty}"

Difficulty guidance:
- Beginner: Caller is patient, issue is simple and clear
- Intermediate: Caller is mildly frustrated, issue requires some problem-solving
- Advanced: Caller is angry or escalating, issue is complex or ambiguous

Return ONLY a JSON object. No markdown, no preamble:
{
  "brief": "2-3 sentence scenario brief describing the situation the CSR is walking into",
  "caller_name": "realistic first name for the caller",
  "opening_line": "first words the caller says when CSR picks up — 1-2 sentences, emotionally appropriate for difficulty level"
}`,
    }],
  })
  return JSON.parse(text.replace(/```json|```/g, '').trim())
}

// ── 2. AI caller roleplay reply ────────────────────────────────
/**
 * @param {object} scenario   { brief, caller_name }
 * @param {Array}  history    [{role:'user'|'assistant', content}]
 * @returns {string}  caller's next reply
 */
export async function getCallerReply(scenario, history) {
  return claudePost({
    system: `You are roleplaying as a customer named ${scenario.caller_name} calling a \
customer service line. Scenario: ${scenario.brief}

Rules:
- Stay fully in character as the caller at all times
- React authentically: if the CSR is helpful and empathetic, gradually warm up; \
if dismissive or robotic, escalate frustration
- Keep responses to 2-4 sentences
- Do not break character, acknowledge this is training, or offer meta-commentary
- Do not resolve the issue yourself — let the CSR lead`,
    messages: history,
  })
}

// ── 3. Post-call AI scoring ────────────────────────────────────

/** Governance floors. A breach fails the call regardless of weighted score. */
export const FLOOR_CODES = ['verification_not_completed', 'prohibited_data_recorded']

const CATEGORY_KEYS = ['opening', 'listening', 'empathy', 'resolution', 'policy', 'closing']

/**
 * Score one call against the ratified rubric.
 *
 * The model judges the six categories and screens for the two governance
 * floors; it is NOT asked to compute the weighted total. Arithmetic embedded
 * in generated prose is the soft ground this programme's own Module 1 warns
 * about, and a certification decision should not rest on it — so the total is
 * computed here from the returned category scores and the live weights.
 *
 * @param {string} transcriptText  Formatted full call transcript
 * @param {object} weights         Live weights from score_matrix_weights.
 *   Required in assessment contexts: passing nothing falls back to the
 *   ratified defaults and silently ignores any cohort override.
 * @returns {{opening,listening,empathy,resolution,policy,closing,total,
 *            feedback, floors: Array<{code,evidence}>, passed: boolean}}
 */
export async function scoreCall(transcriptText, weights = null) {
  const w = weights ?? {
    opening: 15, listening: 20, empathy: 20,
    resolution: 25, policy: 10, closing: 10,
  }

  const text = await claudePost({
    max_tokens: 1600,
    messages: [{
      role: 'user',
      content: `You are a QA evaluator for Certified Training Standards, a CX certification \
program. Evaluate the following call transcript against the scoring rubric.

TRANSCRIPT:
${transcriptText}

SCORING RUBRIC — score each category 0-100:
1. Opening / Greeting (weight ${w.opening}%) — professional self and company identification; warm, unhurried greeting.
2. Active Listening (weight ${w.listening}%) — no interruptions; clarifying questions; understanding confirmed aloud.
3. Empathy & Tone (weight ${w.empathy}%) — specific acknowledgement of the caller's situation; calm, genuine, not formulaic.
4. Problem Resolution (weight ${w.resolution}%) — root issue identified; clear action taken or routed; confirmed with the caller.
5. Policy Adherence (weight ${w.policy}%) — procedures followed; no unauthorised promises.
6. Closing (weight ${w.closing}%) — resolution summarised; next step with a date; satisfaction checked; warm close.

Use the full range. 80+ means proficient, 60-79 developing, below 60 unsatisfactory.
Do NOT compute a total; the system computes it.

GOVERNANCE FLOORS — screen separately from the scores:
- "verification_not_completed": the representative discussed account details, or made an
  account change, without completing identity verification. A factor the CALLER volunteered
  unprompted does not count as verification. If the scenario involved no account access at
  all, this floor does not apply.
- "prohibited_data_recorded": the representative accepted a full card number or similar
  restricted identifier into a note, ticket, or free-text field, rather than redirecting to
  a secure step.

Report a floor ONLY when the transcript shows it plainly. Do not infer a breach from silence
or from an incomplete transcript — a wrongly failed candidate is a real harm, and absence of
evidence is not evidence of a breach. When unsure, report no floor and raise the concern in
the feedback instead.

Return ONLY a JSON object. No markdown, no preamble:
{
  "opening": 0-100,
  "listening": 0-100,
  "empathy": 0-100,
  "resolution": 0-100,
  "policy": 0-100,
  "closing": 0-100,
  "floors": [ { "code": "verification_not_completed" | "prohibited_data_recorded",
                "evidence": "the specific line or exchange that shows it" } ],
  "feedback": "3-4 sentences written directly to the participant — acknowledge strengths, \
name the single most important thing to improve, and end with an encouraging note \
appropriate for a workforce development programme. If a floor was reported, say plainly \
what happened and that the call must be retaken."
}`,
    }],
  })

  const raw = JSON.parse(text.replace(/```json|```/g, '').trim())

  // Clamp and default anything the model returned oddly, so a malformed score
  // cannot silently become a pass.
  const scores = {}
  for (const k of CATEGORY_KEYS) {
    const n = Number(raw[k])
    scores[k] = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0
  }

  // Weighted total, computed here rather than by the model.
  const totalWeight = CATEGORY_KEYS.reduce((sum, k) => sum + (Number(w[k]) || 0), 0) || 100
  const total = Math.round(
    CATEGORY_KEYS.reduce((sum, k) => sum + scores[k] * (Number(w[k]) || 0), 0) / totalWeight,
  )

  const floors = Array.isArray(raw.floors)
    ? raw.floors
        .filter(f => f && FLOOR_CODES.includes(f.code))
        .map(f => ({ code: f.code, evidence: String(f.evidence ?? '').slice(0, 500) }))
    : []

  return {
    ...scores,
    total,
    feedback: String(raw.feedback ?? ''),
    floors,
    // A floor breach fails the call outright — the weighted score does not
    // rescue it. Only an administrator can lift one, and the database records
    // who did it and why (see enforce_admin_floor_override).
    passed: floors.length === 0 && total >= 80,
  }
}
