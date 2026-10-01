// src/modules/studio/studioApi.js
// ── Creator Studio — Supabase calls (RLS: staff read/write, super_admin deletes)

import { supabase } from '../../lib/supabase.js'
import { productionPlan, productionBrief } from '../growth/legacyPlaybook.js'

export const BUCKET = 'studio-assets'

export const STAGES = ['idea', 'pre-production', 'production', 'post-production', 'final-cut', 'delivered', 'on-hold']
export const PROJECT_KINDS = ['film', 'animated-series', 'explainer', 'short-form', 'ad', 'social-image', 'print', 'audio', 'other']
export const ASSET_KINDS = ['image', 'video', 'audio', 'voice', 'character', 'location', 'vehicle', 'logo', 'doc', 'other']
export const PRIORITIES = ['critical', 'high', 'normal', 'low']

const must = ({ data, error }) => { if (error) throw error; return data }

export const listProjects = () =>
  supabase.from('studio_project').select('*').order('updated_at', { ascending: false }).then(must)

export const listTasks = () =>
  supabase.from('studio_task').select('*').order('due_date', { ascending: true, nullsFirst: false }).order('sort').then(must)

export const listAssets = () =>
  supabase.from('studio_asset').select('*').order('created_at', { ascending: false }).limit(500).then(must)

export const createProject = row =>
  supabase.from('studio_project').insert(row).select().single().then(must)

export const updateProject = (id, patch) =>
  supabase.from('studio_project').update(patch).eq('id', id).select().single().then(must)

export const createTasks = rows =>
  rows.length ? supabase.from('studio_task').insert(rows).then(must) : Promise.resolve([])

export const updateTask = (id, patch) =>
  supabase.from('studio_task').update(patch).eq('id', id).then(must)

export const createAssets = rows =>
  supabase.from('studio_asset').insert(rows).select().then(must)

export const updateAsset = (id, patch) =>
  supabase.from('studio_asset').update(patch).eq('id', id).then(must)

/**
 * Opens (or finds) the Creator Studio project for an approved Campaign Studio
 * asset and fills its production queue from the playbook plan. One project
 * per asset, enforced by a unique index, so pressing twice is harmless.
 */
export async function projectFromCampaignAsset(asset) {
  const existing = await supabase.from('studio_project').select('*').eq('campaign_asset_id', asset.id).maybeSingle().then(must)
  if (existing) return { project: existing, created: false }
  const plan = productionPlan(asset)
  const project = await createProject({
    title: plan.title.slice(0, 200),
    kind: plan.projectKind,
    logline: `${plan.type} for ${asset.campaign}${plan.audience ? ` · ${plan.audience}` : ''}`,
    stage: 'pre-production',
    brief: productionBrief(asset),
    air_date: plan.air,
    campaign_asset_id: asset.id,
  })
  await createTasks(plan.queue.map((q, i) => ({ ...q, project_id: project.id, sort: i })))
  return { project, created: true }
}

/** Saves the final cut on the project and mirrors it onto the campaign asset. */
export async function setFinalMedia(project, url) {
  const value = url.trim() || null
  const saved = await updateProject(project.id, { final_media_url: value })
  if (project.campaign_asset_id) {
    await supabase.from('growth_campaign_asset').update({ media_url: value }).eq('id', project.campaign_asset_id).then(must)
  }
  return saved
}

/** Uploads a file to the private vault bucket and returns its storage path. */
export async function uploadAssetFile(file) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in required')
  const safe = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').slice(-80)
  const path = `${user.id}/${Date.now()}-${safe}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined })
  if (error) throw error
  return path
}

/** Short-lived links for private vault files, keyed by storage path. */
export async function signedUrls(paths) {
  if (!paths.length) return {}
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
  if (error) throw error
  return Object.fromEntries((data ?? []).filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]))
}

/**
 * Parses a pasted list for bulk import. One asset per line:
 *   https://link                       → name taken from the file name
 *   Name | https://link                → named
 *   Name | https://link | kind | tags  → with kind and comma-separated tags
 * Returns { rows, errors } so bad lines are reported, not silently dropped.
 */
export function parseBulkAssets(text, source = 'import') {
  const rows = [], errors = []
  text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach((line, i) => {
    const parts = line.split('|').map(p => p.trim())
    const urlIdx = parts.findIndex(p => /^https:\/\/\S+$/.test(p))
    if (urlIdx === -1) { errors.push(`Line ${i + 1}: no https:// link`); return }
    const url = parts[urlIdx]
    const name = (urlIdx > 0 ? parts[0] : decodeURIComponent(url.split('?')[0].split('/').pop() || 'asset')).slice(0, 200)
    const kindRaw = (parts[urlIdx + 1] || '').toLowerCase()
    const kind = ASSET_KINDS.includes(kindRaw) ? kindRaw : guessKind(url)
    const tags = (parts[urlIdx + 2] || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 12)
    rows.push({ name: name || 'asset', url, kind, tags, source })
  })
  return { rows, errors }
}

export function guessKind(nameOrUrl) {
  const ext = String(nameOrUrl).split('?')[0].split('.').pop().toLowerCase()
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image'
  if (['mp4', 'mov', 'webm'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'm4a'].includes(ext)) return 'audio'
  if (['pdf', 'txt', 'doc', 'docx'].includes(ext)) return 'doc'
  return 'other'
}
