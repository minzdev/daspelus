import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import api, { apiError } from '../../lib/api'
import { Alert, EmptyState, SkeletonRows } from '../../components/ui'
import { IconLayers, IconSearch, IconRefresh, IconDownload, IconFilter } from '../../components/icons'
import { MONTHS, yearOptions, fmtNum } from '../../utils/format'
import clsx from 'clsx'

const CATEGORY_FILTER = [
  { value: 'semua', label: 'Semua Kategori' },
  { value: 'taruna', label: 'Taruna' },
  { value: 'aparatur', label: 'Aparatur' },
]

const MATRA_OPTIONS = [
  { value: 'semua', label: 'Semua Matra' },
  { value: 'darat', label: 'Matra Darat' },
  { value: 'laut', label: 'Matra Laut' },
  { value: 'udara', label: 'Matra Udara' },
  { value: 'aparatur', label: 'Aparatur' },
]

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

function IconChevronDown({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function IconChevronRight({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

export default function ProgramDetailPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState('')
  const [matra, setMatra] = useState('semua')
  const [selectedUptId, setSelectedUptId] = useState('')
  const [uptOptions, setUptOptions] = useState([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('semua')
  const [showDiklats, setShowDiklats] = useState(true)
  const [collapsedProgs, setCollapsedProgs] = useState(new Set())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Ambil opsi UPT untuk dropdown filter
  useEffect(() => {
    api.get('/upts/options')
      .then((res) => setUptOptions(res.data?.options || []))
      .catch(() => {})
  }, [])

  const filteredUptOptions = useMemo(() => {
    if (!uptOptions.length) return []
    if (matra === 'semua') return uptOptions
    return uptOptions.filter((u) => {
      const m = (u.matra || '').toLowerCase()
      if (matra === 'aparatur') return m === 'aparatur'
      return m === matra
    })
  }, [uptOptions, matra])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = { year }
      if (month) params.month = month
      if (matra && matra !== 'semua') params.matra = matra
      if (selectedUptId) params.uptId = selectedUptId
      const { data: res } = await api.get('/reports/program-detail', { params })
      setData(res)
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [year, month, matra, selectedUptId])

  useEffect(() => { load() }, [load])

  const programs = useMemo(() => {
    if (!data?.programs) return []
    let list = [...data.programs]
    if (category !== 'semua') {
      list = list.filter((p) => {
        const tg = (p.targetGroup || p.category || 'semua').toLowerCase()
        return tg === category || tg === 'semua'
      })
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((p) => {
        const matchProg = p.programName.toLowerCase().includes(q) || (p.parentName || '').toLowerCase().includes(q)
        const matchDiklat = (p.diklats || []).some((d) => d.name.toLowerCase().includes(q) || (d.uptName || '').toLowerCase().includes(q))
        return matchProg || matchDiklat
      })
    }
    return list
  }, [data, category, search])

  const summary = data?.summary
  const filteredSummary = useMemo(() => {
    const progsOnly = programs.filter((p) => !p.isParent)
    if (!progsOnly.length) {
      return { totalPrograms: 0, totalPeserta: 0, totalPesertaL: 0, totalPesertaP: 0, totalLulusan: 0, totalLulusanL: 0, totalLulusanP: 0, totalTargetPeserta: 0, totalTargetLulusan: 0 }
    }
    return {
      totalPrograms: progsOnly.length,
      totalTargetPeserta: progsOnly.reduce((s, p) => s + (p.totalTargetPeserta || 0), 0),
      totalTargetLulusan: progsOnly.reduce((s, p) => s + (p.totalTargetLulusan || 0), 0),
      totalPeserta: progsOnly.reduce((s, p) => s + (p.totalPeserta || 0), 0),
      totalPesertaL: progsOnly.reduce((s, p) => s + (p.totalPesertaL || 0), 0),
      totalPesertaP: progsOnly.reduce((s, p) => s + (p.totalPesertaP || 0), 0),
      totalLulusan: progsOnly.reduce((s, p) => s + (p.totalLulusan || 0), 0),
      totalLulusanL: progsOnly.reduce((s, p) => s + (p.totalLulusanL || 0), 0),
      totalLulusanP: progsOnly.reduce((s, p) => s + (p.totalLulusanP || 0), 0),
    }
  }, [programs])

  const totalDiklatCount = useMemo(() => {
    return programs.reduce((s, p) => s + (p.diklats?.length || 0), 0)
  }, [programs])

  const toggleProgCollapse = (progId) => {
    setCollapsedProgs((prev) => {
      const next = new Set(prev)
      if (next.has(progId)) next.delete(progId)
      else next.add(progId)
      return next
    })
  }

  const toggleAllDiklats = () => {
    setShowDiklats((prev) => !prev)
    setCollapsedProgs(new Set())
  }

  const handleExportExcel = async () => {
    if (!programs.length) return
    const ExcelJS = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    wb.creator = 'DASPESLUS'
    const ws = wb.addWorksheet('Detail Program', { properties: { tabColor: { argb: '0F172A' } } })

    const isAllMonths = !month
    const selUpt = uptOptions.find((u) => u.id === selectedUptId)
    const selMatra = MATRA_OPTIONS.find((m) => m.value === matra)?.label || 'Semua Matra'
    const title = `REKAP DETAIL DATA PROGRAM — ${data?.monthName ? data.monthName + ' ' : 'SEMUA BULAN '}${year}`

    let subTitle = `BPSDMP Kementerian Perhubungan — Dicetak: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`
    if (matra !== 'semua') subTitle += ` | Matra: ${selMatra}`
    if (selUpt) subTitle += ` | UPT: [${selUpt.code}] ${selUpt.name}`
    if (category !== 'semua') subTitle += ` | Kategori: ${category.toUpperCase()}`

    if (isAllMonths) {
      // Setup kolom untuk 12 Bulan
      const cols = [
        { header: 'No', key: 'no', width: 6 },
        { header: 'Jenis', key: 'type', width: 10 },
        { header: 'Program / Diklat', key: 'name', width: 38 },
        { header: 'Induk / UPT', key: 'upt', width: 26 },
        { header: 'Tgt Pst', key: 'tp', width: 10 },
        { header: 'Tgt Lls', key: 'tl', width: 10 },
      ]
      for (let m = 1; m <= 12; m++) {
        cols.push({ header: `${MONTH_SHORT[m - 1]} Pst`, key: `m${m}_p`, width: 9 })
        cols.push({ header: `${MONTH_SHORT[m - 1]} Lls`, key: `m${m}_l`, width: 9 })
      }
      cols.push(
        { header: 'Tot Pst L', key: 'tot_pl', width: 10 },
        { header: 'Tot Pst P', key: 'tot_pp', width: 10 },
        { header: 'Total Peserta', key: 'tot_p', width: 12 },
        { header: 'Tot Lls L', key: 'tot_ll', width: 10 },
        { header: 'Tot Lls P', key: 'tot_lp', width: 10 },
        { header: 'Total Lulusan', key: 'tot_l', width: 12 },
        { header: 'UPT', key: 'upt_count', width: 8 }
      )
      ws.columns = cols

      ws.mergeCells('A1:AJ1')
      ws.getCell('A1').value = title
      ws.getCell('A1').font = { size: 12, bold: true, color: { argb: '0F172A' } }
      ws.getCell('A1').alignment = { horizontal: 'center' }
      ws.getRow(1).height = 24

      ws.mergeCells('A2:AJ2')
      ws.getCell('A2').value = subTitle
      ws.getCell('A2').font = { size: 9, color: { argb: '64748B' } }
      ws.getCell('A2').alignment = { horizontal: 'center' }

      // Header row
      const hdr = ws.getRow(4)
      const hdrValues = ['No', 'Tipe', 'Program / Diklat', 'Induk / UPT', 'Tgt Pst', 'Tgt Lls']
      for (let m = 1; m <= 12; m++) {
        hdrValues.push(`${MONTH_SHORT[m - 1]} Pst`, `${MONTH_SHORT[m - 1]} Lls`)
      }
      hdrValues.push('Tot Pst L', 'Tot Pst P', 'Total Peserta', 'Tot Lls L', 'Tot Lls P', 'Total Lulusan', 'UPT')
      hdr.values = hdrValues
      hdr.eachCell((c) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F172A' } }
        c.font = { color: { argb: 'FFFFFF' }, bold: true, size: 8 }
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      })
      hdr.height = 22

      let r = 5
      let noCounter = 1
      programs.forEach((p) => {
        const isParent = p.isParent
        const row = ws.getRow(r++)
        const rowVals = [
          isParent ? '' : noCounter++,
          isParent ? 'INDUK' : 'TURUNAN',
          p.programName,
          isParent ? '—' : p.parentName || '—',
          p.totalTargetPeserta || 0,
          p.totalTargetLulusan || 0,
        ]
        for (let m = 1; m <= 12; m++) {
          rowVals.push(p.monthly?.[m]?.totalPeserta || 0)
          rowVals.push(p.monthly?.[m]?.totalLulusan || 0)
        }
        rowVals.push(
          p.totalPesertaL || 0,
          p.totalPesertaP || 0,
          p.totalPeserta || 0,
          p.totalLulusanL || 0,
          p.totalLulusanP || 0,
          p.totalLulusan || 0,
          p.uptCount || 0
        )
        row.values = rowVals
        row.eachCell((c, col) => {
          c.font = { size: 8, bold: isParent, color: { argb: isParent ? '0F172A' : '334155' } }
          c.alignment = { horizontal: col === 3 || col === 4 ? 'left' : 'center', vertical: 'middle' }
          if (isParent) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } }
          if (col >= 5) c.numFmt = '#,##0'
        })

        // Rincian diklat di bawah program turunan
        if (!isParent && p.diklats?.length > 0) {
          p.diklats.forEach((d) => {
            const dRow = ws.getRow(r++)
            const dVals = [
              '',
              'DIKLAT',
              `   ↳ ${d.name}`,
              `[${d.uptCode}] ${d.uptName}`,
              d.targetPeserta || 0,
              d.targetLulusan || 0,
            ]
            for (let m = 1; m <= 12; m++) {
              dVals.push(d.monthly?.[m]?.totalPeserta || 0)
              dVals.push(d.monthly?.[m]?.totalLulusan || 0)
            }
            dVals.push(
              d.totalPesertaL || 0,
              d.totalPesertaP || 0,
              d.totalPeserta || 0,
              d.totalLulusanL || 0,
              d.totalLulusanP || 0,
              d.totalLulusan || 0,
              1
            )
            dRow.values = dVals
            dRow.eachCell((c, col) => {
              c.font = { size: 7.5, italic: col === 3, color: { argb: '0369A1' } }
              c.alignment = { horizontal: col === 3 || col === 4 ? 'left' : 'center', vertical: 'middle' }
              c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0F9FF' } }
              if (col >= 5) c.numFmt = '#,##0'
            })
          })
        }
      })

      // Total Row
      const totRow = ws.getRow(r)
      const totVals = ['TOTAL', '', '', '', filteredSummary.totalTargetPeserta, filteredSummary.totalTargetLulusan]
      for (let m = 1; m <= 12; m++) {
        const mTotPeserta = programs.filter((p) => !p.isParent).reduce((s, p) => s + (p.monthly?.[m]?.totalPeserta || 0), 0)
        const mTotLulusan = programs.filter((p) => !p.isParent).reduce((s, p) => s + (p.monthly?.[m]?.totalLulusan || 0), 0)
        totVals.push(mTotPeserta, mTotLulusan)
      }
      totVals.push(
        filteredSummary.totalPesertaL,
        filteredSummary.totalPesertaP,
        filteredSummary.totalPeserta,
        filteredSummary.totalLulusanL,
        filteredSummary.totalLulusanP,
        filteredSummary.totalLulusan,
        ''
      )
      totRow.values = totVals
      totRow.eachCell((c) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F59E0B' } }
        c.font = { color: { argb: '0F172A' }, bold: true, size: 8 }
        c.alignment = { horizontal: 'center', vertical: 'middle' }
        c.numFmt = '#,##0'
      })
      totRow.getCell(1).alignment = { horizontal: 'right' }
      ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 4 }]
    } else {
      // Setup kolom untuk 1 Bulan spesifik
      ws.columns = [
        { header: 'No', key: 'no', width: 6 },
        { header: 'Tipe', key: 'type', width: 10 },
        { header: 'Program / Diklat', key: 'name', width: 36 },
        { header: 'Induk / UPT', key: 'upt', width: 26 },
        { header: 'Kategori', key: 'cat', width: 12 },
        { header: 'Tgt Peserta', key: 'tp', width: 12 },
        { header: 'Tgt Lulusan', key: 'tl', width: 12 },
        { header: 'Peserta L', key: 'pl', width: 10 },
        { header: 'Peserta P', key: 'pp', width: 10 },
        { header: 'Total Peserta', key: 'tot_p', width: 13 },
        { header: 'Lulusan L', key: 'll', width: 10 },
        { header: 'Lulusan P', key: 'lp', width: 10 },
        { header: 'Total Lulusan', key: 'tot_l', width: 13 },
        { header: 'UPT', key: 'upt_count', width: 8 },
      ]

      ws.mergeCells('A1:N1')
      ws.getCell('A1').value = title
      ws.getCell('A1').font = { size: 12, bold: true, color: { argb: '0F172A' } }
      ws.getCell('A1').alignment = { horizontal: 'center' }
      ws.getRow(1).height = 24

      ws.mergeCells('A2:N2')
      ws.getCell('A2').value = subTitle
      ws.getCell('A2').font = { size: 9, color: { argb: '64748B' } }
      ws.getCell('A2').alignment = { horizontal: 'center' }

      const hdr = ws.getRow(4)
      hdr.values = ['No', 'Tipe', 'Program / Diklat', 'Induk / UPT', 'Kategori', 'Tgt Peserta', 'Tgt Lulusan', 'Peserta L', 'Peserta P', 'Total Peserta', 'Lulusan L', 'Lulusan P', 'Total Lulusan', 'UPT']
      hdr.eachCell((c) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F172A' } }
        c.font = { color: { argb: 'FFFFFF' }, bold: true, size: 8 }
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      })
      hdr.height = 22

      let r = 5
      let noCounter = 1
      programs.forEach((p) => {
        const isParent = p.isParent
        const row = ws.getRow(r++)
        row.values = [
          isParent ? '' : noCounter++,
          isParent ? 'INDUK' : 'TURUNAN',
          p.programName,
          isParent ? '—' : p.parentName || '—',
          p.category || 'taruna',
          p.totalTargetPeserta || 0,
          p.totalTargetLulusan || 0,
          p.totalPesertaL || 0,
          p.totalPesertaP || 0,
          p.totalPeserta || 0,
          p.totalLulusanL || 0,
          p.totalLulusanP || 0,
          p.totalLulusan || 0,
          p.uptCount || 0,
        ]
        row.eachCell((c, col) => {
          c.font = { size: 8, bold: isParent, color: { argb: isParent ? '0F172A' : '334155' } }
          c.alignment = { horizontal: col === 3 || col === 4 ? 'left' : 'center', vertical: 'middle' }
          if (isParent) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } }
          if (col >= 6) c.numFmt = '#,##0'
        })

        if (!isParent && p.diklats?.length > 0) {
          p.diklats.forEach((d) => {
            const dRow = ws.getRow(r++)
            dRow.values = [
              '',
              'DIKLAT',
              `   ↳ ${d.name}`,
              `[${d.uptCode}] ${d.uptName}`,
              'Diklat',
              d.targetPeserta || 0,
              d.targetLulusan || 0,
              d.totalPesertaL || 0,
              d.totalPesertaP || 0,
              d.totalPeserta || 0,
              d.totalLulusanL || 0,
              d.totalLulusanP || 0,
              d.totalLulusan || 0,
              1,
            ]
            dRow.eachCell((c, col) => {
              c.font = { size: 7.5, italic: col === 3, color: { argb: '0369A1' } }
              c.alignment = { horizontal: col === 3 || col === 4 ? 'left' : 'center', vertical: 'middle' }
              c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0F9FF' } }
              if (col >= 6) c.numFmt = '#,##0'
            })
          })
        }
      })

      const totRow = ws.getRow(r)
      totRow.values = [
        'TOTAL', '', '', '', '',
        filteredSummary.totalTargetPeserta,
        filteredSummary.totalTargetLulusan,
        filteredSummary.totalPesertaL,
        filteredSummary.totalPesertaP,
        filteredSummary.totalPeserta,
        filteredSummary.totalLulusanL,
        filteredSummary.totalLulusanP,
        filteredSummary.totalLulusan,
        '',
      ]
      totRow.eachCell((c) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F59E0B' } }
        c.font = { color: { argb: '0F172A' }, bold: true, size: 8 }
        c.alignment = { horizontal: 'center', vertical: 'middle' }
        c.numFmt = '#,##0'
      })
      totRow.getCell(1).alignment = { horizontal: 'right' }
      ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 4 }]
    }

    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    const matraSlug = matra !== 'semua' ? `_${matra}` : ''
    const uptSlug = selUpt ? `_${selUpt.code.replace(/[^\w\-]+/g, '')}` : ''
    a.download = `Detail_Data_Program_${year}${month ? '_' + String(month).padStart(2, '0') : '_Semua_Bulan'}${matraSlug}${uptSlug}.xlsx`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(a.href)
  }

  const hasFilter = matra !== 'semua' || selectedUptId !== '' || month !== '' || category !== 'semua' || search.trim() !== ''
  const handleResetFilter = () => {
    setMonth('')
    setMatra('semua')
    setSelectedUptId('')
    setCategory('semua')
    setSearch('')
  }

  const selectedUptObj = useMemo(() => {
    return uptOptions.find((u) => u.id === selectedUptId)
  }, [uptOptions, selectedUptId])

  const isAllMonthsMode = !month

  return (
    <div className="animate-fadeUp space-y-5 max-w-[1550px] mx-auto pb-10">
      {/* Header Halaman */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Detail Data Program</h1>
            <span className="rounded-full bg-navy-100 text-navy-800 text-[11px] font-black px-2.5 py-0.5">
              Tahun {year}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1 max-w-3xl">
            Rekap terperinci per program turunan dan rincian diklat UPT lintas matra.
            Dilengkapi tabel horizontal bulanan (Januari–Desember) dan filter presisi per matra &amp; UPT.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            className={clsx(
              'btn-secondary !rounded-lg !py-2 !text-xs font-semibold flex items-center gap-1.5 transition-colors',
              showDiklats ? 'bg-cyan-50 border-cyan-300 text-cyan-800 hover:bg-cyan-100' : 'bg-white text-slate-600'
            )}
            onClick={toggleAllDiklats}
            title="Sembunyikan / Tampilkan seluruh baris detail diklat"
          >
            <span className="text-base leading-none">📂</span>
            {showDiklats ? 'Tutup Rincian Diklat' : `Buka Rincian Diklat (${totalDiklatCount})`}
          </button>
          <button type="button" className="btn-secondary !rounded-lg !py-2" onClick={load}>
            <IconRefresh className="h-4 w-4" /> Refresh
          </button>
          <button
            type="button"
            className="btn-primary !rounded-lg !py-2 bg-emerald-600 hover:bg-emerald-700 shadow-sm"
            onClick={handleExportExcel}
            disabled={!programs.length}
          >
            <IconDownload className="h-4 w-4" /> Unduh Excel
          </button>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* Panel Toolbar Filter */}
      <div className="card rounded-xl border border-slate-200 p-4 shadow-sm bg-white">
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <div>
            <label className="form-label !mb-1.5 !text-[11px]">Tahun</label>
            <select className="form-input !py-2 !text-sm" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label !mb-1.5 !text-[11px]">Bulan (Periode)</label>
            <select className="form-input !py-2 !text-sm font-semibold" value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="">Semua Bulan (Jan–Des)</option>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label !mb-1.5 !text-[11px] flex items-center gap-1">
              <IconFilter className="h-3 w-3 text-slate-400" /> Matra
            </label>
            <select
              className="form-input !py-2 !text-sm font-semibold"
              value={matra}
              onChange={(e) => {
                setMatra(e.target.value)
                setSelectedUptId('')
              }}
            >
              {MATRA_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="form-label !mb-1.5 !text-[11px] flex items-center gap-1">
              <IconFilter className="h-3 w-3 text-slate-400" /> Pilih UPT
            </label>
            <select
              className="form-input !py-2 !text-sm font-semibold truncate"
              value={selectedUptId}
              onChange={(e) => setSelectedUptId(e.target.value)}
            >
              <option value="">Semua UPT {matra !== 'semua' ? `(${filteredUptOptions.length})` : `(${uptOptions.length})`}</option>
              {filteredUptOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  [{u.code}] {u.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label !mb-1.5 !text-[11px] flex items-center gap-1">
              <IconFilter className="h-3 w-3 text-slate-400" /> Kategori
            </label>
            <select className="form-input !py-2 !text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORY_FILTER.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label !mb-1.5 !text-[11px]">Cari Program / Diklat</label>
            <div className="relative">
              <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                className="form-input !pl-9 !py-2 !text-sm"
                placeholder="Pola Pembibitan / Avsec..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Bar info filter aktif */}
        {hasFilter && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-slate-400 font-bold uppercase text-[10px]">Filter Aktif:</span>
              {matra !== 'semua' && (
                <span className="rounded-full bg-slate-100 text-slate-700 font-bold px-2 py-0.5 border">
                  Matra: <span className="capitalize text-slate-900">{matra}</span>
                </span>
              )}
              {selectedUptObj && (
                <span className="rounded-full bg-navy-50 text-navy-800 font-bold px-2.5 py-0.5 border border-navy-200">
                  UPT: <span className="text-navy-950 font-black">[{selectedUptObj.code}] {selectedUptObj.name}</span>
                </span>
              )}
              {month ? (
                <span className="rounded-full bg-sky-50 text-sky-700 font-bold px-2 py-0.5 border border-sky-200">
                  Bulan: {MONTHS[Number(month) - 1]}
                </span>
              ) : (
                <span className="rounded-full bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 border border-indigo-200">
                  Mode: Semua Bulan (Jan–Des)
                </span>
              )}
              {category !== 'semua' && (
                <span className="rounded-full bg-amber-50 text-amber-700 font-bold px-2 py-0.5 border border-amber-200">
                  Kategori: <span className="capitalize">{category}</span>
                </span>
              )}
              {search.trim() && (
                <span className="rounded-full bg-slate-100 text-slate-600 font-bold px-2 py-0.5 border">
                  Cari: &ldquo;{search}&rdquo;
                </span>
              )}
            </div>
            <button
              type="button"
              className="text-xs font-bold text-red-600 hover:text-red-700 hover:underline"
              onClick={handleResetFilter}
            >
              Reset Semua Filter
            </button>
          </div>
        )}

        {/* Ringkasan Angka Utama */}
        {summary && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
              <p className="text-[11px] font-bold text-slate-500 uppercase">Total Program &amp; Diklat</p>
              <p className="text-lg font-black text-slate-900">
                {filteredSummary.totalPrograms}{' '}
                <span className="text-xs font-semibold text-slate-500">turunan</span>
                <span className="text-xs text-cyan-700 font-bold ml-2">({totalDiklatCount} diklat)</span>
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Target: {fmtNum(filteredSummary.totalTargetPeserta)} peserta • {fmtNum(filteredSummary.totalTargetLulusan)} lulusan
              </p>
            </div>
            <div className="rounded-xl bg-sky-50 border border-sky-100 p-3">
              <p className="text-[11px] font-bold text-sky-700 uppercase">Peserta (L/P)</p>
              <p className="text-sm font-black text-sky-950">
                {fmtNum(filteredSummary.totalPesertaL)} / {fmtNum(filteredSummary.totalPesertaP)}{' '}
                <span className="text-xs text-sky-600">· {fmtNum(filteredSummary.totalPeserta)} total</span>
              </p>
              <p className="text-[11px] text-sky-700 mt-0.5">
                Capaian: {filteredSummary.totalTargetPeserta > 0 ? ((filteredSummary.totalPeserta / filteredSummary.totalTargetPeserta) * 100).toFixed(1) : 0}% dari target
              </p>
            </div>
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
              <p className="text-[11px] font-bold text-emerald-700 uppercase">Lulusan (L/P)</p>
              <p className="text-sm font-black text-emerald-950">
                {fmtNum(filteredSummary.totalLulusanL)} / {fmtNum(filteredSummary.totalLulusanP)}{' '}
                <span className="text-xs text-emerald-600">· {fmtNum(filteredSummary.totalLulusan)} total</span>
              </p>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                Capaian: {filteredSummary.totalTargetLulusan > 0 ? ((filteredSummary.totalLulusan / filteredSummary.totalTargetLulusan) * 100).toFixed(1) : 0}% dari target
              </p>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
              <p className="text-[11px] font-bold text-amber-700 uppercase">
                {selectedUptObj ? 'UPT Terpilih' : matra !== 'semua' ? 'Matra Terpilih' : 'Cakupan Matra'}
              </p>
              <p className="text-xs font-black text-slate-900 mt-0.5 truncate" title={selectedUptObj ? `[${selectedUptObj.code}] ${selectedUptObj.name}` : matra !== 'semua' ? `Matra ${matra.toUpperCase()}` : 'Darat · Laut · Udara · Aparatur'}>
                {selectedUptObj ? `[${selectedUptObj.code}] ${selectedUptObj.name}` : matra !== 'semua' ? `Matra ${matra.toUpperCase()}` : 'Darat · Laut · Udara · Aparatur'}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {selectedUptObj ? `Matra ${selectedUptObj.matra || '-'}` : matra !== 'semua' ? `${filteredUptOptions.length} UPT pada matra ini` : 'Semua UPT terakumulasi'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Tabel Detail Program & Diklat */}
      <div className="card overflow-hidden rounded-xl border border-slate-200 shadow-sm bg-white">
        <div className="px-4 py-3 flex flex-wrap items-center justify-between border-b bg-slate-50/80 gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {isAllMonthsMode
                ? `Rekap Bulanan (Januari–Desember) — Tahun ${year}`
                : `Rekap Program &amp; Diklat — ${data?.monthName || 'Bulan ' + month} ${year}`}
            </h3>
            {isAllMonthsMode && (
              <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                <span>👉 Geser tabel ke kanan untuk melihat rincian setiap bulan (Januari s/d Desember). Kolom Program tetap beku di sisi kiri.</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600 bg-white border px-2.5 py-1 rounded-full shadow-xs">
              {programs.filter((p) => !p.isParent).length} program turunan
            </span>
            <span className="text-xs font-bold text-cyan-800 bg-cyan-50 border border-cyan-200 px-2.5 py-1 rounded-full shadow-xs">
              {totalDiklatCount} diklat
            </span>
          </div>
        </div>

        {loading ? (
          <div className="p-4"><SkeletonRows rows={8} /></div>
        ) : programs.length === 0 ? (
          <EmptyState icon={<IconLayers className="h-6 w-6" />} title="Tidak ada data" desc="Tidak ada program atau diklat untuk filter terpilih." />
        ) : (
          <div className="overflow-x-auto relative">
            <table className="w-full text-sm border-collapse">
              <thead>
                {isAllMonthsMode ? (
                  /* HEADER MODE SEMUA BULAN (12 BULAN) */
                  <>
                    <tr className="bg-slate-100 text-slate-800 border-b text-[11px] font-bold uppercase tracking-wider">
                      <th className="sticky left-0 bg-slate-100 z-30 px-4 py-2.5 text-left min-w-[300px] border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]">
                        Program &amp; Rincian Diklat
                      </th>
                      <th className="px-3 py-2.5 text-center min-w-[110px] border-r">Kategori / UPT</th>
                      <th colSpan={2} className="px-2 py-2 text-center bg-slate-200/80 border-r text-slate-800">
                        Target Tahunan
                      </th>
                      {/* 12 Bulan */}
                      {MONTH_SHORT.map((mShort, idx) => (
                        <th
                          key={mShort}
                          colSpan={2}
                          className={clsx(
                            'px-2 py-2 text-center border-r font-black',
                            idx % 2 === 0 ? 'bg-sky-50/80 text-sky-900' : 'bg-slate-50 text-slate-800'
                          )}
                        >
                          {mShort}
                        </th>
                      ))}
                      {/* Total Realisasi Tahunan */}
                      <th colSpan={3} className="px-2 py-2 text-center bg-sky-100 text-sky-950 border-r">
                        Total Peserta
                      </th>
                      <th colSpan={3} className="px-2 py-2 text-center bg-emerald-100 text-emerald-950 border-r">
                        Total Lulusan
                      </th>
                      <th className="px-3 py-2.5 text-center min-w-[65px]">UPT</th>
                    </tr>
                    <tr className="bg-slate-50 text-slate-600 border-b text-[10px] font-semibold">
                      <th className="sticky left-0 bg-slate-50 z-30 px-4 py-2 text-left border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]">
                        Nama Program / Diklat
                      </th>
                      <th className="px-3 py-2 text-center border-r">Jenis</th>
                      <th className="px-2 py-2 text-right bg-slate-100 text-slate-700">Pst</th>
                      <th className="px-2 py-2 text-right bg-slate-100 text-slate-700 border-r">Lls</th>
                      {/* 12 Bulan subheader */}
                      {MONTH_SHORT.map((mShort, idx) => (
                        <Fragment key={mShort}>
                          <th className={clsx('px-1.5 py-1.5 text-right w-[46px]', idx % 2 === 0 ? 'bg-sky-50/50 text-sky-700' : 'bg-slate-50/50')}>
                            Pst
                          </th>
                          <th className={clsx('px-1.5 py-1.5 text-right w-[46px] border-r', idx % 2 === 0 ? 'bg-sky-50/50 text-emerald-700' : 'bg-slate-50/50 text-emerald-700')}>
                            Lls
                          </th>
                        </Fragment>
                      ))}
                      {/* Total Peserta L / P / Tot */}
                      <th className="px-2 py-2 text-right bg-sky-50 text-sky-800">L</th>
                      <th className="px-2 py-2 text-right bg-sky-50 text-sky-800">P</th>
                      <th className="px-2 py-2 text-right bg-sky-100 font-bold text-sky-950 border-r">Tot</th>
                      {/* Total Lulusan L / P / Tot */}
                      <th className="px-2 py-2 text-right bg-emerald-50 text-emerald-800">L</th>
                      <th className="px-2 py-2 text-right bg-emerald-50 text-emerald-800">P</th>
                      <th className="px-2 py-2 text-right bg-emerald-100 font-bold text-emerald-950 border-r">Tot</th>
                      <th className="px-2 py-2 text-center">Jml</th>
                    </tr>
                  </>
                ) : (
                  /* HEADER MODE BULAN SPESIFIK */
                  <>
                    <tr className="bg-slate-100 text-slate-800 border-b text-[11px] font-bold uppercase tracking-wider">
                      <th className="sticky left-0 bg-slate-100 z-30 px-4 py-2.5 text-left min-w-[320px] border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]">
                        Program &amp; Rincian Diklat
                      </th>
                      <th className="px-3 py-2.5 text-center min-w-[130px] border-r">Kategori / UPT</th>
                      <th colSpan={2} className="px-2 py-2 text-center bg-slate-200/80 border-r text-slate-800">
                        Target Bulan Ini
                      </th>
                      <th colSpan={3} className="px-2 py-2 text-center bg-sky-50 text-sky-900 border-r">
                        Realisasi Peserta
                      </th>
                      <th colSpan={3} className="px-2 py-2 text-center bg-emerald-50 text-emerald-900 border-r">
                        Realisasi Lulusan
                      </th>
                      <th className="px-3 py-2.5 text-center min-w-[70px]">UPT</th>
                    </tr>
                    <tr className="bg-slate-50 text-slate-600 border-b text-[10px] font-semibold">
                      <th className="sticky left-0 bg-slate-50 z-30 px-4 py-2 text-left border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]">
                        Nama Program / Diklat
                      </th>
                      <th className="px-3 py-2 text-center border-r">Jenis</th>
                      <th className="px-2 py-2 text-right bg-slate-100 text-slate-700">Pst</th>
                      <th className="px-2 py-2 text-right bg-slate-100 text-slate-700 border-r">Lls</th>
                      <th className="px-2 py-2 text-right bg-sky-50/50">L</th>
                      <th className="px-2 py-2 text-right bg-sky-50/50">P</th>
                      <th className="px-2 py-2 text-right bg-sky-100 font-bold text-sky-950 border-r">Total</th>
                      <th className="px-2 py-2 text-right bg-emerald-50/50">L</th>
                      <th className="px-2 py-2 text-right bg-emerald-50/50">P</th>
                      <th className="px-2 py-2 text-right bg-emerald-100 font-bold text-emerald-950 border-r">Total</th>
                      <th className="px-2 py-2 text-center">Jml</th>
                    </tr>
                  </>
                )}
              </thead>

              <tbody className="divide-y divide-slate-100 text-xs">
                {programs.map((p) => {
                  const isParent = p.isParent
                  const hasDiklats = !isParent && p.diklats && p.diklats.length > 0
                  const isCollapsed = collapsedProgs.has(p.programId)
                  const shouldRenderDiklats = showDiklats && hasDiklats && !isCollapsed

                  return (
                    <Fragment key={p.programId}>
                      {/* BARIS PROGRAM (INDUK ATAU TURUNAN) */}
                      <tr
                        className={clsx(
                          'transition-colors',
                          isParent
                            ? 'bg-slate-100/90 font-bold border-t-2 border-slate-300 text-slate-900'
                            : 'hover:bg-slate-50/80 bg-white'
                        )}
                      >
                        {/* Kolom Nama Program (Sticky) */}
                        <td
                          className={clsx(
                            'sticky left-0 z-20 px-4 py-2.5 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]',
                            isParent ? 'bg-slate-100 font-black' : 'bg-white'
                          )}
                        >
                          <div className="flex items-center gap-1.5">
                            {hasDiklats ? (
                              <button
                                type="button"
                                className="p-0.5 rounded hover:bg-slate-200 text-slate-500 transition-colors shrink-0"
                                onClick={() => toggleProgCollapse(p.programId)}
                                title={isCollapsed ? 'Buka rincian diklat' : 'Tutup rincian diklat'}
                              >
                                {isCollapsed ? <IconChevronRight className="h-4 w-4" /> : <IconChevronDown className="h-4 w-4" />}
                              </button>
                            ) : isParent ? (
                              <span className="text-slate-400 text-sm shrink-0">📁</span>
                            ) : (
                              <span className="w-4 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className={clsx('truncate leading-tight', isParent ? 'text-xs text-slate-950 font-black uppercase' : 'text-xs font-bold text-slate-900')}>
                                {p.programName}
                              </p>
                              <div className="flex flex-wrap items-center gap-1 mt-0.5">
                                {isParent ? (
                                  <span className="text-[10px] text-slate-500 font-normal">
                                    Program Induk • {p.diklatCount || 0} diklat
                                  </span>
                                ) : (
                                  <>
                                    <span
                                      className={clsx(
                                        'rounded-full px-1.5 py-0.2 text-[9px] font-bold capitalize',
                                        (p.targetGroup || p.category) === 'aparatur'
                                          ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                                          : 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'
                                      )}
                                    >
                                      {p.targetGroup || p.category || 'taruna'}
                                    </span>
                                    {hasDiklats && (
                                      <span className="rounded-full bg-cyan-50 text-cyan-800 ring-1 ring-cyan-200 text-[9px] font-black px-1.5 py-0.2">
                                        {p.diklats.length} Diklat
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Kolom Kategori / Induk */}
                        <td className="px-3 py-2 text-center border-r text-slate-600 truncate" title={isParent ? 'Program Induk' : p.parentName}>
                          {isParent ? (
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">INDUK</span>
                          ) : (
                            <span className="text-[11px] font-medium text-slate-700">{p.parentName || '—'}</span>
                          )}
                        </td>

                        {/* Target Tahunan (Pst / Lls) */}
                        <td className="px-2 py-2 text-right tabular-nums text-slate-700 font-semibold bg-slate-50/50">
                          {p.totalTargetPeserta ? fmtNum(p.totalTargetPeserta) : <span className="text-slate-300">-</span>}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-700 font-semibold bg-slate-50/50 border-r">
                          {p.totalTargetLulusan ? fmtNum(p.totalTargetLulusan) : <span className="text-slate-300">-</span>}
                        </td>

                        {/* MODE SEMUA BULAN: 12 Bulan (Pst & Lls) */}
                        {isAllMonthsMode && (
                          <>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((mNum) => {
                              const mData = p.monthly?.[mNum]
                              const pTot = mData?.totalPeserta || 0
                              const lTot = mData?.totalLulusan || 0
                              return (
                                <Fragment key={mNum}>
                                  <td className="px-1.5 py-2 text-right tabular-nums text-[11px]">
                                    {pTot > 0 ? (
                                      <span className="font-bold text-sky-900">{fmtNum(pTot)}</span>
                                    ) : (
                                      <span className="text-slate-300">-</span>
                                    )}
                                  </td>
                                  <td className="px-1.5 py-2 text-right tabular-nums text-[11px] border-r">
                                    {lTot > 0 ? (
                                      <span className="font-bold text-emerald-900">{fmtNum(lTot)}</span>
                                    ) : (
                                      <span className="text-slate-300">-</span>
                                    )}
                                  </td>
                                </Fragment>
                              )
                            })}
                          </>
                        )}

                        {/* Realisasi Peserta (L / P / Tot) */}
                        <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                          {p.totalPesertaL ? fmtNum(p.totalPesertaL) : <span className="text-slate-300">-</span>}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                          {p.totalPesertaP ? fmtNum(p.totalPesertaP) : <span className="text-slate-300">-</span>}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums font-black text-sky-950 bg-sky-50/50 border-r">
                          {p.totalPeserta ? fmtNum(p.totalPeserta) : <span className="text-slate-300">0</span>}
                        </td>

                        {/* Realisasi Lulusan (L / P / Tot) */}
                        <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                          {p.totalLulusanL ? fmtNum(p.totalLulusanL) : <span className="text-slate-300">-</span>}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                          {p.totalLulusanP ? fmtNum(p.totalLulusanP) : <span className="text-slate-300">-</span>}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums font-black text-emerald-950 bg-emerald-50/50 border-r">
                          {p.totalLulusan ? fmtNum(p.totalLulusan) : <span className="text-slate-300">0</span>}
                        </td>

                        {/* UPT Count */}
                        <td className="px-2 py-2 text-center">
                          <span className="inline-flex items-center justify-center rounded-full bg-slate-800 text-white text-[10px] font-bold px-2 py-0.5">
                            {p.uptCount || 0}
                          </span>
                        </td>
                      </tr>

                      {/* BARIS DETAIL DIKLAT (ANAK DARI PROGRAM TURUNAN) */}
                      {shouldRenderDiklats &&
                        p.diklats.map((d) => (
                          <tr key={d.id} className="bg-cyan-50/20 hover:bg-cyan-50/50 transition-colors border-l-2 border-l-cyan-400">
                            {/* Kolom Nama Diklat (Sticky) */}
                            <td className="sticky left-0 z-20 px-4 py-2 border-r bg-cyan-50/30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]">
                              <div className="pl-6 flex items-start gap-1.5">
                                <span className="text-cyan-600 font-bold text-xs mt-0.5">↳</span>
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-slate-800 leading-tight truncate" title={d.name}>
                                    {d.name}
                                  </p>
                                  <p className="text-[10px] text-cyan-800 font-medium truncate mt-0.5" title={`[${d.uptCode}] ${d.uptName}`}>
                                    [{d.uptCode}] {d.uptName}
                                  </p>
                                </div>
                              </div>
                            </td>

                            {/* Kolom UPT Badge */}
                            <td className="px-3 py-2 text-center border-r text-cyan-900">
                              <span className="rounded bg-white border border-cyan-200 px-1.5 py-0.5 text-[9px] font-black text-cyan-800 uppercase">
                                {d.uptCode || 'UPT'}
                              </span>
                            </td>

                            {/* Target Peserta & Lulusan Diklat */}
                            <td className="px-2 py-2 text-right tabular-nums text-slate-500 text-[11px]">
                              {d.targetPeserta ? fmtNum(d.targetPeserta) : <span className="text-slate-300">-</span>}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-slate-500 text-[11px] border-r">
                              {d.targetLulusan ? fmtNum(d.targetLulusan) : <span className="text-slate-300">-</span>}
                            </td>

                            {/* MODE SEMUA BULAN: 12 Bulan Diklat (Pst & Lls) */}
                            {isAllMonthsMode && (
                              <>
                                {Array.from({ length: 12 }, (_, i) => i + 1).map((mNum) => {
                                  const dm = d.monthly?.[mNum]
                                  const dPst = dm?.totalPeserta || 0
                                  const dLls = dm?.totalLulusan || 0
                                  return (
                                    <Fragment key={mNum}>
                                      <td className="px-1.5 py-2 text-right tabular-nums text-[10px]">
                                        {dPst > 0 ? (
                                          <span className="font-semibold text-sky-800">{fmtNum(dPst)}</span>
                                        ) : (
                                          <span className="text-slate-200">-</span>
                                        )}
                                      </td>
                                      <td className="px-1.5 py-2 text-right tabular-nums text-[10px] border-r">
                                        {dLls > 0 ? (
                                          <span className="font-semibold text-emerald-800">{fmtNum(dLls)}</span>
                                        ) : (
                                          <span className="text-slate-200">-</span>
                                        )}
                                      </td>
                                    </Fragment>
                                  )
                                })}
                              </>
                            )}

                            {/* Realisasi Peserta Diklat (L / P / Tot) */}
                            <td className="px-2 py-2 text-right tabular-nums text-[11px] text-slate-600">
                              {d.totalPesertaL ? fmtNum(d.totalPesertaL) : <span className="text-slate-200">-</span>}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-[11px] text-slate-600">
                              {d.totalPesertaP ? fmtNum(d.totalPesertaP) : <span className="text-slate-200">-</span>}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums font-bold text-sky-900 bg-sky-50/30 border-r text-[11px]">
                              {d.totalPeserta ? fmtNum(d.totalPeserta) : <span className="text-slate-200">0</span>}
                            </td>

                            {/* Realisasi Lulusan Diklat (L / P / Tot) */}
                            <td className="px-2 py-2 text-right tabular-nums text-[11px] text-slate-600">
                              {d.totalLulusanL ? fmtNum(d.totalLulusanL) : <span className="text-slate-200">-</span>}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-[11px] text-slate-600">
                              {d.totalLulusanP ? fmtNum(d.totalLulusanP) : <span className="text-slate-200">-</span>}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums font-bold text-emerald-900 bg-emerald-50/30 border-r text-[11px]">
                              {d.totalLulusan ? fmtNum(d.totalLulusan) : <span className="text-slate-200">0</span>}
                            </td>

                            {/* UPT Column untuk Diklat */}
                            <td className="px-2 py-2 text-center">
                              <span className="text-[10px] text-slate-400 font-semibold">•</span>
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  )
                })}
              </tbody>

              {/* TFOOTER TOTAL AKUMULASI */}
              <tfoot>
                <tr className="bg-navy-900 text-white font-bold border-t-2 border-navy-950">
                  <td className="sticky left-0 bg-navy-900 z-30 px-4 py-3 text-right text-xs uppercase tracking-wide border-r border-navy-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)]">
                    TOTAL AKUMULASI
                  </td>
                  <td className="px-3 py-3 text-center text-xs text-navy-200 border-r border-navy-800">—</td>
                  <td className="px-2 py-3 text-right tabular-nums text-xs text-amber-300">
                    {fmtNum(filteredSummary.totalTargetPeserta)}
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums text-xs text-amber-300 border-r border-navy-800">
                    {fmtNum(filteredSummary.totalTargetLulusan)}
                  </td>

                  {/* Mode Semua Bulan: Subtotal 12 Bulan */}
                  {isAllMonthsMode && (
                    <>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((mNum) => {
                        const mTotPeserta = programs.filter((p) => !p.isParent).reduce((s, p) => s + (p.monthly?.[mNum]?.totalPeserta || 0), 0)
                        const mTotLulusan = programs.filter((p) => !p.isParent).reduce((s, p) => s + (p.monthly?.[mNum]?.totalLulusan || 0), 0)
                        return (
                          <Fragment key={mNum}>
                            <td className="px-1.5 py-3 text-right tabular-nums text-[10px] text-sky-200">
                              {mTotPeserta > 0 ? fmtNum(mTotPeserta) : '-'}
                            </td>
                            <td className="px-1.5 py-3 text-right tabular-nums text-[10px] text-emerald-200 border-r border-navy-800">
                              {mTotLulusan > 0 ? fmtNum(mTotLulusan) : '-'}
                            </td>
                          </Fragment>
                        )
                      })}
                    </>
                  )}

                  <td className="px-2 py-3 text-right tabular-nums text-xs">{fmtNum(filteredSummary.totalPesertaL)}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-xs">{fmtNum(filteredSummary.totalPesertaP)}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-sm bg-white/10 text-sky-200 border-r border-navy-800">
                    {fmtNum(filteredSummary.totalPeserta)}
                  </td>

                  <td className="px-2 py-3 text-right tabular-nums text-xs">{fmtNum(filteredSummary.totalLulusanL)}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-xs">{fmtNum(filteredSummary.totalLulusanP)}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-sm bg-white/10 text-emerald-200 border-r border-navy-800">
                    {fmtNum(filteredSummary.totalLulusan)}
                  </td>

                  <td className="px-2 py-3 text-center text-xs text-navy-200">—</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
