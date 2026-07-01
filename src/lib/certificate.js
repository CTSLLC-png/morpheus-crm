// src/lib/certificate.js
// ── Morpheus CRM — Certificate PDF Generator (Sprint 3) ─────────
// Manual trigger: trainer clicks "Issue Certificate" on participant
// profile. Generates branded PDF, saves cert record to Supabase,
// and downloads the file to the trainer's machine.

import jsPDF from 'jspdf'
import { supabase } from './supabase.js'

const NAVY   = [13,  27,  42]
const MIDBL  = [27,  58,  92]
const BLUE   = [33, 118, 174]
const TEAL   = [15, 110,  86]
const GOLD   = [186, 147,  23]
const RULE   = [203, 216, 230]
const WHITE  = [255, 255, 255]

// ── Generate cert number MPR-YYYY-XXXX ──────────────────────────
async function getNextCertNumber() {
  const year = new Date().getFullYear()
  const { count } = await supabase
    .from('certifications')
    .select('*', { count: 'exact', head: true })
  const seq = String((count ?? 0) + 1).padStart(4, '0')
  return `MPR-${year}-${seq}`
}

// ── Issue cert record in DB ──────────────────────────────────────
export async function issueCertificate({ participantId, qualifyingAvg, qualifyingCalls, issuedBy }) {
  const certNumber = await getNextCertNumber()
  const { data, error } = await supabase
    .from('certifications')
    .insert({
      participant_id:   participantId,
      cert_number:      certNumber,
      issued_date:      new Date().toISOString().split('T')[0],
      qualifying_avg:   Math.round(qualifyingAvg),
      qualifying_calls: qualifyingCalls,
      issued_by:        issuedBy ?? null,
      status:           'Issued',
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Generate + download certificate PDF ─────────────────────────
export async function generateCertificatePDF({ participant, certRecord }) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' })
  const W = doc.internal.pageSize.getWidth()   // 792
  const H = doc.internal.pageSize.getHeight()  // 612

  const issued = new Date(certRecord.issued_date).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  })

  // ── Outer border frame ───────────────────────────────────────
  doc.setDrawColor(...GOLD)
  doc.setLineWidth(2)
  doc.rect(20, 20, W - 40, H - 40)
  doc.setLineWidth(0.5)
  doc.rect(26, 26, W - 52, H - 52)

  // ── Top band ─────────────────────────────────────────────────
  doc.setFillColor(...NAVY)
  doc.rect(20, 20, W - 40, 80, 'F')

  // Logo M glyph
  doc.setDrawColor(...BLUE)
  doc.setLineWidth(2.5)
  const lx = 48, ly = 36
  doc.line(lx,      ly + 34, lx,      ly)
  doc.line(lx,      ly,      lx + 16, ly + 17)
  doc.line(lx + 16, ly + 17, lx + 32, ly)
  doc.line(lx + 32, ly,      lx + 32, ly + 34)

  // Wordmark
  doc.setTextColor(...WHITE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.text('MORPHEUS', 94, 58)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(139, 175, 200)
  doc.text('CRM  ·  Certified Training Standards  ·  Albany, New York', 95, 74)

  // Cert number badge
  doc.setFillColor(...BLUE)
  doc.roundedRect(W - 220, 36, 180, 22, 4, 4, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...WHITE)
  doc.text(certRecord.cert_number, W - 130, 51, { align: 'center' })

  // ── Gold seal circle (left) ──────────────────────────────────
  const sx = 116, sy = 310
  doc.setFillColor(...GOLD)
  doc.circle(sx, sy, 58, 'F')
  doc.setFillColor(...NAVY)
  doc.circle(sx, sy, 52, 'F')
  doc.setFillColor(...GOLD)
  doc.circle(sx, sy, 46, 'F')
  doc.setFillColor(...NAVY)
  doc.circle(sx, sy, 40, 'F')

  // Seal text
  doc.setTextColor(...GOLD)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('CTS', sx, sy - 10, { align: 'center' })
  doc.setFontSize(7)
  doc.text('CERTIFIED', sx, sy + 4, { align: 'center' })
  doc.setFontSize(7)
  doc.text(String(new Date(certRecord.issued_date).getFullYear()), sx, sy + 15, { align: 'center' })

  // ── Certificate of Completion heading ────────────────────────
  doc.setTextColor(...NAVY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(13)
  doc.setTextColor(...MIDBL)
  doc.text('CERTIFICATE OF COMPLETION', W / 2, 130, { align: 'center' })

  // Decorative rule
  doc.setDrawColor(...GOLD)
  doc.setLineWidth(0.75)
  doc.line(W / 2 - 140, 142, W / 2 + 140, 142)

  // This certifies
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.setTextColor(100, 115, 130)
  doc.text('This certifies that', W / 2, 175, { align: 'center' })

  // Participant name
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(36)
  doc.setTextColor(...NAVY)
  doc.text(participant.full_name, W / 2, 228, { align: 'center' })

  // Name underline
  doc.setDrawColor(...RULE)
  doc.setLineWidth(0.5)
  const nameWidth = doc.getTextWidth(participant.full_name)
  doc.line(W / 2 - nameWidth / 2 - 20, 238, W / 2 + nameWidth / 2 + 20, 238)

  // Has successfully completed
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.setTextColor(100, 115, 130)
  doc.text('has successfully completed the required training and evaluation to earn the', W / 2, 268, { align: 'center' })

  // Certification title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...TEAL)
  doc.text('Customer Experience Representative Certification', W / 2, 302, { align: 'center' })

  // Program
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(100, 115, 130)
  doc.text(
    `Program: ${participant.program_source}  ·  Cohort: ${participant.ldss_office ?? 'CTS Training'}`,
    W / 2, 328, { align: 'center' }
  )

  // Score details
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(140, 155, 170)
  doc.text(
    `Qualifying average: ${certRecord.qualifying_avg}/100  ·  Evaluated calls: ${certRecord.qualifying_calls}  ·  Threshold: 80/100`,
    W / 2, 348, { align: 'center' }
  )

  // ── Signature lines ──────────────────────────────────────────
  const sigY = 430
  const sig1x = 260, sig2x = 530

  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.5)
  doc.line(sig1x - 80, sigY, sig1x + 80, sigY)
  doc.line(sig2x - 80, sigY, sig2x + 80, sigY)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...NAVY)
  doc.text('Program Director', sig1x, sigY + 14, { align: 'center' })
  doc.text('Lead Trainer', sig2x, sigY + 14, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(140, 155, 170)
  doc.text('Certified Training Standards', sig1x, sigY + 26, { align: 'center' })
  doc.text('Certified Training Standards', sig2x, sigY + 26, { align: 'center' })

  // ── Issue date + CTS ID ──────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(140, 155, 170)
  doc.text(`Issued: ${issued}`, W / 2, sigY + 14, { align: 'center' })
  doc.text(`CTS ID: ${participant.cts_id}`, W / 2, sigY + 26, { align: 'center' })

  // ── Bottom band ──────────────────────────────────────────────
  doc.setFillColor(...NAVY)
  doc.rect(20, H - 68, W - 40, 48, 'F')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(139, 175, 200)
  doc.text(
    'Morpheus CRM  ·  Certified Training Standards  ·  Albany, NY  ·  morpheuscr.com',
    W / 2, H - 46, { align: 'center' }
  )
  doc.text(
    `© ${new Date().getFullYear()} Certified Training Standards. All rights reserved. This certificate is proprietary and non-transferable.`,
    W / 2, H - 32, { align: 'center' }
  )

  // ── Download ─────────────────────────────────────────────────
  const filename = `Morpheus_Certificate_${participant.cts_id}_${certRecord.cert_number}.pdf`
  doc.save(filename)
  return filename
}

// ── Combined: issue DB record + generate PDF ─────────────────────
export async function issueAndDownloadCertificate({
  participant,
  qualifyingAvg,
  qualifyingCalls,
  issuedBy = null,
}) {
  const certRecord = await issueCertificate({
    participantId:   participant.id,
    qualifyingAvg,
    qualifyingCalls,
    issuedBy,
  })
  const filename = await generateCertificatePDF({ participant, certRecord })
  return { certRecord, filename }
}
