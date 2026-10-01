// src/modules/studio/CreatorStudio.jsx
// ── Creator Studio — production workspace inside Morpheus.
//    Overview · Projects · Asset vault · Production queue, laid out like the
//    stand-alone creator-studio-cinema site it replaces. Approved Campaign
//    Studio assets arrive here as projects with their queue already filled.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.jsx'
import { ModuleHeader, Pill, DataState, styles } from '../common/ModuleFrame.jsx'
import {
  STAGES, PROJECT_KINDS, ASSET_KINDS, PRIORITIES,
  listProjects, listTasks, listAssets, createProject, updateProject, createTasks, updateTask,
  createAssets, updateAsset, setFinalMedia, uploadAssetFile, signedUrls, parseBulkAssets, guessKind,
} from './studioApi.js'

const TABS = [['overview', 'Overview'], ['projects', 'Projects'], ['vault', 'Asset vault'], ['queue', 'Production queue']]
const PRIORITY_TONE = { critical: 'bad', high: 'warn', normal: 'info', low: 'neutral' }
const STAGE_TONE = { delivered: 'good', 'final-cut': 'good', 'on-hold': 'neutral' }
const label = s => s.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase())
const today = () => new Date().toISOString().slice(0, 10)

const f = {
  label:  { display:'block', fontSize:'11px', fontWeight:500, color:'#5B6B7F', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'5px' },
  input:  { width:'100%', padding:'8px 10px', fontSize:'13px', border:'1px solid #CBD8E6', borderRadius:'8px', background:'#fff', color:'#0D1B2A', boxSizing:'border-box' },
  btn:    { padding:'8px 14px', fontSize:'13px', fontWeight:500, borderRadius:'8px', border:'1px solid #CBD8E6', background:'#fff', color:'#0D1B2A', cursor:'pointer' },
  primary:{ padding:'8px 14px', fontSize:'13px', fontWeight:500, borderRadius:'8px', border:'1px solid #0F6E56', background:'#0F6E56', color:'#fff', cursor:'pointer' },
  grid:   { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:'12px' },
  pre:    { whiteSpace:'pre-wrap', fontFamily:'inherit', fontSize:'13px', lineHeight:1.55, color:'#0D1B2A', margin:0 },
}

export default function CreatorStudio() {
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState(params.get('project') ? 'projects' : 'overview')
  const [data, setData] = useState({ loading: true, error: null, projects: [], tasks: [], assets: [] })

  const load = useCallback(async () => {
    try {
      const [projects, tasks, assets] = await Promise.all([listProjects(), listTasks(), listAssets()])
      setData({ loading: false, error: null, projects, tasks, assets })
    } catch (error) {
      setData(d => ({ ...d, loading: false, error }))
    }
  }, [])
  useEffect(() => { load() }, [load])

  const openId = params.get('project')
  const openProject = id => { setTab('projects'); setParams(id ? { project: id } : {}, { replace: true }) }

  return (
    <div>
      <ModuleHeader title="Creator Studio" subtitle="Production workspace · projects, asset vault and production handoffs" />
      <div role="tablist" aria-label="Creator Studio" style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'16px' }}>
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} style={tab === k ? f.primary : f.btn}
            onClick={() => { setTab(k); if (k !== 'projects') setParams({}, { replace: true }) }}>
            {l}{k === 'queue' && openCount(data.tasks) > 0 ? ` · ${openCount(data.tasks)}` : ''}
          </button>
        ))}
      </div>
      <DataState loading={data.loading} error={data.error} rows={[1]}>
        {tab === 'overview' && <Overview {...data} onOpen={openProject} />}
        {tab === 'projects' && <Projects {...data} openId={openId} onOpen={openProject} reload={load} />}
        {tab === 'vault'    && <Vault {...data} reload={load} />}
        {tab === 'queue'    && <Queue {...data} onOpen={openProject} reload={load} />}
      </DataState>
    </div>
  )
}

const openCount = tasks => tasks.filter(t => t.status !== 'done').length

function progressOf(projectId, tasks) {
  const mine = tasks.filter(t => t.project_id === projectId)
  if (!mine.length) return null
  return Math.round((mine.filter(t => t.status === 'done').length / mine.length) * 100)
}

// ── Overview ────────────────────────────────────────────────────────────────
function Overview({ projects, tasks, assets, onOpen }) {
  const active = projects.filter(p => !['delivered', 'on-hold'].includes(p.stage))
  const progresses = active.map(p => progressOf(p.id, tasks)).filter(v => v !== null)
  const avg = progresses.length ? Math.round(progresses.reduce((a, b) => a + b, 0) / progresses.length) : 0
  const next = sortQueue(tasks.filter(t => t.status !== 'done')).slice(0, 6)
  const byId = Object.fromEntries(projects.map(p => [p.id, p]))
  return (
    <div style={{ display:'grid', gap:'16px' }}>
      <div style={f.grid}>
        <Metric label="Active projects" value={active.length} sub="Across every production stage" />
        <Metric label="Open tasks" value={openCount(tasks)} sub="Production handoffs" />
        <Metric label="Assets indexed" value={assets.length} sub="Voice, image, video and docs" />
        <Metric label="Average progress" value={`${avg}%`} sub="Portfolio-wide completion" />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:'16px' }}>
        <div style={{ ...styles.card, padding:'16px' }}>
          <div style={styles.title}>Projects in motion</div>
          {active.length === 0 && <div style={{ ...styles.sub, marginTop:'10px' }}>No active projects. Create one, or send an approved asset from Campaign Studio.</div>}
          {active.slice(0, 6).map(p => <ProjectRow key={p.id} p={p} pct={progressOf(p.id, tasks)} onOpen={onOpen} />)}
        </div>
        <div style={{ ...styles.card, padding:'16px' }}>
          <div style={styles.title}>Next up</div>
          {next.length === 0 && <div style={{ ...styles.sub, marginTop:'10px' }}>The production queue is clear.</div>}
          {next.map(t => (
            <button key={t.id} onClick={() => onOpen(t.project_id)} style={{ display:'flex', gap:'8px', alignItems:'center', width:'100%', textAlign:'left', background:'none', border:'none', borderTop:'1px solid #F0F4F8', padding:'10px 0', cursor:'pointer' }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:'13px', color:'#0D1B2A' }}>{t.title}</div>
                <div style={styles.sub}>{byId[t.project_id]?.title ?? 'Project'}{t.due_date ? ` · due ${t.due_date}` : ''}</div>
              </div>
              <Pill tone={PRIORITY_TONE[t.priority]}>{label(t.priority)}</Pill>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function ProjectRow({ p, pct, onOpen }) {
  return (
    <button onClick={() => onOpen(p.id)} style={{ display:'block', width:'100%', textAlign:'left', background:'none', border:'none', borderTop:'1px solid #F0F4F8', padding:'10px 0', cursor:'pointer' }}>
      <div style={{ display:'flex', justifyContent:'space-between', gap:'8px' }}>
        <span style={{ fontSize:'13px', fontWeight:500, color:'#0D1B2A' }}>{p.title}</span>
        <span style={{ fontSize:'12px', fontFamily:'monospace', color:'#5B6B7F' }}>{pct === null ? '—' : `${pct}%`}</span>
      </div>
      <div style={styles.sub}>{label(p.kind)} · {label(p.stage)}{p.air_date ? ` · airs ${p.air_date}` : ''}</div>
      <div style={{ height:'4px', background:'#EEF2F7', borderRadius:'4px', marginTop:'6px' }}>
        <div style={{ width:`${pct ?? 0}%`, height:'100%', background:'#0F6E56', borderRadius:'4px' }} />
      </div>
    </button>
  )
}

// ── Projects ────────────────────────────────────────────────────────────────
function Projects({ projects, tasks, assets, openId, onOpen, reload }) {
  const [creating, setCreating] = useState(false)
  const open = projects.find(p => p.id === openId)
  if (open) return <ProjectDetail project={open} tasks={tasks.filter(t => t.project_id === open.id)} assets={assets.filter(a => a.project_id === open.id)} onBack={() => onOpen(null)} reload={reload} />
  return (
    <div style={{ display:'grid', gap:'12px' }}>
      <div><button style={f.primary} onClick={() => setCreating(v => !v)}>{creating ? 'Cancel' : '+ New project'}</button></div>
      {creating && <NewProject onCreated={p => { setCreating(false); reload().then(() => onOpen(p.id)) }} />}
      {projects.length === 0
        ? <div style={styles.pad}>No projects yet.</div>
        : <div style={{ ...styles.card, padding:'4px 16px' }}>{projects.map(p => <ProjectRow key={p.id} p={p} pct={progressOf(p.id, tasks)} onOpen={onOpen} />)}</div>}
    </div>
  )
}

function NewProject({ onCreated }) {
  const [v, setV] = useState({ title: '', kind: 'explainer', stage: 'idea', logline: '', air_date: '' })
  const [err, setErr] = useState(null)
  const set = k => e => setV(x => ({ ...x, [k]: e.target.value }))
  async function save() {
    setErr(null)
    try { onCreated(await createProject({ ...v, air_date: v.air_date || null, logline: v.logline || null })) }
    catch (e) { setErr(e.message) }
  }
  return (
    <div style={{ ...styles.card, padding:'16px', display:'grid', gap:'12px' }}>
      <div style={f.grid}>
        <Field label="Title"><input style={f.input} value={v.title} onChange={set('title')} /></Field>
        <Field label="Type"><Select value={v.kind} onChange={set('kind')} options={PROJECT_KINDS} /></Field>
        <Field label="Stage"><Select value={v.stage} onChange={set('stage')} options={STAGES} /></Field>
        <Field label="Air date"><input type="date" style={f.input} value={v.air_date} onChange={set('air_date')} /></Field>
      </div>
      <Field label="Logline"><input style={f.input} value={v.logline} onChange={set('logline')} /></Field>
      {err && <div style={styles.error}>{err}</div>}
      <div><button style={f.primary} disabled={!v.title.trim()} onClick={save}>Create project</button></div>
    </div>
  )
}

function ProjectDetail({ project, tasks, assets, onBack, reload }) {
  const [msg, setMsg] = useState(null)
  const [media, setMedia] = useState(project.final_media_url ?? '')
  const [newTask, setNewTask] = useState({ title: '', priority: 'normal', due_date: '' })
  const [showBrief, setShowBrief] = useState(false)
  const pct = progressOf(project.id, tasks)
  const mediaValid = !media.trim() || /^https:\/\/\S+$/.test(media.trim())

  const act = async (fn, ok) => { setMsg(null); try { await fn(); if (ok) setMsg(ok); await reload() } catch (e) { setMsg(e.message) } }

  return (
    <div style={{ display:'grid', gap:'14px' }}>
      <div><button style={f.btn} onClick={onBack}>← All projects</button></div>
      <div style={{ ...styles.card, padding:'16px', display:'grid', gap:'12px' }}>
        <div style={{ display:'flex', gap:'10px', alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ fontSize:'17px', fontWeight:500, color:'#0D1B2A', flex:'1 1 auto' }}>{project.title}</div>
          <Pill tone={STAGE_TONE[project.stage] ?? 'info'}>{label(project.stage)}</Pill>
          {project.campaign_asset_id && <Pill tone="neutral">From Campaign Studio</Pill>}
          <span style={{ fontFamily:'monospace', fontSize:'13px' }}>{pct === null ? '—' : `${pct}%`}</span>
        </div>
        {project.logline && <div style={styles.sub}>{project.logline}</div>}
        <div style={f.grid}>
          <Field label="Stage"><Select value={project.stage} options={STAGES}
            onChange={e => act(() => updateProject(project.id, { stage: e.target.value }))} /></Field>
          <Field label="Type"><Select value={project.kind} options={PROJECT_KINDS}
            onChange={e => act(() => updateProject(project.id, { kind: e.target.value }))} /></Field>
          <Field label="Air date"><input type="date" style={f.input} defaultValue={project.air_date ?? ''}
            onBlur={e => e.target.value !== (project.air_date ?? '') && act(() => updateProject(project.id, { air_date: e.target.value || null }))} /></Field>
        </div>
        <div style={{ display:'flex', gap:'8px', alignItems:'flex-end', flexWrap:'wrap' }}>
          <div style={{ flex:'1 1 280px' }}>
            <Field label="Final cut / delivered media link">
              <input style={f.input} value={media} onChange={e => setMedia(e.target.value)} placeholder="https://…" />
            </Field>
          </div>
          <button style={f.primary} disabled={!mediaValid || media === (project.final_media_url ?? '')}
            onClick={() => act(() => setFinalMedia(project, media), project.campaign_asset_id ? 'Saved. The campaign asset now shows this media too.' : 'Saved.')}>Save</button>
          {project.final_media_url && <a href={project.final_media_url} target="_blank" rel="noreferrer" style={{ fontSize:'13px', alignSelf:'center' }}>Open ↗</a>}
        </div>
        {!mediaValid && <div style={{ fontSize:'12px', color:'#993C1D' }}>Use a full https:// link.</div>}
        {project.brief && (
          <div>
            <button style={f.btn} onClick={() => setShowBrief(v => !v)} aria-expanded={showBrief}>{showBrief ? 'Hide brief' : 'Show production brief'}</button>
            {showBrief && <pre style={{ ...f.pre, marginTop:'10px', background:'#F7F9FC', padding:'12px', borderRadius:'8px' }}>{project.brief}</pre>}
          </div>
        )}
        {msg && <div style={styles.notice} role="status">{msg}</div>}
      </div>

      <div style={{ ...styles.card, padding:'16px' }}>
        <div style={styles.title}>Production queue</div>
        <TaskList tasks={sortQueue(tasks, true)} reload={reload} />
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', marginTop:'12px' }}>
          <input style={{ ...f.input, flex:'2 1 220px' }} placeholder="New task" value={newTask.title} onChange={e => setNewTask(t => ({ ...t, title: e.target.value }))} />
          <div style={{ flex:'0 1 130px' }}><Select value={newTask.priority} options={PRIORITIES} onChange={e => setNewTask(t => ({ ...t, priority: e.target.value }))} /></div>
          <input type="date" style={{ ...f.input, flex:'0 1 160px' }} value={newTask.due_date} onChange={e => setNewTask(t => ({ ...t, due_date: e.target.value }))} />
          <button style={f.btn} disabled={!newTask.title.trim()} onClick={() => act(async () => {
            await createTasks([{ project_id: project.id, title: newTask.title.trim(), priority: newTask.priority, due_date: newTask.due_date || null, sort: tasks.length }])
            setNewTask({ title: '', priority: 'normal', due_date: '' })
          })}>Add task</button>
        </div>
      </div>

      <div style={{ ...styles.card, padding:'16px' }}>
        <div style={styles.title}>Project assets</div>
        <div style={{ ...styles.sub, marginBottom:'10px' }}>Attach vault assets from the Asset vault tab (choose this project on the asset).</div>
        <AssetGrid assets={assets} />
      </div>
    </div>
  )
}

// ── Production queue ────────────────────────────────────────────────────────
const PRIORITY_RANK = { critical: 0, high: 1, normal: 2, low: 3 }
function sortQueue(tasks, keepOrder = false) {
  return [...tasks].sort((a, b) =>
    (a.status === 'done') - (b.status === 'done') ||
    (keepOrder ? a.sort - b.sort : 0) ||
    String(a.due_date ?? '9999').localeCompare(String(b.due_date ?? '9999')) ||
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
}

function Queue({ tasks, projects, onOpen, reload }) {
  const [showDone, setShowDone] = useState(false)
  const byId = Object.fromEntries(projects.map(p => [p.id, p]))
  const rows = sortQueue(tasks.filter(t => showDone || t.status !== 'done'))
  return (
    <div style={{ ...styles.card, padding:'16px' }}>
      <label style={{ fontSize:'13px', color:'#5B6B7F', display:'flex', gap:'6px', alignItems:'center' }}>
        <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> Show finished tasks
      </label>
      {rows.length === 0 && <div style={{ ...styles.sub, marginTop:'10px' }}>Nothing in the queue.</div>}
      <TaskList tasks={rows} reload={reload} projectOf={t => byId[t.project_id]} onOpen={onOpen} />
    </div>
  )
}

function TaskList({ tasks, reload, projectOf, onOpen }) {
  const [err, setErr] = useState(null)
  const toggle = async t => {
    setErr(null)
    try { await updateTask(t.id, { status: t.status === 'done' ? 'open' : 'done' }); await reload() } catch (e) { setErr(e.message) }
  }
  const overdue = t => t.status !== 'done' && t.due_date && t.due_date < today()
  return (
    <div>
      {err && <div style={styles.error}>{err}</div>}
      {tasks.map(t => (
        <div key={t.id} style={{ display:'flex', gap:'10px', alignItems:'center', borderTop:'1px solid #F0F4F8', padding:'9px 0' }}>
          <input type="checkbox" checked={t.status === 'done'} onChange={() => toggle(t)} aria-label={`Mark "${t.title}" ${t.status === 'done' ? 'not done' : 'done'}`} />
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:'13px', color:'#0D1B2A', textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}</div>
            <div style={styles.sub}>
              {projectOf && <button onClick={() => onOpen(t.project_id)} style={{ background:'none', border:'none', padding:0, color:'#0C447C', cursor:'pointer', fontSize:'12px' }}>{projectOf(t)?.title ?? 'Project'}</button>}
              {projectOf && t.due_date ? ' · ' : ''}
              {t.due_date && <span style={{ color: overdue(t) ? '#993C1D' : undefined }}>{overdue(t) ? 'overdue · ' : 'due '}{t.due_date}</span>}
            </div>
          </div>
          <Pill tone={PRIORITY_TONE[t.priority]}>{label(t.priority)}</Pill>
        </div>
      ))}
    </div>
  )
}

// ── Asset vault ─────────────────────────────────────────────────────────────
function Vault({ assets, projects, reload }) {
  const { isAdmin } = useAuth()
  const [kind, setKind] = useState('all')
  const [q, setQ] = useState('')
  const [mode, setMode] = useState(null) // 'upload' | 'link' | 'bulk'
  const shown = useMemo(() => assets.filter(a =>
    (kind === 'all' || a.kind === kind) &&
    (!q || `${a.name} ${a.tags.join(' ')} ${a.notes ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [assets, kind, q])

  return (
    <div style={{ display:'grid', gap:'12px' }}>
      <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
        <button style={mode === 'upload' ? f.primary : f.btn} onClick={() => setMode(m => m === 'upload' ? null : 'upload')}>Upload files</button>
        <button style={mode === 'link' ? f.primary : f.btn} onClick={() => setMode(m => m === 'link' ? null : 'link')}>Add a link</button>
        <button style={mode === 'bulk' ? f.primary : f.btn} onClick={() => setMode(m => m === 'bulk' ? null : 'bulk')}>Bulk import</button>
      </div>
      {mode && <AddAssets mode={mode} projects={projects} onDone={() => { setMode(null); reload() }} />}
      <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
        <input style={{ ...f.input, flex:'1 1 220px' }} placeholder="Search name, tag or note" value={q} onChange={e => setQ(e.target.value)} />
        <div style={{ flex:'0 1 180px' }}><Select value={kind} onChange={e => setKind(e.target.value)} options={['all', ...ASSET_KINDS]} /></div>
      </div>
      {shown.length === 0
        ? <div style={styles.pad}>{assets.length ? 'No assets match.' : 'The vault is empty. Upload files, add links, or bulk-import your Creator Studio assets.'}</div>
        : <AssetGrid assets={shown} projects={projects} editable reload={reload} isAdmin={isAdmin} />}
    </div>
  )
}

function AddAssets({ mode, projects, onDone }) {
  const [projectId, setProjectId] = useState('')
  const [link, setLink] = useState({ name: '', url: '', kind: 'image', tags: '' })
  const [bulk, setBulk] = useState('')
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const parsed = useMemo(() => parseBulkAssets(bulk, 'creator-studio-cinema'), [bulk])
  const pid = projectId || null

  async function run() {
    setBusy(true); setMsg(null)
    try {
      if (mode === 'link') {
        await createAssets([{ name: link.name.trim() || link.url.split('/').pop(), url: link.url.trim(), kind: link.kind, project_id: pid,
          tags: link.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) }])
      } else if (mode === 'bulk') {
        await createAssets(parsed.rows.map(r => ({ ...r, project_id: pid })))
      } else {
        const rows = []
        for (const file of files) rows.push({ name: file.name.slice(0, 200), storage_path: await uploadAssetFile(file), kind: guessKind(file.name), project_id: pid, source: 'upload' })
        await createAssets(rows)
      }
      onDone()
    } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }

  const ready = mode === 'link' ? /^https:\/\/\S+$/.test(link.url.trim()) : mode === 'bulk' ? parsed.rows.length > 0 : files.length > 0

  return (
    <div style={{ ...styles.card, padding:'16px', display:'grid', gap:'12px' }}>
      {mode === 'upload' && (
        <Field label="Files (images, video, audio, PDF · up to 50 MB each)">
          <input type="file" multiple accept="image/*,video/*,audio/*,application/pdf,text/plain" onChange={e => setFiles([...e.target.files])} />
        </Field>
      )}
      {mode === 'link' && (
        <div style={f.grid}>
          <Field label="Link (https)"><input style={f.input} value={link.url} onChange={e => setLink(l => ({ ...l, url: e.target.value }))} /></Field>
          <Field label="Name"><input style={f.input} value={link.name} onChange={e => setLink(l => ({ ...l, name: e.target.value }))} /></Field>
          <Field label="Kind"><Select value={link.kind} options={ASSET_KINDS} onChange={e => setLink(l => ({ ...l, kind: e.target.value }))} /></Field>
          <Field label="Tags (comma separated)"><input style={f.input} value={link.tags} onChange={e => setLink(l => ({ ...l, tags: e.target.value }))} /></Field>
        </div>
      )}
      {mode === 'bulk' && (
        <>
          <Field label="One asset per line: link, or Name | link | kind | tags">
            <textarea style={{ ...f.input, minHeight:'160px', fontFamily:'monospace' }} value={bulk} onChange={e => setBulk(e.target.value)}
              placeholder={'Marcus face | https://…/marcus-face.png | character | updraft, anchor\nhttps://…/ridge-road.png'} />
          </Field>
          <div style={styles.sub}>{parsed.rows.length} ready to import{parsed.errors.length ? ` · ${parsed.errors.length} skipped` : ''}</div>
          {parsed.errors.length > 0 && <div style={styles.error}>{parsed.errors.slice(0, 8).map(e => <div key={e}>{e}</div>)}</div>}
        </>
      )}
      <Field label="Attach to project (optional)">
        <Select value={projectId} onChange={e => setProjectId(e.target.value)} options={['', ...projects.map(p => p.id)]}
          labels={{ '': '— Vault only —', ...Object.fromEntries(projects.map(p => [p.id, p.title])) }} />
      </Field>
      {msg && <div style={styles.error}>{msg}</div>}
      <div><button style={f.primary} disabled={!ready || busy} onClick={run}>{busy ? 'Saving…' : 'Add to vault'}</button></div>
    </div>
  )
}

function AssetGrid({ assets, projects = [], editable = false, reload }) {
  const [signed, setSigned] = useState({})
  useEffect(() => {
    const paths = assets.map(a => a.storage_path).filter(Boolean)
    signedUrls(paths).then(setSigned).catch(() => setSigned({}))
  }, [assets])
  if (!assets.length) return <div style={styles.sub}>No assets attached.</div>
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(170px, 1fr))', gap:'12px' }}>
      {assets.map(a => {
        const href = a.storage_path ? signed[a.storage_path] : a.url
        return (
          <div key={a.id} style={{ ...styles.card, display:'flex', flexDirection:'column' }}>
            <div style={{ aspectRatio:'4 / 3', background:'#EEF2F7', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
              {href && ['image', 'character', 'location', 'vehicle', 'logo'].includes(a.kind)
                ? <img src={href} alt={a.name} loading="lazy" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                : href && a.kind === 'video' ? <video src={href} controls preload="metadata" style={{ width:'100%', height:'100%' }} />
                : href && ['audio', 'voice'].includes(a.kind) ? <audio src={href} controls style={{ width:'92%' }} />
                : <span style={{ fontSize:'12px', color:'#5B6B7F' }}>{label(a.kind)}</span>}
            </div>
            <div style={{ padding:'10px', display:'grid', gap:'4px' }}>
              <div style={{ fontSize:'13px', fontWeight:500, color:'#0D1B2A', wordBreak:'break-word' }}>{a.name}</div>
              <div style={styles.sub}>{label(a.kind)}{a.tags.length ? ` · ${a.tags.join(', ')}` : ''}</div>
              {href && <a href={href} target="_blank" rel="noreferrer" style={{ fontSize:'12px' }}>Open ↗</a>}
              {editable && (
                <Select value={a.project_id ?? ''} options={['', ...projects.map(p => p.id)]}
                  labels={{ '': 'Vault only', ...Object.fromEntries(projects.map(p => [p.id, p.title])) }}
                  onChange={e => updateAsset(a.id, { project_id: e.target.value || null }).then(reload)} aria-label={`Project for ${a.name}`} />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Small pieces ────────────────────────────────────────────────────────────
function Field({ label: l, children }) {
  return <label style={{ display:'block' }}><span style={f.label}>{l}</span>{children}</label>
}

function Select({ value, onChange, options, labels, ...rest }) {
  return (
    <select style={f.input} value={value} onChange={onChange} {...rest}>
      {options.map(o => <option key={o} value={o}>{labels?.[o] ?? label(o || '—')}</option>)}
    </select>
  )
}

function Metric({ label: l, value, sub }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #CBD8E6', borderRadius:12, padding:16 }}>
      <div style={{ fontSize:11, color:'#5B6B7F', textTransform:'uppercase', letterSpacing:'.06em' }}>{l}</div>
      <div style={{ fontSize:26, fontFamily:'monospace', marginTop:7 }}>{value}</div>
      <div style={{ fontSize:12, color:'#5B6B7F', marginTop:4 }}>{sub}</div>
    </div>
  )
}
