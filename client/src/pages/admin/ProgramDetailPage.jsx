import { useCallback, useEffect, useMemo, useState } from 'react'
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

export default function ProgramDetailPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('semua')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = { year }
      if (month) params.month = month
      const { data: res } = await api.get('/reports/program-detail', { params })
      setData(res)
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { load() }, [load])

  const programs = useMemo(() => {
    if (!data?.programs) return []
    let list = [...data.programs]
    // Urutan sudah sesuai Master Program dari backend (flat: induk -> turunan by order), jangan sort ulang agar induk tetap di atas turunannya
    if (category !== 'semua') {
      list = list.filter((p) => {
        const tg = (p.targetGroup || p.category || 'semua').toLowerCase()
        // targetGroup='semua' tampil di semua filter, targetGroup spesifik hanya untuk kategorinya
        return tg === category || tg === 'semua'
      })
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((p) => p.programName.toLowerCase().includes(q) || (p.parentName || '').toLowerCase().includes(q))
    }
    return list
  }, [data, category, search])

  const summary = data?.summary
  const filteredSummary = useMemo(() => {
    if (!programs.length) return { totalPrograms: 0, totalPeserta: 0, totalPesertaL: 0, totalPesertaP: 0, totalLulusan: 0, totalLulusanL: 0, totalLulusanP: 0 }
    return {
      totalPrograms: programs.length,
      totalPeserta: programs.reduce((s,p)=>s+(p.totalPeserta||0),0),
      totalPesertaL: programs.reduce((s,p)=>s+(p.totalPesertaL||0),0),
      totalPesertaP: programs.reduce((s,p)=>s+(p.totalPesertaP||0),0),
      totalLulusan: programs.reduce((s,p)=>s+(p.totalLulusan||0),0),
      totalLulusanL: programs.reduce((s,p)=>s+(p.totalLulusanL||0),0),
      totalLulusanP: programs.reduce((s,p)=>s+(p.totalLulusanP||0),0),
    }
  }, [programs])

  const handleExportExcel = async () => {
    if (!programs.length) return
    const ExcelJS = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    wb.creator = 'DASPESLUS'
    const ws = wb.addWorksheet('Detail Program', { properties: { tabColor: { argb: '0F172A' } } })
    ws.columns = [
      { header: 'No', key: 'no', width: 5 },
      { header: 'Program Induk', key: 'parent', width: 28 },
      { header: 'Program Turunan', key: 'prog', width: 36 },
      { header: 'Kategori', key: 'cat', width: 12 },
      { header: 'Peserta L', key: 'pL', width: 12 },
      { header: 'Peserta P', key: 'pP', width: 12 },
      { header: 'Total Peserta', key: 'totPes', width: 14 },
      { header: 'Lulusan L', key: 'lL', width: 12 },
      { header: 'Lulusan P', key: 'lP', width: 12 },
      { header: 'Total Lulusan', key: 'totLul', width: 14 },
      { header: 'UPT', key: 'upt', width: 8 },
    ]
    const title = `REKAP DETAIL DATA PROGRAM — ${data?.monthName ? data.monthName + ' ' : ''}${year}`
    ws.mergeCells('A1:K1')
    ws.getCell('A1').value = title
    ws.getCell('A1').font = { size: 12, bold: true, color: { argb: '0F172A' } }
    ws.getCell('A1').alignment = { horizontal: 'center' }
    ws.getRow(1).height = 22
    ws.mergeCells('A2:K2')
    ws.getCell('A2').value = `BPSDMP Kementerian Perhubungan — ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} (Pure Realisasi)`
    ws.getCell('A2').font = { size: 8, color: { argb: '64748B' } }
    ws.getCell('A2').alignment = { horizontal: 'center' }
    const hdr = ws.getRow(4)
    hdr.values = ['No', 'Program Induk', 'Program Turunan', 'Kategori', 'Peserta L', 'P', 'Total Peserta', 'Lulusan L', 'P', 'Total Lulusan', 'UPT']
    hdr.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F172A' } }
      c.font = { color: { argb: 'FFFFFF' }, bold: true, size: 8 }
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      c.border = { top: { style: 'thin', color: { argb: 'CBD5E1' } }, left: { style: 'thin', color: { argb: 'CBD5E1' } }, bottom: { style: 'thin', color: { argb: 'CBD5E1' } }, right: { style: 'thin', color: { argb: 'CBD5E1' } } }
    })
    hdr.height = 18
    let r = 5
    programs.forEach((p, idx) => {
      const row = ws.getRow(r++)
      row.values = [idx + 1, p.parentName, p.programName, p.category, p.totalPesertaL, p.totalPesertaP, p.totalPeserta, p.totalLulusanL, p.totalLulusanP, p.totalLulusan, p.uptCount]
      row.eachCell((c, col) => {
        c.font = { size: 8, color: { argb: '1E293B' } }
        c.alignment = { horizontal: col === 2 || col === 3 ? 'left' : 'center', vertical: 'middle' }
        c.border = { top: { style: 'thin', color: { argb: 'CBD5E1' } }, left: { style: 'thin', color: { argb: 'CBD5E1' } }, bottom: { style: 'thin', color: { argb: 'CBD5E1' } }, right: { style: 'thin', color: { argb: 'CBD5E1' } } }
        if (col >= 5) c.numFmt = '#,##0'
      })
      if (idx % 2 === 1) row.eachCell((c) => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8FAFC' } })
    })
    const fr = ws.getRow(r)
    fr.values = ['TOTAL', '', '', '', filteredSummary.totalPesertaL, filteredSummary.totalPesertaP, filteredSummary.totalPeserta, filteredSummary.totalLulusanL, filteredSummary.totalLulusanP, filteredSummary.totalLulusan, '']
    fr.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F59E0B' } }
      c.font = { color: { argb: '0F172A' }, bold: true, size: 8 }
      c.alignment = { horizontal: 'center', vertical: 'middle' }
      c.border = { top: { style: 'thin', color: { argb: 'CBD5E1' } }, left: { style: 'thin', color: { argb: 'CBD5E1' } }, bottom: { style: 'thin', color: { argb: 'CBD5E1' } }, right: { style: 'thin', color: { argb: 'CBD5E1' } } }
      c.numFmt = '#,##0'
    })
    fr.getCell(1).value = 'TOTAL'
    fr.getCell(1).alignment = { horizontal: 'right' }
    ws.views = [{ state: 'frozen', ySplit: 4 }]
    ws.autoFilter = { from: 'A4', to: 'M4' }
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `Detail_Data_Program_${year}${month ? '_' + String(month).padStart(2, '0') : ''}.xlsx`
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href)
  }

  return (
    <div className="animate-fadeUp space-y-5 max-w-[1400px] mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Detail Data Program</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-3xl">Rekap per program turunan (mis. <em>Pola Pembibitan</em>) akumulasi dari semua matra — Darat, Laut, Udara, Aparatur. Menampilkan total peserta & lulusan L/P, target, dan sebaran matra.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" className="btn-secondary !rounded-lg !py-2" onClick={load}><IconRefresh className="h-4 w-4" /> Refresh</button>
          <button type="button" className="btn-primary !rounded-lg !py-2 bg-emerald-600 hover:bg-emerald-700" onClick={handleExportExcel} disabled={!programs.length}><IconDownload className="h-4 w-4" /> Excel</button>
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
            <label className="form-label !mb-1.5 !text-[11px] flex items-center gap-1"><IconFilter className="h-3 w-3" /> Kategori</label>
            <select className="form-input !py-2 !text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORY_FILTER.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
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
        {summary && (
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
              <p className="text-[11px] font-bold text-slate-500 uppercase">Total Program</p>
              <p className="text-lg font-black text-slate-900">{programs.length} <span className="text-xs font-normal text-slate-500">/ {summary.totalPrograms}</span></p>
            </div>
            <div className="rounded-xl bg-sky-50 border border-sky-100 p-3">
              <p className="text-[11px] font-bold text-sky-700 uppercase">Peserta (L/P)</p>
              <p className="text-sm font-black text-sky-900">{fmtNum(filteredSummary.totalPesertaL)} / {fmtNum(filteredSummary.totalPesertaP)} <span className="text-xs text-sky-600">· {fmtNum(filteredSummary.totalPeserta)} total</span></p>
              <p className="text-[11px] text-slate-500">{programs.length} program • {fmtNum(filteredSummary.totalPeserta)} peserta</p>
            </div>
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
              <p className="text-[11px] font-bold text-emerald-700 uppercase">Lulusan (L/P)</p>
              <p className="text-sm font-black text-emerald-900">{fmtNum(filteredSummary.totalLulusanL)} / {fmtNum(filteredSummary.totalLulusanP)} <span className="text-xs text-emerald-600">· {fmtNum(filteredSummary.totalLulusan)} total</span></p>
              <p className="text-[11px] text-slate-500">{programs.length} program • {fmtNum(filteredSummary.totalLulusan)} lulusan</p>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
              <p className="text-[11px] font-bold text-amber-700 uppercase">Matra Terbanyak</p>
              <p className="text-xs font-semibold text-slate-800 mt-1">Darat · Laut · Udara · Aparatur</p>
              <p className="text-[11px] text-slate-500">Rincian per matra di tabel</p>
            </div>
          </div>
        )}
      </div>

      <div className="card overflow-hidden rounded-xl border border-slate-200">
        <div className="px-4 py-3 flex items-center justify-between border-b bg-slate-50/50">
          <h3 className="text-sm font-bold text-slate-900">Rekap per Program Turunan — {data?.monthName ? data.monthName + ' ' + year : 'Tahun ' + year}</h3>
          <span className="text-xs font-bold text-slate-500 bg-white border px-2.5 py-1 rounded-full">{programs.length} program</span>
        </div>
        {loading ? <SkeletonRows rows={8} /> : programs.length === 0 ? (
          <EmptyState icon={<IconLayers className="h-6 w-6" />} title="Tidak ada data" desc="Tidak ada program turunan untuk filter terpilih." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '26%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '9%' }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-100/80 border-b">
                  <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase">Program</th>
                  <th className="text-left px-2 py-2.5 text-[11px] font-bold uppercase">Induk</th>
                  <th colSpan={3} className="text-center px-2 py-2 text-[11px] font-bold uppercase text-sky-800 bg-sky-50 border-l">Peserta</th>
                  <th colSpan={3} className="text-center px-2 py-2 text-[11px] font-bold uppercase text-emerald-800 bg-emerald-50 border-l">Lulusan</th>
                  <th className="text-center px-2 py-2.5 text-[11px] font-bold uppercase">UPT</th>
                </tr>
                <tr className="bg-slate-50 border-b">
                  <th className="px-4 py-2 text-[10px] font-semibold text-slate-500">Turunan</th>
                  <th className="px-2 py-2 text-[10px] font-semibold text-slate-500">Kategori</th>
                  <th className="text-center px-2 py-2 text-[10px] font-semibold">L</th>
                  <th className="text-center px-2 py-2 text-[10px] font-semibold">P</th>
                  <th className="text-right px-2 py-2 text-[10px] font-bold bg-slate-100">Total</th>
                  <th className="text-center px-2 py-2 text-[10px] font-semibold">L</th>
                  <th className="text-center px-2 py-2 text-[10px] font-semibold">P</th>
                  <th className="text-right px-2 py-2 text-[10px] font-bold bg-slate-100">Total</th>
                  <th className="text-center px-2 py-2 text-[10px] font-semibold">Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {programs.map((p) => (
                  <tr key={p.programId} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <p className="text-xs font-bold text-slate-900 leading-tight">{p.programName}</p>
                      <span className={clsx('inline-flex mt-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold capitalize', (p.targetGroup || p.category) === 'aparatur' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' : 'bg-sky-50 text-sky-700 ring-1 ring-sky-200')}>{p.targetGroup || p.category}</span>
                    </td>
                    <td className="px-2 py-2.5 text-xs text-slate-600 truncate" title={p.parentName}>{p.parentName}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums text-xs font-semibold">{fmtNum(p.totalPesertaL)}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums text-xs font-semibold">{fmtNum(p.totalPesertaP)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-xs font-black bg-slate-50">{fmtNum(p.totalPeserta)}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums text-xs font-semibold border-l">{fmtNum(p.totalLulusanL)}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums text-xs font-semibold">{fmtNum(p.totalLulusanP)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-xs font-black bg-slate-50">{fmtNum(p.totalLulusan)}</td>
                    <td className="px-2 py-2.5 text-center">
                      <span className="inline-flex items-center justify-center rounded-full bg-navy-900 text-white text-[11px] font-bold px-2 py-1 min-w-[28px]">{p.uptCount}</span>
                      <div className="flex justify-center gap-1 mt-1">
                        {['darat','laut','udara','aparatur'].map((m) => {
                          const v = p.matra[m]
                          if (!v || (v.pesertaL+v.pesertaP+v.lulusanL+v.lulusanP===0 && v.targetPeserta+v.targetLulusan===0)) return null
                          return <span key={m} className="h-1.5 w-1.5 rounded-full" style={{ background: m==='darat'?'#059669':m==='laut'?'#0284C7':m==='udara'?'#7C3AED':'#D97706' }} title={`${m}: ${v.pesertaL+v.pesertaP}/${v.lulusanL+v.lulusanP}`} />
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-navy-900 text-white font-bold">
                  <td colSpan={2} className="px-4 py-3 text-right text-xs uppercase tracking-wide">TOTAL</td>
                  <td className="px-2 py-3 text-center tabular-nums text-xs">{fmtNum(filteredSummary.totalPesertaL)}</td>
                  <td className="px-2 py-3 text-center tabular-nums text-xs">{fmtNum(filteredSummary.totalPesertaP)}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-sm bg-white/10">{fmtNum(filteredSummary.totalPeserta)}</td>
                  <td className="px-2 py-3 text-center tabular-nums text-xs border-l border-white/10">{fmtNum(filteredSummary.totalLulusanL)}</td>
                  <td className="px-2 py-3 text-center tabular-nums text-xs">{fmtNum(filteredSummary.totalLulusanP)}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-sm bg-white/10">{fmtNum(filteredSummary.totalLulusan)}</td>
                  <td className="px-2 py-3 text-center">—</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
