// src/lib/markdown.jsx
// ── MORPHEUS.EDU — tiny markdown renderer ──────────────────────
// Renders the subset of markdown used by EDU lesson content into
// React elements (no dangerouslySetInnerHTML, no new dependencies).
// Supports: ## / ### headings, paragraphs, **bold**, *italic*,
// `code`, > blockquotes, - lists, and simple | tables.

const md = {
  h2:    { fontSize: '17px', fontWeight: 600, color: '#0D1B2A', margin: '22px 0 8px' },
  h3:    { fontSize: '14px', fontWeight: 600, color: '#0D1B2A', margin: '18px 0 6px' },
  p:     { fontSize: '13.5px', lineHeight: 1.75, color: '#33475E', margin: '0 0 12px' },
  quote: { borderLeft: '3px solid #5DCAA5', background: '#F1FAF6', borderRadius: '0 8px 8px 0',
           padding: '10px 14px', margin: '0 0 14px', fontSize: '13px', lineHeight: 1.7, color: '#0F6E56' },
  ul:    { margin: '0 0 12px', paddingLeft: '20px' },
  li:    { fontSize: '13.5px', lineHeight: 1.7, color: '#33475E', marginBottom: '5px' },
  code:  { fontFamily: "'DM Mono',monospace", fontSize: '12px', background: '#F0F4F8',
           borderRadius: '4px', padding: '1px 5px', color: '#0C447C' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', margin: '0 0 14px' },
  th:    { border: '1px solid #CBD8E6', background: '#F7F9FC', padding: '7px 10px',
           textAlign: 'left', fontWeight: 600, color: '#0D1B2A' },
  td:    { border: '1px solid #CBD8E6', padding: '7px 10px', color: '#33475E', lineHeight: 1.5 },
}

/** Inline formatting: **bold**, *italic*, `code` */
function inline(text, keyBase = 'i') {
  const parts = []
  let rest = text
  let k = 0
  const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)/
  while (rest) {
    const m = rest.match(re)
    if (!m) { parts.push(rest); break }
    if (m.index > 0) parts.push(rest.slice(0, m.index))
    if (m[2] != null)      parts.push(<strong key={`${keyBase}-${k++}`} style={{ color: '#0D1B2A', fontWeight: 600 }}>{m[2]}</strong>)
    else if (m[4] != null) parts.push(<em key={`${keyBase}-${k++}`}>{m[4]}</em>)
    else if (m[6] != null) parts.push(<code key={`${keyBase}-${k++}`} style={md.code}>{m[6]}</code>)
    rest = rest.slice(m.index + m[0].length)
  }
  return parts
}

export default function Markdown({ text }) {
  if (!text) return null
  const lines = text.split('\n')
  const blocks = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) { i++; continue }

    if (line.startsWith('### ')) {
      blocks.push(<h3 key={key++} style={md.h3}>{inline(line.slice(4), `h${key}`)}</h3>); i++; continue
    }
    if (line.startsWith('## ')) {
      blocks.push(<h2 key={key++} style={md.h2}>{inline(line.slice(3), `h${key}`)}</h2>); i++; continue
    }
    if (line.startsWith('> ')) {
      const quote = []
      while (i < lines.length && lines[i].startsWith('>')) {
        quote.push(lines[i].replace(/^>\s?/, '')); i++
      }
      blocks.push(<div key={key++} style={md.quote}>{inline(quote.join(' '), `q${key}`)}</div>); continue
    }
    if (line.startsWith('- ')) {
      const items = []
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(lines[i].slice(2)); i++
      }
      blocks.push(
        <ul key={key++} style={md.ul}>
          {items.map((it, j) => <li key={j} style={md.li}>{inline(it, `l${key}-${j}`)}</li>)}
        </ul>
      ); continue
    }
    if (line.trim().startsWith('|')) {
      const rows = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(lines[i].trim()); i++
      }
      const cells = r => r.split('|').slice(1, -1).map(c => c.trim())
      const header = cells(rows[0])
      const body = rows.slice(1).filter(r => !/^\|[\s\-|:]+\|$/.test(r)).map(cells)
      blocks.push(
        <div key={key++} style={{ overflowX: 'auto' }}>
          <table style={md.table}>
            <thead><tr>{header.map((h, j) => <th key={j} style={md.th}>{inline(h, `th${key}-${j}`)}</th>)}</tr></thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>{r.map((c, ci) => <td key={ci} style={md.td}>{inline(c, `td${key}-${ri}-${ci}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ); continue
    }

    // paragraph — merge consecutive plain lines
    const para = []
    while (i < lines.length && lines[i].trim() &&
           !/^(## |### |> |- )/.test(lines[i]) && !lines[i].trim().startsWith('|')) {
      para.push(lines[i]); i++
    }
    blocks.push(<p key={key++} style={md.p}>{inline(para.join(' '), `p${key}`)}</p>)
  }

  return <div>{blocks}</div>
}
