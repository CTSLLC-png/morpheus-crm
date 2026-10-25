// src/modules/artist/ArtistPublicPage.jsx
// ── Public artist page — jace.morpheuscr.com (and /artists/:slug on the main
//    domain). No sign-in. Reads published catalog rows; falls back to the
//    bundled catalog so the page always renders.
//
//    Videos open on YouTube rather than in an iframe: the site's CSP keeps
//    frame-src 'none', and a thumbnail link loads faster on phones anyway.

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { loadPublicArtist } from './artistApi.js'
import { artistSlugForHost } from './artistCatalog.js'

const STATUS_LABEL = {
  'in-production': 'In production',
  mastering: 'Mastering',
  scheduled: 'Coming soon',
  released: 'Out now',
  'on-hold': 'On hold',
}

export default function ArtistPublicPage({ slug: slugProp }) {
  const params = useParams()
  const slug = slugProp ?? params.slug ?? artistSlugForHost(window.location.hostname)
  const [state, setState] = useState({ loading: true, data: null })

  useEffect(() => {
    let alive = true
    loadPublicArtist(slug).then(data => alive && setState({ loading: false, data }))
    return () => { alive = false }
  }, [slug])

  useEffect(() => {
    const name = state.data?.artist?.name
    if (name) document.title = `${name} — Official site`
  }, [state.data])

  if (state.loading) return <div style={s.page}><p style={{ ...s.wrap, paddingTop: 120, color: C.muted }}>Loading…</p></div>
  const { artist, releases, videos } = state.data ?? {}
  if (!artist) {
    return (
      <div style={s.page}>
        <main id="main-content" tabIndex="-1" style={{ ...s.wrap, paddingTop: 120 }}>
          <h1 style={s.h2}>Artist not found</h1>
          <p style={s.body}>This page isn't published yet.</p>
          <a href="https://www.morpheuscr.com/" style={s.link}>Go to Nguzo OS →</a>
        </main>
      </div>
    )
  }
  const [featured, ...moreVideos] = videos ?? []

  return (
    <div style={s.page}>
      <header style={s.header}>
        <div style={{ ...s.wrap, display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', padding: '18px 24px' }}>
          <span style={s.wordmark}>{artist.name}</span>
          <nav aria-label="Artist" style={{ marginLeft: 'auto', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            {featured && <a href="#watch" style={s.nav}>Watch</a>}
            {releases?.length > 0 && <a href="#music" style={s.nav}>Music</a>}
            <a href="#about" style={s.nav}>About</a>
          </nav>
        </div>
      </header>

      <main id="main-content" tabIndex="-1">
        <section style={{ ...s.wrap, padding: '72px 24px 48px' }}>
          <p style={s.eyebrow}>{artist.genre}</p>
          <h1 style={s.h1}>{artist.name}</h1>
          <p style={s.lede}>{artist.tagline}</p>
          {featured && (
            <a href={ytUrl(featured.youtube_id)} style={s.button} target="_blank" rel="noopener noreferrer">
              ▶ Watch “{shortTitle(featured.title)}”
            </a>
          )}
        </section>

        {featured && (
          <section id="watch" style={s.band} aria-labelledby="watch-h">
            <div style={{ ...s.wrap, padding: '56px 24px' }}>
              <h2 id="watch-h" style={s.h2}>Watch</h2>
              <VideoCard video={featured} large />
              {moreVideos.length > 0 && (
                <div style={s.grid}>
                  {moreVideos.map(v => <VideoCard key={v.youtube_id} video={v} />)}
                </div>
              )}
            </div>
          </section>
        )}

        {releases?.map((r, i) => (
          <section key={r.title} id={i === 0 ? 'music' : undefined} style={{ ...s.wrap, padding: '56px 24px' }} aria-labelledby={`release-${i}`}>
            <p style={s.eyebrow}>{r.kind === 'album' ? 'New album' : r.kind} · {STATUS_LABEL[r.status] ?? r.status}</p>
            <h2 id={`release-${i}`} style={s.h2}>{r.title}</h2>
            {r.summary && <p style={s.body}>{r.summary}</p>}
            {r.tracks?.length > 0 && (
              <ol style={s.tracklist}>
                {r.tracks.map(t => (
                  <li key={t.track_no} style={s.track}>
                    <span style={s.trackNo} aria-hidden="true">{String(t.track_no).padStart(2, '0')}</span>
                    <span style={{ flex: 1 }}>
                      <span style={{ fontWeight: 600 }}>{t.title}</span>
                      {t.role && <span style={s.trackRole}> · {t.role}</span>}
                    </span>
                    {t.listen_url
                      ? <a href={t.listen_url} style={s.link} target="_blank" rel="noopener noreferrer">Listen<span className="sr-only"> to {t.title}</span></a>
                      : <span style={s.soon}>{t.status === 'released' ? 'Out now' : 'Coming soon'}</span>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))}

        <section id="about" style={s.band} aria-labelledby="about-h">
          <div style={{ ...s.wrap, padding: '56px 24px' }}>
            <h2 id="about-h" style={s.h2}>About {artist.name.split(' ')[0]}</h2>
            <p style={{ ...s.body, maxWidth: 720 }}>{artist.bio}</p>
          </div>
        </section>
      </main>

      <footer style={{ borderTop: `1px solid ${C.line}`, padding: '28px 24px', color: C.muted, fontSize: 14 }}>
        <div style={{ ...s.wrap, display: 'flex', gap: 18, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span>© 2026 {artist.label ?? artist.name}. All rights reserved.</span>
          <span>Powered by <a href="https://www.morpheuscr.com/" style={s.link}>Nguzo OS</a></span>
        </div>
      </footer>
    </div>
  )
}

function VideoCard({ video, large }) {
  return (
    <a href={ytUrl(video.youtube_id)} target="_blank" rel="noopener noreferrer"
       style={{ ...s.video, ...(large ? { marginTop: 20 } : {}) }}>
      <span style={{ position: 'relative', display: 'block' }}>
        <img src={`https://i.ytimg.com/vi/${video.youtube_id}/hqdefault.jpg`} alt=""
             loading="lazy" style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', display: 'block', borderRadius: 10 }} />
        <span aria-hidden="true" style={s.play}>▶</span>
      </span>
      <span style={{ display: 'block', marginTop: 10, fontWeight: 600, color: C.text }}>{video.title}</span>
      <span style={{ display: 'block', color: C.muted, fontSize: 13 }}>Watch on YouTube{video.channel ? ` · ${video.channel}` : ''}</span>
    </a>
  )
}

const ytUrl = id => `https://www.youtube.com/watch?v=${id}`
const shortTitle = t => t.split(' — ')[0]

// Warm, denim-and-dusk palette for a country artist; contrast checked ≥ 4.5:1.
const C = { bg: '#14110f', band: '#1d1915', line: '#3a3129', text: '#f4ece2', muted: '#bfae9b', accent: '#e0a458', ink: '#1a1208' }
const s = {
  page:     { minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif" },
  wrap:     { maxWidth: 1080, margin: '0 auto', boxSizing: 'border-box' },
  header:   { borderBottom: `1px solid ${C.line}` },
  wordmark: { fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', fontSize: 18 },
  nav:      { color: C.muted, textDecoration: 'none', fontSize: 15 },
  eyebrow:  { color: C.accent, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 13, margin: 0 },
  h1:       { fontSize: 'clamp(44px, 9vw, 96px)', lineHeight: 1, margin: '14px 0 18px', fontFamily: "Georgia, 'Times New Roman', serif" },
  h2:       { fontSize: 'clamp(28px, 4vw, 40px)', margin: '8px 0 12px', fontFamily: "Georgia, 'Times New Roman', serif" },
  lede:     { fontSize: 21, lineHeight: 1.55, color: C.muted, maxWidth: 680, margin: '0 0 28px' },
  body:     { fontSize: 17, lineHeight: 1.65, color: C.muted },
  band:     { background: C.band, borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` },
  button:   { background: C.accent, color: C.ink, fontWeight: 700, padding: '13px 20px', borderRadius: 8, textDecoration: 'none', display: 'inline-block' },
  link:     { color: C.accent, fontWeight: 700, textDecoration: 'none' },
  grid:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, marginTop: 28 },
  video:    { display: 'block', textDecoration: 'none', maxWidth: 760 },
  play:     { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 42, color: '#fff', textShadow: '0 2px 12px rgba(0,0,0,.6)' },
  tracklist:{ listStyle: 'none', padding: 0, margin: '24px 0 0', borderTop: `1px solid ${C.line}` },
  track:    { display: 'flex', alignItems: 'baseline', gap: 16, padding: '14px 4px', borderBottom: `1px solid ${C.line}`, fontSize: 16 },
  trackNo:  { color: C.accent, fontVariantNumeric: 'tabular-nums', fontWeight: 700, width: 26 },
  trackRole:{ color: C.muted, fontSize: 14 },
  soon:     { color: C.muted, fontSize: 13, whiteSpace: 'nowrap' },
}
