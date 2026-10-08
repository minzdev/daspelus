import { useCallback, useEffect, useMemo, useState } from 'react'
import api, { apiError } from '../../lib/api'
import {
  Modal, EmptyState, SkeletonRows, Alert,
} from '../../components/ui'
import { IconTarget, IconEye, IconRefresh, IconLayers, IconSearch } from '../../components/icons'
import { fmtDateTime, fmtNum, yearOptions } from '../../utils/format'
import TargetRevisionHistory from '../../components/TargetRevisionHistory'

/**
 * ADMIN — Pantau Target PK (read-only).
 * Target kini diisi mandiri oleh masing-masing UPT via menu Target PK di akun UPT.
 * Admin hanya memantau rekap per UPT.
 */
export default function TargetPkPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [targets, setTargets] = useState([])
  const [programs, setPrograms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [matra, setMatra] = useState('')
  const [viewUpt, setViewUpt] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/targets', { params: { year } })
      setTargets(data.targets)
      setPrograms(data.programs || [])
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => { load() }, [load])

  // SINGLE-INPUT: satu kali per tahun — tidak ada filter bulan lagi
  const getUptTotal = (upt) => ({
    peserta: upt.targetPeserta || 0, lulusan: upt.targetLulusan || 0,
    total: (upt.targetPeserta || 0) + (upt.targetLulusan || 0),
  })

  const totalTarget = useMemo(() => targets.reduce((s, t) => s + (t.targetPeserta || 0) + (t.targetLulusan || 0), 0), [targets])

  const filled = useMemo(() => targets.filter((t) => (t.items || []).length > 0).length, [targets])

  const filteredTargets = useMemo(() => {
    const q = search.trim().toLowerCase()
    return targets.filter((t) => {
      if (matra && (t.matra || '') !== matra) return false
      if (!q) return true
      return (t.uptCode || '').toLowerCase().includes(q) || (t.uptName || '').toLowerCase().includes(q)
    })
  }, [targets, search, matra])

  return (
    <div className="animate-fadeUp space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Target Perjanjian Kinerja Peserta dan Lulusan</h1>
          <p className="page-desc">Pantau target PK <strong>satu kali input</strong> per tahun + rincian diklat yang diisi mandiri oleh masing-masing UPT. Induk otomatis = jumlah turunan.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary !rounded-xl !py-2.5 shadow-sm" onClick={load} title="Muat ulang">
            <IconRefresh className="h-4 w-4" />
          </button>
          <div className="relative">
            <select
              className="appearance-none bg-slate-900 text-white border border-slate-800 rounded-full pl-4 pr-9 py-2.5 text-sm font-bold shadow-md hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/20 cursor-pointer"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {yearOptions().map((y) => <option key={y} value={y} className="bg-white text-slate-900">Tahun {y}</option>)}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/70 text-xs">▼</span>
          </div>
        </div>
      </div>

      <Alert type="info">
        <strong>Mode pantau:</strong> PK Target ini di isi oleh masing-masing UPT, admin BPSDMP hanya bisa lihat.
      </Alert>

      {error && <Alert type="error">{error}</Alert>}

      <div className="card rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden bg-white">
        <div className="p-4 md:p-5 space-y-4">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="relative flex-1 min-w-[220px]">
              <IconSearch className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari UPT (kode atau nama)..." className="form-input !rounded-xl !py-2.5 pl-10 pr-4 w-full bg-slate-50/50 border-slate-200 focus:bg-white placeholder:text-slate-400" />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-slate-900 text-white px-3 py-1.5 font-bold">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> {filled} terisi
              </span>
              <span className="text-slate-500 hidden sm:inline">· {programs.length} program</span>
              {(matra || search) && (
                <button type="button" onClick={() => { setMatra(''); setSearch('') }} className="inline-flex items-center gap-1 rounded-full bg-white border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">
                  Reset filter
                </button>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500 w-[52px] shrink-0">Matra</span>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setMatra('')} className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition-all ${!matra ? 'bg-slate-900 text-white ring-slate-900 shadow-sm' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}>Semua</button>
                {[
                  { v: 'darat', label: 'Darat' },
                  { v: 'laut', label: 'Laut' },
                  { v: 'udara', label: 'Udara' },
                  { v: 'aparatur', label: 'Aparatur' },
                ].map((o) => (
                  <button key={o.v} type="button" onClick={() => setMatra(matra === o.v ? '' : o.v)} className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition-all ${matra === o.v ? 'bg-emerald-600 text-white ring-emerald-600 shadow-sm' : 'bg-white text-slate-600 ring-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:ring-emerald-200'}`}>{o.label}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-xs border-t border-slate-100 pt-3">
            <p className="text-slate-500">
              <span>Total <strong className="text-slate-900">{fmtNum(totalTarget)}</strong> ({year} · satu kali input)</span>
              <span className="ml-2 text-slate-400 hidden sm:inline">rekap tahun penuh + rincian diklat</span>
            </p>
            <p className="text-slate-400 hidden sm:inline">{programs.length} program aktif</p>
          </div>
        </div>

        {loading ? (
          <div className="p-4"><SkeletonRows rows={6} /></div>
        ) : targets.length === 0 ? (
          <EmptyState icon={<IconTarget className="h-6 w-6" />} title="Belum ada UPT" desc="Tambahkan data UPT terlebih dahulu." />
        ) : filteredTargets.length === 0 ? (
          <EmptyState icon={<IconSearch className="h-6 w-6" />} title="Tidak ditemukan" desc={`Tidak ada UPT yang cocok dengan "${search}".`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 900 }}>
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200/60">
                  <th className="text-left px-4 py-3 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">UPT</th>
                  <th className="text-left px-3 py-3 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Riwayat Perubahan PK</th>
                  <th className="text-right px-3 py-3 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Target Peserta</th>
                  <th className="text-right px-3 py-3 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Target Lulusan</th>
                  <th className="text-right px-4 py-3 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Total</th>
                  <th className="text-center px-4 py-3 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Rincian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTargets.map((t) => {
                  const v = getUptTotal(t)
                  const hasTarget = v.total > 0
                  const diklatCount = t.diklatCount ?? (t.diklats || []).length
                  return (
                    <tr key={t.uptId} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-900 truncate max-w-[260px]" title={t.uptCode}>{t.uptCode}</p>
                        <p className="text-xs text-slate-500 truncate max-w-[260px]" title={t.uptName}>{t.uptName}</p>
                        {hasTarget ? (
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            <IconLayers className="h-3 w-3 inline-block -mt-0.5 mr-1" />
                            {`${(t.items || []).length} prog · ${diklatCount} diklat`}
                          </p>
                        ) : (
                          <p className="text-[10px] text-slate-400 mt-0.5">Belum ada target</p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {(() => {
                          const rev = t.revision || { count: 0, first: null, last: null }
                          if (!hasTarget || !rev.count) return <span className="text-slate-300">—</span>
                          return (
                            <div className="text-[11px] leading-relaxed" title={rev.count > 1 ? `${rev.count}× penyimpanan (klik Lihat untuk riwayat lengkap)` : 'Target awal — klik Lihat'}>
                              <p className="text-slate-600">
                                Awal: <strong className="text-slate-900 tabular-nums">{fmtNum(rev.first.total)}</strong>
                                <span className="text-slate-400"> · {rev.first.at ? fmtDateTime(rev.first.at) : ''}</span>
                              </p>
                              <p className="text-slate-600">
                                Berlaku: {rev.count > 1
                                  ? <><strong className="text-emerald-700 tabular-nums">{fmtNum(rev.last.total)}</strong><span className="text-slate-400"> · revisi ke-{rev.last.no - 1} · {rev.last.at ? fmtDateTime(rev.last.at) : ''}</span></>
                                  : <span className="text-slate-300">— (belum revisi)</span>}
                              </p>
                            </div>
                          )
                        })()}
                      </td>
                      <td className="px-3 py-3 text-right font-bold tabular-nums">{hasTarget ? fmtNum(v.peserta) : '—'}</td>
                      <td className="px-3 py-3 text-right font-bold tabular-nums">{hasTarget ? fmtNum(v.lulusan) : '—'}</td>
                      <td className="px-4 py-3 text-right font-black tabular-nums">{hasTarget ? fmtNum(v.total) : '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <button className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-colors" onClick={() => setViewUpt(t)}>
                          <IconEye className="h-3.5 w-3.5" /> Lihat
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal rincian read-only — angka berlaku (terbaru) + riwayat Awal→revisi */}
      <Modal open={!!viewUpt} onClose={() => setViewUpt(null)} title={`Rincian Target — ${viewUpt?.uptCode || ''}`} subtitle={`${viewUpt?.uptName || ''} · Tahun ${year} · input sekali, revisi via unlock · berlaku = terbaru`} wide>
        {!viewUpt ? null : (viewUpt.items || []).length === 0 ? (
          <EmptyState icon={<IconTarget className="h-6 w-6" />} title="Belum ada target" desc="UPT ini belum mengisi target PK untuk tahun ini." />
        ) : (
          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
            {(viewUpt.revision?.history?.length > 0) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                <p className="text-[11px] font-extrabold uppercase tracking-widest text-amber-800 mb-2">Riwayat angka (Awal → Revisi) · {viewUpt.revision.count}× tercatat</p>
                <TargetRevisionHistory revisions={viewUpt.revision.history} year={year} />
              </div>
            )}
            <div className="flex items-center justify-between">
              <p className="text-xs font-extrabold uppercase tracking-widest text-slate-500">Angka berlaku (update terakhir)</p>
              {(viewUpt.diklats || []).length > 0 && (
                <p className="text-xs text-slate-500">{(viewUpt.diklats || []).length} rincian diklat · induk otomatis = jumlah turunan</p>
              )}
            </div>
            {(viewUpt.items || []).map((it) => {
              const rincian = (viewUpt.diklats || []).filter((d) => (d.programIds || []).includes(it.programId))
              return (
                <div key={it.programId} className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">{it.programName}</p>
                      <p className="text-xs text-slate-500">{it.parentName}</p>
                    </div>
                    <span className="text-xs font-black tabular-nums bg-slate-900 text-amber-300 px-2.5 py-1 rounded-full whitespace-nowrap">{fmtNum(it.targetPeserta)} / {fmtNum(it.targetLulusan)}</span>
                  </div>
                  {rincian.length > 0 ? (
                    <div className="p-3 grid gap-1.5">
                      {rincian.map((d) => (
                        <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg bg-white border border-slate-100 px-3 py-1.5 text-xs">
                          <span className="font-semibold text-slate-600">• {d.name}</span>
                          <span className="tabular-nums text-slate-500 whitespace-nowrap">{fmtNum(d.targetPeserta)} / {fmtNum(d.targetLulusan)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="px-4 py-2 text-[11px] text-slate-400 italic">Tanpa rincian diklat — angka langsung per program</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Modal>
    </div>
  )
}
