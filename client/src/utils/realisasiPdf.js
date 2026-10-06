import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { MONTHS, fmtNum } from './format'

const NAVY = [15, 23, 42]
const NAVY_SOFT = [71, 85, 105]
const GOLD = [245, 158, 11]

/**
 * Buat PDF laporan realisasi bulanan UPT (pratinjau sebelum kirim).
 * rows: [{ name, isParent, values: {pesertaL,pesertaP,lulusanL,lulusanP}, total }]
 * Mengembalikan URL blob yang bisa dipakai sebagai src iframe.
 */
export function buildRealisasiPdf({ uptCode, uptName, year, month, rows, totalPeserta, totalLulusan, grandTotal }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 44

  // ---- Kop surat ----
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...NAVY)
  doc.text('KEMENTERIAN PERHUBUNGAN', pageW / 2, 62, { align: 'center' })
  doc.setFontSize(11)
  doc.text('BADAN PENGEMBANGAN SUMBER DAYA MANUSIA PERHUBUNGAN', pageW / 2, 80, { align: 'center' })
  doc.setFontSize(12)
  doc.text(`${uptName || 'UPT'} (${uptCode || '-'})`, pageW / 2, 100, { align: 'center' })

  doc.setDrawColor(...NAVY)
  doc.setLineWidth(1.6)
  doc.line(margin, 112, pageW - margin, 112)
  doc.setLineWidth(0.7)
  doc.line(margin, 117, pageW - margin, 117)

  // ---- Judul ----
  doc.setFontSize(14)
  doc.text('LAPORAN REALISASI BULANAN', pageW / 2, 148, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...NAVY_SOFT)
  doc.text(`Periode: ${MONTHS[month - 1]} ${year}`, pageW / 2, 165, { align: 'center' })

  // ---- Tabel ----
  const body = rows.map((r, i) => [
    { content: String(i + 1), styles: { halign: 'center' } },
    {
      content: r.isParent ? r.name : `      ${r.name}`,
      styles: { halign: 'left', fontStyle: r.isParent ? 'bold' : 'normal' },
    },
    { content: fmtNum(r.values.pesertaL), styles: { halign: 'center' } },
    { content: fmtNum(r.values.pesertaP), styles: { halign: 'center' } },
    { content: fmtNum(r.values.lulusanL), styles: { halign: 'center' } },
    { content: fmtNum(r.values.lulusanP), styles: { halign: 'center' } },
    { content: fmtNum(r.total), styles: { halign: 'center', fontStyle: 'bold' } },
  ])

  autoTable(doc, {
    startY: 184,
    margin: { left: margin, right: margin, bottom: 60 },
    head: [[
      { content: 'No', styles: { halign: 'center' } },
      { content: 'Kategori Diklat', styles: { halign: 'left' } },
      { content: 'Peserta L', styles: { halign: 'center' } },
      { content: 'Peserta P', styles: { halign: 'center' } },
      { content: 'Lulusan L', styles: { halign: 'center' } },
      { content: 'Lulusan P', styles: { halign: 'center' } },
      { content: 'Total', styles: { halign: 'center' } },
    ]],
    body,
    foot: [[
      { content: 'Total Peserta: ' + fmtNum(totalPeserta) + '   |   Total Lulusan: ' + fmtNum(totalLulusan), colSpan: 6, styles: { halign: 'right', fontStyle: 'bold', fillColor: [248, 250, 252], textColor: NAVY } },
      { content: fmtNum(grandTotal), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
    ]],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 6,
      lineColor: [226, 232, 240],
      lineWidth: 0.6,
      textColor: NAVY,
    },
    headStyles: {
      fillColor: NAVY,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  })

  const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : 184
  let sy = finalY + 70
  if (sy > pageH - 130) {
    doc.addPage()
    sy = 90
  }

  // ---- Tanda tangan ----
  doc.setFontSize(9.5)
  doc.setTextColor(...NAVY_SOFT)
  doc.text('Dibuat melalui aplikasi DASPESLUS (Sistem Pelaporan PK BPSDMP).', margin, sy)
  doc.text(`Dicetak: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, margin, sy + 14)

  doc.setTextColor(...NAVY)
  doc.setFont('helvetica', 'bold')
  doc.text('Petugas Pelaporan,', pageW - margin - 150, sy)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...NAVY_SOFT)
  doc.text(`( ${uptCode || '-'} )`, pageW - margin - 150, sy + 56)

  return doc.output('bloburl')
}
