import React, { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import api, { apiError } from '../../lib/api'
import { Alert } from '../../components/ui'
import {
  IconGraduation, IconDownload, IconFileText, IconChevronDown,
} from '../../components/icons'
import logoBpsdm from '../../assets/logo-bpsdm.png'
import { yearOptions, fmtNum, MONTHS } from '../../utils/format'
import AbsorptionReportView from '../../components/AbsorptionReportView'
import ExcelJS from 'exceljs'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

function colLetter(idx) {
  let s = ''
  let n = idx
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - r - 1) / 26)
  }
  return s
}

export default function UptAbsorptionReportPage() {
  const { user } = useAuth()
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState('all')
  const periodLabel = month === 'all' ? 'Semua Bulan' : `Bulan ${MONTHS[Number(month) - 1]}`
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exportingExcel, setExportingExcel] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = { year }
      if (month !== 'all') params.month = month
      const { data: res } = await api.get('/absorptions/my', params)
      setData(res)
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => {
    load()
  }, [load])

  const matrix = data?.matrix || []
  const summary = data?.summary || {
    totalPns: 0, totalPpnpn: 0, totalBumn: 0, totalSwasta: 0,
    totalBelumBekerja: 0, totalBekerja: 0, totalLulusan: 0, pctAbsorption: 0,
  }

  // Ekspor Excel (.xlsx)
  const handleExportExcel = async () => {
    if (!data) return
    setExportingExcel(true)
    try {
      const wb = new ExcelJS.Workbook()
      const isAll = month === 'all'
      const ws = wb.addWorksheet(`Penyerapan_${isAll ? 'Semua_Bulan' : `Bulan${month}`}_${year}`)
      ws.views = [{ showGridLines: true }]

      // Kop Surat
      const t1 = ws.addRow(['KEMENTERIAN PERHUBUNGAN'])
      const t2 = ws.addRow(['BADAN PENGEMBANGAN SUMBER DAYA MANUSIA PERHUBUNGAN'])
      const t3 = ws.addRow([`LAPORAN PENYERAPAN LULUSAN ${isAll ? 'SEMUA BULAN (JANUARI - DESEMBER)' : `BULAN ${MONTHS[Number(month) - 1].toUpperCase()}`} TAHUN ${year}`])
      const t4 = ws.addRow([`Nama UPT: ${data.upt?.name} (${data.upt?.code})`])
      ws.addRow([])

      t1.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF0F172A' } }
      t2.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } }
      t3.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF0F172A' } }
      t4.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF475569' } }

      if (isAll) {
        // Matriks 12 bulan (Jan s/d Des + Total Tahunan)
        const monthsData = data.months || {}
        const subCols = ['PNS', 'PPNPN', 'BUMN', 'SWASTA', 'BELUM BEKERJA', 'TOTAL BEKERJA', 'TOTAL LULUSAN', 'PERSENTASE (%)']
        const r6 = ['NO.', 'PROGRAM STUDI']
        const r7 = ['', '']
        for (let m = 1; m <= 12; m++) {
          r6.push(MONTHS[m - 1].toUpperCase(), '', '', '', '', '', '', '')
          r7.push(...subCols)
        }
        r6.push('TOTAL TAHUNAN', '', '', '', '', '', '', '')
        r7.push(...subCols)

        ws.addRow(r6)
        ws.addRow(r7)

        ws.mergeCells('A6:A7')
        ws.mergeCells('B6:B7')
        for (let m = 0; m <= 12; m++) {
          const startIdx = 3 + m * 8
          ws.mergeCells(`${colLetter(startIdx)}6:${colLetter(startIdx + 7)}6`)
        }

        for (let r = 6; r <= 7; r++) {
          const row = ws.getRow(r)
          row.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
          row.alignment = { horizontal: 'center', vertical: 'middle' }
          row.eachCell({ includeEmpty: true }, (cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
            cell.border = {
              top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' },
            }
          })
        }

        const pushProgBlock = (rowVals, mp) => {
          rowVals.push(
            mp.countPns || 0,
            mp.countPpnpn || 0,
            mp.countBumn || 0,
            mp.countSwasta || 0,
            mp.countBelumBekerja || 0,
            mp.totalBekerja || 0,
            mp.totalLulusan || 0,
            mp.totalLulusan > 0 ? (mp.pct || 0) / 100 : 0
          )
        }

        matrix.forEach((p, idx) => {
          const rowVals = [idx + 1, p.namaProdi]

          for (let m = 1; m <= 12; m++) {
            const mP = monthsData[m]?.rows?.find((r) => r.prodiId === p.prodiId) || {}
            pushProgBlock(rowVals, mP)
          }

          // Total Kumulatif Tahunan
          pushProgBlock(rowVals, p)

          const added = ws.addRow(rowVals)
          added.font = { name: 'Calibri', size: 9 }
          added.eachCell({ includeEmpty: true }, (cell, cIdx) => {
            cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
            if (cIdx >= 10 && (cIdx - 2) % 8 === 0) cell.numFmt = '0%'
          })
        })
      } else {
        // Single Bulan (Format Resmi dengan Nama Taruna)
        const r6 = ['NO.', 'PROGRAM STUDI', 'PEMERINTAH', '', '', '', '', '', 'NON PEMERINTAH', '', '', '', '', '', 'BELUM BEKERJA', '', 'TOTAL BEKERJA', 'TOTAL LULUSAN', 'PERSENTASE (%)']
        const r7 = ['', '', 'PNS', '', '', 'PPNPN', '', '', 'BUMN / BUMD', '', '', 'SWASTA', '', '', 'BELUM BEKERJA', '', '', '', '']
        const r8 = ['', '', 'NO', 'NAMA TARUNA', 'INSTANSI BEKERJA', 'NO', 'NAMA TARUNA', 'INSTANSI BEKERJA', 'NO', 'NAMA TARUNA', 'INSTANSI BEKERJA', 'NO', 'NAMA TARUNA', 'INSTANSI BEKERJA', 'NO', 'NAMA TARUNA', '', '', '']

        ws.addRow(r6)
        ws.addRow(r7)
        ws.addRow(r8)

        ws.mergeCells('A6:A8')
        ws.mergeCells('B6:B8')
        ws.mergeCells('C6:H6')
        ws.mergeCells('I6:N6')
        ws.mergeCells('O6:P7')
        ws.mergeCells('Q6:Q8')
        ws.mergeCells('R6:R8')
        ws.mergeCells('S6:S8')

        ws.mergeCells('C7:E7')
        ws.mergeCells('F7:H7')
        ws.mergeCells('I7:K7')
        ws.mergeCells('L7:N7')

        for (let r = 6; r <= 8; r++) {
          const row = ws.getRow(r)
          row.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0F172A' } }
          row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
          row.eachCell({ includeEmpty: true }, (cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } }
            cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
          })
        }

        let curRow = 9
        matrix.forEach((p, idx) => {
          const maxLen = Math.max(1, p.pns.length, p.ppnpn.length, p.bumn.length, p.swasta.length, p.belumBekerja.length)
          const startR = curRow
          for (let line = 0; line < maxLen; line++) {
            const pnsItem = p.pns[line]
            const ppnpnItem = p.ppnpn[line]
            const bumnItem = p.bumn[line]
            const swastaItem = p.swasta[line]
            const bbItem = p.belumBekerja[line]

            const rowVals = [
              line === 0 ? idx + 1 : '',
              line === 0 ? p.namaProdi : '',
              pnsItem ? line + 1 : '',
              pnsItem ? pnsItem.namaTaruna : '',
              pnsItem ? pnsItem.instansiBekerja : '',
              ppnpnItem ? line + 1 : '',
              ppnpnItem ? ppnpnItem.namaTaruna : '',
              ppnpnItem ? ppnpnItem.instansiBekerja : '',
              bumnItem ? line + 1 : '',
              bumnItem ? bumnItem.namaTaruna : '',
              bumnItem ? bumnItem.instansiBekerja : '',
              swastaItem ? line + 1 : '',
              swastaItem ? swastaItem.namaTaruna : '',
              swastaItem ? swastaItem.instansiBekerja : '',
              bbItem ? line + 1 : '',
              bbItem ? bbItem.namaTaruna : '',
              line === 0 ? p.totalBekerja : '',
              line === 0 ? p.totalLulusan : '',
              line === 0 ? (p.totalLulusan > 0 ? p.pct / 100 : 0) : '',
            ]

            const addedRow = ws.addRow(rowVals)
            addedRow.font = { name: 'Calibri', size: 9 }
            addedRow.eachCell({ includeEmpty: true }, (cell, cIdx) => {
              cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
              if (cIdx === 19) cell.numFmt = '0%'
            })
            curRow++
          }

          if (maxLen > 1) {
            const endR = curRow - 1
            ws.mergeCells(`A${startR}:A${endR}`)
            ws.mergeCells(`B${startR}:B${endR}`)
            ws.mergeCells(`Q${startR}:Q${endR}`)
            ws.mergeCells(`R${startR}:R${endR}`)
            ws.mergeCells(`S${startR}:S${endR}`)
          }
        })
      }

      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `Laporan_Penyerapan_Lulusan_${data.upt?.code}_${isAll ? 'Semua_Bulan' : `Bulan${month}`}_${year}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (err) {
      console.error(err)
    } finally {
      setExportingExcel(false)
    }
  }

  // Ekspor PDF
  const handleExportPdf = () => {
    if (!data) return
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const margin = 36
    let y = 38

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(15, 23, 42)
    doc.text('KEMENTERIAN PERHUBUNGAN', pageW / 2, y, { align: 'center' })
    y += 13
    doc.setFontSize(9.5)
    doc.text('BADAN PENGEMBANGAN SUMBER DAYA MANUSIA PERHUBUNGAN', pageW / 2, y, { align: 'center' })
    y += 16
    doc.setFontSize(11)
    doc.text(`LAPORAN PENYERAPAN LULUSAN (${month === 'all' ? 'SEMUA BULAN' : `BULAN ${MONTHS[Number(month) - 1].toUpperCase()}`} TAHUN ${year})`, pageW / 2, y, { align: 'center' })
    y += 14
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.text(`Nama UPT : ${data.upt?.name} (${data.upt?.code})`, pageW / 2, y, { align: 'center' })
    y += 10

    const body = matrix.map((p, i) => [
      { content: String(i + 1), styles: { halign: 'center' } },
      { content: p.namaProdi, styles: { halign: 'left', fontStyle: 'bold' } },
      { content: String(p.countPns), styles: { halign: 'center' } },
      { content: String(p.countPpnpn), styles: { halign: 'center' } },
      { content: String(p.totalPemerintah), styles: { halign: 'center', fontStyle: 'bold' } },
      { content: String(p.countBumn), styles: { halign: 'center' } },
      { content: String(p.countSwasta), styles: { halign: 'center' } },
      { content: String(p.totalNonPemerintah), styles: { halign: 'center', fontStyle: 'bold' } },
      { content: String(p.countBelumBekerja), styles: { halign: 'center' } },
      { content: String(p.totalBekerja), styles: { halign: 'center', fontStyle: 'bold' } },
      { content: String(p.totalLulusan), styles: { halign: 'center', fontStyle: 'bold' } },
      { content: `${p.pct}%`, styles: { halign: 'center', fontStyle: 'bold' } },
    ])

    autoTable(doc, {
      startY: y + 8,
      margin: { left: margin, right: margin, bottom: 50 },
      head: [
        [
          { content: 'NO', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
          { content: 'PROGRAM STUDI', rowSpan: 2, styles: { halign: 'left', valign: 'middle' } },
          { content: 'PEMERINTAH', colSpan: 3, styles: { halign: 'center' } },
          { content: 'NON PEMERINTAH', colSpan: 3, styles: { halign: 'center' } },
          { content: 'BELUM BEKERJA', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
          { content: 'TOTAL BEKERJA', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
          { content: 'TOTAL LULUSAN', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
          { content: 'PERSENTASE (%)', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
        ],
        [
          { content: 'PNS', styles: { halign: 'center' } },
          { content: 'PPNPN', styles: { halign: 'center' } },
          { content: 'SUBTOTAL', styles: { halign: 'center' } },
          { content: 'BUMN/BUMD', styles: { halign: 'center' } },
          { content: 'SWASTA', styles: { halign: 'center' } },
          { content: 'SUBTOTAL', styles: { halign: 'center' } },
        ]
      ],
      body,
      foot: [[
        { content: 'TOTAL KESELURUHAN', colSpan: 2, styles: { halign: 'center', fontStyle: 'bold' } },
        { content: String(summary.totalPns), styles: { halign: 'center', fontStyle: 'bold' } },
        { content: String(summary.totalPpnpn), styles: { halign: 'center', fontStyle: 'bold' } },
        { content: String(summary.totalPemerintah), styles: { halign: 'center', fontStyle: 'bold' } },
        { content: String(summary.totalBumn), styles: { halign: 'center', fontStyle: 'bold' } },
        { content: String(summary.totalSwasta), styles: { halign: 'center', fontStyle: 'bold' } },
        { content: String(summary.totalNonPemerintah), styles: { halign: 'center', fontStyle: 'bold' } },
        { content: String(summary.totalBelumBekerja), styles: { halign: 'center', fontStyle: 'bold' } },
        { content: String(summary.totalBekerja), styles: { halign: 'center', fontStyle: 'bold' } },
        { content: String(summary.totalLulusan), styles: { halign: 'center', fontStyle: 'bold' } },
        { content: `${summary.pctAbsorption}%`, styles: { halign: 'center', fontStyle: 'bold' } },
      ]],
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 7, cellPadding: 4, lineColor: [203, 213, 225], lineWidth: 0.5, valign: 'middle' },
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [15, 23, 42], textColor: [253, 230, 138], fontStyle: 'bold' },
    })

    const a = document.createElement('a')
    a.href = doc.output('bloburl')
    a.download = `Laporan_Penyerapan_${data.upt?.code}_${month === 'all' ? 'Semua_Bulan' : `Bulan${month}`}_${year}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <div className="animate-fadeUp space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-navy-950 via-navy-900 to-navy-950 px-5 py-4 text-white shadow-md border border-navy-800">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-48 w-48 rounded-full bg-gold-500/10 blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 p-1.5 shadow-inner border border-white/15 backdrop-blur-md" style={{ width: '40px', height: '40px' }}>
              <img src={logoBpsdm} alt="Logo BPSDMP" className="h-full w-full object-contain max-h-7 max-w-7" onError={(e) => (e.target.style.display = 'none')} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-black text-white tracking-tight">
                  Laporan Penyerapan Lulusan
                </h1>
                <span className="rounded-full text-[10px] font-extrabold px-2.5 py-0.5 border bg-gold-500/20 text-gold-300 border-gold-500/30">
                  {periodLabel} · Tahun {year}
                </span>
              </div>
              <p className="text-xs text-navy-200 mt-0.5 max-w-xl">
                <strong className="text-white">{user?.upt?.name || 'UPT'}</strong> — Rekapitulasi serapan kerja per Program Studi sesuai format resmi Kemenhub.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Filter Tahun */}
            <div className="relative">
              <select
                className="appearance-none cursor-pointer bg-white/10 hover:bg-white/15 border border-white/20 text-white font-extrabold text-xs rounded-xl py-2 pl-3 pr-8 shadow-sm backdrop-blur-md transition-all focus:outline-none focus:ring-2 focus:ring-gold-400"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {yearOptions().map((y) => (
                  <option key={y} value={y} className="bg-navy-900 text-white font-bold py-1">Tahun {y}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-gold-300">
                <IconChevronDown className="h-3.5 w-3.5" />
              </div>
            </div>

            {/* Filter Bulan */}
            <div className="relative">
              <select
                className="appearance-none cursor-pointer bg-white/10 hover:bg-white/15 border border-white/20 text-white font-extrabold text-xs rounded-xl py-2 pl-3 pr-8 shadow-sm backdrop-blur-md transition-all focus:outline-none focus:ring-2 focus:ring-gold-400"
                value={month}
                onChange={(e) => setMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              >
                <option value="all" className="bg-navy-900 text-white font-bold py-1">Semua Bulan (Jan - Des)</option>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1} className="bg-navy-900 text-white font-bold py-1">
                    {m}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-gold-300">
                <IconChevronDown className="h-3.5 w-3.5" />
              </div>
            </div>

            <button
              type="button"
              className="btn-gold text-xs !py-2 !px-3.5 rounded-xl shadow font-bold flex items-center gap-1.5"
              onClick={handleExportPdf}
              disabled={!data || loading}
            >
              <IconDownload className="h-4 w-4" />
              <span>PDF</span>
            </button>

            <button
              type="button"
              className="btn-primary !bg-emerald-600 hover:!bg-emerald-700 text-white text-xs !py-2 !px-3.5 rounded-xl shadow font-bold flex items-center gap-1.5"
              onClick={handleExportExcel}
              disabled={!data || loading || exportingExcel}
            >
              <IconFileText className="h-4 w-4" />
              <span>{exportingExcel ? 'Memproses...' : 'Excel (.xlsx)'}</span>
            </button>
          </div>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* Ringkasan 4 Kartu KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4 border-surface-border">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-navy-400">Total Bekerja</span>
          <p className="text-2xl font-black text-navy-950 tabular-nums mt-0.5">{fmtNum(summary.totalBekerja)}</p>
          <p className="text-[10px] text-navy-500 font-semibold mt-0.5">
            Pemerintah: {fmtNum(summary.totalPemerintah)} · Non-Pem: {fmtNum(summary.totalNonPemerintah)}
          </p>
        </div>

        <div className="card p-4 border-surface-border">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-navy-400">
            Total Lulusan {month === 'all' ? '(Tahunan)' : '(Bulan)'}
          </span>
          <p className="text-2xl font-black text-navy-900 tabular-nums mt-0.5">{fmtNum(summary.totalLulusan)}</p>
          <p className="text-[10px] text-navy-500 font-semibold mt-0.5">
            Bekerja + Belum Bekerja
          </p>
        </div>

        <div className="card p-4 border-surface-border">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600">Belum Bekerja</span>
          <p className="text-2xl font-black text-amber-700 tabular-nums mt-0.5">{fmtNum(summary.totalBelumBekerja)}</p>
          <p className="text-[10px] text-amber-600 font-semibold mt-0.5">
            Mencari kerja / studi lanjut
          </p>
        </div>

        <div className="card p-4 border-surface-border bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-100">Persentase Serap (%)</span>
          <p className="text-3xl font-black tabular-nums mt-0.5">{summary.pctAbsorption}%</p>
          <p className="text-[10.5px] text-emerald-100 font-semibold mt-0.5">
            Tingkat Serapan Lulusan
          </p>
        </div>
      </div>

      {/* Tampilan Matriks Penyerapan (Single Bulan Detail Nama Taruna atau Matriks Bulanan Horizontal) */}
      <div className="card p-4 border border-slate-300 shadow-card">
        <AbsorptionReportView
          data={data}
          year={year}
          month={month}
          loading={loading}
          showTarunaNamesDefault={true}
        />
      </div>
    </div>
  )
}
