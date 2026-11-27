// src/modules/studio/renderQueue.js
// ── Creator Studio render queue: pure helpers (no Supabase), so they can be
//    tested with node --test. The database checks the same rules.

/** Same rule as the studio_render_job.script check and tools/video/queue.mjs. */
export const SCRIPT_NAME = /^[a-z0-9][a-z0-9-]{0,79}$/

/**
 * Scripts in tools/video/scripts on main, offered as suggestions. A name not
 * listed here can still be queued; the worker fails the job if it is missing.
 * Keep in step with that folder.
 */
export const KNOWN_SCRIPTS = ['legacy-path-explainer']

export const RENDER_STATUSES = ['queued', 'running', 'done', 'failed', 'cancelled']

/** Accepts "name", "name.json" or "scripts/name.json"; returns the bare name or null. */
export function cleanScriptName(input) {
  const name = String(input ?? '').trim().toLowerCase()
    .replace(/^(tools\/video\/)?scripts\//, '').replace(/\.json$/, '')
  return SCRIPT_NAME.test(name) ? name : null
}

/** Turns database refusals into sentences for staff. */
export function renderJobError(error) {
  if (error?.code === '23505') return 'That script is already queued or rendering for this project.'
  if (error?.code === '23514' && /queue is full/i.test(error.message ?? '')) return error.message
  if (error?.code === '42501') return 'Only Creator Studio staff can queue renders.'
  return error?.message ?? 'Could not queue the render.'
}

/** How long a job has waited or took, for the queue list. */
export function jobTiming(job, now = Date.now()) {
  const mins = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000))
  if (job.status === 'queued') return `waiting ${mins(job.requested_at, now)} min`
  if (job.status === 'running') return `rendering ${mins(job.claimed_at ?? job.requested_at, now)} min`
  if (job.finished_at && job.claimed_at) return `took ${mins(job.claimed_at, job.finished_at)} min`
  return ''
}
