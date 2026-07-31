// src/modules/cx/CXReviewPanel.tsx
// ── Morpheus CRM — CX plan review (super admin) ─────────────────
// Lists AI-generated improvement plans awaiting sign-off and lets a
// super admin approve and publish them.
//
// The role gate here is REDUNDANT BY DESIGN. It exists so the UI
// does not offer a control that will fail, and so a trainer never
// sees a review surface they cannot act on. It is not the security
// boundary — that is the RLS policy set in schema.sql §6, which
// rejects a draft → approved write from a non-super_admin no matter
// what the client sends. useAuth().role reads
// auth.users.user_metadata (src/lib/supabase.js getUserRole), which
// the user can rewrite via supabase.auth.updateUser — so treating it
// as the boundary would be an escalation path. RLS reads role from
// org_members instead, which is super_admin-write-only.

import { useState, useEffect, useCallback } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useAuth } from '../../hooks/useAuth.jsx'
import {
  listCXPlans,
  updatePlanStatus,
  type CXImprovementPlan,
  type CXPlanStatus,
} from './generateCXPlan.js'

type TabKey = 'draft' | 'approved' | 'published'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'draft',     label: 'Awaiting review' },
  { key: 'approved',  label: 'Approved' },
  { key: 'published', label: 'Published' },
]

const PRIORITY_COLORS: Record<string, { bg: string; fg: string }> = {
  high:   { bg: '#FAECE7', fg: '#993C1D' },
  medium: { bg: '#FDF3E0', fg: '#8A5A12' },
  low:    { bg: '#E6F1FB', fg: '#0C447C' },
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  draft:     { bg: '#EEEDFE', fg: '#3C3489' },
  approved:  { bg: '#E1F5EE', fg: '#0F6E56' },
  published: { bg: '#0D1B2A', fg: '#5DCAA5' },
  archived:  { bg: '#EEF2F6', fg: '#5A6C7D' },
}

export default function CXReviewPanel() {
  const { role, loading: authLoading } = useAuth() as {
    role: string | null
    loading: boolean
  }

  const [tab, setTab]         = useState<TabKey>('draft')
  const [plans, setPlans]     = useState<CXImprovementPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busyId, setBusyId]   = useState<string | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const isSuperAdmin = role === 'super_admin'

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setPlans(await listCXPlans({ status: [tab] }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => {
    if (isSuperAdmin) load()
    else setLoading(false)
  }, [isSuperAdmin, load])

  async function move(plan: CXImprovementPlan, status: CXPlanStatus) {
    setBusyId(plan.id)
    setError(null)
    setSuccess(null)
    try {
      await updatePlanStatus(plan.id, status)
      setSuccess(`"${plan.title}" is now ${status}.`)
      // Drop it from the current tab rather than refetching the world.
      setPlans(prev => prev.filter(p => p.id !== plan.id))
      if (expanded === plan.id) setExpanded(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  if (authLoading) {
    return <div style={s.page}><div style={s.muted}>Checking permissions…</div></div>
  }

  // ── UI gate. See the file header: this mirrors RLS, it does not
  //    replace it. ────────────────────────────────────────────────
  if (!isSuperAdmin) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={s.cardTitle}>CX plan review</div>
          <div style={s.errorBox}>
            Super admin access required. CX improvement plans are reviewed and
            published by program administrators only.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      <div style={s.headerRow}>
        <div>
          <h1 style={s.title}>CX plan review</h1>
          <p style={s.sub}>
            Approve and publish AI-generated improvement plans. Plans are always
            generated as drafts and never go live without sign-off.
          </p>
        </div>
        <div style={s.adminBadge}>Super admin</div>
      </div>

      <div style={s.tabRow}>
        {TABS.map(t => (
          <button
            key={t.key}
            style={{ ...s.tab, ...(tab === t.key ? s.tabActive : {}) }}
            onClick={() => { setTab(t.key); setExpanded(null); setSuccess(null) }}>
            {t.label}
          </button>
        ))}
      </div>

      {error   && <div style={{ ...s.errorBox,   marginBottom: '14px' }}>{error}</div>}
      {success && <div style={{ ...s.successBox, marginBottom: '14px' }}>{success}</div>}

      {loading ? (
        <div style={s.card}><div style={s.muted}>Loading plans…</div></div>
      ) : plans.length === 0 ? (
        <div style={s.card}>
          <div style={s.cardTitle}>{TABS.find(t => t.key === tab)?.label}</div>
          <div style={{ ...s.muted, fontStyle: 'italic' }}>
            {tab === 'draft'
              ? 'No plans awaiting review. Generate one from a batch of unprocessed feedback.'
              : `No ${tab} plans yet.`}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {plans.map(plan => (
            <PlanCard
              key={plan.id}
              plan={plan}
              expanded={expanded === plan.id}
              busy={busyId === plan.id}
              onToggle={() => setExpanded(expanded === plan.id ? null : plan.id)}
              onApprove={() => move(plan, 'approved')}
              onPublish={() => move(plan, 'published')}
              onArchive={() => move(plan, 'archived')}
              onReturnToDraft={() => move(plan, 'draft')}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Plan card ──────────────────────────────────────────────────

interface PlanCardProps {
  plan: CXImprovementPlan
  expanded: boolean
  busy: boolean
  onToggle: () => void
  onApprove: () => void
  onPublish: () => void
  onArchive: () => void
  onReturnToDraft: () => void
}

function PlanCard({
  plan, expanded, busy, onToggle,
  onApprove, onPublish, onArchive, onReturnToDraft,
}: PlanCardProps) {
  const statusColor = STATUS_COLORS[plan.status] ?? STATUS_COLORS.archived
  const period = plan.period_start && plan.period_end
    ? `${plan.period_start} → ${plan.period_end}`
    : '—'

  return (
    <div style={s.card}>
      <div style={s.planHeader}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={s.planTitle}>{plan.title}</div>
          <div style={s.planMeta}>
            {plan.feedback_count} entries · {period} · {plan.model ?? 'unknown model'}
            {plan.prompt_version ? ` · ${plan.prompt_version}` : ''}
          </div>
        </div>
        <span style={{ ...s.statusBadge, background: statusColor.bg, color: statusColor.fg }}>
          {plan.status}
        </span>
      </div>

      {plan.executive_summary && (
        <p style={s.summary}>{plan.executive_summary}</p>
      )}

      <div style={s.actionRow}>
        <button style={s.btnGhost} onClick={onToggle}>
          {expanded ? 'Hide detail' : `Review detail (${plan.themes?.length ?? 0} themes, ${plan.recommendations?.length ?? 0} recommendations)`}
        </button>

        <div style={{ flex: 1 }} />

        {/* Approve is only reachable from draft; Publish only from
            approved. This mirrors the transition trigger in
            schema.sql §5 — the database rejects any other edge. */}
        {plan.status === 'draft' && (
          <button style={s.btnPrimary} onClick={onApprove} disabled={busy}>
            {busy ? 'Working…' : 'Approve'}
          </button>
        )}
        {plan.status === 'approved' && (
          <>
            <button style={s.btnGhost} onClick={onReturnToDraft} disabled={busy}>
              Return to draft
            </button>
            <button style={s.btnPrimary} onClick={onPublish} disabled={busy}>
              {busy ? 'Working…' : 'Publish'}
            </button>
          </>
        )}
        {plan.status !== 'archived' && (
          <button style={s.btnGhost} onClick={onArchive} disabled={busy}>
            Archive
          </button>
        )}
      </div>

      {expanded && (
        <div style={s.detail}>
          <Section label="Themes">
            {(plan.themes ?? []).map((t, i) => (
              <div key={i} style={s.item}>
                <div style={s.itemHead}>
                  <span style={s.itemName}>{t.name}</span>
                  <span style={s.itemTag}>{t.sentiment} · {t.entry_count} entries</span>
                </div>
                <div style={s.itemBody}>{t.description}</div>
                {t.representative_quotes?.length > 0 && (
                  <ul style={s.quoteList}>
                    {t.representative_quotes.map((q, qi) => (
                      <li key={qi} style={s.quote}>&ldquo;{q}&rdquo;</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </Section>

          <Section label="Recommendations">
            {(plan.recommendations ?? []).map((r, i) => {
              const pc = PRIORITY_COLORS[r.priority] ?? PRIORITY_COLORS.low
              return (
                <div key={i} style={s.item}>
                  <div style={s.itemHead}>
                    <span style={s.itemName}>{r.action}</span>
                    <span style={{ ...s.itemTag, background: pc.bg, color: pc.fg }}>
                      {r.priority} priority · {r.effort} effort
                    </span>
                  </div>
                  <div style={s.itemBody}>{r.rationale}</div>
                  <div style={s.itemFoot}>
                    Owner: {r.owner_role} · Success: {r.success_signal}
                  </div>
                </div>
              )
            })}
          </Section>

          <Section label="Metrics">
            {(plan.metrics ?? []).map((m, i) => (
              <div key={i} style={s.item}>
                <div style={s.itemName}>{m.name}</div>
                <div style={s.itemBody}>
                  Now: {m.current_state} · Target: {m.target}
                </div>
                <div style={s.itemFoot}>Measured by: {m.measurement}</div>
              </div>
            ))}
          </Section>
        </div>
      )}
    </div>
  )
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  const items = Array.isArray(children) ? children : [children]
  if (items.length === 0) return null
  return (
    <div style={{ marginTop: '16px' }}>
      <div style={s.cardTitle}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {children}
      </div>
    </div>
  )
}

// ── Styles (matched to src/pages/AdminPanel.jsx) ───────────────

const s: Record<string, CSSProperties> = {
  page:       { maxWidth: '860px', fontFamily: "'DM Sans', sans-serif" },
  headerRow:  { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' },
  title:      { fontSize: '20px', fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: '3px' },
  sub:        { fontSize: '13px', color: 'var(--color-text-secondary)', maxWidth: '58ch', lineHeight: '1.55' },
  adminBadge: { fontSize: '11px', fontWeight: 600, padding: '4px 12px', borderRadius: '20px', background: '#EEEDFE', color: '#3C3489', letterSpacing: '0.04em', flexShrink: 0 },
  tabRow:     { display: 'flex', gap: '2px', marginBottom: '14px', background: 'var(--color-background-secondary)', borderRadius: '10px', padding: '3px', width: 'fit-content' },
  tab:        { padding: '6px 16px', border: 'none', borderRadius: '8px', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  tabActive:  { background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },
  card:       { background: 'var(--color-background-primary)', border: '1px solid #CBD8E6', borderRadius: '16px', padding: '22px' },
  cardTitle:  { fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' },
  muted:      { color: 'var(--color-text-tertiary)', fontSize: '13px' },

  planHeader: { display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' },
  planTitle:  { fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '3px' },
  planMeta:   { fontSize: '11px', color: 'var(--color-text-tertiary)', fontFamily: 'monospace' },
  statusBadge:{ fontSize: '10px', fontWeight: 600, padding: '3px 10px', borderRadius: '10px', letterSpacing: '0.04em', textTransform: 'uppercase', flexShrink: 0 },
  summary:    { fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.6', marginBottom: '14px' },

  actionRow:  { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
  btnPrimary: { padding: '8px 18px', border: 'none', borderRadius: '8px', background: '#0D1B2A', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  btnGhost:   { padding: '8px 14px', border: '1px solid #CBD8E6', borderRadius: '8px', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },

  detail:     { marginTop: '18px', paddingTop: '16px', borderTop: '1px solid #E3EAF2' },
  item:       { background: 'var(--color-background-secondary)', borderRadius: '10px', padding: '12px 14px' },
  itemHead:   { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '5px' },
  itemName:   { fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: '1.4' },
  itemTag:    { fontSize: '10px', fontWeight: 600, padding: '2px 9px', borderRadius: '10px', background: '#E6F1FB', color: '#0C447C', whiteSpace: 'nowrap', flexShrink: 0 },
  itemBody:   { fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: '1.6' },
  itemFoot:   { fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '6px', lineHeight: '1.5' },
  quoteList:  { margin: '8px 0 0', paddingLeft: '16px' },
  quote:      { fontSize: '11px', color: 'var(--color-text-tertiary)', fontStyle: 'italic', lineHeight: '1.6' },

  errorBox:   { background: '#FAECE7', color: '#993C1D', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', lineHeight: '1.5' },
  successBox: { background: '#E1F5EE', color: '#0F6E56', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', lineHeight: '1.5', fontWeight: 500 },
}
