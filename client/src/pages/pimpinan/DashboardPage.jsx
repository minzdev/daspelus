import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { apiError } from '../../lib/api'
import { Alert, SkeletonRows, StatCard } from '../../components/ui'
import {
  IconTarget, IconBuilding, IconPeople, IconGraduation, IconCheck, IconChevronDown, IconFileText,
} from '../../components/icons'
import logoBpsdm from '../../assets/logo-bpsdm.png'
import { fmtNum, yearOptions } from '../../utils/format'

const QUARTER_NAMES = {
  1: 'Triwulan I (Jan - Mar)',
  2: 'Triwulan II (Apr - Jun)',
  3: 'Triwulan III (Jul - Sep)',
  4: 'Triwulan IV (Okt - Des)',
}

const TARUNA_STATUS_LABELS = {
  draft: { label: 'Draf UPT', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  submitted_pimpinan: { label: 'Menunggu Verifikasi Anda', cls: 'bg-amber-50 text-amber-800 border-amber-300 font-extrabold animate-pulse' },
  submitted_admin: { label: 'Diteruskan ke Admin BPSDM', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  approved_admin: { label: 'Disetujui Admin BPSDM', cls: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold' },
  rejected_pimpinan: { label: 'Ditolak (Revisi UPT)', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  rejected_admin: { label: 'Ditolak Admin BPSDM', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
}

const ABS_STATUS_LABELS = {
  draft: { label: 'Draf UPT', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  submitted_pimpinan: { label: 'Menunggu Persetujuan Anda', cls: 'bg-amber-50 text-amber-800 border-amber-300 font-extrabold animate-pulse' },
  approved_pimpinan: { label: 'Disetujui Pimpinan', cls: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold' },
  rejected_pimpinan: { label: 'Ditolak (Revisi UPT)', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
}

export default function PimpinanDashboardPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data: res } = await api.get('/dashboard/pimpinan', { params: { year } })
      setData(res)
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="p-4"><SkeletonRows rows={4} /></div>
  if (error) return <Alert type="error">{error}</Alert>
  if (!data) return null

  const ach = data.achievement
  const pendingTaruna = data.pendingTarunaCount || 0
  const pendingAbsorption = data.pendingAbsorptionCount || 0

  // Quick lookup for taruna and absorption submissions per quarter
  const tarunaSubMap = new Map((data.tarunaSubmissions || []).map((s) => [s.quarter, s]))
  const absSubMap = new Map((data.absorptionSubmissions || []).map((s) => [s.quarter, s]))

  return (
    <div className="animate-fadeUp space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-navy-950 via-navy-900 to-navy-950 px-5 py-4 text-white shadow-md border border-navy-800">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 p-1.5 shadow-inner border border-white/15" style={{ width: '40px', height: '40px' }}>
              <img src={logoBpsdm} alt="Logo BPSDMP" className="h-full w-full object-contain max-h-7 max-w-7" onError={(e) => (e.target.style.display = 'none')} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-black text-white tracking-tight">
                  Dashboard Pimpinan — {data.upt?.name || data.upt?.code || 'UPT'}
                </h1>
                <span className="text-[10px] font-extrabold uppercase bg-gold-500/20 text-gold-300 border border-gold-500/30 rounded-full px-2.5 py-0.5">
                  Matra {data.upt?.matra || '-'}
                </span>
              </div>
              <p className="text-xs text-navy-200 mt-0.5">
                Persetujuan Laporan Realisasi PK, Persetujuan Data Taruna & Penyerapan Lulusan Tahun {year}.
              </p>
            </div>
          </div>

          <div className="relative shrink-0">
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
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<IconTarget className="h-5 w-5" />}
          label="Target Peserta PK"
          value={fmtNum(ach?.targetPeserta || 0)}
          sub={`Realisasi: ${fmtNum(ach?.totalPeserta || 0)}`}
          tone="navy"
        />
        <StatCard
          icon={<IconTarget className="h-5 w-5" />}
          label="Target Lulusan PK"
          value={fmtNum(ach?.targetLulusan || 0)}
          sub={`Realisasi: ${fmtNum(ach?.totalLulusan || 0)}`}
          tone="gold"
        />
        <StatCard
          icon={<IconPeople className="h-5 w-5" />}
          label="Persetujuan Data Taruna"
          value={pendingTaruna > 0 ? `${pendingTaruna} Pending` : 'Terverifikasi'}
          sub={pendingTaruna > 0 ? 'Menunggu verifikasi Anda' : 'Semua pengajuan diproses'}
          tone={pendingTaruna > 0 ? 'gold' : 'emerald'}
        />
        <StatCard
          icon={<IconGraduation className="h-5 w-5" />}
          label="Persetujuan Penyerapan"
          value={pendingAbsorption > 0 ? `${pendingAbsorption} Pending` : 'Terverifikasi'}
          sub={pendingAbsorption > 0 ? 'Menunggu persetujuan Anda' : 'Semua laporan diproses'}
          tone={pendingAbsorption > 0 ? 'gold' : 'emerald'}
        />
      </div>

      {/* MODUL 2: Persetujuan Data Penyerapan Lulusan */}
      <div className="card p-5 border-surface-border shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-black text-navy-950 flex items-center gap-2">
              <IconGraduation className="h-5 w-5 text-emerald-600" />
              Persetujuan Modul Penyerapan Lulusan ({year})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Status verifikasi Master Data Taruna dan Persetujuan Laporan Penyerapan Lulusan Triwulanan.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link to="/pimpinan/penyerapan/taruna-inbox" className="btn-secondary !text-xs !py-1.5 !px-3 rounded-lg font-bold flex items-center gap-1">
              <IconPeople className="h-3.5 w-3.5" />
              <span>Inbox Data Taruna</span>
              {pendingTaruna > 0 && (
                <span className="ml-1 bg-amber-500 text-white rounded-full text-[10px] px-1.5 py-0.2 animate-pulse">
                  {pendingTaruna}
                </span>
              )}
            </Link>
            <Link to="/pimpinan/penyerapan/inbox" className="btn-primary !bg-emerald-600 hover:!bg-emerald-700 text-white !text-xs !py-1.5 !px-3 rounded-lg font-bold flex items-center gap-1">
              <IconGraduation className="h-3.5 w-3.5" />
              <span>Inbox Penyerapan</span>
              {pendingAbsorption > 0 && (
                <span className="ml-1 bg-white text-emerald-800 rounded-full text-[10px] px-1.5 py-0.2 font-extrabold animate-pulse">
                  {pendingAbsorption}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* Tabel Triwulan Modul 2 */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full border-collapse text-left text-xs text-slate-800">
            <thead>
              <tr className="bg-navy-950 text-white font-extrabold uppercase text-[10px]">
                <th className="px-4 py-3">TRIWULAN</th>
                <th className="px-4 py-3">1. MASTER DATA TARUNA</th>
                <th className="px-4 py-3">2. LAPORAN PENYERAPAN (TW)</th>
                <th className="px-4 py-3 text-center">AKSI PIMPINAN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {[1, 2, 3, 4].map((q) => {
                const tSub = tarunaSubMap.get(q)
                const aSub = absSubMap.get(q)

                const tStatus = tSub ? (TARUNA_STATUS_LABELS[tSub.status] || { label: tSub.status, cls: 'bg-slate-100 text-slate-600' }) : { label: 'Belum Ada Pengajuan', cls: 'bg-slate-100 text-slate-500' }
                const aStatus = aSub ? (ABS_STATUS_LABELS[aSub.status] || { label: aSub.status, cls: 'bg-slate-100 text-slate-600' }) : { label: 'Belum Ada Pengajuan', cls: 'bg-slate-100 text-slate-500' }

                return (
                  <tr key={q} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3.5 font-extrabold text-navy-950">
                      {QUARTER_NAMES[q]}
                    </td>

                    {/* Status Data Taruna */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2.5 py-1 rounded-full border ${tStatus.cls}`}>
                          {tStatus.label}
                        </span>
                      </div>
                    </td>

                    {/* Status Laporan Penyerapan */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2.5 py-1 rounded-full border ${aStatus.cls}`}>
                          {aStatus.label}
                        </span>
                      </div>
                    </td>

                    {/* Aksi Persetujuan Pimpinan */}
                    <td className="px-4 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {tSub?.status === 'submitted_pimpinan' ? (
                          <Link
                            to="/pimpinan/penyerapan/taruna-inbox"
                            className="text-[11px] font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-2.5 py-1 rounded-lg transition-colors"
                          >
                            Verifikasi Taruna
                          </Link>
                        ) : aSub?.status === 'submitted_pimpinan' ? (
                          <Link
                            to="/pimpinan/penyerapan/inbox"
                            className="text-[11px] font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 px-2.5 py-1 rounded-lg transition-colors"
                          >
                            Setujui Laporan
                          </Link>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-medium">Sesuai Alur</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODUL 1: Submissions Laporan Realisasi PK */}
      <div className="card p-5 border-surface-border shadow-card space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <h2 className="text-base font-black text-navy-950 flex items-center gap-2">
            <IconFileText className="h-5 w-5 text-navy-700" />
            Persetujuan Laporan Realisasi PK (Tahun {year})
          </h2>
          <Link to="/pimpinan/inbox" className="btn-secondary !text-xs !py-1.5 !px-3 rounded-lg font-bold">
            Lihat Inbox PK
          </Link>
        </div>

        <div className="divide-y divide-slate-100">
          {(data.submissions || []).map((s) => (
            <div key={s.id} className="py-2.5 flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-extrabold text-navy-950">Bulan {s.month} / {s.year}</span>
                {s.submittedAt && (
                  <span className="text-[10px] text-slate-400 ml-2">
                    Dikirim: {new Date(s.submittedAt).toLocaleDateString('id-ID')}
                  </span>
                )}
              </div>
              <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                s.status === 'approved' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' :
                s.status === 'pending_pimpinan' ? 'bg-amber-50 text-amber-800 border-amber-300 animate-pulse' :
                'bg-slate-100 text-slate-600 border-slate-200'
              }`}>
                {s.status === 'approved' ? 'Disetujui' : s.status === 'pending_pimpinan' ? 'Menunggu Persetujuan Anda' : s.status}
              </span>
            </div>
          ))}
          {(data.submissions || []).length === 0 && (
            <p className="text-xs text-slate-500 py-3 text-center">Belum ada laporan realisasi PK yang dikirim.</p>
          )}
        </div>
      </div>
    </div>
  )
}
