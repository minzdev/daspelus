import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import api, { apiError } from '../../lib/api'
import { Alert, EmptyState, SkeletonRows, Modal, ConfirmDialog } from '../../components/ui'
import {
  IconGraduation, IconPlus, IconCheck, IconTrash, IconEdit, IconSearch,
  IconChevronDown, IconUnlock, IconPeople, IconBuilding, IconClock,
} from '../../components/icons'
import logoBpsdm from '../../assets/logo-bpsdm.png'
import { yearOptions, fmtNum } from '../../utils/format'
import { useToast } from '../../components/Toast'

const QUARTERS = [
  { value: 'all', label: 'Semua Triwulan (Tahunan)' },
  { value: 1, label: 'Triwulan I (Jan - Mar)' },
  { value: 2, label: 'Triwulan II (Apr - Jun)' },
  { value: 3, label: 'Triwulan III (Jul - Sep)' },
  { value: 4, label: 'Triwulan IV (Okt - Des)' },
]

const STATUS_LABELS = {
  draft: { label: 'Draft UPT', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  submitted_pimpinan: { label: 'Menunggu Verifikasi Pimpinan', cls: 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse' },
  approved_pimpinan: { label: 'Disetujui Pimpinan (Menunggu BPSDM)', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  rejected_pimpinan: { label: 'Ditolak Pimpinan (Revisi)', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  submitted_admin: { label: 'Menunggu Persetujuan Admin BPSDM', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  approved_admin: { label: 'Disetujui Admin BPSDM (Terkunci)', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected_admin: { label: 'Ditolak Admin BPSDM', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
}

export default function UptTarunaPage() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [year, setYear] = useState(new Date().getFullYear())
  const [quarter, setQuarter] = useState('all') // Default Semua Triwulan
  const [filterProdi, setFilterProdi] = useState('all')
  const [filterStatusSerap, setFilterStatusSerap] = useState('all') // 'all' | 'employed' | 'unemployed'
  const [search, setSearch] = useState('')

  const [tarunas, setTarunas] = useState([])
  const [submission, setSubmission] = useState(null)
  const [summary, setSummary] = useState({ total: 0, employed: 0, unemployed: 0 })
  const [prodis, setProdis] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Modal Form Taruna
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTaruna, setEditingTaruna] = useState(null)
  const [formData, setFormData] = useState({ nama: '', nomorTaruna: '', prodiId: '', tahunLulus: '' })
  const [submitting, setSubmitting] = useState(false)

  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false)
  const [sending, setSending] = useState(false)

  // Modal Unlock
  const [unlockModalOpen, setUnlockModalOpen] = useState(false)
  const [unlockReason, setUnlockReason] = useState('')
  const [sendingUnlock, setSendingUnlock] = useState(false)
  const [activeUnlockRequest, setActiveUnlockRequest] = useState(null)

  // Modal Confirm Delete Taruna
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, tarunaId: null, tarunaName: '' })
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data: res } = await api.get('/absorptions/tarunas', {
        params: { year, quarter, search: search.trim() || undefined },
      })
      setTarunas(res.tarunas || [])
      setSubmission(res.submission)
      setActiveUnlockRequest(res.activeUnlockRequest || null)
      if (res.summary) setSummary(res.summary)

      const { data: prodiRes } = await api.get('/absorptions/prodis')
      setProdis(prodiRes.prodis || [])
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [year, quarter, search])

  useEffect(() => {
    load()
  }, [load])

  const status = submission?.status || null
  const isLocked = ['submitted_pimpinan', 'submitted_admin', 'approved_admin'].includes(status)
  const statusInfo = status ? (STATUS_LABELS[status] || { label: status, cls: 'bg-slate-100 text-slate-600' }) : { label: 'Belum Ada Pengajuan', cls: 'bg-slate-100 text-slate-500 border-slate-200' }

  // Filtered tarunas
  const filteredTarunas = useMemo(() => {
    let list = [...tarunas]
    if (filterProdi !== 'all') {
      list = list.filter((t) => t.prodiId === filterProdi)
    }
    if (filterStatusSerap === 'employed') {
      list = list.filter((t) => t.employmentStatus?.isEmployed)
    } else if (filterStatusSerap === 'unemployed') {
      list = list.filter((t) => !t.employmentStatus?.isEmployed)
    }
    return list
  }, [tarunas, filterProdi, filterStatusSerap])

  const openAddModal = () => {
    setEditingTaruna(null)
    setFormData({ nama: '', nomorTaruna: '', prodiId: prodis[0]?.id || '', tahunLulus: year })
    setModalOpen(true)
  }

  const openEditModal = (t) => {
    setEditingTaruna(t)
    setFormData({ nama: t.nama, nomorTaruna: t.nomorTaruna, prodiId: t.prodiId || '', tahunLulus: t.tahunLulus || year })
    setModalOpen(true)
  }

  const handleSaveTaruna = async (e) => {
    e.preventDefault()
    if (!formData.nama.trim() || !formData.nomorTaruna.trim()) {
      toast.error('Nama dan Nomor Taruna wajib diisi.')
      return
    }
    setSubmitting(true)
    try {
      const activeQuarter = quarter === 'all' ? 1 : quarter
      if (editingTaruna) {
        await api.put(`/absorptions/tarunas/${editingTaruna.id}`, { ...formData, year, quarter: activeQuarter })
        toast.success('Data taruna berhasil diperbarui.')
      } else {
        await api.post('/absorptions/tarunas', { ...formData, year, quarter: activeQuarter })
        toast.success('Data taruna berhasil ditambahkan.')
      }
      setModalOpen(false)
      load()
    } catch (err) {
      toast.error(apiError(err))
    } finally {
      setSubmitting(false)
    }
  }

  const handleConfirmDeleteTaruna = async () => {
    if (!deleteConfirm.tarunaId) return
    setDeleting(true)
    try {
      const { data: res } = await api.delete(`/absorptions/tarunas/${deleteConfirm.tarunaId}`)
      toast.success(res.message || 'Data taruna berhasil dihapus.')
      setDeleteConfirm({ open: false, tarunaId: null, tarunaName: '' })
      load()
    } catch (err) {
      toast.error(apiError(err))
    } finally {
      setDeleting(false)
    }
  }

  const handleSubmitToPimpinan = async () => {
    setSending(true)
    try {
      const targetQuarter = quarter === 'all' ? 1 : quarter
      await api.post('/absorptions/taruna-submissions/submit', { year, quarter: targetQuarter })
      toast.success('Data Taruna berhasil dikirim ke Pimpinan UPT untuk diverifikasi.')
      setConfirmSubmitOpen(false)
      load()
    } catch (err) {
      toast.error(apiError(err))
    } finally {
      setSending(false)
    }
  }

  const handleUnlockRequest = async () => {
    if (!unlockReason.trim()) {
      toast.error('Alasan pengajuan unlock wajib diisi.')
      return
    }
    setSendingUnlock(true)
    try {
      const targetQuarter = quarter === 'all' ? 1 : quarter
      await api.post('/absorptions/taruna-submissions/unlock-request', { year, quarter: targetQuarter, reason: unlockReason })
      toast.success('Pengajuan unlock berhasil dikirim ke Pimpinan UPT.')
      setUnlockModalOpen(false)
      setUnlockReason('')
      load()
    } catch (err) {
      toast.error(apiError(err))
    } finally {
      setSendingUnlock(false)
    }
  }

  return (
    <div className="animate-fadeUp space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-navy-950 via-navy-900 to-navy-950 px-5 py-4 text-white shadow-md border border-navy-800">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-48 w-48 rounded-full bg-sky-500/10 blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 p-1.5 shadow-inner border border-white/15" style={{ width: '40px', height: '40px' }}>
              <img src={logoBpsdm} alt="Logo BPSDMP" className="h-full w-full object-contain max-h-7 max-w-7" onError={(e) => (e.target.style.display = 'none')} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-black text-white tracking-tight">Master Data Taruna</h1>
                <span className="rounded-full text-[10px] font-extrabold px-2.5 py-0.5 border bg-sky-500/20 text-sky-300 border-sky-500/30">
                  {quarter === 'all' ? `Semua Triwulan · ${year}` : `Filter TW ${quarter} · ${year}`}
                </span>
              </div>
              <p className="text-xs text-navy-200 mt-0.5 max-w-xl">
                Master data taruna ({user?.upt?.name || 'UPT'}) di awal tahun — wajib diisi & disetujui untuk 1 tahun pelaporan penyerapan.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Filter Tahun */}
            <div className="relative">
              <select
                className="appearance-none cursor-pointer bg-white/10 hover:bg-white/15 border border-white/20 text-white font-extrabold text-xs rounded-xl py-2 pl-3 pr-8 shadow-sm backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-sky-400"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {yearOptions().map((y) => (
                  <option key={y} value={y} className="bg-navy-900 text-white font-bold py-1">Tahun {y}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-sky-300">
                <IconChevronDown className="h-3.5 w-3.5" />
              </div>
            </div>

            {/* Filter Triwulan (termasuk Semua Triwulan) */}
            <div className="relative">
              <select
                className="appearance-none cursor-pointer bg-white/10 hover:bg-white/15 border border-white/20 text-white font-extrabold text-xs rounded-xl py-2 pl-3 pr-8 shadow-sm backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-sky-400"
                value={quarter}
                onChange={(e) => setQuarter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              >
                {QUARTERS.map((q) => (
                  <option key={q.value} value={q.value} className="bg-navy-900 text-white font-bold py-1">{q.label}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-sky-300">
                <IconChevronDown className="h-3.5 w-3.5" />
              </div>
            </div>

            <button
              type="button"
              className="btn-gold text-xs !py-2 !px-3.5 rounded-xl shadow font-bold flex items-center gap-1.5"
              onClick={() => navigate('/upt/penyerapan/input')}
            >
              <IconGraduation className="h-4 w-4" />
              <span>Ke Input Penyerapan</span>
            </button>
          </div>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* Status Workflow Data Taruna */}
      <div className="card p-4 border-surface-border shadow-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-wider text-navy-400">
              Status Master Data Taruna {year}:
            </span>
            <span className={`text-[11px] font-black px-3 py-1 rounded-full border ${statusInfo.cls}`}>
              {statusInfo.label}
            </span>
            {submission?.notes && (
              <span className="text-[11px] text-slate-500 italic">"{submission.notes}"</span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {(!status || ['draft', 'rejected_pimpinan', 'rejected_admin'].includes(status)) && (
              <button
                type="button"
                className="btn-primary !bg-sky-600 hover:!bg-sky-700 text-white !text-xs !py-2 !px-3.5 rounded-xl shadow font-bold flex items-center gap-1.5"
                onClick={() => setConfirmSubmitOpen(true)}
              >
                <IconCheck className="h-3.5 w-3.5" />
                <span>{status ? 'Kirim Ulang ke Pimpinan' : 'Kirim ke Pimpinan UPT'}</span>
              </button>
            )}

            {status === 'approved_admin' && (
              activeUnlockRequest ? (
                <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-300 px-3.5 py-1.5 text-amber-800 text-xs font-black shadow-sm">
                  <IconClock className="h-4 w-4 text-amber-600 animate-spin" />
                  <span>
                    Permohonan Unlock Sedang Diproses ({
                      activeUnlockRequest.status === 'pending_pimpinan'
                        ? 'Menunggu Pimpinan UPT'
                        : activeUnlockRequest.status === 'pending_pusbang'
                        ? 'Menunggu Pusbang Matra'
                        : 'Menunggu Admin BPSDMP'
                    })
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn-secondary !text-xs !py-2 !px-4 rounded-xl border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 font-extrabold flex items-center gap-1.5 shadow-sm transition-all hover:scale-[1.02]"
                  onClick={() => setUnlockModalOpen(true)}
                >
                  <IconUnlock className="h-4 w-4 text-amber-600" />
                  <span>Ajukan Unlock Perubahan</span>
                </button>
              )
            )}
          </div>
        </div>

        {/* Callout Keterangan Pengajuan Unlock jika Data Terkunci */}
        {status === 'approved_admin' && (
          activeUnlockRequest ? (
            <div className="mt-3 p-4 rounded-xl bg-amber-100/70 border border-amber-300 text-amber-950 flex items-start gap-3.5 text-xs animate-fadeIn shadow-sm">
              <div className="h-8 w-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                <IconClock className="h-4 w-4" />
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-amber-950 text-[13px]">
                    Permohonan Buka Kunci (Unlock) Sedang Diproses
                  </span>
                  <span className="rounded-full bg-amber-500 text-white text-[10px] font-black uppercase px-2 py-0.5 shadow-sm">
                    {activeUnlockRequest.status === 'pending_pimpinan'
                      ? 'Tahap 1: Pimpinan UPT'
                      : activeUnlockRequest.status === 'pending_pusbang'
                      ? 'Tahap 2: Pusbang Matra'
                      : 'Tahap 3: Admin BPSDMP'}
                  </span>
                </div>
                <p className="text-xs text-amber-900 leading-relaxed">
                  Permohonan buka kunci diajukan pada {new Date(activeUnlockRequest.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} WIB dengan alasan: <strong className="text-amber-950">"{activeUnlockRequest.reason}"</strong>.
                </p>
                <p className="text-[11px] text-amber-800 font-medium">
                  Mohon menunggu persetujuan berjenjang dari Pimpinan UPT, Pusbang Matra, dan Admin BPSDMP. Setelah disetujui final, status data taruna akan kembali terbuka menjadi draft sehingga Anda dapat menambah atau mengubah taruna.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-3 p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/80 text-amber-900 flex items-center gap-3 text-xs animate-fadeIn">
              <div className="h-7 w-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <IconUnlock className="h-4 w-4" />
              </div>
              <div className="flex-1 space-y-0.5">
                <p className="font-extrabold text-amber-950">
                  Master Data Taruna Tahun {year} Telah Disetujui & Berlaku 1 Tahun Penuh (TW 1 – TW 4)
                </p>
                <p className="text-[11.5px] text-amber-800 leading-relaxed">
                  Data taruna terkunci untuk menjaga konsistensi pelaporan penyerapan lulusan. Apabila terdapat penambahan atau perubahan data taruna di triwulan berjalan, silakan gunakan tombol <strong>"Ajukan Unlock Perubahan"</strong> di atas.
                </p>
              </div>
            </div>
          )
        )}

        {/* Alur Workflow Visual */}
        <div className="mt-4 pt-3 border-t border-surface-border flex items-center gap-1.5 text-[10px] font-bold flex-wrap">
          {['1. Input Master di Awal Tahun', '2. Verifikasi Pimpinan UPT', '3. Persetujuan Admin BPSDM', '4. Pelaporan Penyerapan (TW 1 - TW 4)'].map((step, i) => {
            const stepDone =
              (i === 0 && tarunas.length > 0) ||
              (i === 1 && ['submitted_admin', 'approved_admin'].includes(status)) ||
              (i === 2 && status === 'approved_admin') ||
              (i === 3 && status === 'approved_admin')
            const stepActive =
              (i === 0 && tarunas.length === 0) ||
              (i === 1 && status === 'submitted_pimpinan') ||
              (i === 2 && status === 'submitted_admin') ||
              (i === 3 && status === 'approved_admin')
            return (
              <React.Fragment key={i}>
                {i > 0 && <span className="text-slate-300">→</span>}
                <span className={`px-2.5 py-1 rounded-full border ${
                  stepDone ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold'
                  : stepActive ? 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse font-bold'
                  : 'bg-slate-50 text-slate-400 border-slate-200'
                }`}>
                  {step}
                </span>
              </React.Fragment>
            )
          })}
        </div>
      </div>

      {/* KPI Ringkasan Taruna & Status Serap */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4 border-surface-border">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-navy-400">Total Taruna</span>
          <p className="text-2xl font-black text-navy-950 tabular-nums mt-0.5">{fmtNum(summary.total || tarunas.length)}</p>
          <span className="text-[10px] text-slate-400">Master Data {year}</span>
        </div>

        <div className="card p-4 border-emerald-200 bg-emerald-50/30">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800">Sudah Bekerja</span>
          <p className="text-2xl font-black text-emerald-700 tabular-nums mt-0.5">{fmtNum(summary.employed)}</p>
          <span className="text-[10px] text-emerald-600 font-semibold">Terserap di Laporan TW</span>
        </div>

        <div className="card p-4 border-blue-200 bg-blue-50/30">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-navy-700">Belum Bekerja</span>
          <p className="text-2xl font-black text-navy-800 tabular-nums mt-0.5">{fmtNum(summary.unemployed)}</p>
          <span className="text-[10px] text-navy-500 font-semibold">Tersedia untuk Laporan</span>
        </div>

        <div className="card p-4 border-surface-border bg-gradient-to-br from-sky-600 to-navy-900 text-white">
          <span className="text-[10px] font-black uppercase tracking-wider text-sky-200">Status Persetujuan</span>
          <p className="text-xs font-black mt-1.5 leading-tight">{statusInfo.label}</p>
          <span className="text-[10px] text-sky-200 mt-1 block">Berlaku untuk 1 Tahun</span>
        </div>
      </div>

      {/* Tabel Data Taruna */}
      <div className="card p-5 border-surface-border shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-surface-border">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Filter Prodi */}
            <div className="relative">
              <select
                className="text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 py-2 pl-3 pr-8 focus:outline-none focus:ring-2 focus:ring-sky-400"
                value={filterProdi}
                onChange={(e) => setFilterProdi(e.target.value)}
              >
                <option value="all">Semua Program Studi</option>
                {prodis.map((p) => (
                  <option key={p.id} value={p.id}>{p.namaProdi}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                <IconChevronDown className="h-3 w-3" />
              </div>
            </div>

            {/* Filter Status Serap */}
            <div className="relative">
              <select
                className="text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 py-2 pl-3 pr-8 focus:outline-none focus:ring-2 focus:ring-sky-400"
                value={filterStatusSerap}
                onChange={(e) => setFilterStatusSerap(e.target.value)}
              >
                <option value="all">Semua Status Serap</option>
                <option value="employed">Sudah Bekerja</option>
                <option value="unemployed">Belum Bekerja / Belum Dilaporkan</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                <IconChevronDown className="h-3 w-3" />
              </div>
            </div>

            {/* Input Pencarian */}
            <div className="relative">
              <input
                type="text"
                placeholder="Cari nama / nomor taruna..."
                className="text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 focus:outline-none focus:ring-2 focus:ring-sky-400 w-52"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <IconSearch className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>

          {!isLocked ? (
            <button
              type="button"
              className="btn-primary !bg-sky-600 hover:!bg-sky-700 text-white !text-xs !py-2 !px-3.5 rounded-xl shadow font-bold flex items-center gap-1.5"
              onClick={openAddModal}
            >
              <IconPlus className="h-3.5 w-3.5" />
              <span>Tambah Taruna</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <span
                className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl shadow-xs"
                title={`Master Data Taruna Tahun ${year} telah disetujui & terkunci untuk pelaporan penyerapan.`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                <span>Data Taruna Terkunci ({year})</span>
              </span>
            </div>
          )}
        </div>

        {loading ? (
          <SkeletonRows rows={6} />
        ) : filteredTarunas.length === 0 ? (
          <EmptyState
            icon={<IconPeople className="h-7 w-7" />}
            title="Belum ada data taruna"
            desc={search.trim() || filterProdi !== 'all' || filterStatusSerap !== 'all'
              ? 'Tidak ada taruna yang sesuai dengan filter pencarian.'
              : 'Daftarkan data taruna (Nama & Nomor Taruna) untuk tahun ini.'}
          />
        ) : (
          <div className="w-full overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-left text-xs text-slate-800">
              <thead>
                <tr className="bg-navy-950 text-white font-extrabold uppercase text-[10px]">
                  <th className="px-3.5 py-2.5 text-center w-8">#</th>
                  <th className="px-3.5 py-2.5">NAMA TARUNA</th>
                  <th className="px-3.5 py-2.5">NOMOR TARUNA</th>
                  <th className="px-3.5 py-2.5">PROGRAM STUDI</th>
                  <th className="px-3.5 py-2.5">STATUS PENYERAPAN (TW)</th>
                  <th className="px-3.5 py-2.5 text-center">TAHUN LULUS</th>
                  {!isLocked && <th className="px-3.5 py-2.5 text-center w-24">AKSI</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredTarunas.map((t, i) => {
                  const emp = t.employmentStatus
                  return (
                    <tr key={t.id} className={i % 2 === 0 ? 'bg-white hover:bg-slate-50/70' : 'bg-slate-50/50 hover:bg-slate-50/70'}>
                      <td className="px-3.5 py-2.5 text-center font-bold text-slate-400">{i + 1}</td>
                      <td className="px-3.5 py-2.5 font-extrabold text-navy-900">{t.nama}</td>
                      <td className="px-3.5 py-2.5 font-bold text-navy-950">
                        <span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded font-mono text-[11px]">{t.nomorTaruna}</span>
                      </td>
                      <td className="px-3.5 py-2.5 text-slate-700">
                        {t.prodi ? (
                          <span>{t.prodi.namaProdi} <span className="text-[10px] text-slate-400">({t.prodi.jenjang})</span></span>
                        ) : (
                          <span className="text-slate-400 italic">Tanpa Prodi</span>
                        )}
                      </td>

                      {/* Kolom Status Penyerapan */}
                      <td className="px-3.5 py-2.5">
                        {emp?.isEmployed ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300">
                              <IconCheck className="h-3 w-3 text-emerald-600" />
                              Sudah Bekerja ({emp.quarterName || `TW ${emp.quarter}`})
                            </span>
                            <p className="text-[10px] font-semibold text-slate-700">
                              {emp.instansiBekerja || 'Terserap'} <span className="uppercase text-[9px] text-slate-500">({emp.kategoriSerap})</span>
                            </p>
                            <p className="text-[9px] text-amber-700 font-bold">
                              ✕ Tidak dapat dipilih lagi di laporan TW berikutnya
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                              Belum Bekerja / Belum Dilaporkan
                            </span>
                            <p className="text-[9px] text-slate-400">
                              ✓ Tersedia untuk laporan penyerapan
                            </p>
                          </div>
                        )}
                      </td>

                      <td className="px-3.5 py-2.5 text-center tabular-nums text-slate-600 font-bold">{t.tahunLulus || '-'}</td>

                      {!isLocked && (
                        <td className="px-3.5 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              className="p-1 rounded text-slate-500 hover:text-navy-900 hover:bg-slate-200/60"
                              onClick={() => openEditModal(t)}
                              title="Edit"
                            >
                              <IconEdit className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                              onClick={() => setDeleteConfirm({ open: true, tarunaId: t.id, tarunaName: t.nama })}
                              title="Hapus Data Taruna"
                            >
                              <IconTrash className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL FORM TARUNA (Menggunakan Portal agar tidak terpotong) */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingTaruna ? 'Edit Data Taruna' : 'Tambah Data Taruna'}
        subtitle={`Master Data Taruna Tahun ${year} (${user?.upt?.name || 'UPT'})`}
      >
        <form onSubmit={handleSaveTaruna} className="space-y-3.5">
          <div>
            <label className="form-label">Nama Lengkap Taruna <span className="text-rose-500">*</span></label>
            <input
              type="text"
              className="w-full text-xs font-semibold rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-sky-400 focus:outline-none"
              placeholder="Contoh: Muhammad Rian Ardiansyah"
              value={formData.nama}
              onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="form-label">Nomor Taruna (NIT/NIM) <span className="text-rose-500">*</span></label>
            <input
              type="text"
              className="w-full text-xs font-semibold rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-sky-400 focus:outline-none font-mono"
              placeholder="Contoh: 21.01.042"
              value={formData.nomorTaruna}
              onChange={(e) => setFormData({ ...formData, nomorTaruna: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="form-label">Program Studi</label>
            <select
              className="w-full text-xs font-bold rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-sky-400 focus:outline-none"
              value={formData.prodiId}
              onChange={(e) => setFormData({ ...formData, prodiId: e.target.value })}
            >
              <option value="">-- Pilih Program Studi --</option>
              {prodis.map((p) => (
                <option key={p.id} value={p.id}>{p.namaProdi} ({p.jenjang || 'D4'})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Tahun Lulus (Opsional)</label>
            <input
              type="number"
              className="w-full text-xs font-semibold rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-sky-400 focus:outline-none"
              placeholder="Contoh: 2025"
              value={formData.tahunLulus}
              onChange={(e) => setFormData({ ...formData, tahunLulus: e.target.value })}
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-surface-border">
            <button type="button" className="btn-secondary !text-xs !py-2 !px-4" onClick={() => setModalOpen(false)}>
              Batal
            </button>
            <button type="submit" className="btn-primary !bg-sky-600 hover:!bg-sky-700 !text-xs !py-2 !px-4" disabled={submitting}>
              {submitting ? 'Menyimpan...' : 'Simpan Taruna'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL UNLOCK (Menggunakan Portal agar tidak terpotong) */}
      <Modal
        open={unlockModalOpen}
        onClose={() => setUnlockModalOpen(false)}
        title="Ajukan Unlock Data Taruna"
        subtitle={`Pengajuan perubahan data taruna Tahun ${year}`}
      >
        <div className="space-y-3.5">
          <p className="text-xs text-slate-600 leading-relaxed">
            Data Taruna telah <strong>disetujui & terkunci</strong>. Untuk menambahkan atau mengubah data taruna di triwulan berjalan,
            silakan ajukan unlock yang akan diverifikasi Pimpinan UPT dan Admin BPSDM.
          </p>

          <div>
            <label className="form-label">Alasan Pengajuan Unlock <span className="text-rose-500">*</span></label>
            <textarea
              className="w-full text-xs font-semibold rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-amber-400 focus:outline-none min-h-[90px]"
              placeholder="Tuliskan alasan unlock, misal: Penambahan taruna kelulusan susulan / perbaikan penulisan nomor taruna..."
              value={unlockReason}
              onChange={(e) => setUnlockReason(e.target.value)}
              required
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-surface-border">
            <button type="button" className="btn-secondary !text-xs !py-2 !px-4" onClick={() => setUnlockModalOpen(false)}>
              Batal
            </button>
            <button
              type="button"
              className="btn-primary !bg-amber-500 hover:!bg-amber-600 !text-xs !py-2 !px-4 font-bold"
              onClick={handleUnlockRequest}
              disabled={sendingUnlock}
            >
              {sendingUnlock ? 'Mengirim...' : 'Kirim Pengajuan Unlock'}
            </button>
          </div>
        </div>
      </Modal>

      {/* CONFIRM KIRIM KE PIMPINAN */}
      <ConfirmDialog
        open={confirmSubmitOpen}
        onCancel={() => setConfirmSubmitOpen(false)}
        onConfirm={handleSubmitToPimpinan}
        loading={sending}
        title={quarter === 'all' ? `Kirim Master Data Taruna Tahun ${year}?` : `Kirim Data Taruna TW ${quarter} ${year}?`}
        body={`Sebanyak ${tarunas.length} data taruna akan dikirim ke Pimpinan UPT untuk diverifikasi, lalu diteruskan ke Admin BPSDM untuk persetujuan 1 tahun pelaporan. Data akan terkunci selama proses review.`}
        confirmLabel="Ya, Kirim ke Pimpinan"
        confirmTone="primary"
      />

      {/* CONFIRM HAPUS DATA TARUNA */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, tarunaId: null, tarunaName: '' })}
        onConfirm={handleConfirmDeleteTaruna}
        loading={deleting}
        title="Hapus Master Data Taruna?"
        desc={`Apakah Anda yakin ingin menghapus taruna "${deleteConfirm.tarunaName}" dari Master Data Taruna tahun ${year}? Taruna ini tidak akan dapat dipilih lagi dalam pelaporan penyerapan.`}
        confirmText="Hapus Taruna"
        confirmTone="danger"
      />
    </div>
  )
}
