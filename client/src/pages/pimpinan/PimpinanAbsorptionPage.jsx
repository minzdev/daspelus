import React, { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import api, { apiError } from '../../lib/api'
import { Alert, EmptyState, SkeletonRows, ConfirmDialog } from '../../components/ui'
import {
  IconGraduation, IconCheck, IconX, IconChevronDown, IconEye,
} from '../../components/icons'
import logoBpsdm from '../../assets/logo-bpsdm.png'
import { yearOptions, fmtNum } from '../../utils/format'
import { useToast } from '../../components/Toast'

export default function PimpinanAbsorptionPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [year, setYear] = useState(new Date().getFullYear())
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Modal Action State
  const [selectedSub, setSelectedSub] = useState(null)
  const [actionType, setActionType] = useState(null) // 'approve' | 'reject'
  const [notes, setNotes] = useState('')
  const [processing, setProcessing] = useState(false)

  // Preview Data State
  const [previewQuarter, setPreviewQuarter] = useState(null)
  const [previewData, setPreviewData] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data: res } = await api.get('/absorptions/pimpinan/inbox', { params: { year } })
      setSubmissions(res.submissions || [])
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    load()
  }, [load])

  const openPreview = async (sub) => {
    setPreviewQuarter(sub.quarter)
    setLoadingPreview(true)
    try {
      const { data: res } = await api.get('/absorptions/my', { params: { year, quarter: sub.quarter } })
      setPreviewData(res)
    } catch (err) {
      toast.error(apiError(err))
    } finally {
      setLoadingPreview(false)
    }
  }

  const handleReview = async () => {
    if (!selectedSub || !actionType) return
    setProcessing(true)
    try {
      await api.post('/absorptions/pimpinan/review', {
        submissionId: selectedSub.id,
        action: actionType,
        notes: notes.trim(),
      })
      toast.success(actionType === 'approve' ? 'Laporan penyerapan berhasil disetujui.' : 'Laporan penyerapan dikembalikan ke Admin UPT untuk perbaikan.')
      setSelectedSub(null)
      setActionType(null)
      setNotes('')
      load()
    } catch (err) {
      toast.error(apiError(err))
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="animate-fadeUp space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-navy-950 via-navy-900 to-navy-950 px-5 py-4 text-white shadow-md border border-navy-800">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 p-1.5 shadow-inner border border-white/15" style={{ width: '40px', height: '40px' }}>
              <img src={logoBpsdm} alt="Logo BPSDMP" className="h-full w-full object-contain max-h-7 max-w-7" onError={(e) => (e.target.style.display = 'none')} />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black text-white tracking-tight">
                Persetujuan Penyerapan Lulusan
              </h1>
              <p className="text-xs text-navy-200 mt-0.5">
                <strong className="text-white">{user?.upt?.name || 'UPT'}</strong> — Verifikasi dan persetujuan laporan penyerapan taruna lulusan per triwulan.
              </p>
            </div>
          </div>

          <div className="relative">
            <select
              className="appearance-none cursor-pointer bg-white/10 hover:bg-white/15 border border-white/20 text-white font-extrabold text-xs rounded-xl py-2 pl-3 pr-8 shadow-sm backdrop-blur-md transition-all focus:outline-none focus:ring-2 focus:ring-gold-400"
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

      {error && <Alert type="error">{error}</Alert>}

      {/* List Submissions */}
      <div className="card p-5 border-surface-border shadow-card space-y-4">
        <h2 className="text-sm font-black text-navy-900 uppercase tracking-wide">
          Pengajuan Laporan Penyerapan Triwulanan ({year})
        </h2>

        {loading ? (
          <SkeletonRows rows={4} />
        ) : submissions.length === 0 ? (
          <EmptyState
            icon={<IconGraduation className="h-7 w-7" />}
            title="Belum Ada Pengajuan Penyerapan"
            desc={`Admin UPT belum mengirimkan laporan penyerapan lulusan untuk Tahun ${year}.`}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {submissions.map((sub) => {
              const isPending = sub.status === 'submitted_pimpinan'
              const isAppr = sub.status === 'approved_pimpinan'
              const isRej = sub.status === 'rejected_pimpinan'

              let statusBadge = (
                <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  Draf UPT
                </span>
              )
              if (isPending) {
                statusBadge = (
                  <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                    Menunggu Persetujuan Anda
                  </span>
                )
              } else if (isAppr) {
                statusBadge = (
                  <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300">
                    ✓ Telah Disetujui
                  </span>
                )
              } else if (isRej) {
                statusBadge = (
                  <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-300">
                    ✕ Ditolak (Revisi)
                  </span>
                )
              }

              return (
                <div
                  key={sub.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    isPending
                      ? 'bg-amber-50/40 border-amber-200 shadow-sm ring-1 ring-amber-300/60'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h3 className="text-base font-black text-navy-950">{sub.quarterName}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {fmtNum(sub.recordsCount)} data taruna dilaporkan
                      </p>
                    </div>
                    {statusBadge}
                  </div>

                  {sub.notes && (
                    <div className="text-[11px] p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 my-3">
                      <strong>Catatan:</strong> {sub.notes}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200/80 mt-3">
                    <button
                      type="button"
                      className="btn-secondary !text-xs !py-1.5 !px-3 rounded-lg font-bold flex items-center gap-1.5"
                      onClick={() => openPreview(sub)}
                    >
                      <IconEye className="h-3.5 w-3.5" />
                      <span>Lihat Rincian Data</span>
                    </button>

                    {isPending && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          className="btn-danger !text-xs !py-1.5 !px-3 rounded-lg font-bold flex items-center gap-1"
                          onClick={() => {
                            setSelectedSub(sub)
                            setActionType('reject')
                            setNotes('')
                          }}
                        >
                          <IconX className="h-3.5 w-3.5" />
                          <span>Tolak</span>
                        </button>
                        <button
                          type="button"
                          className="btn-primary !bg-emerald-600 hover:!bg-emerald-700 text-white !text-xs !py-1.5 !px-3 rounded-lg font-bold flex items-center gap-1"
                          onClick={() => {
                            setSelectedSub(sub)
                            setActionType('approve')
                            setNotes('')
                          }}
                        >
                          <IconCheck className="h-3.5 w-3.5" />
                          <span>Setujui</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* MODAL REVIEW ACTION */}
      {selectedSub && actionType && (
        <div className="modal-overlay">
          <div className="modal-flex">
            <div className="modal-panel max-w-md p-6 space-y-4">
              <h3 className="text-base font-black text-navy-900">
                {actionType === 'approve' ? 'Setujui Laporan Penyerapan?' : 'Tolak & Kembalikan untuk Revisi?'}
              </h3>
              <p className="text-xs text-slate-600">
                {actionType === 'approve'
                  ? `Anda akan menyetujui data penyerapan ${selectedSub.quarterName} Tahun ${year}.`
                  : `Berikan catatan perbaikan agar Admin UPT dapat memperbaiki data yang belum sesuai.`}
              </p>

              <div>
                <label className="form-label">Catatan Pimpinan {actionType === 'reject' ? '(Wajib Diisi)' : '(Opsional)'}</label>
                <textarea
                  rows={3}
                  className="w-full text-xs font-semibold rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-emerald-400 focus:outline-none"
                  placeholder={actionType === 'reject' ? 'Tuliskan alasan penolakan dan instruksi perbaikan...' : 'Catatan persetujuan...'}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  required={actionType === 'reject'}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-surface-border">
                <button
                  type="button"
                  className="btn-secondary !text-xs !py-2 !px-3.5"
                  onClick={() => {
                    setSelectedSub(null)
                    setActionType(null)
                  }}
                >
                  Batal
                </button>
                <button
                  type="button"
                  className={actionType === 'approve' ? 'btn-primary !bg-emerald-600 hover:!bg-emerald-700 !text-xs !py-2 !px-4' : 'btn-danger !text-xs !py-2 !px-4'}
                  disabled={processing || (actionType === 'reject' && !notes.trim())}
                  onClick={handleReview}
                >
                  {processing ? 'Memproses...' : actionType === 'approve' ? 'Ya, Setujui Laporan' : 'Tolak Laporan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PREVIEW DETAIL DATA TARUNA */}
      {previewQuarter && (
        <div className="modal-overlay">
          <div className="modal-flex">
            <div className="modal-panel max-w-4xl p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-surface-border">
                <div>
                  <h3 className="text-base font-black text-navy-900">
                    Rincian Penyerapan Triwulan {previewQuarter} ({year})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Total Lulusan: {fmtNum(previewData?.summary?.totalLulusan || 0)} · Bekerja: {fmtNum(previewData?.summary?.totalBekerja || 0)} ({previewData?.summary?.pctAbsorption || 0}%)
                  </p>
                </div>
                <button type="button" className="text-slate-400 hover:text-slate-600 text-sm" onClick={() => setPreviewQuarter(null)}>✕</button>
              </div>

              {loadingPreview ? (
                <SkeletonRows rows={6} />
              ) : (
                <div className="max-h-96 overflow-y-auto w-full border border-slate-200 rounded-xl">
                  <table className="w-full border-collapse text-left text-xs text-slate-800">
                    <thead>
                      <tr className="bg-navy-950 text-white font-extrabold uppercase text-[10px]">
                        <th className="px-3 py-2 text-center w-8">#</th>
                        <th className="px-3 py-2">PROGRAM STUDI</th>
                        <th className="px-3 py-2">NAMA TARUNA</th>
                        <th className="px-3 py-2">KATEGORI</th>
                        <th className="px-3 py-2">INSTANSI BEKERJA</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {(previewData?.records || []).map((r, i) => (
                        <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                          <td className="px-3 py-2 text-center text-slate-400 font-bold">{i + 1}</td>
                          <td className="px-3 py-2 font-bold text-navy-950">{r.prodi?.namaProdi || '-'}</td>
                          <td className="px-3 py-2 font-extrabold text-navy-900">{r.namaTaruna}</td>
                          <td className="px-3 py-2 uppercase font-bold text-[10px] text-slate-600">{r.kategoriSerap}</td>
                          <td className="px-3 py-2 text-slate-700">{r.instansiBekerja || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="pt-2 text-right">
                <button type="button" className="btn-secondary !text-xs !py-1.5 !px-3" onClick={() => setPreviewQuarter(null)}>
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
