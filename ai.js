// src/lib/ai.js
// ── Morpheus CRM — Anthropic AI helpers ────────────────────────
// All three AI call types: scenario generation, caller roleplay,
// post-call scoring. Each writes nothing to DB — DB logging is
// handled by the callers in src/lib/db.js after the AI returns.

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY
const BASE_URL = 'https://api.anthropic.com/v1/messages'
const MODEL    = 'claude-sonnet-4-20250514'

async function claudePost(body) {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
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
/**
 * @param {string} transcriptText   Formatted full call transcript
 * @param {object} weights          { opening, listening, empathy, resolution, policy, closing }
 * @returns {{ opening, listening, empathy, resolution, policy, closing, total, feedback }}
 */
export async function scoreCall(transcriptText, weights = null) {
  const w = weights ?? {
    opening: 15, listening: 20, empathy: 20,
    resolution: 25, policy: 10, closing: 10,
  }

  const text = await claudePost({
    messages: [{
      role: 'user',
      content: `You are a QA evaluator for Certified Training Standards, a CX certification \
program. Evaluate the following call transcript against the scoring rubric.

TRANSCRIPT:
${transcriptText}

SCORING RUBRIC — score each category 0–100:
1. Opening / Greeting        (weight: ${w.opening}%)
   - Did the CSR professionally identify themselves and the company?
   - Was the greeting warm and inviting?

2. Active Listening           (weight: ${w.listening}%)
   - Did the CSR listen without interrupting?
   - Did they ask clarifying questions and confirm understanding?

3. Empathy & Tone             (weight: ${w.empathy}%)
   - Did the CSR acknowledge the caller's feelings?
   - Was the tone calm, professional, and genuine throughout?

4. Problem Resolution         (weight: ${w.resolution}%)
   - Did the CSR identify the root issue?
   - Was a clear, complete solution offered and confirmed?

5. Policy Adherence           (weight: ${w.policy}%)
   - Did the CSR follow proper procedures?
   - Were no unauthorized promises made?

6. Closing                    (weight: ${w.closing}%)
   - Did the CSR summarize the resolution?
   - Was caller satisfaction confirmed before sign-off?

Compute weighted total:
total = (opening × ${w.opening/100}) + (listening × ${w.listening/100}) + \
(empathy × ${w.empathy/100}) + (resolution × ${w.resolution/100}) + \
(policy × ${w.policy/100}) + (closing × ${w.closing/100})
Round total to nearest integer.

Return ONLY a JSON object. No markdown, no preamble:
{
  "opening":    0-100,
  "listening":  0-100,
  "empathy":    0-100,
  "resolution": 0-100,
  "policy":     0-100,
  "closing":    0-100,
  "total":      0-100,
  "feedback":   "3-4 sentence narrative feedback written directly to the participant — \
acknowledge strengths, identify the single most important area to improve, \
and end with an encouraging note appropriate for a workforce development program"
}`,
    }],
  })
  return JSON.parse(text.replace(/```json|```/g, '').trim())
}
