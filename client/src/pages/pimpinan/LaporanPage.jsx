import { useCallback, useEffect, useMemo, useState } from 'react'
import api, { apiError } from '../../lib/api'
import { Alert, EmptyState, SkeletonRows, Modal } from '../../components/ui'
import { IconFileText, IconDownload, IconEye } from '../../components/icons'
import { MONTHS, yearOptions } from '../../utils/format'
import { useToast } from '../../components/Toast'
import { buildRealisasiPdf } from '../../utils/realisasiPdf'

export default function PimpinanLaporanPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState('')
  const [view, setView] = useState('daftar') // daftar | rekap
  const [subs, setSubs] = useState([])
  const [rekap, setRekap] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const toast = useToast()
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailData, setDetailData] = useState(null)

  const loadSubs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/submissions/history')
      setSubs(data.submissions || [])
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadRekap = useCallback(async () => {
    try {
      const params = { year }
      if (month) params.month = month
      const { data } = await api.get('/reports/my', { params })
      setRekap(data)
    } catch (err) {
      console.error(err)
    }
  }, [year, month])

  useEffect(() => { loadSubs() }, [loadSubs])
  useEffect(() => { if (view === 'rekap') loadRekap() }, [view, loadRekap])

  const filteredSubs = useMemo(() => {
    return subs.filter((s) => {
      if (String(s.year) !== String(year)) return false
      if (month && String(s.month) !== String(month)) return false
      return true
    })
  }, [subs, year, month])

  const handleReview = async (sub) => {
    try {
      const { data } = await api.get(`/submissions/${sub.id}/detail`)
      setDetailData(data)
      setDetailOpen(true)
    } catch (err) {
      toast.error('Gagal memuat detail', apiError(err))
    }
  }

  const handleDownload = (sub) => {
    if (!detailData || detailData.submission.id !== sub.id) {
      toast.error('Buka detail dulu untuk unduh PDF')
      return
    }
    try {
      const { submission, programs, upt } = detailData
      const rows = programs.map((p) => ({
        id: p.programId, name: p.programName, isParent: p.isParent,
        isAutoSum: false,
        values: { pesertaL: p.pesertaL, pesertaP: p.pesertaP, lulusanL: p.lulusanL, lulusanP: p.lulusanP },
        total: p.pesertaL + p.pesertaP + p.lulusanL + p.lulusanP,
      }))
      const totalPeserta = programs.filter((p) => p.isParent).reduce((s, p) => s + p.pesertaL + p.pesertaP, 0)
      const totalLulusan = programs.filter((p) => p.isParent).reduce((s, p) => s + p.lulusanL + p.lulusanP, 0)
      const url = buildRealisasiPdf({
        uptCode: upt.code, uptName: upt.name, year: submission.year, month: submission.month,
        rows, totalPeserta, totalLulusan, grandTotal: totalPeserta + totalLulusan,
      })
      const a = document.createElement('a')
      a.href = url
      a.download = `Laporan_${submission.uptCode}_${submission.year}_${String(submission.month).padStart(2, '0')}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (e) {
      toast.error('Gagal PDF', e.message)
    }
  }

  return (
    <div className="animate-fadeUp space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Laporan UPT</h1>
          <p className="page-desc">Daftar laporan yang sudah diinput Admin UPT — status disetujui/ditolak. Rekap per program berdasarkan {view === 'rekap' ? (month ? MONTHS[Number(month)-1] : 'tahun') : 'bulan'}.</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="form-input !py-2 !rounded-xl" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {yearOptions().map((y) => <option key={y} value={y}>Tahun {y}</option>)}
          </select>
          <select className="form-input !py-2 !rounded-xl" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">Semua Bulan</option>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
      </div>

      <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 w-fit">
        <button onClick={() => setView('daftar')} className={`px-4 py-1.5 rounded-lg text-xs font-bold ${view === 'daftar' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>Daftar Laporan</button>
        <button onClick={() => setView('rekap')} className={`px-4 py-1.5 rounded-lg text-xs font-bold ${view === 'rekap' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>Rekap per Program</button>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {view === 'daftar' ? (
        <div className="card rounded-xl border border-slate-200 overflow-hidden">
          {loading ? <div className="p-4"><SkeletonRows rows={4} /></div> : filteredSubs.length === 0 ? (
            <EmptyState icon={<IconFileText className="h-6 w-6" />} title="Belum ada laporan" desc={`Tidak ada laporan untuk tahun ${year}${month ? ` bulan ${MONTHS[Number(month)-1]}` : ''}.`} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600">Periode</th>
                    <th className="text-left px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600">Status</th>
                    <th className="text-left px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600">Pengirim</th>
                    <th className="text-right px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSubs.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/50">
                      <td className="px-3 py-2.5 font-semibold text-slate-900">{s.month}/{s.year}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${s.status === 'approved' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : s.status === 'rejected' ? 'bg-red-50 text-red-700 ring-red-200' : s.status === 'pending_pimpinan' ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}>{s.status}</span>
                        {s.rejectNote && <p className="text-xs text-red-600 mt-1">{s.rejectNote}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">{s.submittedByName}</td>
                      <td className="px-3 py-2.5 text-right">
                        <button className="btn-secondary !rounded-lg !py-1.5" onClick={() => handleReview(s)}><IconEye className="h-3.5 w-3.5" /> Detail</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="card rounded-xl border border-slate-200 overflow-hidden">
          {!rekap ? <div className="p-4"><SkeletonRows rows={5} /></div> : !rekap.upt.programs || rekap.upt.programs.length === 0 ? (
            <EmptyState icon={<IconFileText className="h-6 w-6" />} title="Belum ada data" desc="Belum ada realisasi untuk periode ini." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600">Program</th>
                    <th className="text-right px-2 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600">Target Peserta</th>
                    <th className="text-center px-2 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600">L</th>
                    <th className="text-center px-2 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600">P</th>
                    <th className="text-right px-2 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-900 bg-slate-100">Total Peserta</th>
                    <th className="text-right px-2 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600">Target Lulusan</th>
                    <th className="text-center px-2 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600">L</th>
                    <th className="text-center px-2 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600">P</th>
                    <th className="text-right px-2 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-900 bg-slate-100">Total Lulusan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rekap.upt.programs.map((p) => (
                    <tr key={p.programId} className={p.isParent ? 'bg-slate-50/50 font-bold' : 'hover:bg-slate-50/30'}>
                      <td className="px-3 py-2 text-xs">
                        <p className={p.isParent ? 'font-bold text-slate-900' : 'font-medium text-slate-700 pl-3'}>{p.isParent ? p.programName : `↳ ${p.programName}`}</p>
                        {!p.isParent && <p className="text-[11px] text-slate-400">{p.parentName}</p>}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-xs text-slate-500">{p.targetPeserta}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-xs">{p.pesertaL}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-xs">{p.pesertaP}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-xs font-bold bg-slate-50">{p.pesertaL + p.pesertaP}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-xs text-slate-500">{p.targetLulusan}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-xs">{p.lulusanL}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-xs">{p.lulusanP}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-xs font-bold bg-slate-50">{p.lulusanL + p.lulusanP}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title={detailData ? `Detail Laporan ${detailData.submission.month}/${detailData.submission.year}` : 'Detail Laporan'} subtitle={detailData ? `${detailData.upt.code} — ${detailData.upt.name}` : ''} wide>
        {!detailData ? <div className="p-8 text-center"><p className="text-sm text-slate-500">Memuat...</p></div> : (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600">Program</th>
                    <th className="text-center px-2 py-2 text-xs font-bold uppercase tracking-wide text-slate-600">L</th>
                    <th className="text-center px-2 py-2 text-xs font-bold uppercase tracking-wide text-slate-600">P</th>
                    <th className="text-center px-2 py-2 text-xs font-bold uppercase tracking-wide text-slate-900 bg-slate-100">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detailData.programs.map((p) => (
                    <tr key={p.programId} className={p.isParent ? 'bg-slate-50/50 font-bold' : ''}>
                      <td className="px-3 py-2 text-xs">{p.isParent ? p.programName : `↳ ${p.programName}`}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-xs">{p.pesertaL}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-xs">{p.pesertaP}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-xs font-bold bg-slate-50">{p.pesertaL + p.pesertaP}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary !rounded-xl" onClick={() => setDetailOpen(false)}>Tutup</button>
              <button className="btn-secondary !rounded-xl" onClick={() => handleDownload(detailData.submission)}><IconDownload className="h-4 w-4" /> Unduh PDF</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
