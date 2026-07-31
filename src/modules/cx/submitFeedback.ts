// src/modules/cx/submitFeedback.ts
// ── Morpheus CRM — CX feedback intake ──────────────────────────
// Writes to cx_feedback_entries. RLS (see schema.sql §6) enforces
// org scoping — these helpers never filter by org themselves except
// where a caller explicitly narrows to one of their orgs.
//
// PII: the intake forms are the first line of defence — they are
// built to collect narrative feedback only and never ask for contact
// details. scrubPII() below is the SECOND layer: a defensive regex
// pass that runs on every comment before it reaches the database,
// for the case where someone types their email into a free-text box
// anyway. It is deliberately over-eager; a redacted phone number in
// a training-feedback comment costs nothing, an un-redacted one is
// a disclosure.

import { supabase } from '../../lib/supabase.js'

// ── Types ──────────────────────────────────────────────────────

export type CXChannel =
  | 'web_form'
  | 'post_call_survey'
  | 'trainer_intake'
  | 'email'
  | 'phone'
  | 'in_person'
  | 'import'

export type CXSentiment = 'positive' | 'neutral' | 'negative' | 'mixed'

export interface CXFeedbackEntry {
  id: string
  org_id: string
  participant_id: string | null
  cohort_id: string | null
  channel: CXChannel
  submitted_at: string
  submitted_by: string | null
  comment: string
  rating: number | null
  sentiment: CXSentiment | null
  topic_tags: string[]
  pii_scrubbed: boolean
  pii_redaction_count: number
  processed_at: string | null
  processed_plan_id: string | null
  source_metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface SubmitFeedbackInput {
  orgId: string
  comment: string
  channel?: CXChannel
  rating?: number | null
  participantId?: string | null
  cohortId?: string | null
  sentiment?: CXSentiment | null
  topicTags?: string[]
  sourceMetadata?: Record<string, unknown>
}

export interface ScrubResult {
  /** The comment with every match replaced by its redaction token. */
  text: string
  /** Total replacements made across all rules. */
  count: number
  /** Per-rule counts, e.g. { email: 1, phone: 2 }. */
  byKind: Record<string, number>
}

// ── PII scrubbing ──────────────────────────────────────────────

export const EMAIL_TOKEN = '[email redacted]'
export const PHONE_TOKEN = '[phone redacted]'

/**
 * Redaction rules, applied IN ORDER. Email must run before phone:
 * an address like `caseworker.5185550100@example.com` contains a
 * digit run the phone rule would otherwise chew a hole in, leaving
 * a mangled but still-identifying fragment behind.
 *
 * Add a rule here to extend the pass — nothing else needs to change.
 */
// Each rule carries its own replacer rather than a plain string,
// because the rules differ in arity: the phone pattern captures a
// leading boundary character that has to be put back, the email
// pattern captures nothing. A shared string replacement would have
// to guess which trailing `replace()` argument is the capture and
// which is the match offset.
// Replacer args are (match, ...captures, offset, subject) — the arity
// varies per rule, so each replacer reads only the leading positions
// it declares and ignores the rest.
type Replacer = (...args: any[]) => string

const REDACTION_RULES: Array<{ kind: string; pattern: RegExp; replace: Replacer }> = [
  {
    kind: 'email',
    // Local part per RFC 5322's common subset; TLD of 2+ letters.
    pattern: /[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,
    replace: () => EMAIL_TOKEN,
  },
  {
    kind: 'phone',
    // International, anchored on the leading '+'. Digit grouping
    // varies far too much by country to enumerate (+44 20 7946 0958
    // is 2-4-4, not the NANP 3-3-4), so this rule keys off the '+'
    // marker instead, which keeps false positives low.
    pattern: /(^|[^\d])\+\d[\d .\-()]{6,17}\d(?!\d)/g,
    replace: (_match: string, boundary: string) => boundary + PHONE_TOKEN,
  },
  {
    kind: 'phone',
    // NANP: optional country code, optional (area), separators of
    // space / dot / hyphen. The leading capture is a non-digit
    // boundary so we do not bite into the middle of a longer digit
    // run; it is re-emitted verbatim.
    pattern: /(^|[^\d])(?:\+?\d{1,3}[ .\-]?)?(?:\(\d{3}\)|\d{3})[ .\-]?\d{3}[ .\-]?\d{4}(?!\d)/g,
    replace: (_match: string, boundary: string) => boundary + PHONE_TOKEN,
  },
]

/**
 * Defensive PII pass. Second layer behind clean intake — see the
 * file header for why this exists even though the forms never ask
 * for contact details.
 *
 * Known tradeoff: the phone rule will also redact a bare 10-digit
 * reference number (an order ID, a case number typed without
 * separators). That is the intended failure direction. Anything that
 * must survive verbatim belongs in a typed column, not in free text.
 */
export function scrubPII(input: string): ScrubResult {
  let text = input
  let count = 0
  const byKind: Record<string, number> = {}

  for (const rule of REDACTION_RULES) {
    let hits = 0
    text = text.replace(rule.pattern, (...args: any[]) => {
      hits += 1
      return rule.replace(...args)
    })
    if (hits > 0) {
      // Accumulate — more than one rule can share a kind (phone has
      // an international rule and a NANP rule).
      byKind[rule.kind] = (byKind[rule.kind] ?? 0) + hits
      count += hits
    }
  }

  return { text, count, byKind }
}

// ── Org resolution ─────────────────────────────────────────────

/**
 * The orgs the signed-in user belongs to, read from org_members —
 * the same table RLS reads role from. Never derive org from
 * user_metadata: it is user-writable (see schema.sql §1).
 */
export async function getCurrentOrgIds(): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)

  if (error) throw error
  return (data ?? []).map((r: { org_id: string }) => r.org_id)
}

// ── Intake ─────────────────────────────────────────────────────

/**
 * Submit one piece of CX feedback.
 *
 * The comment is scrubbed before it leaves the browser, and the
 * scrub telemetry is stored alongside it: a row with
 * pii_redaction_count > 0 is a signal that an intake form is
 * collecting something it should not be, and is worth reviewing.
 */
export async function submitFeedback(input: SubmitFeedbackInput): Promise<CXFeedbackEntry> {
  const raw = (input.comment ?? '').trim()
  if (!raw) throw new Error('Feedback comment cannot be empty.')

  if (input.rating != null && (input.rating < 1 || input.rating > 5)) {
    throw new Error('Rating must be between 1 and 5.')
  }

  const scrub = scrubPII(raw)
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('cx_feedback_entries')
    .insert({
      org_id:              input.orgId,
      participant_id:      input.participantId ?? null,
      cohort_id:           input.cohortId ?? null,
      channel:             input.channel ?? 'web_form',
      submitted_at:        new Date().toISOString(),
      submitted_by:        user?.id ?? null,
      comment:             scrub.text,
      rating:              input.rating ?? null,
      sentiment:           input.sentiment ?? null,
      topic_tags:          input.topicTags ?? [],
      pii_scrubbed:        scrub.count > 0,
      pii_redaction_count: scrub.count,
      source_metadata:     input.sourceMetadata ?? {},
    })
    .select()
    .single()

  if (error) throw error
  return data as CXFeedbackEntry
}

// ── Batching ───────────────────────────────────────────────────

export interface UnprocessedQuery {
  /** Narrow to one org. Omit to let RLS return every org you belong to. */
  orgId?: string
  cohortId?: string
  /** ISO timestamp — only feedback submitted at or after this. */
  since?: string
  /** Max rows. Defaults to 200; the plan prompt gets unwieldy past that. */
  limit?: number
}

/**
 * Pull feedback that has not yet been folded into an improvement
 * plan (processed_at is null), oldest first so batches stay
 * chronological. Backed by idx_cx_feedback_unprocessed.
 *
 * This is the input to generateCXPlan().
 */
export async function getUnprocessedFeedback(
  query: UnprocessedQuery = {},
): Promise<CXFeedbackEntry[]> {
  let q = supabase
    .from('cx_feedback_entries')
    .select('*')
    .is('processed_at', null)
    .order('submitted_at', { ascending: true })
    .limit(query.limit ?? 200)

  if (query.orgId)    q = q.eq('org_id', query.orgId)
  if (query.cohortId) q = q.eq('cohort_id', query.cohortId)
  if (query.since)    q = q.gte('submitted_at', query.since)

  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as CXFeedbackEntry[]
}

/** How many entries are waiting, without pulling their text. */
export async function countUnprocessedFeedback(orgId?: string): Promise<number> {
  let q = supabase
    .from('cx_feedback_entries')
    .select('id', { count: 'exact', head: true })
    .is('processed_at', null)

  if (orgId) q = q.eq('org_id', orgId)

  const { count, error } = await q
  if (error) throw error
  return count ?? 0
}

/**
 * Mark a batch as consumed by a plan. Called by generateCXPlan()
 * after the plan row lands, so a failed generation leaves the
 * feedback available for the next run.
 *
 * The schema's cx_feedback_processed_consistent constraint requires
 * processed_at and processed_plan_id to be set together.
 */
export async function markFeedbackProcessed(
  feedbackIds: string[],
  planId: string,
): Promise<number> {
  if (feedbackIds.length === 0) return 0

  const { data, error } = await supabase
    .from('cx_feedback_entries')
    .update({
      processed_at:      new Date().toISOString(),
      processed_plan_id: planId,
    })
    .in('id', feedbackIds)
    .select('id')

  if (error) throw error
  return (data ?? []).length
}
