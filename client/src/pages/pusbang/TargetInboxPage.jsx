import { useCallback, useEffect, useState } from 'react'
import api, { apiError } from '../../lib/api'
import { Alert, EmptyState, SkeletonRows, Spinner, Modal } from '../../components/ui'
import { IconTarget, IconCheck, IconX, IconRefresh, IconEye } from '../../components/icons'
import { useToast } from '../../components/Toast'
import { fmtNum } from '../../utils/format'

export default function PusbangTargetInboxPage() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const toast = useToast()
  const [acting, setActing] = useState(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewTarget, setReviewTarget] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/targets/submissions/inbox')
      // SINGLE-INPUT: hanya pengajuan satu kali per tahun (month=0); baris bulanan lama disembunyikan
      setList((data.targetSubmissions || []).filter((s) => Number(s.month) === 0))
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleApprove = async (id) => {
    setActing(id)
    try {
      const { data } = await api.patch(`/targets/submissions/${id}/approve-bpsdmp`)
      toast.success('Target PK Disetujui', data.message)
      await load()
      setReviewOpen(false)
    } catch (err) {
      toast.error('Gagal', apiError(err))
    } finally {
      setActing(null)
    }
  }

  const handleReject = async (id) => {
    const note = prompt('Alasan penolakan (opsional):')
    if (note === null) return
    setActing(id)
    try {
      const { data } = await api.patch(`/targets/submissions/${id}/reject`, { note })
      toast.success('Ditolak', data.message)
      await load()
      setReviewOpen(false)
    } catch (err) {
      toast.error('Gagal', apiError(err))
    } finally {
      setActing(null)
    }
  }

  return (
    <div className="animate-fadeUp space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Persetujuan Target PK — Pusbang</h1>
          <p className="page-desc">Setujui final Target PK UPT sesuai matra Anda agar UPT dapat menginput realisasi bulanan.</p>
        </div>
        <button className="btn-secondary !rounded-xl" onClick={load}><IconRefresh className="h-4 w-4" /> Refresh</button>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      <div className="card rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? <div className="p-4"><SkeletonRows rows={4} /></div> : list.length === 0 ? (
          <EmptyState icon={<IconTarget className="h-6 w-6" />} title="Tidak ada pengajuan Target PK" desc="Semua pengajuan Target PK UPT telah disetujui." />
        ) : (
          <div className="divide-y divide-slate-100">
            {list.map((s) => (
              <div key={s.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
                <div>
                  <p className="font-bold text-slate-900">{s.uptCode} — {s.uptName} <span className="text-slate-500 font-normal">· Target {s.year} (satu kali input)</span></p>
                  <p className="text-xs text-slate-500 mt-1">Disetujui Pimpinan: <strong className="text-slate-800">{s.pimpinanApprovedByName || '-'}</strong> · Matra: <span className="font-bold text-amber-600">{s.matra || '-'}</span></p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button className="btn-secondary !rounded-xl !py-2" onClick={() => { setReviewTarget(s); setReviewOpen(true) }}><IconEye className="h-4 w-4" /> Review Data</button>
                  <button className="btn-primary !rounded-xl !py-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => handleApprove(s.id)} disabled={acting === s.id}>
                    {acting === s.id ? <Spinner className="h-4 w-4" /> : <IconCheck className="h-4 w-4" />} Approve & Aktifkan
                  </button>
                  <button className="btn-secondary !rounded-xl !py-2" onClick={() => handleReject(s.id)} disabled={acting === s.id}><IconX className="h-4 w-4" /> Tolak</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title={reviewTarget ? `Review Target PK Pusbang — ${reviewTarget.uptCode}` : 'Review Target'} subtitle={reviewTarget?.uptName || ''} wide>
        {!reviewTarget ? null : (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <p className="font-bold text-slate-900">{reviewTarget.uptCode} — {reviewTarget.uptName}</p>
              <p className="text-slate-500">Disetujui Pimpinan: <strong>{reviewTarget.pimpinanApprovedByName || '-'}</strong> · Target {reviewTarget.year} (satu kali input)</p>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-600">
                    <th className="text-left px-3 py-2">Program ID</th>
                    <th className="text-right px-3 py-2">Target Peserta</th>
                    <th className="text-right px-3 py-2">Target Lulusan</th>
                    <th className="text-right px-3 py-2 bg-amber-50">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(Array.isArray(reviewTarget.targetSnapshot) ? reviewTarget.targetSnapshot : reviewTarget.targetSnapshot?.targets || []).map((t, i) => (
                    <tr key={i} className="hover:bg-slate-50/40">
                      <td className="px-3 py-2 text-xs font-medium text-slate-800">{t.programId}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs">{fmtNum(t.targetPeserta)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs">{fmtNum(t.targetLulusan)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs font-bold bg-amber-50">{fmtNum((t.targetPeserta||0) + (t.targetLulusan||0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary !rounded-xl" onClick={() => setReviewOpen(false)}>Tutup</button>
              <button className="btn-primary !rounded-xl bg-emerald-600 hover:bg-emerald-700" onClick={() => handleApprove(reviewTarget.id)} disabled={acting === reviewTarget.id}><IconCheck className="h-4 w-4" /> Approve & Aktifkan</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}