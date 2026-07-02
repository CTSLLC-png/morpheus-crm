// src/lib/report.js
// ── Morpheus CRM — LDSS Progress Report PDF Generator ──────────
// Generates a proprietary Morpheus progress report PDF from live
// Supabase data. Called from ParticipantProfile → "Export LDSS report"

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ── Brand colors (RGB) ─────────────────────────────────────────
const NAVY   = [13,  27,  42]
const MIDBL  = [27,  58,  92]
const BLUE   = [33, 118, 174]
const TEAL   = [15, 110,  86]
const AMBER  = [186, 117,  23]
const RED    = [153,  60,  29]
const RULE   = [203, 216, 230]
const SURF   = [247, 249, 252]
const GRAY   = [74,  96, 128]

function scoreRGB(score) {
  if (score >= 80) return TEAL
  if (score >= 60) return AMBER
  return RED
}

function scoreLabel(score) {
  if (score >= 80) return 'Proficient'
  if (score >= 60) return 'Developing'
  return 'Unsatisfactory'
}

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

/**
 * Generate and download a Morpheus Progress Report PDF.
 * @param {object} opts
 * @param {object} opts.participant  Full participant record from Supabase
 * @param {Array}  opts.calls        Completed call_sessions with call_scores joined
 * @param {object} opts.eligibility  Row from v_certification_eligibility
 */
export async function generateProgressReportPDF({ participant, calls, eligibility }) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' })
  const PW = doc.internal.pageSize.getWidth()   // 612
  const PH = doc.internal.pageSize.getHeight()  // 792
  const MAR = 36
  const INNER = PW - MAR * 2

  const today    = new Date()
  const reportId = `MPR-${today.getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`

  // ── Header band ──────────────────────────────────────────────
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, PW, 72, 'F')

  // Logo M glyph
  doc.setDrawColor(...BLUE)
  doc.setLineWidth(2)
  const lx = MAR, ly = 22
  doc.line(lx, ly + 28, lx, ly)
  doc.line(lx, ly, lx + 13, ly + 14)
  doc.line(lx + 13, ly + 14, lx + 26, ly)
  doc.line(lx + 26, ly, lx + 26, ly + 28)

  // Wordmark
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('MORPHEUS', lx + 34, 38)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(139, 160, 184)
  doc.text('CRM  ·  Certified Training Standards  ·  Albany, NY  ·  morpheuscr.com', lx + 35, 52)

  // Report type badge (right)
  doc.setFillColor(...BLUE)
  doc.roundedRect(PW - 210, 16, 174, 20, 3, 3, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('PARTICIPANT PROGRESS REPORT', PW - 123, 30, { align: 'center' })

  // Meta strip
  doc.setFillColor(...MIDBL)
  doc.rect(0, 72, PW, 22, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(184, 207, 228)
  const meta = [
    `Report ID: ${reportId}`,
    `Generated: ${fmtDate(today.toISOString())}`,
    `Program: ${participant.program_source}`,
    participant.ldss_case_number ? `Case #: ${participant.ldss_case_number}` : null,
  ].filter(Boolean)
  const metaSpacing = INNER / meta.length
  meta.forEach((m, i) => doc.text(m, MAR + i * metaSpacing, 86))

  let y = 110

  // ── Section helper ───────────────────────────────────────────
  function sectionHeader(title) {
    doc.setFillColor(230, 241, 251)
    doc.rect(MAR, y - 4, INNER, 18, 'F')
    doc.setFillColor(...BLUE)
    doc.rect(MAR, y - 4, 3, 18, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...NAVY)
    doc.text(title.toUpperCase(), MAR + 8, y + 8)
    y += 22
  }

  // ── Participant info ─────────────────────────────────────────
  sectionHeader('Participant Information')

  const infoRows = [
    ['Full Name',       participant.full_name,               'Trainer',          participant.staff_profiles?.full_name ?? '—'],
    ['CTS ID',          participant.cts_id,                  'Program Status',   participant.status],
    ['Date of Birth',   fmtDate(participant.dob),            'LDSS Office',      participant.ldss_office ?? '—'],
    ['Enrollment Date', fmtDate(participant.enrollment_date),'LDSS Case #',      participant.ldss_case_number ?? '—'],
    ['',                '',                                  'Caseworker',       participant.ldss_caseworker ?? '—'],
  ]

  const rowH = 14
  infoRows.forEach(([lA, vA, lB, vB]) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...GRAY)
    if (lA) doc.text(lA + ':', MAR, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...NAVY)
    if (vA) doc.text(vA, MAR + 90, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY)
    if (lB) doc.text(lB + ':', MAR + 295, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...NAVY)
    if (vB) doc.text(vB, MAR + 390, y)
    y += rowH
  })
  y += 10

  // ── Call evaluation log ──────────────────────────────────────
  sectionHeader('Call Evaluation Log')

  const SCORE_KEYS = ['score_opening','score_listening','score_empathy','score_resolution','score_policy','score_closing']
  const tableData = calls.map(call => {
    const sc = call.call_scores?.[0] ?? {}
    return [
      new Date(call.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      call.scenario_type.length > 40 ? call.scenario_type.slice(0, 38) + '…' : call.scenario_type,
      call.difficulty,
      sc.score_opening   ?? '—',
      sc.score_listening ?? '—',
      sc.score_empathy   ?? '—',
      sc.score_resolution ?? '—',
      sc.score_policy    ?? '—',
      sc.score_closing   ?? '—',
      sc.total_score     ?? '—',
    ]
  })

  autoTable(doc, {
    startY: y,
    margin: { left: MAR, right: MAR },
    head: [['Date','Scenario','Difficulty','Open','Listen','Empathy','Resolve','Policy','Close','TOTAL']],
    body: tableData,
    styles: { fontSize: 7, cellPadding: 3, font: 'helvetica', textColor: NAVY },
    headStyles: { fillColor: MIDBL, textColor: [255,255,255], fontStyle: 'bold', fontSize: 6.5 },
    alternateRowStyles: { fillColor: SURF },
    columnStyles: {
      0: { cellWidth: 36 },
      1: { cellWidth: 160 },
      2: { cellWidth: 58 },
      3: { cellWidth: 30 }, 4: { cellWidth: 30 }, 5: { cellWidth: 34 },
      6: { cellWidth: 34 }, 7: { cellWidth: 30 }, 8: { cellWidth: 30 },
      9: { cellWidth: 38, fontStyle: 'bold' },
    },
    didParseCell(data) {
      if (data.column.index === 9 && data.section === 'body') {
        const val = Number(data.cell.raw)
        if (!isNaN(val)) {
          data.cell.styles.textColor = scoreRGB(val)
        }
      }
    },
  })

  y = doc.lastAutoTable.finalY + 14

  // ── Category performance summary ─────────────────────────────
  sectionHeader('Category Performance Summary')

  const CATS = ['Opening / Greeting','Active Listening','Empathy & Tone','Problem Resolution','Policy Adherence','Closing']
  const WEIGHTS = [15, 20, 20, 25, 10, 10]
  const completedCalls = calls.filter(c => c.call_scores?.length)
  const catAvgs = SCORE_KEYS.map(key =>
    completedCalls.length
      ? Math.round(completedCalls.reduce((s, c) => s + (c.call_scores[0]?.[key] ?? 0), 0) / completedCalls.length)
      : 0
  )

  const labelW = 120, barMaxW = 260, barH = 7
  CATS.forEach((cat, i) => {
    const avg = catAvgs[i]
    const rgb = scoreRGB(avg)
    const fillW = (avg / 100) * barMaxW

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...GRAY)
    doc.text(cat, MAR, y)

    // Track
    doc.setFillColor(232, 239, 246)
    doc.roundedRect(MAR + labelW, y - barH + 1, barMaxW, barH, 2, 2, 'F')
    // Fill
    doc.setFillColor(...rgb)
    if (fillW > 0) doc.roundedRect(MAR + labelW, y - barH + 1, fillW, barH, 2, 2, 'F')

    // Score
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...rgb)
    doc.text(`${avg}`, MAR + labelW + barMaxW + 8, y)

    // Label
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(...GRAY)
    doc.text(scoreLabel(avg), MAR + labelW + barMaxW + 28, y)

    y += 16
  })
  y += 8

  // ── Certification status ─────────────────────────────────────
  sectionHeader('Certification Status')

  const cumAvg = eligibility?.avg_score ? Math.round(eligibility.avg_score) : 0
  const isCert = eligibility?.already_certified
  const isElig = eligibility?.is_eligible && !isCert
  const statusText = isCert ? 'CERTIFIED' : isElig ? 'ELIGIBLE – PENDING ISSUANCE' : 'IN TRAINING'
  const statusRGB = isCert ? TEAL : isElig ? AMBER : BLUE

  doc.setFillColor(...(isCert ? [232,245,238] : isElig ? [250,238,218] : [230,241,251]))
  doc.roundedRect(MAR, y, INNER, 48, 5, 5, 'F')
  doc.setDrawColor(...statusRGB)
  doc.setLineWidth(0.5)
  doc.roundedRect(MAR, y, INNER, 48, 5, 5, 'S')

  // Circle score
  doc.setFillColor(...statusRGB)
  doc.circle(MAR + 32, y + 24, 18, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(255, 255, 255)
  doc.text(String(cumAvg), MAR + 32, y + 28, { align: 'center' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...statusRGB)
  doc.text(statusText, MAR + 62, y + 18)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...GRAY)
  const certDetail = isCert
    ? `Certificate issued ${fmtDate(eligibility?.issued_date)}. Cert #: ${eligibility?.cert_number ?? '—'}`
    : `${completedCalls.length} of 5 required calls completed. Avg score: ${cumAvg}/100. Threshold: 80.`
  doc.text(certDetail, MAR + 62, y + 32)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...GRAY)
  doc.text('Threshold: avg ≥ 80 across 5+ evaluated calls', PW - MAR, y + 18, { align: 'right' })
  doc.text(`Issued by: Certified Training Standards`, PW - MAR, y + 28, { align: 'right' })

  y += 62

  // ── Trainer notes (if any) ───────────────────────────────────
  if (participant.notes) {
    sectionHeader('Trainer Observations')
    doc.setFillColor(247, 249, 252)
    doc.roundedRect(MAR, y, INNER, 48, 4, 4, 'F')
    doc.setFillColor(...BLUE)
    doc.rect(MAR, y, 3, 48, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...NAVY)
    const lines = doc.splitTextToSize(participant.notes, INNER - 20)
    doc.text(lines.slice(0, 4), MAR + 10, y + 14)
    y += 60
  }

  // ── Footer (all pages) ───────────────────────────────────────
  const pageCount = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setDrawColor(...RULE)
    doc.setLineWidth(0.5)
    doc.line(MAR, PH - 42, PW - MAR, PH - 42)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(...GRAY)
    doc.text('MORPHEUS CRM  ·  Certified Training Standards  ·  Albany, NY  ·  morpheuscr.com', MAR, PH - 30)
    doc.text('This report is proprietary and confidential. For official workforce documentation use only.', MAR, PH - 20)
    doc.text(`Report ID: ${reportId}  ·  Page ${i} of ${pageCount}`, PW - MAR, PH - 30, { align: 'right' })
    doc.text(`© ${today.getFullYear()} Certified Training Standards. All rights reserved.`, PW - MAR, PH - 20, { align: 'right' })

    // Confidential stamp
    doc.setFillColor(250, 238, 218)
    doc.roundedRect(PW - MAR - 80, PH - 36, 80, 14, 3, 3, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6)
    doc.setTextColor(...AMBER)
    doc.text('CONFIDENTIAL', PW - MAR - 40, PH - 26, { align: 'center' })
  }

  // ── Save ─────────────────────────────────────────────────────
  const filename = `Morpheus_Report_${participant.cts_id}_${today.getFullYear()}.pdf`
  doc.save(filename)
}
