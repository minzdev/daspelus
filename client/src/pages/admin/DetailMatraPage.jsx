import { useCallback, useEffect, useMemo, useState } from 'react'
import api, { apiError } from '../../lib/api'
import { EmptyState, SkeletonRows, Alert } from '../../components/ui'
import {
  IconChart, IconBuilding, IconRefresh, IconSearch, IconDownload,
  IconTruck, IconShip, IconPlane,
} from '../../components/icons'
import { MONTHS, yearOptions, fmtNum } from '../../utils/format'
import { useAuth } from '../../context/AuthContext'
import clsx from 'clsx'

const MATRA_LABEL = { darat: 'Matra Darat', laut: 'Matra Laut', udara: 'Matra Udara', aparatur: 'Aparatur' }
const MATRA_SHORT = { darat: 'Darat', laut: 'Laut', udara: 'Udara', aparatur: 'Aparatur' }
const MATRA_ORDER = ['darat', 'laut', 'udara', 'aparatur']
const MATRA_STYLE = {
  darat: { accent: 'border-emerald-500', iconBg: 'bg-emerald-50 text-emerald-600 border border-emerald-100', cardBg: 'bg-emerald-50/20', label: 'Darat', icon: IconTruck },
  laut: { accent: 'border-sky-500', iconBg: 'bg-sky-50 text-sky-600 border border-sky-100', cardBg: 'bg-sky-50/20', label: 'Laut', icon: IconShip },
  udara: { accent: 'border-violet-500', iconBg: 'bg-violet-50 text-violet-600 border border-violet-100', cardBg: 'bg-violet-50/20', label: 'Udara', icon: IconPlane },
  aparatur: { accent: 'border-amber-500', iconBg: 'bg-amber-50 text-amber-600 border border-amber-100', cardBg: 'bg-amber-50/20', label: 'Aparatur', icon: IconBuilding },
}

function isProgramVisibleForMatra(p, matra) {
  const tg = (p.targetGroup || 'semua').toLowerCase()
  if (tg === 'semua') return true
  if (matra === 'aparatur') return tg === 'aparatur'
  return tg === 'taruna'
}

function buildMatraAggregates(upts, flatOrder) {
  const byMatra = new Map()
  for (const matra of MATRA_ORDER) {
    byMatra.set(matra, { matra, upts: [], programMap: new Map() })
  }
  for (const u of upts) {
    const m = (u.matra || '').toLowerCase()
    const uptType = (u.uptType || '').toLowerCase()
    let key = null
    if (m === 'aparatur' || uptType === 'aparatur') key = 'aparatur'
    else if (MATRA_ORDER.includes(m)) key = m
    if (!key) continue
    const entry = byMatra.get(key)
    entry.upts.push(u)
    for (const p of u.programs) {
      // Filter: jangan campur program taruna ke aparatur dan sebaliknya
      if (!isProgramVisibleForMatra(p, key)) continue
      if (!entry.programMap.has(p.programId)) {
        entry.programMap.set(p.programId, {
          programId: p.programId, programName: p.programName, parentName: p.parentName, isParent: p.isParent, targetGroup: p.targetGroup || 'semua',
          pesertaL: 0, pesertaP: 0, lulusanL: 0, lulusanP: 0, targetPeserta: 0, targetLulusan: 0,
        })
      }
      const agg = entry.programMap.get(p.programId)
      agg.pesertaL += Number(p.pesertaL) || 0
      agg.pesertaP += Number(p.pesertaP) || 0
      agg.lulusanL += Number(p.lulusanL) || 0
      agg.lulusanP += Number(p.lulusanP) || 0
      agg.targetPeserta += Number(p.targetPeserta) || 0
      agg.targetLulusan += Number(p.targetLulusan) || 0
    }
  }
  const result = []
  for (const matra of MATRA_ORDER) {
    const entry = byMatra.get(matra)
    const visibleFlat = flatOrder.filter((fp) => isProgramVisibleForMatra(fp, matra))
    const progList = visibleFlat.map((fp) => entry.programMap.get(fp.id)).filter(Boolean)
    const extra = [...entry.programMap.values()].filter((v) => !visibleFlat.some((f) => f.id === v.programId))
    extra.forEach((e) => progList.push(e))
    const parentRows = progList.filter((p) => p.isParent)
    const totalPeserta = parentRows.reduce((s, p) => s + p.pesertaL + p.pesertaP, 0)
    const totalPesertaL = parentRows.reduce((s, p) => s + p.pesertaL, 0)
    const totalPesertaP = parentRows.reduce((s, p) => s + p.pesertaP, 0)
    const totalLulusan = parentRows.reduce((s, p) => s + p.lulusanL + p.lulusanP, 0)
    const totalLulusanL = parentRows.reduce((s, p) => s + p.lulusanL, 0)
    const totalLulusanP = parentRows.reduce((s, p) => s + p.lulusanP, 0)
    const totalTargetPeserta = parentRows.reduce((s, p) => s + p.targetPeserta, 0)
    const totalTargetLulusan = parentRows.reduce((s, p) => s + p.targetLulusan, 0)
    result.push({ matra, upts: entry.upts, uptCount: entry.upts.length, programs: progList, totalPeserta, totalPesertaL, totalPesertaP, totalLulusan, totalLulusanL, totalLulusanP, totalTargetPeserta, totalTargetLulusan })
  }
  return result
}

export default function DetailMatraPage() {
  const { user, loading: authLoading } = useAuth()
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState('')
  const [matraFilter, setMatraFilter] = useState('')
  const [search, setSearch] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (authLoading || !user) return
    setLoading(true)
    setError('')
    try {
      const params = { year }
      if (month) params.month = month
      const { data: res } = await api.get('/reports', { params })
      setData(res)
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [year, month, user, authLoading])

  useEffect(() => { load() }, [load])

  const flatOrder = useMemo(() => {
    if (!data?.upts?.[0]?.programs) return []
    return data.upts[0].programs.map((p) => ({ id: p.programId, name: p.programName, parentName: p.parentName, isParent: p.isParent, targetGroup: p.targetGroup || 'semua' }))
  }, [data])

  const aggregates = useMemo(() => {
    if (!data?.upts) return []
    return buildMatraAggregates(data.upts, flatOrder)
  }, [data, flatOrder])

  const filteredAggregates = useMemo(() => {
    let list = aggregates
    if (matraFilter) list = list.filter((a) => a.matra === matraFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.map((a) => {
        const progs = a.programs.filter((p) => p.programName.toLowerCase().includes(q) || (p.parentName || '').toLowerCase().includes(q))
        if (!progs.length) return null
        return { ...a, programs: progs }
      }).filter(Boolean)
    }
    return list
  }, [aggregates, matraFilter, search])

  const grand = useMemo(() => {
    if (!aggregates.length) return { uptCount: 0, peserta: 0, lulusan: 0, targetPeserta: 0, targetLulusan: 0 }
    return {
      uptCount: aggregates.reduce((s, a) => s + a.uptCount, 0),
      peserta: aggregates.reduce((s, a) => s + a.totalPeserta, 0),
      lulusan: aggregates.reduce((s, a) => s + a.totalLulusan, 0),
      targetPeserta: aggregates.reduce((s, a) => s + a.totalTargetPeserta, 0),
      targetLulusan: aggregates.reduce((s, a) => s + a.totalTargetLulusan, 0),
    }
  }, [aggregates])

  const periodLabel = data?.monthName ? `${data.monthName} ${year}` : `Tahun ${year}`

  const handleExportCsv = async () => {
    if (!filteredAggregates.length) return
    const ExcelJS = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    wb.creator = 'DASPESLUS'
    const navy = '0F172A'
    const border = { style: 'thin', color: { argb: 'CBD5E1' } }
    const thin = { top: border, left: border, bottom: border, right: border }
    const ws = wb.addWorksheet('Detail Matra', { properties: { tabColor: { argb: navy } } })
    ws.columns = [
      { header: 'Program', key: 'prog', width: 42 },
      { header: 'Target Peserta', key: 'tPes', width: 13 },
      { header: 'Peserta L', key: 'pL', width: 10 },
      { header: 'P', key: 'pP', width: 10 },
      { header: 'Total Peserta', key: 'totPes', width: 13 },
      { header: 'Target Lulusan', key: 'tLul', width: 13 },
      { header: 'Lulusan L', key: 'lL', width: 10 },
      { header: 'P', key: 'lP', width: 10 },
      { header: 'Total Lulusan', key: 'totLul', width: 13 },
    ]
    // Judul — tanpa tabel matra, tanpa Total UPT line
    const matraNames = filteredAggregates.map((a) => MATRA_SHORT[a.matra]).join(', ')
    ws.mergeCells('A1:I1')
    const t1 = ws.getCell('A1')
    t1.value = `LAPORAN PESERTA DAN LULUSAN PROGRAM MATRA (${matraNames || 'Darat, Laut, Udara'}) — ${periodLabel}`
    t1.font = { size: 12, bold: true, color: { argb: navy } }
    t1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    ws.getRow(1).height = 24
    ws.mergeCells('A2:I2')
    ws.getCell('A2').value = `BPSDMP Kementerian Perhubungan — ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`
    ws.getCell('A2').font = { size: 8, color: { argb: '64748B' } }
    ws.getCell('A2').alignment = { horizontal: 'center' }
    ws.getRow(2).height = 14
    // Header per matra — tanpa kolom Matra
    let r = 4
    for (const agg of filteredAggregates) {
      ws.mergeCells(`A${r}:I${r}`)
      const secTitle = ws.getCell(`A${r}`)
      secTitle.value = `${MATRA_LABEL[agg.matra]} — ${agg.uptCount} UPT`
      secTitle.font = { bold: true, size: 10, color: { argb: 'FFFFFF' } }
      secTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: agg.matra === 'darat' ? '059669' : agg.matra === 'laut' ? '0284C7' : agg.matra === 'udara' ? '7C3AED' : 'D97706' } }
      secTitle.alignment = { horizontal: 'left', vertical: 'middle' }
      secTitle.border = thin
      ws.getRow(r).height = 18
      r++
      const hdr = ws.getRow(r++)
      hdr.values = ['Program', 'Target Peserta', 'Peserta L', 'P', 'Total Peserta', 'Target Lulusan', 'Lulusan L', 'P', 'Total Lulusan']
      hdr.height = 18
      hdr.eachCell((c) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '334155' } }
        c.font = { color: { argb: 'FFFFFF' }, bold: true, size: 8 }
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        c.border = thin
      })
      for (const p of agg.programs) {
        const row = ws.getRow(r++)
        row.values = [p.programName, p.targetPeserta, p.pesertaL, p.pesertaP, p.pesertaL + p.pesertaP, p.targetLulusan, p.lulusanL, p.lulusanP, p.lulusanL + p.lulusanP]
        row.height = 15
        const isParent = p.isParent
        row.eachCell((cell, col) => {
          cell.font = { size: 8, color: { argb: isParent ? '0F172A' : '334155' }, bold: isParent }
          cell.alignment = { horizontal: col === 1 ? 'left' : 'center', vertical: 'middle' }
          cell.border = thin
          if (col >= 2) cell.numFmt = '#,##0'
          if (isParent) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } }
        })
      }
      const tr = ws.getRow(r++)
      tr.values = ['TOTAL', agg.totalTargetPeserta, '', '', agg.totalPeserta, agg.totalTargetLulusan, '', '', agg.totalLulusan]
      tr.getCell(1).value = `TOTAL ${MATRA_SHORT[agg.matra]}`
      tr.getCell(2).value = agg.totalTargetPeserta
      tr.getCell(5).value = agg.totalPeserta
      tr.getCell(6).value = agg.totalTargetLulusan
      tr.getCell(9).value = agg.totalLulusan
      tr.height = 18
      tr.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F172A' } }
        cell.font = { color: { argb: 'FFFFFF' }, bold: true, size: 8 }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        cell.border = thin
        cell.numFmt = '#,##0'
      })
      tr.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' }
      r++
    }
    ws.views = [{ state: 'frozen', ySplit: 3 }]
    ws.autoFilter = undefined
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } }
    ws.properties.defaultRowHeight = 15
    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `Laporan_Peserta_Lulusan_Matra_${year}${month ? '_' + String(month).padStart(2, '0') : ''}.xlsx`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(a.href)
  }

  const handleExportPdf = async () => {
    if (!filteredAggregates.length) return
    try {
      const [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
      const autoTableFn = autoTableMod.default || autoTableMod
      const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' })
    const pageW = doc.internal.pageSize.getWidth()
    const margin = 32
    const navy = [15, 23, 42]
    // Judul
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...navy)
    const matraNames = filteredAggregates.map((a) => MATRA_SHORT[a.matra]).join(', ')
    doc.text(`LAPORAN PESERTA DAN LULUSAN PROGRAM MATRA (${matraNames})`, pageW / 2, 48, { align: 'center' })
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 116, 139)
    doc.text(`${periodLabel} — BPSDMP Kementerian Perhubungan`, pageW / 2, 62, { align: 'center' })
    let y = 80
    for (const agg of filteredAggregates) {
      if (y > 500) { doc.addPage(); y = 48 }
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(...navy)
      doc.text(`${MATRA_LABEL[agg.matra]} — ${agg.uptCount} UPT`, margin, y)
      y += 6
      const body = agg.programs.map((p) => [
        p.programName,
        String(p.targetPeserta),
        String(p.pesertaL),
        String(p.pesertaP),
        String(p.pesertaL + p.pesertaP),
        String(p.targetLulusan),
        String(p.lulusanL),
        String(p.lulusanP),
        String(p.lulusanL + p.lulusanP),
      ])
      // Total row
      body.push([
        { content: `TOTAL ${MATRA_SHORT[agg.matra]}`, styles: { fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
        { content: String(agg.totalTargetPeserta), styles: { halign: 'center', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
        { content: '', styles: { fillColor: [15, 23, 42] } },
        { content: '', styles: { fillColor: [15, 23, 42] } },
        { content: String(agg.totalPeserta), styles: { halign: 'center', fontStyle: 'bold', fillColor: [14, 165, 233], textColor: [255, 255, 255] } },
        { content: String(agg.totalTargetLulusan), styles: { halign: 'center', fontStyle: 'bold', fillColor: [15, 23, 42], textColor: [255, 255, 255] } },
        { content: '', styles: { fillColor: [15, 23, 42] } },
        { content: '', styles: { fillColor: [15, 23, 42] } },
        { content: String(agg.totalLulusan), styles: { halign: 'center', fontStyle: 'bold', fillColor: [16, 185, 129], textColor: [255, 255, 255] } },
      ])
      autoTableFn(doc, {
        startY: y + 4,
        margin: { left: margin, right: margin },
        head: [[
          { content: 'Program', styles: { halign: 'left' } },
          { content: 'Target Peserta', styles: { halign: 'center' } },
          { content: 'L', styles: { halign: 'center' } },
          { content: 'P', styles: { halign: 'center' } },
          { content: 'Total', styles: { halign: 'center' } },
          { content: 'Target Lulusan', styles: { halign: 'center' } },
          { content: 'L', styles: { halign: 'center' } },
          { content: 'P', styles: { halign: 'center' } },
          { content: 'Total', styles: { halign: 'center' } },
        ]],
        body,
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 7, cellPadding: 4, lineColor: [203, 213, 225], lineWidth: 0.5, textColor: [15, 23, 42], valign: 'middle' },
        headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: 'bold', fontSize: 7 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      })
      y = doc.lastAutoTable.finalY + 16
    }
    doc.save(`Laporan_Peserta_Lulusan_Matra_${year}${month ? '_' + String(month).padStart(2, '0') : ''}.pdf`)
    } catch (e) {
      console.error(e)
      toast.error('Gagal membuat PDF', e?.message || '')
    }
  }

  return (
    <div className="animate-fadeUp space-y-5 max-w-[1400px] mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Detail Laporan Matra</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-3xl">Jumlah peserta & lulusan per program dijumlah dari seluruh UPT pada matra yang sama. Baris tebal adalah total induk.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" className="btn-secondary !rounded-lg !py-2" onClick={handleExportCsv} disabled={!filteredAggregates.length}><IconDownload className="h-4 w-4" /> Excel</button>
          <button type="button" className="btn-primary !rounded-lg !py-2" onClick={handleExportPdf} disabled={!filteredAggregates.length}><IconDownload className="h-4 w-4" /> PDF</button>
          <button type="button" className="btn-secondary !rounded-lg !py-2" onClick={load} title="Muat ulang"><IconRefresh className="h-4 w-4" /></button>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      <div className="card rounded-xl border border-slate-200 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="form-label !mb-1.5 !text-[11px]">Tahun</label>
            <select className="form-input !py-2 !text-sm" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label !mb-1.5 !text-[11px]">Bulan</label>
            <select className="form-input !py-2 !text-sm" value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="">Semua Bulan</option>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label !mb-1.5 !text-[11px]">Matra</label>
            <select className="form-input !py-2 !text-sm" value={matraFilter} onChange={(e) => setMatraFilter(e.target.value)}>
              <option value="">Semua Matra</option>
              {MATRA_ORDER.map((k) => <option key={k} value={k}>{MATRA_LABEL[k]}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label !mb-1.5 !text-[11px]">Cari Program</label>
            <div className="relative">
              <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input className="form-input !pl-9 !py-2 !text-sm" placeholder="Pola Pembibitan..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs border-t border-slate-100 pt-3">
          <span className="text-slate-500">Periode <strong className="text-slate-800">{periodLabel}</strong> · {grand.uptCount} UPT</span>
          <span className="text-slate-500">Peserta <strong className="text-slate-800">{fmtNum(grand.peserta)}</strong> / {fmtNum(grand.targetPeserta)} · Lulusan <strong className="text-slate-800">{fmtNum(grand.lulusan)}</strong> / {fmtNum(grand.targetLulusan)}</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {MATRA_ORDER.map((m) => {
          const agg = aggregates.find((a) => a.matra === m)
          const style = MATRA_STYLE[m] || MATRA_STYLE.darat
          const Icon = style.icon
          if (!agg) return null
          const dimmed = matraFilter && matraFilter !== m
          return (
            <div key={m} className={clsx('card rounded-xl border p-3.5 transition-opacity', style.cardBg, dimmed && 'opacity-40')}>
              <div className="flex items-center gap-2.5">
                <div className={clsx('h-8 w-8 rounded-lg flex items-center justify-center border', style.iconBg)}><Icon className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-800 leading-none">{style.label}</p>
                  <p className="text-[11px] text-slate-500 leading-none mt-1">{agg.uptCount} UPT</p>
                </div>
                <span className="text-[10px] font-medium text-slate-500 bg-slate-50 border border-slate-200 px-2 py-1 rounded-full">{agg.programs.filter((p) => p.isParent).length} program</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-2">
                  <p className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase">Peserta</p>
                  <p className="text-sm font-bold text-slate-900 tabular-nums mt-0.5">{fmtNum(agg.totalPeserta)}</p>
                  <p className="text-[10px] text-slate-400">target {fmtNum(agg.totalTargetPeserta)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-2">
                  <p className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase">Lulusan</p>
                  <p className="text-sm font-bold text-slate-900 tabular-nums mt-0.5">{fmtNum(agg.totalLulusan)}</p>
                  <p className="text-[10px] text-slate-400">target {fmtNum(agg.totalTargetLulusan)}</p>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1">
                {agg.upts.slice(0, 3).map((u) => (
                  <span key={u.uptId} className="text-[10px] font-medium bg-white border border-slate-200 text-slate-700 px-1.5 py-0.5 rounded truncate max-w-[84px]" title={`${u.uptCode} — ${u.uptName}`}>{u.uptCode}</span>
                ))}
                {agg.upts.length > 3 && <span className="text-[10px] text-slate-400 self-center">+{agg.upts.length - 3}</span>}
              </div>
            </div>
          )
        })}
      </div>

      {loading ? (
        <SkeletonRows rows={8} />
      ) : filteredAggregates.length === 0 ? (
        <EmptyState icon={<IconChart className="h-6 w-6" />} title="Tidak ada data" desc="Tidak ada UPT/matras yang cocok dengan filter." />
      ) : (
        <div className="space-y-5">
          {filteredAggregates.map((agg) => {
            const style = MATRA_STYLE[agg.matra] || MATRA_STYLE.darat
            const Icon = style.icon
            return (
              <div key={agg.matra} className="card overflow-hidden rounded-xl border border-slate-200">
                <div className={clsx('px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white border-l-4', style.accent)}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={clsx('h-8 w-8 rounded-lg flex items-center justify-center border', style.iconBg)}><Icon className="h-4 w-4" /></div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 leading-none">{MATRA_LABEL[agg.matra]} — {agg.uptCount} UPT</h3>
                      <p className="text-xs text-slate-500 truncate max-w-[520px] mt-0.5">{agg.upts.map((u) => u.uptCode).join(' · ') || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 text-white px-3 py-1.5 font-semibold">Peserta {fmtNum(agg.totalPeserta)}</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 text-slate-700 px-3 py-1.5 font-semibold">Lulusan {fmtNum(agg.totalLulusan)}</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '28%' }} />
                      <col style={{ width: '10%' }} />
                      <col style={{ width: '7%' }} />
                      <col style={{ width: '7%' }} />
                      <col style={{ width: '9%' }} />
                      <col style={{ width: '10%' }} />
                      <col style={{ width: '7%' }} />
                      <col style={{ width: '7%' }} />
                      <col style={{ width: '9%' }} />
                    </colgroup>
                    <thead>
                      <tr className="bg-slate-100/80 border-b border-slate-200">
                        <th rowSpan={2} className="text-left px-4 py-3 text-[11px] font-bold tracking-widest text-slate-700 uppercase align-middle">Program</th>
                        <th colSpan={4} className="text-center px-2 py-2 text-[11px] font-bold tracking-wide text-sky-800 bg-sky-50 border-b border-slate-200 border-l border-white uppercase">Peserta</th>
                        <th colSpan={4} className="text-center px-2 py-2 text-[11px] font-bold tracking-wide text-emerald-800 bg-emerald-50 border-b border-slate-200 border-l border-white uppercase">Lulusan</th>
                      </tr>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-right px-2 py-2 text-[10px] font-semibold text-slate-500 uppercase border-l border-slate-200">Target</th>
                        <th className="text-center px-2 py-2 text-[10px] font-semibold text-slate-500 uppercase">L</th>
                        <th className="text-center px-2 py-2 text-[10px] font-semibold text-slate-500 uppercase">P</th>
                        <th className="text-right px-3 py-2 text-[10px] font-bold text-slate-700 uppercase bg-slate-100 border-l border-r border-slate-200">Total</th>
                        <th className="text-right px-2 py-2 text-[10px] font-semibold text-slate-500 uppercase border-l border-slate-200">Target</th>
                        <th className="text-center px-2 py-2 text-[10px] font-semibold text-slate-500 uppercase">L</th>
                        <th className="text-center px-2 py-2 text-[10px] font-semibold text-slate-500 uppercase">P</th>
                        <th className="text-right px-3 py-2 text-[10px] font-bold text-slate-700 uppercase bg-slate-100 border-l border-slate-200">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {agg.programs.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-3 py-10 text-center">
                            <p className="text-sm font-medium text-slate-500">Belum ada program untuk {MATRA_LABEL[agg.matra]}</p>
                            <p className="text-xs text-slate-400 mt-1">Buat program baru di <strong>Master Program</strong> dengan Sasaran <strong>{MATRA_LABEL[agg.matra]}</strong> agar muncul di sini.</p>
                          </td>
                        </tr>
                      ) : (
                        agg.programs.map((p) => (
                          <tr key={p.programId} className={clsx('transition-colors duration-150', p.isParent ? 'bg-slate-50/70 hover:bg-slate-100/80' : 'hover:bg-slate-50')}>
                            <td className="px-4 py-2.5">
                              <p className={clsx('text-xs leading-tight truncate', p.isParent ? 'font-bold text-slate-900' : 'font-medium text-slate-600 pl-3')}>{p.isParent ? p.programName : `↳ ${p.programName}`}</p>
                              {!p.isParent && <p className="text-[10px] text-slate-400 truncate leading-none mt-0.5">{p.parentName}</p>}
                            </td>
                            <td className="px-2 py-2.5 text-right tabular-nums text-xs text-slate-600">{fmtNum(p.targetPeserta)}</td>
                            <td className="px-2 py-2.5 text-center tabular-nums text-xs">{fmtNum(p.pesertaL)}</td>
                            <td className="px-2 py-2.5 text-center tabular-nums text-xs">{fmtNum(p.pesertaP)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-xs font-bold text-slate-900 bg-slate-50 border-l border-slate-100">{fmtNum(p.pesertaL + p.pesertaP)}</td>
                            <td className="px-2 py-2.5 text-right tabular-nums text-xs text-slate-600 border-l border-slate-100">{fmtNum(p.targetLulusan)}</td>
                            <td className="px-2 py-2.5 text-center tabular-nums text-xs">{fmtNum(p.lulusanL)}</td>
                            <td className="px-2 py-2.5 text-center tabular-nums text-xs">{fmtNum(p.lulusanP)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-xs font-bold text-slate-900 bg-slate-50 border-l border-slate-100">{fmtNum(p.lulusanL + p.lulusanP)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-900 text-white">
                        <td className="px-4 py-3 text-left text-xs font-bold tracking-wide uppercase rounded-bl-xl">Total {MATRA_SHORT[agg.matra]} ({agg.uptCount} UPT)</td>
                        <td className="px-2 py-3 text-right tabular-nums text-xs font-medium text-white/70">{fmtNum(agg.totalTargetPeserta)}</td>
                        <td className="px-2 py-3 text-center tabular-nums text-xs">{fmtNum(agg.totalPesertaL)}</td>
                        <td className="px-2 py-3 text-center tabular-nums text-xs">{fmtNum(agg.totalPesertaP)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-sm font-extrabold bg-sky-700 border-x border-sky-800">{fmtNum(agg.totalPeserta)}</td>
                        <td className="px-2 py-3 text-right tabular-nums text-xs font-medium text-white/70 border-l border-slate-700">{fmtNum(agg.totalTargetLulusan)}</td>
                        <td className="px-2 py-3 text-center tabular-nums text-xs">{fmtNum(agg.totalLulusanL)}</td>
                        <td className="px-2 py-3 text-center tabular-nums text-xs">{fmtNum(agg.totalLulusanP)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-sm font-extrabold bg-emerald-700 border-l border-emerald-800 rounded-br-xl">{fmtNum(agg.totalLulusan)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
