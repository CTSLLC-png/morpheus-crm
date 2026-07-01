export function generateCertificatePDF({ participant, certRecord }) {
  const W = 612, H = 792
  const NAVY = [13, 27, 42]
  
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

  const filename = `Morpheus_Certificate_${participant.cts_id}_${certRecord.cert_number}.pdf`
  doc.save(filename)
  return filename
}
