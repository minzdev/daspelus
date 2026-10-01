import { useCallback, useEffect, useState } from 'react'
import api, { apiError } from '../../lib/api'
import { Alert, EmptyState, SkeletonRows, Spinner } from '../../components/ui'
import { IconTarget, IconRefresh, IconPlus } from '../../components/icons'
import { useToast } from '../../components/Toast'
import { yearOptions } from '../../utils/format'
import { MONTHS } from '../../utils/format'

export default function UptUnlockPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [reason, setReason] = useState('')
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/unlock-requests/my', { params: { type: 'capaian' } })
      setList(data.requests || [])
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!reason.trim()) {
      toast.error('Alasan wajib diisi')
      return
    }
    setSaving(true)
    try {
      const { data } = await api.post('/unlock-requests', { year, month, reason, type: 'capaian' })
      toast.success('Pengajuan dikirim', data.message)
      setReason('')
      await load()
    } catch (err) {
      toast.error('Gagal mengajukan', apiError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="animate-fadeUp space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Unlock Capaian</h1>
          <p className="page-desc">Ajukan pembukaan kunci laporan realisasi capaian bulan yang sudah disetujui Pimpinan. Alur: Pimpinan → Pusbang → BPSDMP.</p>
        </div>
        <button className="btn-secondary !rounded-xl" onClick={load}><IconRefresh className="h-4 w-4" /> Refresh</button>
      </div>
      {error && <Alert type="error">{error}</Alert>}

      <div className="card rounded-2xl border border-slate-200 p-5">
        <h3 className="text-sm font-bold text-slate-900">Ajukan Unlock</h3>
        <form onSubmit={handleSubmit} className="mt-3 grid gap-3 sm:grid-cols-4">
          <div>
            <label className="form-label">Tahun</label>
            <select className="form-input !rounded-xl" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Bulan</label>
            <select className="form-input !rounded-xl" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="form-label">Alasan</label>
            <input className="form-input !rounded-xl" placeholder="Data salah input, perlu perbaikan..." value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="sm:col-span-4 flex justify-end">
            <button type="submit" className="btn-primary !rounded-xl" disabled={saving}>{saving ? <Spinner /> : <><IconPlus className="h-4 w-4" /> Ajukan Unlock</>}</button>
          </div>
        </form>
      </div>

      <div className="card rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">Riwayat Pengajuan</h3>
          <span className="text-xs text-slate-500">{list.length} pengajuan</span>
        </div>
        {loading ? <div className="p-4"><SkeletonRows rows={3} /></div> : list.length === 0 ? (
          <EmptyState icon={<IconTarget className="h-6 w-6" />} title="Belum ada pengajuan" desc="Belum ada permintaan unlock untuk UPT Anda." />
        ) : (
          <div className="divide-y divide-slate-100">
            {list.map((r) => (
              <div key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className="font-bold text-slate-900">{r.month}/{r.year} · {r.status}</p>
                  <p className="text-xs text-slate-500">Alasan: {r.reason}</p>
                  <p className="text-xs text-slate-400">Trail: {(r.trail || []).map((t) => `${t.role}:${t.decision}`).join(' → ')}</p>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ring-1 ${r.status === 'approved' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : r.status === 'rejected' ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>{r.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
