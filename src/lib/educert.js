// src/lib/educert.js
// ── MORPHEUS.EDU — CAP-C credential certificate PDF ────────────
// Generates the branded certificate for an edu_credentials record.
// Every certificate carries the registry code and the public verify
// URL, so the paper is only ever as good as the live registry entry.

import jsPDF from 'jspdf'

const NAVY  = [13,  27,  42]
const BLUE  = [33, 118, 174]
const TEAL  = [15, 110,  86]
const GOLD  = [186, 147,  23]
const RULE  = [203, 216, 230]
const GRAY  = [100, 115, 130]
const LIGHT = [140, 155, 170]
const WHITE = [255, 255, 255]

/**
 * @param {object} credential  Row from edu_credentials:
 *   { credential_code, holder_name, credential_name, issuer_org,
 *     issued_at, expires_at, status }
 * @param {string} [verifyBase]  Origin for the verify URL
 *                               (defaults to the current site).
 */
export function generateEduCertificatePDF(credential, verifyBase) {
  const base = verifyBase ??
    (typeof window !== 'undefined' ? window.location.origin : 'https://morpheuscr.com')
  const verifyUrl = `${base.replace(/\/$/, '')}/verify/${credential.credential_code}`

  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' })
  const W = doc.internal.pageSize.getWidth()   // 792
  const H = doc.internal.pageSize.getHeight()  // 612

  const fmt = d => new Date(d).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })

  // ── Border frame ─────────────────────────────────────────────
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

  doc.setTextColor(...WHITE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.text('MORPHEUS', 94, 58)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(139, 175, 200)
  doc.text('EDU  ·  ' + credential.issuer_org + '  ·  Albany, New York', 95, 74)

  // Credential code badge
  doc.setFillColor(...BLUE)
  doc.roundedRect(W - 250, 36, 210, 22, 4, 4, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...WHITE)
  doc.text(credential.credential_code, W - 145, 51, { align: 'center' })

  // ── Gold seal (left) ─────────────────────────────────────────
  const sx = 116, sy = 300
  doc.setFillColor(...GOLD);  doc.circle(sx, sy, 58, 'F')
  doc.setFillColor(...NAVY);  doc.circle(sx, sy, 52, 'F')
  doc.setFillColor(...GOLD);  doc.circle(sx, sy, 46, 'F')
  doc.setFillColor(...NAVY);  doc.circle(sx, sy, 40, 'F')
  doc.setTextColor(...GOLD)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('CTS', sx, sy - 12, { align: 'center' })
  doc.setFontSize(6.5)
  doc.text('CLAUDE AI', sx, sy + 1, { align: 'center' })
  doc.text('PRACTITIONER', sx, sy + 10, { align: 'center' })
  doc.setFontSize(7)
  doc.text(String(new Date(credential.issued_at).getFullYear()), sx, sy + 21, { align: 'center' })

  // ── Heading ──────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(13)
  doc.setTextColor(27, 58, 92)
  doc.text('CERTIFICATE OF ACHIEVEMENT', W / 2, 130, { align: 'center' })

  doc.setDrawColor(...GOLD)
  doc.setLineWidth(0.75)
  doc.line(W / 2 - 140, 142, W / 2 + 140, 142)

  doc.setFontSize(12)
  doc.setTextColor(...GRAY)
  doc.text('This certifies that', W / 2, 172, { align: 'center' })

  // Holder name
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(34)
  doc.setTextColor(...NAVY)
  doc.text(credential.holder_name, W / 2, 222, { align: 'center' })

  doc.setDrawColor(...RULE)
  doc.setLineWidth(0.5)
  const nameW = doc.getTextWidth(credential.holder_name)
  doc.line(W / 2 - nameW / 2 - 20, 232, W / 2 + nameW / 2 + 20, 232)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.setTextColor(...GRAY)
  doc.text('has met the requirements of the certification program and is recognized as a', W / 2, 260, { align: 'center' })

  // Credential title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(19)
  doc.setTextColor(...TEAL)
  doc.text(credential.credential_name, W / 2, 294, { align: 'center' })

  // Dates
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  doc.setTextColor(...GRAY)
  const dateLine = `Issued ${fmt(credential.issued_at)}` +
    (credential.expires_at ? `  ·  Valid through ${fmt(credential.expires_at)}` : '  ·  No expiration')
  doc.text(dateLine, W / 2, 320, { align: 'center' })

  // ── Verification panel ───────────────────────────────────────
  const vy = 352
  doc.setFillColor(230, 241, 251)
  doc.roundedRect(W / 2 - 200, vy, 400, 44, 6, 6, 'F')
  doc.setDrawColor(...BLUE)
  doc.setLineWidth(0.5)
  doc.roundedRect(W / 2 - 200, vy, 400, 44, 6, 6, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(12, 68, 124)
  doc.text('VERIFY THIS CREDENTIAL', W / 2, vy + 16, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...NAVY)
  doc.text(verifyUrl, W / 2, vy + 31, { align: 'center' })

  // ── Signature lines ──────────────────────────────────────────
  const sigY = 470
  const sig1x = 260, sig2x = 530
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.5)
  doc.line(sig1x - 80, sigY, sig1x + 80, sigY)
  doc.line(sig2x - 80, sigY, sig2x + 80, sigY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...NAVY)
  doc.text('Program Director', sig1x, sigY + 14, { align: 'center' })
  doc.text('Lead Instructor', sig2x, sigY + 14, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...LIGHT)
  doc.text(credential.issuer_org, sig1x, sigY + 26, { align: 'center' })
  doc.text(credential.issuer_org, sig2x, sigY + 26, { align: 'center' })

  doc.setFontSize(8.5)
  doc.text(`Registry code: ${credential.credential_code}`, W / 2, sigY + 14, { align: 'center' })
  doc.text('MORPHEUS.EDU credential registry', W / 2, sigY + 26, { align: 'center' })

  // ── Bottom band ──────────────────────────────────────────────
  doc.setFillColor(...NAVY)
  doc.rect(20, H - 74, W - 40, 54, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(139, 175, 200)
  doc.text(
    `MORPHEUS.EDU  ·  ${credential.issuer_org}  ·  Albany, NY  ·  morpheuscr.com`,
    W / 2, H - 56, { align: 'center' }
  )
  doc.setFontSize(6.8)
  doc.text(
    'This credential is developed and issued independently by CTS LLC and is not produced, endorsed, or certified by Anthropic.',
    W / 2, H - 43, { align: 'center' }
  )
  doc.text(
    `Claude is a trademark of Anthropic, PBC.  ·  © ${new Date().getFullYear()} CTS LLC. This certificate is valid only while its registry record is active.`,
    W / 2, H - 32, { align: 'center' }
  )

  const filename = `CTS_Certificate_${credential.credential_code}.pdf`
  doc.save(filename)
  return filename
}
