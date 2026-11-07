// src/modules/studio/renderApi.js
// ── Creator Studio render engine — Supabase calls.
//    Tenant-scoped (core.tenant) and gated on the growth.studio module by RLS
//    (sql/0020_creator_studio_engine.sql). The browser only writes projects,
//    scenes and approvals; the GPU worker prices and renders with the service
//    role. Nothing spends until an OWNER/ADMIN approves the latest estimate.

import { supabase } from '../../lib/supabase.js'

export const RENDER_BUCKET = 'creator-studio'
export const RATIOS = [['16:9', 'YouTube'], ['9:16', 'Shorts / Reels'], ['1:1', 'Feed']]
export const APPROVER_ROLES = ['OWNER', 'ADMIN']

export const STATUS = {
  draft:             { label: 'Draft',          tone: 'neutral' },
  estimating:        { label: 'Pricing…',       tone: 'info' },
  awaiting_approval: { label: 'Needs approval', tone: 'warn' },
  approved:          { label: 'Queued',         tone: 'info' },
  running:           { label: 'Rendering',      tone: 'info' },
  rendered:          { label: 'Ready',          tone: 'good' },
  published:         { label: 'Published',      tone: 'good' },
  rejected:          { label: 'Rejected',       tone: 'bad' },
  failed:            { label: 'Failed',         tone: 'bad' },
}
export const UNIT = { tts: 's voice', image: 'images', video: 's motion', music: 's score', captions: 's audio', compose: 's render' }
export const usd = n => `$${Number(n ?? 0).toFixed(2)}`

const must = ({ data, error }) => { if (error) throw error; return data }

export const listRenderProjects = orgId =>
  supabase.from('cs_projects')
    .select('id,title,series,episode,status,aspect_ratios,studio_project_id,updated_at')
    .eq('org_id', orgId).order('updated_at', { ascending: false }).then(must)

/** Creates a production and asks the worker to plan scenes and price it. */
export const createRenderProject = ({ orgId, title, series, episode, script, ratios, look, burnCaptions, studioProjectId }) =>
  supabase.from('cs_projects').insert({
    org_id: orgId,
    studio_project_id: studioProjectId || null,
    title: title.trim().slice(0, 200),
    series: series.trim() || null,
    episode: episode ? Number(episode) : null,
    script,
    aspect_ratios: ratios,
    style: { ...(look.trim() ? { look: look.trim() } : {}), burnCaptions: String(burnCaptions) },
    status: 'estimating',
  }).select('id').single().then(must)

export async function loadRenderDetail(projectId) {
  const [p, e, j, a, s] = await Promise.all([
    supabase.from('cs_projects').select('*').eq('id', projectId).single(),
    supabase.from('cs_cost_estimates').select('*').eq('project_id', projectId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('cs_jobs').select('*').eq('project_id', projectId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('cs_assets').select('id,kind,storage_path,width,height,provenance').eq('project_id', projectId).eq('kind', 'render'),
    supabase.from('cs_scenes').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
  ])
  for (const r of [p, e, j, a, s]) if (r.error) throw r.error
  const renders = a.data ?? []
  let urls = {}
  if (renders.length) {
    const { data } = await supabase.storage.from(RENDER_BUCKET).createSignedUrls(renders.map(r => r.storage_path), 3600)
    urls = Object.fromEntries((data ?? []).filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]))
  }
  return {
    project: p.data, estimate: e.data, job: j.data, sceneCount: s.count ?? 0,
    renders: renders.map(r => ({ ...r, url: urls[r.storage_path] })),
  }
}

/** Approve or reject the latest estimate. RLS refuses non-approvers, other tenants and stale estimates. */
export const decideEstimate = (project, estimate, decision, note) =>
  supabase.from('cs_approvals').insert({
    org_id: project.org_id, estimate_id: estimate.id, decision, note: note.trim() || null,
  }).then(must)

/** Re-price: drop the old scene plan so the worker re-plans from the current script. */
export async function repriceProject(projectId) {
  await supabase.from('cs_scenes').delete().eq('project_id', projectId).then(must)
  await supabase.from('cs_projects').update({ status: 'estimating' }).eq('id', projectId).then(must)
}

/** Live progress: job rows stream over realtime; a slow poll covers missed events. */
export function watchRender(projectId, onChange) {
  const ch = supabase.channel(`cs-job-${projectId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cs_jobs', filter: `project_id=eq.${projectId}` }, onChange)
    .subscribe()
  const t = setInterval(onChange, 10000)
  return () => { supabase.removeChannel(ch); clearInterval(t) }
}
