import jsPDF from 'jspdf'
import AutoTable from 'jspdf-autotable'

const NAVY = [13, 27, 42]
const BLUE = [93, 202, 165]
const MIDBL = [184, 207, 228]

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
    `Generated: ${new Date(today).toLocaleDateString()}`,
    `Program: ${participant.program_source}`,
    participant.ldss_case_number ? `Case #: ${participant.ldss_case_number}` : null,
  ].filter(Boolean)
  const metaSpacing = INNER / meta.length
  meta.forEach((m, i) => doc.text(m, MAR + i * metaSpacing, 86))

  let y = 110

  doc.save(`Morpheus_Report_${participant.cts_id}_${today.getFullYear()}.pdf`)
}
