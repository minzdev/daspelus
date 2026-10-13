import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { apiError } from '../../lib/api'
import { Alert, EmptyState, SkeletonRows, StatCard } from '../../components/ui'
import {
  IconTarget, IconBuilding, IconPeople, IconGraduation, IconCheck, IconChevronDown, IconFileText,
} from '../../components/icons'
import logoBpsdm from '../../assets/logo-bpsdm.png'
import { fmtNum, yearOptions, MONTHS } from '../../utils/format'

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

  // Tren bulanan 1 tahun: realisasi per bulan (naik-turun) + garis kumulatif.
  // Sumbu selalu Januari–Desember (bulan yang belum ada datanya = 0).
  // WAJIB di atas early-return agar urutan hooks stabil (aturan React).
  const trendData = useMemo(() => {
    const ms = data?.achievement?.monthly || []
    const short = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
    let cp = 0, cl = 0
    const rows = ms.map((m, i) => {
      const mp = Number(m.cumPeserta) || 0
      const ml = Number(m.cumLulusan) || 0
      const row = {
        label: short[i] || `B${i + 1}`,
        peserta: Math.max(0, mp - cp),
        lulusan: Math.max(0, ml - cl),
        kumPeserta: mp,
        kumLulusan: ml,
      }
      cp = mp
      cl = ml
      return row
    })
    while (rows.length < 12) {
      rows.push({ label: short[rows.length], peserta: 0, lulusan: 0, kumPeserta: cp, kumLulusan: cl })
    }
    return rows
  }, [data])
  const trendTotal = trendData.reduce((s, r) => s + r.peserta + r.lulusan, 0)

  if (loading) return <div className="p-4"><SkeletonRows rows={4} /></div>
  if (error) return <Alert type="error">{error}</Alert>
  if (!data) return null

  const ach = data.achievement
  const pendingTaruna = data.pendingTarunaCount || 0
  const pendingAbsorption = data.pendingAbsorptionCount || 0

  // % capaian per kelompok (sama seperti halaman Laporan Realisasi)
  const pctText = (real, target) => {
    const r = Number(real) || 0
    const t = Number(target) || 0
    if (!t || t <= 0) return '-'
    return `${Math.round((r / t) * 100)}%`
  }

  // Master Data Taruna bersifat tahunan (1 pengajuan/tahun, berlaku 12 bulan)
  const tarunaYearly = (data.tarunaSubmissions || [])[0] || null
  // Laporan penyerapan per bulan; data lama era triwulan dirujuk di tiap bulannya
  const absByMonth = new Map()
  for (const s of data.absorptionSubmissions || []) {
    if (s.month) {
      if (!absByMonth.has(Number(s.month))) absByMonth.set(Number(s.month), s)
    } else if (s.quarter) {
      for (let m = (Number(s.quarter) - 1) * 3 + 1; m <= Number(s.quarter) * 3; m++) {
        if (!absByMonth.has(m)) absByMonth.set(m, s)
      }
    }
  }

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

      {/* Overview Stat Cards — trio Peserta, trio Lulusan, lalu persetujuan */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={<IconTarget className="h-5 w-5" />}
          label="Target Peserta PK"
          value={fmtNum(ach?.targetPeserta || 0)}
          tone="navy"
          labelClass="!font-extrabold"
          valueClass="!text-[28px] !font-black !leading-none"
        />
        <StatCard
          icon={<IconPeople className="h-5 w-5" />}
          label="Realisasi Peserta"
          value={fmtNum(ach?.totalPeserta || 0)}
          tone="sky"
          labelClass="!font-extrabold"
          valueClass="!text-[28px] !font-black !leading-none"
        />
        <StatCard
          icon={<IconTarget className="h-5 w-5" />}
          label="Capaian Peserta"
          value={pctText(ach?.totalPeserta, ach?.targetPeserta)}
          tone="emerald"
          labelClass="!font-extrabold"
          valueClass="!text-[28px] !font-black !leading-none"
        />
        <StatCard
          icon={<IconTarget className="h-5 w-5" />}
          label="Target Lulusan PK"
          value={fmtNum(ach?.targetLulusan || 0)}
          tone="gold"
          labelClass="!font-extrabold"
          valueClass="!text-[28px] !font-black !leading-none"
        />
        <StatCard
          icon={<IconGraduation className="h-5 w-5" />}
          label="Realisasi Lulusan"
          value={fmtNum(ach?.totalLulusan || 0)}
          tone="sky"
          labelClass="!font-extrabold"
          valueClass="!text-[28px] !font-black !leading-none"
        />
        <StatCard
          icon={<IconGraduation className="h-5 w-5" />}
          label="Capaian Lulusan"
          value={pctText(ach?.totalLulusan, ach?.targetLulusan)}
          tone="emerald"
          labelClass="!font-extrabold"
          valueClass="!text-[28px] !font-black !leading-none"
        />
        <StatCard
          icon={<IconPeople className="h-5 w-5" />}
          label="Persetujuan Data Taruna"
          value={pendingTaruna > 0 ? `${pendingTaruna} Pending` : 'Terverifikasi'}
          tone={pendingTaruna > 0 ? 'gold' : 'emerald'}
          labelClass="!font-extrabold"
          valueClass="!text-[22px] !font-black !leading-tight"
        />
        <StatCard
          icon={<IconGraduation className="h-5 w-5" />}
          label="Persetujuan Penyerapan"
          value={pendingAbsorption > 0 ? `${pendingAbsorption} Pending` : 'Terverifikasi'}
          tone={pendingAbsorption > 0 ? 'gold' : 'emerald'}
          labelClass="!font-extrabold"
          valueClass="!text-[22px] !font-black !leading-tight"
        />
      </div>

      {/* Grafik Tren Realisasi Bulanan 1 Tahun (SVG murni) */}
      <div className="card flex flex-col">
        <div className="card-header border-b border-surface-border pb-4">
          <div>
            <h3 className="card-title">Tren Realisasi Bulanan {year}</h3>
            <p className="card-subtitle">Naik-turun peserta & lulusan per bulan + garis kumulatif</p>
          </div>
        </div>
        <div className="p-4 sm:p-5">
          {trendTotal === 0 ? (
            <EmptyState
              icon={<IconTarget className="h-6 w-6" />}
              title="Belum ada realisasi"
              desc={`Belum ada data realisasi tahun ${year} untuk digambarkan.`}
            />
          ) : (
            <MonthlyTrendChart data={trendData} />
          )}
        </div>
      </div>

      {/* Diagram Bulat: Realisasi vs Target PK (Capaian %) */}
      <div className="card flex flex-col">
        <div className="card-header border-b border-surface-border pb-4">
          <div>
            <h3 className="card-title">Capaian vs Target PK {year}</h3>
            <p className="card-subtitle">Perbandingan realisasi terhadap target PK per kelompok</p>
          </div>
        </div>
        <div className="p-4 sm:p-5 grid gap-4 sm:grid-cols-2">
          <AchievementDonut
            label="Peserta"
            target={ach?.targetPeserta || 0}
            real={ach?.totalPeserta || 0}
            color="#0284C7"
          />
          <AchievementDonut
            label="Lulusan"
            target={ach?.targetLulusan || 0}
            real={ach?.totalLulusan || 0}
            color="#10B981"
          />
        </div>
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
              Status verifikasi Master Data Taruna (tahunan) dan Persetujuan Laporan Penyerapan Lulusan per bulan.
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

        {/* Tabel Bulanan Modul 2 */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full border-collapse text-left text-xs text-slate-800">
            <thead>
              <tr className="bg-navy-950 text-white font-extrabold uppercase text-[10px]">
                <th className="px-4 py-3">BULAN</th>
                <th className="px-4 py-3">1. MASTER DATA TARUNA</th>
                <th className="px-4 py-3">2. LAPORAN PENYERAPAN (BULAN)</th>
                <th className="px-4 py-3 text-center">AKSI PIMPINAN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {MONTHS.map((mName, idx) => {
                const m = idx + 1
                const tSub = tarunaYearly
                const aSub = absByMonth.get(m)

                const tStatus = tSub ? (TARUNA_STATUS_LABELS[tSub.status] || { label: tSub.status, cls: 'bg-slate-100 text-slate-600' }) : { label: 'Belum Ada Pengajuan', cls: 'bg-slate-100 text-slate-500' }
                const aStatus = aSub ? (ABS_STATUS_LABELS[aSub.status] || { label: aSub.status, cls: 'bg-slate-100 text-slate-600' }) : { label: 'Belum Ada Pengajuan', cls: 'bg-slate-100 text-slate-500' }

                return (
                  <tr key={m} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3.5 font-extrabold text-navy-950">
                      {mName}
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

/* ─── Diagram bulat capaian: realisasi vs target (SVG murni) ─── */
function AchievementDonut({ label, target, real, color }) {
  const size = 148
  const R = 58
  const C = 2 * Math.PI * R
  const t = Math.max(0, Number(target) || 0)
  const r = Math.max(0, Number(real) || 0)
  const pct = t > 0 ? (r / t) * 100 : 0
  const shown = Math.min(100, pct)
  const sisa = Math.max(0, t - r)
  const c = size / 2

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200/70 bg-white px-4 py-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', height: '100%', display: 'block' }} role="img" aria-label={`Capaian ${label}`}>
          <circle cx={c} cy={c} r={R} fill="none" stroke="#E2E8F0" strokeWidth={15} />
          <circle
            cx={c}
            cy={c}
            r={R}
            fill="none"
            stroke={color}
            strokeWidth={15}
            strokeLinecap="round"
            strokeDasharray={`${((shown / 100) * C).toFixed(1)} ${C.toFixed(1)}`}
            transform={`rotate(-90 ${c} ${c})`}
          />
          <text x={c} y={c - 2} textAnchor="middle" fontSize={26} fontWeight={900} fill="#0F172A" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {t > 0 ? `${Math.round(pct)}%` : '–'}
          </text>
          <text x={c} y={c + 18} textAnchor="middle" fontSize={11} fontWeight={700} fill="#64748B">
            {label}
          </text>
        </svg>
      </div>
      <div className="min-w-0 space-y-1.5 text-xs">
        <p className="flex items-center justify-between gap-3">
          <span className="text-slate-500 font-semibold">Target PK</span>
          <span className="font-black text-slate-900 tabular-nums">{fmtNum(t)}</span>
        </p>
        <p className="flex items-center justify-between gap-3">
          <span className="text-slate-500 font-semibold">Realisasi</span>
          <span className="font-black tabular-nums" style={{ color }}>{fmtNum(r)}</span>
        </p>
        <p className="flex items-center justify-between gap-3 border-t border-slate-100 pt-1.5">
          <span className="text-slate-500 font-semibold">Sisa target</span>
          <span className="font-black text-slate-900 tabular-nums">{fmtNum(sisa)}</span>
        </p>
      </div>
    </div>
  )
}

/* ─── Grafik tren bulanan SVG murni: batang per bulan + garis kumulatif ─── */
function MonthlyTrendChart({ data }) {
  const W = 720
  const H = 260
  const padL = 46
  const padR = 12
  const padT = 14
  const padB = 28
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const n = Math.max(1, data.length)
  const maxV = Math.max(1, ...data.map((r) => Math.max(r.peserta, r.lulusan, r.kumPeserta, r.kumLulusan)))
  const gw = plotW / n
  const barW = Math.min(18, Math.max(6, gw / 3.4))
  const cx = (i) => padL + i * gw + gw / 2
  const y = (v) => padT + plotH - (Math.max(0, v) / maxV) * plotH
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxV * f))
  const line = (key) => data.map((r, i) => `${i === 0 ? 'M' : 'L'}${cx(i).toFixed(1)},${y(r[key]).toFixed(1)}`).join(' ')
  const base = padT + plotH
  const area = (key) => {
    if (!data.length) return ''
    return `${line(key)} L${cx(data.length - 1).toFixed(1)},${base} L${cx(0).toFixed(1)},${base} Z`
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pb-2 text-[11px] font-bold text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: '#16314E' }} />Peserta / bulan
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: '#F59E0B' }} />Lulusan / bulan
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-5 rounded-full" style={{ background: '#0284C7' }} />Kumulatif peserta
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-5 rounded-full" style={{ background: '#10B981' }} />Kumulatif lulusan
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 260, display: 'block' }} role="img" aria-label="Tren realisasi bulanan">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#E2E8F0" strokeWidth={1} />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#64748B" fontWeight={600}>
              {fmtNum(t)}
            </text>
          </g>
        ))}
        <path d={area('kumPeserta')} fill="#0284C7" fillOpacity={0.08} />
        <path d={area('kumLulusan')} fill="#10B981" fillOpacity={0.08} />
        {data.map((r, i) => (
          <g key={r.label}>
            <rect x={cx(i) - barW - 1.5} y={y(r.peserta)} width={barW} height={Math.max(0, padT + plotH - y(r.peserta))} rx={3} fill="#16314E">
              <title>{`${r.label} — Peserta: ${fmtNum(r.peserta)}`}</title>
            </rect>
            <rect x={cx(i) + 1.5} y={y(r.lulusan)} width={barW} height={Math.max(0, padT + plotH - y(r.lulusan))} rx={3} fill="#F59E0B">
              <title>{`${r.label} — Lulusan: ${fmtNum(r.lulusan)}`}</title>
            </rect>
            <text x={cx(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="#64748B" fontWeight={600}>
              {r.label}
            </text>
          </g>
        ))}
        <polyline points={line('kumPeserta')} fill="none" stroke="#0284C7" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={line('kumLulusan')} fill="none" stroke="#10B981" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {data.map((r, i) => (
          <g key={`dot-${r.label}`}>
            <circle cx={cx(i)} cy={y(r.kumPeserta)} r={3} fill="#0284C7" stroke="#fff" strokeWidth={1.5}>
              <title>{`${r.label} — Kumulatif peserta: ${fmtNum(r.kumPeserta)}`}</title>
            </circle>
            <circle cx={cx(i)} cy={y(r.kumLulusan)} r={3} fill="#10B981" stroke="#fff" strokeWidth={1.5}>
              <title>{`${r.label} — Kumulatif lulusan: ${fmtNum(r.kumLulusan)}`}</title>
            </circle>
          </g>
        ))}
      </svg>
    </div>
  )
}
