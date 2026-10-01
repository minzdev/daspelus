import React, { useCallback, useEffect, useState } from 'react'
import api, { apiError } from '../../lib/api'
import { Alert, EmptyState, SkeletonRows, ConfirmDialog } from '../../components/ui'
import { IconCheck, IconChevronDown, IconPeople, IconUnlock, IconX, IconClock } from '../../components/icons'
import logoBpsdm from '../../assets/logo-bpsdm.png'
import { yearOptions, fmtNum } from '../../utils/format'
import { useToast } from '../../components/Toast'

const STATUS_LABELS = {
  draft: { label: 'Draft', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  submitted_pimpinan: { label: 'Menunggu Verifikasi Anda', cls: 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse' },
  submitted_admin: { label: 'Menunggu Persetujuan Admin BPSDM', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  approved_admin: { label: 'Disetujui Admin BPSDM', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected_pimpinan: { label: 'Ditolak (Revisi UPT)', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  rejected_admin: { label: 'Ditolak Admin BPSDM', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
}

export default function PimpinanTarunaInboxPage() {
  const toast = useToast()
  const [year, setYear] = useState(new Date().getFullYear())
  const [submissions, setSubmissions] = useState([])
  const [pendingUnlockRequest, setPendingUnlockRequest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Expanded row detail
  const [expandedId, setExpandedId] = useState(null)

  // Review Modal
  const [reviewTarget, setReviewTarget] = useState(null) // { submission, action }
  const [reviewNotes, setReviewNotes] = useState('')
  const [processing, setProcessing] = useState(false)

  // Unlock Decision Modal
  const [unlockDecisionModal, setUnlockDecisionModal] = useState({ open: false, action: 'approve' })
  const [unlockNote, setUnlockNote] = useState('')
  const [actingUnlock, setActingUnlock] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data: res } = await api.get('/absorptions/taruna-submissions/pimpinan/inbox', { params: { year } })
      setSubmissions(res.submissions || [])
      setPendingUnlockRequest(res.pendingUnlockRequest || null)
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    load()
  }, [load])

  const handleReview = async () => {
    if (!reviewTarget) return
    setProcessing(true)
    try {
      await api.post('/absorptions/taruna-submissions/pimpinan/review', {
        submissionId: reviewTarget.submission.id,
        action: reviewTarget.action,
        notes: reviewNotes || undefined,
      })
      toast.success(
        reviewTarget.action === 'approve'
          ? 'Data Taruna disetujui & diteruskan ke Admin BPSDM.'
          : 'Data Taruna dikembalikan ke Admin UPT untuk revisi.'
      )
      setReviewTarget(null)
      setReviewNotes('')
      load()
    } catch (err) {
      toast.error(apiError(err))
    } finally {
      setProcessing(false)
    }
  }

  const handleDecideUnlock = async () => {
    if (!pendingUnlockRequest) return
    const isReject = unlockDecisionModal.action === 'reject'
    if (isReject && !unlockNote.trim()) {
      toast.error('Alasan penolakan permohonan wajib diisi.')
      return
    }
    setActingUnlock(true)
    try {
      await api.patch(`/unlock-requests/${pendingUnlockRequest.id}/decision`, {
        decision: unlockDecisionModal.action,
        note: unlockNote.trim() || undefined,
      })
      toast.success(
        unlockDecisionModal.action === 'approve'
          ? 'Permohonan unlock disetujui & diteruskan ke Pusbang.'
          : 'Permohonan unlock ditolak.'
      )
      setUnlockDecisionModal({ open: false, action: 'approve' })
      setUnlockNote('')
      load()
    } catch (err) {
      toast.error(apiError(err))
    } finally {
      setActingUnlock(false)
    }
  }

  const pendingCount = submissions.filter((s) => s.status === 'submitted_pimpinan').length

  return (
    <div className="animate-fadeUp space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-navy-950 via-navy-900 to-navy-950 px-5 py-4 text-white shadow-md border border-navy-800">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 p-1.5 shadow-inner border border-white/15" style={{ width: '40px', height: '40px' }}>
              <img src={logoBpsdm} alt="Logo BPSDMP" className="h-full w-full object-contain max-h-7 max-w-7" onError={(e) => (e.target.style.display = 'none')} />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black text-white tracking-tight">
                Persetujuan Data Taruna
              </h1>
              <p className="text-xs text-navy-200 mt-0.5">
                Verifikasi master data taruna (Nama & Nomor Taruna) yang diajukan Admin UPT sebelum diteruskan ke Admin BPSDM.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {pendingCount > 0 && (
              <span className="rounded-full text-[10px] font-extrabold px-2.5 py-1 border bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse">
                {pendingCount} Pengajuan Menunggu
              </span>
            )}
            <div className="relative">
              <select
                className="appearance-none cursor-pointer bg-white/10 hover:bg-white/15 border border-white/20 text-white font-extrabold text-xs rounded-xl py-2 pl-3 pr-8 shadow-sm backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-gold-400"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {yearOptions().map((y) => (
                  <option key={y} value={y} className="bg-navy-900 text-white font-bold py-1">Tahun {y}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-gold-300">
                <IconChevronDown className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* BANNER PERMOHONAN BUKA KUNCI (UNLOCK REQUEST) DARI ADMIN UPT */}
      {pendingUnlockRequest && (
        <div className="rounded-2xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 p-5 shadow-md animate-fadeUp">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="h-10 w-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-amber-500/30">
                <IconUnlock className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="rounded-full text-[10px] font-black uppercase px-2.5 py-0.5 bg-amber-500 text-white shadow-sm">
                    Permohonan Buka Kunci
                  </span>
                  <span className="text-xs text-amber-900 font-bold">
                    Tahun Anggaran {pendingUnlockRequest.year}
                  </span>
                </div>
                <h2 className="text-base font-black text-slate-900 mt-1">
                  Admin UPT Mengajukan Permohonan Buka Kunci Master Data Taruna
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Diajukan oleh: <strong className="text-slate-800">{pendingUnlockRequest.requestedByName || 'Admin UPT'}</strong> · {new Date(pendingUnlockRequest.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} WIB
                </p>
                <div className="mt-2.5 rounded-xl bg-white/90 p-3 border border-amber-200 text-xs text-slate-700 shadow-sm">
                  <strong className="text-amber-950 block text-[11px] uppercase tracking-wider mb-0.5">Alasan Permohonan:</strong>
                  "{pendingUnlockRequest.reason}"
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 self-end md:self-center">
              <button
                onClick={() => {
                  setUnlockDecisionModal({ open: true, action: 'approve' })
                  setUnlockNote('')
                }}
                className="btn-primary !bg-emerald-600 hover:!bg-emerald-700 !text-white !rounded-xl shadow-md text-xs py-2 px-3.5"
              >
                <IconCheck className="h-4 w-4" />
                Setujui &amp; Teruskan ke Pusbang
              </button>
              <button
                onClick={() => {
                  setUnlockDecisionModal({ open: true, action: 'reject' })
                  setUnlockNote('')
                }}
                className="btn-secondary !text-rose-700 !border-rose-300 hover:!bg-rose-50 !rounded-xl text-xs py-2 px-3.5"
              >
                <IconX className="h-4 w-4" />
                Tolak Permohonan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Daftar Pengajuan */}
      <div className="space-y-4">
        {loading ? (
          <div className="card p-5"><SkeletonRows rows={6} /></div>
        ) : submissions.length === 0 ? (
          <div className="card p-5">
            <EmptyState
              icon={<IconPeople className="h-7 w-7" />}
              title="Belum ada pengajuan data taruna"
              desc="Admin UPT belum mengirimkan data taruna untuk tahun ini."
            />
          </div>
        ) : (
          submissions.map((sub) => {
            const statusInfo = STATUS_LABELS[sub.status] || { label: sub.status, cls: 'bg-slate-100 text-slate-600 border-slate-200' }
            const isPending = sub.status === 'submitted_pimpinan'
            const isExpanded = expandedId === sub.id

            return (
              <div key={sub.id} className={`card p-5 border shadow-card space-y-3 ${isPending ? 'border-amber-300 bg-amber-50/20' : 'border-surface-border'}`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm font-black text-navy-950">{sub.quarterName}</span>
                    <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${statusInfo.cls}`}>
                      {statusInfo.label}
                    </span>
                    <span className="text-[11px] text-slate-500 font-semibold">
                      {fmtNum(sub.tarunaCount)} taruna terdaftar
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn-secondary !text-[11px] !py-1.5 !px-3 rounded-lg font-bold"
                      onClick={() => setExpandedId(isExpanded ? null : sub.id)}
                    >
                      {isExpanded ? 'Sembunyikan Detail' : 'Lihat Detail Taruna'}
                    </button>

                    {isPending && (
                      <>
                        <button
                          type="button"
                          className="btn-primary !bg-emerald-600 hover:!bg-emerald-700 !text-[11px] !py-1.5 !px-3 rounded-lg font-bold flex items-center gap-1"
                          onClick={() => { setReviewTarget({ submission: sub, action: 'approve' }); setReviewNotes('') }}
                        >
                          <IconCheck className="h-3 w-3" />
                          <span>Verifikasi & Teruskan</span>
                        </button>
                        <button
                          type="button"
                          className="btn-secondary !text-[11px] !py-1.5 !px-3 rounded-lg font-bold !text-rose-600 border-rose-200 hover:bg-rose-50"
                          onClick={() => { setReviewTarget({ submission: sub, action: 'reject' }); setReviewNotes('') }}
                        >
                          Tolak
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {sub.submittedAt && (
                  <p className="text-[11px] text-slate-400 font-medium">
                    Dikirim Admin UPT: {new Date(sub.submittedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                )}

                {sub.notes && (
                  <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2.5 italic">
                    Catatan: "{sub.notes}"
                  </p>
                )}

                {/* Detail Taruna Table */}
                {isExpanded && (
                  <div className="w-full overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full border-collapse text-left text-xs text-slate-800">
                      <thead>
                        <tr className="bg-navy-950 text-white font-extrabold uppercase text-[10px]">
                          <th className="px-3 py-2 text-center w-8">#</th>
                          <th className="px-3 py-2">NAMA TARUNA</th>
                          <th className="px-3 py-2">NOMOR TARUNA</th>
                          <th className="px-3 py-2">PROGRAM STUDI</th>
                          <th className="px-3 py-2 text-center">TAHUN LULUS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {(sub.tarunas || []).map((t, i) => (
                          <tr key={t.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                            <td className="px-3 py-2 text-center font-bold text-slate-400">{i + 1}</td>
                            <td className="px-3 py-2 font-extrabold text-navy-900">{t.nama}</td>
                            <td className="px-3 py-2 font-mono text-[11px] font-bold text-navy-950">{t.nomorTaruna}</td>
                            <td className="px-3 py-2 text-slate-700">{t.prodi?.namaProdi || '-'}</td>
                            <td className="px-3 py-2 text-center tabular-nums">{t.tahunLulus || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* MODAL REVIEW */}
      <ConfirmDialog
        open={Boolean(reviewTarget)}
        onCancel={() => setReviewTarget(null)}
        onConfirm={handleReview}
        loading={processing}
        title={reviewTarget?.action === 'approve'
          ? 'Verifikasi & Teruskan ke Admin BPSDM?'
          : 'Tolak Pengajuan Data Taruna?'}
        body={reviewTarget?.action === 'approve'
          ? 'Data Taruna akan diteruskan ke Admin BPSDM untuk persetujuan final. Admin UPT baru dapat mengisi laporan penyerapan setelah Admin BPSDM menyetujui.'
          : 'Data Taruna akan dikembalikan ke Admin UPT untuk diperbaiki. Silakan isi catatan revisi.'}
        confirmLabel={reviewTarget?.action === 'approve' ? 'Setujui & Teruskan' : 'Tolak Pengajuan'}
        confirmTone={reviewTarget?.action === 'approve' ? 'primary' : 'danger'}
      >
        {reviewTarget?.action === 'reject' && (
          <div className="mt-3 w-full">
            <label className="form-label">Catatan Revisi</label>
            <textarea
              className="w-full text-xs font-semibold rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-rose-400 focus:outline-none min-h-[80px]"
              placeholder="Contoh: Nama taruna tidak sesuai dengan data kelulusan..."
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
            />
          </div>
        )}
      </ConfirmDialog>

      {/* MODAL KEPUTUSAN UNLOCK REQUEST */}
      <ConfirmDialog
        open={Boolean(unlockDecisionModal.open)}
        onCancel={() => setUnlockDecisionModal({ open: false, action: 'approve' })}
        onConfirm={handleDecideUnlock}
        loading={actingUnlock}
        title={unlockDecisionModal.action === 'approve'
          ? 'Setujui Permohonan Buka Kunci Taruna?'
          : 'Tolak Permohonan Buka Kunci Taruna?'}
        body={unlockDecisionModal.action === 'approve'
          ? 'Permohonan buka kunci Master Data Taruna akan disetujui Pimpinan UPT dan diteruskan ke Admin Pusbang Matra untuk diproses lebih lanjut.'
          : 'Permohonan buka kunci akan ditolak dan Admin UPT tidak dapat mengubah data. Masukkan alasan penolakan di bawah.'}
        confirmLabel={unlockDecisionModal.action === 'approve' ? 'Setujui & Teruskan ke Pusbang' : 'Tolak Permohonan'}
        confirmTone={unlockDecisionModal.action === 'approve' ? 'primary' : 'danger'}
      >
        <div className="mt-3 w-full">
          <label className="form-label">
            {unlockDecisionModal.action === 'approve' ? 'Catatan Rekomendasi (Opsional)' : 'Alasan Penolakan (Wajib)'}
          </label>
          <textarea
            className="w-full text-xs font-semibold rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-amber-400 focus:outline-none min-h-[75px]"
            placeholder={unlockDecisionModal.action === 'approve' ? 'Tambahkan catatan jika diperlukan...' : 'Jelaskan alasan penolakan permohonan...'}
            value={unlockNote}
            onChange={(e) => setUnlockNote(e.target.value)}
          />
        </div>
      </ConfirmDialog>
    </div>
  )
}
