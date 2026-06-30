// src/pages/ParticipantIntake.jsx
// ── Morpheus CRM — Participant Intake Form ──────────────────────
// Multi-step intake form for enrolling new participants.
// Step 1: Personal info  Step 2: Program info  Step 3: Confirm & create

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { createParticipant, enrollParticipant, getCohortOverview } from '../lib/db.js'
import { useAuth } from '../hooks/useAuth.jsx'

const PROGRAM_SOURCES = [
  'LDSS Albany',
  'LDSS Schenectady',
  'Reentry / Incarcerated',
  'Direct Enrollment',
]

const LDSS_OFFICES = {
  'LDSS Albany':       'LDSS Albany – Workforce Solutions',
  'LDSS Schenectady':  'LDSS Schenectady – Workforce Solutions',
}

const STEPS = ['Personal info', 'Program info', 'Review & enroll']

export default function ParticipantIntake({ cohorts = [], staffProfiles = [] }) {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [step, setStep]       = useState(0)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)
  const [created, setCreated] = useState(null)  // participant record after save

  const [form, setForm] = useState({
    full_name:        '',
    dob:              '',
    email:            '',
    temp_password:    '',
    program_source:   '',
    ldss_office:      '',
    ldss_case_number: '',
    ldss_caseworker:  '',
    assigned_trainer: '',
    cohort_id:        '',
    notes:            '',
  })

  const set = (k, v) => {
    setForm(f => {
      const next = { ...f, [k]: v }
      // Auto-fill LDSS office when source is selected
      if (k === 'program_source') {
        next.ldss_office = LDSS_OFFICES[v] ?? ''
      }
      return next
    })
  }

  const canAdvance = () => {
    if (step === 0) return form.full_name && form.email && form.temp_password
    if (step === 1) return form.program_source
    return true
  }

  async function handleSubmit() {
    setSaving(true)
    setError(null)
    try {
      // 1. Create Supabase auth user with participant role
      const { data: authData, error: authErr } = await supabase.auth.admin
        ? await supabase.functions.invoke('create-participant-user', {
            body: { email: form.email, password: form.temp_password }
          })
        : { data: null, error: null }  // fallback: trainer creates manually

      // 2. Insert participant record
      const participant = await createParticipant({
        user_id:          authData?.user?.id ?? null,
        full_name:        form.full_name,
        dob:              form.dob || null,
        program_source:   form.program_source,
        ldss_office:      form.ldss_office || null,
        ldss_case_number: form.ldss_case_number || null,
        ldss_caseworker:  form.ldss_caseworker || null,
        assigned_trainer: form.assigned_trainer || null,
        notes:            form.notes || null,
        status:           'Active',
      })

      // 3. Enroll in cohort if selected
      if (form.cohort_id) {
        await enrollParticipant(form.cohort_id, participant.id)
      }

      setCreated(participant)
      setStep(3)  // success screen
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Success screen ───────────────────────────────────────────
  if (step === 3 && created) {
    return (
      <div style={s.page}>
        <div style={s.successCard}>
          <div style={s.successIcon}>✓</div>
          <h2 style={s.successTitle}>Participant enrolled</h2>
          <div style={s.successId}>{created.cts_id}</div>
          <p style={s.successName}>{created.full_name}</p>
          <p style={s.successSub}>{created.program_source}</p>
          <div style={s.successActions}>
            <button style={s.btnPrimary} onClick={() => navigate(`/participants/${created.id}`)}>
              View profile
            </button>
            <button style={s.btn} onClick={() => { setStep(0); setCreated(null); setForm({ full_name:'',dob:'',email:'',temp_password:'',program_source:'',ldss_office:'',ldss_case_number:'',ldss_caseworker:'',assigned_trainer:'',cohort_id:'',notes:'' }) }}>
              Enroll another
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>Enroll new participant</h1>
        <p style={s.subtitle}>Complete all required fields to create a Morpheus account.</p>
      </div>

      {/* Step indicators */}
      <div style={s.steps}>
        {STEPS.map((label, i) => (
          <div key={i} style={s.stepItem}>
            <div style={{ ...s.stepDot, ...(i <= step ? s.stepDotActive : {}) }}>
              {i < step ? '✓' : i + 1}
            </div>
            <span style={{ ...s.stepLabel, ...(i === step ? s.stepLabelActive : {}) }}>{label}</span>
            {i < STEPS.length - 1 && <div style={{ ...s.stepLine, ...(i < step ? s.stepLineActive : {}) }} />}
          </div>
        ))}
      </div>

      <div style={s.card}>
        {error && <div style={s.errorBox}>{error}</div>}

        {/* ── Step 0: Personal info ── */}
        {step === 0 && (
          <div style={s.formGrid}>
            <div style={s.formGroup}>
              <label style={s.label}>Full name <span style={s.req}>*</span></label>
              <input style={s.input} value={form.full_name}
                onChange={e => set('full_name', e.target.value)}
                placeholder="First and last name" />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Date of birth</label>
              <input style={s.input} type="date" value={form.dob}
                onChange={e => set('dob', e.target.value)} />
            </div>
            <div style={{ ...s.formGroup, gridColumn: '1/-1' }}>
              <label style={s.label}>Email address <span style={s.req}>*</span></label>
              <input style={s.input} type="email" value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="participant@example.com" />
              <div style={s.hint}>This will be their Morpheus login email.</div>
            </div>
            <div style={{ ...s.formGroup, gridColumn: '1/-1' }}>
              <label style={s.label}>Temporary password <span style={s.req}>*</span></label>
              <input style={s.input} type="password" value={form.temp_password}
                onChange={e => set('temp_password', e.target.value)}
                placeholder="Min 8 characters" />
              <div style={s.hint}>Participant should change this on first login.</div>
            </div>
          </div>
        )}

        {/* ── Step 1: Program info ── */}
        {step === 1 && (
          <div style={s.formGrid}>
            <div style={s.formGroup}>
              <label style={s.label}>Program source <span style={s.req}>*</span></label>
              <select style={s.input} value={form.program_source}
                onChange={e => set('program_source', e.target.value)}>
                <option value="">Select source…</option>
                {PROGRAM_SOURCES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>LDSS / program office</label>
              <input style={s.input} value={form.ldss_office}
                onChange={e => set('ldss_office', e.target.value)}
                placeholder="Auto-filled from source" />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>LDSS case number</label>
              <input style={s.input} value={form.ldss_case_number}
                onChange={e => set('ldss_case_number', e.target.value)}
                placeholder="e.g. ALB-WF-2025-1104" />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>LDSS caseworker</label>
              <input style={s.input} value={form.ldss_caseworker}
                onChange={e => set('ldss_caseworker', e.target.value)}
                placeholder="Caseworker full name" />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Assigned trainer</label>
              <select style={s.input} value={form.assigned_trainer}
                onChange={e => set('assigned_trainer', e.target.value)}>
                <option value="">Select trainer…</option>
                {staffProfiles.map(sp => (
                  <option key={sp.id} value={sp.id}>{sp.full_name}</option>
                ))}
              </select>
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Enroll in cohort</label>
              <select style={s.input} value={form.cohort_id}
                onChange={e => set('cohort_id', e.target.value)}>
                <option value="">Select cohort (optional)…</option>
                {cohorts.filter(c => c.status === 'Active' || c.status === 'Scheduled').map(c => (
                  <option key={c.id} value={c.id}>{c.name} — {c.program_source}</option>
                ))}
              </select>
            </div>
            <div style={{ ...s.formGroup, gridColumn: '1/-1' }}>
              <label style={s.label}>Notes</label>
              <textarea style={{ ...s.input, height: '80px', resize: 'vertical' }}
                value={form.notes} onChange={e => set('notes', e.target.value)}
                placeholder="Any relevant notes for this participant's record…" />
            </div>
          </div>
        )}

        {/* ── Step 2: Review ── */}
        {step === 2 && (
          <div>
            <div style={s.reviewSection}>
              <div style={s.reviewSectionTitle}>Personal information</div>
              <ReviewRow label="Full name"    value={form.full_name} />
              <ReviewRow label="Date of birth" value={form.dob || '—'} />
              <ReviewRow label="Email"        value={form.email} />
              <ReviewRow label="Password"     value="••••••••" />
            </div>
            <div style={s.reviewSection}>
              <div style={s.reviewSectionTitle}>Program information</div>
              <ReviewRow label="Program source"  value={form.program_source || '—'} />
              <ReviewRow label="LDSS office"     value={form.ldss_office || '—'} />
              <ReviewRow label="LDSS case #"     value={form.ldss_case_number || '—'} />
              <ReviewRow label="Caseworker"      value={form.ldss_caseworker || '—'} />
              <ReviewRow label="Cohort"          value={cohorts.find(c => c.id === form.cohort_id)?.name || '—'} />
            </div>
            <div style={s.reviewNote}>
              Clicking <strong>Enroll participant</strong> will create a Morpheus account, assign a CTS ID, and log the enrollment. This action cannot be undone without contacting an admin.
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={s.navRow}>
          {step > 0 && (
            <button style={s.btn} onClick={() => setStep(s => s - 1)}>← Back</button>
          )}
          <div style={{ flex: 1 }} />
          {step < 2 ? (
            <button style={{ ...s.btnPrimary, opacity: canAdvance() ? 1 : 0.45 }}
              disabled={!canAdvance()}
              onClick={() => setStep(s => s + 1)}>
              Continue →
            </button>
          ) : (
            <button style={s.btnTeal} disabled={saving} onClick={handleSubmit}>
              {saving ? 'Enrolling…' : 'Enroll participant'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ReviewRow({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: '12px', padding: '7px 0', borderBottom: '1px solid #F0F4F8', fontSize: '13px' }}>
      <span style={{ width: '130px', color: '#4A6080', flexShrink: 0 }}>{label}</span>
      <span style={{ color: '#0D1B2A', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

const s = {
  page: { maxWidth: '700px' },
  header: { marginBottom: '24px' },
  title: { fontSize: '20px', fontWeight: 500, color: '#0D1B2A', marginBottom: '4px' },
  subtitle: { fontSize: '13px', color: '#4A6080' },
  steps: { display: 'flex', alignItems: 'center', marginBottom: '24px', gap: '0' },
  stepItem: { display: 'flex', alignItems: 'center', gap: '8px', flex: 1 },
  stepDot: { width: '28px', height: '28px', borderRadius: '50%', background: '#E8EFF6', color: '#8BA0B8', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.2s' },
  stepDotActive: { background: '#0D1B2A', color: '#fff' },
  stepLabel: { fontSize: '12px', color: '#8BA0B8', whiteSpace: 'nowrap' },
  stepLabelActive: { color: '#0D1B2A', fontWeight: 500 },
  stepLine: { flex: 1, height: '1px', background: '#E8EFF6', margin: '0 4px' },
  stepLineActive: { background: '#0D1B2A' },
  card: { background: '#fff', border: '1px solid #CBD8E6', borderRadius: '16px', padding: '28px' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
  label: { fontSize: '11px', fontWeight: 600, color: '#4A6080', textTransform: 'uppercase', letterSpacing: '0.06em' },
  req: { color: '#993C1D' },
  input: { padding: '9px 11px', border: '1px solid #CBD8E6', borderRadius: '8px', fontSize: '13px', fontFamily: "'DM Sans', sans-serif", color: '#0D1B2A', background: '#fff', width: '100%' },
  hint: { fontSize: '11px', color: '#8BA0B8', marginTop: '3px' },
  navRow: { display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '20px', borderTop: '1px solid #F0F4F8', marginTop: '8px' },
  btn: { padding: '9px 18px', border: '1px solid #CBD8E6', borderRadius: '8px', background: '#fff', color: '#0D1B2A', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  btnPrimary: { padding: '9px 20px', border: 'none', borderRadius: '8px', background: '#0D1B2A', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s' },
  btnTeal: { padding: '9px 20px', border: 'none', borderRadius: '8px', background: '#0F6E56', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  errorBox: { background: '#FAECE7', color: '#993C1D', borderRadius: '8px', padding: '11px 14px', fontSize: '13px', marginBottom: '18px', lineHeight: '1.5' },
  reviewSection: { marginBottom: '20px' },
  reviewSectionTitle: { fontSize: '11px', fontWeight: 600, color: '#4A6080', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' },
  reviewNote: { background: '#F7F9FC', borderRadius: '8px', padding: '12px 14px', fontSize: '12px', color: '#4A6080', lineHeight: '1.6', marginTop: '16px' },
  successCard: { background: '#fff', border: '1px solid #CBD8E6', borderRadius: '16px', padding: '44px', textAlign: 'center', maxWidth: '400px', margin: '40px auto' },
  successIcon: { width: '52px', height: '52px', borderRadius: '50%', background: '#E1F5EE', color: '#0F6E56', fontSize: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' },
  successTitle: { fontSize: '18px', fontWeight: 500, color: '#0D1B2A', marginBottom: '8px' },
  successId: { fontFamily: "'DM Mono', monospace", fontSize: '13px', color: '#2176AE', background: '#E6F1FB', borderRadius: '6px', padding: '4px 10px', display: 'inline-block', marginBottom: '8px' },
  successName: { fontSize: '16px', fontWeight: 500, color: '#0D1B2A', marginBottom: '2px' },
  successSub: { fontSize: '13px', color: '#4A6080', marginBottom: '24px' },
  successActions: { display: 'flex', gap: '10px', justifyContent: 'center' },
}
