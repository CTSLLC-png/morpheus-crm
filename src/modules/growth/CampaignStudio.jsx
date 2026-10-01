// src/modules/growth/CampaignStudio.jsx
// ── Campaign Studio — AI-assisted campaigns for CTS products (Legacy Path first).
//    Generate → compliance check → human approval → publish, with a funnel
//    report fed by first-touch UTM attribution. AI never publishes: every
//    generated asset is a draft until a super_admin approves it (enforced by
//    the growth_asset_review_gate trigger, not just this screen).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../hooks/useAuth.jsx'
import { generateCampaignCopy } from '../../lib/ai.js'
import { projectFromCampaignAsset } from '../studio/studioApi.js'
import { ModuleHeader, Pill, Table, DataState, styles } from '../common/ModuleFrame.jsx'
import {
  AUDIENCES, CHANNELS, ANGLES, SEASONAL, CHANNEL_UTM, LANDING,
  complianceCheck, utmLink, channelLink, systemPrompt, generationPrompt,
  PRODUCTION_CHANNELS, productionBrief,
} from './legacyPlaybook.js'


const TABS = [
  ['funnel', 'Funnel'],
  ['generate', 'Generate'],
  ['autopilot', 'Autopilot'],
  ['library', 'Asset library'],
  ['links', 'Link builder'],
]

const STATUS_TONE = { draft: 'warn', approved: 'info', scheduled: 'info', published: 'good', retired: 'neutral' }

const f = {
  label:  { display:'block', fontSize:'11px', fontWeight:500, color:'#5B6B7F', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'5px' },
  input:  { width:'100%', padding:'8px 10px', fontSize:'13px', border:'1px solid #CBD8E6', borderRadius:'8px', background:'#fff', color:'#0D1B2A', boxSizing:'border-box' },
  btn:    { padding:'8px 14px', fontSize:'13px', fontWeight:500, borderRadius:'8px', border:'1px solid #CBD8E6', background:'#fff', color:'#0D1B2A', cursor:'pointer' },
  primary:{ padding:'8px 14px', fontSize:'13px', fontWeight:500, borderRadius:'8px', border:'1px solid #0F6E56', background:'#0F6E56', color:'#fff', cursor:'pointer' },
  grid:   { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:'12px' },
  pre:    { whiteSpace:'pre-wrap', fontFamily:'inherit', fontSize:'13px', lineHeight:1.55, color:'#0D1B2A', margin:0 },
}

const slugDate = d => d.toISOString().slice(0, 7)
const defaultCampaign = () => `legacy-path-${slugDate(new Date())}`

export default function CampaignStudio() {
  const [tab, setTab] = useState('funnel')
  return (
    <div>
      <ModuleHeader
        title="Campaign Studio"
        subtitle="Legacy Path · AI drafts, human approval, attributed results"
        right={<a href={LANDING} target="_blank" rel="noreferrer" style={{ fontSize:'13px' }}>Open landing page ↗</a>}
      />
      <div role="tablist" aria-label="Campaign Studio" style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'16px' }}>
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            style={tab === k ? f.primary : f.btn}>{label}</button>
        ))}
      </div>
      {tab === 'funnel'    && <Funnel />}
      {tab === 'generate'  && <Generate />}
      {tab === 'autopilot' && <Autopilot />}
      {tab === 'library'   && <Library />}
      {tab === 'links'     && <LinkBuilder />}
    </div>
  )
}

// ── Funnel ──────────────────────────────────────────────────────────────────
function Funnel() {
  const [days, setDays] = useState(90)
  const [state, setState] = useState({ loading: true, rows: [], error: null })

  useEffect(() => {
    let alive = true
    setState(s => ({ ...s, loading: true }))
    const since = new Date(Date.now() - days * 86400000).toISOString()
    supabase.rpc('lp_campaign_funnel', { since }).then(({ data, error }) => {
      if (alive) setState({ loading: false, rows: data ?? [], error })
    })
    return () => { alive = false }
  }, [days])

  const totals = useMemo(() => state.rows.reduce((t, r) => ({
    signups: t.signups + Number(r.signups), purchases: t.purchases + Number(r.purchases),
    revenue: t.revenue + Number(r.revenue_cents),
  }), { signups: 0, purchases: 0, revenue: 0 }), [state.rows])

  const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—')

  return (
    <div>
      <div style={{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'12px' }}>
        <label style={{ fontSize:'13px', color:'#5B6B7F' }} htmlFor="cs-days">Accounts created in the last</label>
        <select id="cs-days" value={days} onChange={e => setDays(Number(e.target.value))} style={{ ...f.input, width:'auto' }}>
          {[7, 30, 90, 365].map(d => <option key={d} value={d}>{d} days</option>)}
        </select>
      </div>
      <div style={{ ...f.grid, marginBottom:'16px' }}>
        <Metric label="Free accounts" value={totals.signups} />
        <Metric label="Lifetime purchases" value={totals.purchases} />
        <Metric label="Conversion" value={pct(totals.purchases, totals.signups)} />
        <Metric label="Net revenue" value={`$${(totals.revenue / 100).toFixed(2)}`} />
      </div>
      <DataState loading={state.loading} error={state.error} rows={state.rows}
        empty="No Legacy Path accounts in this window yet. Share a tagged link from the Link builder to start measuring.">
        <div style={{ overflowX:'auto' }}>
          <Table
            columns={['Source', 'Medium', 'Campaign', 'Accounts', 'Purchases', 'Conv.', 'Refunds', 'Net revenue']}
            rows={state.rows}
            keyOf={r => `${r.utm_source}|${r.utm_medium}|${r.utm_campaign}`}
            renderRow={r => <>
              <td style={styles.td}>{r.utm_source}</td>
              <td style={styles.td}>{r.utm_medium}</td>
              <td style={{ ...styles.td, fontFamily:'monospace' }}>{r.utm_campaign}</td>
              <td style={styles.td}>{r.signups}</td>
              <td style={styles.td}>{r.purchases}</td>
              <td style={styles.td}>{pct(Number(r.purchases), Number(r.signups))}</td>
              <td style={styles.td}>{r.refunds}</td>
              <td style={styles.td}>${(Number(r.revenue_cents) / 100).toFixed(2)}</td>
            </>}
          />
        </div>
      </DataState>
    </div>
  )
}

// ── Generate one asset ──────────────────────────────────────────────────────
function Generate({ onSaved }) {
  const [form, setForm] = useState({
    channel: 'facebook', audience: AUDIENCES[0].key, angle: ANGLES[0],
    campaign: defaultCampaign(), notes: '', source: '',
  })
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const utm = CHANNEL_UTM[form.channel]
  const link = channelLink({ channel: form.channel, campaign: form.campaign, audience: form.audience, source: form.source })
  const set = k => e => setForm(v => ({ ...v, [k]: e.target.value }))
  // A new channel means a new platform, so drop any source typed for the old one.
  const setChannel = e => setForm(v => ({ ...v, channel: e.target.value, source: '' }))

  async function run() {
    setBusy(true); setMsg(null)
    try {
      const out = await generateCampaignCopy(systemPrompt(), generationPrompt({ ...form, link }))
      setDraft(out)
    } catch (e) {
      setMsg({ tone: 'bad', text: `Generation failed: ${e.message}` })
    } finally { setBusy(false) }
  }

  async function save() {
    const { error } = await saveDraft({ ...form, ...draft, link })
    if (error) setMsg({ tone: 'bad', text: error.message })
    else { setMsg({ tone: 'good', text: 'Saved to the asset library as a draft. A super_admin approves it there.' }); setDraft(null); onSaved?.() }
  }

  const flags = draft ? complianceCheck(draft.body, form.channel) : []

  return (
    <div style={{ display:'grid', gap:'16px' }}>
      <div style={{ ...styles.card, padding:'16px' }}>
        <div style={f.grid}>
          <Field label="Channel"><select style={f.input} value={form.channel} onChange={setChannel}>
            {CHANNELS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></Field>
          <Field label="Audience"><select style={f.input} value={form.audience} onChange={set('audience')}>
            {AUDIENCES.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}</select></Field>
          <Field label="Angle"><select style={f.input} value={form.angle} onChange={set('angle')}>
            {ANGLES.map(a => <option key={a} value={a}>{a}</option>)}</select></Field>
          <Field label="Campaign tag"><input style={f.input} value={form.campaign} onChange={set('campaign')} /></Field>
          <Field label={`Source · where it's seen (medium: ${utm.medium})`}>
            <input style={f.input} value={form.source} onChange={set('source')} placeholder={utm.named ?? utm.source} />
          </Field>
        </div>
        <div style={{ marginTop:'12px' }}>
          <Field label="Extra direction (optional)">
            <input style={f.input} value={form.notes} onChange={set('notes')}
              placeholder={`e.g. tie it to ${SEASONAL[new Date().getMonth()]}`} />
          </Field>
        </div>
        <div style={{ marginTop:'10px', fontSize:'12px', color:'#5B6B7F', wordBreak:'break-all' }}>Tracked link: <code>{link}</code></div>
        <div style={{ marginTop:'12px' }}>
          <button style={f.primary} onClick={run} disabled={busy}>{busy ? 'Writing…' : 'Generate draft'}</button>
        </div>
      </div>
      {msg && <div style={msg.tone === 'bad' ? styles.error : styles.notice} role="status">{msg.text}</div>}
      {draft && (
        <div style={{ ...styles.card, padding:'16px', display:'grid', gap:'10px' }}>
          <Field label="Title"><input style={f.input} value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} /></Field>
          <Field label="Copy"><textarea style={{ ...f.input, minHeight:'260px', fontFamily:'inherit' }} value={draft.body}
            onChange={e => setDraft(d => ({ ...d, body: e.target.value }))} /></Field>
          <Flags flags={flags} />
          <div style={{ display:'flex', gap:'8px' }}>
            <button style={f.primary} onClick={save}>Save as draft</button>
            <button style={f.btn} onClick={run} disabled={busy}>Regenerate</button>
          </div>
        </div>
      )}
    </div>
  )
}

function saveDraft({ campaign, channel, audience, title, body, link, scheduled_for = null }) {
  return supabase.from('growth_campaign_asset').insert({
    campaign, channel, audience, title, body, landing_url: link, scheduled_for,
    generated_by: 'ai', status: 'draft', compliance_flags: complianceCheck(body, channel),
  })
}

// ── Autopilot: a full week of drafts in one run ─────────────────────────────
// Rotates channels × audiences × angles so a week never repeats a pairing,
// and dates each draft so the library doubles as a posting calendar.
const WEEK_PLAN = ['facebook', 'instagram', 'email', 'tiktok', 'linkedin', 'partner', 'blog']

export function planWeek(start, campaign, offset = 0) {
  return WEEK_PLAN.map((channel, i) => {
    const d = new Date(start); d.setDate(d.getDate() + i)
    const audience = AUDIENCES[(i + offset) % AUDIENCES.length].key
    const angle = ANGLES[(i * 3 + offset) % ANGLES.length]
    return {
      channel, audience, angle, campaign, scheduled_for: d.toISOString().slice(0, 10),
      notes: `Seasonal hook if it fits naturally: ${SEASONAL[d.getMonth()]}.`,
      link: channelLink({ channel, campaign, audience }),
    }
  })
}

function Autopilot() {
  const nextMonday = () => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d.toISOString().slice(0, 10) }
  const [start, setStart] = useState(nextMonday)
  const [campaign, setCampaign] = useState(defaultCampaign)
  const [log, setLog] = useState([])
  const [running, setRunning] = useState(false)

  const plan = useMemo(() => planWeek(new Date(`${start}T12:00:00`), campaign,
    Math.floor(new Date(start).getTime() / (7 * 86400000))), [start, campaign])

  async function run() {
    setRunning(true); setLog([])
    for (const brief of plan) {
      setLog(l => [...l, { key: brief.scheduled_for, text: `${brief.scheduled_for} · ${brief.channel} → writing…` }])
      let line
      try {
        const out = await generateCampaignCopy(systemPrompt(), generationPrompt(brief))
        const { error } = await saveDraft({ ...brief, ...out })
        if (error) throw error
        const n = complianceCheck(out.body, brief.channel).length
        line = `${brief.scheduled_for} · ${brief.channel} → saved “${out.title}”${n ? ` (${n} flag${n > 1 ? 's' : ''} to review)` : ''}`
      } catch (e) {
        line = `${brief.scheduled_for} · ${brief.channel} → failed: ${e.message}`
      }
      setLog(l => l.map(x => (x.key === brief.scheduled_for ? { ...x, text: line } : x)))
    }
    setRunning(false)
  }

  return (
    <div style={{ display:'grid', gap:'16px' }}>
      <div style={styles.notice}>
        Autopilot writes seven dated drafts — one per day across social, email, partner outreach and SEO — each with its own tracked link.
        Nothing is posted or sent. Drafts wait in the Asset library for a super_admin to approve.
      </div>
      <div style={{ ...styles.card, padding:'16px' }}>
        <div style={f.grid}>
          <Field label="Week starting"><input type="date" style={f.input} value={start} onChange={e => setStart(e.target.value)} /></Field>
          <Field label="Campaign tag"><input style={f.input} value={campaign} onChange={e => setCampaign(e.target.value)} /></Field>
        </div>
        <ol style={{ fontSize:'13px', color:'#0D1B2A', lineHeight:1.7, margin:'14px 0' }}>
          {plan.map(p => <li key={p.scheduled_for}><strong>{p.scheduled_for}</strong> · {CHANNELS.find(c => c.key === p.channel).label} · {AUDIENCES.find(a => a.key === p.audience).label} · <em>{p.angle}</em></li>)}
        </ol>
        <button style={f.primary} onClick={run} disabled={running}>{running ? 'Running…' : 'Generate the week'}</button>
      </div>
      {log.length > 0 && (
        <div style={{ ...styles.card, padding:'16px' }} role="log" aria-live="polite">
          {log.map(l => <div key={l.key} style={{ fontSize:'13px', fontFamily:'monospace', padding:'3px 0' }}>{l.text}</div>)}
        </div>
      )}
    </div>
  )
}

// ── Asset library + approval ────────────────────────────────────────────────
function Library() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState('draft')
  const [state, setState] = useState({ loading: true, rows: [], error: null })
  const [open, setOpen] = useState(null)
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true }))
    let q = supabase.from('growth_campaign_asset').select('*').order('scheduled_for', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }).limit(200)
    if (status !== 'all') q = q.eq('status', status)
    const { data, error } = await q
    setState({ loading: false, rows: data ?? [], error })
  }, [status])

  useEffect(() => { load() }, [load])

  async function setAssetStatus(row, next) {
    setMsg(null)
    const { error } = await supabase.from('growth_campaign_asset').update({ status: next }).eq('id', row.id)
    if (error) setMsg(error.message); else { setOpen(null); load() }
  }

  async function copy(row) {
    try { await navigator.clipboard.writeText(row.body); setMsg('Copied. Paste it into the channel, then mark it published.') }
    catch { setMsg('Copy failed — select the text and copy it by hand.') }
  }

  // Approved production assets become Creator Studio projects with their
  // queue filled in. Copy brief stays for tools outside Morpheus.
  async function sendToCreatorStudio(row) {
    setMsg(null)
    try {
      const { project } = await projectFromCampaignAsset(row)
      navigate(`/creator-studio?project=${project.id}`)
    } catch (e) { setMsg(`Could not open the Creator Studio project: ${e.message}`) }
  }

  async function copyBrief(row) {
    try { await navigator.clipboard.writeText(productionBrief(row)); setMsg('Production brief copied.') }
    catch { setMsg('Copy failed.') }
  }

  async function saveMedia(row, url) {
    setMsg(null)
    const { error } = await supabase.from('growth_campaign_asset').update({ media_url: url.trim() || null }).eq('id', row.id)
    if (error) setMsg(error.message); else { setMsg('Media link saved.'); load() }
  }

  return (
    <div style={{ display:'grid', gap:'12px' }}>
      <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
        {['draft', 'approved', 'scheduled', 'published', 'retired', 'all'].map(s => (
          <button key={s} style={status === s ? f.primary : f.btn} onClick={() => setStatus(s)}>{s}</button>
        ))}
      </div>
      {msg && <div style={styles.notice} role="status">{msg}</div>}
      <DataState loading={state.loading} error={state.error} rows={state.rows}
        empty={status === 'draft' ? 'No drafts waiting. Use Generate or Autopilot to write some.' : `No ${status} assets.`}>
        <div style={{ display:'grid', gap:'10px' }}>
          {state.rows.map(r => (
            <div key={r.id} style={{ ...styles.card, padding:'14px 16px' }}>
              <div style={{ display:'flex', gap:'10px', alignItems:'center', flexWrap:'wrap' }}>
                <Pill tone={STATUS_TONE[r.status]}>{r.status}</Pill>
                <Pill tone="neutral">{CHANNELS.find(c => c.key === r.channel)?.label ?? r.channel}</Pill>
                {r.scheduled_for && <span style={{ fontSize:'12px', color:'#5B6B7F' }}>{r.scheduled_for}</span>}
                {r.media_url && <Pill tone="good">media ready</Pill>}
                {r.compliance_flags?.length > 0 && <Pill tone="bad">{r.compliance_flags.length} flag{r.compliance_flags.length > 1 ? 's' : ''}</Pill>}
                <button style={{ ...f.btn, marginLeft:'auto' }} onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                  {open === r.id ? 'Close' : 'Review'}
                </button>
              </div>
              <div style={{ ...styles.title, marginTop:'8px' }}>{r.title}</div>
              <div style={styles.sub}>{AUDIENCES.find(a => a.key === r.audience)?.label ?? r.audience} · <code>{r.campaign}</code></div>
              {open === r.id && (
                <div style={{ marginTop:'12px', display:'grid', gap:'10px' }}>
                  <pre style={f.pre}>{r.body}</pre>
                  <Flags flags={r.compliance_flags ?? []} />
                  {r.landing_url && <div style={{ fontSize:'12px', wordBreak:'break-all' }}>Link: <code>{r.landing_url}</code></div>}
                  {canProduce(r) && <MediaLink row={r} onSave={saveMedia} />}
                  {PRODUCTION_CHANNELS.includes(r.channel) && r.status === 'draft' && (
                    <div style={{ fontSize:'12px', color:'#5B6B7F' }}>Approve this draft to send it to Creator Studio for production.</div>
                  )}
                  <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
                    <button style={f.btn} onClick={() => copy(r)}>Copy text</button>
                    {canProduce(r) && <button style={f.primary} onClick={() => sendToCreatorStudio(r)}>Send to Creator Studio</button>}
                    {canProduce(r) && <button style={f.btn} onClick={() => copyBrief(r)}>Copy brief</button>}
                    {isAdmin && r.status === 'draft' && <button style={f.primary} onClick={() => setAssetStatus(r, 'approved')}>Approve</button>}
                    {isAdmin && r.status === 'approved' && <button style={f.btn} onClick={() => setAssetStatus(r, 'scheduled')}>Mark scheduled</button>}
                    {isAdmin && ['approved', 'scheduled'].includes(r.status) && <button style={f.primary} onClick={() => setAssetStatus(r, 'published')}>Mark published</button>}
                    {isAdmin && r.status !== 'retired' && <button style={f.btn} onClick={() => setAssetStatus(r, 'retired')}>Retire</button>}
                    {!isAdmin && r.status === 'draft' && <span style={{ fontSize:'12px', color:'#5B6B7F', alignSelf:'center' }}>A super_admin approves drafts.</span>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </DataState>
    </div>
  )
}

// ── Link builder ────────────────────────────────────────────────────────────
function LinkBuilder() {
  const [v, setV] = useState({ source: 'facebook', medium: 'social', campaign: defaultCampaign(), content: '', path: '' })
  const set = k => e => setV(x => ({ ...x, [k]: e.target.value }))
  const link = utmLink(v)
  const [copied, setCopied] = useState(false)
  return (
    <div style={{ ...styles.card, padding:'16px', display:'grid', gap:'12px' }}>
      <div style={f.grid}>
        <Field label="Source (where)"><input style={f.input} value={v.source} onChange={set('source')} placeholder="facebook, church-bulletin, cu-newsletter" /></Field>
        <Field label="Medium (how)"><input style={f.input} value={v.medium} onChange={set('medium')} placeholder="social, email, cpc, partner, print" /></Field>
        <Field label="Campaign"><input style={f.input} value={v.campaign} onChange={set('campaign')} /></Field>
        <Field label="Content (variant)"><input style={f.input} value={v.content} onChange={set('content')} placeholder="video-a, flyer-qr" /></Field>
        <Field label="Page"><select style={f.input} value={v.path} onChange={set('path')}>
          <option value="">Landing page</option>
          <option value="signin">Free account / screener</option>
          <option value="signin?next=unlock">Straight to $20 unlock</option>
        </select></Field>
      </div>
      <code style={{ fontSize:'13px', wordBreak:'break-all', background:'#F7F9FC', padding:'10px', borderRadius:'8px' }}>{link}</code>
      <div>
        <button style={f.primary} onClick={async () => {
          try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
        }}>{copied ? 'Copied' : 'Copy link'}</button>
      </div>
      <div style={styles.sub}>For print and in-person events, turn this link into a QR code so flyer sign-ups show up in the funnel under their own source.</div>
    </div>
  )
}

// Only approved copy goes to production, so a brief never carries unreviewed text.
const canProduce = r => PRODUCTION_CHANNELS.includes(r.channel) && ['approved', 'scheduled', 'published'].includes(r.status)

function MediaLink({ row, onSave }) {
  const [url, setUrl] = useState(row.media_url ?? '')
  const valid = !url.trim() || /^https:\/\/\S+$/.test(url.trim())
  return (
    <div style={{ display:'flex', gap:'8px', alignItems:'flex-end', flexWrap:'wrap' }}>
      <div style={{ flex:'1 1 280px' }}>
        <Field label="Finished media link (set automatically from the Creator Studio project)">
          <input style={f.input} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" />
        </Field>
      </div>
      <button style={f.btn} disabled={!valid || url === (row.media_url ?? '')} onClick={() => onSave(row, url)}>Save link</button>
      {row.media_url && <a href={row.media_url} target="_blank" rel="noreferrer" style={{ fontSize:'13px', alignSelf:'center' }}>Open media ↗</a>}
      {!valid && <div style={{ width:'100%', fontSize:'12px', color:'#993C1D' }}>Use a full https:// link.</div>}
    </div>
  )
}

// ── Small pieces ────────────────────────────────────────────────────────────
function Field({ label, children }) {
  return <label style={{ display:'block' }}><span style={f.label}>{label}</span>{children}</label>
}

function Flags({ flags }) {
  if (!flags.length) return <div style={{ fontSize:'12px', color:'#0F6E56' }}>✓ No compliance flags. A person still reviews before it goes out.</div>
  return (
    <div style={styles.error}>
      <strong>Review before approving:</strong>
      <ul style={{ margin:'6px 0 0', paddingLeft:'18px' }}>{flags.map(x => <li key={x}>{x}</li>)}</ul>
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #CBD8E6', borderRadius:12, padding:16 }}>
      <div style={{ fontSize:11, color:'#5B6B7F', textTransform:'uppercase', letterSpacing:'.06em' }}>{label}</div>
      <div style={{ fontSize:26, fontFamily:'monospace', marginTop:7 }}>{value}</div>
    </div>
  )
}
