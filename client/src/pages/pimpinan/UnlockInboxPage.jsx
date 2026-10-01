import { useCallback, useEffect, useState } from 'react'
import api, { apiError } from '../../lib/api'
import { Alert, EmptyState, SkeletonRows, Spinner, ConfirmDialog } from '../../components/ui'
import {
  IconTarget,
  IconCheck,
  IconX,
  IconRefresh,
  IconUnlock,
  IconClock,
  IconLayers,
  IconChart,
  IconPeople,
} from '../../components/icons'
import logoBpsdm from '../../assets/logo-bpsdm.png'
import { useToast } from '../../components/Toast'

export default function PimpinanUnlockInboxPage() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterType, setFilterType] = useState('all') // 'all' | 'target_pk' | 'capaian' | 'taruna'
  const toast = useToast()

  // Modal Decision
  const [modalData, setModalData] = useState({ open: false, request: null, decision: 'approve' })
  const [modalNote, setModalNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

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

  const openDecisionModal = (request, decision) => {
    setModalData({ open: true, request, decision })
    setModalNote('')
  }

  const handleConfirmDecision = async () => {
    const { request, decision } = modalData
    if (!request) return

    if (decision === 'reject' && !modalNote.trim()) {
      toast.error('Alasan penolakan wajib diisi.')
      return
    }

    setSubmitting(true)
    try {
      const { data } = await api.patch(`/unlock-requests/${request.id}/decision`, {
        decision,
        note: modalNote.trim() || undefined,
      })
      toast.success(
        decision === 'approve'
          ? 'Permohonan disetujui & diteruskan ke Pusbang.'
          : 'Permohonan berhasil ditolak.',
        data.message
      )
      setModalData({ open: false, request: null, decision: 'approve' })
      setModalNote('')
      await load()
    } catch (err) {
      toast.error('Gagal memproses keputusan', apiError(err))
    } finally {
      setSubmitting(false)
    }
  }

  const filteredList = list.filter((r) => {
    if (filterType === 'all') return true
    if (filterType === 'target_pk') return r.type === 'target_pk'
    if (filterType === 'taruna') return r.type === 'taruna'
    return r.type === 'capaian' || !r.type
  })

  return (
    <div className="animate-fadeUp space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-navy-950 via-navy-900 to-navy-950 px-5 py-4 text-white shadow-md border border-navy-800">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 p-1.5 shadow-inner border border-white/15"
              style={{ width: '40px', height: '40px' }}
            >
              <img
                src={logoBpsdm}
                alt="Logo BPSDMP"
                className="h-full w-full object-contain max-h-7 max-w-7"
                onError={(e) => (e.target.style.display = 'none')}
              />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="rounded-full text-[10px] font-black uppercase px-2.5 py-0.5 border bg-amber-500/20 text-amber-300 border-amber-500/30">
                  Tahap 2: Verifikasi Pimpinan UPT
                </span>
                <span className="text-xs text-navy-300">
                  {list.length} permohonan aktif
                </span>
              </div>
              <h1 className="text-base sm:text-lg font-black text-white tracking-tight mt-0.5">
                Persetujuan Buka Kunci (Unlock)
              </h1>
              <p className="text-xs text-navy-200 mt-0.5 max-w-2xl">
                Tinjau dan setujui permohonan pembukaan kunci data dari Admin UPT sebelum direkomendasikan ke Pusbang Matra dan disetujui final oleh Admin BPSDMP.
              </p>
            </div>
          </div>

          <button
            onClick={load}
            disabled={loading}
            className="btn-secondary !bg-white/10 hover:!bg-white/20 !text-white !border-white/20 !py-2 !px-3.5 rounded-xl text-xs flex items-center gap-1.5 self-start md:self-auto"
          >
            <IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Muat Ulang</span>
          </button>
        </div>
      </div>

      {/* Alur 4 Tahap Prosedur */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2.5">
          Prosedur Buka Kunci Data:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 flex items-center gap-2 text-slate-700">
            <span className="h-6 w-6 rounded-full bg-slate-200 text-slate-700 font-black flex items-center justify-center text-[10px]">1</span>
            <span className="font-semibold">Admin UPT Ajukan</span>
          </div>
          <div className="rounded-xl border-2 border-amber-400 bg-amber-50/70 p-2.5 flex items-center gap-2 text-amber-900 shadow-sm">
            <span className="h-6 w-6 rounded-full bg-amber-500 text-white font-black flex items-center justify-center text-[10px]">2</span>
            <span className="font-black">Pimpinan UPT (Tahap Ini)</span>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 flex items-center gap-2 text-slate-700">
            <span className="h-6 w-6 rounded-full bg-slate-200 text-slate-700 font-black flex items-center justify-center text-[10px]">3</span>
            <span className="font-semibold">Pusbang Rekomendasi</span>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 flex items-center gap-2 text-slate-700">
            <span className="h-6 w-6 rounded-full bg-slate-200 text-slate-700 font-black flex items-center justify-center text-[10px]">4</span>
            <span className="font-semibold">Admin BPSDMP Final</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-xs font-bold text-slate-500 mr-1">Filter Modul:</span>
        <button
          onClick={() => setFilterType('all')}
          className={`px-3 py-1.5 rounded-xl font-bold transition-colors ${
            filterType === 'all'
              ? 'bg-navy-950 text-white shadow-sm'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Semua ({list.length})
        </button>
        <button
          onClick={() => setFilterType('taruna')}
          className={`px-3 py-1.5 rounded-xl font-bold transition-colors ${
            filterType === 'taruna'
              ? 'bg-navy-950 text-white shadow-sm'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Master Data Taruna ({list.filter((r) => r.type === 'taruna').length})
        </button>
        <button
          onClick={() => setFilterType('target_pk')}
          className={`px-3 py-1.5 rounded-xl font-bold transition-colors ${
            filterType === 'target_pk'
              ? 'bg-navy-950 text-white shadow-sm'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Target PK ({list.filter((r) => r.type === 'target_pk').length})
        </button>
        <button
          onClick={() => setFilterType('capaian')}
          className={`px-3 py-1.5 rounded-xl font-bold transition-colors ${
            filterType === 'capaian'
              ? 'bg-navy-950 text-white shadow-sm'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Capaian Realisasi ({list.filter((r) => r.type === 'capaian' || !r.type).length})
        </button>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* Daftar Pengajuan */}
      <div className="card rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-5">
            <SkeletonRows rows={4} />
          </div>
        ) : filteredList.length === 0 ? (
          <EmptyState
            icon={<IconUnlock className="h-8 w-8 text-slate-400" />}
            title="Tidak Ada Permohonan Buka Kunci"
            desc="Saat ini tidak ada permohonan buka kunci data yang menunggu persetujuan Pimpinan."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredList.map((r) => {
              const isTaruna = r.type === 'taruna'
              const isTargetPk = r.type === 'target_pk'
              const typeBadgeCls = isTaruna
                ? 'bg-purple-100 text-purple-800 border-purple-200'
                : isTargetPk
                ? 'bg-amber-100 text-amber-800 border-amber-200'
                : 'bg-sky-100 text-sky-800 border-sky-200'
              const typeLabel = isTaruna
                ? 'Unlock Data Taruna'
                : isTargetPk
                ? 'Unlock Target PK'
                : 'Unlock Realisasi Capaian'

              const targetLabel = isTaruna
                ? `Master Data Taruna Tahun ${r.year}`
                : isTargetPk
                ? (r.month === 0 ? `Target Tahunan ${r.year}` : `Target Bulan ${r.month}/${r.year}`)
                : `Realisasi Bulan ${r.month}/${r.year}`

              return (
                <div
                  key={r.id}
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/80 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md border ${typeBadgeCls}`}>
                        {typeLabel}
                      </span>
                      <span className="text-xs font-black text-slate-900">
                        {r.uptName || r.uptCode} · <span className="text-navy-700">{targetLabel}</span>
                      </span>
                    </div>

                    <div className="mt-2 rounded-xl bg-slate-50 p-3 border border-slate-200 text-xs text-slate-700">
                      <strong className="text-slate-900 block text-[11px] uppercase tracking-wider mb-0.5">
                        Alasan Permohonan:
                      </strong>
                      "{r.reason}"
                    </div>

                    <p className="text-[11px] text-slate-500 mt-2 flex items-center gap-1.5">
                      <IconClock className="h-3.5 w-3.5 text-slate-400" />
                      <span>
                        Diajukan oleh <strong className="text-slate-700">{r.requestedByName || 'Admin UPT'}</strong> pada{' '}
                        {new Date(r.createdAt).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        WIB
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    <button
                      className="btn-primary !bg-emerald-600 hover:!bg-emerald-700 !text-white !rounded-xl text-xs py-2 px-3.5 shadow-sm flex items-center gap-1.5"
                      onClick={() => openDecisionModal(r, 'approve')}
                    >
                      <IconCheck className="h-4 w-4" />
                      <span>Setujui &amp; Teruskan ke Pusbang</span>
                    </button>
                    <button
                      className="btn-secondary !text-rose-700 !border-rose-300 hover:!bg-rose-50 !rounded-xl text-xs py-2 px-3.5 flex items-center gap-1.5"
                      onClick={() => openDecisionModal(r, 'reject')}
                    >
                      <IconX className="h-4 w-4" />
                      <span>Tolak</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* CONFIRM DECISION MODAL */}
      <ConfirmDialog
        open={Boolean(modalData.open)}
        onCancel={() => setModalData({ open: false, request: null, decision: 'approve' })}
        onConfirm={handleConfirmDecision}
        loading={submitting}
        title={
          modalData.decision === 'approve'
            ? 'Setujui Permohonan Buka Kunci?'
            : 'Tolak Permohonan Buka Kunci?'
        }
        body={
          modalData.decision === 'approve'
            ? `Permohonan buka kunci akan disetujui Pimpinan UPT dan diteruskan ke Admin Pusbang Matra untuk verifikasi.`
            : `Permohonan buka kunci akan ditolak dan data tetap terkunci. Admin UPT wajib diberikan alasan penolakan.`
        }
        confirmLabel={modalData.decision === 'approve' ? 'Setujui & Teruskan ke Pusbang' : 'Tolak Permohonan'}
        confirmTone={modalData.decision === 'approve' ? 'primary' : 'danger'}
      >
        <div className="mt-3 w-full">
          <label className="form-label">
            {modalData.decision === 'approve' ? 'Catatan Rekomendasi (Opsional)' : 'Alasan Penolakan (Wajib)'}
          </label>
          <textarea
            className="w-full text-xs font-semibold rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-amber-400 focus:outline-none min-h-[75px]"
            placeholder={modalData.decision === 'approve' ? 'Tambahkan catatan jika diperlukan...' : 'Jelaskan alasan penolakan permohonan...'}
            value={modalNote}
            onChange={(e) => setModalNote(e.target.value)}
          />
        </div>
      </ConfirmDialog>
    </div>
  )
}
