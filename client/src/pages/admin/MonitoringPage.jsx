import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import api, { apiError } from '../../lib/api'
import { StatCard, EmptyState, SkeletonRows, Alert, StatusBadge } from '../../components/ui'
import {
  IconChart, IconRefresh, IconCheck, IconX, IconTarget, IconLayers, IconBuilding, IconFlag,
} from '../../components/icons'
import { MONTHS_SHORT, fmtNum, yearOptions } from '../../utils/format'
import clsx from 'clsx'

/**
 * Monitoring Realisasi (admin): perbandingan realisasi vs target PK.
 * Dua tampilan:
 *  1. "Per UPT"    - tiap baris satu UPT, sel per bulan kumulatif (Jan..bulan terpilih)
 *  2. "Per Program" - tiap baris satu program (induk & turunan), agregat seluruh UPT
 * Setiap sel menampilkan real/target + warna status: hijau tercapai, merah belum, abu tanpa target.
 */

const STATUS_CELL = {
  TERCAPAI: 'bg-emerald-50 text-emerald-800',
  BELUM_TERCAPAI: 'bg-rose-50 text-rose-800',
  TARGET_BELUM_DIATUR: 'bg-slate-50 text-navy-400',
}
const STATUS_DOT = {
  TERCAPAI: 'bg-emerald-500',
  BELUM_TERCAPAI: 'bg-rose-500',
  TARGET_BELUM_DIATUR: 'bg-slate-300',
}


const MATRA_LABEL = { darat: 'Matra Darat', laut: 'Matra Laut', udara: 'Matra Udara', aparatur: 'Aparatur' }
const MATRA_ORDER = ['darat', 'laut', 'udara', 'aparatur']
const MATRA_TONE = { darat: 'text-emerald-600', laut: 'text-navy-700', udara: 'text-sky-600', aparatur: 'text-amber-600' }
const MATRA_BAR = { darat: 'bg-emerald-500', laut: 'bg-navy-600', udara: 'bg-sky-500', aparatur: 'bg-amber-500' }

export default function MonitoringPage() {
  const { user } = useAuth()
  const isPusbang = user?.role === 'PUSBANG'
  const pusbangMatra = (user?.pusbangMatra || '').toLowerCase()
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState('')
  const [uptId, setUptId] = useState('')
  const [view, setView] = useState('upt') // 'upt' | 'program' | 'matra'
  const [uptOptions, setUptOptions] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = { year, detail: 1 }
      if (month) params.month = month
      if (uptId) params.uptId = uptId
      const { data: res } = await api.get('/realizations', { params })
      setData(res)
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [year, month, uptId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    api.get('/upts/options').then(({ data: r }) => {
      const opts = r.options || []
      if (isPusbang && pusbangMatra) {
        setUptOptions(opts.filter((o) => (o.matra || '').toLowerCase() === pusbangMatra))
      } else {
        setUptOptions(opts)
      }
    }).catch(() => {})
  }, [isPusbang, pusbangMatra])

  const currentMonth = new Date().getMonth() + 1
  const monthCount = data ? (data.month || (data.year === new Date().getFullYear() ? currentMonth : 12)) : 12

  const hasFilter = month !== '' || uptId !== ''

  const totals = useMemo(() => {
    const upts = data?.uptMonths || []
    let real = 0
    let target = 0
    for (const u of upts) {
      for (const m of u.months) {
        real += m.realTotal
        target += m.targetTotal
      }
    }
    return { real, target }
  }, [data])

  const s = data?.summary

  return (
    <div className="animate-fadeUp">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {isPusbang ? `Monitoring Realisasi — Matra ${pusbangMatra.toUpperCase()}` : 'Monitoring Realisasi'}
          </h1>
          <p className="page-desc">
            {isPusbang
              ? `Capaian realisasi vs target PK UPT Matra ${pusbangMatra.toUpperCase()} per bulan — tercapai & belum tercapai.`
              : 'Capaian realisasi vs target PK per UPT, per program, dan per bulan — tercapai & belum tercapai.'}
          </p>
        </div>
        <button className="btn-secondary" onClick={load} title="Muat ulang">
          <IconRefresh className="h-4 w-4" />
        </button>
      </div>

      {error && <div className="mb-5"><Alert type="error">{error}</Alert></div>}

      {/* Filter */}
      <div className="card p-4 mb-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="form-label">Tahun</label>
            <select className="form-input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Bulan</label>
            <select className="form-input" value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="">Semua Bulan (s.d. sekarang)</option>
              {MONTHS_SHORT.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">UPT</label>
            <select className="form-input" value={uptId} onChange={(e) => setUptId(e.target.value)}>
              <option value="">Semua UPT</option>
              {uptOptions.map((o) => <option key={o.id} value={o.id}>{o.code} — {o.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Ringkasan */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-5">
        <StatCard
          icon={<IconBuilding className="h-5 w-5" />}
          label="UPT Melapor"
          value={fmtNum(s?.uptWithReal ?? 0)}
          sub={`dari ${fmtNum(s?.uptCount ?? 0)} UPT terdaftar`}
          tone="navy"
        />
        <StatCard
          icon={<IconCheck className="h-5 w-5" />}
          label="Tercapai"
          value={fmtNum(s?.tercapai ?? 0)}
          sub="UPT yang capaiannya ≥ target"
          tone="emerald"
          delay={60}
        />
        <StatCard
          icon={<IconX className="h-5 w-5" />}
          label="Belum Tercapai"
          value={fmtNum(s?.belumTercapai ?? 0)}
          sub="UPT yang capaiannya < target"
          tone="rose"
          delay={120}
        />
        <StatCard
          icon={<IconTarget className="h-5 w-5" />}
          label="Capaian Total"
          value={s?.pctTotal != null ? `${fmtNum(s.pctTotal)}%` : '-'}
          sub={`${fmtNum(totals.real)} real / ${fmtNum(totals.target)} target`}
          tone="gold"
          delay={180}
        />
      </div>

      {/* Toggle tampilan */}
      <div className="card p-4 mb-5">
        <div className="flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
          <div className="inline-flex rounded-xl bg-navy-50 p-1 w-fit">
            <button
              type="button"
              onClick={() => setView('upt')}
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2',
                view === 'upt' ? 'bg-white text-navy-900 shadow' : 'text-navy-400 hover:text-navy-600'
              )}
            >
              <IconBuilding className="h-4 w-4" /> Per UPT
            </button>
            <button
              type="button"
              onClick={() => setView('program')}
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2',
                view === 'program' ? 'bg-white text-navy-900 shadow' : 'text-navy-400 hover:text-navy-600'
              )}
            >
              <IconLayers className="h-4 w-4" /> Per Program
            </button>
            {!isPusbang && (
              <button
                type="button"
                onClick={() => setView('matra')}
                className={clsx(
                  'px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2',
                  view === 'matra' ? 'bg-white text-navy-900 shadow' : 'text-navy-400 hover:text-navy-600'
                )}
              >
                <IconFlag className="h-4 w-4" /> Per Matra
              </button>
            )}
          </div>
          <div className="flex items-center gap-4 flex-wrap text-[11px] font-semibold">
            <span className="flex items-center gap-1.5 text-emerald-700">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Tercapai
            </span>
            <span className="flex items-center gap-1.5 text-rose-700">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Belum Tercapai
            </span>
            <span className="flex items-center gap-1.5 text-navy-400">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300" /> Tanpa Target
            </span>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <SkeletonRows rows={8} />
        ) : error ? (
          <EmptyState icon={<IconChart className="h-6 w-6" />} title="Gagal memuat" desc="Periksa koneksi lalu muat ulang." />
        ) : view === 'upt' ? (
          <UptTable months={data?.uptMonths || []} monthCount={monthCount} />
        ) : view === 'program' ? (
          <ProgramTable programs={data?.programs || []} monthCount={monthCount} hasFilter={hasFilter} />
        ) : (
          <MatraTable months={data?.uptMonths || []} monthCount={monthCount} hasFilter={hasFilter} />
        )}
      </div>
    </div>
  )
}

/** Sel bulan: nilai real, target, persentase, dan warna status. */
function MonthCell({ m }) {
  return (
    <td className="p-1.5 text-center">
      <div className={clsx('rounded-lg px-1.5 py-1.5', STATUS_CELL[m.status] || STATUS_CELL.TARGET_BELUM_DIATUR)}>
        <div className="flex items-center justify-center gap-1">
          <span className={clsx('h-1.5 w-1.5 rounded-full shrink-0', STATUS_DOT[m.status] || STATUS_DOT.TARGET_BELUM_DIATUR)} />
          <span className="text-xs font-extrabold tabular-nums">{fmtNum(m.realTotal)}</span>
        </div>
        <p className="text-[10px] tabular-nums opacity-80">
          / {fmtNum(m.targetTotal)}
        </p>
        <p className="text-[9px] font-bold uppercase tracking-wide opacity-80 mt-0.5">
          {m.hasTarget ? `${m.pct != null ? fmtNum(m.pct) + '%' : '-'}` : '—'}
        </p>
      </div>
    </td>
  )
}

/** Tampilan Per UPT. */
function UptTable({ months, monthCount }) {
  if (!months.length) {
    return (
      <EmptyState
        icon={<IconChart className="h-6 w-6" />}
        title="Belum ada data realisasi"
        desc="Belum ada UPT yang menginput realisasi untuk filter yang dipilih."
      />
    )
  }
  const monthHead = Array.from({ length: monthCount }, (_, i) => i + 1)
  return (
    <div className="table-wrap">
      <table className="data-table min-w-[900px]">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white z-10">UPT</th>
            {monthHead.map((m) => (
              <th key={m} className="text-center py-2">{MONTHS_SHORT[m - 1]}</th>
            ))}
            <th className="text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          {MATRA_ORDER.map((code) => {
            const group = months.filter((u) => (u.matra || '') === code)
            if (!group.length) return null
            return (
              <Fragment key={code}>
                <tr className="bg-navy-900 hover:bg-navy-900">
                  <td colSpan={monthCount + 2} className="!px-4 !py-2">
                    <p className="text-[11px] font-extrabold uppercase tracking-widest text-gold-400">
                      {MATRA_LABEL[code]} <span className="font-semibold text-navy-300">· {group.length} UPT</span>
                    </p>
                  </td>
                </tr>
                {group.map((u) => (
                  <UptRow key={u.uptId} u={u} />
                ))}
              </Fragment>
            )
          })}
          {months.filter((u) => !MATRA_ORDER.includes(u.matra || '')).map((u) => (
            <UptRow key={u.uptId} u={u} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Baris satu UPT pada tabel monitoring. */
function UptRow({ u }) {
  const last = [...u.months].reverse().find((mm) => mm.hasReal)
  return (
    <tr>
      <td className="sticky left-0 bg-white z-10 min-w-[180px]">
        <p className="font-bold text-navy-900">{u.uptCode}</p>
        <p className="text-xs text-navy-400 max-w-[200px] truncate">{u.uptName}</p>
      </td>
      {u.months.map((mm) => (
        <MonthCell key={mm.month} m={mm} />
      ))}
      <td className="text-center">
        {last ? (
          <StatusBadge status={last.status} />
        ) : (
          <span className="badge-neutral"><span className="badge-dot" />Belum Lapor</span>
        )}
      </td>
    </tr>
  )
}

/** Sel baris agregat per matra: realisasi/target dengan warna status. */
function AggCell({ value }) {
  let st
  if (!(value.target > 0)) {
    st = value.hasReal ? 'TERCAPAI' : 'TARGET_BELUM_DIATUR'
  } else {
    st = value.real >= value.target ? 'TERCAPAI' : 'BELUM_TERCAPAI'
  }
  return (
    <td className="p-1.5 text-center">
      <div className={clsx('rounded-lg px-1.5 py-1.5', STATUS_CELL[st])}>
        <p className="text-xs font-extrabold tabular-nums">{fmtNum(value.real)}</p>
        <p className="text-[10px] tabular-nums opacity-80">/ {fmtNum(value.target)}</p>
      </div>
    </td>
  )
}

/** Tampilan Per Matra: perbandingan agregat darat/laut/udara. */
function MatraTable({ months, monthCount, hasFilter }) {
  const groups = useMemo(() => MATRA_ORDER.map((code) => {
    const rows = months.filter((u) => (u.matra || '') === code)
    const real = rows.reduce((s, u) => s + u.months.reduce((x, mm) => x + mm.realTotal, 0), 0)
    const target = rows.reduce((s, u) => s + u.months.reduce((x, mm) => x + mm.targetTotal, 0), 0)
    const pct = target > 0 ? Math.round((real / target) * 1000) / 10 : null
    const byMonth = Array.from({ length: monthCount }, (_, i) => {
      const m = i + 1
      const r = rows.reduce((s, u) => s + (u.months.find((x) => x.month === m)?.realTotal || 0), 0)
      const t = rows.reduce((s, u) => s + (u.months.find((x) => x.month === m)?.targetTotal || 0), 0)
      return { month: m, real: r, target: t, hasReal: rows.some((u) => u.months.find((x) => x.month === m)?.hasReal) }
    })
    return { code, label: MATRA_LABEL[code], count: rows.length, real, target, pct, byMonth }
  }).filter((g) => g.count > 0), [months, monthCount])

  if (!groups.length) {
    return (
      <EmptyState
        icon={<IconFlag className="h-6 w-6" />}
        title="Belum ada data"
        desc={hasFilter ? 'Tidak ada data untuk filter yang dipilih.' : 'Belum ada UPT yang menginput realisasi.'}
      />
    )
  }

  return (
    <div className="p-4 sm:p-5">
      {/* Tile perbandingan */}
      <div className="grid gap-4 sm:grid-cols-3 mb-5">
        {groups.map((g, i) => (
          <div key={g.code} className="card card-hover p-4 animate-fadeUp" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className={clsx('text-[11px] font-extrabold uppercase tracking-widest', MATRA_TONE[g.code])}>{g.label}</p>
              <span className="badge-neutral">{g.count} UPT</span>
            </div>
            <p className="text-2xl font-extrabold text-navy-900 tabular-nums tracking-tight">
              {fmtNum(g.real)}
              <span className="text-sm font-semibold text-navy-400"> / {fmtNum(g.target)}</span>
            </p>
            <p className="text-[11px] text-navy-500 mt-0.5">Realisasi vs target (peserta + lulusan)</p>
            <div className="mt-3 h-2 w-full rounded-full bg-navy-100/60 overflow-hidden">
              <div
                className={clsx('h-full rounded-full transition-all duration-700', MATRA_BAR[g.code])}
                style={{ width: `${Math.min(100, g.pct == null ? 0 : g.pct)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs font-extrabold text-navy-700 tabular-nums">
              {g.pct == null ? 'Tanpa target' : `${fmtNum(g.pct)}% dari target`}
            </p>
          </div>
        ))}
      </div>

      {/* Tabel agregat bulanan */}
      <div className="table-wrap">
        <table className="data-table min-w-[900px]">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white z-10">Matra</th>
              {Array.from({ length: monthCount }, (_, i) => (
                <th key={i} className="text-center py-2">{MONTHS_SHORT[i]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.code}>
                <td className="sticky left-0 bg-white z-10 min-w-[180px]">
                  <p className={clsx('font-extrabold', MATRA_TONE[g.code])}>{g.label}</p>
                  <p className="text-xs text-navy-400">{g.count} UPT · real {fmtNum(g.real)} / target {fmtNum(g.target)}</p>
                </td>
                {g.byMonth.map((b) => (
                  <AggCell key={b.month} value={b} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Tampilan Per Program. */
function ProgramTable({ programs, monthCount, hasFilter }) {
  if (!programs.length) {
    return (
      <EmptyState
        icon={<IconLayers className="h-6 w-6" />}
        title="Belum ada data program"
        desc={hasFilter ? 'Tidak ada data realisasi/target untuk filter yang dipilih.' : 'Belum ada UPT yang menginput realisasi atau target PK.'}
      />
    )
  }
  const monthHead = Array.from({ length: monthCount }, (_, i) => i + 1)
  return (
    <div className="table-wrap">
      <table className="data-table min-w-[900px]">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white z-10">Program</th>
            {monthHead.map((m) => (
              <th key={m} className="text-center py-2">{MONTHS_SHORT[m - 1]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {programs.map((p) => (
            <tr key={p.programId}>
              <td className="sticky left-0 bg-white z-10 min-w-[220px]">
                {p.isParent ? (
                  <p className="font-extrabold text-navy-900">{p.programName}</p>
                ) : (
                  <>
                    <p className="font-semibold text-navy-800">{p.programName}</p>
                    <p className="text-[10px] text-navy-400">{p.parentName}</p>
                  </>
                )}
              </td>
              {monthHead.map((mh) => {
                const mm = p.months.find((x) => x.month === mh)
                return mm ? (
                  <MonthCell key={mh} m={mm} />
                ) : (
                  <td key={mh} className="p-1.5 text-center text-navy-200">—</td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
