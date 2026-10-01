import { useCallback, useEffect, useMemo, useState } from 'react'
import api, { apiError } from '../../lib/api'
import {
  Modal, ActiveBadge, EmptyState, SkeletonRows, Alert, Spinner, FormField,
} from '../../components/ui'
import { IconBuilding, IconPlus, IconEdit, IconSearch, IconRefresh, IconTrash, IconX } from '../../components/icons'
import { useToast } from '../../components/Toast'
import { fmtDate } from '../../utils/format'

const MATRA_OPTIONS = [
  { value: 'darat', label: 'Darat' },
  { value: 'laut', label: 'Laut' },
  { value: 'udara', label: 'Udara' },
  { value: 'aparatur', label: 'Aparatur' },
]

const UPT_TYPE_OPTIONS = [
  { value: 'taruna', label: 'Taruna (3 Matra)', short: 'Taruna', icon: '⚓', desc: 'Memiliki taruna dari matra darat/laut/udara' },
  { value: 'aparatur', label: 'Aparatur', short: 'Aparatur', icon: '🏢', desc: 'Unit pelaksana untuk diklat aparatur' },
]

const EMPTY_FORM = { code: '', name: '', matra: '', uptType: 'taruna' }

function matraLabel(v) {
  return MATRA_OPTIONS.find((m) => m.value === v)?.label || '—'
}

export default function DataUptPage() {
  const [upts, setUpts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [matraFilter, setMatraFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null) // null = tambah
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteUpt, setDeleteUpt] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      await api.post('/upts/sync-status').catch(() => {})
      const { data } = await api.get('/upts')
      setUpts(data.upts)
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return upts.filter((u) => {
      if (matraFilter && u.matra !== matraFilter) return false
      if (typeFilter && (u.uptType || 'taruna') !== typeFilter) return false
      if (!q) return true
      return (
        u.name.toLowerCase().includes(q) ||
        u.code.toLowerCase().includes(q) ||
        matraLabel(u.matra).toLowerCase().includes(q)
      )
    })
  }, [upts, search, matraFilter, typeFilter])

  const hasActiveFilter = matraFilter !== '' || typeFilter !== '' || search.trim() !== ''
  const clearFilters = () => {
    setMatraFilter('')
    setTypeFilter('')
    setSearch('')
  }

  function openAdd() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(u) {
    setEditing(u)
    setForm({ code: u.code, name: u.name, matra: u.matra || '', uptType: u.uptType || 'taruna' })
    setFormError('')
    setModalOpen(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    if (!form.code.trim() || !form.name.trim()) {
      setFormError('Kode dan nama UPT wajib diisi.')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await api.put(`/upts/${editing.id}`, form)
        toast.success('UPT diperbarui', `${form.code} — ${form.name}`)
      } else {
        await api.post('/upts', form)
        toast.success('UPT ditambahkan', `${form.code} — ${form.name}`)
      }
      setModalOpen(false)
      await load()
    } catch (err) {
      setFormError(apiError(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteUpt) return
    setDeleting(true)
    try {
      const { data } = await api.delete(`/upts/${deleteUpt.id}`)
      toast.success('UPT dihapus', data.message || `UPT ${deleteUpt.code} berhasil dihapus.`)
      setDeleteUpt(null)
      await load()
    } catch (err) {
      toast.error('Gagal menghapus UPT', apiError(err))
      setDeleteUpt(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="animate-fadeUp space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2.5">
            <span className="hidden sm:inline-flex h-8 w-8 items-center justify-center rounded-xl bg-navy-900 text-white">
              <IconBuilding className="h-4 w-4" />
            </span>
            Data UPT
          </h1>
          <p className="page-desc mt-1.5 max-w-2xl">
            Kelola Unit Pelaksana Teknis yang melaporkan data peserta dan lulusan. Filter berdasarkan matra dan tipe untuk menemukan UPT lebih cepat.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button className="btn-secondary !rounded-xl !py-2.5" onClick={load} title="Muat ulang" aria-label="Muat ulang">
            <IconRefresh className="h-4 w-4" />
          </button>
          <button className="btn-primary !rounded-xl !py-2.5 shadow-md" onClick={openAdd}>
            <IconPlus className="h-4 w-4" /> Tambah UPT
          </button>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* Filter bar — redesigned */}
      <div className="card rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden bg-white">
        <div className="p-4 md:p-5 space-y-4">
          {/* Baris atas: filter pills */}
          <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-5">
            <div className="space-y-3.5 flex-1 min-w-0">
              {/* Matra */}
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500 w-[46px] shrink-0">Matra</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMatraFilter('')}
                    className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ring-1 ${
                      matraFilter === ''
                        ? 'bg-slate-900 text-white ring-slate-900 shadow-sm'
                        : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    Semua
                  </button>
                  {MATRA_OPTIONS.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setMatraFilter(matraFilter === m.value ? '' : m.value)}
                      className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ring-1 ${
                        matraFilter === m.value
                          ? 'bg-slate-900 text-white ring-slate-900 shadow-sm'
                          : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Tipe */}
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500 w-[46px] shrink-0">Tipe</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTypeFilter('')}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ring-1 ${
                      typeFilter === ''
                        ? 'bg-slate-900 text-white ring-slate-900 shadow-sm'
                        : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    Semua
                  </button>
                  {UPT_TYPE_OPTIONS.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setTypeFilter(typeFilter === t.value ? '' : t.value)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ring-1 ${
                        typeFilter === t.value
                          ? 'bg-slate-900 text-white ring-slate-900 shadow-sm'
                          : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-[13px] leading-none">{t.icon}</span>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Kanan: stat + search */}
            <div className="flex flex-col gap-3 w-full xl:w-auto xl:items-end shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-900 text-white px-3.5 py-1.5 text-xs font-bold shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  {filtered.length} UPT
                </span>
                <span className="text-xs text-slate-500 font-medium">dari {upts.length} total</span>
                {hasActiveFilter && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 px-3 py-1.5 text-xs font-bold hover:bg-amber-100 transition-colors ml-1"
                  >
                    <IconX className="h-3 w-3" /> Reset
                  </button>
                )}
              </div>
              <div className="relative w-full sm:w-[300px]">
                <IconSearch className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="form-input !rounded-xl !py-2.5 pl-10 pr-9 text-sm w-full bg-slate-50/50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 placeholder:text-slate-400"
                  placeholder="Cari kode atau nama UPT..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors"
                    aria-label="Hapus pencarian"
                  >
                    <IconX className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Table / states */}
      <div className="card rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden bg-white">
        {loading ? (
          <div className="p-4">
            <SkeletonRows rows={6} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-2">
            <EmptyState
              icon={<IconBuilding className="h-6 w-6" />}
              title={search || hasActiveFilter ? 'Tidak ditemukan' : 'Belum ada UPT'}
              desc={
                search || hasActiveFilter
                  ? 'Coba ubah kata kunci atau reset filter untuk melihat semua UPT.'
                  : 'Tambahkan UPT pertama untuk memulai sistem pelaporan.'
              }
              action={
                search || hasActiveFilter ? (
                  <button className="btn-secondary !rounded-xl" onClick={clearFilters}>
                    <IconX className="h-4 w-4" /> Reset Filter
                  </button>
                ) : (
                  <button className="btn-primary !rounded-xl" onClick={openAdd}>
                    <IconPlus className="h-4 w-4" /> Tambah UPT
                  </button>
                )
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 860 }}>
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200/60">
                  <th className="text-left px-4 py-3.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-500 whitespace-nowrap">Kode</th>
                  <th className="text-left px-4 py-3.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Nama UPT</th>
                  <th className="text-left px-3 py-3.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-500 whitespace-nowrap">Matra</th>
                  <th className="text-left px-3 py-3.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-500 whitespace-nowrap">Tipe UPT</th>
                  <th className="text-left px-3 py-3.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-500 whitespace-nowrap hidden lg:table-cell">Dibuat</th>
                  <th className="text-left px-3 py-3.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-500 whitespace-nowrap">Status</th>
                  <th className="text-right px-4 py-3.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-500 whitespace-nowrap">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((u) => (
                  <tr key={u.id} className="group hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3.5">
                      <span
                        className="inline-flex items-center rounded-lg bg-slate-900 text-amber-300 px-2.5 py-1.5 text-xs font-black tracking-wide shadow-sm ring-1 ring-slate-900 whitespace-nowrap max-w-[150px] truncate"
                        title={u.code}
                      >
                        {u.code}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-slate-900 leading-snug line-clamp-2 max-w-[360px]" title={u.name}>
                        {u.name}
                      </p>
                      <p className="text-xs text-slate-500 font-medium lg:hidden mt-0.5">{fmtDate(u.createdAt)}</p>
                    </td>
                    <td className="px-3 py-3.5"><MatraBadge matra={u.matra} /></td>
                    <td className="px-3 py-3.5"><UptTypeBadge uptType={u.uptType} /></td>
                    <td className="px-3 py-3.5 text-xs text-slate-500 whitespace-nowrap hidden lg:table-cell font-medium">{fmtDate(u.createdAt)}</td>
                    <td className="px-3 py-3.5"><ActiveBadge active={u.isActive !== false} /></td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-900 hover:text-white hover:border-slate-900 hover:shadow-sm transition-all"
                          onClick={() => openEdit(u)}
                          title={`Edit ${u.code}`}
                        >
                          <IconEdit className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Edit</span>
                        </button>
                        {u.isActive === false && (
                          <button
                            className="inline-flex items-center justify-center h-[30px] w-[30px] rounded-xl bg-red-50 text-red-600 ring-1 ring-red-200 hover:bg-red-600 hover:text-white hover:ring-red-600 transition-colors"
                            title={`Hapus ${u.code}`}
                            onClick={() => setDeleteUpt(u)}
                          >
                            <IconTrash className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 bg-slate-50/50 border-t border-slate-200/60 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Menampilkan <strong className="text-slate-900">{filtered.length}</strong> UPT</span>
            <span className="text-slate-400 hidden sm:inline">Gulir horizontal untuk melihat semua kolom di layar kecil</span>
          </div>
        )}
      </div>

      {/* Modal tambah/edit */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit UPT ${editing.code}` : 'Tambah UPT Baru'}
        subtitle={editing ? 'Perbarui data unit pelaksana teknis.' : 'Daftarkan unit pelaksana teknis baru.'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <Alert type="error">{formError}</Alert>}
          <FormField label="Kode UPT" required hint="Huruf kapital tanpa spasi, contoh: STIP">
            <input
              className="form-input uppercase !rounded-xl"
              placeholder="STIP"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
            />
          </FormField>
          <FormField label="Nama UPT" required>
            <input
              className="form-input !rounded-xl"
              placeholder="Sekolah Tinggi Ilmu Pelayaran Jakarta"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </FormField>
          <FormField label="Matra" hint="Pilih Darat / Laut / Udara untuk Taruna, atau Aparatur untuk diklat aparatur">
            <select
              className="form-input !rounded-xl"
              value={form.matra}
              onChange={(e) => {
                const v = e.target.value
                setForm((f) => {
                  const next = { ...f, matra: v }
                  if (v === 'aparatur') next.uptType = 'aparatur'
                  else if (v && f.uptType === 'aparatur' && ['darat', 'laut', 'udara'].includes(v)) next.uptType = 'taruna'
                  return next
                })
              }}
            >
              <option value="">— Pilih Matra —</option>
              {MATRA_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Tipe UPT" hint="Tentukan jenis UPT untuk menentukan program diklat yang tersedia" required>
            <select
              className="form-input !rounded-xl"
              value={form.uptType}
              onChange={(e) => {
                const v = e.target.value
                setForm((f) => {
                  const next = { ...f, uptType: v }
                  if (v === 'aparatur') next.matra = 'aparatur'
                  else if (v === 'taruna' && f.matra === 'aparatur') next.matra = ''
                  return next
                })
              }}
            >
              {UPT_TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.icon} {t.label} — {t.desc}</option>
              ))}
            </select>
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary !rounded-xl" onClick={() => setModalOpen(false)}>
              Batal
            </button>
            <button type="submit" className="btn-primary min-w-[140px] !rounded-xl" disabled={saving}>
              {saving ? <><Spinner /> Menyimpan...</> : editing ? 'Simpan Perubahan' : 'Tambah UPT'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal konfirmasi hapus UPT */}
      <Modal
        open={!!deleteUpt}
        onClose={() => setDeleteUpt(null)}
        title="Hapus UPT"
        subtitle={deleteUpt ? `${deleteUpt.code} — ${deleteUpt.name}` : ''}
      >
        <div className="space-y-4">
          <Alert type="warning">
            UPT <strong>{deleteUpt?.code}</strong> ({deleteUpt?.name}) akan dihapus permanen.
            Data realisasi yang sudah tercatat tidak ikut terhapus, namun UPT ini tidak akan muncul lagi di daftar.
          </Alert>
          <p className="text-sm text-slate-600">
            Tindakan ini tidak dapat dibatalkan. Pastikan UPT benar-benar tidak dibutuhkan lagi.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary !rounded-xl" onClick={() => setDeleteUpt(null)}>Batal</button>
            <button
              type="button"
              className="btn-danger min-w-[140px] !rounded-xl"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? <><Spinner /> Menghapus...</> : 'Hapus UPT'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

/* ============ Badge matra (darat/laut/udara/aparatur) ============ */
const MATRA_STYLE = {
  darat: { icon: '⛰️', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  laut: { icon: '⚓', cls: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500' },
  udara: { icon: '✈️', cls: 'bg-violet-50 text-violet-700 ring-violet-200', dot: 'bg-violet-500' },
  aparatur: { icon: '🏢', cls: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
}

function MatraBadge({ matra }) {
  const s = MATRA_STYLE[matra]
  if (!s || !matra) {
    return <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-400 px-2.5 py-1 text-xs font-medium ring-1 ring-slate-200">—</span>
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 whitespace-nowrap ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot} shrink-0`} />
      <span className="text-[11px] leading-none">{s.icon}</span>
      {matraLabel(matra)}
    </span>
  )
}

const UPT_TYPE_STYLE = {
  taruna: { icon: '⚓', cls: 'bg-blue-50 text-blue-700 ring-blue-200', dot: 'bg-blue-500' },
  aparatur: { icon: '🏢', cls: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
}

function UptTypeBadge({ uptType }) {
  const v = uptType || 'taruna'
  const s = UPT_TYPE_STYLE[v] || UPT_TYPE_STYLE.taruna
  const opt = UPT_TYPE_OPTIONS.find((t) => t.value === v)
  const short = opt?.short || (v === 'aparatur' ? 'Aparatur' : 'Taruna')
  const full = opt?.label || short
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 whitespace-nowrap ${s.cls}`}
      title={full}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot} shrink-0`} />
      <span className="text-[11px] leading-none">{s.icon}</span>
      {short}
    </span>
  )
}
