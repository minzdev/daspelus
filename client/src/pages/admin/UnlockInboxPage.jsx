import { useCallback, useEffect, useState } from 'react'
import api, { apiError } from '../../lib/api'
import { Alert, EmptyState, SkeletonRows, Spinner } from '../../components/ui'
import { IconTarget, IconCheck, IconX, IconRefresh } from '../../components/icons'
import { useToast } from '../../components/Toast'

export default function AdminUnlockInboxPage() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const toast = useToast()
  const [acting, setActing] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/unlock-requests/inbox')
      setList(data.requests || [])
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const decide = async (id, decision) => {
    const note = prompt(decision === 'approve' ? 'Catatan persetujuan (opsional):' : 'Alasan penolakan:')
    if (decision === 'reject' && note === null) return
    setActing(id)
    try {
      const { data } = await api.patch(`/unlock-requests/${id}/decision`, { decision, note: note || '' })
      toast.success(decision === 'approve' ? 'Disetujui' : 'Ditolak', data.message)
      await load()
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
          <h1 className="page-title">Persetujuan Unlock — BPSDMP</h1>
          <p className="page-desc">Final approval unlock dari Pimpinan UPT. Setelah disetujui, UPT dapat edit kembali bulan tersebut.</p>
        </div>
        <button className="btn-secondary !rounded-xl" onClick={load}><IconRefresh className="h-4 w-4" /> Refresh</button>
      </div>
      {error && <Alert type="error">{error}</Alert>}
      <div className="card rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? <div className="p-4"><SkeletonRows rows={4} /></div> : list.length === 0 ? (
          <EmptyState icon={<IconTarget className="h-6 w-6" />} title="Tidak ada pengajuan" desc="Belum ada permintaan unlock yang menunggu di BPSDMP." />
        ) : (
          <div className="divide-y divide-slate-100">
            {list.map((r) => (
              <div key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded ${r.type === 'target_pk' ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-sky-100 text-sky-800 border border-sky-200'}`}>
                      {r.type === 'target_pk' ? 'Unlock Target PK' : 'Unlock Capaian'}
                    </span>
                    <p className="font-bold text-slate-900">
                      {r.uptCode} — {r.uptName} · {r.type === 'target_pk' ? (r.month === 0 ? `Target Tahunan ${r.year}` : `Target Bulan ${r.month}/${r.year}`) : `Capaian Bulan ${r.month}/${r.year}`}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Oleh {r.requestedByName} · Alasan: {r.reason}</p>
                  <p className="text-xs text-amber-600 font-bold mt-0.5">Status: {r.status}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Trail: {(r.trail || []).map((t) => `${t.role}:${t.decision}`).join(' → ')}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button className="btn-primary !rounded-xl bg-emerald-600 hover:bg-emerald-700" onClick={() => decide(r.id, 'approve')} disabled={acting === r.id}>{acting === r.id ? <Spinner /> : <IconCheck className="h-4 w-4" />} Buka Kunci</button>
                  <button className="btn-secondary !rounded-xl" onClick={() => decide(r.id, 'reject')} disabled={acting === r.id}><IconX className="h-4 w-4" /> Tolak</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
