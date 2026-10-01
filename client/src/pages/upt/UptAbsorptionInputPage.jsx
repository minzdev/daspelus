import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import api, { apiError } from '../../lib/api'
import { Alert, EmptyState, SkeletonRows, ConfirmDialog, Modal } from '../../components/ui'
import {
  IconGraduation, IconPlus, IconDownload, IconFileText, IconCheck, IconTrash,
  IconEdit, IconSearch, IconChevronDown, IconBuilding, IconPeople, IconUnlock,
} from '../../components/icons'
import logoBpsdm from '../../assets/logo-bpsdm.png'
import { yearOptions, fmtNum, MONTHS } from '../../utils/format'
import { useToast } from '../../components/Toast'

const KATEGORI_OPTS = [
  { group: 'PEMERINTAH', value: 'pns', label: 'PNS (Pegawai Negeri Sipil)' },
  { group: 'PEMERINTAH', value: 'ppnpn', label: 'PPNPN (Pegawai Pemerintah Non Pegawai Negeri)' },
  { group: 'NON PEMERINTAH', value: 'bumn_bumd', label: 'BUMN / BUMD' },
  { group: 'NON PEMERINTAH', value: 'swasta', label: 'Swasta / Perusahaan Swasta' },
  { group: 'BELUM BEKERJA', value: 'belum_bekerja', label: 'Belum Bekerja / Mencari Kerja' },
]

export default function UptAbsorptionInputPage() {
  const { user } = useAuth()
  const toast = useToast()

  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filter & Search di tabel input
  const [filterProdi, setFilterProdi] = useState('all')
  const [filterKategori, setFilterKategori] = useState('all')
  const [search, setSearch] = useState('')

  // Modal Form State
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [formData, setFormData] = useState({
    prodiId: '',
    namaTaruna: '',
    nimTaruna: '',
    tahunLulus: new Date().getFullYear(),
    kategoriSerap: 'pns',
    instansiBekerja: '',
    keterangan: '',
  })
  const [submitting, setSubmitting] = useState(false)

  // Modal Submit to Pimpinan
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false)
  const [sendingToPimpinan, setSendingToPimpinan] = useState(false)

  // Modal Confirm Delete Record
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, recordId: null, recordName: '' })
  const [deleting, setDeleting] = useState(false)

  // Modal Manage Prodi
  const [prodiModalOpen, setProdiModalOpen] = useState(false)
  const [newProdiName, setNewProdiName] = useState('')
  const [newProdiJenjang, setNewProdiJenjang] = useState('D4')

  // Gate Check Data Taruna (harus approved_admin sebelum bisa input penyerapan)
  const [tarunaGate, setTarunaGate] = useState(null)
  const tarunaApproved = tarunaGate?.canInputAbsorption === true

  // Autocomplete Taruna Terdaftar (dari master Data Taruna)
  const [tarunaQuery, setTarunaQuery] = useState('')
  const [tarunaOptions, setTarunaOptions] = useState([])
  const [showTarunaDropdown, setShowTarunaDropdown] = useState(false)
  const [selectedTaruna, setSelectedTaruna] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // Cek status Master Data Taruna tahunan (gate check)
      let tarunaStatus = null
      try {
        const { data: statusRes } = await api.get('/absorptions/taruna-submissions/status', { params: { year } })
        tarunaStatus = statusRes
      } catch {
        tarunaStatus = null
      }
      setTarunaGate(tarunaStatus)

      const { data: res } = await api.get('/absorptions/my', { params: { year, month } })
      setData(res)
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => {
    load()
  }, [load])

  const submission = data?.submission || { status: 'draft' }
  const isLocked = submission.status === 'submitted_pimpinan' || submission.status === 'approved_pimpinan'
  const isApproved = submission.status === 'approved_pimpinan'
  const isRejected = submission.status === 'rejected_pimpinan'

  // Filtered records
  const filteredRecords = useMemo(() => {
    if (!data?.records) return []
    let list = [...data.records]
    if (filterProdi !== 'all') {
      list = list.filter((r) => r.prodiId === filterProdi)
    }
    if (filterKategori !== 'all') {
      list = list.filter((r) => r.kategoriSerap === filterKategori)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((r) =>
        (r.namaTaruna || '').toLowerCase().includes(q) ||
        (r.instansiBekerja || '').toLowerCase().includes(q) ||
        (r.nimTaruna || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [data?.records, filterProdi, filterKategori, search])

  const openAddModal = () => {
    setEditingRecord(null)
    const defaultProdi = data?.prodis?.[0]?.id || ''
    setFormData({
      prodiId: defaultProdi,
      namaTaruna: '',
      nimTaruna: '',
      tahunLulus: year,
      kategoriSerap: 'pns',
      instansiBekerja: '',
      keterangan: '',
    })
    setTarunaQuery('')
    setSelectedTaruna(null)
    setTarunaOptions([])
    setModalOpen(true)
    searchTarunaOptions('')
  }

  const openEditModal = (rec) => {
    setEditingRecord(rec)
    setFormData({
      prodiId: rec.prodiId,
      namaTaruna: rec.namaTaruna,
      nimTaruna: rec.nimTaruna || '',
      tahunLulus: rec.tahunLulus || year,
      kategoriSerap: rec.kategoriSerap,
      instansiBekerja: rec.instansiBekerja || '',
      keterangan: rec.keterangan || '',
    })
    setTarunaQuery(rec.namaTaruna || '')
    setSelectedTaruna(rec.tarunaId ? { id: rec.tarunaId, nama: rec.namaTaruna, nomorTaruna: rec.nimTaruna } : null)
    setModalOpen(true)
  }

  /** Cari taruna terdaftar dari master Data Taruna (hanya yang belum bekerja di bulan sebelumnya) */
  const searchTarunaOptions = async (query) => {
    setTarunaQuery(query)
    setFormData((prev) => ({ ...prev, namaTaruna: query }))
    setSelectedTaruna(null)
    try {
      const { data: res } = await api.get('/absorptions/tarunas/available', {
        params: { year, month, search: query.trim() || undefined },
      })
      setTarunaOptions(res.tarunas || [])
      setShowTarunaDropdown(true)
    } catch {
      setTarunaOptions([])
    }
  }

  /** Pilih taruna dari dropdown: nama & nomor otomatis terisi */
  const selectTarunaOption = (t) => {
    if (t.cannotSelect || t.isAlreadyEmployed || t.isAlreadyInQuarter) {
      toast.warning(t.disableReason || `Taruna ${t.nama} sudah tidak dapat dipilih lagi.`)
      return
    }
    setSelectedTaruna(t)
    setTarunaQuery(t.nama)
    setFormData((prev) => ({
      ...prev,
      namaTaruna: t.nama,
      nimTaruna: t.nomorTaruna || '',
      prodiId: t.prodiId || prev.prodiId,
      tahunLulus: t.tahunLulus || prev.tahunLulus,
    }))
    setShowTarunaDropdown(false)
  }

  const handleSaveRecord = async (e) => {
    e.preventDefault()
    if (!formData.prodiId) {
      toast.error('Pilih Program Studi terlebih dahulu.')
      return
    }
    if (!formData.namaTaruna.trim()) {
      toast.error('Nama Taruna wajib diisi.')
      return
    }
    if (formData.kategoriSerap !== 'belum_bekerja' && !formData.instansiBekerja.trim()) {
      toast.error('Nama Instansi / Perusahaan tempat bekerja wajib diisi.')
      return
    }
    if (!editingRecord) {
      const isDuplicate = (data?.records || []).some(
        (r) =>
          (formData.nimTaruna && r.nimTaruna && r.nimTaruna.trim() === formData.nimTaruna.trim()) ||
          (formData.namaTaruna && r.namaTaruna && r.namaTaruna.trim().toLowerCase() === formData.namaTaruna.trim().toLowerCase())
      )
      if (isDuplicate) {
        toast.error(`Taruna "${formData.namaTaruna}" sudah ada dalam laporan Bulan ${MONTHS[month - 1]} ini. Tidak dapat diinput ganda.`)
        return
      }
    }

    setSubmitting(true)
    try {
      if (editingRecord) {
        await api.put(`/absorptions/records/${editingRecord.id}`, formData)
        toast.success('Data taruna berhasil diperbarui.')
      } else {
        await api.post('/absorptions/records', {
          year,
          month,
          records: [{ ...formData, tarunaId: selectedTaruna?.id || null }],
        })
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

  const handleConfirmDeleteRecord = async () => {
    if (!deleteConfirm.recordId) return
    setDeleting(true)
    try {
      await api.delete(`/absorptions/records/${deleteConfirm.recordId}`)
      toast.success(`Data taruna ${deleteConfirm.recordName ? `"${deleteConfirm.recordName}" ` : ''}berhasil dihapus.`)
      setDeleteConfirm({ open: false, recordId: null, recordName: '' })
      load()
    } catch (err) {
      toast.error(apiError(err))
    } finally {
      setDeleting(false)
    }
  }

  const handleSubmitToPimpinan = async () => {
    setSendingToPimpinan(true)
    try {
      await api.post('/absorptions/submit', { year, month })
      toast.success('Laporan penyerapan berhasil dikirim ke Pimpinan UPT.')
      setConfirmSubmitOpen(false)
      load()
    } catch (err) {
      toast.error(apiError(err))
    } finally {
      setSendingToPimpinan(false)
    }
  }

  const handleAddProdi = async (e) => {
    e.preventDefault()
    if (!newProdiName.trim()) return
    try {
      await api.post('/absorptions/prodis', { namaProdi: newProdiName.trim(), jenjang: newProdiJenjang })
      toast.success('Program Studi berhasil ditambahkan.')
      setNewProdiName('')
      load()
    } catch (err) {
      toast.error(apiError(err))
    }
  }

  const summary = data?.summary || { totalBekerja: 0, totalLulusan: 0, pctAbsorption: 0 }

  return (
    <div className="animate-fadeUp space-y-6">
      {/* Banner Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-navy-950 via-navy-900 to-navy-950 px-5 py-4 text-white shadow-card border border-navy-800">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-48 w-48 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 p-1 shadow-inner border border-white/15 backdrop-blur-md"
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
                <h1 className="text-base sm:text-lg font-black text-white tracking-tight">
                  Input Data Penyerapan Lulusan
                </h1>
                <span className="rounded-full text-[10px] font-extrabold px-2.5 py-0.5 border bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                  Bulan {MONTHS[month - 1]} · Tahun {year}
                </span>
              </div>
              <p className="text-xs text-navy-200 mt-0.5 max-w-xl">
                <strong className="text-white">{user?.upt?.name || 'UPT'}</strong> — Pelaporan data tracer penyerapan lulusan taruna per Program Studi.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Pilih Tahun */}
            <div className="relative">
              <select
                className="appearance-none cursor-pointer bg-white/10 hover:bg-white/15 border border-white/20 text-white font-extrabold text-xs rounded-xl py-2 pl-3 pr-8 shadow-sm backdrop-blur-md transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {yearOptions().map((y) => (
                  <option key={y} value={y} className="bg-navy-900 text-white font-bold py-1">Tahun {y}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-emerald-300">
                <IconChevronDown className="h-3.5 w-3.5" />
              </div>
            </div>

            {/* Pilih Bulan */}
            <div className="relative">
              <select
                className="appearance-none cursor-pointer bg-white/10 hover:bg-white/15 border border-white/20 text-white font-extrabold text-xs rounded-xl py-2 pl-3 pr-8 shadow-sm backdrop-blur-md transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1} className="bg-navy-900 text-white font-bold py-1">
                    {m}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-emerald-300">
                <IconChevronDown className="h-3.5 w-3.5" />
              </div>
            </div>

            <button
              type="button"
              className="btn-secondary !text-xs !py-2 !px-3 rounded-xl border-white/20 text-white bg-white/10 hover:bg-white/20 font-bold"
              onClick={() => setProdiModalOpen(true)}
              title="Kelola Master Program Studi UPT"
            >
              Prodi UPT
            </button>
          </div>
        </div>
      </div>

      {/* Status Approval Banner */}
      {submission.status === 'submitted_pimpinan' && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
            <span>
              <strong>Menunggu Persetujuan Pimpinan UPT:</strong> Data penyerapan Bulan {MONTHS[month - 1]} Tahun {year} telah dikirim dan saat ini dalam proses review. Data terkunci untuk sementara.
            </span>
          </div>
          <span className="text-[11px] text-amber-700 font-semibold shrink-0">
            Dikirim: {new Date(submission.submittedAt).toLocaleDateString('id-ID')}
          </span>
        </div>
      )}

      {submission.status === 'approved_pimpinan' && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span>
              <strong>Laporan Telah Disetujui:</strong> Pimpinan UPT telah menyetujui data penyerapan Bulan {MONTHS[month - 1]} Tahun {year}.
            </span>
          </div>
          <span className="text-[11px] text-emerald-700 font-semibold shrink-0">
            Disetujui: {new Date(submission.approvedAt).toLocaleDateString('id-ID')}
          </span>
        </div>
      )}

      {submission.status === 'rejected_pimpinan' && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-1">
          <p className="font-bold flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
            Laporan Ditolak Pimpinan UPT untuk Direvisi:
          </p>
          <p className="text-rose-800 bg-white/70 p-2.5 rounded-lg border border-rose-200 font-medium">
            "{submission.notes || 'Silakan lengkapi data dan perbaiki instansi bekerja taruna.'}"
          </p>
        </div>
      )}

      {error && <Alert type="error">{error}</Alert>}

      {/* BANNER GATE CHECK: Data Taruna harus approved sebelum bisa input penyerapan */}
      {!loading && !tarunaApproved && (
        <div className="p-5 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-900">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
              <IconUnlock className="h-5 w-5" />
            </div>
            <div className="flex-1 space-y-2">
              <p className="font-black text-sm">Laporan Penyerapan Bulan {MONTHS[month - 1]} Belum Dapat Diisi</p>
              <p className="text-xs leading-relaxed">
                {tarunaGate?.submission
                  ? tarunaGate.submission.status === 'submitted_pimpinan'
                    ? 'Data Taruna sedang dalam proses verifikasi Pimpinan UPT.'
                    : tarunaGate.submission.status === 'submitted_admin'
                      ? 'Data Taruna telah diverifikasi Pimpinan dan menunggu persetujuan final Admin BPSDM.'
                      : 'Master Data Taruna tahun ini belum disetujui Admin BPSDM.'
                  : 'Anda belum menginput & mengajukan Master Data Taruna tahun ini.'}
                {' '}Silakan lengkapi dan ajukan persetujuan Data Taruna terlebih dahulu sebelum mengisi laporan penyerapan.
              </p>
              <div className="pt-1">
                <Link to="/upt/penyerapan/taruna">
                  <button type="button" className="btn-primary !bg-amber-500 hover:!bg-amber-600 text-white !text-xs !py-2 !px-4 rounded-xl shadow font-bold flex items-center gap-1.5">
                    <IconPeople className="h-3.5 w-3.5" />
                    <span>Ke Halaman Data Taruna</span>
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ringkasan 4 Kartu KPI Penyerapan */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4 border-surface-border">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-navy-400">Total Bekerja</span>
          <p className="text-2xl font-black text-navy-950 tabular-nums mt-0.5">{fmtNum(summary.totalBekerja)}</p>
          <p className="text-[10px] text-navy-500 font-semibold mt-0.5">
            Pemerintah: {fmtNum(summary.totalPemerintah)} · Non-Pem: {fmtNum(summary.totalNonPemerintah)}
          </p>
        </div>

        <div className="card p-4 border-surface-border">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-navy-400">Total Lulusan (Bulan)</span>
          <p className="text-2xl font-black text-navy-900 tabular-nums mt-0.5">{fmtNum(summary.totalLulusan)}</p>
          <p className="text-[10px] text-navy-500 font-semibold mt-0.5">
            Bekerja + Belum Bekerja
          </p>
        </div>

        <div className="card p-4 border-surface-border">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600">Belum Bekerja</span>
          <p className="text-2xl font-black text-amber-700 tabular-nums mt-0.5">{fmtNum(summary.totalBelumBekerja)}</p>
          <p className="text-[10px] text-amber-600 font-semibold mt-0.5">
            Mencari kerja / studi lanjut
          </p>
        </div>

        <div className="card p-4 border-surface-border bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-100">Persentase Serap (%)</span>
          <p className="text-3xl font-black tabular-nums mt-0.5">{summary.pctAbsorption}%</p>
          <p className="text-[10.5px] text-emerald-100 font-semibold mt-0.5">
            Tingkat Serapan Lulusan
          </p>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="card p-5 border-surface-border shadow-card space-y-4">
        {/* Action Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-surface-border">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Filter Prodi */}
            <div className="relative">
              <select
                className="text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 py-2 pl-3 pr-8 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                value={filterProdi}
                onChange={(e) => setFilterProdi(e.target.value)}
              >
                <option value="all">Semua Program Studi ({data?.prodis?.length || 0})</option>
                {(data?.prodis || []).map((p) => (
                  <option key={p.id} value={p.id}>{p.namaProdi}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                <IconChevronDown className="h-3 w-3" />
              </div>
            </div>

            {/* Filter Kategori */}
            <div className="relative">
              <select
                className="text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 py-2 pl-3 pr-8 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                value={filterKategori}
                onChange={(e) => setFilterKategori(e.target.value)}
              >
                <option value="all">Semua Kategori Serap</option>
                {KATEGORI_OPTS.map((k) => (
                  <option key={k.value} value={k.value}>{k.group}: {k.label.split('(')[0]}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                <IconChevronDown className="h-3 w-3" />
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                placeholder="Cari nama taruna / instansi..."
                className="text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 focus:outline-none focus:ring-2 focus:ring-emerald-400 w-48 sm:w-60"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <IconSearch className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isLocked && (
              <button
                type="button"
                className="btn-primary !bg-emerald-600 hover:!bg-emerald-700 text-white !text-xs !py-2 !px-3.5 rounded-xl shadow font-bold flex items-center gap-1.5"
                onClick={openAddModal}
              >
                <IconPlus className="h-3.5 w-3.5" />
                <span>Tambah Data Taruna</span>
              </button>
            )}

            {!isLocked && (data?.records?.length || 0) > 0 && (
              <button
                type="button"
                className="btn-gold !text-xs !py-2 !px-3.5 rounded-xl shadow font-bold flex items-center gap-1.5"
                onClick={() => setConfirmSubmitOpen(true)}
              >
                <IconCheck className="h-3.5 w-3.5" />
                <span>Kirim ke Pimpinan</span>
              </button>
            )}
          </div>
        </div>

        {/* Tabel Data Taruna */}
        {loading ? (
          <SkeletonRows rows={6} />
        ) : filteredRecords.length === 0 ? (
          <EmptyState
            icon={<IconGraduation className="h-7 w-7" />}
            title="Belum ada data taruna"
            desc={data?.records?.length ? 'Tidak ada data yang sesuai filter pencarian.' : 'Klik tombol "Tambah Data Taruna" untuk mulai menginput penyerapan lulusan.'}
          />
        ) : (
          <div className="w-full overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-left text-xs text-slate-800">
              <thead>
                <tr className="bg-navy-950 text-white font-extrabold uppercase text-[10px]">
                  <th className="px-3 py-2.5 text-center w-8">#</th>
                  <th className="px-3 py-2.5">PROGRAM STUDI</th>
                  <th className="px-3 py-2.5">NAMA TARUNA</th>
                  <th className="px-3 py-2.5">KATEGORI PENYERAPAN</th>
                  <th className="px-3 py-2.5">INSTANSI / PERUSAHAAN BEKERJA</th>
                  <th className="px-3 py-2.5">KETERANGAN</th>
                  {!isLocked && <th className="px-3 py-2.5 text-center w-24">AKSI</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredRecords.map((r, i) => {
                  let badgeCls = 'bg-slate-100 text-slate-700'
                  let catLabel = 'Belum Bekerja'
                  if (r.kategoriSerap === 'pns') {
                    badgeCls = 'bg-blue-50 text-blue-700 border-blue-200'
                    catLabel = 'PNS (Pemerintah)'
                  } else if (r.kategoriSerap === 'ppnpn') {
                    badgeCls = 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    catLabel = 'PPNPN (Pemerintah)'
                  } else if (r.kategoriSerap === 'bumn_bumd') {
                    badgeCls = 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    catLabel = 'BUMN / BUMD'
                  } else if (r.kategoriSerap === 'swasta') {
                    badgeCls = 'bg-violet-50 text-violet-700 border-violet-200'
                    catLabel = 'Swasta'
                  }

                  return (
                    <tr key={r.id} className={i % 2 === 0 ? 'bg-white hover:bg-slate-50/70' : 'bg-slate-50/50 hover:bg-slate-50/70'}>
                      <td className="px-3 py-2.5 text-center font-bold text-slate-400">{i + 1}</td>
                      <td className="px-3 py-2.5 font-bold text-navy-950">{r.prodi?.namaProdi || '-'}</td>
                      <td className="px-3 py-2.5">
                        <span className="font-extrabold text-navy-900 block">{r.namaTaruna}</span>
                        {r.nimTaruna && <span className="text-[10px] text-slate-400">NIM: {r.nimTaruna}</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${badgeCls}`}>
                          {catLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-slate-700">
                        {r.kategoriSerap === 'belum_bekerja' ? (
                          <span className="text-slate-400 italic">Belum bekerja</span>
                        ) : (
                          r.instansiBekerja || '-'
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 text-[11px]">{r.keterangan || '-'}</td>
                      {!isLocked && (
                        <td className="px-3 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              className="p-1 rounded text-slate-500 hover:text-navy-900 hover:bg-slate-200/60"
                              onClick={() => openEditModal(r)}
                              title="Edit Data"
                            >
                              <IconEdit className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                              onClick={() => setDeleteConfirm({ open: true, recordId: r.id, recordName: r.namaTaruna })}
                              title="Hapus Data"
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

      {/* MODAL FORM INPUT TARUNA */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingRecord ? 'Edit Data Taruna Lulusan' : 'Tambah Data Taruna Lulusan'}
        subtitle="Pilih nama taruna terdaftar untuk mengisi data secara otomatis"
      >
        <form onSubmit={handleSaveRecord} className="space-y-3.5">
          <div>
            <label className="form-label">Program Studi</label>
            <select
              className="w-full text-xs font-bold rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-emerald-400 focus:outline-none"
              value={formData.prodiId}
              onChange={(e) => setFormData({ ...formData, prodiId: e.target.value })}
              required
            >
              <option value="">-- Pilih Program Studi --</option>
              {(data?.prodis || []).map((p) => (
                <option key={p.id} value={p.id}>{p.namaProdi} ({p.jenjang || 'D4'})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative">
              <label className="form-label">Nama Lengkap Taruna</label>
              <input
                type="text"
                className="w-full text-xs font-semibold rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-emerald-400 focus:outline-none"
                placeholder="Ketik nama taruna untuk mencari..."
                value={tarunaQuery || formData.namaTaruna}
                onChange={(e) => searchTarunaOptions(e.target.value)}
                onFocus={() => {
                  setShowTarunaDropdown(true)
                  if (tarunaOptions.length === 0) searchTarunaOptions(tarunaQuery)
                }}
                onBlur={() => setTimeout(() => setShowTarunaDropdown(false), 220)}
                required
              />
              {/* DROPDOWN AUTOCOMPLETE TARUNA */}
              {showTarunaDropdown && tarunaOptions.length > 0 && (
                <div className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-slate-300 rounded-xl shadow-xl divide-y divide-slate-100">
                  {tarunaOptions.map((t) => {
                    const isDisabled = !!(t.cannotSelect || t.isAlreadyEmployed || t.isAlreadyInQuarter)
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={isDisabled}
                        className={`w-full text-left px-3 py-2.5 transition-colors ${
                          isDisabled
                            ? 'bg-slate-50 cursor-not-allowed opacity-75'
                            : 'hover:bg-emerald-50 cursor-pointer'
                        }`}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          if (!isDisabled) selectTarunaOption(t)
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`block font-extrabold text-xs ${isDisabled ? 'text-slate-500 line-through' : 'text-navy-900'}`}>
                            {t.nama}
                          </span>
                            {isDisabled ? (
                              <span className="shrink-0 text-[10px] font-black bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">
                                {t.isAlreadyInQuarter ? `Sudah Ada di Bulan Ini` : `Sudah Bekerja (${t.employedQuarterName || `TW ${t.employedQuarter}`})`}
                              </span>
                          ) : (
                            <span className="shrink-0 text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                              Tersedia
                            </span>
                          )}
                        </div>
                        <span className="block text-[10px] text-slate-500 mt-0.5">
                          No. {t.nomorTaruna} · {t.prodi?.namaProdi || 'Tanpa Prodi'}
                          {isDisabled && t.disableReason && ` · ${t.disableReason}`}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
              {selectedTaruna && (
                <p className="text-[10px] text-emerald-600 font-bold mt-1 flex items-center gap-1">
                  <IconCheck className="h-3 w-3" />
                  Terpilih dari Data Taruna: {selectedTaruna.nama} ({selectedTaruna.nomorTaruna})
                </p>
              )}
              {!selectedTaruna && tarunaQuery.trim() && !tarunaOptions.length && (
                <p className="text-[10px] text-amber-600 font-semibold mt-1">
                  Taruna tidak ditemukan di master Data Taruna. Daftarkan dulu di menu Data Taruna.
                </p>
              )}
            </div>
            <div>
              <label className="form-label">NIM / No. Taruna (Otomatis)</label>
              <input
                type="text"
                className="w-full text-xs font-semibold rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-emerald-400 focus:outline-none bg-slate-50 font-mono"
                placeholder="Terisi otomatis saat memilih nama"
                value={formData.nimTaruna}
                readOnly={!editingRecord}
                onChange={(e) => setFormData({ ...formData, nimTaruna: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="form-label">Kategori Penyerapan</label>
            <select
              className="w-full text-xs font-bold rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-emerald-400 focus:outline-none"
              value={formData.kategoriSerap}
              onChange={(e) => setFormData({ ...formData, kategoriSerap: e.target.value })}
            >
              <optgroup label="PEMERINTAH">
                <option value="pns">PNS (Pegawai Negeri Sipil)</option>
                <option value="ppnpn">PPNPN (Pegawai Pemerintah Non Pegawai Negeri)</option>
              </optgroup>
              <optgroup label="NON PEMERINTAH">
                <option value="bumn_bumd">BUMN / BUMD</option>
                <option value="swasta">Swasta (Perusahaan Pelayaran/Logistik/dll.)</option>
              </optgroup>
              <optgroup label="BELUM BEKERJA">
                <option value="belum_bekerja">Belum Bekerja / Sedang Mencari Kerja</option>
              </optgroup>
            </select>
          </div>

          {formData.kategoriSerap !== 'belum_bekerja' && (
            <div>
              <label className="form-label">Nama Instansi / Perusahaan Tempat Bekerja</label>
              <input
                type="text"
                className="w-full text-xs font-semibold rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-emerald-400 focus:outline-none"
                placeholder="Contoh: Kantor KSOP Tanjung Perak / PT Pelni"
                value={formData.instansiBekerja}
                onChange={(e) => setFormData({ ...formData, instansiBekerja: e.target.value })}
                required
              />
            </div>
          )}

          <div>
            <label className="form-label">Keterangan / Jabatan (Opsional)</label>
            <input
              type="text"
              className="w-full text-xs font-semibold rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-emerald-400 focus:outline-none"
              placeholder="Contoh: Mualim III / Staf Operasional"
              value={formData.keterangan}
              onChange={(e) => setFormData({ ...formData, keterangan: e.target.value })}
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-surface-border">
            <button type="button" className="btn-secondary !text-xs !py-2 !px-4" onClick={() => setModalOpen(false)}>
              Batal
            </button>
            <button type="submit" className="btn-primary !bg-emerald-600 hover:!bg-emerald-700 !text-xs !py-2 !px-4" disabled={submitting}>
              {submitting ? 'Menyimpan...' : 'Simpan Data'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL KELOLA PRODI */}
      <Modal
        open={prodiModalOpen}
        onClose={() => setProdiModalOpen(false)}
        title="Program Studi UPT"
        subtitle="Daftar Program Studi aktif di UPT Anda"
      >
        <form onSubmit={handleAddProdi} className="flex items-center gap-2 mb-4">
          <input
            type="text"
            placeholder="Nama Program Studi baru..."
            className="flex-1 text-xs font-semibold rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-emerald-400 focus:outline-none"
            value={newProdiName}
            onChange={(e) => setNewProdiName(e.target.value)}
            required
          />
          <select
            className="text-xs font-bold rounded-xl border border-slate-300 p-2.5 focus:ring-2 focus:ring-emerald-400 focus:outline-none"
            value={newProdiJenjang}
            onChange={(e) => setNewProdiJenjang(e.target.value)}
          >
            <option value="D4">D4</option>
            <option value="D3">D3</option>
            <option value="D2">D2</option>
            <option value="S2">S2</option>
            <option value="Diklat">Diklat</option>
          </select>
          <button type="submit" className="btn-primary !bg-emerald-600 hover:!bg-emerald-700 !text-xs !py-2.5 !px-3 font-bold shrink-0">
            Tambah
          </button>
        </form>

        <div className="max-h-60 overflow-y-auto space-y-1 divide-y divide-slate-100">
          {(data?.prodis || []).map((p, idx) => (
            <div key={p.id} className="pt-2 pb-1 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-bold text-[11px]">{idx + 1}.</span>
                <span className="font-extrabold text-navy-950">{p.namaProdi}</span>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold">{p.jenjang || 'D4'}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="pt-4 text-right border-t border-surface-border mt-3">
          <button type="button" className="btn-secondary !text-xs !py-1.5 !px-3" onClick={() => setProdiModalOpen(false)}>
            Tutup
          </button>
        </div>
      </Modal>

      {/* CONFIRM MODAL KIRIM KE PIMPINAN */}
      <ConfirmDialog
        open={confirmSubmitOpen}
        onClose={() => setConfirmSubmitOpen(false)}
        onConfirm={handleSubmitToPimpinan}
        loading={sendingToPimpinan}
        title={`Kirim Laporan Penyerapan Bulan ${MONTHS[month - 1]} ${year}?`}
        desc={`Sebanyak ${data?.records?.length || 0} data taruna akan dikirimkan kepada Pimpinan UPT untuk diperiksa dan disetujui. Data akan terkunci selama proses review.`}
        confirmText="Kirim ke Pimpinan"
        confirmTone="primary"
      />

      {/* CONFIRM MODAL HAPUS RECORD PENYERAPAN */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, recordId: null, recordName: '' })}
        onConfirm={handleConfirmDeleteRecord}
        loading={deleting}
        title="Hapus Data Lulusan dari Laporan?"
        desc={`Apakah Anda yakin ingin menghapus data taruna "${deleteConfirm.recordName}" dari laporan penyerapan Bulan ${MONTHS[month - 1]} Tahun ${year}? Data yang dihapus akan kembali tersedia untuk dilaporkan.`}
        confirmText="Hapus Data"
        confirmTone="danger"
      />
    </div>
  )
}
