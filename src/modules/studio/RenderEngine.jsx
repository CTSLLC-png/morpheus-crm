// src/modules/studio/RenderEngine.jsx
// ── Creator Studio · Render tab. Script → scene plan → cost estimate →
//    approval → finished video (16:9, 9:16, 1:1). Rendering happens on the
//    GPU worker; this screen only plans, approves and plays back.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTenant } from '../../hooks/useTenant.jsx'
import { Pill, DataState, styles } from '../common/ModuleFrame.jsx'
import {
  RATIOS, APPROVER_ROLES, STATUS, UNIT, usd,
  listRenderProjects, createRenderProject, loadRenderDetail, decideEstimate, repriceProject, watchRender,
} from './renderApi.js'

const f = {
  label:  { display:'block', fontSize:'11px', fontWeight:500, color:'#5B6B7F', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'5px' },
  input:  { width:'100%', padding:'8px 10px', fontSize:'13px', border:'1px solid #CBD8E6', borderRadius:'8px', background:'#fff', color:'#0D1B2A', boxSizing:'border-box' },
  btn:    { padding:'8px 14px', fontSize:'13px', fontWeight:500, borderRadius:'8px', border:'1px solid #CBD8E6', background:'#fff', color:'#0D1B2A', cursor:'pointer' },
  primary:{ padding:'8px 14px', fontSize:'13px', fontWeight:500, borderRadius:'8px', border:'1px solid #0F6E56', background:'#0F6E56', color:'#fff', cursor:'pointer' },
  card:   { ...styles.card, padding:'16px' },
  warn:   { padding:'10px 12px', background:'#FFF8E6', border:'1px solid #F0DFB0', borderRadius:'10px', fontSize:'13px', color:'#6B5320', marginTop:'10px' },
  err:    { padding:'10px 12px', background:'#FDECE7', border:'1px solid #F2C4B5', borderRadius:'10px', fontSize:'13px', color:'#7A2E14', marginTop:'10px' },
  th:     { textAlign:'left', padding:'8px 6px', fontSize:'11px', color:'#5B6B7F', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid #CBD8E6' },
  td:     { padding:'8px 6px', fontSize:'13px', color:'#0D1B2A', borderBottom:'1px solid #EEF2F7' },
}
const num = { textAlign:'right', fontVariantNumeric:'tabular-nums' }

const SCRIPT_HINT = `[SCENE: Ellis Island | crowded ferry arriving, 1907, sepia photograph]
NARRATOR: Between 1892 and 1954, twelve million people passed through this island.
LOWER THIRD: Ellis Island, New York Harbor
MUSIC: hopeful strings

[SCENE: Title]
ON SCREEN: Part One — The Golden Door

(Plain prose works too — it is split into beats automatically.)`

export default function RenderEngine({ studioProjects = [] }) {
  const { tenant } = useTenant()
  const orgId = tenant?.id ?? null
  const canApprove = APPROVER_ROLES.includes(String(tenant?.role ?? '').toUpperCase())
  const [state, setState] = useState({ loading: true, error: null, rows: [] })
  const [selected, setSelected] = useState(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    if (!orgId) { setState({ loading: false, error: null, rows: [] }); return }
    try { setState({ loading: false, error: null, rows: await listRenderProjects(orgId) }) }
    catch (error) { setState(s => ({ ...s, loading: false, error })) }
  }, [orgId])
  useEffect(() => { load() }, [load])

  if (!orgId) {
    return <div style={f.warn}>Rendering is tenant-scoped. Pick a workspace with Creator Studio enabled to start a production.</div>
  }

  return (
    <div style={{ display:'grid', gap:'12px' }}>
      <div style={{ display:'flex', gap:'10px', alignItems:'center', flexWrap:'wrap' }}>
        <button style={f.primary} onClick={() => { setCreating(v => !v); setSelected(null) }}>{creating ? 'Cancel' : '+ New production'}</button>
        <span style={styles.sub}>Script to finished video, rendered in house. Nothing spends until an owner approves the estimate.</span>
      </div>
      {creating && (
        <NewProduction orgId={orgId} studioProjects={studioProjects}
          onDone={id => { setCreating(false); setSelected(id); load() }} />
      )}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:'16px', alignItems:'start' }}>
        <div style={f.card}>
          <div style={styles.title}>Productions</div>
          <DataState loading={state.loading} error={state.error} rows={state.rows} empty="No productions yet. Paste an episode script to get a price.">
            {state.rows.map(p => (
              <button key={p.id} onClick={() => { setSelected(p.id); setCreating(false) }}
                style={{ display:'block', width:'100%', textAlign:'left', background: selected === p.id ? '#F2F8F5' : 'none', border:'none', borderTop:'1px solid #F0F4F8', padding:'10px 6px', cursor:'pointer' }}>
                <div style={{ display:'flex', justifyContent:'space-between', gap:'8px' }}>
                  <span style={{ fontSize:'13px', fontWeight:500, color:'#0D1B2A' }}>{p.title}</span>
                  <Pill tone={STATUS[p.status]?.tone}>{STATUS[p.status]?.label ?? p.status}</Pill>
                </div>
                <div style={styles.sub}>
                  {p.series ? `${p.series}${p.episode != null ? ` · Ep ${p.episode}` : ''} · ` : ''}{(p.aspect_ratios ?? []).join(' ')}
                </div>
              </button>
            ))}
          </DataState>
        </div>
        <div style={{ gridColumn:'span 2', minWidth:0 }}>
          {selected
            ? <ProductionDetail key={selected} projectId={selected} canApprove={canApprove} onChange={load} />
            : <div style={{ ...f.card, ...styles.sub }}>Pick a production, or start a new one.</div>}
        </div>
      </div>
    </div>
  )
}

function NewProduction({ orgId, studioProjects, onDone }) {
  const [v, setV] = useState({ title:'', series:'', episode:'', script:'', look:'', ratios:['16:9'], burn:true, studioProjectId:'' })
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = k => e => setV(x => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const toggle = r => setV(x => ({ ...x, ratios: x.ratios.includes(r) ? x.ratios.filter(y => y !== r) : [...x.ratios, r] }))

  async function save() {
    if (!v.title.trim() || !v.script.trim() || !v.ratios.length) { setErr('Title, script and at least one format are required.'); return }
    setBusy(true); setErr(null)
    try {
      const row = await createRenderProject({ orgId, ...v, episode: v.episode.replace(/\D/g, ''), burnCaptions: v.burn })
      onDone(row.id)
    } catch (e) { setErr(e.message ?? String(e)) } finally { setBusy(false) }
  }

  return (
    <div style={f.card}>
      <div style={{ ...styles.title, marginBottom:'12px' }}>New production</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:'12px' }}>
        <label><span style={f.label}>Title</span><input style={f.input} value={v.title} onChange={set('title')} placeholder="The Golden Door" /></label>
        <label><span style={f.label}>Series</span><input style={f.input} value={v.series} onChange={set('series')} placeholder="Immigration in America" /></label>
        <label><span style={f.label}>Episode</span><input style={f.input} value={v.episode} onChange={set('episode')} inputMode="numeric" /></label>
        <label><span style={f.label}>Studio project (optional)</span>
          <select style={f.input} value={v.studioProjectId} onChange={set('studioProjectId')}>
            <option value="">— none —</option>
            {studioProjects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </label>
      </div>
      <label style={{ display:'block', marginTop:'12px' }}><span style={f.label}>Script</span>
        <textarea style={{ ...f.input, fontFamily:'ui-monospace, Menlo, monospace', minHeight:'240px', resize:'vertical' }}
          value={v.script} onChange={set('script')} placeholder={SCRIPT_HINT} spellCheck />
      </label>
      <label style={{ display:'block', marginTop:'12px' }}><span style={f.label}>Visual look (added to every image prompt)</span>
        <input style={f.input} value={v.look} onChange={set('look')} placeholder="archival documentary, warm film grain, soft natural light" />
      </label>
      <div style={{ display:'flex', gap:'18px', flexWrap:'wrap', alignItems:'center', marginTop:'12px', fontSize:'13px' }}>
        {RATIOS.map(([r, l]) => (
          <label key={r} style={{ display:'flex', gap:'6px', alignItems:'center' }}>
            <input type="checkbox" checked={v.ratios.includes(r)} onChange={() => toggle(r)} />{r} ({l})
          </label>
        ))}
        <label style={{ display:'flex', gap:'6px', alignItems:'center' }}>
          <input type="checkbox" checked={v.burn} onChange={set('burn')} />Burn in captions
        </label>
      </div>
      {err && <div style={f.err}>{err}</div>}
      <div style={{ display:'flex', justifyContent:'flex-end', marginTop:'12px' }}>
        <button style={f.primary} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Plan scenes & get estimate'}</button>
      </div>
    </div>
  )
}

function ProductionDetail({ projectId, canApprove, onChange }) {
  const [d, setD] = useState({ loading: true, error: null })
  const [note, setNote] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try { setD({ loading: false, error: null, ...(await loadRenderDetail(projectId)) }) }
    catch (error) { setD(s => ({ ...s, loading: false, error })) }
  }, [projectId])
  useEffect(() => { load(); return watchRender(projectId, load) }, [load, projectId])

  const fallbackLines = useMemo(() => (d.estimate?.lines ?? []).filter(l => l.fallback), [d.estimate])

  async function decide(decision) {
    setBusy(true); setErr(null)
    try { await decideEstimate(d.project, d.estimate, decision, note); onChange(); await load() }
    catch (e) { setErr(e.message ?? String(e)) } finally { setBusy(false) }
  }
  async function reprice() {
    setBusy(true); setErr(null)
    try { await repriceProject(projectId); onChange(); await load() }
    catch (e) { setErr(e.message ?? String(e)) } finally { setBusy(false) }
  }

  if (d.loading || d.error || !d.project) return <DataState loading={d.loading} error={d.error} rows={d.project ? [1] : []} empty="Production not found." />
  const { project, estimate, job, renders, sceneCount } = d
  const showEstimate = estimate && ['awaiting_approval', 'approved', 'running', 'rendered', 'published'].includes(project.status)

  return (
    <div style={{ display:'grid', gap:'12px' }}>
      <div style={f.card}>
        <div style={{ display:'flex', gap:'10px', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap' }}>
          <div style={{ fontSize:'16px', fontWeight:500, color:'#0D1B2A' }}>{project.title}</div>
          <Pill tone={STATUS[project.status]?.tone}>{STATUS[project.status]?.label ?? project.status}</Pill>
        </div>
        <div style={styles.sub}>{sceneCount} scenes · {(project.aspect_ratios ?? []).join(', ')}</div>
        {project.status === 'estimating' && <div style={{ ...styles.sub, marginTop:'8px' }}>The render worker is planning scenes and pricing each stage. This updates on its own.</div>}
        {['rejected', 'failed', 'rendered'].includes(project.status) && (
          <div style={{ marginTop:'10px' }}><button style={f.btn} disabled={busy} onClick={reprice}>Re-plan & re-price</button></div>
        )}
      </div>

      {showEstimate && (
        <div style={f.card}>
          <div style={{ ...styles.title, marginBottom:'8px' }}>Cost estimate</div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr><th style={f.th}>Stage</th><th style={f.th}>Engine</th><th style={{ ...f.th, ...num }}>Units</th><th style={{ ...f.th, ...num }}>Cost</th></tr></thead>
              <tbody>
                {(estimate.lines ?? []).map(l => (
                  <tr key={l.stage}>
                    <td style={f.td}>{l.stage}</td>
                    <td style={f.td}>{l.provider} {l.fallback && <Pill tone="warn">paid fallback</Pill>}</td>
                    <td style={{ ...f.td, ...num }}>{l.units} {UNIT[l.stage] ?? ''}</td>
                    <td style={{ ...f.td, ...num }}>{usd(l.totalUsd)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td style={{ ...f.td, fontWeight:600 }} colSpan={3}>Total</td><td style={{ ...f.td, ...num, fontWeight:600 }}>{usd(estimate.total_usd)}</td></tr></tfoot>
            </table>
          </div>
          {fallbackLines.length > 0 && (
            <div style={f.warn}>An in-house engine wasn&apos;t available for {fallbackLines.map(l => l.stage).join(', ')}, so this plan uses a paid service. Reject and re-price once the engine is back to keep it in house.</div>
          )}
          {project.status === 'awaiting_approval' && (canApprove ? (
            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', marginTop:'12px' }}>
              <input style={{ ...f.input, flex:1, minWidth:'160px', width:'auto' }} value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)" />
              <button style={f.btn} disabled={busy} onClick={() => decide('rejected')}>Reject</button>
              <button style={f.primary} disabled={busy} onClick={() => decide('approved')}>Approve {usd(estimate.total_usd)} and render</button>
            </div>
          ) : <div style={{ ...styles.sub, marginTop:'10px' }}>Waiting for a workspace owner to approve.</div>)}
        </div>
      )}

      {job && (
        <div style={f.card}>
          <div style={{ ...styles.title, marginBottom:'8px' }}>Render</div>
          <div role="progressbar" aria-valuenow={Number(job.progress)} aria-valuemin={0} aria-valuemax={100}
            style={{ height:'6px', background:'#EEF2F7', borderRadius:'6px' }}>
            <div style={{ width:`${Number(job.progress) || 0}%`, height:'100%', background:'#0F6E56', borderRadius:'6px', transition:'width .4s ease' }} />
          </div>
          <div style={{ ...styles.sub, marginTop:'6px' }}>
            {job.status === 'done' ? 'Finished' : job.stage ? `Stage: ${job.stage}` : 'Queued'} · spent {usd(job.spent_usd)}
          </div>
          {job.status === 'needs_reapproval' && (
            <div style={f.warn}>The plan changed or a stage ran over its approved amount, so the render paused. {job.error}</div>
          )}
          {job.status === 'failed' && <div style={f.err}>{job.error}</div>}
        </div>
      )}

      {renders.length > 0 && (
        <div style={f.card}>
          <div style={{ ...styles.title, marginBottom:'8px' }}>Outputs</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:'12px' }}>
            {renders.map(r => (
              <figure key={r.id} style={{ margin:0 }}>
                {r.url
                  ? <video src={r.url} controls preload="metadata" style={{ width:'100%', maxHeight:'420px', background:'#000', borderRadius:'8px', aspectRatio: r.width && r.height ? `${r.width} / ${r.height}` : undefined }} />
                  : <div style={styles.sub}>Link unavailable</div>}
                <figcaption style={{ display:'flex', justifyContent:'space-between', ...styles.sub }}>
                  <span>{r.width}×{r.height}</span>
                  {r.url && <a href={r.url} download>Download</a>}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}
      {err && <div style={f.err}>{err}</div>}
    </div>
  )
}
