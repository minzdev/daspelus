import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend, Cell, LabelList,
} from 'recharts'
import api, { apiError } from '../../lib/api'
import {
  StatCard, EmptyState, SkeletonCards, SkeletonRows, Alert,
} from '../../components/ui'
import {
  IconBuilding, IconPeople, IconGraduation, IconTarget, IconTruck, IconShip, IconPlane, IconChevronDown, IconLayers,
} from '../../components/icons'
import logoBpsdm from '../../assets/logo-bpsdm.png'
import { fmtNum, yearOptions } from '../../utils/format'
import DashboardProgramDetail from '../../components/DashboardProgramDetail'

const MATRA_COLORS = {
  darat: { fill: '#10B981', bg: 'from-emerald-500 to-emerald-600', badge: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', icon: IconTruck },
  laut: { fill: '#0EA5E9', bg: 'from-sky-500 to-sky-600', badge: 'bg-sky-500/10 text-sky-600 border-sky-500/20', icon: IconShip },
  udara: { fill: '#8B5CF6', bg: 'from-violet-500 to-violet-600', badge: 'bg-violet-500/10 text-violet-600 border-violet-500/20', icon: IconPlane },
  aparatur: { fill: '#F59E0B', bg: 'from-amber-500 to-amber-600', badge: 'bg-amber-500/10 text-amber-600 border-amber-500/20', icon: IconBuilding },
}
const MATRA_LABEL = { darat: 'Darat', laut: 'Laut', udara: 'Udara', aparatur: 'Aparatur' }

/** Tooltip ringkas diagram progress: UPT, nama, matra, dan persentase. */
function ProgressTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-xl border border-surface-border bg-white p-3.5 shadow-card min-w-[200px] animate-fadeIn">
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-surface-border">
        <span className="text-[11px] font-extrabold tracking-wide uppercase text-navy-400">Kode UPT</span>
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
      </div>
      <p className="text-sm font-black text-navy-900 mt-1">{d.uptCode}</p>
      <p className="text-xs text-navy-500 leading-tight mt-0.5 line-clamp-2">{d.uptName}</p>
      <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-surface-border/60">
        <span className="text-[11px] font-bold text-navy-500">{MATRA_LABEL[d.matra] || 'Lainnya'} · {d.year}</span>
        <span className="text-sm font-black text-navy-900 tabular-nums">
          {d.progress != null ? `${String(d.progress).replace('.', ',')}%` : '—'}
        </span>
      </div>
    </div>
  )
}

/** Baris toggle urutan diagram (Bar / Descending). */
function ChartLegendToggle({ value, onChange }) {
  const opts = [
    { key: 'upt', label: 'Default UPT' },
    { key: 'desc', label: 'Capaian Tertinggi' },
  ]
  return (
    <div className="inline-flex rounded-lg bg-navy-100/60 p-1 border border-navy-200/50">
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all ${
            value === o.key ? 'bg-navy-900 text-gold-300 shadow-sm' : 'text-navy-600 hover:text-navy-900'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Legenda bawah: warna matra + jumlah UPT. */
function MatraLegend({ counts }) {
  return (
    <div className="flex items-center justify-center gap-6 flex-wrap text-xs font-bold text-navy-600 pt-2">
      {Object.entries(MATRA_LABEL).map(([key, label]) => (
        <span key={key} className="flex items-center gap-2 bg-surface-ground px-3 py-1.5 rounded-full border border-surface-border">
          <span className="h-3 w-3 rounded-full shadow-sm" style={{ backgroundColor: MATRA_COLORS[key]?.fill || '#94A3B8' }} />
          <span>Matra {label}</span>
          <span className="ml-1 text-[11px] font-extrabold bg-navy-100 text-navy-800 px-1.5 py-0.5 rounded-full">
            {counts[key] || 0} UPT
          </span>
        </span>
      ))}
    </div>
  )
}

export default function AdminDashboardPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [order, setOrder] = useState('upt') // 'upt' | 'desc'
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [programs, setPrograms] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [dashRes, progRes] = await Promise.all([
        api.get('/dashboard/admin', { params: { year } }),
        api.get('/reports/program-detail', { params: { year } }).catch(() => ({ data: { programs: [] } })),
      ])
      setData(dashRes.data)
      setPrograms(progRes.data?.programs || [])
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    load()
  }, [load])

  const stats = data?.stats || { totalPeserta: 0, totalLulusan: 0, totalUpt: 0, totalUsers: 0 }

  // Data diagram progress capaian per UPT — memoize agar referensi stabil
  const uptAch = useMemo(() => data?.uptAchievements || [], [data?.uptAchievements])
  const chartData = useMemo(() => {
    const withProgress = uptAch.filter((u) => u.progress != null)
    const items = [...withProgress]
    if (order === 'desc') items.sort((a, b) => b.progress - a.progress)
    return items.map((u) => ({ ...u, year, color: MATRA_COLORS[u.matra]?.fill || '#94A3B8' }))
  }, [uptAch, order, year])

  const avg = useMemo(() => {
    if (!chartData.length) return 0
    return Math.round((chartData.reduce((s, d) => s + d.progress, 0) / chartData.length) * 10) / 10
  }, [chartData])

  const matraCounts = useMemo(() => uptAch.reduce((acc, u) => {
    const key = u.matra || 'lainnya'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {}), [uptAch])

  return (
    <div className="animate-fadeUp space-y-6">
      {/* Banner Header Dashboard */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-navy-950 via-navy-900 to-navy-950 px-5 py-4 text-white shadow-md border border-navy-800">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-gold-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 p-1.5 shadow-inner border border-white/15 backdrop-blur-md" style={{ width: '40px', height: '40px' }}>
              <img src={logoBpsdm} alt="Logo BPSDMP" className="h-full w-full object-contain max-h-7 max-w-7" onError={(e) => e.target.style.display = 'none'} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-black text-white tracking-tight">Dashboard Data Realisasi Peserta Lulusan dan Data Serap Lulusan</h1>
                <span className="rounded-full bg-gold-500/20 text-gold-300 text-[10px] font-extrabold px-2.5 py-0.5 border border-gold-500/30">
                  Tahun {year}
                </span>
              </div>
              <p className="text-xs text-navy-200 mt-0.5 max-w-2xl">
                Realisasi peserta &amp; lulusan serta serapan lulusan seluruh UPT Kementerian Perhubungan.
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2.5 shrink-0 self-start md:self-auto">
            <div className="relative inline-block">
              <select
                className="appearance-none cursor-pointer bg-white/10 hover:bg-white/15 border border-white/20 text-white font-extrabold text-xs rounded-xl py-2 pl-3 pr-8 shadow-sm backdrop-blur-md transition-all focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-transparent"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {yearOptions().map((y) => (
                  <option key={y} value={y} className="bg-navy-900 text-white font-bold py-1">
                    Tahun {y}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gold-300">
                <IconChevronDown className="h-4 w-4" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="mb-5"><Alert type="error">{error}</Alert></div>}

      {loading ? (
        <>
          <SkeletonCards count={4} />
          <div className="card mt-5"><SkeletonRows rows={6} /></div>
        </>
      ) : (
        <>
          {/* Kartu Statistik Utama */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={<IconPeople className="h-6 w-6" />}
              label="Total Peserta"
              value={fmtNum(stats.totalPeserta)}
              sub={`Total akumulasi ${year}`}
              tone="navy"
            />
            <StatCard
              icon={<IconGraduation className="h-6 w-6" />}
              label="Total Lulusan"
              value={fmtNum(stats.totalLulusan)}
              sub={`Total akumulasi ${year}`}
              tone="gold"
              delay={60}
            />
            <StatCard
              icon={<IconBuilding className="h-6 w-6" />}
              label="UPT Aktif"
              value={fmtNum(stats.totalUpt)}
              sub={`${fmtNum(stats.totalUsers)} akun pengelola`}
              tone="sky"
              delay={120}
            />
            <StatCard
              icon={<IconTarget className="h-6 w-6" />}
              label="UPT Tercapai Target"
              value={`${fmtNum(stats.uptTercapai)} / ${fmtNum(stats.targetDiisi)}`}
              sub="UPT yang sudah capai target PK"
              tone="emerald"
              delay={180}
            />
          </div>

          {/* Perbandingan per Matra (Darat, Laut, Udara, Aparatur) */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(data.matraComparison || []).map((m) => {
              const c = MATRA_COLORS[m.matra] || MATRA_COLORS.darat
              const MatraIcon = c.icon || IconBuilding
              return (
                <div key={m.matra} className="card p-5 hover:shadow-lg transition-all duration-300 border-surface-border">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-extrabold text-navy-900 whitespace-nowrap">Matra {m.label}</h3>
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${c.badge}`}>
                          {m.uptCount} UPT
                        </span>
                      </div>
                      <p className="text-[11px] text-navy-400 mt-0.5">Statistik diklat {year}</p>
                    </div>
                    <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${c.bg} flex items-center justify-center text-white shadow-md shadow-emerald-500/10`}>
                      <MatraIcon className="h-6 w-6" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-surface-ground border border-surface-border/60 mb-4">
                    <div>
                      <p className="text-[10px] font-extrabold uppercase tracking-wider text-navy-400">Peserta</p>
                      <p className="text-xl font-black text-navy-900 tabular-nums mt-0.5">{fmtNum(m.totalPeserta)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-extrabold uppercase tracking-wider text-navy-400">Lulusan</p>
                      <p className="text-xl font-black text-navy-900 tabular-nums mt-0.5">{fmtNum(m.totalLulusan)}</p>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-navy-600">Progress Capaian PK</span>
                      <span className="font-black text-navy-900">{m.pct === null ? '—' : `${m.pct}%`}</span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-navy-100/80 overflow-hidden p-0.5">
                      <div
                        className="h-full rounded-full transition-all duration-1000 shadow-sm"
                        style={{ width: `${Math.min(100, m.pct || 0)}%`, backgroundColor: c.fill }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-navy-500 pt-1">
                      <span>Target Diisi: <strong>{m.uptTarget} UPT</strong></span>
                      <span className="text-emerald-600 font-bold">Tercapai: {m.uptTercapai} UPT</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Komponen Visualisasi Detail Data Program (3 Matra Taruna & Aparatur) */}
          <DashboardProgramDetail programs={programs} year={year} loading={loading} />

          {/* Realisasi Bulanan + Peringkat Capaian PK */}
          <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
            {/* Grafik Realisasi Bulanan Gabungan */}
            <div className="card flex flex-col">
              <div className="card-header border-b border-surface-border pb-4">
                <div>
                  <h3 className="card-title">Realisasi Bulanan Gabungan</h3>
                  <p className="card-subtitle">Tren pendaftaran peserta &amp; kelulusan seluruh UPT · Tahun {year}</p>
                </div>
              </div>
              <div className="p-4 sm:p-5 h-[340px] flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.monthlySeries} margin={{ top: 12, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: 'rgba(22, 49, 78, 0.04)' }}
                      contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                      formatter={(v) => fmtNum(v)}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                    <Bar dataKey="peserta" name="Peserta (Orang)" fill="#16314E" radius={[6, 6, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="lulusan" name="Lulusan (Orang)" fill="#F59E0B" radius={[6, 6, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* List Peringkat Capaian Perjanjian Kinerja UPT */}
            <div className="card bg-gradient-to-b from-navy-950 to-navy-900 border-navy-800 text-white flex flex-col shadow-card">
              <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black tracking-wide text-white">Capaian Perjanjian Kinerja</h3>
                  <p className="text-[11px] text-navy-300 mt-0.5">Peringkat realisasi UPT · {year}</p>
                </div>
                <div className="h-9 w-9 rounded-xl bg-white/10 border border-white/20 p-1 flex items-center justify-center backdrop-blur-md">
                  <img src={logoBpsdm} alt="Logo BPSDMP" className="h-full w-full object-contain" onError={(e) => e.target.style.display = 'none'} />
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto max-h-[340px] custom-scrollbar">
                {data.uptAchievements.length === 0 ? (
                  <div className="p-8 text-center text-xs text-navy-300">
                    Belum ada UPT aktif.{' '}
                    <Link to="/admin/upt" className="text-gold-400 font-bold hover:underline">Tambah UPT</Link>
                  </div>
                ) : (
                  <div className="divide-y divide-white/10">
                    {data.uptAchievements.map((u, idx) => {
                      const pct = u.progress
                      // Badge Medali Top 3
                      let rankBadge = (
                        <span className="h-5 w-5 rounded-full bg-white/10 text-white text-[10px] font-black flex items-center justify-center">
                          {idx + 1}
                        </span>
                      )
                      if (idx === 0) rankBadge = <span className="h-5 w-5 rounded-full bg-amber-400 text-navy-950 text-[10px] font-black flex items-center justify-center shadow-md shadow-amber-400/30">1</span>
                      if (idx === 1) rankBadge = <span className="h-5 w-5 rounded-full bg-slate-300 text-navy-950 text-[10px] font-black flex items-center justify-center">2</span>
                      if (idx === 2) rankBadge = <span className="h-5 w-5 rounded-full bg-amber-700 text-white text-[10px] font-black flex items-center justify-center">3</span>

                      return (
                        <div key={u.uptId} className="px-5 py-3 hover:bg-white/5 transition-colors">
                          <div className="flex items-center justify-between gap-3 mb-1.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              {rankBadge}
                              <div className="min-w-0">
                                <p className="text-[13px] font-bold text-white truncate">{u.uptCode}</p>
                                <p className="text-[11px] text-navy-300 truncate">{u.uptName}</p>
                              </div>
                            </div>
                            <span className="text-xs font-black tabular-nums text-gold-400 shrink-0">
                              {pct === null ? '—' : `${String(pct).replace('.', ',')}%`}
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-400 transition-all duration-700 shadow-sm"
                              style={{ width: `${Math.min(100, pct || 0)}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Diagram Bar Capaian Per UPT */}
          <div className="card overflow-hidden border-surface-border">
            <div className="card-header border-b border-surface-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="card-title">Grafik Capaian Per UPT ({year})</h3>
                <p className="card-subtitle">Persentase realisasi terhadap target PK seluruh {data?.uptAchievements?.length || 0} UPT</p>
              </div>
              <div className="flex items-center gap-2">
                <ChartLegendToggle value={order} onChange={setOrder} />
              </div>
            </div>
            
            {data.uptAchievements.length === 0 ? (
              <EmptyState
                icon={<IconBuilding className="h-6 w-6" />}
                title="Belum ada UPT"
                desc="Tambahkan data UPT terlebih dahulu untuk mulai monitoring capaian."
                action={<Link to="/admin/upt" className="btn-primary">Kelola Data UPT</Link>}
              />
            ) : (
              <div className="p-4 sm:p-6">
                <div className="h-[420px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 28, right: 12, left: -12, bottom: 0 }} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                      <XAxis
                        dataKey="uptCode"
                        tick={{ fontSize: 10, fill: '#475569', fontWeight: 700 }}
                        interval={0}
                        tickFormatter={(v) => (v.length > 11 ? v.slice(0, 10) + '…' : v)}
                        axisLine={false}
                        tickLine={false}
                        angle={-32}
                        textAnchor="end"
                        height={64}
                      />
                      <YAxis
                        tickFormatter={(v) => `${v}%`}
                        tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<ProgressTooltip />} cursor={{ fill: 'rgba(22, 49, 78, 0.04)' }} />
                      <ReferenceLine
                        y={avg}
                        stroke="#64748B"
                        strokeDasharray="4 4"
                        label={{
                          value: `Rata-rata: ${String(Math.round(avg * 10) / 10).replace('.', ',')}%`,
                          position: 'insideTopRight',
                          fontSize: 11,
                          fontWeight: 700,
                          fill: '#334155',
                        }}
                      />
                      <Bar
                        dataKey="progress"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={42}
                        fill="#16314E"
                      >
                        {chartData.map((d) => (
                          <Cell key={d.uptId} fill={d.progress == null ? '#CBD5E1' : (MATRA_COLORS[d.matra]?.fill || '#94A3B8')} />
                        ))}
                        <LabelList
                          dataKey="progress"
                          position="top"
                          offset={6}
                          formatter={(v) => (v == null ? '' : `${String(Math.round(v * 10) / 10).replace('.', ',')}%`)}
                          style={{ fontSize: 10, fontWeight: 900, fill: '#1E293B' }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 pt-3 border-t border-surface-border">
                  <MatraLegend counts={matraCounts} />
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
