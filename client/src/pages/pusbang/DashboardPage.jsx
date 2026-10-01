import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
  PieChart, Pie,
} from 'recharts'
import api, { apiError } from '../../lib/api'
import { Alert, SkeletonCards } from '../../components/ui'
import {
  IconBuilding, IconTarget, IconShip, IconTruck, IconPlane,
  IconChevronDown, IconUnlock, IconRefresh, IconSearch,
  IconGraduation, IconFileText, IconArrowRight, IconCheck, IconX,
} from '../../components/icons'
import logoBpsdm from '../../assets/logo-bpsdm.png'
import { fmtNum, yearOptions } from '../../utils/format'

const MATRA_CONFIG = {
  laut: {
    label: 'Matra Laut',
    tone: 'sky',
    accentColor: '#0284c7',
    secondaryColor: '#0369a1',
    gradient: 'from-sky-950 via-sky-900 to-navy-950',
    border: 'border-sky-800',
    badge: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    icon: IconShip,
  },
  darat: {
    label: 'Matra Darat',
    tone: 'emerald',
    accentColor: '#059669',
    secondaryColor: '#047857',
    gradient: 'from-emerald-950 via-teal-900 to-navy-950',
    border: 'border-emerald-800',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    icon: IconTruck,
  },
  udara: {
    label: 'Matra Udara',
    tone: 'violet',
    accentColor: '#7c3aed',
    secondaryColor: '#6d28d9',
    gradient: 'from-violet-950 via-purple-900 to-navy-950',
    border: 'border-violet-800',
    badge: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    icon: IconPlane,
  },
}

const CATEGORY_COLORS = {
  pns: '#059669', // emerald
  bumn_bumd: '#0284c7', // sky
  ppnpn: '#7c3aed', // violet
  swasta: '#f59e0b', // amber
  belum_bekerja: '#94a3b8', // slate
}

const CATEGORY_LABELS = {
  pns: 'PNS / ASN',
  bumn_bumd: 'BUMN / BUMD',
  ppnpn: 'PPNPN',
  swasta: 'Swasta / Industri',
  belum_bekerja: 'Belum Bekerja',
}

function CustomUptTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur-md p-3.5 shadow-xl text-xs min-w-[220px]">
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
        <span className="font-extrabold uppercase tracking-wide text-slate-400 text-[10px]">UPT Kinerja</span>
        <span className="font-black text-sky-700">{d.uptCode}</span>
      </div>
      <p className="font-bold text-slate-900 mt-1.5 leading-snug">{d.uptName}</p>
      <div className="mt-2 space-y-1 pt-2 border-t border-slate-100 text-[11px]">
        <div className="flex justify-between">
          <span className="text-slate-500">Realisasi Peserta:</span>
          <span className="font-bold text-slate-800">{fmtNum(d.realPeserta)} / {fmtNum(d.targetPeserta)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Realisasi Lulusan:</span>
          <span className="font-bold text-slate-800">{fmtNum(d.realLulusan)} / {fmtNum(d.targetLulusan)}</span>
        </div>
        <div className="flex justify-between pt-1 border-t border-dashed border-slate-200">
          <span className="font-bold text-slate-600">Capaian PK:</span>
          <span className="font-black text-emerald-600">{d.progress}%</span>
        </div>
      </div>
    </div>
  )
}

function CustomMonthlyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur-md p-3 shadow-xl text-xs min-w-[180px]">
      <p className="font-black text-slate-900 pb-1.5 border-b border-slate-100">Bulan {label}</p>
      <div className="mt-2 space-y-1 text-[11px]">
        {payload.map((p) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="text-slate-500">{p.name}:</span>
            </div>
            <span className="font-bold text-slate-900">{fmtNum(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PusbangDashboardPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Chart Controls
  const [sortOrder, setSortOrder] = useState('desc') // 'desc' | 'code'
  const [uptMetric, setUptMetric] = useState('counts') // 'counts' | 'percent'

  // UPT Table Controls
  const [searchUpt, setSearchUpt] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'tercapai' | 'belum_tercapai' | 'belum_lapor'

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data: res } = await api.get('/dashboard/pusbang', { params: { year } })
      setData(res)
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    load()
  }, [load])

  const matraKey = (data?.matra || 'laut').toLowerCase()
  const matraInfo = MATRA_CONFIG[matraKey] || MATRA_CONFIG.laut
  const MatraIcon = matraInfo.icon

  // Data for UPT Performance Chart
  const uptChartData = useMemo(() => {
    if (!data?.upts) return []
    const list = [...data.upts].map((u) => ({
      ...u,
      progress: u.progress != null ? Number(u.progress) : 0,
      realPeserta: u.realPeserta || 0,
      targetPeserta: u.targetPeserta || 0,
      realLulusan: u.realLulusan || 0,
      targetLulusan: u.targetLulusan || 0,
    }))

    if (sortOrder === 'desc') {
      list.sort((a, b) => b.progress - a.progress)
    } else {
      list.sort((a, b) => (a.uptCode || '').localeCompare(b.uptCode || ''))
    }
    return list
  }, [data?.upts, sortOrder])

  // Data for Absorption Pie Chart
  const pieData = useMemo(() => {
    if (!data?.tarunaSummary?.categories) return []
    const cats = data.tarunaSummary.categories
    return Object.entries(cats)
      .map(([key, val]) => ({
        key,
        name: CATEGORY_LABELS[key] || key,
        value: val,
        color: CATEGORY_COLORS[key] || '#94a3b8',
      }))
      .filter((item) => item.value > 0)
  }, [data?.tarunaSummary])

  // Filtered UPT List for Table
  const filteredUptList = useMemo(() => {
    if (!data?.upts) return []
    return data.upts.filter((u) => {
      const matchSearch =
        searchUpt === '' ||
        (u.uptCode || '').toLowerCase().includes(searchUpt.toLowerCase()) ||
        (u.uptName || '').toLowerCase().includes(searchUpt.toLowerCase())

      if (!matchSearch) return false

      if (statusFilter === 'tercapai') return u.yearlyStatus === 'TERCAPAI'
      if (statusFilter === 'belum_tercapai') return u.yearlyStatus === 'BELUM_TERCAPAI'
      if (statusFilter === 'belum_lapor') return !u.hasReal

      return true
    })
  }, [data?.upts, searchUpt, statusFilter])

  if (loading) {
    return (
      <div className="animate-fadeUp space-y-6">
        <div className="h-36 rounded-2xl bg-slate-200/70 animate-pulse" />
        <SkeletonCards count={4} />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-80 rounded-2xl bg-slate-100 animate-pulse" />
          <div className="h-80 rounded-2xl bg-slate-100 animate-pulse" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <Alert type="error">{error}</Alert>
      </div>
    )
  }

  if (!data) return null

  const targetPeserta = data.totalTargetPeserta || 0
  const realPeserta = data.totalPeserta || 0
  const pctPeserta = targetPeserta > 0 ? ((realPeserta / targetPeserta) * 100).toFixed(1) : 0

  const targetLulusan = data.totalTargetLulusan || 0
  const realLulusan = data.totalLulusan || 0
  const pctLulusan = targetLulusan > 0 ? ((realLulusan / targetLulusan) * 100).toFixed(1) : 0

  return (
    <div className="animate-fadeUp space-y-6">
      {/* 1. HERO BANNER PUSBANG */}
      <div
        className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${matraInfo.gradient} px-5 py-4 text-white shadow-md border ${matraInfo.border}`}
      >
        <div className="absolute right-0 top-0 -mt-10 -mr-10 h-64 w-64 rounded-full bg-white/5 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 p-1.5 shadow-inner border border-white/20 backdrop-blur-md" style={{ width: '40px', height: '40px' }}>
              <img
                src={logoBpsdm}
                alt="Logo BPSDMP"
                className="h-full w-full object-contain max-h-7 max-w-7"
                onError={(e) => (e.target.style.display = 'none')}
              />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider border ${matraInfo.badge}`}>
                  <MatraIcon className="h-3 w-3" />
                  {matraInfo.label}
                </span>
                <span className="text-[11px] font-bold text-white/60">Tahun Anggaran {year}</span>
              </div>
              <h1 className="text-base sm:text-lg font-black text-white tracking-tight mt-0.5">
                Dashboard Monitoring — {matraInfo.label}
              </h1>
              <p className="text-xs text-white/80 mt-0.5 max-w-xl">
                Pemantauan capaian kinerja, pelaporan realisasi, dan penyerapan lulusan {data.upts?.length || 0} UPT di lingkungan Pusbang {matraInfo.label}.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 self-start md:self-center">
            {/* Year Selector */}
            <div className="relative">
              <select
                className="appearance-none cursor-pointer bg-white/10 hover:bg-white/20 border border-white/20 text-white font-extrabold text-xs rounded-xl py-2 pl-3 pr-8 shadow-sm backdrop-blur-md transition-all focus:outline-none focus:ring-2 focus:ring-white/40"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {yearOptions().map((y) => (
                  <option key={y} value={y} className="bg-slate-900 text-white font-bold py-1">
                    Tahun {y}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-white/70">
                <IconChevronDown className="h-3.5 w-3.5" />
              </div>
            </div>

            <button
              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white transition-all shadow-sm"
              onClick={load}
              title="Refresh Data"
            >
              <IconRefresh className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. PROMINENT UNLOCK REQUEST ALERT BANNER (If any) */}
      {data.pendingUnlockCount > 0 && (
        <div className="rounded-2xl border border-amber-300/80 bg-gradient-to-r from-amber-500/10 via-amber-50 to-amber-100/50 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm animate-pulse-slow">
          <div className="flex items-start gap-3.5">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md">
              <IconUnlock className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-amber-950 uppercase tracking-wide">
                  Permohonan Buka Kunci Menunggu Tindak Lanjut
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-200 text-amber-900 border border-amber-300">
                  {data.pendingUnlockCount} Pengajuan
                </span>
              </div>
              <p className="text-xs text-amber-900/80 mt-0.5 leading-relaxed">
                Terdapat pengajuan unlock dari Pimpinan UPT di matra Anda. Pusbang bertugas memverifikasi dan meneruskan permohonan ke Admin BPSDMP.
              </p>
            </div>
          </div>
          <Link
            to="/pusbang/unlock"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md transition-all shrink-0"
          >
            <span>Verifikasi Sekarang</span>
            <IconArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {/* 3. EXECUTIVE KPI CARDS */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total UPT */}
        <div className="card p-5 border-slate-200 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total UPT Matra</span>
            <div className="h-10 w-10 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center border border-sky-100">
              <IconBuilding className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{fmtNum(data.upts?.length || 0)} <span className="text-xs font-semibold text-slate-500">UPT</span></p>
          <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-slate-100">
            <span className="text-slate-500">Kepatuhan Lapor:</span>
            <span className="font-black text-emerald-600">
              {data.reportedUptCount || 0} / {data.upts?.length || 0} UPT
            </span>
          </div>
        </div>

        {/* Card 2: Capaian Peserta */}
        <div className="card p-5 border-slate-200 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Realisasi Peserta</span>
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100">
              <IconCheck className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{fmtNum(realPeserta)}</p>
          <div className="mt-3 space-y-1.5 pt-2 border-t border-slate-100 text-xs">
            <div className="flex justify-between items-center text-slate-500">
              <span>Target: {fmtNum(targetPeserta)}</span>
              <span className="font-black text-emerald-600">{pctPeserta}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, pctPeserta)}%` }} />
            </div>
          </div>
        </div>

        {/* Card 3: Capaian Lulusan */}
        <div className="card p-5 border-slate-200 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Realisasi Lulusan</span>
            <div className="h-10 w-10 rounded-xl bg-violet-50 text-violet-700 flex items-center justify-center border border-violet-100">
              <IconTarget className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{fmtNum(realLulusan)}</p>
          <div className="mt-3 space-y-1.5 pt-2 border-t border-slate-100 text-xs">
            <div className="flex justify-between items-center text-slate-500">
              <span>Target: {fmtNum(targetLulusan)}</span>
              <span className="font-black text-violet-600">{pctLulusan}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-violet-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, pctLulusan)}%` }} />
            </div>
          </div>
        </div>

        {/* Card 4: Penyerapan Lulusan */}
        <div className="card p-5 border-slate-200 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Serapan Lulusan</span>
            <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-100">
              <IconGraduation className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{data.tarunaSummary?.absorptionPct || 0}%</p>
          <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-slate-100">
            <span className="text-slate-500">Terserap / Terdata:</span>
            <span className="font-black text-amber-700">
              {fmtNum(data.tarunaSummary?.totalAbsorbed || 0)} / {fmtNum(data.tarunaSummary?.totalGradRecords || 0)}
            </span>
          </div>
        </div>
      </div>

      {/* 4. DATA VISUALIZATION SECTION: CHARTS */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* CHART 1: Realisasi vs Target per UPT */}
        <div className="card p-5 border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-black text-slate-900 text-sm tracking-wide uppercase">
                  Performa Capaian per UPT
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Perbandingan capaian realisasi dan target kinerja di tiap UPT
                </p>
              </div>

              {/* Toggles */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-[11px] font-bold">
                  <button
                    type="button"
                    className={`px-2.5 py-1 rounded-md transition-all ${sortOrder === 'desc' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}
                    onClick={() => setSortOrder('desc')}
                  >
                    Tertinggi
                  </button>
                  <button
                    type="button"
                    className={`px-2.5 py-1 rounded-md transition-all ${sortOrder === 'code' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}
                    onClick={() => setSortOrder('code')}
                  >
                    Nama UPT
                  </button>
                </div>

                <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-[11px] font-bold">
                  <button
                    type="button"
                    className={`px-2.5 py-1 rounded-md transition-all ${uptMetric === 'counts' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}
                    onClick={() => setUptMetric('counts')}
                  >
                    Jumlah
                  </button>
                  <button
                    type="button"
                    className={`px-2.5 py-1 rounded-md transition-all ${uptMetric === 'percent' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}
                    onClick={() => setUptMetric('percent')}
                  >
                    % Capaian
                  </button>
                </div>
              </div>
            </div>

            {/* Recharts BarChart */}
            <div className="h-72 w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                {uptMetric === 'counts' ? (
                  <BarChart data={uptChartData} margin={{ top: 10, right: 10, left: -10, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="uptCode"
                      tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                      interval={0}
                      angle={-35}
                      textAnchor="end"
                    />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                    <Tooltip content={<CustomUptTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    <Bar dataKey="realPeserta" name="Realisasi Peserta" fill="#0284c7" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="realLulusan" name="Realisasi Lulusan" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                ) : (
                  <BarChart data={uptChartData} margin={{ top: 10, right: 10, left: -10, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="uptCode"
                      tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                      interval={0}
                      angle={-35}
                      textAnchor="end"
                    />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} domain={[0, 120]} tickFormatter={(v) => `${v}%`} />
                    <Tooltip content={<CustomUptTooltip />} />
                    <Bar dataKey="progress" name="Persentase Capaian (%)" radius={[4, 4, 0, 0]}>
                      {uptChartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.progress >= 80 ? '#10b981' : entry.progress >= 50 ? '#f59e0b' : '#ef4444'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Menampilkan {uptChartData.length} UPT</span>
            <div className="flex items-center gap-3 font-semibold">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> ≥80% Tercapai</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> 50-79%</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> &lt;50%</span>
            </div>
          </div>
        </div>

        {/* CHART 2: Tren Bulanan Matra (Jan - Des) */}
        <div className="card p-5 border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="pb-3 border-b border-slate-100">
              <h3 className="font-black text-slate-900 text-sm tracking-wide uppercase">
                Tren Realisasi Bulanan Matra {matraInfo.label}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Progres capaian bulanan peserta dan lulusan sepanjang tahun {year}
              </p>
            </div>

            <div className="h-72 w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthlySeries || []} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                  <Tooltip content={<CustomMonthlyTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Bar dataKey="realPeserta" name="Realisasi Peserta" fill="#0284c7" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="realLulusan" name="Realisasi Lulusan" fill="#10b981" stackId="a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Data bersumber dari pelaporan realisasi bulanan UPT yang disetujui</span>
            <Link to="/pusbang/monitoring" className="text-sky-600 font-bold hover:underline flex items-center gap-1">
              <span>Detail Monitoring</span>
              <IconArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* CHART 3: Distribusi Penyerapan Lulusan */}
        <div className="card p-5 border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="pb-3 border-b border-slate-100">
              <h3 className="font-black text-slate-900 text-sm tracking-wide uppercase">
                Komposisi Penyerapan Lulusan
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Distribusi status kerja lulusan taruna UPT Matra {matraInfo.label}
              </p>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row items-center justify-around gap-4">
              <div className="h-60 w-60 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={85}
                      paddingAngle={3}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`pie-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, name) => [`${fmtNum(value)} Lulusan`, name]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legends with values */}
              <div className="space-y-2 w-full max-w-xs text-xs">
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
                  const val = data.tarunaSummary?.categories?.[key] || 0
                  const color = CATEGORY_COLORS[key]
                  const pct =
                    data.tarunaSummary?.totalGradRecords > 0
                      ? ((val / data.tarunaSummary.totalGradRecords) * 100).toFixed(1)
                      : 0
                  return (
                    <div key={key} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                        <span className="font-bold text-slate-700">{label}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-extrabold text-slate-900">{fmtNum(val)}</span>
                        <span className="text-[10px] text-slate-400 ml-1.5">({pct}%)</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Total {fmtNum(data.tarunaSummary?.totalGradRecords || 0)} data serapan lulusan terdata</span>
            <Link to="/pusbang/penyerapan" className="text-sky-600 font-bold hover:underline flex items-center gap-1">
              <span>Buka Menu Penyerapan</span>
              <IconArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* CHART 4: Ringkasan Tugas & Quick Actions Pusbang */}
        <div className="card p-5 border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="pb-3 border-b border-slate-100">
              <h3 className="font-black text-slate-900 text-sm tracking-wide uppercase">
                Peran &amp; Kewenangan Admin Pusbang
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Alur monitoring pelaporan dan penerusan permohonan buka kunci (unlock)
              </p>
            </div>

            <div className="mt-4 space-y-3">
              {/* Stepper info box */}
              <div className="p-4 rounded-2xl bg-sky-50/70 border border-sky-200/70 space-y-2">
                <p className="text-xs font-black text-sky-950 uppercase tracking-wide">
                  Alur Penerusan Permohonan Buka Kunci (Unlock):
                </p>
                <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] font-bold">
                  <div className="p-2 rounded-xl bg-white border border-sky-200 text-slate-600">
                    <span className="block text-slate-400 font-black">1</span>
                    Admin UPT
                  </div>
                  <div className="p-2 rounded-xl bg-white border border-sky-200 text-slate-600">
                    <span className="block text-slate-400 font-black">2</span>
                    Pimpinan UPT
                  </div>
                  <div className="p-2 rounded-xl bg-sky-600 text-white shadow-sm ring-2 ring-sky-400">
                    <span className="block text-sky-200 font-black">3 [Anda]</span>
                    Pusbang
                  </div>
                  <div className="p-2 rounded-xl bg-white border border-sky-200 text-slate-600">
                    <span className="block text-slate-400 font-black">4</span>
                    Admin BPSDMP
                  </div>
                </div>
                <p className="text-[11px] text-sky-900 leading-relaxed pt-1">
                  * Pusbang bertugas memantau seluruh pelaporan UPT dan <strong>menyetujui penerusan</strong> unlock request ke Admin BPSDMP. Pusbang tidak melakukan approval pelaporan realisasi.
                </p>
              </div>

              {/* Quick Navigation links */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <Link
                  to="/pusbang/monitoring"
                  className="p-3 rounded-xl border border-slate-200 hover:border-sky-300 hover:bg-sky-50/30 transition-all flex items-center gap-2.5"
                >
                  <div className="h-8 w-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                    <IconFileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">Monitoring Realisasi</p>
                    <p className="text-[10px] text-slate-400">Pantau bulanan UPT</p>
                  </div>
                </Link>

                <Link
                  to="/pusbang/unlock"
                  className="p-3 rounded-xl border border-slate-200 hover:border-amber-300 hover:bg-amber-50/30 transition-all flex items-center gap-2.5"
                >
                  <div className="h-8 w-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                    <IconUnlock className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">Persetujuan Unlock</p>
                    <p className="text-[10px] text-slate-400">{data.pendingUnlockCount || 0} menunggu</p>
                  </div>
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Role: Admin Pusbang {matraInfo.label}</span>
            <span className="font-bold text-emerald-600">Sistem Berjalan Normal</span>
          </div>
        </div>
      </div>

      {/* 5. INTERACTIVE UPT MONITORING TABLE & MATRIX */}
      <div className="card p-5 border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-black text-slate-900 text-sm uppercase tracking-wide">
              Matriks Kinerja &amp; Status Pelaporan UPT Matra {matraInfo.label}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Daftar seluruh UPT matra {data.matra} dengan rincian target, realisasi, dan status capaian
            </p>
          </div>

          {/* Filters & Search */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                placeholder="Cari kode atau nama UPT..."
                value={searchUpt}
                onChange={(e) => setSearchUpt(e.target.value)}
                className="text-xs font-medium rounded-xl border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 w-56 focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400">
                <IconSearch className="h-3.5 w-3.5" />
              </div>
            </div>

            {/* Status Filter Dropdown */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 py-2 pl-3 pr-8 focus:outline-none focus:ring-2 focus:ring-sky-400"
              >
                <option value="all">Semua Status</option>
                <option value="tercapai">Target Tercapai (≥80%)</option>
                <option value="belum_tercapai">Belum Tercapai</option>
                <option value="belum_lapor">Belum Input Laporan</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                <IconChevronDown className="h-3 w-3" />
              </div>
            </div>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <th className="py-3 px-3.5 text-center w-12">No</th>
                <th className="py-3 px-3.5">Kode &amp; Nama UPT</th>
                <th className="py-3 px-3.5 text-right">Target Peserta</th>
                <th className="py-3 px-3.5 text-right">Realisasi Peserta</th>
                <th className="py-3 px-3.5 text-right">Target Lulusan</th>
                <th className="py-3 px-3.5 text-right">Realisasi Lulusan</th>
                <th className="py-3 px-3.5 text-center w-36">Progres Capaian</th>
                <th className="py-3 px-3.5 text-center">Status</th>
                <th className="py-3 px-3.5 text-center w-28">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUptList.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    Tidak ditemukan UPT dengan kriteria pencarian tersebut.
                  </td>
                </tr>
              ) : (
                filteredUptList.map((u, idx) => {
                  const progress = u.progress != null ? Number(u.progress) : 0
                  const isAchieved = u.yearlyStatus === 'TERCAPAI'
                  return (
                    <tr key={u.uptId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-3.5 text-center font-bold text-slate-400">{idx + 1}</td>
                      <td className="py-3 px-3.5">
                        <p className="font-extrabold text-slate-900">{u.uptCode}</p>
                        <p className="text-[11px] text-slate-500 line-clamp-1">{u.uptName}</p>
                      </td>
                      <td className="py-3 px-3.5 text-right font-medium text-slate-600">{fmtNum(u.targetPeserta)}</td>
                      <td className="py-3 px-3.5 text-right font-bold text-sky-700">{fmtNum(u.realPeserta)}</td>
                      <td className="py-3 px-3.5 text-right font-medium text-slate-600">{fmtNum(u.targetLulusan)}</td>
                      <td className="py-3 px-3.5 text-right font-bold text-violet-700">{fmtNum(u.realLulusan)}</td>
                      <td className="py-3 px-3.5">
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="font-bold text-slate-700">{progress}%</span>
                            <span className="text-slate-400">{u.reportedMonthsCount || 0} bln lapor</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                progress >= 80 ? 'bg-emerald-500' : progress >= 50 ? 'bg-amber-500' : progress > 0 ? 'bg-rose-500' : 'bg-slate-200'
                              }`}
                              style={{ width: `${Math.min(100, progress)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3.5 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            !u.hasReal
                              ? 'bg-slate-100 text-slate-500'
                              : isAchieved
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {!u.hasReal ? 'Belum Lapor' : isAchieved ? 'Tercapai' : 'Proses'}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-center">
                        <Link
                          to={`/pusbang/monitoring?uptId=${u.uptId}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-sky-700 hover:bg-sky-50 border border-sky-200/80 transition-all"
                        >
                          <span>Pantau</span>
                          <IconArrowRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
