// src/legacy/AdminContent.jsx
// ── Legacy Path — content review gate (super_admin only) ──
// The paid guides live in lp_content_versions, never in this public repo or
// the JavaScript bundle. A super_admin imports the six JSON files as drafts,
// reviews them, then approves and publishes. The database trigger enforces
// draft -> approved -> published and records who approved and when.

import { useEffect, useState } from 'react'
import { supabase, CONTENT_KEYS } from './api.js'

const LABEL = {
  ageBands: 'Life stages', vehicles: 'Options library', trusts: 'Trusts & estate',
  insurance: 'Insurance', leverage: 'Insurance financing', funeral: 'Burial & legacy',
}

function summarize(key, body) {
  try {
    if (key === 'ageBands') return `${body.length} life stages`
    if (key === 'vehicles') return `${body.length} options`
    if (key === 'trusts') return `${body.trusts.length} trusts, ${body.basics.length} estate documents`
    if (key === 'insurance') return `${body.policies.length} policy types`
    if (key === 'leverage') return `${body.strategies.length} strategies`
    if (key === 'funeral') return `${body.traditions.length} traditions, ${body.planningSteps.length} planning steps`
  } catch { /* fall through */ }
  return 'Unrecognized shape'
}

export default function AdminContent({ base, Frame }) {
  const [session, setSession] = useState(undefined)
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState([])
  const say = (m) => setLog((l) => [...l, m])

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)) }, [])
  const isAdmin = session?.user?.app_metadata?.role === 'super_admin'

  async function refresh() {
    const { data, error } = await supabase
      .from('lp_content_versions')
      .select('id, content_key, version, status, access_tier, body, created_at, reviewed_at, published_at')
      .order('content_key').order('version', { ascending: false })
    if (error) say(`Could not load content: ${error.message}`)
    else setRows(data ?? [])
  }
  useEffect(() => { if (isAdmin) refresh() }, [isAdmin])

  async function importFiles(files) {
    setBusy(true)
    for (const f of files) {
      const key = f.name.replace(/\.min\.json$|\.json$/i, '')
      if (!CONTENT_KEYS.includes(key)) { say(`Skipped ${f.name}: name must be one of ${CONTENT_KEYS.join(', ')}.json`); continue }
      try {
        const body = JSON.parse(await f.text())
        const { error } = await supabase.from('lp_content_versions').insert({
          content_key: key, body, access_tier: 'paid', ai_generated: true,
          change_note: `Imported from ${f.name}`,
        })
        say(error ? `${f.name}: ${error.message}` : `${f.name}: saved as a draft (${summarize(key, body)})`)
      } catch (e) { say(`${f.name}: not valid JSON (${e.message})`) }
    }
    setBusy(false); refresh()
  }

  async function setStatus(id, status) {
    const { error } = await supabase.from('lp_content_versions').update({ status }).eq('id', id)
    if (error) say(`Update failed: ${error.message}`)
  }

  async function approveAndPublishDrafts() {
    setBusy(true)
    for (const r of rows.filter((x) => x.status === 'draft')) {
      await setStatus(r.id, 'approved')
      await setStatus(r.id, 'published')
      say(`Published ${LABEL[r.content_key]} v${r.version}`)
    }
    setBusy(false); refresh()
  }

  if (session === undefined) return <Frame base={base}><p className="muted">Loading…</p></Frame>
  if (!isAdmin) return <Frame base={base}><h1>Admins only</h1><p>Sign in with the Morpheus super_admin account to manage Legacy Path content.</p><a className="btn" href={`${base}/signin?mode=signin`}>Sign in</a></Frame>

  const drafts = rows.filter((r) => r.status === 'draft')
  const live = CONTENT_KEYS.map((k) => rows.find((r) => r.content_key === k && r.status === 'published'))
  return (
    <Frame base={base} narrow={false}>
      <div className="pagehead">
        <div className="eyebrow">Admin · content review</div>
        <h1>Legacy Path guides</h1>
        <p>Paying customers see the newest published version of each guide. Import updated JSON files as drafts, review the counts below, then publish.</p>
      </div>
      <div className="grid">
        {CONTENT_KEYS.map((k, i) => (
          <div className="card" key={k}>
            <div className="eyebrow">{LABEL[k]}</div>
            {live[i]
              ? <p><span className="pill good">Live</span> v{live[i].version} · {summarize(k, live[i].body)}</p>
              : <p><span className="pill crit">Not published</span></p>}
          </div>
        ))}
      </div>
      <div className="card">
        <h3>1. Import drafts</h3>
        <p className="muted">Choose the six files from the launch pack&apos;s <code>content</code> folder: ageBands.json, vehicles.json, trusts.json, insurance.json, leverage.json and funeral.json.</p>
        <input type="file" accept="application/json,.json" multiple disabled={busy} onChange={(e) => importFiles([...e.target.files])} aria-label="Content JSON files" />
      </div>
      <div className="card">
        <h3>2. Review and publish</h3>
        {drafts.length === 0 ? <p className="muted">No drafts waiting.</p> : (
          <>
            <ul className="clean">{drafts.map((r) => <li key={r.id}>{LABEL[r.content_key]} v{r.version}: {summarize(r.content_key, r.body)}</li>)}</ul>
            <div><button className="btn primary" disabled={busy} onClick={approveAndPublishDrafts}>Approve and publish {drafts.length} draft{drafts.length === 1 ? '' : 's'}</button></div>
          </>
        )}
      </div>
      {log.length > 0 && <div className="card"><h3>Activity</h3><ul className="clean">{log.map((m, i) => <li key={i}>{m}</li>)}</ul></div>}
    </Frame>
  )
}
