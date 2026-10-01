import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import api, { apiError } from '../../lib/api'
import { Alert, EmptyState, SkeletonRows, Spinner } from '../../components/ui'
import {
  IconTarget, IconCheck, IconX, IconRefresh, IconSearch,
  IconUnlock, IconAlertTriangle, IconFileText,
} from '../../components/icons'
import { useToast } from '../../components/Toast'

export default function PusbangUnlockInboxPage() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const toast = useToast()
  const [acting, setActing] = useState(null)

  // Filter & Search
  const [typeFilter, setTypeFilter] = useState('all') // 'all' | 'target_pk' | 'capaian'
  const [search, setSearch] = useState('')

  // Modal State
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [decisionType, setDecisionType] = useState('approve') // 'approve' | 'reject'
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState('')

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

  useEffect(() => {
    load()
  }, [load])

  const openDecisionModal = (req, type) => {
    setSelectedRequest(req)
    setDecisionType(type)
    setNote('')
    setNoteError('')
    setModalOpen(true)
  }

  const handleDecisionSubmit = async () => {
    if (!selectedRequest) return
    if (decisionType === 'reject' && !note.trim()) {
      setNoteError('Alasan penolakan wajib diisi.')
      return
    }

    setActing(selectedRequest.id)
    try {
      const { data } = await api.patch(`/unlock-requests/${selectedRequest.id}/decision`, {
        decision: decisionType,
        note: note.trim(),
      })
      toast.success(
        decisionType === 'approve' ? 'Berhasil Diteruskan' : 'Permohonan Ditolak',
        data.message || (decisionType === 'approve' ? 'Permohonan berhasil diteruskan ke Admin BPSDMP.' : 'Permohonan unlock ditolak.')
      )
      setModalOpen(false)
      await load()
    } catch (err) {
      toast.error('Gagal memproses permohonan', apiError(err))
    } finally {
      setActing(null)
    }
  }

  const filteredList = useMemo(() => {
    return list.filter((r) => {
      if (typeFilter !== 'all' && (r.type || 'capaian') !== typeFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const code = (r.uptCode || '').toLowerCase()
        const name = (r.uptName || '').toLowerCase()
        const reqBy = (r.requestedByName || '').toLowerCase()
        if (!code.includes(q) && !name.includes(q) && !reqBy.includes(q)) return false
      }
      return true
    })
  }, [list, typeFilter, search])

  return (
    <div className="animate-fadeUp space-y-6">
      {/* 1. HEADER BANNER */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-navy-950 via-navy-900 to-slate-900 px-6 py-6 text-white shadow-xl border border-navy-800">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-400 p-2 border border-amber-500/30">
              <IconUnlock className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-white tracking-tight">
                  Persetujuan &amp; Penerusan Unlock Request
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Role Pusbang
                </span>
              </div>
              <p className="text-xs text-navy-200 mt-0.5 max-w-2xl">
                Verifikasi permohonan pembukaan kunci dari Pimpinan UPT di matra Anda, kemudian setujui untuk diteruskan ke Admin BPSDMP.
              </p>
            </div>
          </div>

          <button
            className="btn-secondary !bg-white/10 hover:!bg-white/20 !text-white !border-white/20 !rounded-xl text-xs shrink-0 self-start sm:self-center"
            onClick={load}
          >
            <IconRefresh className="h-3.5 w-3.5" />
            <span>Muat Ulang</span>
          </button>
        </div>
      </div>

      {/* 2. WORKFLOW STEPPER INDICATOR */}
      <div className="card p-5 border-slate-200 shadow-sm space-y-3">
        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wide">
          Alur Prosedur Pembukaan Kunci Data (Unlock):
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          {/* Step 1 */}
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-start gap-2.5">
            <span className="h-6 w-6 rounded-full bg-slate-200 text-slate-700 font-black text-[11px] flex items-center justify-center shrink-0">1</span>
            <div>
              <p className="font-extrabold text-slate-800">Admin UPT</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Mengajukan buka kunci dengan alasan &amp; bukti.</p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-start gap-2.5">
            <span className="h-6 w-6 rounded-full bg-slate-200 text-slate-700 font-black text-[11px] flex items-center justify-center shrink-0">2</span>
            <div>
              <p className="font-extrabold text-slate-800">Pimpinan UPT</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Memeriksa &amp; menyetujui pengajuan di UPT.</p>
            </div>
          </div>

          {/* Step 3 - Pusbang Active */}
          <div className="p-3 rounded-2xl bg-sky-50 border-2 border-sky-400 flex items-start gap-2.5 shadow-sm">
            <span className="h-6 w-6 rounded-full bg-sky-600 text-white font-black text-[11px] flex items-center justify-center shrink-0 shadow-sm">3</span>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="font-black text-sky-950">Pusbang Matra</p>
                <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-sky-200 text-sky-900">Tahap Ini</span>
              </div>
              <p className="text-[11px] text-sky-900 mt-0.5 font-medium">Verifikasi &amp; teruskan rekomendasi ke pusat.</p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-start gap-2.5">
            <span className="h-6 w-6 rounded-full bg-slate-200 text-slate-700 font-black text-[11px] flex items-center justify-center shrink-0">4</span>
            <div>
              <p className="font-extrabold text-slate-800">Admin BPSDMP</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Final approval &amp; membuka kunci sistem.</p>
            </div>
          </div>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* 3. CONTROLS: TABS & SEARCH */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Tabs */}
        <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-bold">
          <button
            type="button"
            className={`px-3 py-1.5 rounded-lg transition-all ${typeFilter === 'all' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}
            onClick={() => setTypeFilter('all')}
          >
            Semua Pengajuan ({list.length})
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded-lg transition-all ${typeFilter === 'target_pk' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}
            onClick={() => setTypeFilter('target_pk')}
          >
            Target PK ({list.filter((r) => r.type === 'target_pk').length})
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded-lg transition-all ${typeFilter === 'capaian' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}
            onClick={() => setTypeFilter('capaian')}
          >
            Realisasi Capaian ({list.filter((r) => r.type !== 'target_pk').length})
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Cari UPT atau nama pemohon..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-xs font-medium rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 w-64 focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400">
            <IconSearch className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>

      {/* 4. REQUEST LIST CARDS */}
      <div className="space-y-3">
        {loading ? (
          <div className="card p-6 border-slate-200">
            <SkeletonRows rows={4} />
          </div>
        ) : filteredList.length === 0 ? (
          <div className="card p-8 border-slate-200 text-center">
            <EmptyState
              icon={<IconTarget className="h-8 w-8 text-slate-300" />}
              title="Tidak ada permohonan unlock"
              desc={
                list.length === 0
                  ? 'Saat ini belum ada permintaan unlock dari Pimpinan UPT yang menunggu verifikasi Pusbang.'
                  : 'Tidak ditemukan permohonan yang sesuai dengan filter pencarian.'
              }
            />
          </div>
        ) : (
          filteredList.map((r) => {
            const isTargetPk = r.type === 'target_pk'
            const itemLabel = isTargetPk
              ? r.month === 0
                ? `Target PK Tahunan ${r.year}`
                : `Target PK Bulan ${r.month}/${r.year}`
              : `Laporan Realisasi Bulan ${r.month}/${r.year}`

            // Find note from pimpinan if in trail
            const pimpinanEntry = (r.trail || []).slice().reverse().find((t) => t.role === 'PIMPINAN_UPT')

            return (
              <div
                key={r.id}
                className="card p-5 border-slate-200 hover:border-slate-300 hover:shadow-md transition-all rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                        isTargetPk
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-sky-50 text-sky-800 border-sky-200'
                      }`}
                    >
                      {isTargetPk ? 'Buka Kunci Target PK' : 'Buka Kunci Capaian Bulanan'}
                    </span>
                    <span className="text-xs font-black text-slate-900">
                      {r.uptCode} — {r.uptName}
                    </span>
                    <span className="text-xs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md">
                      {itemLabel}
                    </span>
                  </div>

                  {/* Requester & reason */}
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1">
                    <div className="flex items-center justify-between text-slate-500 text-[11px]">
                      <span>
                        Diajukan oleh: <strong className="text-slate-800">{r.requestedByName || 'Admin UPT'}</strong>
                      </span>
                      <span>{r.createdAt ? new Date(r.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                    </div>
                    <p className="text-slate-800 font-medium pt-0.5">
                      <span className="text-slate-400 font-bold">Alasan UPT: </span>
                      &ldquo;{r.reason || 'Tidak ada alasan dicantumkan.'}&rdquo;
                    </p>
                    {pimpinanEntry?.note && (
                      <p className="text-emerald-800 text-[11px] pt-1 border-t border-slate-200/60">
                        <strong>Catatan Pimpinan UPT: </strong>
                        &ldquo;{pimpinanEntry.note}&rdquo;
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 self-end lg:self-center">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-sm transition-all"
                    onClick={() => openDecisionModal(r, 'approve')}
                    disabled={acting === r.id}
                  >
                    <IconCheck className="h-4 w-4" />
                    <span>Teruskan ke BPSDMP</span>
                  </button>

                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 font-bold text-xs transition-all"
                    onClick={() => openDecisionModal(r, 'reject')}
                    disabled={acting === r.id}
                  >
                    <IconX className="h-4 w-4" />
                    <span>Tolak</span>
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* 5. INTERACTIVE DECISION MODAL */}
      {modalOpen &&
        selectedRequest &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
            onMouseDown={(e) => e.target === e.currentTarget && !acting && setModalOpen(false)}
          >
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4 animate-scaleUp">
              <div className="flex items-start gap-3.5">
                <div
                  className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 ${
                    decisionType === 'approve'
                      ? 'bg-sky-100 text-sky-700 ring-8 ring-sky-50'
                      : 'bg-rose-100 text-rose-700 ring-8 ring-rose-50'
                  }`}
                >
                  {decisionType === 'approve' ? <IconCheck className="h-5 w-5" /> : <IconAlertTriangle className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-black text-slate-900 leading-tight">
                    {decisionType === 'approve' ? 'Teruskan Permohonan ke BPSDMP' : 'Tolak Permohonan Unlock'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {decisionType === 'approve'
                      ? 'Pusbang menyetujui rekomendasi dan meneruskan permohonan ke Admin BPSDMP untuk pembukaan kunci final.'
                      : 'Permohonan akan ditolak dan dikembalikan ke UPT dengan alasan penolakan.'}
                  </p>
                </div>
              </div>

              {/* Summary box */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1">
                <div className="flex justify-between font-extrabold text-slate-900">
                  <span>{selectedRequest.uptCode} — {selectedRequest.uptName}</span>
                </div>
                <p className="text-slate-600">
                  Item:{' '}
                  <strong>
                    {selectedRequest.type === 'target_pk'
                      ? selectedRequest.month === 0
                        ? `Target PK Tahunan ${selectedRequest.year}`
                        : `Target PK Bulan ${selectedRequest.month}/${selectedRequest.year}`
                      : `Realisasi Bulan ${selectedRequest.month}/${selectedRequest.year}`}
                  </strong>
                </p>
                <p className="text-slate-600 text-[11px] pt-1 border-t border-slate-200/60">
                  Alasan UPT: &ldquo;{selectedRequest.reason}&rdquo;
                </p>
              </div>

              {/* Textarea for note */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {decisionType === 'approve'
                    ? 'Catatan / Rekomendasi Pusbang (Opsional):'
                    : 'Alasan Penolakan (Wajib diisi):'}
                </label>
                <textarea
                  rows={3}
                  value={note}
                  onChange={(e) => {
                    setNote(e.target.value)
                    if (noteError) setNoteError('')
                  }}
                  placeholder={
                    decisionType === 'approve'
                      ? 'Contoh: Berkas dan klarifikasi telah diverifikasi, direkomendasikan untuk dibuka kunci.'
                      : 'Contoh: Alasan perubahan target belum memenuhi ketentuan administrasi.'
                  }
                  className="w-full text-xs font-medium rounded-xl border border-slate-200 p-2.5 focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
                {noteError && <p className="text-rose-600 text-[11px] font-bold mt-1">{noteError}</p>}
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
                  onClick={() => setModalOpen(false)}
                  disabled={acting != null}
                >
                  Batal
                </button>
                <button
                  type="button"
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold text-white shadow-md transition-all flex items-center gap-1.5 ${
                    decisionType === 'approve'
                      ? 'bg-sky-600 hover:bg-sky-700 shadow-sky-600/20'
                      : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                  }`}
                  onClick={handleDecisionSubmit}
                  disabled={acting != null}
                >
                  {acting != null && <Spinner className="h-3.5 w-3.5" />}
                  <span>{decisionType === 'approve' ? 'Ya, Teruskan ke BPSDMP' : 'Tolak Permohonan'}</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
