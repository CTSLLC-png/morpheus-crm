// tools/video/publish.mjs
// ── Puts a finished render into the Creator Studio asset vault, so nobody has
//    to upload it by hand. Talks only to the studio-agent edge function, which
//    accepts files under renders/ in the private studio-assets bucket.
//
//    STUDIO_AGENT_KEY=… node publish.mjs scripts/<name>.json
//
//    The script JSON may carry "studioProjectId" (a Creator Studio project id)
//    to attach the files to that project. Without it they land in the vault
//    unattached. Running twice for the same run id lists each file once.

import { readFileSync, existsSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import { pathToFileURL } from 'node:url'

const DEFAULT_URL = 'https://ymavrmekxiwdphdyteau.supabase.co/functions/v1/studio-agent'
const MAX_BYTES = 50 * 1024 * 1024 // the bucket's per-file limit

/** The files render.mjs writes for one script, with vault names. */
export function renderOutputs(script, name, outDir = 'out') {
  const files = []
  for (const o of script.outputs ?? []) {
    files.push({ file: `${outDir}/${name}-${o.name}.mp4`, label: `${script.title} (${o.name})`, tags: [o.name] })
    files.push({ file: `${outDir}/${name}-${o.name}-thumb.jpg`, label: `${script.title} thumbnail (${o.name})`, tags: [o.name, 'thumbnail'] })
  }
  files.push({ file: `${outDir}/${name}.srt`, label: `${script.title} captions`, tags: ['captions'] })
  return files
}

/** Vault path for a file: renders/<script>/<run>/<file>. */
export function vaultPath(name, runId, file) {
  const clean = s => String(s).replace(/[^A-Za-z0-9_.-]+/g, '-')
  return `renders/${clean(name)}/${clean(runId)}/${clean(basename(file))}`
}

export async function publish({ scriptPath, url = DEFAULT_URL, key, runId, outDir = 'out', fetchImpl = fetch, log = console.log }) {
  if (!key) throw new Error('STUDIO_AGENT_KEY is not set')
  const script = JSON.parse(readFileSync(scriptPath, 'utf8'))
  const name = basename(scriptPath, '.json')

  const call = async body => {
    const r = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-studio-key': key }, body: JSON.stringify(body) })
    const data = await r.json().catch(() => ({}))
    if (!r.ok || !data.ok) throw new Error(`studio-agent ${body.action} failed (${r.status}): ${data.error ?? 'no detail'}`)
    return data
  }

  const outputs = renderOutputs(script, name, outDir)
  for (const o of outputs) {
    if (!existsSync(o.file)) throw new Error(`Missing ${o.file}. Render first: npm run render -- ${scriptPath}`)
    if (statSync(o.file).size > MAX_BYTES) throw new Error(`${o.file} is over the vault's 50 MB per-file limit`)
  }

  const assets = []
  for (const o of outputs) {
    const path = vaultPath(name, runId, o.file)
    const signed = await call({ action: 'sign_upload', path })
    const put = await fetchImpl(signed.url, {
      method: 'PUT',
      headers: { 'content-type': signed.content_type, 'x-upsert': 'true' },
      body: readFileSync(o.file),
    })
    if (!put.ok) throw new Error(`Upload of ${o.file} failed (${put.status})`)
    log(`  ↑ ${path}`)
    assets.push({ path, name: o.label, tags: o.tags, notes: `Rendered from ${basename(scriptPath)}, run ${runId}` })
  }

  const done = await call({ action: 'register', project_id: script.studioProjectId ?? null, assets })
  log(`  ✓ ${done.registered} file(s) listed in the vault${done.project_id ? ` on project ${done.project_id}` : ''}`)
  return { assets, ...done }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const scriptPath = process.argv[2]
  if (!scriptPath) { console.error('Usage: node publish.mjs scripts/<name>.json'); process.exit(1) }
  publish({
    scriptPath,
    url: process.env.STUDIO_AGENT_URL || DEFAULT_URL,
    key: process.env.STUDIO_AGENT_KEY,
    runId: process.env.GITHUB_RUN_ID || new Date().toISOString().replace(/[:.]/g, '-'),
  }).catch(e => { console.error(e.message); process.exit(1) })
}
