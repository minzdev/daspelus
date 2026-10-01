import { useCallback, useEffect, useMemo, useState } from 'react'
import api, { apiError } from '../../lib/api'
import { Alert, EmptyState, SkeletonRows, Spinner, Modal } from '../../components/ui'
import { IconFileText, IconCheck, IconX, IconRefresh, IconEye, IconDownload, IconHistory, IconSearch } from '../../components/icons'
import { useToast } from '../../components/Toast'
import { buildRealisasiPdf } from '../../utils/realisasiPdf'
import { fmtDate } from '../../utils/format'

export default function AdminSubmissionInboxPage() {
  const [tab, setTab] = useState('pending') // 'pending' | 'processed'
  const [subs, setSubs] = useState([])
  const [processed, setProcessed] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const toast = useToast()
  const [acting, setActing] = useState(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewData, setReviewData] = useState(null)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [inboxRes, procRes] = await Promise.all([
        api.get('/submissions/inbox'),
        api.get('/submissions/processed').catch(() => ({ data: { submissions: [] } })),
      ])
      setSubs(inboxRes.data.submissions || [])
      setProcessed(procRes.data.submissions || [])
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filteredProcessed = useMemo(() => {
    const q = search.trim().toLowerCase()
    return processed.filter((s) => {
      if (!q) return true
      return (s.uptCode || '').toLowerCase().includes(q) || (s.uptName || '').toLowerCase().includes(q)
    })
  }, [processed, search])

  const handleReview = async (sub) => {
    setReviewOpen(true)
    setReviewLoading(true)
    setReviewData(null)
    try {
      const { data } = await api.get(`/submissions/${sub.id}/detail`)
      setReviewData(data)
    } catch (err) {
      toast.error('Gagal memuat detail', apiError(err))
      setReviewOpen(false)
    } finally {
      setReviewLoading(false)
    }
  }

  const handleDownloadPdf = () => {
    if (!reviewData) return
    try {
      const { submission, programs, upt } = reviewData
      const rows = programs.map((p) => ({
        id: p.programId, name: p.programName, isParent: p.isParent, isAutoSum: false,
        values: { pesertaL: p.pesertaL, pesertaP: p.pesertaP, lulusanL: p.lulusanL, lulusanP: p.lulusanP },
        total: p.pesertaL + p.pesertaP + p.lulusanL + p.lulusanP,
      }))
      const totalPeserta = programs.filter((p) => p.isParent).reduce((s, p) => s + p.pesertaL + p.pesertaP, 0)
      const totalLulusan = programs.filter((p) => p.isParent).reduce((s, p) => s + p.lulusanL + p.lulusanP, 0)
      const url = buildRealisasiPdf({
        uptCode: upt.code || submission.uptCode, uptName: upt.name || submission.uptName,
        year: submission.year, month: submission.month, rows, totalPeserta, totalLulusan, grandTotal: totalPeserta + totalLulusan,
      })
      const a = document.createElement('a')
      a.href = url
      a.download = `Laporan_${submission.uptCode}_${submission.year}_${String(submission.month).padStart(2, '0')}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (e) {
      toast.error('Gagal membuat PDF', e.message)
    }
  }

  const handleApproveBpsdmp = async (id) => {
    setActing(id)
    try {
      const { data } = await api.patch(`/submissions/${id}/approve-bpsdmp`)
      toast.success('Disetujui & Kunci Final', data.message)
      await load()
      setReviewOpen(false)
    } catch (err) {
      toast.error('Gagal menyetujui', apiError(err))
    } finally {
      setActing(null)
    }
  }

  const handleReject = async (id) => {
    const note = prompt('Alasan penolakan (opsional):')
    if (note === null) return
    setActing(id)
    try {
      const { data } = await api.patch(`/submissions/${id}/reject`, { note })
      toast.success('Ditolak', data.message)
      await load()
      setReviewOpen(false)
    } catch (err) {
      toast.error('Gagal menolak', apiError(err))
    } finally {
      setActing(null)
    }
  }

  return (
    <div className="animate-fadeUp space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Persetujuan Laporan — Admin BPSDMP</h1>
          <p className="page-desc">Review persetujuan final laporan UPT dan pantau riwayat persetujuan/penolakan beserta tanggal & pengirim.</p>
        </div>
        <button className="btn-secondary !rounded-xl" onClick={load}><IconRefresh className="h-4 w-4" /> Refresh</button>
      </div>

      <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
        <button
          type="button"
          onClick={() => setTab('pending')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${tab === 'pending' ? 'bg-slate-900 text-white shadow' : 'text-slate-600 hover:text-slate-900'}`}
        >
          Perlu Persetujuan ({subs.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('processed')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${tab === 'processed' ? 'bg-slate-900 text-white shadow' : 'text-slate-600 hover:text-slate-900'}`}
        >
          Riwayat Persetujuan ({processed.length})
        </button>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {tab === 'pending' ? (
        <div className="card rounded-2xl border border-slate-200 overflow-hidden">
          {loading ? <div className="p-4"><SkeletonRows rows={4} /></div> : subs.length === 0 ? (
            <EmptyState icon={<IconFileText className="h-6 w-6" />} title="Tidak ada laporan pending BPSDMP" desc="Semua laporan UPT yang disetujui pimpinan telah di-approve final." />
          ) : (
            <div className="divide-y divide-slate-100">
              {subs.map((s) => (
                <div key={s.id} className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900">{s.uptCode} — {s.uptName} <span className="text-slate-500 font-normal">· {s.month}/{s.year}</span> <span className="ml-2 inline-flex items-center rounded-full bg-sky-50 text-sky-700 ring-1 ring-sky-200 px-2 py-0.5 text-xs font-bold">{s.status}</span></p>
                    <p className="text-xs text-slate-500 mt-1">Disetujui Pimpinan: <strong className="text-slate-800">{s.pimpinanApprovedByName || '-'}</strong> ({fmtDate(s.pimpinanApprovedAt)}) · Dikirim: {s.submittedByName} ({fmtDate(s.submittedAt)})</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <button className="btn-secondary !rounded-xl !py-2" onClick={() => handleReview(s)}><IconEye className="h-4 w-4" /> Review Data</button>
                    <button className="btn-primary !rounded-xl !py-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => handleApproveBpsdmp(s.id)} disabled={acting === s.id}>
                      {acting === s.id ? <Spinner className="h-4 w-4" /> : <IconCheck className="h-4 w-4" />} Setujui & Kunci Final
                    </button>
                    <button className="btn-secondary !rounded-xl !py-2" onClick={() => handleReject(s.id)} disabled={acting === s.id}><IconX className="h-4 w-4" /> Tolak</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="card rounded-2xl border border-slate-200 overflow-hidden space-y-3 p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <IconSearch className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari UPT..." className="form-input !py-2 !pl-9 !rounded-xl w-full text-xs" />
            </div>
            <span className="text-xs text-slate-500">{filteredProcessed.length} riwayat persetujuan</span>
          </div>

          {loading ? <SkeletonRows rows={5} /> : filteredProcessed.length === 0 ? (
            <EmptyState icon={<IconHistory className="h-6 w-6" />} title="Riwayat Kosong" desc="Belum ada riwayat persetujuan atau penolakan laporan." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="text-left py-3 px-3">UPT</th>
                    <th className="text-center py-3 px-2">Periode</th>
                    <th className="text-left py-3 px-3">Status Final</th>
                    <th className="text-left py-3 px-3">Dikirim UPT</th>
                    <th className="text-left py-3 px-3">Disetujui Pimpinan</th>
                    <th className="text-left py-3 px-3">Diproses BPSDMP</th>
                    <th className="text-right py-3 px-3">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProcessed.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-3">
                        <p className="font-bold text-slate-900 text-xs">{s.uptCode}</p>
                        <p className="text-[11px] text-slate-500 truncate max-w-[200px]" title={s.uptName}>{s.uptName}</p>
                      </td>
                      <td className="py-3 px-2 text-center text-xs font-semibold">{s.month}/{s.year}</td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${s.status === 'approved' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : s.status === 'rejected' ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-sky-50 text-sky-700 ring-sky-200'}`}>
                          {s.status === 'approved' ? 'Approved (Locked)' : s.status === 'rejected' ? 'Ditolak' : s.status}
                        </span>
                        {s.rejectNote && <p className="text-[10px] text-red-600 mt-1 max-w-[160px] truncate" title={s.rejectNote}>Alasan: {s.rejectNote}</p>}
                      </td>
                      <td className="py-3 px-3 text-xs">
                        <p className="font-medium text-slate-800">{s.submittedByName || '-'}</p>
                        <p className="text-[10px] text-slate-400">{fmtDate(s.submittedAt)}</p>
                      </td>
                      <td className="py-3 px-3 text-xs">
                        <p className="font-medium text-slate-800">{s.pimpinanApprovedByName || '-'}</p>
                        <p className="text-[10px] text-slate-400">{fmtDate(s.pimpinanApprovedAt)}</p>
                      </td>
                      <td className="py-3 px-3 text-xs">
                        <p className="font-medium text-slate-800">{s.approvedByName || s.rejectedByName || '-'}</p>
                        <p className="text-[10px] text-slate-400">{fmtDate(s.approvedAt || s.rejectedAt)}</p>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button className="btn-secondary !rounded-lg !py-1 !px-2 text-xs" onClick={() => handleReview(s)}>
                          <IconEye className="h-3.5 w-3.5" /> Detail
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title={reviewData ? `Detail Persetujuan — ${reviewData.submission.uptCode} ${reviewData.submission.month}/${reviewData.submission.year}` : 'Review Laporan'} subtitle={reviewData ? `${reviewData.upt.name || ''}` : ''} wide>
        {reviewLoading ? (
          <div className="p-8 text-center"><Spinner className="h-6 w-6 mx-auto" /><p className="text-xs text-slate-500 mt-2">Memuat detail...</p></div>
        ) : !reviewData ? (
          <EmptyState icon={<IconFileText className="h-6 w-6" />} title="Tidak ada data" desc="Gagal memuat detail." />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <div>
                <p className="text-slate-400 font-bold uppercase text-[10px]">1. Dikrim UPT</p>
                <p className="font-semibold text-slate-900">{reviewData.submission.submittedByName}</p>
                <p className="text-slate-500 text-[10px]">{fmtDate(reviewData.submission.submittedAt)}</p>
              </div>
              <div>
                <p className="text-slate-400 font-bold uppercase text-[10px]">2. Disetujui Pimpinan</p>
                <p className="font-semibold text-slate-900">{reviewData.submission.pimpinanApprovedByName || '-'}</p>
                <p className="text-slate-500 text-[10px]">{fmtDate(reviewData.submission.pimpinanApprovedAt)}</p>
              </div>
              <div>
                <p className="text-slate-400 font-bold uppercase text-[10px]">3. Diproses BPSDMP</p>
                <p className="font-semibold text-slate-900">{reviewData.submission.approvedByName || reviewData.submission.rejectedByName || '-'}</p>
                <p className="text-slate-500 text-[10px]">{fmtDate(reviewData.submission.approvedAt || reviewData.submission.rejectedAt)}</p>
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600">Program</th>
                    <th className="text-center px-2 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">Target Peserta</th>
                    <th className="text-center px-2 py-2 text-xs font-bold uppercase tracking-wide text-sky-700">Peserta L</th>
                    <th className="text-center px-2 py-2 text-xs font-bold uppercase tracking-wide text-sky-700">P</th>
                    <th className="text-center px-2 py-2 text-xs font-bold uppercase tracking-wide text-slate-900 bg-sky-50">Total</th>
                    <th className="text-center px-2 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">Target Lulusan</th>
                    <th className="text-center px-2 py-2 text-xs font-bold uppercase tracking-wide text-emerald-700">L</th>
                    <th className="text-center px-2 py-2 text-xs font-bold uppercase tracking-wide text-emerald-700">P</th>
                    <th className="text-center px-2 py-2 text-xs font-bold uppercase tracking-wide text-slate-900 bg-emerald-50">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reviewData.programs.map((p) => (
                    <tr key={p.programId} className={p.isParent ? 'bg-slate-50/50 font-bold' : ''}>
                      <td className="px-3 py-2 text-xs">{p.isParent ? p.programName : `↳ ${p.programName}`}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-xs text-slate-500">{p.targetPeserta}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-xs">{p.pesertaL}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-xs">{p.pesertaP}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-xs font-bold bg-sky-50">{p.pesertaL + p.pesertaP}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-xs text-slate-500">{p.targetLulusan}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-xs">{p.lulusanL}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-xs">{p.lulusanP}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-xs font-bold bg-emerald-50">{p.lulusanL + p.lulusanP}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary !rounded-xl" onClick={() => setReviewOpen(false)}>Tutup</button>
              <button className="btn-secondary !rounded-xl" onClick={handleDownloadPdf}><IconDownload className="h-4 w-4" /> Unduh PDF</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
