import { useCallback, useEffect, useState } from 'react'
import api, { apiError } from '../../lib/api'
import { Alert, EmptyState, SkeletonRows, Spinner } from '../../components/ui'
import { IconTarget, IconRefresh, IconPlus } from '../../components/icons'
import { useToast } from '../../components/Toast'
import { yearOptions } from '../../utils/format'

export default function UnlockTargetPkPage() {
  const [year, setYear] = useState(new Date().getFullYear())
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
      const { data } = await api.get('/unlock-requests/my', { params: { type: 'target_pk' } })
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
      toast.error('Alasan perubahan/unlock wajib diisi')
      return
    }
    setSaving(true)
    try {
      const { data } = await api.post('/unlock-requests', {
        year,
        month: 0,
        reason,
        type: 'target_pk',
      })
      toast.success('Pengajuan dikirim', data.message)
      setReason('')
      await load()
    } catch (err) {
      toast.error('Gagal mengajukan unlock target', apiError(err))
    } finally {
      setSaving(false)
    }
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'approved':
        return <span className="text-xs font-bold px-2.5 py-1 rounded-full ring-1 bg-emerald-50 text-emerald-700 ring-emerald-200">Approved (Terbuka)</span>
      case 'rejected':
        return <span className="text-xs font-bold px-2.5 py-1 rounded-full ring-1 bg-red-50 text-red-700 ring-red-200">Ditolak</span>
      case 'pending_pimpinan':
        return <span className="text-xs font-bold px-2.5 py-1 rounded-full ring-1 bg-amber-50 text-amber-700 ring-amber-200">Menunggu Pimpinan</span>
      case 'pending_pusbang':
        return <span className="text-xs font-bold px-2.5 py-1 rounded-full ring-1 bg-sky-50 text-sky-700 ring-sky-200">Menunggu Pusbang</span>
      case 'pending_bpsdmp':
        return <span className="text-xs font-bold px-2.5 py-1 rounded-full ring-1 bg-purple-50 text-purple-700 ring-purple-200">Menunggu BPSDMP</span>
      default:
        return <span className="text-xs font-bold px-2.5 py-1 rounded-full ring-1 bg-slate-50 text-slate-700 ring-slate-200">{status}</span>
    }
  }

  return (
    <div className="animate-fadeUp space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Perubahan Target PK (Unlock Target PK)</h1>
          <p className="page-desc">
            Target PK kini <strong>satu kali input per tahun</strong>. Ajukan pembukaan kunci Target PK {year} yang telah disetujui agar UPT Anda dapat memperbarui target (termasuk rincian diklat). Alur persetujuan: Pimpinan → Pusbang → BPSDMP.
          </p>
        </div>
        <button className="btn-secondary !rounded-xl" onClick={load}>
          <IconRefresh className="h-4 w-4" /> Refresh
        </button>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      <div className="card rounded-2xl border border-slate-200 p-5">
        <h3 className="text-sm font-bold text-slate-900">Ajukan Perubahan / Unlock Target PK {year}</h3>
        <form onSubmit={handleSubmit} className="mt-3 grid gap-3 sm:grid-cols-4">
          <div>
            <label className="form-label">Tahun Target</label>
            <select className="form-input !rounded-xl" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Jenis Target</label>
            <div className="form-input !rounded-xl bg-slate-50 text-slate-600 font-bold">Satu kali input ({year})</div>
          </div>
          <div className="sm:col-span-2">
            <label className="form-label">Alasan Perubahan Target</label>
            <input
              className="form-input !rounded-xl"
              placeholder="Revisi target / tambah diklat / penyesuaian program..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="sm:col-span-4 flex justify-end">
            <button type="submit" className="btn-primary !rounded-xl" disabled={saving}>
              {saving ? <Spinner /> : <><IconPlus className="h-4 w-4" /> Ajukan Unlock Target PK {year}</>}
            </button>
          </div>
        </form>
      </div>

      <div className="card rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">Riwayat Pengajuan Perubahan Target PK</h3>
          <span className="text-xs text-slate-500">{list.length} pengajuan</span>
        </div>
        {loading ? (
          <div className="p-4"><SkeletonRows rows={3} /></div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={<IconTarget className="h-6 w-6" />}
            title="Belum ada pengajuan"
            desc="Belum ada pengajuan unlock Target PK untuk UPT Anda."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {list.map((r) => (
              <div key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-slate-900">
                      Target PK · {r.year}
                    </p>
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                      Target PK
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Alasan: {r.reason}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Trail: {(r.trail || []).map((t) => `${t.role}:${t.decision}`).join(' → ')}
                  </p>
                </div>
                <div>{getStatusBadge(r.status)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
