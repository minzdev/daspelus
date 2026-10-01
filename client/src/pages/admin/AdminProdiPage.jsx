import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext'
import api, { apiError } from '../../lib/api'
import { Alert, EmptyState, SkeletonRows, ConfirmDialog, Spinner } from '../../components/ui'
import {
  IconLayers, IconPlus, IconEdit, IconTrash, IconChevronDown,
  IconSearch, IconLock, IconCheck, IconX, IconGraduation,
} from '../../components/icons'
import logoBpsdm from '../../assets/logo-bpsdm.png'
import { useToast } from '../../components/Toast'

const JENJANG_OPTIONS = ['D4', 'D3', 'D2', 'D1', 'S1', 'S2', 'Diklat']

const JENJANG_COLORS = {
  D4: 'bg-sky-50 text-sky-700 border-sky-200',
  D3: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  D2: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  D1: 'bg-teal-50 text-teal-700 border-teal-200',
  S1: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  S2: 'bg-purple-50 text-purple-700 border-purple-200',
  Diklat: 'bg-amber-50 text-amber-700 border-amber-200',
}

export default function AdminProdiPage() {
  const { user } = useAuth()
  const toast = useToast()

  // Authorization: Only Super Admin (Admin BPSDMP) can add, edit, or delete Prodis
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const isPusbang = user?.role === 'PUSBANG'

  const [uptList, setUptList] = useState([])
  const [selectedUptId, setSelectedUptId] = useState('')
  const [filterMatra, setFilterMatra] = useState(isPusbang ? (user?.pusbangMatra || 'all') : 'all')
  const [filterJenjang, setFilterJenjang] = useState('all')
  const [searchProdi, setSearchProdi] = useState('')

  const [prodis, setProdis] = useState([])
  const [uptInfo, setUptInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Modal Add / Edit
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProdi, setEditingProdi] = useState(null)
  const [formData, setFormData] = useState({ namaProdi: '', jenjang: 'D4', isActive: true })
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Confirm Delete
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // 1. Load UPTs
  useEffect(() => {
    async function loadUpts() {
      try {
        const { data: res } = await api.get('/upts')
        let list = Array.isArray(res?.upts) ? res.upts : Array.isArray(res?.options) ? res.options : Array.isArray(res) ? res : []
        if (isPusbang) {
          const matra = (user?.pusbangMatra || '').toLowerCase()
          list = list.filter((u) => (u.matra || '').toLowerCase() === matra)
        }
        setUptList(list)
        if (list.length > 0 && !selectedUptId) {
          setSelectedUptId(list[0].id)
        }
      } catch (err) {
        setError(apiError(err))
      }
    }
    loadUpts()
  }, [isPusbang, user?.pusbangMatra, selectedUptId])

  // 2. Load Prodis for Selected UPT
  const loadProdis = useCallback(async () => {
    if (!selectedUptId) return
    setLoading(true)
    setError('')
    try {
      const { data: res } = await api.get('/absorptions/prodis', { params: { uptId: selectedUptId } })
      setProdis(res.prodis || [])
      setUptInfo(res.upt || null)
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [selectedUptId])

  useEffect(() => {
    loadProdis()
  }, [loadProdis])

  // Filtered UPTs for dropdown
  const safeUptList = Array.isArray(uptList) ? uptList : []
  const filteredUpts = safeUptList.filter((u) => {
    if (filterMatra !== 'all' && (u.matra || '').toLowerCase() !== filterMatra.toLowerCase()) return false
    return true
  })

  // Filtered Prodis by search & jenjang
  const filteredProdis = useMemo(() => {
    return prodis.filter((p) => {
      if (filterJenjang !== 'all' && (p.jenjang || 'D4') !== filterJenjang) return false
      if (searchProdi.trim()) {
        const q = searchProdi.trim().toLowerCase()
        const matchName = (p.namaProdi || '').toLowerCase().includes(q)
        const matchJenjang = (p.jenjang || '').toLowerCase().includes(q)
        if (!matchName && !matchJenjang) return false
      }
      return true
    })
  }, [prodis, filterJenjang, searchProdi])

  // Handlers
  const openAddModal = () => {
    if (!isSuperAdmin) {
      toast.error('Akses Ditolak', 'Hanya Admin BPSDMP yang berwenang menambah Program Studi.')
      return
    }
    setEditingProdi(null)
    setFormData({ namaProdi: '', jenjang: 'D4', isActive: true })
    setFormError('')
    setModalOpen(true)
  }

  const openEditModal = (p) => {
    if (!isSuperAdmin) {
      toast.error('Akses Ditolak', 'Hanya Admin BPSDMP yang berwenang mengubah Program Studi.')
      return
    }
    setEditingProdi(p)
    setFormData({ namaProdi: p.namaProdi, jenjang: p.jenjang || 'D4', isActive: p.isActive !== false })
    setFormError('')
    setModalOpen(true)
  }

  const handleSaveProdi = async (e) => {
    e.preventDefault()
    if (!isSuperAdmin) {
      toast.error('Akses Ditolak', 'Hanya Admin BPSDMP yang dapat mengelola data Program Studi.')
      return
    }
    if (!formData.namaProdi.trim()) {
      setFormError('Nama Program Studi wajib diisi.')
      return
    }

    setSubmitting(true)
    setFormError('')
    try {
      if (editingProdi) {
        await api.put(`/absorptions/prodis/${editingProdi.id}`, {
          namaProdi: formData.namaProdi.trim(),
          jenjang: formData.jenjang,
          isActive: formData.isActive,
        })
        toast.success('Program Studi Berhasil Diperbarui', `Data ${formData.namaProdi.trim()} telah diperbarui.`)
      } else {
        await api.post('/absorptions/prodis', {
          uptId: selectedUptId,
          namaProdi: formData.namaProdi.trim(),
          jenjang: formData.jenjang,
        })
        toast.success('Program Studi Berhasil Ditambahkan', `Program studi baru telah didaftarkan ke ${uptInfo?.name || 'UPT'}.`)
      }
      setModalOpen(false)
      loadProdis()
    } catch (err) {
      setFormError(apiError(err))
      toast.error('Gagal Menyimpan', apiError(err))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteProdi = async () => {
    if (!confirmDeleteId) return
    if (!isSuperAdmin) {
      toast.error('Akses Ditolak', 'Hanya Admin BPSDMP yang berwenang menghapus Program Studi.')
      return
    }
    setDeleting(true)
    try {
      const { data: res } = await api.delete(`/absorptions/prodis/${confirmDeleteId}`)
      toast.success('Berhasil', res.message || 'Program Studi berhasil diproses.')
      setConfirmDeleteId(null)
      loadProdis()
    } catch (err) {
      toast.error('Gagal Menghapus', apiError(err))
    } finally {
      setDeleting(false)
    }
  }

  const countD4 = prodis.filter((p) => p.jenjang === 'D4').length
  const countD3 = prodis.filter((p) => p.jenjang === 'D3').length
  const countLainnya = prodis.length - countD4 - countD3

  return (
    <div className="animate-fadeUp space-y-6">
      {/* 1. HEADER BANNER */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-navy-950 via-navy-900 to-slate-900 px-5 py-4 text-white shadow-md border border-navy-800">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 p-1.5 shadow-inner border border-white/20 backdrop-blur-md" style={{ width: '40px', height: '40px' }}>
              <img
                src={logoBpsdm}
                alt="Logo BPSDMP"
                className="h-full w-full object-contain max-h-7 max-w-7"
                onError={(e) => (e.target.style.display = 'none')}
              />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  <IconGraduation className="h-3 w-3" />
                  Master Akademik
                </span>
                {isSuperAdmin ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Admin BPSDMP — Akses Penuh
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    <IconLock className="h-3 w-3" />
                    Mode Pemantauan (Read-Only)
                  </span>
                )}
              </div>
              <h1 className="text-base sm:text-lg font-black text-white tracking-tight mt-0.5">
                Master Program Studi UPT
              </h1>
              <p className="text-xs text-navy-200 mt-0.5 max-w-2xl">
                Pengelolaan dan standardisasi daftar nama Program Studi untuk masing-masing UPT di lingkungan BPSDM Perhubungan.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 2. READ-ONLY NOTICE FOR LOWER ROLES */}
      {!isSuperAdmin && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs flex items-center gap-3 text-amber-900 shadow-sm">
          <div className="h-9 w-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 border border-amber-200">
            <IconLock className="h-4 w-4" />
          </div>
          <div>
            <p className="font-black text-amber-950">Kewenangan Pengelolaan Terpusat</p>
            <p className="text-amber-800 text-[11px] mt-0.5">
              Penambahan, pengubahan, dan penghapusan data Program Studi hanya dapat dilakukan oleh <strong>Super Admin BPSDMP</strong>. Role Pusbang dan UPT hanya memiliki hak akses untuk memantau data.
            </p>
          </div>
        </div>
      )}

      {error && <Alert type="error">{error}</Alert>}

      {/* 3. UPT SELECTION & CONTROLS CARD */}
      <div className="card p-6 border-slate-200 shadow-sm space-y-5">
        {/* Row 1: UPT & Matra Selection */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4 border-b border-slate-100">
          {!isPusbang && (
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wide text-slate-500 mb-1.5">
                Filter Matra
              </label>
              <div className="relative">
                <select
                  className="w-full text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-3 pr-8 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:bg-white transition-all"
                  value={filterMatra}
                  onChange={(e) => {
                    setFilterMatra(e.target.value)
                    const matched = uptList.filter(
                      (u) => e.target.value === 'all' || (u.matra || '').toLowerCase() === e.target.value.toLowerCase()
                    )
                    if (matched.length > 0) setSelectedUptId(matched[0].id)
                  }}
                >
                  <option value="all">Semua Matra</option>
                  <option value="darat">Matra Darat</option>
                  <option value="laut">Matra Laut</option>
                  <option value="udara">Matra Udara</option>
                  <option value="aparatur">Aparatur</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400">
                  <IconChevronDown className="h-3.5 w-3.5" />
                </div>
              </div>
            </div>
          )}

          <div className={isPusbang ? 'md:col-span-3' : 'md:col-span-2'}>
            <label className="block text-[11px] font-extrabold uppercase tracking-wide text-slate-500 mb-1.5">
              Pilih Unit Pelaksana Teknis (UPT)
            </label>
            <div className="relative">
              <select
                className="w-full text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-3 pr-8 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:bg-white transition-all"
                value={selectedUptId}
                onChange={(e) => setSelectedUptId(e.target.value)}
              >
                {filteredUpts.map((u) => (
                  <option key={u.id} value={u.id}>
                    [{String(u.matra || '').toUpperCase()}] {u.code} — {u.name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400">
                <IconChevronDown className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>
        </div>

        {/* Row 2: Search, Jenjang Filter, and Action Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-1 flex-wrap">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <input
                type="text"
                placeholder="Cari program studi..."
                className="w-full text-xs font-medium rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-8 pr-3 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:bg-white transition-all"
                value={searchProdi}
                onChange={(e) => setSearchProdi(e.target.value)}
              />
              <IconSearch className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-3 pointer-events-none" />
            </div>

            {/* Filter Jenjang */}
            <div className="relative">
              <select
                value={filterJenjang}
                onChange={(e) => setFilterJenjang(e.target.value)}
                className="text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-3 pr-8 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:bg-white transition-all"
              >
                <option value="all">Semua Jenjang</option>
                {JENJANG_OPTIONS.map((j) => (
                  <option key={j} value={j}>
                    Jenjang {j}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                <IconChevronDown className="h-3 w-3" />
              </div>
            </div>
          </div>

          {/* Action Button: ONLY for Super Admin */}
          {isSuperAdmin && (
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-sm transition-all shrink-0"
              onClick={openAddModal}
              disabled={!selectedUptId}
            >
              <IconPlus className="h-4 w-4" />
              <span>Tambah Program Studi</span>
            </button>
          )}
        </div>

        {/* 4. STAT / KPI CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
              Total Program Studi
            </span>
            <p className="text-2xl font-black text-slate-900 mt-1">{prodis.length}</p>
            <p className="text-[10.5px] text-slate-500 mt-0.5">Terdaftar di UPT</p>
          </div>

          <div className="p-4 rounded-2xl bg-sky-50/70 border border-sky-100 hover:border-sky-200 transition-colors">
            <span className="text-[10px] font-extrabold text-sky-600 uppercase tracking-wider">
              Jenjang Diploma IV (D4)
            </span>
            <p className="text-2xl font-black text-sky-900 mt-1">{countD4}</p>
            <p className="text-[10.5px] text-sky-700/80 mt-0.5">Program Sarjana Terapan</p>
          </div>

          <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 hover:border-indigo-200 transition-colors">
            <span className="text-[10px] font-extrabold text-indigo-600 uppercase tracking-wider">
              Jenjang Diploma III (D3)
            </span>
            <p className="text-2xl font-black text-indigo-900 mt-1">{countD3}</p>
            <p className="text-[10.5px] text-indigo-700/80 mt-0.5">Program Ahli Madya</p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                UPT Terpilih
              </span>
              {uptInfo?.matra && (
                <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-slate-200 text-slate-700">
                  {uptInfo.matra}
                </span>
              )}
            </div>
            <p className="text-xs font-black text-slate-900 truncate mt-1.5" title={uptInfo?.name}>
              {uptInfo?.code || '-'}
            </p>
            <p className="text-[10.5px] text-slate-500 truncate mt-0.5" title={uptInfo?.name}>
              {uptInfo?.name || 'Pilih UPT terlebih dahulu'}
            </p>
          </div>
        </div>

        {/* 5. TABLE OF PRODIS */}
        <div className="pt-2">
          {loading ? (
            <SkeletonRows rows={5} />
          ) : filteredProdis.length === 0 ? (
            <div className="py-8 text-center border rounded-2xl border-slate-100">
              <EmptyState
                icon={<IconLayers className="h-8 w-8 text-slate-300" />}
                title="Tidak ada program studi"
                desc={
                  searchProdi
                    ? 'Tidak ditemukan program studi yang sesuai dengan kata kunci pencarian.'
                    : 'Belum ada program studi yang didaftarkan untuk UPT ini.'
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <th className="py-3 px-4 text-center w-12">#</th>
                    <th className="py-3 px-4">Nama Program Studi</th>
                    <th className="py-3 px-4 text-center w-32">Jenjang</th>
                    <th className="py-3 px-4 text-center w-28">Status</th>
                    {isSuperAdmin ? (
                      <th className="py-3 px-4 text-center w-28">Aksi</th>
                    ) : (
                      <th className="py-3 px-4 text-center w-28">Keterangan</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProdis.map((p, idx) => {
                    const badgeColor = JENJANG_COLORS[p.jenjang] || 'bg-slate-50 text-slate-700 border-slate-200'
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4 text-center font-bold text-slate-400">{idx + 1}</td>
                        <td className="py-3 px-4">
                          <p className="font-extrabold text-slate-900">{p.namaProdi}</p>
                          <p className="text-[11px] text-slate-400">UPT: {uptInfo?.code || '-'}</p>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black border ${badgeColor}`}
                          >
                            {p.jenjang || 'D4'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {p.isActive !== false ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Aktif
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-500 border border-slate-200">
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                              Non-Aktif
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {isSuperAdmin ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                className="p-1.5 rounded-lg text-slate-500 hover:text-sky-700 hover:bg-sky-50 transition-colors"
                                onClick={() => openEditModal(p)}
                                title="Edit Program Studi"
                              >
                                <IconEdit className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                                onClick={() => setConfirmDeleteId(p.id)}
                                title="Hapus / Nonaktifkan Program Studi"
                              >
                                <IconTrash className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 font-semibold">
                              <IconLock className="h-3 w-3" />
                              Terkunci
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 6. MODAL FORM: TAMBAH / EDIT PRODI (Admin BPSDMP Only) */}
      {modalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
            onMouseDown={(e) => e.target === e.currentTarget && !submitting && setModalOpen(false)}
          >
            <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4 animate-scaleUp">
              {/* Modal Header */}
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {editingProdi ? 'Edit Program Studi' : 'Tambah Program Studi Baru'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {uptInfo?.code} — {uptInfo?.name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={submitting}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <IconX className="h-4 w-4" />
                </button>
              </div>

              {/* Form Content */}
              <form onSubmit={handleSaveProdi} className="space-y-4">
                {formError && <Alert type="error">{formError}</Alert>}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nama Program Studi <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: D-IV Lalu Lintas Udara"
                    value={formData.namaProdi}
                    onChange={(e) => setFormData((f) => ({ ...f, namaProdi: e.target.value }))}
                    className="w-full text-xs font-medium rounded-xl border border-slate-200 p-2.5 focus:outline-none focus:ring-2 focus:ring-sky-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Jenjang Program Studi <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={formData.jenjang}
                      onChange={(e) => setFormData((f) => ({ ...f, jenjang: e.target.value }))}
                      className="w-full text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 p-2.5 pr-8 focus:outline-none focus:ring-2 focus:ring-sky-400"
                    >
                      {JENJANG_OPTIONS.map((j) => (
                        <option key={j} value={j}>
                          {j}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400">
                      <IconChevronDown className="h-3.5 w-3.5" />
                    </div>
                  </div>
                </div>

                {editingProdi && (
                  <div className="pt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.isActive}
                        onChange={(e) => setFormData((f) => ({ ...f, isActive: e.target.checked }))}
                        className="rounded text-sky-600 focus:ring-sky-400 h-4 w-4"
                      />
                      <span className="text-xs font-bold text-slate-700">Status Aktif</span>
                    </label>
                    <p className="text-[11px] text-slate-400 ml-6 mt-0.5">
                      Program studi non-aktif tidak akan muncul pada pilihan input penyerapan lulusan baru.
                    </p>
                  </div>
                )}

                {/* Buttons */}
                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
                    onClick={() => setModalOpen(false)}
                    disabled={submitting}
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 shadow-md shadow-sky-600/20 transition-all flex items-center gap-1.5"
                    disabled={submitting}
                  >
                    {submitting && <Spinner className="h-3.5 w-3.5" />}
                    <span>{editingProdi ? 'Simpan Perubahan' : 'Tambah Program Studi'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* 7. CONFIRM DELETE DIALOG */}
      <ConfirmDialog
        open={Boolean(confirmDeleteId)}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={handleDeleteProdi}
        title="Hapus Program Studi"
        desc="Apakah Anda yakin ingin menghapus Program Studi ini? Jika program studi sudah memiliki data riwayat penyerapan taruna, sistem akan menonaktifkannya secara aman tanpa menghapus riwayat laporan."
        confirmText="Ya, Hapus / Nonaktifkan"
        confirmTone="danger"
        loading={deleting}
      />
    </div>
  )
}
