// src/pages/CreatorStudio.jsx
// ── Creator Studio — cinematic teaser asset review & shot board ─
import { useState } from 'react'
import {
  TEASER_PROJECT, ANCHORS, LOCATIONS, VEHICLES, SHOT_LIST,
  shotReadiness, projectSummary,
} from '../lib/creatorStudio.js'

function StatusPill({ status }) {
  const map = {
    ready:   { bg: 'rgba(93,202,165,0.18)', fg: '#5DCAA5', label: 'Ready' },
    pending: { bg: 'rgba(186,117,23,0.18)', fg: '#E0A94D', label: 'Pending' },
    blocked: { bg: 'rgba(153,60,29,0.2)',   fg: '#E08A6B', label: 'Blocked' },
  }
  const s = map[status] ?? map.pending
  return <span style={{ ...cs.pill, background: s.bg, color: s.fg }}>{s.label}</span>
}

function ShotCard({ shot }) {
  const status = shotReadiness(shot)
  return (
    <div style={cs.shotCard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
        <div style={cs.shotId}>{shot.id.toUpperCase()}</div>
        <StatusPill status={status} />
      </div>
      <div style={cs.shotBeat}>{shot.beat}</div>
      <div style={cs.shotNeeds}>needs: {shot.needs.join(', ')}</div>
    </div>
  )
}

function AssetTile({ label, src, status }) {
  return (
    <div style={cs.tile}>
      <div style={cs.tileImgWrap}>
        {src
          ? <img src={src} alt={label} style={cs.tileImg} />
          : <div style={cs.tilePlaceholder}>Not generated</div>}
      </div>
      <div style={cs.tileFooter}>
        <span>{label}</span>
        <StatusPill status={status} />
      </div>
    </div>
  )
}

function AnchorCard({ anchor }) {
  return (
    <div style={cs.anchorCard}>
      <div style={cs.anchorHeader}>
        <span style={cs.anchorName}>{anchor.name}</span>
      </div>
      <div style={cs.anchorDesc}>{anchor.description}</div>
      <div style={cs.anchorShots}>
        {anchor.shots.map(s => <AssetTile key={s.id} label={s.label} src={s.src} status={s.status} />)}
      </div>
    </div>
  )
}

export default function CreatorStudio() {
  const [tab, setTab] = useState('anchors') // anchors | locations | vehicles | shots
  const summary = projectSummary()

  const TABS = [
    { id: 'anchors',   label: `Anchors (${ANCHORS.length})` },
    { id: 'locations', label: `Locations (${LOCATIONS.length})` },
    { id: 'vehicles',  label: `Vehicles & Gear (${VEHICLES.length})` },
    { id: 'shots',     label: `Shot List (${SHOT_LIST.length})` },
  ]

  return (
    <div style={cs.root}>
      <div style={cs.headerRow}>
        <div>
          <div style={cs.projectTitle}>{TEASER_PROJECT.title}</div>
          <div style={cs.logline}>{TEASER_PROJECT.logline}</div>
        </div>
        <div style={cs.progressBox}>
          <div style={cs.progressLabel}>Assets ready</div>
          <div style={cs.progressValue}>{summary.ready} / {summary.total}</div>
          <a href={TEASER_PROJECT.flow_url} target="_blank" rel="noreferrer" style={cs.flowLink}>Open generation flow ↗</a>
        </div>
      </div>

      <div style={cs.tabRow}>
        {TABS.map(t => (
          <div key={t.id} style={{ ...cs.tab, ...(tab === t.id ? cs.tabActive : {}) }} onClick={() => setTab(t.id)}>
            {t.label}
          </div>
        ))}
      </div>

      {tab === 'anchors' && (
        <div>
          <div style={cs.sectionLabel}>Review Anchors</div>
          <div style={cs.anchorGrid}>
            {ANCHORS.map(a => <AnchorCard key={a.id} anchor={a} />)}
          </div>
        </div>
      )}

      {tab === 'locations' && (
        <div>
          <div style={cs.sectionLabel}>Locations · {LOCATIONS.length}</div>
          <div style={cs.plateGrid}>
            {LOCATIONS.map(l => (
              <div key={l.id} style={cs.plateCard}>
                <div style={cs.plateImgWrap}>
                  {l.src
                    ? <img src={l.src} alt={l.name} style={cs.plateImg} />
                    : <div style={cs.tilePlaceholder}>Not generated</div>}
                  <div style={cs.plateLabel}>{l.name}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px' }}>
                  <span style={cs.plateDesc}>{l.description}</span>
                  <StatusPill status={l.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'vehicles' && (
        <div>
          <div style={cs.sectionLabel}>Vehicles & Gear · {VEHICLES.length}</div>
          <div style={cs.plateGrid}>
            {VEHICLES.map(v => (
              <div key={v.id} style={cs.plateCard}>
                <div style={cs.plateImgWrap}>
                  {v.src
                    ? <img src={v.src} alt={v.name} style={cs.plateImg} />
                    : <div style={cs.tilePlaceholder}>Not generated</div>}
                  <div style={cs.plateLabel}>{v.name}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px' }}>
                  <span style={cs.plateDesc}>{v.description}</span>
                  <StatusPill status={v.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'shots' && (
        <div>
          <div style={cs.sectionLabel}>Teaser shot list</div>
          <div style={cs.shotGrid}>
            {SHOT_LIST.map(s => <ShotCard key={s.id} shot={s} />)}
          </div>
        </div>
      )}
    </div>
  )
}

const cs = {
  root: { background: '#0B141F', color: '#E8EFF6', borderRadius: '16px', padding: '22px', minHeight: '100%', fontFamily: "'DM Sans', sans-serif" },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px', gap: '20px' },
  projectTitle: { fontFamily: 'monospace', fontSize: '22px', fontWeight: 600, letterSpacing: '0.02em', color: '#fff' },
  logline: { fontSize: '13px', color: 'rgba(232,239,246,0.6)', marginTop: '6px', maxWidth: '520px', lineHeight: 1.5 },
  progressBox: { textAlign: 'right', flexShrink: 0 },
  progressLabel: { fontSize: '10px', color: 'rgba(232,239,246,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' },
  progressValue: { fontFamily: 'monospace', fontSize: '24px', color: '#5DCAA5', lineHeight: 1.3 },
  flowLink: { fontSize: '11px', color: '#7EC8F0', textDecoration: 'none' },
  tabRow: { display: 'flex', gap: '6px', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' },
  tab: { padding: '7px 14px', borderRadius: '8px', fontSize: '12px', color: 'rgba(232,239,246,0.55)', cursor: 'pointer' },
  tabActive: { background: 'rgba(33,118,174,0.25)', color: '#fff', fontWeight: 500 },
  sectionLabel: { fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(232,239,246,0.5)', marginBottom: '12px' },
  anchorGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' },
  anchorCard: { background: '#101B29', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '14px' },
  anchorHeader: { marginBottom: '4px' },
  anchorName: { fontSize: '14px', fontWeight: 600, color: '#fff' },
  anchorDesc: { fontSize: '12px', color: 'rgba(232,239,246,0.5)', marginBottom: '10px' },
  anchorShots: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' },
  tile: { borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' },
  tileImgWrap: { aspectRatio: '3 / 4', background: '#1A2635', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  tileImg: { width: '100%', height: '100%', objectFit: 'cover' },
  tilePlaceholder: { fontSize: '10px', color: 'rgba(232,239,246,0.3)', textAlign: 'center', padding: '8px' },
  tileFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', fontSize: '10px', color: 'rgba(232,239,246,0.6)' },
  plateGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' },
  plateCard: { background: '#101B29', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', overflow: 'hidden' },
  plateImgWrap: { position: 'relative', aspectRatio: '16 / 9', background: '#1A2635' },
  plateImg: { width: '100%', height: '100%', objectFit: 'cover' },
  plateLabel: { position: 'absolute', left: '10px', bottom: '10px', background: 'rgba(11,20,31,0.75)', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, color: '#fff' },
  plateDesc: { fontSize: '11px', color: 'rgba(232,239,246,0.5)', maxWidth: '75%' },
  pill: { fontSize: '9px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 },
  shotGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' },
  shotCard: { background: '#101B29', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '14px' },
  shotId: { fontFamily: 'monospace', fontSize: '11px', color: 'rgba(232,239,246,0.4)' },
  shotBeat: { fontSize: '13px', color: '#E8EFF6', margin: '8px 0 8px', lineHeight: 1.4 },
  shotNeeds: { fontSize: '10px', color: 'rgba(232,239,246,0.4)', fontFamily: 'monospace' },
}
