import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

/**
 * Buat PDF Riwayat Pelaporan untuk POV UPT — 100% presisi dengan format Admin BPSDMP.
 * Menyesuaikan isi entri & subtitle secara otomatis berdasarkan filterType ('semua' | 'target' | 'realisasi').
 *
 * @param {object} opts
 * @param {object}   opts.upt          - objek UPT (code, name, matra)
 * @param {number}   opts.year         - tahun
 * @param {string}   opts.filterType   - 'semua' | 'target' | 'realisasi' | 'taruna' | 'penyerapan'
 * @param {Array}    opts.months       - daftar realisasi bulanan UPT
 * @param {Array}    opts.targetMonths - daftar target PK bulanan UPT
 * @param {Array}    opts.tarunaRows   - baris riwayat Data Taruna (sudah berbentuk baris PDF)
 * @param {Array}    opts.penyerapanRows - baris riwayat Penyerapan (sudah berbentuk baris PDF)
 */
export function buildRiwayatPdf({ upt, year, filterType = 'semua', months = [], targetMonths = [], tarunaRows = [], penyerapanRows = [] }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' })
  const pageW = doc.internal.pageSize.getWidth()

  const uptCode = upt?.code || '-'
  const uptName = upt?.name || 'UPT'
  const matra = (upt?.matra || '').toLowerCase()

  // 1. Filter & gabungkan data kronologis berdasarkan filterType
  let allRows = []

  if (filterType === 'semua' || filterType === 'target') {
    targetMonths.forEach((t) => {
      const sub = t.sub
      const statusRaw = sub?.status || t.statusKey || 'draft'
      const status = statusRaw === 'approved' || statusRaw === 'DISETUJUI'
        ? 'Disetujui'
        : statusRaw === 'rejected' || statusRaw === 'DITOLAK'
        ? 'Ditolak'
        : statusRaw === 'pending_pimpinan'
        ? 'pending_pimpinan'
        : statusRaw === 'pending_bpsdmp'
        ? 'pending_bpsdmp'
        : 'Draf'

      allRows.push({
        id: `target-${t.month}`,
        jenis: 'Target PK',
        uptCode,
        uptName,
        matra,
        periode: t.month === 0 ? `Tahunan ${year}` : `${t.month}/${year}`,
        status,
        pengirim: sub?.submittedByName || '-',
        pimpinan: sub?.pimpinanApprovedByName || '-',
        bpsdmp: sub?.approvedByName || sub?.rejectedByName || '-',
        updatedAt: t.updatedAt || sub?.updatedAt,
      })
    })
  }

  if (filterType === 'semua' || filterType === 'realisasi') {
    months.forEach((m) => {
      const sub = m.sub
      const locked = m.locked
      const statusRaw = sub?.status || m.statusKey || (locked ? 'approved' : 'draft')
      const status = statusRaw === 'approved' || statusRaw === 'TERKUNCI' || locked
        ? 'Disetujui'
        : statusRaw === 'rejected' || statusRaw === 'DITOLAK'
        ? 'Ditolak'
        : statusRaw === 'pending_pimpinan'
        ? 'pending_pimpinan'
        : statusRaw === 'pending_bpsdmp'
        ? 'pending_bpsdmp'
        : 'Draf'

      allRows.push({
        id: `realisasi-${m.month}`,
        jenis: 'Realisasi',
        uptCode,
        uptName,
        matra,
        periode: `${m.month}/${year}`,
        status,
        pengirim: sub?.submittedByName || '-',
        pimpinan: sub?.pimpinanApprovedByName || '-',
        bpsdmp: m.approvedBy || sub?.approvedByName || sub?.rejectedByName || '-',
        updatedAt: m.updatedAt || sub?.updatedAt,
      })
    })
  }

  if (filterType === 'semua' || filterType === 'taruna') {
    tarunaRows.forEach((t) => {
      allRows.push({
        id: t.id || `taruna-${t.periode}`,
        jenis: 'Data Taruna',
        uptCode,
        uptName,
        matra,
        periode: t.periode || `Tahun ${year}`,
        status: t.status || 'Draf',
        pengirim: t.pengirim || '-',
        pimpinan: t.pimpinan || '-',
        bpsdmp: t.bpsdmp || '-',
        updatedAt: t.updatedAt,
      })
    })
  }

  if (filterType === 'semua' || filterType === 'penyerapan') {
    penyerapanRows.forEach((t) => {
      allRows.push({
        id: t.id || `penyerapan-${t.periode}`,
        jenis: 'Penyerapan',
        uptCode,
        uptName,
        matra,
        periode: t.periode || '-',
        status: t.status || 'Draf',
        pengirim: t.pengirim || '-',
        pimpinan: t.pimpinan || '-',
        bpsdmp: t.bpsdmp || '-',
        updatedAt: t.updatedAt,
      })
    })
  }

  // Urutkan riwayat berdasarkan updatedAt terbaru (DESC)
  allRows.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))

  const jenisLabel = filterType === 'target' ? 'Target PK' : filterType === 'realisasi' ? 'Realisasi' : filterType === 'taruna' ? 'Data Taruna' : filterType === 'penyerapan' ? 'Penyerapan' : 'Semua Jenis'

  // ---- Header Dokumen (Persis Admin BPSDMP) ----
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(15, 23, 42)
  doc.text('RIWAYAT PELAPORAN - DASPESLUS BPSDMP', pageW / 2, 36, { align: 'center' })

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 116, 139)
  const filterInfo = `Tahun ${year} • ${jenisLabel} • Matra ${matra || 'semua'} • UPT ${uptCode} • Status semua • ${allRows.length} entri`
  doc.text(filterInfo, pageW / 2, 52, { align: 'center' })

  const dateStr = new Date().toLocaleString('id-ID')
  doc.text(`Diekspor: ${dateStr} • ${uptName}`, pageW / 2, 64, { align: 'center' })

  // Garis horizontal pemisah hitam presisi
  doc.setDrawColor(15, 23, 42)
  doc.setLineWidth(1.2)
  doc.line(20, 72, pageW - 20, 72)

  // ---- Tabel Data ----
  const head = [['Jenis', 'UPT / Matra', 'Periode', 'Status', 'Pengirim', 'Pimpinan', 'BPSDMP', 'Update']]
  const body = allRows.map((r) => [
    r.jenis,
    `${r.uptCode}\n${r.uptName}\n${r.matra}`,
    r.periode,
    r.status,
    r.pengirim,
    r.pimpinan,
    r.bpsdmp,
    r.updatedAt ? new Date(r.updatedAt).toLocaleString('id-ID') : '-',
  ])

  autoTable(doc, {
    startY: 78,
    head,
    body: body.length > 0 ? body : [['—', `${uptCode}\n${uptName}\n${matra}`, '—', 'Tidak ada data', '—', '—', '—', '—']],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7, cellPadding: 4, lineColor: [226, 232, 240], lineWidth: 0.4, textColor: [15, 23, 42] },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', fontSize: 7 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 58 },
      1: { cellWidth: 150 },
      2: { cellWidth: 62, halign: 'center' },
      3: { cellWidth: 72, halign: 'center' },
      4: { cellWidth: 85 },
      5: { cellWidth: 85 },
      6: { cellWidth: 85 },
      7: { cellWidth: 95, halign: 'center' },
    },
    margin: { left: 20, right: 20, bottom: 28 },
  })

  // ---- Footer Halaman ----
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    const ph = doc.internal.pageSize.getHeight()
    doc.setFontSize(7)
    doc.setTextColor(100, 116, 139)
    doc.text(`© ${new Date().getFullYear()} BPSDMP Kementerian Perhubungan — Dicetak dari DASPESLUS`, 20, ph - 16)
    doc.text(`Halaman ${i} dari ${totalPages}`, pageW - 20, ph - 16, { align: 'right' })
  }

  return doc.output('bloburl')
}
