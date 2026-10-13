// src/modules/artist/ArtistHub.jsx
// ── Artist Hub — staff workspace for the music catalog.
//    Album tracklist with keeper takes, release status, videos, and the
//    publish switches that control what the public artist page shows.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ModuleHeader, Pill, DataState, styles } from '../common/ModuleFrame.jsx'
import {
  TRACK_STATUSES, RELEASE_STATUSES,
  listArtists, listReleases, listTracks, listTakes, listVideos,
  updateTrack, updateRelease, updateVideo, addVideo, setKeeper, youtubeId,
} from './artistApi.js'

const TONE = { released: 'good', mastered: 'good', 'keeper-selected': 'info', generated: 'warn', writing: 'neutral' }
const label = s => s.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase())
const f = {
  btn:    { padding: '6px 12px', fontSize: '12px', fontWeight: 500, borderRadius: '8px', border: '1px solid #CBD8E6', background: '#fff', color: '#0D1B2A', cursor: 'pointer' },
  primary:{ padding: '6px 12px', fontSize: '12px', fontWeight: 500, borderRadius: '8px', border: '1px solid #0F6E56', background: '#0F6E56', color: '#fff', cursor: 'pointer' },
  select: { padding: '5px 8px', fontSize: '12px', border: '1px solid #CBD8E6', borderRadius: '8px', background: '#fff', color: '#0D1B2A' },
  input:  { padding: '7px 10px', fontSize: '13px', border: '1px solid #CBD8E6', borderRadius: '8px', minWidth: '260px' },
  stat:   { background: '#fff', border: '1px solid #CBD8E6', borderRadius: '12px', padding: '14px 16px' },
}

export default function ArtistHub() {
  const [artistId, setArtistId] = useState(null)
  const [data, setData] = useState({ loading: true, error: null, artists: [], releases: [], tracks: [], takes: [], videos: [] })
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState(null)

  const load = useCallback(async (id) => {
    try {
      const artists = await listArtists()
      const current = artists.find(a => a.id === id) ?? artists[0]
      if (!current) { setData(d => ({ ...d, loading: false, artists })); return }
      const [releases, videos] = await Promise.all([listReleases(current.id), listVideos(current.id)])
      const tracks = await listTracks(releases.map(r => r.id))
      const takes = await listTakes(tracks.map(t => t.id))
      setArtistId(current.id)
      setData({ loading: false, error: null, artists, releases, tracks, takes, videos })
    } catch (error) {
      setData(d => ({ ...d, loading: false, error }))
    }
  }, [])
  useEffect(() => { load(null) }, [load])

  const artist = data.artists.find(a => a.id === artistId)
  const act = async (key, fn, done) => {
    setBusy(key); setMsg(null)
    try { await fn(); await load(artistId); if (done) setMsg(done) }
    catch (e) { setMsg(`Couldn't save: ${e.message}`) }
    finally { setBusy(null) }
  }

  const counts = useMemo(() => {
    const keepers = new Set(data.takes.filter(t => t.is_keeper).map(t => t.track_id))
    return { total: data.tracks.length, keepers: keepers.size, published: data.tracks.filter(t => t.is_public).length }
  }, [data.tracks, data.takes])

  const publicUrl = artist ? `https://${artist.slug}.morpheuscr.com/` : null

  return (
    <div>
      <ModuleHeader
        title="Artist Hub"
        subtitle="Music catalog · releases, keeper takes, videos and the public artist page"
        right={publicUrl && <a href={publicUrl} target="_blank" rel="noopener noreferrer" style={f.btn}>Open public page ↗</a>}
      />
      {data.artists.length > 1 && (
        <label style={{ display: 'block', marginBottom: 14, fontSize: 13 }}>
          Artist{' '}
          <select style={f.select} value={artistId ?? ''} onChange={e => load(e.target.value)}>
            {data.artists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      )}
      {msg && <div role="status" style={{ ...styles.notice, marginBottom: 14 }}>{msg}</div>}

      <DataState loading={data.loading} error={data.error} rows={data.artists}
                 empty="No artists yet. Run sql/0018_artist_hub.sql to add Jace Carter.">
        {artist && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 18 }}>
              <Stat n={counts.total} l="Tracks" />
              <Stat n={`${counts.keepers}/${counts.total}`} l="Keeper takes picked" />
              <Stat n={counts.published} l="Tracks on public page" />
              <Stat n={data.videos.filter(v => v.is_public).length} l="Public videos" />
            </div>

            {data.releases.map(r => (
              <Release key={r.id} release={r} busy={busy}
                tracks={data.tracks.filter(t => t.release_id === r.id)}
                takes={data.takes}
                onRelease={patch => act(`r${r.id}`, () => updateRelease(r.id, patch), 'Release updated.')}
                onTrack={(t, patch) => act(`t${t.id}`, () => updateTrack(t.id, patch), 'Track updated.')}
                onKeeper={(t, take) => act(`k${take.id}`, () => setKeeper(t.id, take.id), `Keeper set for “${t.title}”.`)} />
            ))}

            <Videos videos={data.videos} busy={busy}
              onToggle={v => act(`v${v.id}`, () => updateVideo(v.id, { is_public: !v.is_public }))}
              onAdd={(url, title, kind) => {
                const id = youtubeId(url)
                if (!id) { setMsg('That doesn’t look like a YouTube link.'); return }
                act('addvideo', () => addVideo({ artist_id: artist.id, youtube_id: id, title, kind, channel: 'Pragmatic Thinking', sort: data.videos.length + 1, is_public: true }), 'Video added.')
              }} />
          </>
        )}
      </DataState>
    </div>
  )
}

function Stat({ n, l }) {
  return <div style={f.stat}><div style={{ fontSize: 22, fontWeight: 600, color: '#0D1B2A' }}>{n}</div><div style={{ fontSize: 12, color: '#5B6B7F' }}>{l}</div></div>
}

function Release({ release, tracks, takes, busy, onRelease, onTrack, onKeeper }) {
  return (
    <section style={{ ...styles.card, marginBottom: 18 }} aria-label={release.title}>
      <div style={{ ...styles.head, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={styles.title}>{release.title}</div>
          <div style={styles.sub}>{label(release.kind)} · {tracks.length} tracks</div>
        </div>
        <label style={{ fontSize: 12 }}>Status{' '}
          <select style={f.select} value={release.status} disabled={busy === `r${release.id}`}
                  onChange={e => onRelease({ status: e.target.value })}>
            {RELEASE_STATUSES.map(s => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={release.is_public} disabled={busy === `r${release.id}`}
                 onChange={() => onRelease({ is_public: !release.is_public })} />
          Show on public page
        </label>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>
          <th style={styles.th}>#</th><th style={styles.th}>Track</th><th style={styles.th}>Takes</th>
          <th style={styles.th}>Status</th><th style={styles.th}>Public</th>
        </tr></thead>
        <tbody>
          {tracks.map(t => {
            const own = takes.filter(k => k.track_id === t.id)
            return (
              <tr key={t.id} style={{ borderBottom: '1px solid #E6EDF5', verticalAlign: 'top' }}>
                <td style={styles.td}>{t.track_no}</td>
                <td style={styles.td}>
                  <div style={{ fontWeight: 500 }}>{t.title}</div>
                  <div style={{ fontSize: 12, color: '#5B6B7F' }}>{t.role}{t.target_bpm ? ` · ${t.target_bpm} BPM` : ''}</div>
                </td>
                <td style={styles.td}>
                  {own.length === 0 && <span style={{ fontSize: 12, color: '#5B6B7F' }}>No takes yet</span>}
                  {own.map((k, i) => (
                    <div key={k.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, marginBottom: 4 }}>
                      <a href={k.take_url} target="_blank" rel="noopener noreferrer">Take {i + 1}{k.duration ? ` (${k.duration})` : ''}</a>
                      {k.is_keeper
                        ? <Pill tone="good">Keeper</Pill>
                        : <button style={f.btn} disabled={!!busy} onClick={() => onKeeper(t, k)}>Make keeper</button>}
                    </div>
                  ))}
                </td>
                <td style={styles.td}>
                  <select style={f.select} value={t.status} disabled={busy === `t${t.id}`}
                          aria-label={`Status for ${t.title}`}
                          onChange={e => onTrack(t, { status: e.target.value })}>
                    {TRACK_STATUSES.map(s => <option key={s} value={s}>{label(s)}</option>)}
                  </select>
                  <div style={{ marginTop: 4 }}><Pill tone={TONE[t.status] ?? 'neutral'}>{label(t.status)}</Pill></div>
                </td>
                <td style={styles.td}>
                  <input type="checkbox" checked={t.is_public} disabled={busy === `t${t.id}`}
                         aria-label={`Show ${t.title} on the public page`}
                         onChange={() => onTrack(t, { is_public: !t.is_public })} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function Videos({ videos, busy, onToggle, onAdd }) {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState('short')
  return (
    <section style={styles.card} aria-label="Videos">
      <div style={styles.head}><div style={styles.title}>Videos</div><div style={styles.sub}>Music videos and Shorts shown on the public page</div></div>
      <div style={{ padding: '12px 18px' }}>
        {videos.map(v => (
          <div key={v.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #E6EDF5', fontSize: 13 }}>
            <img src={`https://i.ytimg.com/vi/${v.youtube_id}/default.jpg`} alt="" width="64" height="48" style={{ borderRadius: 6, objectFit: 'cover' }} />
            <a href={`https://youtu.be/${v.youtube_id}`} target="_blank" rel="noopener noreferrer" style={{ flex: 1 }}>{v.title}</a>
            <Pill tone="info">{label(v.kind)}</Pill>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={v.is_public} disabled={busy === `v${v.id}`} onChange={() => onToggle(v)} /> Public
            </label>
          </div>
        ))}
        <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}
              onSubmit={e => { e.preventDefault(); if (url && title) { onAdd(url, title, kind); setUrl(''); setTitle('') } }}>
          <input style={f.input} placeholder="YouTube link" value={url} onChange={e => setUrl(e.target.value)} aria-label="YouTube link" />
          <input style={f.input} placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} aria-label="Video title" />
          <select style={f.select} value={kind} onChange={e => setKind(e.target.value)} aria-label="Video type">
            {['music-video', 'short', 'lyric-video', 'teaser'].map(k => <option key={k} value={k}>{label(k)}</option>)}
          </select>
          <button type="submit" style={f.primary} disabled={busy === 'addvideo' || !url || !title}>Add video</button>
        </form>
      </div>
    </section>
  )
}
