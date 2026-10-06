import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import api, { apiError } from '../../lib/api'
import {
  StatCard, StatusBadge, ProgressBar, EmptyState, SkeletonCards, SkeletonRows, Alert,
} from '../../components/ui'
import { IconPeople, IconGraduation, IconTarget, IconInput, IconChevronDown, IconSearch } from '../../components/icons'
import logoBpsdm from '../../assets/logo-bpsdm.png'
import { fmtNum, fmtPct, yearOptions } from '../../utils/format'

const MONTH_LABEL = {
  1: 'Januari', 2: 'Februari', 3: 'Maret', 4: 'April', 5: 'Mei', 6: 'Juni',
  7: 'Juli', 8: 'Agustus', 9: 'September', 10: 'Oktober', 11: 'November', 12: 'Desember',
}

const MONTH_FILTER = [
  { v: 0, label: 'Setahun' },
  { v: 1, label: 'Jan' },
  { v: 2, label: 'Feb' },
  { v: 3, label: 'Mar' },
  { v: 4, label: 'Apr' },
  { v: 5, label: 'Mei' },
  { v: 6, label: 'Jun' },
  { v: 7, label: 'Jul' },
  { v: 8, label: 'Agu' },
  { v: 9, label: 'Sep' },
  { v: 10, label: 'Okt' },
  { v: 11, label: 'Nov' },
  { v: 12, label: 'Des' },
]

export default function UptDashboardPage() {
  const { user } = useAuth()
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(0)
  const [query, setQuery] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data: res } = await api.get('/realizations/my', { params: { year } })
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

  const ach = data?.achievement
  const targetPeserta = ach?.targetPeserta ?? null
  const targetLulusan = ach?.targetLulusan ?? null
  const hasTarget = data?.hasAnyTarget


  const tTotal = (targetPeserta || 0) + (targetLulusan || 0)

  // Rincian per program (tahun berjalan / bulan terpilih) + search
  const programRows = useMemo(() => {
    const list = data?.byProgram || []
    const q = query.trim().toLowerCase()
    return list
      .map((p) => {
        const tgt = (Number(p.target?.targetPeserta) || 0) + (Number(p.target?.targetLulusan) || 0)
        let peserta = p.achievement?.totalPeserta || 0
        let lulusan = p.achievement?.totalLulusan || 0
        if (month >= 1) {
          const mRow = p.achievement?.monthly?.find((m) => Number(m.month) === month)
          peserta = mRow?.totalPeserta || 0
          lulusan = mRow?.totalLulusan || 0
        }
        const total = peserta + lulusan
        const pct = tgt > 0 ? Math.round((total / tgt) * 1000) / 10 : null
        return {
          id: p.programId,
          name: p.programName || 'Program',
          parent: p.parentName || '-',
          target: tgt,
          peserta,
          lulusan,
          total,
          pct,
        }
      })
      .filter((r) => {
        if (!q) return true
        return r.name.toLowerCase().includes(q) || r.parent.toLowerCase().includes(q)
      })
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  }, [data, query, month])

  const programTotals = useMemo(() => {
    return programRows.reduce(
      (s, r) => ({ target: s.target + r.target, peserta: s.peserta + r.peserta, lulusan: s.lulusan + r.lulusan, total: s.total + r.total }),
      { target: 0, peserta: 0, lulusan: 0, total: 0 },
    )
  }, [programRows])

  // Tampilkan error state bila gagal memuat data
  if (error) {
    return (
      <div className="animate-fadeUp">
        <div className="page-header">
          <div>
            <h1 className="page-title">Dashboard Realisasi Peserta dan Lulusan</h1>
            <p className="page-desc">Selamat datang kembali, {user?.name || 'Admin UPT'}!</p>
          </div>
        </div>
        <Alert type="error">{error}</Alert>
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn-primary" onClick={load}>
            Muat Ulang
          </button>
          <button type="button" className="btn-secondary" onClick={() => window.location.reload()}>
            Muat Ulang Halaman
          </button>
        </div>
      </div>
    )
  }

  if (!loading && (!data || !data.achievement)) {
    return (
      <div className="animate-fadeUp">
        <div className="page-header">
          <div>
            <h1 className="page-title">Dashboard Realisasi Peserta dan Lulusan</h1>
            <p className="page-desc">Selamat datang kembali, {user?.name || 'Admin UPT'}!</p>
          </div>
        </div>
        <EmptyState
          icon={<IconTarget className="h-6 w-6" />}
          title="Belum ada data"
          desc="Data capaian belum tersedia. Coba muat ulang."
        />
      </div>
    )
  }

  return (
    <div className="animate-fadeUp space-y-6">
      {/* Banner Header Dashboard UPT */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-navy-950 via-navy-900 to-navy-950 px-5 py-4 text-white shadow-md border border-navy-800">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-gold-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 p-1.5 shadow-inner border border-white/15 backdrop-blur-md" style={{ width: '40px', height: '40px' }}>
              <img src={logoBpsdm} alt="Logo BPSDMP" className="h-full w-full object-contain max-h-7 max-w-7" onError={(e) => e.target.style.display = 'none'} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-black text-white tracking-tight">
                  Dashboard Realisasi Peserta dan Lulusan
                </h1>
                <span className="rounded-full bg-gold-500/20 text-gold-300 text-[10px] font-extrabold px-2.5 py-0.5 border border-gold-500/30">
                  Tahun {year}
                </span>
              </div>
              <p className="text-xs text-navy-200 mt-0.5 max-w-2xl">
                Selamat datang kembali, <strong className="text-white">{user?.name || 'Admin UPT'}</strong>!
              </p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start lg:self-auto">
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

              <Link to="/upt/target-pk" className="btn-secondary !bg-white/10 hover:!bg-white/20 !text-white !border-white/20 !py-2.5 backdrop-blur-md">
                <IconTarget className="h-4 w-4" /> Target PK
              </Link>
              <Link to="/upt/input" className="btn-gold !py-2.5 shadow-md hover:shadow-gold-500/20">
                <IconInput className="h-4 w-4" /> Input Realisasi
              </Link>
            </div>
          </div>
        </div>

      {error && <div className="mb-5"><Alert type="error">{error}</Alert></div>}

      {loading ? (
        <>
          <SkeletonCards count={3} />
          <div className="card mt-5"><SkeletonRows rows={6} /></div>
        </>
      ) : (
        <>
          {/* Kartu statistik ringkasan UPT */}
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              icon={<IconTarget className="h-6 w-6" />}
              label="Target PK"
              value={hasTarget ? fmtNum(tTotal) : '—'}
              sub={hasTarget ? `Realisasi ${fmtNum(ach.totalKeseluruhan)}` : 'Belum diatur'}
              tone="navy"
            />
            <StatCard
              icon={<IconPeople className="h-6 w-6" />}
              label="Total Peserta"
              value={fmtNum(ach.totalPeserta)}
              sub="Tahun ini"
              tone="sky"
              delay={60}
            />
            <StatCard
              icon={<IconGraduation className="h-6 w-6" />}
              label="Total Lulusan"
              value={fmtNum(ach.totalLulusan)}
              sub="Tahun ini"
              tone="emerald"
              delay={120}
            />
          </div>

          {/* Capaian tahunan */}
          <div className="card p-5 md:p-6 border-surface-border">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="card-title">Capaian {year}</h3>
                <p className="card-subtitle">
                  <strong>{fmtNum(ach.totalKeseluruhan)}</strong> dari <strong>{hasTarget ? fmtNum(tTotal) : '—'}</strong> target
                </p>
              </div>
              <StatusBadge status={ach.yearlyStatus} />
            </div>
            {tTotal > 0 ? (
              <ProgressBar value={ach.yearlyPct ?? 0} />
            ) : (
              <EmptyState
                icon={<IconTarget className="h-6 w-6" />}
                title="Target PK belum diatur"
                desc="Anda belum mengisi target PK tahun ini. Buka menu Input Diklat lalu Target PK untuk menetapkan target satu kali."
                action={<Link to="/upt/target-pk" className="btn-primary !rounded-xl"><IconTarget className="h-4 w-4" /> Atur Target PK</Link>}
              />
            )}
          </div>

          <div>
            {/* Grafik rekap bulanan UPT */}
            <div className="card overflow-hidden">
              <div className="card-header border-b border-surface-border pb-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="card-title">Grafik Bulanan {year}</h3>
                    <p className="card-subtitle">Peserta &amp; lulusan per bulan</p>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] font-bold text-navy-700">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-sky-500" /> Peserta
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> Lulusan
                    </span>
                  </div>
                </div>
              </div>
              <div className="p-4 md:p-5">
                {(() => {
                  const rows = ach?.monthly || []
                  const maxVal = Math.max(1, ...rows.map((m) => Math.max(m.totalPeserta || 0, m.totalLulusan || 0)))
                  const short = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
                  if (!rows.some((m) => m.hasData)) {
                    return <p className="text-sm text-navy-400 text-center py-6">Belum ada realisasi tahun ini.</p>
                  }
                  return (
                    <div className="flex items-end gap-1.5 sm:gap-2.5 h-48" role="img" aria-label={`Grafik realisasi bulanan ${year}`}>
                      {rows.map((m) => {
                        const pH = Math.round(((m.totalPeserta || 0) / maxVal) * 100)
                        const lH = Math.round(((m.totalLulusan || 0) / maxVal) * 100)
                        return (
                          <div key={m.month} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                            <div className="flex items-end justify-center gap-1 h-36 w-full">
                              <div
                                className="w-3 sm:w-4 rounded-t-md bg-sky-500 transition-all"
                                style={{ height: `${Math.max(m.hasData ? 4 : 0, pH)}%` }}
                                title={`${short[m.month - 1]} — Peserta: ${fmtNum(m.totalPeserta)}`}
                              />
                              <div
                                className="w-3 sm:w-4 rounded-t-md bg-emerald-500 transition-all"
                                style={{ height: `${Math.max(m.hasData ? 4 : 0, lH)}%` }}
                                title={`${short[m.month - 1]} — Lulusan: ${fmtNum(m.totalLulusan)}`}
                              />
                            </div>
                            <span className="text-[10px] font-bold text-navy-500">{short[m.month - 1]}</span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>

          <div>
            {/* Rincian per program + search */}
            <div className="card overflow-hidden">
              <div className="card-header border-b border-surface-border pb-4">
                <div className="flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
                  <div>
                    <h3 className="card-title">
                      Per Program {month >= 1 ? MONTH_LABEL[month] : ''} {year}
                    </h3>
                    <p className="card-subtitle">
                      {programRows.length} program · Total {fmtNum(programTotals.total)} dari {fmtNum(programTotals.target)} target
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative">
                      <IconSearch className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-300 pointer-events-none" />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Cari program… mis. pembibitan"
                        className="w-full sm:w-56 text-xs pl-8 pr-3 py-2 rounded-xl border border-surface-border bg-white focus:outline-none focus:ring-2 focus:ring-gold-400"
                      />
                    </div>
                    <div className="relative">
                      <select
                        value={month}
                        onChange={(e) => setMonth(Number(e.target.value))}
                        className="appearance-none cursor-pointer text-xs font-bold border border-surface-border rounded-xl py-2 pl-3 pr-8 bg-white focus:outline-none focus:ring-2 focus:ring-gold-400"
                      >
                        {MONTH_FILTER.map((m) => (
                          <option key={m.v} value={m.v}>{m.v === 0 ? `Setahun ${year}` : `${m.label} ${year}`}</option>
                        ))}
                      </select>
                      <IconChevronDown className="h-4 w-4 absolute right-2 top-1/2 -translate-y-1/2 text-navy-300 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>
              {programRows.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={<IconSearch className="h-6 w-6" />}
                    title={query ? 'Program tidak ditemukan' : 'Belum ada data program'}
                    desc={query ? `Tidak ada program cocok "${query}".` : 'Isi realisasi agar rincian per program muncul di sini.'}
                  />
                </div>
              ) : (
                <div className="table-wrap overflow-x-auto">
                  <table className="data-table" style={{ tableLayout: 'fixed', width: '100%' }}>
                    <colgroup>
                      <col style={{ width: '34%' }} />
                      <col style={{ width: '18%' }} />
                      <col style={{ width: '12%' }} />
                      <col style={{ width: '12%' }} />
                      <col style={{ width: '12%' }} />
                      <col style={{ width: '12%' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="!text-left">Program</th>
                        <th className="!text-right">Target</th>
                        <th className="!text-right">Peserta</th>
                        <th className="!text-right">Lulusan</th>
                        <th className="!text-right">Total</th>
                        <th className="!text-right">Capaian</th>
                      </tr>
                    </thead>
                    <tbody>
                      {programRows.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <p className="font-bold text-navy-900 truncate" title={r.name}>{r.name}</p>
                            <p className="text-[11px] text-navy-400 truncate">{r.parent}</p>
                          </td>
                          <td className="td-number">{fmtNum(r.target)}</td>
                          <td className="td-number">{fmtNum(r.peserta)}</td>
                          <td className="td-number">{fmtNum(r.lulusan)}</td>
                          <td className="td-number font-bold">{fmtNum(r.total)}</td>
                          <td className="td-number font-bold">{r.pct != null ? fmtPct(r.pct) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-navy-50/60 font-bold">
                        <td className="!text-left">Total tampil</td>
                        <td className="td-number">{fmtNum(programTotals.target)}</td>
                        <td className="td-number">{fmtNum(programTotals.peserta)}</td>
                        <td className="td-number">{fmtNum(programTotals.lulusan)}</td>
                        <td className="td-number">{fmtNum(programTotals.total)}</td>
                        <td className="td-number">—</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
