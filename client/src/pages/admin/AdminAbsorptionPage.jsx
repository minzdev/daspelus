import React, { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import api, { apiError } from '../../lib/api'
import { Alert, EmptyState, SkeletonRows } from '../../components/ui'
import {
  IconGraduation, IconDownload, IconFileText, IconChevronDown, IconBuilding, IconSearch, IconEye, IconPlus,
} from '../../components/icons'
import logoBpsdm from '../../assets/logo-bpsdm.png'
import { yearOptions, fmtNum, MONTHS } from '../../utils/format'
import AbsorptionReportView from '../../components/AbsorptionReportView'
import ExcelJS from 'exceljs'
import { useToast } from '../../components/Toast'

export default function AdminAbsorptionPage() {
  const { user } = useAuth()
  const toast = useToast()
  const isPusbang = user?.role === 'PUSBANG'

  // Tab View Mode: 'rekap' (Rekapitulasi Nasional) vs 'detail_upt' (Laporan Rinci per UPT dengan Nama Taruna)
  const [activeTab, setActiveTab] = useState('rekap')

  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState('all')
  const periodLabel = month === 'all' ? 'Semua Bulan' : `Bulan ${MONTHS[Number(month) - 1]}`

  // Rekap State
  const [filterMatra, setFilterMatra] = useState('all')
  const [searchUpt, setSearchUpt] = useState('')
  const [rekapData, setRekapData] = useState(null)
  const [loadingRekap, setLoadingRekap] = useState(true)
  const [errorRekap, setErrorRekap] = useState('')
  const [exportingExcel, setExportingExcel] = useState(false)

  // Detail UPT State
  const [selectedUptId, setSelectedUptId] = useState('')
  const [uptDetailData, setUptDetailData] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [errorDetail, setErrorDetail] = useState('')

  // Load Rekap Data
  const loadRekap = useCallback(async () => {
    setLoadingRekap(true)
    setErrorRekap('')
    try {
      const params = { year }
      if (month !== 'all' && month !== '') params.month = month
      const { data: res } = await api.get('/absorptions/all', { params })
      setRekapData(res)

      // Set default selected UPT if empty
      if (!selectedUptId && res.upts?.length > 0) {
        setSelectedUptId(res.upts[0].uptId)
      }
    } catch (err) {
      setErrorRekap(apiError(err))
    } finally {
      setLoadingRekap(false)
    }
  }, [year, month, selectedUptId])

  // Load Specific UPT Detail with Taruna Names
  const loadUptDetail = useCallback(async (uptIdToLoad) => {
    const targetUptId = uptIdToLoad || selectedUptId
    if (!targetUptId) return
    setLoadingDetail(true)
    setErrorDetail('')
    try {
      const params = { uptId: targetUptId, year }
      if (month !== 'all') params.month = month
      const { data: res } = await api.get('/absorptions/my', { params })
      setUptDetailData(res)
    } catch (err) {
      setErrorDetail(apiError(err))
    } finally {
      setLoadingDetail(false)
    }
  }, [selectedUptId, year, month])

  useEffect(() => {
    loadRekap()
  }, [loadRekap])

  useEffect(() => {
    if (activeTab === 'detail_upt' && selectedUptId) {
      loadUptDetail(selectedUptId)
    }
  }, [activeTab, selectedUptId, loadUptDetail])

  // Filter list UPT untuk tab rekap
  const uptList = (rekapData?.upts || []).filter((u) => {
    if (filterMatra !== 'all' && (u.matra || '').toLowerCase() !== filterMatra.toLowerCase()) return false
    if (searchUpt.trim()) {
      const q = searchUpt.trim().toLowerCase()
      return (u.uptName || '').toLowerCase().includes(q) || (u.uptCode || '').toLowerCase().includes(q)
    }
    return true
  })

  const summary = rekapData?.summary || {
    totalPns: 0, totalPpnpn: 0, totalBumn: 0, totalSwasta: 0,
    totalBelumBekerja: 0, totalBekerja: 0, totalLulusan: 0, pct: 0,
  }



  // Export Rekap Excel
  const handleExportExcelRekap = async () => {
    if (!rekapData) return
    setExportingExcel(true)
    try {
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Rekap_Penyerapan_Nasional')
      ws.views = [{ showGridLines: true }]

      ws.addRow(['KEMENTERIAN PERHUBUNGAN'])
      ws.addRow(['BADAN PENGEMBANGAN SUMBER DAYA MANUSIA PERHUBUNGAN'])
      ws.addRow([`REKAPITULASI PENYERAPAN LULUSAN ${month !== 'all' ? `BULAN ${MONTHS[Number(month) - 1].toUpperCase()}` : 'TAHUNAN'} ${year}`])
      ws.addRow([])

      const h1 = ws.addRow([
        'NO', 'NAMA UPT', 'MATRA', 'PEMERINTAH (PNS)', 'PEMERINTAH (PPNPN)', 'NON PEM (BUMN)', 'NON PEM (SWASTA)',
        'BELUM BEKERJA', 'TOTAL BEKERJA', 'TOTAL LULUSAN', 'PERSENTASE (%)',
      ])
      h1.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
      h1.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      })

      uptList.forEach((u, i) => {
        const row = ws.addRow([
          i + 1,
          u.uptName,
          (u.matra || '').toUpperCase(),
          u.pns,
          u.ppnpn,
          u.bumn,
          u.swasta,
          u.belumBekerja,
          u.totalBekerja,
          u.totalLulusan,
          u.totalLulusan > 0 ? u.pct / 100 : 0,
        ])
        row.font = { name: 'Calibri', size: 9 }
        row.eachCell((cell, idx) => {
          if (idx === 11) cell.numFmt = '0%'
        })
      })

      const foot = ws.addRow([
        '', 'TOTAL NASIONAL', '', summary.totalPns, summary.totalPpnpn, summary.totalBumn, summary.totalSwasta,
        summary.totalBelumBekerja, summary.totalBekerja, summary.totalLulusan, summary.totalLulusan > 0 ? summary.pct / 100 : 0,
      ])
      foot.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
      foot.eachCell((cell, idx) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
        if (idx === 11) cell.numFmt = '0%'
      })

      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `Rekap_Penyerapan_Nasional_${month !== 'all' ? `Bulan${month}_` : ''}${year}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (err) {
      console.error(err)
    } finally {
      setExportingExcel(false)
    }
  }

  const selectedUptObj = (rekapData?.upts || []).find((u) => u.uptId === selectedUptId)

  return (
    <div className="animate-fadeUp space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-navy-950 via-navy-900 to-navy-950 px-5 py-4 text-white shadow-md border border-navy-800">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 p-1.5 shadow-inner border border-white/15" style={{ width: '40px', height: '40px' }}>
              <img src={logoBpsdm} alt="Logo BPSDMP" className="h-full w-full object-contain max-h-7 max-w-7" onError={(e) => (e.target.style.display = 'none')} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-white tracking-tight">
                  {isPusbang ? 'Data Penyerapan Lulusan Matra' : 'Data Penyerapan Lulusan'}
                </h1>
                <span className="rounded-full text-[10px] font-extrabold px-2.5 py-0.5 border bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                  Tahun {year}
                </span>
              </div>
              <p className="text-xs text-navy-200 mt-0.5 max-w-xl">
                {isPusbang
                  ? `Pelaporan & evaluasi penyerapan lulusan taruna UPT Matra ${(user?.pusbangMatra || '').toUpperCase()}.`
                  : 'Pelaporan & rekapitulasi data penyerapan lulusan taruna BPSDM Perhubungan.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Filter Tahun */}
            <div className="relative">
              <select
                className="appearance-none cursor-pointer bg-white/10 hover:bg-white/15 border border-white/20 text-white font-extrabold text-xs rounded-xl py-2 pl-3 pr-8 shadow-sm backdrop-blur-md transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {yearOptions().map((y) => (
                  <option key={y} value={y} className="bg-navy-900 text-white font-bold py-1">Tahun {y}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-emerald-300">
                <IconChevronDown className="h-3.5 w-3.5" />
              </div>
            </div>

            {/* Filter Bulan */}
            <div className="relative">
              <select
                className="appearance-none cursor-pointer bg-white/10 hover:bg-white/15 border border-white/20 text-white font-extrabold text-xs rounded-xl py-2 pl-3 pr-8 shadow-sm backdrop-blur-md transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400"
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
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-emerald-300">
                <IconChevronDown className="h-3.5 w-3.5" />
              </div>
            </div>

            {activeTab === 'rekap' && (
              <button
                type="button"
                className="btn-primary !bg-emerald-600 hover:!bg-emerald-700 text-white text-xs !py-2 !px-3.5 rounded-xl shadow font-bold flex items-center gap-1.5"
                onClick={handleExportExcelRekap}
                disabled={!rekapData || loadingRekap || exportingExcel}
              >
                <IconFileText className="h-4 w-4" />
                <span>{exportingExcel ? 'Memproses...' : 'Ekspor Rekap'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Switcher Navigation */}
        <div className="mt-5 flex items-center gap-2 border-t border-white/10 pt-3">
          <button
            type="button"
            className={`text-xs font-extrabold px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
              activeTab === 'rekap'
                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                : 'text-navy-200 hover:text-white hover:bg-white/10'
            }`}
            onClick={() => setActiveTab('rekap')}
          >
            <IconBuilding className="h-3.5 w-3.5" />
            <span>Rekapitulasi Nasional per UPT</span>
          </button>

          <button
            type="button"
            className={`text-xs font-extrabold px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
              activeTab === 'detail_upt'
                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                : 'text-navy-200 hover:text-white hover:bg-white/10'
            }`}
            onClick={() => setActiveTab('detail_upt')}
          >
            <IconEye className="h-3.5 w-3.5" />
            <span>Laporan Detail per UPT (dengan Nama Taruna)</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: REKAPITULASI NASIONAL PER UPT */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'rekap' && (
        <div className="space-y-6">
          {errorRekap && <Alert type="error">{errorRekap}</Alert>}

          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card p-4 border-surface-border">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-navy-400">Total Bekerja Nasional</span>
              <p className="text-2xl font-black text-navy-950 tabular-nums mt-0.5">{fmtNum(summary.totalBekerja)}</p>
              <p className="text-[10px] text-navy-500 font-semibold mt-0.5">
                PNS/PPNPN: {fmtNum(summary.totalPns + summary.totalPpnpn)} · Non-Pem: {fmtNum(summary.totalBumn + summary.totalSwasta)}
              </p>
            </div>

            <div className="card p-4 border-surface-border">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-navy-400">Total Lulusan</span>
              <p className="text-2xl font-black text-navy-900 tabular-nums mt-0.5">{fmtNum(summary.totalLulusan)}</p>
              <p className="text-[10px] text-navy-500 font-semibold mt-0.5">Akumulasi seluruh UPT</p>
            </div>

            <div className="card p-4 border-surface-border">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600">Belum Bekerja</span>
              <p className="text-2xl font-black text-amber-700 tabular-nums mt-0.5">{fmtNum(summary.totalBelumBekerja)}</p>
              <p className="text-[10px] text-amber-600 font-semibold mt-0.5">Sedang mencari kerja</p>
            </div>

            <div className="card p-4 border-surface-border bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-100">Persentase Serap (%)</span>
              <p className="text-3xl font-black tabular-nums mt-0.5">{summary.pct}%</p>
              <p className="text-[10.5px] text-emerald-100 font-semibold mt-0.5">Rata-rata Nasional</p>
            </div>
          </div>

          {/* Tabel Rekapitulasi per UPT */}
          <div className="card p-5 border-surface-border shadow-card space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-surface-border">
              <h2 className="text-sm font-black text-navy-900 uppercase tracking-wide">
                Rekapitulasi Penyerapan per UPT ({uptList.length} UPT) · {periodLabel} {year}
              </h2>

              <div className="flex items-center gap-2 flex-wrap">
                {!isPusbang && (
                  <div className="relative">
                    <select
                      className="text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-3 pr-8 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      value={filterMatra}
                      onChange={(e) => setFilterMatra(e.target.value)}
                    >
                      <option value="all">Semua Matra</option>
                      <option value="darat">Matra Darat</option>
                      <option value="laut">Matra Laut</option>
                      <option value="udara">Matra Udara</option>
                      <option value="aparatur">Aparatur</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                      <IconChevronDown className="h-3 w-3" />
                    </div>
                  </div>
                )}

                <div className="relative">
                  <input
                    type="text"
                    placeholder="Cari nama / kode UPT..."
                    className="text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-7 pr-3 focus:outline-none focus:ring-2 focus:ring-emerald-400 w-44"
                    value={searchUpt}
                    onChange={(e) => setSearchUpt(e.target.value)}
                  />
                  <IconSearch className="h-3 w-3 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                </div>
              </div>
            </div>

            {loadingRekap ? (
              <SkeletonRows rows={6} />
            ) : uptList.length === 0 ? (
              <EmptyState
                icon={<IconBuilding className="h-7 w-7" />}
                title="Tidak ada data UPT"
                desc="Tidak ditemukan data penyerapan UPT yang sesuai filter."
              />
            ) : (
              <div className="w-full overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-left text-xs text-slate-800">
                  <thead>
                    <tr className="bg-navy-950 text-white font-extrabold uppercase text-[10px]">
                      <th className="px-3 py-2.5 text-center w-8">#</th>
                      <th className="px-3 py-2.5">NAMA UPT</th>
                      <th className="px-3 py-2.5 text-center">MATRA</th>
                      <th className="px-3 py-2.5 text-center">PNS</th>
                      <th className="px-3 py-2.5 text-center">PPNPN</th>
                      <th className="px-3 py-2.5 text-center">BUMN</th>
                      <th className="px-3 py-2.5 text-center">SWASTA</th>
                      <th className="px-3 py-2.5 text-center text-amber-300">BELUM BEKERJA</th>
                      <th className="px-3 py-2.5 text-center">TOTAL BEKERJA</th>
                      <th className="px-3 py-2.5 text-center">TOTAL LULUSAN</th>
                      <th className="px-3 py-2.5 text-center text-emerald-300">PERSENTASE (%)</th>
                      <th className="px-3 py-2.5 text-center w-24">AKSI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {uptList.map((u, i) => (
                      <tr key={u.uptId} className={i % 2 === 0 ? 'bg-white hover:bg-slate-50/70' : 'bg-slate-50/50 hover:bg-slate-50/70'}>
                        <td className="px-3 py-2 text-center text-slate-400 font-bold">{i + 1}</td>
                        <td className="px-3 py-2">
                          <span className="font-extrabold text-navy-950 block">{u.uptName}</span>
                          <span className="text-[10px] text-slate-400 font-semibold">{u.uptCode}</span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            {u.matra || '-'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums">{fmtNum(u.pns)}</td>
                        <td className="px-3 py-2 text-center tabular-nums">{fmtNum(u.ppnpn)}</td>
                        <td className="px-3 py-2 text-center tabular-nums">{fmtNum(u.bumn)}</td>
                        <td className="px-3 py-2 text-center tabular-nums">{fmtNum(u.swasta)}</td>
                        <td className="px-3 py-2 text-center tabular-nums font-bold text-amber-700">{fmtNum(u.belumBekerja)}</td>
                        <td className="px-3 py-2 text-center tabular-nums font-extrabold text-navy-950">{fmtNum(u.totalBekerja)}</td>
                        <td className="px-3 py-2 text-center tabular-nums font-extrabold text-navy-950">{fmtNum(u.totalLulusan)}</td>
                        <td className="px-3 py-2 text-center tabular-nums font-black text-emerald-600 text-sm">
                          {u.pct}%
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            className="btn-secondary !text-[11px] !py-1 !px-2.5 rounded-lg font-bold text-navy-900 border-navy-200 hover:bg-navy-50 flex items-center gap-1"
                            onClick={() => {
                              setSelectedUptId(u.uptId)
                              setActiveTab('detail_upt')
                            }}
                            title="Lihat Laporan Detail UPT ini"
                          >
                            <IconEye className="h-3 w-3" />
                            <span>Detail</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-navy-950 text-white font-extrabold text-xs">
                      <td colSpan={3} className="px-3 py-2.5 text-center uppercase tracking-wider">TOTAL KESELURUHAN</td>
                      <td className="px-3 py-2.5 text-center tabular-nums text-gold-300">{fmtNum(summary.totalPns)}</td>
                      <td className="px-3 py-2.5 text-center tabular-nums text-gold-300">{fmtNum(summary.totalPpnpn)}</td>
                      <td className="px-3 py-2.5 text-center tabular-nums text-gold-300">{fmtNum(summary.totalBumn)}</td>
                      <td className="px-3 py-2.5 text-center tabular-nums text-gold-300">{fmtNum(summary.totalSwasta)}</td>
                      <td className="px-3 py-2.5 text-center tabular-nums text-amber-400 font-bold">{fmtNum(summary.totalBelumBekerja)}</td>
                      <td className="px-3 py-2.5 text-center tabular-nums text-white font-black">{fmtNum(summary.totalBekerja)}</td>
                      <td className="px-3 py-2.5 text-center tabular-nums text-white font-black">{fmtNum(summary.totalLulusan)}</td>
                      <td className="px-3 py-2.5 text-center tabular-nums text-emerald-400 font-black">{summary.pct}%</td>
                      <td className="px-3 py-2.5"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: LAPORAN DETAIL PER UPT (DENGAN NAMA TARUNA) */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'detail_upt' && (
        <div className="space-y-6">
          {/* UPT Selector & Options Toolbar */}
          <div className="card p-4 border-surface-border shadow-card flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <label className="block text-[10px] font-black uppercase text-navy-400 mb-1">Pilih UPT</label>
                <div className="relative">
                  <select
                    className="text-xs font-bold rounded-xl border border-slate-300 bg-white py-2 pl-3 pr-8 focus:outline-none focus:ring-2 focus:ring-emerald-400 min-w-[240px]"
                    value={selectedUptId}
                    onChange={(e) => setSelectedUptId(e.target.value)}
                  >
                    {(rekapData?.upts || []).map((u) => (
                      <option key={u.uptId} value={u.uptId}>
                        {u.uptName} ({u.uptCode})
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                    <IconChevronDown className="h-3.5 w-3.5" />
                  </div>
                </div>
              </div>

              {selectedUptObj && (
                <div className="pt-4 flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-navy-50 text-navy-700 border border-navy-200">
                    Matra: {selectedUptObj.matra?.toUpperCase() || '-'}
                  </span>
                </div>
              )}
            </div>

            <div className="text-right">
              <span className="text-[10px] text-slate-400 font-semibold block">Data UPT Aktif</span>
              <span className="text-xs font-extrabold text-navy-950">
                {uptDetailData?.upt?.name || 'Memuat...'}
              </span>
            </div>
          </div>

          {errorDetail && <Alert type="error">{errorDetail}</Alert>}

          {/* Render Matriks Kemenhub dengan Nama Taruna / Matriks Bulanan */}
          <div className="card p-4 border border-slate-300 shadow-card">
            <AbsorptionReportView
              data={uptDetailData}
              year={year}
              month={month}
              loading={loadingDetail}
              showTarunaNamesDefault={true}
            />
          </div>
        </div>
      )}
    </div>
  )
}
