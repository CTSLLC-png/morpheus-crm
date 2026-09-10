// src/lib/educert.js
// ── MORPHEUS.EDU — credential certificate PDF ──────────────────
// Generates the branded certificate for an edu_credentials record.
// Every certificate carries the registry code and the public verify
// URL, so the paper is only ever as good as the live registry entry.

import jsPDF from 'jspdf'
import { SITE_HOST, verifyUrlFor } from './site.js'

const NAVY  = [13,  27,  42]
const BLUE  = [33, 118, 174]
const TEAL  = [15, 110,  86]
const GOLD  = [186, 147,  23]
const RULE  = [203, 216, 230]
const GRAY  = [100, 115, 130]
const LIGHT = [140, 155, 170]
const WHITE = [255, 255, 255]

/**
 * The short issuer mark stamped in the centre of the seal.
 *
 * An issuer already written as an acronym ("CTS LLC") keeps that acronym;
 * a spelled-out name ("Certified Training Standards") is reduced to its
 * initials. Legal suffixes are dropped either way, and the result is capped
 * at four characters because the seal centre is small.
 */
function issuerMark(credential) {
  const words = String(credential.issuer_org ?? '')
    .split(/[^A-Za-z]+/).filter(Boolean)
    .filter(w => !/^(llc|inc|ltd|corp|co|plc|gmbh)$/i.test(w))
  if (!words.length) return 'CTS'

  // A single all-caps token is already an acronym — initialising it would
  // turn "CTS LLC" into "C".
  const mark = (words.length === 1 && words[0] === words[0].toUpperCase())
    ? words[0]
    : words.map(w => w[0].toUpperCase()).join('')
  return mark.slice(0, 4)
}

/**
 * Two short seal lines derived from the credential.
 *
 * Uses `meta.seal_lines` when the record carries an explicit override,
 * otherwise derives them from the credential name. Kept to two lines
 * because the seal is only 40pt across.
 */
function sealTextFor(credential) {
  const explicit = credential.meta?.seal_lines
  if (Array.isArray(explicit) && explicit.length) return explicit.slice(0, 2).map(String)

  // The issuer already has its own line on the seal, so drop issuer words
  // from the derived text — otherwise CTS credentials read "CTS / CTS / ...".
  const issuerWords = new Set(
    String(credential.issuer_org ?? '').toLowerCase().split(/[^a-z]+/).filter(Boolean),
  )
  const words = String(credential.credential_name ?? '')
    .replace(/\(.*?\)/g, ' ')            // drop parenthetical codes
    .replace(/[^A-Za-z ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2
      && !/^(the|and|for|certified|certification)$/i.test(w)
      && !issuerWords.has(w.toLowerCase()))

  if (!words.length) return ['CERTIFIED', '']
  if (words.length === 1) return [words[0].toUpperCase(), '']
  return [words[0].toUpperCase(), words.slice(1, 3).join(' ').toUpperCase()]
}

/**
 * @param {object} credential  Row from edu_credentials:
 *   { credential_code, holder_name, credential_name, issuer_org,
 *     issued_at, expires_at, status }
 * @param {string} [verifyBase]  Override the origin for the verify URL. Left
 *   unset in normal use: a certificate is a permanent artifact, so it carries
 *   the canonical site address rather than whichever host happened to render
 *   it — a PDF issued from a preview deploy would otherwise be stamped with a
 *   hostname that stops resolving.
 */
export function generateEduCertificatePDF(credential, verifyBase) {
  const verifyUrl = verifyBase
    ? `${verifyBase.replace(/\/$/, '')}/verify/${credential.credential_code}`
    : verifyUrlFor(credential.credential_code)

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
  doc.text(issuerMark(credential), sx, sy - 12, { align: 'center' })
  doc.setFontSize(6.5)
  // Seal wording comes from the course, so every credential in the registry
  // — CAP-C, ClearCall CSR, whatever CTS issues next — gets its own seal
  // rather than one course's wording stamped on all of them.
  const sealLines = sealTextFor(credential)
  doc.text(sealLines[0], sx, sy + 1, { align: 'center' })
  if (sealLines[1]) doc.text(sealLines[1], sx, sy + 10, { align: 'center' })
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
    `MORPHEUS.EDU  ·  ${credential.issuer_org}  ·  Albany, NY  ·  ${SITE_HOST}`,
    W / 2, H - 60, { align: 'center' }
  )
  // The disclaimer belongs to the issuing course. Hardcoding CAP-C's wording
  // printed an Anthropic notice on every certificate, including ClearCall,
  // which has nothing to do with Anthropic — on a permanent artifact.
  doc.setFontSize(6.8)
  const disclaimer = credential.disclaimer
    ?? credential.edu_courses?.disclaimer
    ?? `This credential is developed and issued independently by ${credential.issuer_org}.`

  // Lay the footer out from the disclaimer's actual height. A disclaimer long
  // enough to wrap (ClearCall's does) would otherwise print its second line
  // straight through the copyright notice.
  const lines = doc.splitTextToSize(disclaimer, W - 140)
  const LEAD = 8
  let fy = H - 49
  doc.text(lines, W / 2, fy, { align: 'center' })
  fy += lines.length * LEAD + 3
  doc.text(
    `© ${new Date().getFullYear()} ${credential.issuer_org}. This certificate is valid only while its registry record is active.`,
    W / 2, fy, { align: 'center' }
  )

  const filename = `CTS_Certificate_${credential.credential_code}.pdf`
  doc.save(filename)
  return filename
}
