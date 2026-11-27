// tools/video/queue.mjs
// ── The render worker's side of the Creator Studio render queue. Staff queue a
//    render in Nguzo → Creator Studio → Render queue; the scheduled run of the
//    Creator Studio render workflow claims it here, renders, files the output
//    with publish.mjs and reports the result back. Talks only to studio-agent.
//
//    STUDIO_AGENT_KEY=… node queue.mjs claim                 → writes job_id, script, project_id to $GITHUB_OUTPUT
//    STUDIO_AGENT_KEY=… node queue.mjs finish <job> done [count]
//    STUDIO_AGENT_KEY=… node queue.mjs finish <job> failed "<reason>"

import { appendFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const DEFAULT_URL = 'https://ymavrmekxiwdphdyteau.supabase.co/functions/v1/studio-agent'
export const SCRIPT_NAME = /^[a-z0-9][a-z0-9-]{0,79}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function agent({ url = DEFAULT_URL, key, fetchImpl = fetch }) {
  if (!key) throw new Error('STUDIO_AGENT_KEY is not set')
  return async body => {
    const r = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-studio-key': key }, body: JSON.stringify(body) })
    const data = await r.json().catch(() => ({}))
    if (!r.ok || !data.ok) throw new Error(`studio-agent ${body.action} failed (${r.status}): ${data.error ?? 'no detail'}`)
    return data
  }
}

/**
 * Claims the next queued job. Returns null when the queue is empty. The
 * values are checked again here because the workflow uses them in a shell.
 */
export async function claim({ runUrl, scriptsDir = 'scripts', ...opts }) {
  const call = agent(opts)
  const { job } = await call({ action: 'claim_job', run_url: runUrl || null })
  if (!job) return null
  const bad = !SCRIPT_NAME.test(job.script ?? '') || !UUID.test(job.id ?? '') || (job.project_id && !UUID.test(job.project_id))
  if (bad) {
    if (UUID.test(job.id ?? '')) await call({ action: 'finish_job', job_id: job.id, ok: false, error: 'Job failed validation on the worker.' })
    throw new Error('Claimed job failed validation')
  }
  const file = `${scriptsDir}/${job.script}.json`
  if (!existsSync(file)) {
    await call({ action: 'finish_job', job_id: job.id, ok: false, error: `No script named ${job.script} in tools/video/scripts on main.` })
    return { ...job, missing: true }
  }
  return { ...job, file }
}

export async function finish({ jobId, ok, assetCount = null, error = null, ...opts }) {
  if (!UUID.test(jobId ?? '')) throw new Error('job id must be a uuid')
  const count = assetCount == null || assetCount === '' ? null : Number(assetCount)
  if (count !== null && !(Number.isInteger(count) && count >= 0 && count <= 100)) throw new Error('asset count must be 0 to 100')
  return agent(opts)({ action: 'finish_job', job_id: jobId, ok, asset_count: count, error: error ? String(error).slice(0, 2000) : null })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [cmd, a, b, c] = process.argv.slice(2)
  const opts = { url: process.env.STUDIO_AGENT_URL || DEFAULT_URL, key: process.env.STUDIO_AGENT_KEY }
  const out = (k, v) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); console.log(`${k}=${v}`) }
  const run = async () => {
    if (cmd === 'claim') {
      const server = process.env.GITHUB_SERVER_URL, repo = process.env.GITHUB_REPOSITORY, id = process.env.GITHUB_RUN_ID
      const runUrl = server && repo && id ? `${server}/${repo}/actions/runs/${id}` : null
      const job = await claim({ ...opts, runUrl })
      if (!job) { console.log('Render queue is empty.'); return }
      if (job.missing) { console.log(`Job ${job.id}: script ${job.script} not found, marked failed.`); return }
      out('job_id', job.id); out('script', job.file); out('project_id', job.project_id ?? '')
    } else if (cmd === 'finish' && (b === 'done' || b === 'failed')) {
      await finish({ ...opts, jobId: a, ok: b === 'done', assetCount: b === 'done' ? c : null, error: b === 'failed' ? c : null })
      console.log(`Job ${a} marked ${b}.`)
    } else {
      throw new Error('Usage: node queue.mjs claim | finish <job> done [count] | finish <job> failed "<reason>"')
    }
  }
  run().catch(e => { console.error(e.message); process.exit(1) })
}
