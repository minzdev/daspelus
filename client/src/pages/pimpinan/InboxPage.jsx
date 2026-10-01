import { useCallback, useEffect, useState } from 'react'
import api, { apiError } from '../../lib/api'
import { Alert, EmptyState, SkeletonRows, Spinner, Modal } from '../../components/ui'
import { IconFileText, IconCheck, IconX, IconRefresh, IconEye, IconDownload } from '../../components/icons'
import { useToast } from '../../components/Toast'
import { buildRealisasiPdf } from '../../utils/realisasiPdf'

export default function PimpinanInboxPage() {
  const [subs, setSubs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const toast = useToast()
  const [acting, setActing] = useState(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewData, setReviewData] = useState(null)
  const [reviewLoading, setReviewLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/submissions/inbox')
      setSubs(data.submissions || [])
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

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
        id: p.programId,
        name: p.programName,
        isParent: p.isParent,
        isAutoSum: false,
        values: {
          pesertaL: p.pesertaL,
          pesertaP: p.pesertaP,
          lulusanL: p.lulusanL,
          lulusanP: p.lulusanP,
        },
        total: p.pesertaL + p.pesertaP + p.lulusanL + p.lulusanP,
      }))
      const totalPeserta = programs.filter((p) => p.isParent).reduce((s, p) => s + p.pesertaL + p.pesertaP, 0)
      const totalLulusan = programs.filter((p) => p.isParent).reduce((s, p) => s + p.lulusanL + p.lulusanP, 0)
      const url = buildRealisasiPdf({
        uptCode: upt.code || submission.uptCode,
        uptName: upt.name || submission.uptName,
        year: submission.year,
        month: submission.month,
        rows,
        totalPeserta,
        totalLulusan,
        grandTotal: totalPeserta + totalLulusan,
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

  const handleApprove = async (id) => {
    setActing(id)
    try {
      const { data } = await api.patch(`/submissions/${id}/approve`)
      toast.success('Disetujui', data.message)
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
          <h1 className="page-title">Inbox Laporan — Pimpinan UPT</h1>
          <p className="page-desc">Review laporan bulanan dari Admin UPT. Lihat detail, unduh PDF, lalu setujui untuk mengunci atau tolak untuk revisi.</p>
        </div>
        <button className="btn-secondary !rounded-xl" onClick={load}><IconRefresh className="h-4 w-4" /> Muat Ulang</button>
      </div>
      {error && <Alert type="error">{error}</Alert>}
      <div className="card rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? <div className="p-4"><SkeletonRows rows={4} /></div> : subs.length === 0 ? (
          <EmptyState icon={<IconFileText className="h-6 w-6" />} title="Tidak ada laporan pending" desc="Semua laporan sudah diproses atau belum ada kiriman dari Admin UPT." />
        ) : (
          <div className="divide-y divide-slate-100">
            {subs.map((s) => (
              <div key={s.id} className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900">{s.uptCode} — {s.uptName} <span className="text-slate-500 font-normal">· {s.month}/{s.year}</span> <span className="ml-2 inline-flex items-center rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-xs font-bold ring-1 ring-amber-200">{s.status}</span></p>
                  <p className="text-xs text-slate-500 mt-1">Dikirim oleh {s.submittedByName} · {s.submittedAt?._seconds ? new Date(s.submittedAt._seconds*1000).toLocaleDateString('id-ID') : ''}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <button className="btn-secondary !rounded-xl !py-2" onClick={() => handleReview(s)}>
                    <IconEye className="h-4 w-4" /> Review
                  </button>
                  <button className="btn-primary !rounded-xl !py-2" onClick={() => handleApprove(s.id)} disabled={acting === s.id}>
                    {acting === s.id ? <Spinner className="h-4 w-4" /> : <IconCheck className="h-4 w-4" />} Setujui & Kunci
                  </button>
                  <button className="btn-secondary !rounded-xl !py-2" onClick={() => handleReject(s.id)} disabled={acting === s.id}>
                    <IconX className="h-4 w-4" /> Tolak
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title={reviewData ? `Review Laporan — ${reviewData.submission.uptCode} ${reviewData.submission.month}/${reviewData.submission.year}` : 'Review Laporan'} subtitle={reviewData ? `${reviewData.upt.name || ''} · Status: ${reviewData.submission.status}` : ''} wide>
        {reviewLoading ? (
          <div className="p-8 text-center"><Spinner className="h-6 w-6 mx-auto" /><p className="text-xs text-slate-500 mt-2">Memuat detail...</p></div>
        ) : !reviewData ? (
          <EmptyState icon={<IconFileText className="h-6 w-6" />} title="Tidak ada data" desc="Gagal memuat detail laporan." />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs">
                <p className="font-bold text-slate-900">{reviewData.submission.uptCode} — {reviewData.submission.uptName}</p>
                <p className="text-slate-500">Periode {reviewData.submission.month}/{reviewData.submission.year} · Dikirim {reviewData.submission.submittedByName}</p>
              </div>
              <button className="btn-secondary !rounded-xl" onClick={handleDownloadPdf}><IconDownload className="h-4 w-4" /> Unduh PDF</button>
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
                    <tr key={p.programId} className={p.isParent ? 'bg-slate-50/50 font-bold' : 'hover:bg-slate-50/30'}>
                      <td className="px-3 py-2 text-xs">
                        <p className={p.isParent ? 'font-bold text-slate-900' : 'font-medium text-slate-700 pl-3'}>{p.isParent ? p.programName : `↳ ${p.programName}`}</p>
                        {!p.isParent && <p className="text-[10px] text-slate-400 pl-3">{p.parentName}</p>}
                      </td>
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
              <button className="btn-secondary !rounded-xl" onClick={handleDownloadPdf}><IconDownload className="h-4 w-4" /> PDF</button>
              <button className="btn-primary !rounded-xl" onClick={() => handleApprove(reviewData.submission.id)} disabled={acting === reviewData.submission.id}><IconCheck className="h-4 w-4" /> Setujui</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
