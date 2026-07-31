// src/modules/cx/generateCXPlan.ts
// ── Morpheus CRM — CX improvement plan generation ──────────────
// Batches unprocessed cx_feedback_entries, sends them to Claude with
// the NYSBDC starter prompt as the system prompt, and writes the
// structured result to cx_improvement_plans as status: 'draft'.
//
// A plan NEVER lands as anything but a draft. That is enforced in
// three places: this file writes 'draft' literally, the RLS insert
// policy requires status = 'draft' for non-super_admins, and a
// RESTRICTIVE policy backstops both (schema.sql §6). Promotion out
// of draft happens only through CXReviewPanel.tsx.
//
// All AI calls route through /api/claude — the serverless proxy that
// holds ANTHROPIC_API_KEY server-side. Same path src/lib/ai.js uses.

import { supabase } from '../../lib/supabase.js'
import {
  getUnprocessedFeedback,
  markFeedbackProcessed,
  type CXFeedbackEntry,
} from './submitFeedback.js'

const BASE_URL = '/api/claude'

export const CX_MODEL = 'claude-opus-5'

/** Bumped whenever NYSBDC_CX_STARTER_PROMPT changes, so plans stay traceable. */
export const CX_PROMPT_VERSION = 'nysbdc-starter-v1'

// ── System prompt ──────────────────────────────────────────────

/**
 * ⚠️ PLACEHOLDER — REPLACE WITH THE VERBATIM NYSBDC STARTER PROMPT.
 *
 * The spec calls for "the exact NYSBDC starter prompt" as the system
 * prompt. That text is not in this repository and was not supplied,
 * so what follows is a stand-in written to the same brief: NYSBDC
 * (New York State Small Business Development Center) CX advisory
 * framing for a workforce-development training provider.
 *
 * It is isolated in this one constant precisely so swapping it is a
 * single-line change with no other edits. When you paste the real
 * text in, bump CX_PROMPT_VERSION above so existing draft plans
 * remain attributable to the prompt that produced them.
 */
export const NYSBDC_CX_STARTER_PROMPT = `You are a customer experience advisor working in the New York State \
Small Business Development Center (NYSBDC) advisory tradition: practical, \
evidence-led, and focused on changes a small organization can actually \
execute with the staff and budget it already has.

Your client is Certified Training Standards (CTS), a CX certification \
program in Albany, NY. CTS trains customer-service representatives drawn \
from workforce development pipelines — LDSS Albany, LDSS Schenectady, \
reentry and formerly incarcerated participants, and direct enrollment. \
Participants run AI-powered mock calls, are scored against a six-category \
rubric (opening, active listening, empathy, problem resolution, policy \
adherence, closing), and certify once they clear the program threshold.

You will be given a batch of feedback entries collected from participants, \
trainers, and program partners. Analyze the batch and produce a CX \
improvement plan.

Ground rules:
- Every theme and every recommendation must be traceable to the feedback \
  provided. Do not introduce findings the batch does not support.
- Recommendations must be specific and ownable: name the change, who acts \
  on it, and what success looks like. "Improve communication" is not a \
  recommendation; "add a 5-minute pre-call briefing to the trainer script \
  covering escalation policy" is.
- Weigh feedback volume honestly. Say when a theme rests on one or two \
  entries rather than presenting it with the same confidence as a pattern \
  seen across the batch.
- Respect the population. These are adults rebuilding careers, several \
  through reentry programs. Frame findings around program and process \
  gaps, never around participant deficiency.
- Feedback text has already been stripped of contact details. If any \
  personal identifier still appears, do not repeat it in your output.
- Prioritize by impact against effort. A small organization can absorb a \
  handful of changes per cycle, not twenty.`

// ── Structured output schema ───────────────────────────────────

/**
 * Constrains the response to exactly the shape cx_improvement_plans
 * stores. Structured outputs guarantee valid JSON against this
 * schema, so no salvage-parsing of a text blob.
 */
export const CX_PLAN_SCHEMA = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description: 'Short plan title naming the period and focus, e.g. "Q3 Intake & Escalation Gaps".',
    },
    executive_summary: {
      type: 'string',
      description: '3-5 sentences a program director can read on their own and act on.',
    },
    themes: {
      type: 'array',
      description: 'Patterns found in the batch, most significant first.',
      items: {
        type: 'object',
        properties: {
          name:            { type: 'string' },
          description:     { type: 'string' },
          sentiment:       { type: 'string', enum: ['positive', 'neutral', 'negative', 'mixed'] },
          entry_count:     { type: 'integer', description: 'How many entries in the batch support this theme.' },
          representative_quotes: {
            type: 'array',
            description: 'Up to 3 short excerpts, quoted from the batch verbatim.',
            items: { type: 'string' },
          },
        },
        required: ['name', 'description', 'sentiment', 'entry_count', 'representative_quotes'],
        additionalProperties: false,
      },
    },
    recommendations: {
      type: 'array',
      description: 'Concrete actions, ordered by impact against effort.',
      items: {
        type: 'object',
        properties: {
          action:          { type: 'string', description: 'The specific change to make.' },
          rationale:       { type: 'string', description: 'Which theme this addresses and why it will help.' },
          owner_role:      { type: 'string', enum: ['super_admin', 'trainer', 'program_partner'] },
          priority:        { type: 'string', enum: ['high', 'medium', 'low'] },
          effort:          { type: 'string', enum: ['low', 'medium', 'high'] },
          success_signal:  { type: 'string', description: 'What observable change means this worked.' },
        },
        required: ['action', 'rationale', 'owner_role', 'priority', 'effort', 'success_signal'],
        additionalProperties: false,
      },
    },
    metrics: {
      type: 'array',
      description: 'Measures to track over the next cycle.',
      items: {
        type: 'object',
        properties: {
          name:            { type: 'string' },
          current_state:   { type: 'string', description: 'What the batch says today, or "not measured".' },
          target:          { type: 'string' },
          measurement:     { type: 'string', description: 'How CTS would actually measure this.' },
        },
        required: ['name', 'current_state', 'target', 'measurement'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'executive_summary', 'themes', 'recommendations', 'metrics'],
  additionalProperties: false,
} as const

// ── Types ──────────────────────────────────────────────────────

export interface CXTheme {
  name: string
  description: string
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed'
  entry_count: number
  representative_quotes: string[]
}

export interface CXRecommendation {
  action: string
  rationale: string
  owner_role: 'super_admin' | 'trainer' | 'program_partner'
  priority: 'high' | 'medium' | 'low'
  effort: 'low' | 'medium' | 'high'
  success_signal: string
}

export interface CXMetric {
  name: string
  current_state: string
  target: string
  measurement: string
}

export interface CXPlanContent {
  title: string
  executive_summary: string
  themes: CXTheme[]
  recommendations: CXRecommendation[]
  metrics: CXMetric[]
}

export interface CXImprovementPlan extends CXPlanContent {
  id: string
  org_id: string
  cohort_id: string | null
  status: 'draft' | 'approved' | 'published' | 'archived'
  period_start: string | null
  period_end: string | null
  feedback_count: number
  source_feedback_ids: string[]
  model: string | null
  prompt_version: string | null
  generated_by: string | null
  generated_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  published_at: string | null
  archived_at: string | null
  review_notes: string | null
  created_at: string
  updated_at: string
}

export interface GeneratePlanOptions {
  orgId: string
  cohortId?: string | null
  /** Only batch feedback submitted at or after this ISO timestamp. */
  since?: string
  /** Cap on entries per batch. Defaults to 200. */
  limit?: number
  /**
   * Feed a specific batch instead of querying for unprocessed rows.
   * Used by the review panel's regenerate flow.
   */
  entries?: CXFeedbackEntry[]
}

/** Thrown when there is nothing to summarize, so callers can branch on it. */
export class NoFeedbackError extends Error {
  constructor(message = 'No unprocessed feedback to generate a plan from.') {
    super(message)
    this.name = 'NoFeedbackError'
  }
}

// ── Anthropic call ─────────────────────────────────────────────

interface ClaudeContentBlock {
  type: string
  text?: string
}

interface ClaudeResponse {
  content?: ClaudeContentBlock[]
  stop_reason?: string
  model?: string
  error?: { message?: string }
}

/** Renders the batch into the user turn. IDs are included so the model can count. */
function formatBatch(entries: CXFeedbackEntry[]): string {
  return entries
    .map((e, i) => {
      const parts = [
        `[${i + 1}] ${e.submitted_at.slice(0, 10)} · channel: ${e.channel}`,
        e.rating != null ? `rating: ${e.rating}/5` : null,
        e.topic_tags.length ? `tags: ${e.topic_tags.join(', ')}` : null,
      ].filter(Boolean).join(' · ')
      return `${parts}\n${e.comment}`
    })
    .join('\n\n---\n\n')
}

/**
 * Calls Claude and returns the validated plan content.
 *
 * Exported separately from generateCXPlan so the model call can be
 * exercised without writing to the database.
 */
export async function requestCXPlan(entries: CXFeedbackEntry[]): Promise<CXPlanContent> {
  if (entries.length === 0) throw new NoFeedbackError()

  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CX_MODEL,
      max_tokens: 16000,
      system: NYSBDC_CX_STARTER_PROMPT,
      output_config: {
        // Guarantees the response text parses against CX_PLAN_SCHEMA.
        format: { type: 'json_schema', schema: CX_PLAN_SCHEMA },
        // 'medium' keeps the round trip inside the serverless function's
        // maxDuration (see vercel.json). Raise to 'high' if you also
        // raise that ceiling.
        effort: 'medium',
      },
      messages: [{
        role: 'user',
        content:
          `Here are ${entries.length} CX feedback entries to analyze.\n\n` +
          `${formatBatch(entries)}\n\n` +
          `Produce the CX improvement plan.`,
      }],
    }),
  })

  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Anthropic API error ${res.status}: ${detail}`)
  }

  const data: ClaudeResponse = await res.json()
  if (data.error) throw new Error(`Anthropic API error: ${data.error.message ?? 'unknown'}`)

  // Thinking is on by default on Opus 5, so the text block is not
  // necessarily content[0].
  const text = data.content?.find(b => b.type === 'text')?.text
  if (!text) {
    throw new Error(
      `Anthropic returned no text block (stop_reason: ${data.stop_reason ?? 'unknown'}). ` +
      `If stop_reason is 'max_tokens', the batch is too large — lower the limit and retry.`,
    )
  }

  return JSON.parse(text) as CXPlanContent
}

// ── Generation + persistence ───────────────────────────────────

/**
 * Full pipeline: batch → Claude → cx_improvement_plans (draft).
 *
 * Ordering matters. The plan row is written first and the feedback
 * is only marked processed afterwards, so a failure at any earlier
 * step leaves the batch untouched and available for the next run.
 * The reverse order would silently burn feedback on a failed write.
 */
export async function generateCXPlan(options: GeneratePlanOptions): Promise<CXImprovementPlan> {
  const entries = options.entries ?? await getUnprocessedFeedback({
    orgId:    options.orgId,
    cohortId: options.cohortId ?? undefined,
    since:    options.since,
    limit:    options.limit,
  })

  if (entries.length === 0) throw new NoFeedbackError()

  const content = await requestCXPlan(entries)

  // Batch window, derived from the entries themselves.
  const dates = entries.map(e => e.submitted_at).sort()
  const periodStart = dates[0].slice(0, 10)
  const periodEnd   = dates[dates.length - 1].slice(0, 10)

  const { data: { user } } = await supabase.auth.getUser()
  const feedbackIds = entries.map(e => e.id)

  const { data: plan, error } = await supabase
    .from('cx_improvement_plans')
    .insert({
      org_id:              options.orgId,
      cohort_id:           options.cohortId ?? null,
      title:               content.title,
      status:              'draft',          // never anything else from this path
      period_start:        periodStart,
      period_end:          periodEnd,
      feedback_count:      entries.length,
      source_feedback_ids: feedbackIds,
      executive_summary:   content.executive_summary,
      themes:              content.themes,
      recommendations:     content.recommendations,
      metrics:             content.metrics,
      model:               CX_MODEL,
      prompt_version:      CX_PROMPT_VERSION,
      generated_by:        user?.id ?? null,
      generated_at:        new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw error

  await markFeedbackProcessed(feedbackIds, plan.id)

  return plan as CXImprovementPlan
}

// ── Reads for the review panel ─────────────────────────────────

export interface ListPlansQuery {
  orgId?: string
  status?: Array<'draft' | 'approved' | 'published' | 'archived'>
  limit?: number
}

/** RLS scopes this to the caller's orgs; orgId only narrows further. */
export async function listCXPlans(query: ListPlansQuery = {}): Promise<CXImprovementPlan[]> {
  let q = supabase
    .from('cx_improvement_plans')
    .select('*')
    .order('generated_at', { ascending: false })
    .limit(query.limit ?? 50)

  if (query.orgId) q = q.eq('org_id', query.orgId)
  if (query.status?.length) q = q.in('status', query.status)

  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as CXImprovementPlan[]
}

export type CXPlanStatus = 'draft' | 'approved' | 'published' | 'archived'

/**
 * Move a plan's status. Only a super_admin of the owning org can do
 * this — enforced by RLS, not here (schema.sql §6). The UI gate in
 * CXReviewPanel.tsx is the convenience layer; this is where a caller
 * that bypassed the UI still gets stopped.
 *
 * RLS denial arrives in TWO different shapes, and both have to be
 * normalized or the caller will misread one of them:
 *
 *   - Postgres error 42501. The row was visible to the UPDATE (the
 *     member policy's USING passed) but the result row failed its
 *     WITH CHECK. This is the ordinary trainer-tries-to-approve
 *     case: a hard error.
 *   - An empty row set, no error. The row was never visible in the
 *     first place — e.g. a super_admin of a different org. PostgREST
 *     reports this as a successful update of nothing, which reads
 *     like a no-op unless we catch it.
 */
export async function updatePlanStatus(
  planId: string,
  status: CXPlanStatus,
  reviewNotes?: string | null,
): Promise<CXImprovementPlan> {
  const patch: Record<string, unknown> = { status }
  if (reviewNotes !== undefined) patch.review_notes = reviewNotes

  const denied =
    `Not permitted: moving a CX plan to "${status}" requires super_admin on the ` +
    `owning organization. The change was rejected at the database layer.`

  const { data, error } = await supabase
    .from('cx_improvement_plans')
    .update(patch)
    .eq('id', planId)
    .select()

  if (error) {
    if (error.code === '42501' || /row-level security/i.test(error.message)) {
      throw new Error(denied)
    }
    throw error
  }
  if (!data || data.length === 0) throw new Error(denied)

  return data[0] as CXImprovementPlan
}

/** The feedback entries a plan was generated from. */
export async function getPlanSourceFeedback(plan: CXImprovementPlan): Promise<CXFeedbackEntry[]> {
  if (!plan.source_feedback_ids?.length) return []

  const { data, error } = await supabase
    .from('cx_feedback_entries')
    .select('*')
    .in('id', plan.source_feedback_ids)
    .order('submitted_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as CXFeedbackEntry[]
}
