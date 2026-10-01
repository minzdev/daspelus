import { useCallback, useEffect, useState } from 'react'
import api, { apiError } from '../../lib/api'
import { Alert, EmptyState, SkeletonRows } from '../../components/ui'
import { IconFileText, IconRefresh } from '../../components/icons'

export default function PusbangInboxPage() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/submissions/inbox')
      setList(data.submissions || [])
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <div className="animate-fadeUp space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Inbox Laporan — Pusbang</h1>
          <p className="page-desc">Pantau laporan yang masuk dari UPT sesuai matra Anda. Persetujuan akhir tetap di Pimpinan UPT.</p>
        </div>
        <button className="btn-secondary !rounded-xl" onClick={load}><IconRefresh className="h-4 w-4" /> Refresh</button>
      </div>
      {error && <Alert type="error">{error}</Alert>}
      <div className="card rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? <div className="p-4"><SkeletonRows rows={4} /></div> : list.length === 0 ? (
          <EmptyState icon={<IconFileText className="h-6 w-6" />} title="Tidak ada laporan pending" desc="Belum ada laporan yang perlu dipantau." />
        ) : (
          <div className="divide-y divide-slate-100">
            {list.map((s) => (
              <div key={s.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className="font-bold text-slate-900">{s.uptCode} — {s.uptName} · {s.month}/{s.year}</p>
                  <p className="text-xs text-slate-500">Status: {s.status} · Oleh {s.submittedByName}</p>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200">{s.matra || '-'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
