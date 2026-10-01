import { useCallback, useEffect, useMemo, useState } from 'react'
import api, { apiError } from '../../lib/api'
import { Alert, EmptyState, SkeletonRows, Spinner, Modal } from '../../components/ui'
import { IconTarget, IconCheck, IconX, IconRefresh, IconEye, IconSearch, IconHistory } from '../../components/icons'
import { useToast } from '../../components/Toast'
import { fmtNum, fmtDate } from '../../utils/format'

export default function AdminTargetInboxPage() {
  const [tab, setTab] = useState('pending') // pending | processed
  const [list, setList] = useState([])
  const [processed, setProcessed] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const toast = useToast()
  const [acting, setActing] = useState(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewTarget, setReviewTarget] = useState(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [inboxRes, procRes] = await Promise.all([
        api.get('/targets/submissions/inbox'),
        api.get('/targets/submissions/processed').catch(() => ({ data: { targetSubmissions: [] } })),
      ])
      setList(inboxRes.data.targetSubmissions || [])
      setProcessed(procRes.data.targetSubmissions || [])
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const filteredProcessed = useMemo(() => {
    const q = search.trim().toLowerCase()
    return processed.filter((s) => {
      if (!q) return true
      return (s.uptCode || '').toLowerCase().includes(q) || (s.uptName || '').toLowerCase().includes(q)
    })
  }, [processed, search])

  useEffect(() => { load() }, [load])

  const handleApproveBpsdmp = async (id) => {
    setActing(id)
    try {
      const { data } = await api.patch(`/targets/submissions/${id}/approve-bpsdmp`)
      toast.success('Target PK Disetujui Final', data.message)
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
          <h1 className="page-title">Persetujuan Target PK — Admin BPSDMP</h1>
          <p className="page-desc">Setujui final Target PK UPT agar UPT dapat menginput realisasi bulanan. Pantau riwayat persetujuan/penolakan beserta tanggal & pengirim.</p>
        </div>
        <button className="btn-secondary !rounded-xl" onClick={load}><IconRefresh className="h-4 w-4" /> Refresh</button>
      </div>

      <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
        <button type="button" onClick={() => setTab('pending')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${tab === 'pending' ? 'bg-slate-900 text-white shadow' : 'text-slate-600 hover:text-slate-900'}`}>
          Perlu Persetujuan ({list.length})
        </button>
        <button type="button" onClick={() => setTab('processed')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${tab === 'processed' ? 'bg-slate-900 text-white shadow' : 'text-slate-600 hover:text-slate-900'}`}>
          Riwayat Persetujuan ({processed.length})
        </button>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {tab === 'pending' ? (
        <div className="card rounded-2xl border border-slate-200 overflow-hidden">
          {loading ? <div className="p-4"><SkeletonRows rows={4} /></div> : list.length === 0 ? (
            <EmptyState icon={<IconTarget className="h-6 w-6" />} title="Tidak ada pengajuan Target PK" desc="Semua pengajuan Target PK UPT telah disetujui BPSDMP." />
          ) : (
            <div className="divide-y divide-slate-100">
              {list.map((s) => (
                <div key={s.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
                  <div>
                    <p className="font-bold text-slate-900">{s.uptCode} — {s.uptName} <span className="text-slate-500 font-normal">· {s.month === 0 ? 'Tahunan' : 'Bulan ' + s.month} {s.year}</span> <span className="ml-2 inline-flex items-center rounded-full bg-sky-50 text-sky-700 ring-1 ring-sky-200 px-2 py-0.5 text-xs font-bold">{s.status}</span></p>
                    <p className="text-xs text-slate-500 mt-1">Disetujui Pimpinan: <strong className="text-slate-800">{s.pimpinanApprovedByName || '-'}</strong> · Pengirim: {s.submittedByName} · {fmtDate(s.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button className="btn-secondary !rounded-xl !py-2" onClick={() => { setReviewTarget(s); setReviewOpen(true) }}><IconEye className="h-4 w-4" /> Review Data</button>
                    <button className="btn-primary !rounded-xl !py-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => handleApproveBpsdmp(s.id)} disabled={acting === s.id}>
                      {acting === s.id ? <Spinner className="h-4 w-4" /> : <IconCheck className="h-4 w-4" />} Approve & Aktifkan Target
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
            <EmptyState icon={<IconHistory className="h-6 w-6" />} title="Riwayat Kosong" desc="Belum ada riwayat persetujuan atau penolakan Target PK." />
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
                      <td className="py-3 px-2 text-center text-xs font-semibold">{s.month === 0 ? 'Tahunan' : s.month}/{s.year}</td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${s.status === 'approved' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : s.status === 'rejected' ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-sky-50 text-sky-700 ring-sky-200'}`}>
                          {s.status === 'approved' ? 'Approved' : s.status === 'rejected' ? 'Ditolak' : s.status}
                        </span>
                        {s.rejectNote && <p className="text-[10px] text-red-600 mt-1 max-w-[160px] truncate" title={s.rejectNote}>Alasan: {s.rejectNote}</p>}
                      </td>
                      <td className="py-3 px-3 text-xs">
                        <p className="font-medium text-slate-800">{s.submittedByName || '-'}</p>
                        <p className="text-[10px] text-slate-400">{fmtDate(s.createdAt)}</p>
                      </td>
                      <td className="py-3 px-3 text-xs">
                        <p className="font-medium text-slate-800">{s.pimpinanApprovedByName || '-'}</p>
                        <p className="text-[10px] text-slate-400">{fmtDate(s.updatedAt)}</p>
                      </td>
                      <td className="py-3 px-3 text-xs">
                        <p className="font-medium text-slate-800">{s.approvedByName || s.rejectedByName || '-'}</p>
                        <p className="text-[10px] text-slate-400">{fmtDate(s.updatedAt)}</p>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button className="btn-secondary !rounded-lg !py-1 !px-2 text-xs" onClick={() => { setReviewTarget(s); setReviewOpen(true) }}>
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

      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title={reviewTarget ? `Review Target PK BPSDMP — ${reviewTarget.uptCode}` : 'Review Target'} subtitle={reviewTarget?.uptName || ''} wide>
        {!reviewTarget ? null : (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <p className="font-bold text-slate-900">{reviewTarget.uptCode} — {reviewTarget.uptName}</p>
              <p className="text-slate-500">Disetujui Pimpinan: <strong>{reviewTarget.pimpinanApprovedByName || '-'}</strong> · Periode {reviewTarget.month === 0 ? 'Tahunan' : 'Bulan ' + reviewTarget.month} {reviewTarget.year}</p>
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
              <button className="btn-primary !rounded-xl bg-emerald-600 hover:bg-emerald-700" onClick={() => handleApproveBpsdmp(reviewTarget.id)} disabled={acting === reviewTarget.id}><IconCheck className="h-4 w-4" /> Approve & Aktifkan</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
