// Advisory-only Melrah dispatch analysis. No network, database writes, or automatic assignment.
// Works with the existing ml_dispatch_recommendations rows.
// Deterministic rules remain the authority; an LLM may summarize these results later.
const KNOWN = new Set(['ORGANICS_COFFEE', 'CANNABIS_PACKAGING'])
const CLOSED = new Set(['COMPLETED', 'CLOSED', 'CANCELLED'])
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x))

export function analyzeDispatchQueue(rows, now = new Date()) {
  if (!Array.isArray(rows)) return []
  const timestamp = new Date(now).getTime()
  return rows.filter(row => row && row.id && KNOWN.has(row.program_key))
    .filter(row => !CLOSED.has(String(row.status || '').toUpperCase()))
    .map(row => {
      const fill = Number(row.max_fill_pct)
      const hasFill = Number.isFinite(fill) && row.max_fill_pct != null
      const due = row.scheduled_for ? new Date(row.scheduled_for).getTime() : NaN
      const overdue = Number.isFinite(due) && Number.isFinite(timestamp) && due < timestamp
      const flags = []
      if (!row.assigned_resource_id) flags.push('UNASSIGNED')
      if (overdue) flags.push('SCHEDULE_OVERDUE')
      if (hasFill && fill >= 90) flags.push('HIGH_FILL')
      if (String(row.priority).toUpperCase() === 'URGENT') flags.push('URGENT')
      if (!Number.isFinite(due)) flags.push('MISSING_SCHEDULE')
      const severity = flags.includes('URGENT') || flags.includes('HIGH_FILL') || overdue
        ? 'high' : flags.length ? 'medium' : 'normal'
      return {
        workOrderId: String(row.id),
        programKey: row.program_key,
        severity,
        flags,
        recommendation: flags.includes('UNASSIGNED')
          ? 'Review collector availability and assign manually'
          : overdue ? 'Review overdue stop and confirm service status'
          : flags.includes('HIGH_FILL') ? 'Review pickup priority and capacity'
          : 'No dispatch intervention indicated',
        // Score is explanatory only, never an authorization to change a route.
        attentionScore: clamp((flags.includes('URGENT') ? 40 : 0) +
          (flags.includes('HIGH_FILL') ? 30 : 0) +
          (overdue ? 20 : 0) + (flags.includes('UNASSIGNED') ? 10 : 0), 0, 100),
      }
    }).sort((a,b) => b.attentionScore - a.attentionScore ||
      a.workOrderId.localeCompare(b.workOrderId))
}
