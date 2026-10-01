import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import api, { apiError } from '../../lib/api'
import {
  StatCard, StatusBadge, ProgressBar, EmptyState, SkeletonCards, SkeletonRows, Alert,
} from '../../components/ui'
import { IconPeople, IconGraduation, IconTarget, IconInput, IconChevronDown } from '../../components/icons'
import logoBpsdm from '../../assets/logo-bpsdm.png'
import { MONTHS, fmtNum, fmtPct, yearOptions } from '../../utils/format'

export default function UptDashboardPage() {
  const { user } = useAuth()
  const [year, setYear] = useState(new Date().getFullYear())
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

  // Tampilkan error state bila gagal memuat data
  if (error) {
    return (
      <div className="animate-fadeUp">
        <div className="page-header">
          <div>
            <h1 className="page-title">Dashboard Capaian</h1>
            <p className="page-desc">{user?.upt?.name}</p>
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
            <h1 className="page-title">Dashboard Capaian</h1>
            <p className="page-desc">{user?.upt?.name}</p>
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
                  Dashboard Capaian Realisasi
                </h1>
                <span className="rounded-full bg-gold-500/20 text-gold-300 text-[10px] font-extrabold px-2.5 py-0.5 border border-gold-500/30">
                  Tahun {year}
                </span>
              </div>
              <p className="text-xs text-navy-200 mt-0.5 max-w-2xl">
                Selamat datang kembali, <strong className="text-white">{user?.name || 'Admin UPT'}</strong>! Realisasi peserta &amp; lulusan terhadap target Perjanjian Kinerja <span className="font-bold text-gold-300">{user?.upt?.name || 'UPT'}</span> ({user?.upt?.code || ''}).
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
          <SkeletonCards count={4} />
          <div className="card mt-5"><SkeletonRows rows={6} /></div>
        </>
      ) : (
        <>
          {/* Kartu statistik ringkasan UPT */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={<IconTarget className="h-6 w-6" />}
              label="Target PK Peserta"
              value={hasTarget ? fmtNum(targetPeserta) : '—'}
              sub={hasTarget ? `Realisasi ${fmtNum(ach.totalPeserta)} (${fmtPct(ach.monthly.at(-1)?.pctPeserta)})` : 'Belum diatur — isi Input Diklat lalu Target PK'}
              tone="navy"
            />
            <StatCard
              icon={<IconTarget className="h-6 w-6" />}
              label="Target PK Lulusan"
              value={hasTarget ? fmtNum(targetLulusan) : '—'}
              sub={hasTarget ? `Realisasi ${fmtNum(ach.totalLulusan)} (${fmtPct(ach.monthly.at(-1)?.pctLulusan)})` : 'Belum diatur — isi Input Diklat lalu Target PK'}
              tone="gold"
              delay={60}
            />
            <StatCard
              icon={<IconPeople className="h-6 w-6" />}
              label="Total Peserta"
              value={fmtNum(ach.totalPeserta)}
              sub="Realisasi berjalan tahun ini"
              tone="sky"
              delay={120}
            />
            <StatCard
              icon={<IconGraduation className="h-6 w-6" />}
              label="Total Lulusan"
              value={fmtNum(ach.totalLulusan)}
              sub="Realisasi berjalan tahun ini"
              tone="emerald"
              delay={180}
            />
          </div>

          {/* Capaian tahunan */}
          <div className="card p-5 md:p-6 border-surface-border">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="card-title">Capaian Perjanjian Kinerja {year}</h3>
                <p className="card-subtitle">
                  Realisasi kumulatif terhadap target tahunan · <strong>{fmtNum(ach.totalKeseluruhan)}</strong> dari <strong>{hasTarget ? fmtNum(tTotal) : '—'}</strong> total target
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
            {/* Tabel rekap bulanan UPT */}
            <div className="card overflow-hidden">
              <div className="card-header border-b border-surface-border pb-4">
                <div>
                  <h3 className="card-title">Rekap Bulanan {year}</h3>
                  <p className="card-subtitle">Rincian per jenis kelamin &amp; status capaian bulanan</p>
                </div>
              </div>
              <div className="table-wrap overflow-x-auto">
                <table className="data-table" style={{ tableLayout: 'fixed', width: '100%' }}>
                  <colgroup>
                    <col style={{ width: '22%' }} />
                    <col style={{ width: '22%' }} />
                    <col style={{ width: '22%' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '20%' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="!text-left">Bulan</th>
                      <th className="!text-right">Peserta (L/P)</th>
                      <th className="!text-right">Lulusan (L/P)</th>
                      <th className="!text-right">Kumulatif</th>
                      <th className="!text-left">Status Peserta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(ach?.monthly || []).map((m) => (
                      <tr key={m.month}>
                        <td className="font-semibold text-navy-900">{MONTHS[m.month - 1]}</td>
                        <td className="td-number">
                          {m.hasData ? (
                            <span className="block truncate">{fmtNum(m.pesertaL)} / {fmtNum(m.pesertaP)}</span>
                          ) : (
                            <span className="text-navy-300">—</span>
                          )}
                        </td>
                        <td className="td-number">
                          {m.hasData ? (
                            <span className="block truncate">{fmtNum(m.lulusanL)} / {fmtNum(m.lulusanP)}</span>
                          ) : (
                            <span className="text-navy-300">—</span>
                          )}
                        </td>
                        <td className="td-number font-bold">{fmtNum(m.cumPeserta + m.cumLulusan)}</td>
                        <td><StatusBadge status={m.statusPeserta} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
