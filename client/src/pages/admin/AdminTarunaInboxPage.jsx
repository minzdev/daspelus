import React, { useCallback, useEffect, useMemo, useState } from 'react'
import api, { apiError } from '../../lib/api'
import { Alert, EmptyState, SkeletonRows, Modal, ConfirmDialog } from '../../components/ui'
import {
  IconCheck, IconChevronDown, IconPeople, IconSearch, IconEye, IconBuilding,
  IconGraduation, IconHistory, IconX, IconLayers,
} from '../../components/icons'
import logoBpsdm from '../../assets/logo-bpsdm.png'
import { yearOptions, fmtNum } from '../../utils/format'
import { useToast } from '../../components/Toast'

const MATRA_OPTIONS = [
  { id: 'all', label: 'Semua Matra' },
  { id: 'laut', label: 'Laut' },
  { id: 'darat', label: 'Darat' },
  { id: 'udara', label: 'Udara' },
]

export default function AdminTarunaInboxPage() {
  const toast = useToast()
  const [year, setYear] = useState(new Date().getFullYear())
  const [selectedMatra, setSelectedMatra] = useState('all')
  const [search, setSearch] = useState('')
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Detail modal state
  const [detailTarget, setDetailTarget] = useState(null) // submission object
  const [detailData, setDetailData] = useState(null) // { submission, upt, tarunas }
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [tarunaSearchInModal, setTarunaSearchInModal] = useState('')

  // Action review modal (approve / reject)
  const [reviewTarget, setReviewTarget] = useState(null) // { submission, action }
  const [reviewNotes, setReviewNotes] = useState('')
  const [processing, setProcessing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data: res } = await api.get('/absorptions/taruna-submissions/admin/inbox', { params: { year } })
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

  const openDetail = async (sub) => {
    setDetailTarget(sub)
    setTarunaSearchInModal('')
    setLoadingDetail(true)
    try {
      const { data: res } = await api.get(`/absorptions/taruna-submissions/admin/detail/${sub.id}`)
      setDetailData(res)
    } catch (err) {
      toast.error(apiError(err))
      setDetailTarget(null)
    } finally {
      setLoadingDetail(false)
    }
  }

  const handleReview = async () => {
    if (!reviewTarget) return
    if (reviewTarget.action === 'reject' && !reviewNotes.trim()) {
      toast.error('Catatan penolakan wajib diisi.')
      return
    }

    setProcessing(true)
    try {
      await api.post('/absorptions/taruna-submissions/admin/review', {
        submissionId: reviewTarget.submission.id,
        action: reviewTarget.action,
        notes: reviewNotes.trim() || undefined,
      })
      toast.success(
        reviewTarget.action === 'approve'
          ? 'Data Taruna berhasil disetujui final & dikunci. Admin UPT kini dapat mengisi laporan penyerapan.'
          : 'Data Taruna berhasil ditolak dan dikembalikan ke Admin UPT untuk diperbaiki.'
      )
      setReviewTarget(null)
      setReviewNotes('')
      setDetailTarget(null)
      load()
    } catch (err) {
      toast.error(apiError(err))
    } finally {
      setProcessing(false)
    }
  }

  // Filtered submissions
  const filteredSubmissions = useMemo(() => {
    return submissions.filter((s) => {
      // Matra filter
      if (selectedMatra !== 'all' && (s.matra || '').toLowerCase() !== selectedMatra) {
        return false
      }
      // Search filter
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const matchUpt = (s.uptName || '').toLowerCase().includes(q)
        const matchCode = (s.uptCode || '').toLowerCase().includes(q)
        const matchQuarter = (s.quarterName || '').toLowerCase().includes(q)
        if (!matchUpt && !matchCode && !matchQuarter) return false
      }
      return true
    })
  }, [submissions, selectedMatra, search])

  // Submissions inside modal filtered by search query
  const modalTarunas = useMemo(() => {
    const list = detailData?.tarunas || []
    if (!tarunaSearchInModal.trim()) return list
    const q = tarunaSearchInModal.trim().toLowerCase()
    return list.filter((t) =>
      (t.nama || '').toLowerCase().includes(q) ||
      (t.nomorTaruna || '').toLowerCase().includes(q) ||
      (t.prodi?.namaProdi || '').toLowerCase().includes(q)
    )
  }, [detailData?.tarunas, tarunaSearchInModal])

  // Summary statistics
  const totalPending = submissions.length
  const uniqueUptCount = new Set(submissions.map((s) => s.uptId)).size
  const totalTarunasPending = submissions.reduce((sum, s) => sum + (s.tarunaCount || 0), 0)

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
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-black text-white tracking-tight">
                  Persetujuan Data Taruna UPT
                </h1>
                <span className="text-[10px] font-extrabold uppercase bg-gold-500/20 text-gold-300 border border-gold-500/30 rounded-full px-2.5 py-0.5">
                  BPSDMP Nasional
                </span>
              </div>
              <p className="text-xs text-navy-200 mt-0.5 max-w-2xl">
                Verifikasi dan persetujuan akhir Master Data Taruna yang telah disetujui Pimpinan UPT. Setelah disetujui, data terkunci dan Admin UPT dapat mulai menginput laporan penyerapan.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Year Selector */}
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

            {/* Matra Filter */}
            <div className="relative">
              <select
                className="appearance-none cursor-pointer bg-white/10 hover:bg-white/15 border border-white/20 text-white font-extrabold text-xs rounded-xl py-2 pl-3 pr-8 shadow-sm backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-gold-400"
                value={selectedMatra}
                onChange={(e) => setSelectedMatra(e.target.value)}
              >
                {MATRA_OPTIONS.map((m) => (
                  <option key={m.id} value={m.id} className="bg-navy-900 text-white font-bold py-1">{m.label}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-gold-300">
                <IconChevronDown className="h-3.5 w-3.5" />
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                placeholder="Cari UPT..."
                className="text-xs font-semibold rounded-xl bg-white/10 border border-white/20 text-white placeholder-navy-300 py-2 pl-8 pr-3 focus:outline-none focus:ring-2 focus:ring-gold-400 w-44 backdrop-blur-md"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <IconSearch className="h-3.5 w-3.5 text-navy-300 absolute left-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4 border border-amber-200 bg-amber-50/40 flex items-center gap-3.5">
          <div className="h-11 w-11 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-amber-500/20">
            <IconHistory className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">Menunggu Persetujuan</p>
            <p className="text-xl font-black text-navy-950 mt-0.5">{fmtNum(totalPending)} Pengajuan</p>
          </div>
        </div>

        <div className="card p-4 border border-blue-200 bg-blue-50/40 flex items-center gap-3.5">
          <div className="h-11 w-11 rounded-xl bg-navy-700 text-white flex items-center justify-center shrink-0 shadow-md shadow-navy-700/20">
            <IconBuilding className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-navy-700 uppercase tracking-wider">UPT yang Mengajukan</p>
            <p className="text-xl font-black text-navy-950 mt-0.5">{fmtNum(uniqueUptCount)} UPT</p>
          </div>
        </div>

        <div className="card p-4 border border-violet-200 bg-violet-50/40 flex items-center gap-3.5">
          <div className="h-11 w-11 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-violet-600/20">
            <IconPeople className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-violet-800 uppercase tracking-wider">Total Taruna Dilaporkan</p>
            <p className="text-xl font-black text-navy-950 mt-0.5">{fmtNum(totalTarunasPending)} Taruna</p>
          </div>
        </div>
      </div>

      {/* Daftar Pengajuan */}
      <div className="card p-5 border-surface-border shadow-card space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-black text-navy-900 uppercase tracking-wider flex items-center gap-2">
              <IconPeople className="h-4.5 w-4.5 text-navy-700" />
              Daftar Pengajuan Data Taruna Masuk ({filteredSubmissions.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Data taruna yang telah disetujui Pimpinan UPT dan siap diverifikasi oleh Admin BPSDMP.
            </p>
          </div>
        </div>

        {loading ? (
          <SkeletonRows rows={5} />
        ) : filteredSubmissions.length === 0 ? (
          <EmptyState
            icon={<IconPeople className="h-8 w-8" />}
            title="Tidak Ada Pengajuan Data Taruna"
            desc={search.trim() || selectedMatra !== 'all'
              ? 'Tidak ditemukan pengajuan yang sesuai dengan kriteria pencarian/filter.'
              : `Belum ada data taruna yang menunggu persetujuan Admin BPSDM untuk Tahun ${year}.`}
          />
        ) : (
          <div className="grid grid-cols-1 gap-3.5">
            {filteredSubmissions.map((sub) => {
              const matraKey = (sub.matra || '').toLowerCase()
              const matraBadgeCls =
                matraKey === 'laut' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                matraKey === 'darat' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                matraKey === 'udara' ? 'bg-sky-50 text-sky-700 border-sky-200' :
                'bg-slate-100 text-slate-700 border-slate-200'

              return (
                <div
                  key={sub.id}
                  className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-white hover:border-violet-300 hover:shadow-md transition-all space-y-3"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    {/* Info UPT & Triwulan */}
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-base font-black text-navy-950 tracking-tight">
                          {sub.uptName}
                        </span>
                        <span className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${matraBadgeCls}`}>
                          {sub.uptCode} · Matra {sub.matra || '-'}
                        </span>
                        <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
                          {sub.quarterName}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-500 font-medium flex-wrap">
                        <span className="flex items-center gap-1 font-bold text-navy-900">
                          <IconPeople className="h-3.5 w-3.5 text-navy-600" />
                          {fmtNum(sub.tarunaCount)} Taruna Terdaftar
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                          <IconCheck className="h-3.5 w-3.5" />
                          Diverifikasi Pimpinan UPT
                        </span>
                        {sub.submittedAt && (
                          <>
                            <span>•</span>
                            <span className="text-slate-400">
                              Diajukan: {new Date(sub.submittedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 shrink-0 pt-2 lg:pt-0">
                      <button
                        type="button"
                        className="btn-secondary !text-xs !py-2 !px-3.5 rounded-xl font-bold flex items-center gap-1.5 hover:bg-slate-100"
                        onClick={() => openDetail(sub)}
                      >
                        <IconEye className="h-3.5 w-3.5 text-navy-700" />
                        <span>Review Detail</span>
                      </button>

                      <button
                        type="button"
                        className="btn-secondary !text-xs !py-2 !px-3 rounded-xl font-bold !text-rose-600 border-rose-200 hover:bg-rose-50"
                        onClick={() => {
                          setReviewTarget({ submission: sub, action: 'reject' })
                          setReviewNotes('')
                        }}
                      >
                        Tolak
                      </button>

                      <button
                        type="button"
                        className="btn-primary !bg-emerald-600 hover:!bg-emerald-700 text-white !text-xs !py-2 !px-3.5 rounded-xl font-bold flex items-center gap-1 shadow-sm"
                        onClick={() => {
                          setReviewTarget({ submission: sub, action: 'approve' })
                          setReviewNotes('')
                        }}
                      >
                        <IconCheck className="h-3.5 w-3.5" />
                        <span>Setujui Final</span>
                      </button>
                    </div>
                  </div>

                  {/* Catatan Pimpinan jika ada */}
                  {sub.notes && (
                    <div className="text-xs p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 flex items-start gap-2">
                      <span className="font-extrabold text-navy-900 shrink-0">Catatan Pimpinan UPT:</span>
                      <span className="italic text-slate-600">"{sub.notes}"</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* MODAL REVIEW DETAIL TARUNA (Menggunakan Portal agar tidak terpotong) */}
      <Modal
        open={Boolean(detailTarget)}
        onClose={() => setDetailTarget(null)}
        wide={true}
        title="Review Master Data Taruna"
        subtitle={detailTarget ? `${detailTarget.uptName} (${detailTarget.uptCode}) — ${detailTarget.quarterName}` : ''}
      >
        {loadingDetail ? (
          <div className="py-6">
            <SkeletonRows rows={6} />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Header info pills */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <div className="flex items-center gap-2 flex-wrap font-semibold text-slate-700">
                <span>Total: <strong className="text-navy-950">{fmtNum(detailData?.tarunas?.length || 0)} Taruna</strong></span>
                <span>•</span>
                <span>Matra: <strong className="text-navy-950 uppercase">{detailTarget?.matra || '-'}</strong></span>
                <span>•</span>
                <span>Status: <span className="text-amber-700 font-extrabold">Menunggu Persetujuan Final</span></span>
              </div>

              {/* Search taruna inside modal */}
              <div className="relative w-full sm:w-56">
                <input
                  type="text"
                  placeholder="Cari nama / NIT / prodi..."
                  className="w-full text-xs font-semibold rounded-lg border border-slate-300 py-1.5 pl-7 pr-2.5 focus:ring-2 focus:ring-emerald-400 focus:outline-none"
                  value={tarunaSearchInModal}
                  onChange={(e) => setTarunaSearchInModal(e.target.value)}
                />
                <IconSearch className="h-3 w-3 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
              </div>
            </div>

            {/* Taruna Table */}
            <div className="max-h-[380px] overflow-y-auto w-full rounded-xl border border-slate-200">
              <table className="w-full border-collapse text-left text-xs text-slate-800">
                <thead>
                  <tr className="bg-navy-950 text-white font-extrabold uppercase text-[10px] sticky top-0 z-10">
                    <th className="px-3.5 py-2.5 text-center w-10">#</th>
                    <th className="px-3.5 py-2.5">NAMA TARUNA</th>
                    <th className="px-3.5 py-2.5">NOMOR TARUNA / NIT</th>
                    <th className="px-3.5 py-2.5">PROGRAM STUDI</th>
                    <th className="px-3.5 py-2.5 text-center">TAHUN LULUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {modalTarunas.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        {tarunaSearchInModal.trim() ? 'Tidak ada taruna yang cocok dengan pencarian.' : 'Belum ada data taruna terdaftar.'}
                      </td>
                    </tr>
                  ) : (
                    modalTarunas.map((t, i) => (
                      <tr key={t.id} className={i % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/60 hover:bg-slate-100/70'}>
                        <td className="px-3.5 py-2.5 text-center font-bold text-slate-400">{i + 1}</td>
                        <td className="px-3.5 py-2.5 font-black text-navy-950">{t.nama}</td>
                        <td className="px-3.5 py-2.5 font-mono text-[11px] font-bold text-navy-800">{t.nomorTaruna}</td>
                        <td className="px-3.5 py-2.5 text-slate-700">
                          {t.prodi?.namaProdi ? (
                            <span className="font-semibold text-slate-900">{t.prodi.namaProdi} ({t.prodi.jenjang || 'D4'})</span>
                          ) : (
                            <span className="text-slate-400 italic">Tanpa Prodi</span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 text-center font-bold text-slate-700 tabular-nums">
                          {t.tahunLulus || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal Actions Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-surface-border">
              <p className="text-[11px] text-slate-500 font-medium">
                Persetujuan ini akan mengunci Data Taruna dan membuka formulir penyerapan UPT.
              </p>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  className="btn-secondary !text-xs !py-2 !px-3.5"
                  onClick={() => setDetailTarget(null)}
                >
                  Tutup
                </button>

                <button
                  type="button"
                  className="btn-secondary !text-xs !py-2 !px-4 !text-rose-600 border-rose-200 hover:bg-rose-50 font-bold"
                  onClick={() => {
                    setReviewTarget({ submission: detailTarget, action: 'reject' })
                    setReviewNotes('')
                  }}
                >
                  Tolak Pengajuan
                </button>

                <button
                  type="button"
                  className="btn-primary !bg-emerald-600 hover:!bg-emerald-700 text-white !text-xs !py-2 !px-4 font-bold flex items-center gap-1.5 shadow-sm"
                  onClick={() => {
                    setReviewTarget({ submission: detailTarget, action: 'approve' })
                    setReviewNotes('')
                  }}
                >
                  <IconCheck className="h-4 w-4" />
                  <span>Setujui Final (Kunci Data)</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* CONFIRM REVIEW DIALOG */}
      <ConfirmDialog
        open={Boolean(reviewTarget)}
        onCancel={() => setReviewTarget(null)}
        onConfirm={handleReview}
        loading={processing}
        title={reviewTarget?.action === 'approve' ? 'Setujui Final Master Data Taruna?' : 'Tolak & Kembalikan Data Taruna?'}
        body={reviewTarget?.action === 'approve'
          ? `Anda akan menyetujui Master Data Taruna ${reviewTarget?.submission?.uptName} untuk ${reviewTarget?.submission?.quarterName}. Data akan dikunci secara permanen dan Admin UPT dapat mulai menginput laporan penyerapan.`
          : `Data Taruna ${reviewTarget?.submission?.uptName} akan dikembalikan ke status draf untuk diperbaiki oleh Admin UPT.`}
        confirmLabel={reviewTarget?.action === 'approve' ? 'Ya, Setujui & Kunci' : 'Tolak Pengajuan'}
        confirmTone={reviewTarget?.action === 'approve' ? 'primary' : 'danger'}
        icon={reviewTarget?.action === 'approve' ? <IconCheck className="h-5 w-5 text-emerald-600" /> : <IconX className="h-5 w-5 text-rose-600" />}
      >
        {reviewTarget?.action === 'reject' && (
          <div className="mt-3 w-full">
            <label className="form-label text-xs font-bold text-navy-900 mb-1 block">
              Catatan Penolakan / Alasan Revisi <span className="text-rose-500">*</span>
            </label>
            <textarea
              className="w-full text-xs font-semibold rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-rose-400 focus:outline-none min-h-[80px]"
              placeholder="Tuliskan catatan perbaikan untuk Admin UPT (misal: Nomor taruna salah, terdapat nama duplikat, dll)..."
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              required
            />
          </div>
        )}
      </ConfirmDialog>
    </div>
  )
}
