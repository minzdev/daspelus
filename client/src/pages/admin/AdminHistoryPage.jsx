import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { apiError } from '../../lib/api'
import { Alert, EmptyState, SkeletonRows, Modal, Spinner } from '../../components/ui'
import {
  IconHistory, IconSearch, IconRefresh, IconFileText, IconTarget,
  IconBuilding, IconDownload, IconGraduation, IconPeople, IconEye,
  IconCheck, IconX, IconLayers, IconClock, IconCheckCircle
} from '../../components/icons'
import logoBpsdm from '../../assets/logo-bpsdm.png'
import { fmtDateTime, fmtNum } from '../../utils/format'
import { useToast } from '../../components/Toast'
import clsx from 'clsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const JENIS_OPTIONS = [
  { value: 'semua', label: 'Semua Kategori' },
  { value: 'target', label: 'Target PK' },
  { value: 'realisasi', label: 'Laporan Realisasi' },
  { value: 'taruna', label: 'Master Data Taruna' },
  { value: 'penyerapan', label: 'Penyerapan Lulusan' },
]

const MATRA_OPTIONS = [
  { value: 'semua', label: 'Semua Matra' },
  { value: 'darat', label: 'Darat' },
  { value: 'laut', label: 'Laut' },
  { value: 'udara', label: 'Udara' },
  { value: 'aparatur', label: 'Aparatur' },
]

const STATUS_OPTIONS = [
  { value: 'semua', label: 'Semua Status' },
  { value: 'approved', label: 'Disetujui Final' },
  { value: 'rejected', label: 'Ditolak / Perlu Revisi' },
  { value: 'pending_bpsdmp', label: 'Menunggu BPSDMP' },
  { value: 'pending_pimpinan', label: 'Menunggu Pimpinan UPT' },
]

function normalizeStatus(rawStatus) {
  const s = String(rawStatus || '').toLowerCase()
  if (s === 'approved' || s === 'approved_admin' || s === 'approved_bpsdmp') {
    return { key: 'approved', label: 'Disetujui Final', badgeCls: 'bg-emerald-50 text-emerald-700 ring-emerald-300' }
  }
  if (s === 'rejected' || s === 'rejected_admin' || s === 'rejected_bpsdmp') {
    return { key: 'rejected', label: 'Ditolak / Revisi', badgeCls: 'bg-red-50 text-red-700 ring-red-300' }
  }
  if (s === 'pending_bpsdmp' || s === 'submitted_admin') {
    return { key: 'pending_bpsdmp', label: 'Menunggu BPSDMP', badgeCls: 'bg-sky-50 text-sky-700 ring-sky-300' }
  }
  if (s === 'pending_pimpinan' || s === 'submitted_pimpinan') {
    return { key: 'pending_pimpinan', label: 'Menunggu Pimpinan', badgeCls: 'bg-amber-50 text-amber-700 ring-amber-300' }
  }
  return { key: 'draft', label: s ? s.toUpperCase() : 'DRAFT', badgeCls: 'bg-slate-100 text-slate-700 ring-slate-200' }
}

function pctText(real, target) {
  const r = Number(real) || 0
  const t = Number(target) || 0
  if (!t || t <= 0) return '-'
  return `${((r / t) * 100).toFixed(1)}%`
}

function StatusBadge({ status }) {
  const norm = normalizeStatus(status)
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 whitespace-nowrap', norm.badgeCls)}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', norm.key === 'approved' ? 'bg-emerald-500' : norm.key === 'rejected' ? 'bg-red-500' : 'bg-amber-500')} />
      {norm.label}
    </span>
  )
}

function JenisBadge({ jenisKey, label }) {
  const map = {
    target: { cls: 'bg-amber-50 text-amber-800 ring-amber-300', icon: IconTarget },
    realisasi: { cls: 'bg-sky-50 text-sky-800 ring-sky-300', icon: IconFileText },
    taruna: { cls: 'bg-purple-50 text-purple-800 ring-purple-300', icon: IconPeople },
    penyerapan: { cls: 'bg-emerald-50 text-emerald-800 ring-emerald-300', icon: IconGraduation },
  }
  const meta = map[jenisKey] || { cls: 'bg-slate-50 text-slate-700 ring-slate-300', icon: IconFileText }
  const IconComp = meta.icon

  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold ring-1 whitespace-nowrap', meta.cls)}>
      <IconComp className="h-3.5 w-3.5 shrink-0" />
      {label}
    </span>
  )
}

let cachedLogoBase64 = null
function getLogoDataUrl() {
  if (cachedLogoBase64) return Promise.resolve(cachedLogoBase64)
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        cachedLogoBase64 = canvas.toDataURL('image/png')
        resolve(cachedLogoBase64)
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = logoBpsdm
  })
}

/** Fungsi Ekspor PDF Berkas Tunggal untuk Tiap Jenis Laporan */
async function exportSingleReportPdf(item, detail) {
  const isLandscape = item.jenisKey === 'penyerapan' || item.jenisKey === 'realisasi'
  const doc = new jsPDF({
    unit: 'pt',
    format: 'a4',
    orientation: isLandscape ? 'landscape' : 'portrait',
  })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()

  // Ambil dataUrl logo jika ada
  const logoData = await getLogoDataUrl().catch(() => null)
  if (logoData) {
    try {
      doc.addImage(logoData, 'PNG', 36, 26, 46, 46)
    } catch {
      // fallback without logo image
    }
  }

  // 1. Kop Resmi Kementerian Perhubungan & BPSDMP
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(15, 23, 42)
  doc.text('KEMENTERIAN PERHUBUNGAN', pageW / 2, 38, { align: 'center' })
  doc.setFontSize(9.5)
  doc.text('BADAN PENGEMBANGAN SUMBER DAYA MANUSIA PERHUBUNGAN', pageW / 2, 52, { align: 'center' })
  doc.setFontSize(10.5)
  doc.text(`${item.uptName.toUpperCase()} (${item.uptCode})`, pageW / 2, 68, { align: 'center' })

  doc.setDrawColor(15, 23, 42)
  doc.setLineWidth(1.4)
  doc.line(36, 78, pageW - 36, 78)
  doc.setLineWidth(0.6)
  doc.line(36, 81, pageW - 36, 81)

  // 2. Judul Dokumen & Metadata
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  const judulDoc =
    item.jenisKey === 'target'
      ? 'TARGET PERJANJIAN KINERJA (PK)'
      : item.jenisKey === 'realisasi'
      ? 'LAPORAN CAPAIAN REALISASI BULANAN'
      : item.jenisKey === 'taruna'
      ? 'MASTER DATA TARUNA'
      : 'LAPORAN PENYERAPAN LULUSAN'

  doc.text(judulDoc, pageW / 2, 102, { align: 'center' })
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105)
  doc.text(
    `Periode: ${item.periode}   |   Status Berkas: ${normalizeStatus(item.status).label.toUpperCase()}   |   Matra: ${item.matra.toUpperCase()}`,
    pageW / 2,
    116,
    { align: 'center' }
  )

  const startY = 126

  // 3. Render Tabel Data Berkas
  if (item.jenisKey === 'realisasi') {
    const rawPrograms = detail?.programs || []
    const hasAnyData = rawPrograms.some(
      (p) =>
        (p.pesertaL || 0) > 0 ||
        (p.pesertaP || 0) > 0 ||
        (p.lulusanL || 0) > 0 ||
        (p.lulusanP || 0) > 0 ||
        (p.targetPeserta || 0) > 0 ||
        (p.targetLulusan || 0) > 0
    )

    const activeIds = new Set()
    if (hasAnyData) {
      for (const p of rawPrograms) {
        if (
          (p.pesertaL || 0) > 0 ||
          (p.pesertaP || 0) > 0 ||
          (p.lulusanL || 0) > 0 ||
          (p.lulusanP || 0) > 0 ||
          (p.targetPeserta || 0) > 0 ||
          (p.targetLulusan || 0) > 0
        ) {
          activeIds.add(p.programId)
          if (p.parentId) activeIds.add(p.parentId)
        }
      }
      for (const p of rawPrograms) {
        if (p.isParent && rawPrograms.some((c) => c.parentId === p.programId && activeIds.has(c.programId))) {
          activeIds.add(p.programId)
        }
      }
    }

    const displayPrograms = hasAnyData ? rawPrograms.filter((p) => activeIds.has(p.programId)) : rawPrograms
    const parentPrograms = rawPrograms.filter((p) => p.isParent)
    const sumTgtPes = parentPrograms.reduce((s, p) => s + (Number(p.targetPeserta) || 0), 0)
    const sumPesL = parentPrograms.reduce((s, p) => s + (Number(p.pesertaL) || 0), 0)
    const sumPesP = parentPrograms.reduce((s, p) => s + (Number(p.pesertaP) || 0), 0)
    const sumTotPes = sumPesL + sumPesP
    const sumTgtLul = parentPrograms.reduce((s, p) => s + (Number(p.targetLulusan) || 0), 0)
    const sumLulL = parentPrograms.reduce((s, p) => s + (Number(p.lulusanL) || 0), 0)
    const sumLulP = parentPrograms.reduce((s, p) => s + (Number(p.lulusanP) || 0), 0)
    const sumTotLul = sumLulL + sumLulP

    const head = [
      [
        'No',
        'Program Kerja',
        'Target Peserta',
        'Peserta (L)',
        'Peserta (P)',
        'Total Peserta',
        '% Capaian',
        'Target Lulusan',
        'Lulusan (L)',
        'Lulusan (P)',
        'Total Lulusan',
        '% Capaian',
      ],
    ]

    const body = displayPrograms.map((p, idx) => {
      const totPeserta = (p.pesertaL || 0) + (p.pesertaP || 0)
      const totLulusan = (p.lulusanL || 0) + (p.lulusanP || 0)
      const isParent = p.isParent
      return [
        idx + 1,
        isParent ? { content: p.programName, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } } : `  ↳ ${p.programName}`,
        fmtNum(p.targetPeserta),
        fmtNum(p.pesertaL),
        fmtNum(p.pesertaP),
        { content: fmtNum(totPeserta), styles: { fontStyle: 'bold', fillColor: isParent ? [241, 245, 249] : [248, 250, 252] } },
        pctText(totPeserta, p.targetPeserta),
        fmtNum(p.targetLulusan),
        fmtNum(p.lulusanL),
        fmtNum(p.lulusanP),
        { content: fmtNum(totLulusan), styles: { fontStyle: 'bold', fillColor: isParent ? [241, 245, 249] : [248, 250, 252] } },
        pctText(totLulusan, p.targetLulusan),
      ]
    })

    if (body.length > 0) {
      body.push([
        { content: '', styles: { fillColor: [226, 232, 240] } },
        { content: 'TOTAL CAPAIAN', styles: { fontStyle: 'bold', fillColor: [226, 232, 240] } },
        { content: fmtNum(sumTgtPes), styles: { fontStyle: 'bold', fillColor: [226, 232, 240], halign: 'center' } },
        { content: fmtNum(sumPesL), styles: { fontStyle: 'bold', fillColor: [226, 232, 240], halign: 'center' } },
        { content: fmtNum(sumPesP), styles: { fontStyle: 'bold', fillColor: [226, 232, 240], halign: 'center' } },
        { content: fmtNum(sumTotPes), styles: { fontStyle: 'bold', fillColor: [219, 234, 254], halign: 'center' } },
        { content: pctText(sumTotPes, sumTgtPes), styles: { fontStyle: 'bold', fillColor: [219, 234, 254], halign: 'center' } },
        { content: fmtNum(sumTgtLul), styles: { fontStyle: 'bold', fillColor: [226, 232, 240], halign: 'center' } },
        { content: fmtNum(sumLulL), styles: { fontStyle: 'bold', fillColor: [226, 232, 240], halign: 'center' } },
        { content: fmtNum(sumLulP), styles: { fontStyle: 'bold', fillColor: [226, 232, 240], halign: 'center' } },
        { content: fmtNum(sumTotLul), styles: { fontStyle: 'bold', fillColor: [219, 234, 254], halign: 'center' } },
        { content: pctText(sumTotLul, sumTgtLul), styles: { fontStyle: 'bold', fillColor: [219, 234, 254], halign: 'center' } },
      ])
    }

    autoTable(doc, {
      startY,
      head,
      body: body.length > 0 ? body : [['-', 'Belum ada data program kerja', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-']],
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 7, cellPadding: 3.5, lineColor: [226, 232, 240], lineWidth: 0.5 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', fontSize: 6.8, halign: 'center' },
      alternateRowStyles: { fillColor: [252, 253, 254] },
      columnStyles: {
        0: { cellWidth: 24, halign: 'center' },
        1: { cellWidth: 196 },
        2: { cellWidth: 52, halign: 'center' },
        3: { cellWidth: 46, halign: 'center' },
        4: { cellWidth: 46, halign: 'center' },
        5: { cellWidth: 54, halign: 'center' },
        6: { cellWidth: 46, halign: 'center' },
        7: { cellWidth: 52, halign: 'center' },
        8: { cellWidth: 46, halign: 'center' },
        9: { cellWidth: 46, halign: 'center' },
        10: { cellWidth: 54, halign: 'center' },
        11: { cellWidth: 46, halign: 'center' },
      },
      margin: { left: 36, right: 36, bottom: 40 },
    })
  } else if (item.jenisKey === 'target') {
    const rawPrograms = detail?.programs || []
    const hasAnyTarget = rawPrograms.some((p) => (p.targetPeserta || 0) > 0 || (p.targetLulusan || 0) > 0)
    const activeIds = new Set()
    if (hasAnyTarget) {
      for (const p of rawPrograms) {
        if ((p.targetPeserta || 0) > 0 || (p.targetLulusan || 0) > 0) {
          activeIds.add(p.programId)
          if (p.parentId) activeIds.add(p.parentId)
        }
      }
      for (const p of rawPrograms) {
        if (p.isParent && rawPrograms.some((c) => c.parentId === p.programId && activeIds.has(c.programId))) {
          activeIds.add(p.programId)
        }
      }
    }

    const displayPrograms = hasAnyTarget ? rawPrograms.filter((p) => activeIds.has(p.programId)) : rawPrograms
    const parentPrograms = rawPrograms.filter((p) => p.isParent)
    const sumTgtPes = parentPrograms.reduce((s, p) => s + (Number(p.targetPeserta) || 0), 0)
    const sumTgtLul = parentPrograms.reduce((s, p) => s + (Number(p.targetLulusan) || 0), 0)

    const head = [['No', 'Program Kerja', 'Target Peserta (Org)', 'Target Lulusan (Org)']]
    const body = displayPrograms.map((p, idx) => [
      idx + 1,
      p.isParent ? { content: p.programName, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } } : `  ↳ ${p.programName}`,
      fmtNum(p.targetPeserta),
      fmtNum(p.targetLulusan),
    ])

    if (body.length > 0) {
      body.push([
        { content: '', styles: { fillColor: [226, 232, 240] } },
        { content: 'TOTAL TARGET KINERJA', styles: { fontStyle: 'bold', fillColor: [226, 232, 240] } },
        { content: fmtNum(sumTgtPes), styles: { fontStyle: 'bold', fillColor: [219, 234, 254], halign: 'center' } },
        { content: fmtNum(sumTgtLul), styles: { fontStyle: 'bold', fillColor: [219, 234, 254], halign: 'center' } },
      ])
    }

    autoTable(doc, {
      startY,
      head,
      body: body.length > 0 ? body : [['-', 'Belum ada data target program', '-', '-']],
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 4, lineColor: [226, 232, 240], lineWidth: 0.5 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', fontSize: 7.5, halign: 'center' },
      alternateRowStyles: { fillColor: [252, 253, 254] },
      columnStyles: {
        0: { cellWidth: 28, halign: 'center' },
        1: { cellWidth: 295 },
        2: { cellWidth: 100, halign: 'center' },
        3: { cellWidth: 100, halign: 'center' },
      },
      margin: { left: 36, right: 36, bottom: 40 },
    })
  } else if (item.jenisKey === 'taruna') {
    const tarunas = detail?.tarunas || []
    const head = [['No', 'Nama Lengkap Taruna', 'Nomor Induk / NIM', 'Program Studi', 'L/P', 'Status']]
    const body = tarunas.map((t, idx) => [
      idx + 1,
      t.nama || t.name || '-',
      t.nim || t.nik || '-',
      t.prodi?.namaProdi || t.prodi || '-',
      t.jenisKelamin === 'L' ? 'L' : t.jenisKelamin === 'P' ? 'P' : '-',
      t.isActive ? 'Aktif' : 'Non-Aktif',
    ])

    autoTable(doc, {
      startY,
      head,
      body: body.length > 0 ? body : [['-', 'Belum ada data taruna terdaftar', '-', '-', '-', '-']],
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 4, lineColor: [226, 232, 240], lineWidth: 0.5 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [252, 253, 254] },
      columnStyles: {
        0: { cellWidth: 28, halign: 'center' },
        1: { cellWidth: 155 },
        2: { cellWidth: 90, halign: 'center' },
        3: { cellWidth: 160 },
        4: { cellWidth: 35, halign: 'center' },
        5: { cellWidth: 55, halign: 'center' },
      },
      margin: { left: 36, right: 36, bottom: 40 },
    })
  } else if (item.jenisKey === 'penyerapan') {
    const records = detail?.records || []
    const head = [['No', 'Program Studi', 'Nama Lulusan', 'Kategori', 'Instansi / Perusahaan Tempat Bekerja', 'Jabatan / Posisi']]
    const body = records.map((r, idx) => [
      idx + 1,
      r.prodi?.namaProdi || r.namaProdi || '-',
      r.namaLulusan || r.nama || '-',
      (r.kategoriInstansi || r.statusKerja || '-').toUpperCase(),
      r.namaInstansi || '-',
      r.jabatan || '-',
    ])

    autoTable(doc, {
      startY,
      head,
      body: body.length > 0 ? body : [['-', 'Belum ada data lulusan terserap', '-', '-', '-', '-']],
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 4, lineColor: [226, 232, 240], lineWidth: 0.5 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [252, 253, 254] },
      columnStyles: {
        0: { cellWidth: 28, halign: 'center' },
        1: { cellWidth: 160 },
        2: { cellWidth: 155 },
        3: { cellWidth: 85, halign: 'center' },
        4: { cellWidth: 215 },
        5: { cellWidth: 126 },
      },
      margin: { left: 36, right: 36, bottom: 40 },
    })
  }

  // 4. Catatan Verifikator jika ada
  let currentY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 14 : startY + 50
  if (item.notes && item.notes !== '-' && currentY + 40 < pageH) {
    doc.setFillColor(254, 243, 199)
    doc.roundedRect(36, currentY, pageW - 72, 22, 3, 3, 'F')
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(146, 64, 14)
    doc.text(`Catatan / Arahan Verifikator: "${item.notes}"`, 44, currentY + 14)
    currentY += 28
  }

  // 5. Lembar Kolom Pengesahan 3 Pihak Resmi
  if (currentY + 80 < pageH) {
    const signHead = [['1. PENGIRIM DOKUMEN', '2. VERIFIKASI PIMPINAN UPT', '3. PENGESAHAN FINAL BPSDMP']]
    const signBody = [
      [
        `Diajukan oleh:\n${item.pengirim || 'Admin UPT'}\n\nWaktu Kirim:\n${item.updatedAt ? fmtDateTime(item.updatedAt) : '-'}`,
        `Diverifikasi oleh:\n${item.pimpinan !== '-' ? item.pimpinan : 'Pimpinan UPT'}\n\nStatus Reviu:\n${item.pimpinan !== '-' ? 'Disetujui Pimpinan UPT' : 'Menunggu Reviu'}`,
        `Disahkan oleh:\n${item.bpsdmp !== '-' ? item.bpsdmp : 'Super Admin BPSDMP'}\n\nStatus Pengesahan:\n${normalizeStatus(item.status).label}`,
      ],
    ]

    autoTable(doc, {
      startY: currentY + 6,
      head: signHead,
      body: signBody,
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 7,
        cellPadding: 6,
        lineColor: [203, 213, 225],
        lineWidth: 0.5,
        textColor: [30, 41, 59],
      },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: 7.5,
        halign: 'center',
      },
      columnStyles: {
        0: { halign: 'center' },
        1: { halign: 'center' },
        2: { halign: 'center' },
      },
      margin: { left: 36, right: 36, bottom: 35 },
    })
  }

  // 6. Footer Cetak Dokumen
  doc.setFontSize(7)
  doc.setTextColor(148, 163, 184)
  doc.text('Dokumen resmi dicetak dari Sistem Informasi DASPESLUS BPSDMP Kementerian Perhubungan', 36, pageH - 18)
  doc.text(`Waktu Cetak: ${new Date().toLocaleString('id-ID')}`, pageW - 36, pageH - 18, { align: 'right' })

  const safeCode = (item.uptCode || 'UPT').replace(/[^a-zA-Z0-9_-]/g, '_')
  const safePeriod = (item.periode || 'Periode').replace(/[^a-zA-Z0-9_-]/g, '_')
  doc.save(`${item.jenisKey.toUpperCase()}_${safeCode}_${safePeriod}.pdf`)
}

export default function AdminHistoryPage() {
  const toast = useToast()
  const [year, setYear] = useState(new Date().getFullYear())
  const [jenis, setJenis] = useState('semua')
  const [matra, setMatra] = useState('semua')
  const [status, setStatus] = useState('semua')
  const [uptFilter, setUptFilter] = useState('semua')
  const [search, setSearch] = useState('')

  const [upts, setUpts] = useState([])
  const [targetRows, setTargetRows] = useState([])
  const [realRows, setRealRows] = useState([])
  const [tarunaRows, setTarunaRows] = useState([])
  const [absRows, setAbsRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Detail Modal & Data Berkas
  const [detailItem, setDetailItem] = useState(null)
  const [detailData, setDetailData] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [detailSearch, setDetailSearch] = useState('')
  const [showOnlyWithData, setShowOnlyWithData] = useState(true)
  const [exportingId, setExportingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [uptRes, targetRes, realRes, tarunaRes, absRes] = await Promise.all([
        api.get('/upts').catch(() => ({ data: { upts: [] } })),
        api.get('/targets/admin-history').catch(() => ({ data: { targetSubmissions: [] } })),
        api.get('/submissions/admin-history').catch(() => ({ data: { submissions: [] } })),
        api.get('/absorptions/taruna-submissions/admin/inbox', { params: { year, all: 'true' } }).catch(() => ({ data: { submissions: [] } })),
        api.get('/absorptions/admin/inbox', { params: { year } }).catch(() => ({ data: { submissions: [] } })),
      ])

      setUpts(uptRes.data?.upts || [])
      setTargetRows(targetRes.data?.targetSubmissions || [])
      setRealRows(realRes.data?.submissions || [])
      setTarunaRows(tarunaRes.data?.submissions || [])
      setAbsRows(absRes.data?.submissions || [])
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    load()
  }, [load])

  const uptMap = useMemo(() => {
    const m = new Map()
    for (const u of upts) m.set(u.id, u)
    return m
  }, [upts])

  const allRows = useMemo(() => {
    const yearNum = Number(year)
    let rows = []

    // 1. Target PK (single-input saja; baris bulanan lama disembunyikan)
    for (const s of targetRows) {
      if (Number(s.year) !== yearNum) continue
      if (Number(s.month) !== 0) continue
      const upt = uptMap.get(s.uptId)
      rows.push({
        id: `target-${s.id}`,
        rawId: s.id,
        jenis: 'Target PK',
        jenisKey: 'target',
        uptCode: s.uptCode || upt?.code || '-',
        uptName: s.uptName || upt?.name || '-',
        matra: (s.matra || upt?.matra || '').toLowerCase(),
        uptId: s.uptId,
        periode: s.month === 0 ? `Tahunan ${s.year}` : `Bulan ${s.month} / ${s.year}`,
        status: s.status,
        pengirim: s.submittedByName || 'Admin UPT',
        pimpinan: s.pimpinanApprovedByName || (s.pimpinanApprovedAt ? 'Pimpinan UPT' : '-'),
        bpsdmp: s.approvedByName || s.rejectedByName || (s.approvedAt ? 'Super Admin BPSDMP' : '-'),
        notes: s.notes || s.bpsdmpNotes || s.pimpinanNotes || '-',
        summary: s.programCount ? `${s.programCount} Program Kerja` : 'Rencana Target Kinerja',
        updatedAt: s.updatedAt || s.submittedAt,
        raw: s,
      })
    }

    // 2. Realisasi Bulanan
    for (const s of realRows) {
      if (Number(s.year) !== yearNum) continue
      const upt = uptMap.get(s.uptId)
      rows.push({
        id: `realisasi-${s.id || s.submissionId}`,
        rawId: s.id || s.submissionId,
        jenis: 'Laporan Realisasi',
        jenisKey: 'realisasi',
        uptCode: s.uptCode || upt?.code || '-',
        uptName: s.uptName || upt?.name || '-',
        matra: (s.matra || upt?.matra || '').toLowerCase(),
        uptId: s.uptId,
        periode: `Bulan ${s.month} / ${s.year}`,
        status: s.status,
        pengirim: s.submittedByName || 'Admin UPT',
        pimpinan: s.pimpinanApprovedByName || (s.pimpinanApprovedAt ? 'Pimpinan UPT' : '-'),
        bpsdmp: s.approvedByName || s.rejectedByName || (s.approvedAt ? 'Super Admin BPSDMP' : '-'),
        notes: s.reviewNotes || s.pimpinanNotes || '-',
        summary: s.summaryText || 'Realisasi Capaian Bulanan',
        updatedAt: s.updatedAt || s.submittedAt,
        raw: s,
      })
    }

    // 3. Master Data Taruna
    for (const s of tarunaRows) {
      if (Number(s.year) !== yearNum) continue
      const upt = uptMap.get(s.uptId)
      rows.push({
        id: `taruna-${s.id}`,
        rawId: s.id,
        jenis: 'Master Data Taruna',
        jenisKey: 'taruna',
        uptCode: s.uptCode || upt?.code || '-',
        uptName: s.uptName || upt?.name || '-',
        matra: (s.matra || upt?.matra || '').toLowerCase(),
        uptId: s.uptId,
        periode: s.quarterName || `Triwulan ${s.quarter} / ${s.year}`,
        status: s.status,
        pengirim: s.submittedByName || 'Admin UPT',
        pimpinan: s.pimpinanApprovedByName || (s.pimpinanApprovedAt ? 'Pimpinan UPT' : '-'),
        bpsdmp: s.adminApprovedByName || s.adminRejectedByName || (s.adminApprovedAt ? 'Super Admin BPSDMP' : '-'),
        notes: s.adminNotes || s.pimpinanNotes || '-',
        summary: s.tarunaCount ? `${s.tarunaCount} Data Taruna Terdaftar` : 'Kelengkapan Data Taruna',
        updatedAt: s.updatedAt || s.submittedAt,
        raw: s,
      })
    }

    // 4. Penyerapan Lulusan
    for (const s of absRows) {
      if (Number(s.year) !== yearNum) continue
      const upt = uptMap.get(s.uptId)
      rows.push({
        id: `penyerapan-${s.id}`,
        rawId: s.id,
        jenis: 'Penyerapan Lulusan',
        jenisKey: 'penyerapan',
        uptCode: s.uptCode || upt?.code || '-',
        uptName: s.uptName || upt?.name || '-',
        matra: (s.matra || upt?.matra || '').toLowerCase(),
        uptId: s.uptId,
        periode: s.quarterName || `Triwulan ${s.quarter} / ${s.year}`,
        status: s.status,
        pengirim: s.submittedByName || 'Admin UPT',
        pimpinan: s.pimpinanApprovedByName || (s.pimpinanApprovedAt ? 'Pimpinan UPT' : '-'),
        bpsdmp: s.adminApprovedByName || (s.status === 'approved_bpsdmp' ? 'Super Admin BPSDMP' : '-'),
        notes: s.adminNotes || s.pimpinanNotes || '-',
        summary: s.recordsCount ? `${s.recordsCount} Data Lulusan Terverifikasi` : 'Laporan Penyerapan Lulusan',
        updatedAt: s.updatedAt || s.submittedAt,
        raw: s,
      })
    }

    return rows
  }, [targetRows, realRows, tarunaRows, absRows, uptMap, year])

  // Counter per kategori
  const countByCategory = useMemo(() => {
    return {
      semua: allRows.length,
      target: allRows.filter((r) => r.jenisKey === 'target').length,
      realisasi: allRows.filter((r) => r.jenisKey === 'realisasi').length,
      taruna: allRows.filter((r) => r.jenisKey === 'taruna').length,
      penyerapan: allRows.filter((r) => r.jenisKey === 'penyerapan').length,
    }
  }, [allRows])

  // Filtered rows
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    return allRows
      .filter((r) => {
        if (jenis !== 'semua' && r.jenisKey !== jenis) return false
        if (matra !== 'semua' && r.matra !== matra) return false
        if (uptFilter !== 'semua' && r.uptId !== uptFilter) return false

        if (status !== 'semua') {
          const normKey = normalizeStatus(r.status).key
          if (normKey !== status) return false
        }

        if (q) {
          const hay = `${r.uptCode} ${r.uptName} ${r.periode} ${r.pengirim} ${r.summary} ${r.jenis}`.toLowerCase()
          if (!hay.includes(q)) return false
        }

        return true
      })
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
  }, [allRows, jenis, matra, uptFilter, status, search])

  // Summary stats
  const stats = useMemo(() => {
    const total = filtered.length
    const approved = filtered.filter((r) => normalizeStatus(r.status).key === 'approved').length
    const rejected = filtered.filter((r) => normalizeStatus(r.status).key === 'rejected').length
    const pending = total - approved - rejected
    return { total, approved, rejected, pending }
  }, [filtered])

  const hasActiveFilter =
    jenis !== 'semua' ||
    matra !== 'semua' ||
    status !== 'semua' ||
    uptFilter !== 'semua' ||
    search.trim() !== '' ||
    year !== new Date().getFullYear()

  const clearFilters = () => {
    setYear(new Date().getFullYear())
    setJenis('semua')
    setMatra('semua')
    setStatus('semua')
    setUptFilter('semua')
    setSearch('')
  }

  // Fetch payload rincian berkas
  const fetchDetailPayload = async (item) => {
    if (item.jenisKey === 'realisasi') {
      const { data } = await api.get(`/submissions/${item.rawId}/detail`)
      return data
    } else if (item.jenisKey === 'target') {
      const { data } = await api.get(`/targets/submissions/${item.rawId}/detail`)
      return data
    } else if (item.jenisKey === 'taruna') {
      const { data } = await api.get(`/absorptions/taruna-submissions/admin/detail/${item.rawId}`)
      return data
    } else if (item.jenisKey === 'penyerapan') {
      const { data } = await api.get('/absorptions/my', {
        params: { uptId: item.raw.uptId, year: item.raw.year, quarter: item.raw.quarter },
      })
      return data
    }
    return null
  }

  // Open Detail Modal & Load Content
  const handleOpenDetail = async (item) => {
    setDetailItem(item)
    setDetailData(null)
    setDetailSearch('')
    setShowOnlyWithData(true)
    setLoadingDetail(true)
    try {
      const data = await fetchDetailPayload(item)
      setDetailData(data)
    } catch (err) {
      console.error('Failed to load detail payload:', err)
      toast.error('Gagal memuat rincian berkas', apiError(err))
    } finally {
      setLoadingDetail(false)
    }
  }

  // Quick Export PDF per row or inside modal
  const handleExportSingle = async (item, preloadedData = null) => {
    setExportingId(item.id)
    try {
      const data = preloadedData || (await fetchDetailPayload(item))
      await exportSingleReportPdf(item, data)
      toast.success('Unduh PDF Berhasil', `Dokumen ${item.jenis} (${item.uptCode}) berhasil dibuat.`)
    } catch (err) {
      console.error('Failed to export single report PDF:', err)
      toast.error('Gagal Mengunduh PDF', apiError(err))
    } finally {
      setExportingId(null)
    }
  }

  // Export Rekap Audit Table PDF
  const handleExportTablePdf = useCallback(() => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' })
    const pageW = doc.internal.pageSize.getWidth()

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(15, 23, 42)
    doc.text('RIWAYAT & AUDIT PELAPORAN NASIONAL', pageW / 2, 36, { align: 'center' })

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    doc.text('Badan Pengembangan Sumber Daya Manusia Perhubungan (BPSDMP)', pageW / 2, 50, { align: 'center' })

    const filterInfo = `Tahun: ${year} | Kategori: ${JENIS_OPTIONS.find((o) => o.value === jenis)?.label} | Matra: ${matra.toUpperCase()} | UPT: ${uptFilter === 'semua' ? 'Semua UPT' : upts.find((u) => u.id === uptFilter)?.code || '-'} | Status: ${STATUS_OPTIONS.find((o) => o.value === status)?.label} | Total: ${filtered.length} entri`
    doc.setFontSize(8)
    doc.text(filterInfo, pageW / 2, 64, { align: 'center' })

    doc.setDrawColor(203, 213, 225)
    doc.setLineWidth(1)
    doc.line(24, 74, pageW - 24, 74)

    const head = [['No', 'Kategori', 'UPT / Matra', 'Periode', 'Ringkasan Data', 'Status Akhir', 'Verifikator BPSDMP', 'Waktu Pembaruan']]
    const body = filtered.map((r, idx) => [
      idx + 1,
      r.jenis,
      `${r.uptCode} - ${r.uptName}\n(${r.matra.toUpperCase()})`,
      r.periode,
      r.summary,
      normalizeStatus(r.status).label,
      r.bpsdmp,
      r.updatedAt ? new Date(r.updatedAt).toLocaleString('id-ID') : '-',
    ])

    autoTable(doc, {
      startY: 82,
      head,
      body,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 7, cellPadding: 4, lineColor: [226, 232, 240], lineWidth: 0.5, textColor: [15, 23, 42] },
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 26, halign: 'center' },
        1: { cellWidth: 80 },
        2: { cellWidth: 160 },
        3: { cellWidth: 85, halign: 'center' },
        4: { cellWidth: 140 },
        5: { cellWidth: 85, halign: 'center' },
        6: { cellWidth: 100 },
        7: { cellWidth: 95, halign: 'center' },
      },
      margin: { left: 24, right: 24, bottom: 28 },
    })

    const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 16 : 82
    doc.setFontSize(7.5)
    doc.setTextColor(100, 116, 139)
    doc.text(`Dicetak: ${new Date().toLocaleString('id-ID')} - DASPESLUS BPSDMP Kemenhub`, 24, finalY)
    doc.text(`Halaman 1`, pageW - 24, finalY, { align: 'right' })

    doc.save(`Riwayat_Pelaporan_BPSDMP_${year}_${jenis}.pdf`)
  }, [filtered, year, jenis, matra, uptFilter, status, upts])

  return (
    <div className="animate-fadeUp space-y-5">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy-950 via-navy-900 to-slate-900 border border-navy-700 shadow-xl">
        <div className="absolute inset-0 bg-grid-white/[0.04] bg-[length:24px_24px]" />
        <div className="absolute -top-16 -right-16 h-56 w-56 rounded-full bg-sky-500/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-amber-500/10 blur-2xl pointer-events-none" />

        <div className="relative p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 shrink-0 rounded-2xl bg-white/10 p-2 ring-1 ring-white/20 backdrop-blur-md shadow-md flex items-center justify-center">
              <img src={logoBpsdm} alt="Logo BPSDMP" className="h-full w-full object-contain" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Riwayat Pelaporan</h1>
                <span className="rounded-full bg-sky-400/15 text-sky-300 ring-1 ring-sky-400/30 px-2.5 py-0.5 text-[11px] font-bold">
                  Arsip & Audit Lengkap
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
                Log riwayat dan arsip audit pelaporan seluruh UPT BPSDMP mencakup <span className="text-white font-semibold">Target PK</span>, <span className="text-white font-semibold">Laporan Realisasi</span>, <span className="text-white font-semibold">Master Data Taruna</span>, dan <span className="text-white font-semibold">Penyerapan Lulusan</span> beserta rincian data berkas dan ekspor PDF resmi.
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 text-white/90 ring-1 ring-white/15 px-3 py-1 text-xs font-semibold">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Tahun {year}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 text-white/80 ring-1 ring-white/15 px-3 py-1 text-xs">
                  {filtered.length} Berkas Ditemukan
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-auto">
            <Link
              to="/admin/persetujuan"
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 px-3.5 py-2 text-xs font-bold shadow-md transition-all active:scale-95"
            >
              <IconCheck className="h-4 w-4" />
              Pusat Persetujuan
            </Link>
            <button
              onClick={handleExportTablePdf}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 text-white ring-1 ring-white/20 px-3.5 py-2 text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              title="Unduh seluruh rekap riwayat terfilter dalam format PDF"
            >
              <IconDownload className="h-4 w-4 text-sky-300" />
              Export Rekap PDF
            </button>
            <button
              onClick={load}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white ring-1 ring-white/20 px-3 py-2 text-xs font-bold transition-all"
            >
              <IconRefresh className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* Quick Category Navigation Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        {JENIS_OPTIONS.map((opt) => {
          const active = jenis === opt.value
          const count = countByCategory[opt.value] ?? 0
          return (
            <button
              key={opt.value}
              onClick={() => setJenis(opt.value)}
              className={clsx(
                'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all shrink-0 shadow-xs ring-1',
                active
                  ? 'bg-navy-900 text-white ring-navy-900 shadow-md'
                  : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 hover:text-slate-900'
              )}
            >
              <span>{opt.label}</span>
              <span
                className={clsx(
                  'rounded-full px-2 py-0.5 text-[10px] font-black',
                  active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                )}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Filter Card */}
      <div className="card p-5 space-y-4 border-slate-200 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black tracking-wider uppercase text-slate-500 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-navy-900" />
            Filter & Pencarian Laporan
          </h3>
          {hasActiveFilter && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-navy-900 bg-slate-50 ring-1 ring-slate-200 hover:ring-slate-300 rounded-full px-3 py-1 transition-all"
            >
              Reset Filter ✕
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Tahun */}
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Tahun Anggaran</span>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="form-input !py-2.5 !rounded-xl text-xs font-semibold bg-slate-50 focus:bg-white border-slate-200"
            >
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
                <option key={y} value={y}>
                  Tahun {y}
                </option>
              ))}
            </select>
          </label>

          {/* Matra */}
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
              <IconBuilding className="h-3 w-3 text-slate-400" /> Matra
            </span>
            <select
              value={matra}
              onChange={(e) => setMatra(e.target.value)}
              className="form-input !py-2.5 !rounded-xl text-xs font-semibold bg-slate-50 focus:bg-white border-slate-200"
            >
              {MATRA_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          {/* UPT */}
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">UPT BPSDMP</span>
            <select
              value={uptFilter}
              onChange={(e) => setUptFilter(e.target.value)}
              className="form-input !py-2.5 !rounded-xl text-xs font-semibold bg-slate-50 focus:bg-white border-slate-200"
            >
              <option value="semua">Semua UPT ({upts.length})</option>
              {upts.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code} — {u.name}
                </option>
              ))}
            </select>
          </label>

          {/* Status */}
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Status Verifikasi</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="form-input !py-2.5 !rounded-xl text-xs font-semibold bg-slate-50 focus:bg-white border-slate-200"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Search */}
        <div className="relative">
          <IconSearch className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kode UPT, nama instansi, periode, ringkasan, atau nama pengirim..."
            className="form-input !py-2.5 !pl-10 !rounded-xl w-full text-xs bg-slate-50 focus:bg-white border-slate-200 placeholder:text-slate-400"
          />
        </div>

        {/* KPI Summary Strip */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
          <span className="text-[11px] font-black tracking-widest uppercase text-slate-400 mr-1">Ringkasan:</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 text-white px-3 py-1 text-xs font-bold shadow-xs tabular-nums">
            {stats.total} Total
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 px-3 py-1 text-xs font-bold tabular-nums">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {stats.approved} Disetujui
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 text-red-700 ring-1 ring-red-200 px-3 py-1 text-xs font-bold tabular-nums">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            {stats.rejected} Ditolak
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 px-3 py-1 text-xs font-bold tabular-nums">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            {stats.pending} Menunggu
          </span>
          <span className="ml-auto text-[11px] text-slate-400 hidden lg:inline">
            Menampilkan {filtered.length} dari {allRows.length} laporan tahun {year}
          </span>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="card overflow-hidden border-slate-200 shadow-sm">
        <div className="card-header bg-slate-50 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3.5 px-5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy-900 text-white shadow-sm">
              <IconHistory className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs sm:text-sm font-black text-navy-900 flex items-center gap-2">
                Daftar Riwayat Pelaporan
                <span className="rounded-md bg-navy-100 text-navy-900 px-2 py-0.5 text-[11px] font-bold">
                  {filtered.length} Entri
                </span>
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Klik tombol <span className="font-semibold text-slate-700">Detail & Berkas</span> untuk melihat data berkas yang dilaporkan atau tombol <span className="font-semibold text-slate-700">PDF</span> untuk langsung mengunduh dokumen.
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-6">
            <SkeletonRows rows={6} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<IconHistory className="h-8 w-8 text-slate-400" />}
              title="Tidak ada riwayat pelaporan"
              desc="Belum ada catatan laporan yang cocok dengan kombinasi filter yang dipilih. Silakan sesuaikan tahun, kategori, matra, atau kata kunci pencarian."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-slate-900 text-white">
                <tr>
                  <th className="text-left py-3 px-4 font-bold tracking-wider text-[11px] uppercase">Kategori</th>
                  <th className="text-left py-3 px-4 font-bold tracking-wider text-[11px] uppercase">UPT / Satuan Kerja</th>
                  <th className="text-center py-3 px-3 font-bold tracking-wider text-[11px] uppercase">Periode</th>
                  <th className="text-left py-3 px-4 font-bold tracking-wider text-[11px] uppercase">Ringkasan Data</th>
                  <th className="text-left py-3 px-4 font-bold tracking-wider text-[11px] uppercase">Status Akhir</th>
                  <th className="text-left py-3 px-4 font-bold tracking-wider text-[11px] uppercase">Alur Verifikasi</th>
                  <th className="text-left py-3 px-4 font-bold tracking-wider text-[11px] uppercase">Waktu Update</th>
                  <th className="text-center py-3 px-4 font-bold tracking-wider text-[11px] uppercase">Aksi & Dokumen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => handleOpenDetail(r)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                  >
                    {/* Kategori */}
                    <td className="py-3 px-4">
                      <JenisBadge jenisKey={r.jenisKey} label={r.jenis} />
                    </td>

                    {/* UPT & Matra */}
                    <td className="py-3 px-4">
                      <div className="font-bold text-navy-900 flex items-center gap-1.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-100 ring-1 ring-slate-200 shrink-0">
                          <IconBuilding className="h-3 w-3 text-slate-500" />
                        </span>
                        <span>{r.uptCode}</span>
                      </div>
                      <p className="text-[11px] font-medium text-slate-600 truncate max-w-[240px] mt-0.5" title={r.uptName}>
                        {r.uptName}
                      </p>
                      <span
                        className={clsx(
                          'inline-flex mt-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 capitalize',
                          r.matra === 'laut'
                            ? 'bg-sky-50 text-sky-700 ring-sky-200'
                            : r.matra === 'udara'
                            ? 'bg-violet-50 text-violet-700 ring-violet-200'
                            : r.matra === 'darat'
                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                            : r.matra === 'aparatur'
                            ? 'bg-amber-50 text-amber-700 ring-amber-200'
                            : 'bg-slate-50 text-slate-600 ring-slate-200'
                        )}
                      >
                        {r.matra || '-'}
                      </span>
                    </td>

                    {/* Periode */}
                    <td className="py-3 px-3 text-center">
                      <span className="inline-flex items-center justify-center rounded-lg bg-slate-900 text-white px-2.5 py-1 text-[11px] font-bold shadow-xs whitespace-nowrap">
                        {r.periode}
                      </span>
                    </td>

                    {/* Summary */}
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-800 line-clamp-1">{r.summary}</p>
                      {r.notes && r.notes !== '-' && (
                        <p className="text-[10px] text-slate-500 italic truncate max-w-[200px] mt-0.5" title={r.notes}>
                          Catatan: &ldquo;{r.notes}&rdquo;
                        </p>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      <StatusBadge status={r.status} />
                    </td>

                    {/* Alur Verifikasi */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1 text-[10px] text-slate-500">
                        <span className="font-medium truncate max-w-[70px]" title={`Pengirim: ${r.pengirim}`}>
                          {r.pengirim}
                        </span>
                        <span>→</span>
                        <span
                          className={clsx(
                            'font-medium truncate max-w-[70px]',
                            r.pimpinan !== '-' ? 'text-amber-700 font-bold' : 'text-slate-400'
                          )}
                          title={`Pimpinan: ${r.pimpinan}`}
                        >
                          {r.pimpinan}
                        </span>
                        <span>→</span>
                        <span
                          className={clsx(
                            'font-bold truncate max-w-[80px]',
                            r.bpsdmp !== '-' ? 'text-navy-900' : 'text-slate-400'
                          )}
                          title={`BPSDMP: ${r.bpsdmp}`}
                        >
                          {r.bpsdmp}
                        </span>
                      </div>
                    </td>

                    {/* Waktu Update */}
                    <td className="py-3 px-4 text-slate-600 text-[11px] whitespace-nowrap">
                      {r.updatedAt ? fmtDateTime(r.updatedAt) : '-'}
                    </td>

                    {/* Action & PDF Buttons */}
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenDetail(r)
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 hover:bg-navy-900 hover:text-white text-slate-700 px-2.5 py-1 text-[11px] font-bold transition-all ring-1 ring-slate-200"
                          title="Lihat data berkas yang dilaporkan & log audit"
                        >
                          <IconEye className="h-3.5 w-3.5" />
                          Detail
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleExportSingle(r)
                          }}
                          disabled={exportingId === r.id}
                          className="inline-flex items-center gap-1 rounded-lg bg-sky-50 hover:bg-sky-600 hover:text-white text-sky-800 px-2 py-1 text-[11px] font-bold transition-all ring-1 ring-sky-200 disabled:opacity-50"
                          title="Unduh langsung berkas laporan ini dalam bentuk PDF resmi"
                        >
                          <IconDownload className="h-3.5 w-3.5 text-sky-600 group-hover:text-white" />
                          {exportingId === r.id ? '...' : 'PDF'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Table Footer */}
        <div className="bg-slate-50/80 border-t px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Menampilkan <span className="font-black text-navy-900">{filtered.length}</span> berkas laporan
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Disetujui</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" /> Ditolak</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> Menunggu Review</span>
          </div>
        </div>
      </div>

      {/* DETAIL MODAL DENGAN DATA BERKAS LENGKAP & EXPORT PDF */}
      {detailItem && (
        <Modal
          open={!!detailItem}
          onClose={() => {
            setDetailItem(null)
            setDetailData(null)
          }}
          title={`Detail Berkas Pelaporan • ${detailItem.jenis}`}
          maxWidth="max-w-4xl"
        >
          <div className="p-6 space-y-6 max-h-[82vh] overflow-y-auto pr-2">
            {/* Modal Header Strip */}
            <div className="rounded-2xl bg-gradient-to-r from-slate-900 to-navy-900 text-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-white/20 text-white border border-white/20">
                    {detailItem.jenis}
                  </span>
                  <span className="rounded-md bg-sky-500 text-slate-950 px-2.5 py-0.5 text-xs font-black">
                    {detailItem.periode}
                  </span>
                </div>
                <h3 className="font-black text-white text-base sm:text-lg mt-2">
                  {detailItem.uptCode} — {detailItem.uptName}
                </h3>
                <p className="text-xs text-slate-300 mt-0.5 capitalize">
                  Matra: <strong className="text-white">{detailItem.matra}</strong> • Pengirim:{' '}
                  <strong className="text-white">{detailItem.pengirim}</strong> • Update:{' '}
                  {detailItem.updatedAt ? fmtDateTime(detailItem.updatedAt) : '-'}
                </p>
              </div>

              <div className="flex flex-col sm:items-end gap-2 shrink-0">
                <StatusBadge status={detailItem.status} />
                <button
                  onClick={() => handleExportSingle(detailItem, detailData)}
                  disabled={loadingDetail || !detailData}
                  className="inline-flex items-center gap-2 rounded-xl bg-white hover:bg-slate-100 text-slate-900 px-3.5 py-2 text-xs font-bold shadow transition-all disabled:opacity-40"
                  title="Unduh berkas laporan ini ke format PDF resmi"
                >
                  <IconDownload className="h-4 w-4 text-sky-600" />
                  Unduh Dokumen PDF Berkas Ini
                </button>
              </div>
            </div>

            {/* Catatan Verifikator jika ada */}
            {detailItem.notes && detailItem.notes !== '-' && (
              <div className="p-4 rounded-xl border border-amber-300 bg-amber-50/80 text-xs">
                <span className="font-bold text-amber-900 block mb-1">Catatan Verifikator / Revisi:</span>
                <p className="text-amber-900 leading-relaxed">&ldquo;{detailItem.notes}&rdquo;</p>
              </div>
            )}

            {/* TABEL DATA BERKAS YANG DILAPORKAN */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-navy-900" />
                  Data Berkas Yang Dilaporkan ({detailItem.jenis})
                </h4>
                {loadingDetail && (
                  <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                    <Spinner size="sm" /> Memuat isi berkas...
                  </span>
                )}
              </div>

              {loadingDetail ? (
                <div className="p-8 border border-slate-200 rounded-xl bg-slate-50 text-center space-y-3">
                  <Spinner size="lg" />
                  <p className="text-xs text-slate-500 font-medium">Sedang mengambil rincian data berkas dari database...</p>
                </div>
              ) : !detailData ? (
                <div className="p-6 border border-slate-200 rounded-xl bg-slate-50 text-center text-xs text-slate-500">
                  Data rincian berkas tidak ditemukan atau belum pernah diisi.
                </div>
              ) : (
                <div className="space-y-4">
                  {/* MODUL 1: REALISASI BULANAN */}
                  {detailItem.jenisKey === 'realisasi' && (() => {
                    const rawPrograms = detailData.programs || []
                    const hasAnyData = rawPrograms.some(
                      (p) =>
                        (p.pesertaL || 0) > 0 ||
                        (p.pesertaP || 0) > 0 ||
                        (p.lulusanL || 0) > 0 ||
                        (p.lulusanP || 0) > 0 ||
                        (p.targetPeserta || 0) > 0 ||
                        (p.targetLulusan || 0) > 0
                    )

                    const activeIds = new Set()
                    if (hasAnyData) {
                      for (const p of rawPrograms) {
                        if (
                          (p.pesertaL || 0) > 0 ||
                          (p.pesertaP || 0) > 0 ||
                          (p.lulusanL || 0) > 0 ||
                          (p.lulusanP || 0) > 0 ||
                          (p.targetPeserta || 0) > 0 ||
                          (p.targetLulusan || 0) > 0
                        ) {
                          activeIds.add(p.programId)
                          if (p.parentId) activeIds.add(p.parentId)
                        }
                      }
                      for (const p of rawPrograms) {
                        if (p.isParent && rawPrograms.some((c) => c.parentId === p.programId && activeIds.has(c.programId))) {
                          activeIds.add(p.programId)
                        }
                      }
                    }

                    const parentPrograms = rawPrograms.filter((p) => p.isParent)
                    const sumTgtPes = parentPrograms.reduce((s, p) => s + (Number(p.targetPeserta) || 0), 0)
                    const sumPesL = parentPrograms.reduce((s, p) => s + (Number(p.pesertaL) || 0), 0)
                    const sumPesP = parentPrograms.reduce((s, p) => s + (Number(p.pesertaP) || 0), 0)
                    const sumTotPes = sumPesL + sumPesP
                    const sumTgtLul = parentPrograms.reduce((s, p) => s + (Number(p.targetLulusan) || 0), 0)
                    const sumLulL = parentPrograms.reduce((s, p) => s + (Number(p.lulusanL) || 0), 0)
                    const sumLulP = parentPrograms.reduce((s, p) => s + (Number(p.lulusanP) || 0), 0)
                    const sumTotLul = sumLulL + sumLulP

                    const filteredPrograms = rawPrograms.filter((p) => {
                      if (showOnlyWithData && hasAnyData && !activeIds.has(p.programId)) return false
                      if (detailSearch.trim()) {
                        const q = detailSearch.toLowerCase()
                        if (!p.programName.toLowerCase().includes(q) && !(p.parentName || '').toLowerCase().includes(q)) {
                          return false
                        }
                      }
                      return true
                    })

                    return (
                      <div className="space-y-3.5">
                        {/* Summary Metrics Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="p-3.5 rounded-xl border border-sky-200 bg-sky-50/70 flex flex-col justify-between shadow-2xs">
                            <span className="text-[10.5px] font-bold text-sky-800 uppercase tracking-wider">Total Realisasi Peserta</span>
                            <div className="mt-1 flex items-baseline gap-2">
                              <span className="text-2xl font-black text-sky-950">{fmtNum(sumTotPes)}</span>
                              <span className="text-xs text-sky-700 font-semibold">Orang</span>
                            </div>
                            <div className="text-[11px] text-slate-600 mt-1 flex items-center justify-between">
                              <span>L: <strong className="text-slate-800">{fmtNum(sumPesL)}</strong> • P: <strong className="text-slate-800">{fmtNum(sumPesP)}</strong></span>
                              {sumTgtPes > 0 && <span className="font-bold text-sky-700">{pctText(sumTotPes, sumTgtPes)}</span>}
                            </div>
                          </div>

                          <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/70 flex flex-col justify-between shadow-2xs">
                            <span className="text-[10.5px] font-bold text-emerald-800 uppercase tracking-wider">Total Realisasi Lulusan</span>
                            <div className="mt-1 flex items-baseline gap-2">
                              <span className="text-2xl font-black text-emerald-950">{fmtNum(sumTotLul)}</span>
                              <span className="text-xs text-emerald-700 font-semibold">Orang</span>
                            </div>
                            <div className="text-[11px] text-slate-600 mt-1 flex items-center justify-between">
                              <span>L: <strong className="text-slate-800">{fmtNum(sumLulL)}</strong> • P: <strong className="text-slate-800">{fmtNum(sumLulP)}</strong></span>
                              {sumTgtLul > 0 && <span className="font-bold text-emerald-700">{pctText(sumTotLul, sumTgtLul)}</span>}
                            </div>
                          </div>

                          <div className="p-3.5 rounded-xl border border-slate-200 bg-white flex flex-col justify-between shadow-2xs">
                            <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Kelengkapan Laporan</span>
                            <div className="mt-1 flex items-baseline gap-1.5">
                              <span className="text-2xl font-black text-slate-900">{hasAnyData ? activeIds.size : 0}</span>
                              <span className="text-xs text-slate-500 font-medium">dari {rawPrograms.length} program kerja</span>
                            </div>
                            <span className="text-[11px] text-slate-600 mt-1">
                              Status: <strong className="text-navy-900">{normalizeStatus(detailItem.status).label}</strong>
                            </span>
                          </div>
                        </div>

                        {/* Search & Filter Controls */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                          <div className="relative flex-1">
                            <input
                              type="text"
                              placeholder="Cari nama program kerja..."
                              value={detailSearch}
                              onChange={(e) => setDetailSearch(e.target.value)}
                              className="w-full text-xs pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-navy-500 transition-colors"
                            />
                            <IconSearch className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          </div>
                          {hasAnyData && (
                            <button
                              type="button"
                              onClick={() => setShowOnlyWithData(!showOnlyWithData)}
                              className={clsx(
                                'px-3 py-2 rounded-xl text-xs font-bold border transition-colors shrink-0',
                                showOnlyWithData
                                  ? 'bg-navy-900 text-white border-navy-900 shadow-2xs'
                                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                              )}
                            >
                              {showOnlyWithData ? `✓ Hanya Program Berisi (${activeIds.size})` : `Tampilkan Semua (${rawPrograms.length})`}
                            </button>
                          )}
                        </div>

                        {/* Realisasi Table */}
                        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                          <div className="max-h-76 overflow-y-auto">
                            <table className="w-full text-xs text-left">
                              <thead className="bg-slate-900 text-white font-bold sticky top-0 uppercase text-[9.5px] tracking-wider z-10">
                                <tr>
                                  <th className="p-2.5">Program Kerja</th>
                                  <th className="p-2.5 text-center">Target Peserta</th>
                                  <th className="p-2.5 text-center">Peserta (L)</th>
                                  <th className="p-2.5 text-center">Peserta (P)</th>
                                  <th className="p-2.5 text-center bg-slate-800">Total Peserta</th>
                                  <th className="p-2.5 text-center">% Peserta</th>
                                  <th className="p-2.5 text-center">Target Lulusan</th>
                                  <th className="p-2.5 text-center">Lulusan (L)</th>
                                  <th className="p-2.5 text-center">Lulusan (P)</th>
                                  <th className="p-2.5 text-center bg-slate-800">Total Lulusan</th>
                                  <th className="p-2.5 text-center">% Lulusan</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {filteredPrograms.length === 0 ? (
                                  <tr>
                                    <td colSpan={11} className="p-6 text-center text-slate-400 italic">
                                      Tidak ada program kerja yang cocok dengan kata kunci pencarian.
                                    </td>
                                  </tr>
                                ) : (
                                  filteredPrograms.map((p) => {
                                    const totPeserta = (p.pesertaL || 0) + (p.pesertaP || 0)
                                    const totLulusan = (p.lulusanL || 0) + (p.lulusanP || 0)
                                    return (
                                      <tr
                                        key={p.programId}
                                        className={p.isParent ? 'bg-slate-100/80 font-bold text-slate-900' : 'hover:bg-slate-50/80'}
                                      >
                                        <td className="p-2.5">{p.isParent ? p.programName : `  ↳ ${p.programName}`}</td>
                                        <td className="p-2.5 text-center text-slate-500 font-medium">{fmtNum(p.targetPeserta)}</td>
                                        <td className="p-2.5 text-center">{fmtNum(p.pesertaL)}</td>
                                        <td className="p-2.5 text-center">{fmtNum(p.pesertaP)}</td>
                                        <td className="p-2.5 text-center font-bold text-sky-900 bg-sky-50/50">{fmtNum(totPeserta)}</td>
                                        <td className="p-2.5 text-center font-semibold text-slate-600">{pctText(totPeserta, p.targetPeserta)}</td>
                                        <td className="p-2.5 text-center text-slate-500 font-medium">{fmtNum(p.targetLulusan)}</td>
                                        <td className="p-2.5 text-center">{fmtNum(p.lulusanL)}</td>
                                        <td className="p-2.5 text-center">{fmtNum(p.lulusanP)}</td>
                                        <td className="p-2.5 text-center font-bold text-emerald-900 bg-emerald-50/50">{fmtNum(totLulusan)}</td>
                                        <td className="p-2.5 text-center font-semibold text-slate-600">{pctText(totLulusan, p.targetLulusan)}</td>
                                      </tr>
                                    )
                                  })
                                )}
                              </tbody>
                              {filteredPrograms.length > 0 && (
                                <tfoot className="bg-slate-100/90 font-bold text-slate-900 sticky bottom-0 border-t-2 border-slate-300">
                                  <tr>
                                    <td className="p-2.5">TOTAL CAPAIAN</td>
                                    <td className="p-2.5 text-center">{fmtNum(sumTgtPes)}</td>
                                    <td className="p-2.5 text-center">{fmtNum(sumPesL)}</td>
                                    <td className="p-2.5 text-center">{fmtNum(sumPesP)}</td>
                                    <td className="p-2.5 text-center font-black text-sky-950 bg-sky-100">{fmtNum(sumTotPes)}</td>
                                    <td className="p-2.5 text-center font-black text-sky-950">{pctText(sumTotPes, sumTgtPes)}</td>
                                    <td className="p-2.5 text-center">{fmtNum(sumTgtLul)}</td>
                                    <td className="p-2.5 text-center">{fmtNum(sumLulL)}</td>
                                    <td className="p-2.5 text-center">{fmtNum(sumLulP)}</td>
                                    <td className="p-2.5 text-center font-black text-emerald-950 bg-emerald-100">{fmtNum(sumTotLul)}</td>
                                    <td className="p-2.5 text-center font-black text-emerald-950">{pctText(sumTotLul, sumTgtLul)}</td>
                                  </tr>
                                </tfoot>
                              )}
                            </table>
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {/* MODUL 2: TARGET PK */}
                  {detailItem.jenisKey === 'target' && (() => {
                    const rawPrograms = detailData.programs || []
                    const hasAnyTarget = rawPrograms.some((p) => (p.targetPeserta || 0) > 0 || (p.targetLulusan || 0) > 0)
                    const activeIds = new Set()
                    if (hasAnyTarget) {
                      for (const p of rawPrograms) {
                        if ((p.targetPeserta || 0) > 0 || (p.targetLulusan || 0) > 0) {
                          activeIds.add(p.programId)
                          if (p.parentId) activeIds.add(p.parentId)
                        }
                      }
                      for (const p of rawPrograms) {
                        if (p.isParent && rawPrograms.some((c) => c.parentId === p.programId && activeIds.has(c.programId))) {
                          activeIds.add(p.programId)
                        }
                      }
                    }

                    const parentPrograms = rawPrograms.filter((p) => p.isParent)
                    const sumTgtPes = parentPrograms.reduce((s, p) => s + (Number(p.targetPeserta) || 0), 0)
                    const sumTgtLul = parentPrograms.reduce((s, p) => s + (Number(p.targetLulusan) || 0), 0)

                    const filteredPrograms = rawPrograms.filter((p) => {
                      if (showOnlyWithData && hasAnyTarget && !activeIds.has(p.programId)) return false
                      if (detailSearch.trim()) {
                        const q = detailSearch.toLowerCase()
                        if (!p.programName.toLowerCase().includes(q) && !(p.parentName || '').toLowerCase().includes(q)) {
                          return false
                        }
                      }
                      return true
                    })

                    return (
                      <div className="space-y-3.5">
                        {/* Summary Metrics Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/70 flex flex-col justify-between shadow-2xs">
                            <span className="text-[10.5px] font-bold text-emerald-800 uppercase tracking-wider">Total Target Peserta</span>
                            <div className="mt-1 flex items-baseline gap-2">
                              <span className="text-2xl font-black text-emerald-950">{fmtNum(sumTgtPes)}</span>
                              <span className="text-xs text-emerald-700 font-semibold">Orang</span>
                            </div>
                            <span className="text-[11px] text-slate-500 mt-1">Akumulasi seluruh program kerja</span>
                          </div>

                          <div className="p-3.5 rounded-xl border border-sky-200 bg-sky-50/70 flex flex-col justify-between shadow-2xs">
                            <span className="text-[10.5px] font-bold text-sky-800 uppercase tracking-wider">Total Target Lulusan</span>
                            <div className="mt-1 flex items-baseline gap-2">
                              <span className="text-2xl font-black text-sky-950">{fmtNum(sumTgtLul)}</span>
                              <span className="text-xs text-sky-700 font-semibold">Orang</span>
                            </div>
                            <span className="text-[11px] text-slate-500 mt-1">Akumulasi seluruh program kerja</span>
                          </div>
                        </div>

                        {/* Search & Filter Controls */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                          <div className="relative flex-1">
                            <input
                              type="text"
                              placeholder="Cari program kerja target..."
                              value={detailSearch}
                              onChange={(e) => setDetailSearch(e.target.value)}
                              className="w-full text-xs pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-navy-500 transition-colors"
                            />
                            <IconSearch className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          </div>
                          {hasAnyTarget && (
                            <button
                              type="button"
                              onClick={() => setShowOnlyWithData(!showOnlyWithData)}
                              className={clsx(
                                'px-3 py-2 rounded-xl text-xs font-bold border transition-colors shrink-0',
                                showOnlyWithData
                                  ? 'bg-navy-900 text-white border-navy-900 shadow-2xs'
                                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                              )}
                            >
                              {showOnlyWithData ? `✓ Hanya Berisi Target (${activeIds.size})` : `Tampilkan Semua (${rawPrograms.length})`}
                            </button>
                          )}
                        </div>

                        {/* Target Table */}
                        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                          <div className="max-h-76 overflow-y-auto">
                            <table className="w-full text-xs text-left">
                              <thead className="bg-slate-900 text-white font-bold sticky top-0 uppercase text-[9.5px] tracking-wider z-10">
                                <tr>
                                  <th className="p-2.5">Program Kerja</th>
                                  <th className="p-2.5 text-center">Target Peserta (Org)</th>
                                  <th className="p-2.5 text-center">Target Lulusan (Org)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {filteredPrograms.length === 0 ? (
                                  <tr>
                                    <td colSpan={3} className="p-6 text-center text-slate-400 italic">
                                      Tidak ada program kerja yang cocok dengan filter.
                                    </td>
                                  </tr>
                                ) : (
                                  filteredPrograms.map((p) => (
                                    <tr
                                      key={p.programId}
                                      className={p.isParent ? 'bg-slate-100/80 font-bold text-slate-900' : 'hover:bg-slate-50/80'}
                                    >
                                      <td className="p-2.5">{p.isParent ? p.programName : `  ↳ ${p.programName}`}</td>
                                      <td className="p-2.5 text-center font-bold text-emerald-700">{fmtNum(p.targetPeserta)}</td>
                                      <td className="p-2.5 text-center font-bold text-sky-700">{fmtNum(p.targetLulusan)}</td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                              {filteredPrograms.length > 0 && (
                                <tfoot className="bg-slate-100/90 font-bold text-slate-900 sticky bottom-0 border-t-2 border-slate-300">
                                  <tr>
                                    <td className="p-2.5">TOTAL TARGET KINERJA</td>
                                    <td className="p-2.5 text-center font-black text-emerald-950 bg-emerald-100">{fmtNum(sumTgtPes)}</td>
                                    <td className="p-2.5 text-center font-black text-sky-950 bg-sky-100">{fmtNum(sumTgtLul)}</td>
                                  </tr>
                                </tfoot>
                              )}
                            </table>
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {/* MODUL 3: MASTER DATA TARUNA */}
                  {detailItem.jenisKey === 'taruna' && (
                    <div className="space-y-3">
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Cari nama taruna, nomor induk, atau prodi..."
                          value={detailSearch}
                          onChange={(e) => setDetailSearch(e.target.value)}
                          className="w-full text-xs pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white"
                        />
                        <IconSearch className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      </div>

                      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                        <div className="max-h-72 overflow-y-auto">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-slate-900 text-white font-bold sticky top-0 uppercase text-[10px] tracking-wider">
                              <tr>
                                <th className="p-3 text-center">No</th>
                                <th className="p-3">Nama Taruna</th>
                                <th className="p-3">Nomor Taruna / NIM</th>
                                <th className="p-3">Program Studi</th>
                                <th className="p-3 text-center">Jenis Kelamin</th>
                                <th className="p-3 text-center">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {(detailData.tarunas || [])
                                .filter((t) => {
                                  if (!detailSearch.trim()) return true
                                  const q = detailSearch.toLowerCase()
                                  return (
                                    (t.nama || t.name || '').toLowerCase().includes(q) ||
                                    (t.nim || t.nik || '').toLowerCase().includes(q) ||
                                    (t.prodi?.namaProdi || t.prodi || '').toLowerCase().includes(q)
                                  )
                                })
                                .map((t, idx) => (
                                  <tr key={t.id || idx} className="hover:bg-slate-50">
                                    <td className="p-2.5 text-center text-slate-400">{idx + 1}</td>
                                    <td className="p-2.5 font-bold text-slate-900">{t.nama || t.name}</td>
                                    <td className="p-2.5 font-mono text-slate-600">{t.nim || t.nik || '-'}</td>
                                    <td className="p-2.5 text-slate-700">{t.prodi?.namaProdi || t.prodi || '-'}</td>
                                    <td className="p-2.5 text-center">{t.jenisKelamin === 'L' ? 'L' : t.jenisKelamin === 'P' ? 'P' : '-'}</td>
                                    <td className="p-2.5 text-center">
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                        Aktif
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* MODUL 4: PENYERAPAN LULUSAN */}
                  {detailItem.jenisKey === 'penyerapan' && (
                    <div className="space-y-3">
                      {/* Summary Metrics */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                          <p className="text-[11px] font-bold text-slate-500 uppercase">Total Lulusan</p>
                          <p className="text-xl font-black text-slate-900 mt-0.5">
                            {detailData?.summary?.totalLulusan || 0}
                          </p>
                        </div>
                        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                          <p className="text-[11px] font-bold text-emerald-700 uppercase">Terserap Bekerja</p>
                          <p className="text-xl font-black text-emerald-900 mt-0.5">
                            {detailData?.summary?.totalBekerja || 0}
                          </p>
                        </div>
                        <div className="p-3 rounded-xl bg-sky-50 border border-sky-200">
                          <p className="text-[11px] font-bold text-sky-700 uppercase">Persentase Serapan</p>
                          <p className="text-xl font-black text-sky-900 mt-0.5">
                            {detailData?.summary?.pctAbsorption || 0}%
                          </p>
                        </div>
                      </div>

                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Cari nama lulusan, prodi, atau instansi kerja..."
                          value={detailSearch}
                          onChange={(e) => setDetailSearch(e.target.value)}
                          className="w-full text-xs pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white"
                        />
                        <IconSearch className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      </div>

                      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                        <div className="max-h-72 overflow-y-auto">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-slate-900 text-white font-bold sticky top-0 uppercase text-[10px] tracking-wider">
                              <tr>
                                <th className="p-3 text-center">No</th>
                                <th className="p-3">Program Studi</th>
                                <th className="p-3">Nama Lulusan</th>
                                <th className="p-3 text-center">Kategori</th>
                                <th className="p-3">Instansi / Perusahaan</th>
                                <th className="p-3">Jabatan</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {(detailData.records || [])
                                .filter((r) => {
                                  if (!detailSearch.trim()) return true
                                  const q = detailSearch.toLowerCase()
                                  return (
                                    (r.namaLulusan || r.nama || '').toLowerCase().includes(q) ||
                                    (r.prodi?.namaProdi || r.namaProdi || '').toLowerCase().includes(q) ||
                                    (r.namaInstansi || '').toLowerCase().includes(q)
                                  )
                                })
                                .map((r, idx) => (
                                  <tr key={r.id || idx} className="hover:bg-slate-50">
                                    <td className="p-2.5 text-center text-slate-400">{idx + 1}</td>
                                    <td className="p-2.5 text-slate-700">{r.prodi?.namaProdi || r.namaProdi || '-'}</td>
                                    <td className="p-2.5 font-bold text-slate-900">{r.namaLulusan || r.nama || '-'}</td>
                                    <td className="p-2.5 text-center">
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 uppercase">
                                        {r.kategoriInstansi || r.statusKerja || '-'}
                                      </span>
                                    </td>
                                    <td className="p-2.5 font-medium text-slate-800">{r.namaInstansi || '-'}</td>
                                    <td className="p-2.5 text-slate-600">{r.jabatan || '-'}</td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Audit Trail Stepper */}
            <div className="space-y-3 pt-2">
              <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Alur Riwayat Persetujuan
              </h5>
              <div className="relative border-l-2 border-slate-200 ml-3 pl-4 space-y-4 text-xs">
                {/* 1. Pengajuan */}
                <div className="relative">
                  <span className="absolute -left-[23px] top-0.5 h-3.5 w-3.5 rounded-full bg-slate-400 ring-4 ring-white" />
                  <p className="font-bold text-slate-800">Diajukan oleh Admin UPT</p>
                  <p className="text-slate-500 text-[11px]">{detailItem.pengirim}</p>
                </div>

                {/* 2. Pimpinan */}
                <div className="relative">
                  <span
                    className={clsx(
                      'absolute -left-[23px] top-0.5 h-3.5 w-3.5 rounded-full ring-4 ring-white',
                      detailItem.pimpinan !== '-' ? 'bg-amber-500' : 'bg-slate-300'
                    )}
                  />
                  <p className="font-bold text-slate-800">Verifikasi Pimpinan UPT</p>
                  <p className="text-slate-500 text-[11px]">{detailItem.pimpinan}</p>
                </div>

                {/* 3. BPSDMP */}
                <div className="relative">
                  <span
                    className={clsx(
                      'absolute -left-[23px] top-0.5 h-3.5 w-3.5 rounded-full ring-4 ring-white',
                      detailItem.bpsdmp !== '-' ? 'bg-emerald-500' : 'bg-slate-300'
                    )}
                  />
                  <p className="font-bold text-slate-800">Persetujuan Akhir BPSDMP</p>
                  <p className="text-slate-500 text-[11px]">{detailItem.bpsdmp}</p>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <Link
                to="/admin/persetujuan"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-600 hover:text-sky-700"
              >
                Buka di Pusat Persetujuan →
              </Link>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExportSingle(detailItem, detailData)}
                  disabled={loadingDetail || !detailData}
                  className="btn-primary !py-2 !px-4 !text-xs !rounded-xl"
                >
                  <IconDownload className="h-3.5 w-3.5" />
                  Unduh Dokumen PDF
                </button>
                <button
                  onClick={() => {
                    setDetailItem(null)
                    setDetailData(null)
                  }}
                  className="btn-secondary !py-2 !px-4 !text-xs !rounded-xl"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
