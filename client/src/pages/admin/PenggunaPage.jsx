import { useCallback, useEffect, useMemo, useState } from 'react'
import api, { apiError } from '../../lib/api'
import {
  Modal, ActiveBadge, EmptyState, SkeletonRows, Alert, Spinner, FormField, PasswordInput,
} from '../../components/ui'
import { IconUsers, IconPlus, IconSearch, IconKey, IconRefresh, IconEdit, IconWhatsApp, IconTrash, IconX } from '../../components/icons'
import { useToast } from '../../components/Toast'
import { fmtDate, fmtPhone, waLink, isValidPhone } from '../../utils/format'

const EMPTY_FORM = { name: '', email: '', password: '', phone: '', uptId: '', role: 'UPT_ADMIN', pusbangMatra: 'darat' }

const MATRA_OPTIONS = [
  { value: 'darat', label: 'Darat' },
  { value: 'laut', label: 'Laut' },
  { value: 'udara', label: 'Udara' },
  { value: 'aparatur', label: 'Aparatur' },
]

const ROLE_OPTIONS = [
  { value: 'UPT_ADMIN', label: 'Admin UPT', desc: 'Input target & realisasi', color: 'bg-sky-50 text-sky-700 ring-sky-200' },
  { value: 'PIMPINAN_UPT', label: 'Pimpinan UPT', desc: 'Approve laporan & unlock tahap 1', color: 'bg-amber-50 text-amber-700 ring-amber-200' },
  { value: 'PUSBANG', label: 'Admin Pusbang', desc: 'Pusbang Darat / Laut / Udara', color: 'bg-violet-50 text-violet-700 ring-violet-200' },
  { value: 'SUPER_ADMIN', label: 'Super Admin BPSDMP', desc: 'Akses penuh', color: 'bg-slate-900 text-white ring-slate-900' },
]

function matraLabel(v) {
  return MATRA_OPTIONS.find((m) => m.value === v)?.label || ''
}
function roleLabel(v) {
  return ROLE_OPTIONS.find((r) => r.value === v)?.label || v
}
function roleBadgeCls(v) {
  return ROLE_OPTIONS.find((r) => r.value === v)?.color || 'bg-slate-100 text-slate-600 ring-slate-200'
}

export default function PenggunaPage() {
  const [users, setUsers] = useState([])
  const [uptOptions, setUptOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [matraFilter, setMatraFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [deleteUser, setDeleteUser] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const [resetUser, setResetUser] = useState(null)
  const [resetPass, setResetPass] = useState('')
  const [resetting, setResetting] = useState(false)

  const [editUser, setEditUser] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [u, o] = await Promise.all([api.get('/users'), api.get('/upts/options')])
      setUsers(u.data.users)
      setUptOptions(o.data.options)
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (formError || editError) {
      document.querySelector('.modal-overlay')?.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [formError, editError])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const digitsOnly = q.replace(/[^0-9]/g, '')
    return users.filter((u) => {
      if (matraFilter && u.matra !== matraFilter) return false
      if (roleFilter && u.role !== roleFilter) return false
      if (!q) return true
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.uptName || '').toLowerCase().includes(q) ||
        (u.uptCode || '').toLowerCase().includes(q) ||
        (matraLabel(u.matra).toLowerCase().includes(q)) ||
        (roleLabel(u.role).toLowerCase().includes(q)) ||
        (digitsOnly && (u.phone || '').includes(digitsOnly))
      )
    })
  }, [users, search, matraFilter, roleFilter])

  const hasActiveFilter = matraFilter !== '' || roleFilter !== '' || search.trim() !== ''
  const clearFilters = () => {
    setMatraFilter('')
    setRoleFilter('')
    setSearch('')
  }

  // Multi-admin: satu UPT boleh memiliki beberapa Admin UPT (admin 1, 2, 3, ...).
  // Tampilkan semua UPT + jumlah akun role tersebut yang sudah ada sebagai info.
  const adminCountByUpt = useMemo(() => {
    const m = new Map()
    for (const u of users) {
      if (u.role === form.role && u.uptId) m.set(u.uptId, (m.get(u.uptId) || 0) + 1)
    }
    return m
  }, [users, form.role])
  const availableUptOptions = useMemo(() => {
    if (form.role === 'PUSBANG' || form.role === 'SUPER_ADMIN') return []
    return uptOptions
  }, [uptOptions, form.role])

  async function handleCreate(e) {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setFormError('Nama, email, dan password wajib diisi.')
      return
    }
    if (form.password.length < 6) {
      setFormError('Password minimal 6 karakter.')
      return
    }
    if (form.phone.trim() && !isValidPhone(form.phone)) {
      setFormError('Nomor HP/WA tidak valid. Contoh: 081234567890 atau +6281234567890.')
      return
    }
    if (['UPT_ADMIN', 'PIMPINAN_UPT'].includes(form.role) && !form.uptId) {
      setFormError('UPT wajib dipilih untuk Admin UPT / Pimpinan UPT.')
      return
    }
    if (form.role === 'PUSBANG' && !form.pusbangMatra) {
      setFormError('Matra Pusbang wajib dipilih.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        email: form.email,
        password: form.password,
        phone: form.phone,
        role: form.role,
        uptId: form.uptId || undefined,
        pusbangMatra: form.pusbangMatra || undefined,
      }
      const { data } = await api.post('/users', payload)
      toast.success('Akun dibuat', data.message || `Akun untuk ${form.email} berhasil dibuat.`)
      setModalOpen(false)
      setForm(EMPTY_FORM)
      await load()
    } catch (err) {
      setFormError(apiError(err))
      toast.error('Gagal membuat akun', apiError(err))
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(u) {
    try {
      await api.patch(`/users/${u.id}/status`)
      toast.success('Status akun diperbarui', `Akun ${u.email} berhasil diperbarui.`)
      await load()
    } catch (err) {
      toast.error('Gagal memperbarui status akun', apiError(err))
    }
  }

  async function handleDelete() {
    if (!deleteUser) return
    setDeleting(true)
    try {
      const { data } = await api.delete(`/users/${deleteUser.id}`)
      toast.success('Akun dihapus', data.message || `Akun ${deleteUser.email} berhasil dihapus.`)
      setDeleteUser(null)
      await load()
    } catch (err) {
      toast.error('Gagal menghapus akun', apiError(err))
      setDeleteUser(null)
    } finally {
      setDeleting(false)
    }
  }

  async function handleReset(e) {
    e.preventDefault()
    if (resetPass.length < 6) return
    setResetting(true)
    try {
      await api.patch(`/users/${resetUser.id}/password`, { newPassword: resetPass })
      toast.success('Password direset', `Password ${resetUser.email} berhasil direset.`)
      setResetUser(null)
      setResetPass('')
    } catch (err) {
      toast.error('Gagal mereset password', apiError(err))
    } finally {
      setResetting(false)
    }
  }

  function openEditor(u) {
    setEditUser(u)
    setEditForm({ name: u.name, email: u.email, phone: u.phone || '' })
    setEditError('')
  }

  async function handleEditSave(e) {
    e.preventDefault()
    if (!editForm.name.trim() || !editForm.email.trim()) {
      setEditError('Nama dan email wajib diisi.')
      return
    }
    if (editForm.phone.trim() && !isValidPhone(editForm.phone)) {
      setEditError('Nomor HP/WA tidak valid. Contoh: 081234567890 atau +6281234567890.')
      return
    }
    setEditSaving(true)
    try {
      const { data } = await api.put(`/users/${editUser.id}`, editForm)
      toast.success('Pengguna diperbarui', data.message || `Akun ${editUser.email} berhasil diperbarui.`)
      setEditUser(null)
      await load()
    } catch (err) {
      setEditError(apiError(err))
      toast.error('Gagal memperbarui pengguna', apiError(err))
    } finally {
      setEditSaving(false)
    }
  }

  return (
    <div className="animate-fadeUp space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2.5">
            <span className="hidden sm:inline-flex h-8 w-8 items-center justify-center rounded-xl bg-navy-900 text-white">
              <IconUsers className="h-4 w-4" />
            </span>
            Manajemen Pengguna
          </h1>
          <p className="page-desc mt-1.5 max-w-2xl">Buat akun 4 level: Super Admin, Admin Pusbang (Darat/Laut/Udara), Pimpinan UPT, dan Admin UPT. Kelola aktivasi & reset password.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button className="btn-secondary !rounded-xl !py-2.5" onClick={load} title="Muat ulang" aria-label="Muat ulang">
            <IconRefresh className="h-4 w-4" />
          </button>
          <button className="btn-primary !rounded-xl !py-2.5 shadow-md" onClick={() => { setForm({ ...EMPTY_FORM, role: 'UPT_ADMIN' }); setFormError(''); setModalOpen(true) }}>
            <IconPlus className="h-4 w-4" /> Buat Akun
          </button>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      <div className="card rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden bg-white">
        <div className="p-4 md:p-5 space-y-3">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500 w-[46px] shrink-0">Role</span>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setRoleFilter('')} className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-bold transition-all duration-200 ring-1 ${roleFilter === '' ? 'bg-slate-900 text-white ring-slate-900 shadow-sm' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300 hover:bg-slate-50'}`}>Semua</button>
                {ROLE_OPTIONS.map((r) => (
                  <button key={r.value} type="button" onClick={() => setRoleFilter(roleFilter === r.value ? '' : r.value)} className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-bold transition-all duration-200 ring-1 ${roleFilter === r.value ? 'bg-slate-900 text-white ring-slate-900 shadow-sm' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300 hover:bg-slate-50'}`}>{r.label}</button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500 w-[46px] shrink-0">Matra</span>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setMatraFilter('')} className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-bold transition-all duration-200 ring-1 ${matraFilter === '' ? 'bg-slate-900 text-white ring-slate-900 shadow-sm' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300 hover:bg-slate-50'}`}>Semua</button>
                {MATRA_OPTIONS.map((m) => (
                  <button key={m.value} type="button" onClick={() => setMatraFilter(matraFilter === m.value ? '' : m.value)} className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-bold transition-all duration-200 ring-1 ${matraFilter === m.value ? 'bg-slate-900 text-white ring-slate-900 shadow-sm' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300 hover:bg-slate-50'}`}>{m.label}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-2 rounded-full bg-slate-900 text-white px-3.5 py-1.5 text-xs font-bold shadow-sm whitespace-nowrap">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                {filtered.length} akun
              </span>
              <span className="text-xs text-slate-500 font-medium whitespace-nowrap">dari {users.length} total</span>
              {hasActiveFilter && (
                <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 px-3 py-1.5 text-xs font-bold hover:bg-amber-100 transition-colors">
                  <IconX className="h-3 w-3" /> Reset
                </button>
              )}
            </div>
            <div className="relative w-full sm:w-[280px] shrink-0">
              <IconSearch className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="form-input !rounded-xl !py-2.5 pl-10 pr-9 text-sm w-full bg-slate-50/50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 placeholder:text-slate-400 transition-all" placeholder="Cari nama, email, UPT..." value={search} onChange={(e) => setSearch(e.target.value)} />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors" aria-label="Hapus pencarian">
                  <IconX className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden bg-white">
        {loading ? (
          <div className="p-4">
            <SkeletonRows rows={6} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-2">
            <EmptyState
              icon={<IconUsers className="h-6 w-6" />}
              title={search || hasActiveFilter ? 'Tidak ditemukan' : 'Belum ada akun user'}
              desc={search || hasActiveFilter ? 'Coba ubah kata kunci atau reset filter.' : 'Buat akun user pertama untuk UPT Anda.'}
              action={
                search || hasActiveFilter ? (
                  <button className="btn-secondary !rounded-xl" onClick={clearFilters}>
                    <IconX className="h-4 w-4" /> Reset Filter
                  </button>
                ) : (
                  <button className="btn-primary !rounded-xl" onClick={() => setModalOpen(true)}>
                    <IconPlus className="h-4 w-4" /> Buat Akun
                  </button>
                )
              }
            />
          </div>
        ) : (
          <>
            <div className="hidden lg:block overflow-hidden">
              <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '30%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '19%' }} />
                </colgroup>
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-200/60">
                    <th className="text-center px-4 py-3 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Pengguna</th>
                    <th className="text-center px-2 py-3 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Role</th>
                    <th className="text-center px-2 py-3 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">UPT / Matra</th>
                    <th className="text-center px-2 py-3 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Dibuat</th>
                    <th className="text-center px-2 py-3 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Status</th>
                    <th className="text-center px-3 py-3 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((u) => (
                    <tr key={u.id} className="group hover:bg-slate-50/60 transition-colors duration-200">
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2.5 min-w-0">
                          <div className="h-8 w-8 shrink-0 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-extrabold">
                            {(u.name || 'U').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1 text-left">
                            <p className="font-semibold text-slate-900 leading-tight truncate text-xs" title={u.name}>{u.name}</p>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5" title={u.email}>{u.email}</p>
                          </div>
                          <div className="shrink-0">
                            <PhoneCell user={u} compact />
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-3 text-center">
                        <span className={`inline-flex items-center justify-center rounded-full px-2 py-1 text-[11px] font-bold ring-1 whitespace-nowrap ${roleBadgeCls(u.role)}`}>{roleLabel(u.role)}</span>
                      </td>
                      <td className="px-2 py-3 text-center">
                        {u.role === 'PUSBANG' ? (
                          <span className="inline-flex items-center rounded-full bg-violet-50 text-violet-700 px-2 py-1 text-[11px] font-bold ring-1 ring-violet-200">{matraLabel(u.pusbangMatra || u.matra) || '—'}</span>
                        ) : u.role === 'SUPER_ADMIN' ? (
                          <span className="text-[11px] text-slate-400">—</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-sky-50 text-sky-700 px-2 py-1 text-[11px] font-bold ring-1 ring-sky-200 max-w-full truncate" title={`${u.uptCode} — ${u.uptName}`}>
                            {u.uptCode || '—'}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-3 text-center text-[11px] text-slate-600 whitespace-nowrap font-medium">{fmtDate(u.createdAt)}</td>
                      <td className="px-2 py-3 text-center"><ActiveBadge active={u.isActive} /></td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-1 flex-nowrap">
                          <button className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all duration-150 whitespace-nowrap" title="Edit akun" onClick={() => openEditor(u)}>
                            <IconEdit className="h-3 w-3" /> Edit
                          </button>
                          <button className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all duration-150 whitespace-nowrap" title="Reset password" onClick={() => { setResetUser(u); setResetPass('') }}>
                            <IconKey className="h-3 w-3" /> Pass
                          </button>
                          <button className={`inline-flex items-center justify-center rounded-lg px-1.5 py-1 text-[11px] font-bold whitespace-nowrap transition-all duration-150 ring-1 ${u.isActive ? 'bg-white text-amber-700 ring-amber-200 hover:bg-amber-600 hover:text-white hover:ring-amber-600' : 'bg-emerald-600 text-white ring-emerald-600 hover:bg-emerald-700'}`} onClick={() => toggleActive(u)} title={u.isActive ? 'Nonaktifkan' : 'Aktifkan'}>
                            {u.isActive ? 'Off' : 'On'}
                          </button>
                          {!u.isActive && (
                            <button className="inline-flex items-center justify-center h-[26px] w-[26px] rounded-lg bg-red-50 text-red-600 ring-1 ring-red-200 hover:bg-red-600 hover:text-white hover:ring-red-600 transition-colors duration-150 shrink-0" title="Hapus akun" onClick={() => setDeleteUser(u)}>
                              <IconTrash className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="lg:hidden divide-y divide-slate-100">
              {filtered.map((u) => (
                <div key={u.id} className="p-4 sm:p-5 space-y-3 hover:bg-slate-50/40 transition-colors duration-200">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-900 text-sm leading-snug">{u.name}</p>
                      <p className="text-xs text-slate-500 break-all mt-0.5">{u.email}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${roleBadgeCls(u.role)}`}>{roleLabel(u.role)}</span>
                        {u.role === 'PUSBANG' ? <span className="inline-flex items-center rounded-full bg-violet-50 text-violet-700 px-2 py-0.5 text-[11px] font-bold ring-1 ring-violet-200">{matraLabel(u.pusbangMatra)}</span> : u.uptCode ? <span className="inline-flex items-center rounded-full bg-sky-50 text-sky-700 px-2 py-0.5 text-[11px] font-bold ring-1 ring-sky-200">{u.uptCode}</span> : null}
                      </div>
                    </div>
                    <ActiveBadge active={u.isActive} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium">{fmtDate(u.createdAt)}</span>
                    <PhoneCell user={u} />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <button className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-colors" onClick={() => openEditor(u)}>
                      <IconEdit className="h-3.5 w-3.5" /> Edit
                    </button>
                    <button className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-colors" onClick={() => { setResetUser(u); setResetPass('') }}>
                      <IconKey className="h-3.5 w-3.5" /> Password
                    </button>
                    <button className={`inline-flex items-center justify-center rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ring-1 ${u.isActive ? 'bg-white text-amber-700 ring-amber-200 hover:bg-amber-600 hover:text-white' : 'bg-emerald-600 text-white ring-emerald-600 hover:bg-emerald-700'}`} onClick={() => toggleActive(u)}>
                      {u.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                    {!u.isActive && (
                      <button className="inline-flex items-center gap-1 rounded-xl bg-red-50 text-red-600 ring-1 ring-red-200 px-3 py-1.5 text-xs font-bold hover:bg-red-600 hover:text-white hover:ring-red-600 transition-colors" onClick={() => setDeleteUser(u)}>
                        <IconTrash className="h-3.5 w-3.5" /> Hapus
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-2.5 bg-slate-50/50 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
            <span className="text-slate-500 font-medium">Menampilkan <strong className="text-slate-900">{filtered.length}</strong> dari {users.length} akun</span>
            <span className="text-slate-400 hidden sm:inline">4 level: Super Admin · Pusbang · Pimpinan · Admin UPT</span>
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Buat Akun Pengguna" subtitle="Pilih role dan lengkapi data akun.">
        <form onSubmit={handleCreate} className="space-y-4">
          {formError && <Alert type="error">{formError}</Alert>}
          <FormField label="Role" required>
            <select className="form-input !rounded-xl" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value, uptId: '', pusbangMatra: 'darat' }))}>
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Nama Lengkap" required>
            <input className="form-input !rounded-xl" placeholder="Nama penanggung jawab" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </FormField>
          <FormField label="Email" required>
            <input type="email" className="form-input !rounded-xl" placeholder="user@dephub.go.id" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </FormField>
          <FormField label="Nomor HP / WhatsApp" hint="Contoh: 081234567890">
            <input type="tel" inputMode="tel" className="form-input !rounded-xl" placeholder="081234567890" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/[^\d+\- ]/g, '') }))} />
          </FormField>
          <FormField label="Password" required hint="Password terlihat — klik Tutup untuk menyembunyikan">
            <PasswordInput id="user-password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Buat password sementara" autoComplete="new-password" showLabel defaultVisible />
          </FormField>
          {['UPT_ADMIN', 'PIMPINAN_UPT'].includes(form.role) && (
            <FormField label="UPT" required hint="Satu UPT boleh memiliki beberapa admin (admin 1, 2, 3, ...)">
              <select className="form-input !rounded-xl" value={form.uptId} onChange={(e) => setForm((f) => ({ ...f, uptId: e.target.value }))}>
                <option value="">— Pilih UPT —</option>
                {availableUptOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code} — {o.name}{o.isActive ? '' : ' (Nonaktif)'}{(adminCountByUpt.get(o.id) || 0) > 0 ? ` (${adminCountByUpt.get(o.id)} ${form.role === 'PIMPINAN_UPT' ? 'pimpinan' : 'admin'} sudah ada)` : ''}
                  </option>
                ))}
              </select>
            </FormField>
          )}
          {form.role === 'PUSBANG' && (
            <FormField label="Matra Pusbang" required hint="Pusbang hanya melihat UPT sesuai matra">
              <select className="form-input !rounded-xl" value={form.pusbangMatra} onChange={(e) => setForm((f) => ({ ...f, pusbangMatra: e.target.value }))}>
                <option value="darat">Darat</option>
                <option value="laut">Laut</option>
                <option value="udara">Udara</option>
              </select>
            </FormField>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary !rounded-xl" onClick={() => setModalOpen(false)}>Batal</button>
            <button type="submit" className="btn-primary min-w-[140px] !rounded-xl" disabled={saving}>
              {saving ? <><Spinner /> Membuat...</> : 'Buat Akun'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!resetUser} onClose={() => setResetUser(null)} title="Reset Password" subtitle={resetUser ? `${resetUser.name} (${resetUser.email})` : ''}>
        <form onSubmit={handleReset} className="space-y-4">
          <FormField label="Password Baru" required hint="Password terlihat — sampaikan ke user secara aman">
            <PasswordInput id="reset-password" value={resetPass} onChange={(e) => setResetPass(e.target.value)} placeholder="Password baru" autoComplete="new-password" showLabel defaultVisible />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary !rounded-xl" onClick={() => setResetUser(null)}>Batal</button>
            <button type="submit" className="btn-primary min-w-[140px] !rounded-xl" disabled={resetting || resetPass.length < 6}>
              {resetting ? <><Spinner /> Memproses...</> : 'Reset Password'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editUser} onClose={() => setEditUser(null)} title="Edit Akun User" subtitle={editUser ? `${editUser.name} (${editUser.email})` : ''}>
        <form onSubmit={handleEditSave} className="space-y-4">
          {editError && <Alert type="error">{editError}</Alert>}
          <FormField label="Nama Lengkap" required>
            <input className="form-input !rounded-xl" placeholder="Nama penanggung jawab" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
          </FormField>
          <FormField label="Email" required>
            <input type="email" className="form-input !rounded-xl" placeholder="user@dephub.go.id" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
          </FormField>
          <FormField label="Nomor HP / WhatsApp" hint="Format: 081234567890 atau +6281234567890">
            <input type="tel" inputMode="tel" className="form-input !rounded-xl" placeholder="081234567890" value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value.replace(/[^\d+\- ]/g, '') }))} />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary !rounded-xl" onClick={() => setEditUser(null)}>Batal</button>
            <button type="submit" className="btn-primary min-w-[140px] !rounded-xl" disabled={editSaving}>
              {editSaving ? <><Spinner /> Menyimpan...</> : 'Simpan Perubahan'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deleteUser} onClose={() => setDeleteUser(null)} title="Hapus Akun Pengguna" subtitle={deleteUser ? `${deleteUser.name} (${deleteUser.email})` : ''}>
        <div className="space-y-4">
          <Alert type="warning">
            Akun <strong>{deleteUser?.name}</strong> ({deleteUser?.email}) akan dihapus permanen beserta akses login-nya.
          </Alert>
          <p className="text-sm text-navy-600">Tindakan ini tidak dapat dibatalkan.</p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary !rounded-xl" onClick={() => setDeleteUser(null)}>Batal</button>
            <button type="button" className="btn-danger min-w-[140px] !rounded-xl" onClick={handleDelete} disabled={deleting}>
              {deleting ? <><Spinner /> Menghapus...</> : 'Hapus Akun'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function PhoneCell({ user, compact = false }) {
  if (!user.phone) {
    return <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-400 px-2 py-1 text-[11px] font-medium ring-1 ring-slate-200">—</span>
  }
  return (
    <a
      href={waLink(user.phone)}
      target="_blank"
      rel="noopener noreferrer"
      className={compact
        ? 'inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 hover:ring-emerald-300 transition-all duration-150 whitespace-nowrap'
        : 'inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 hover:ring-emerald-300 transition-all duration-200 whitespace-nowrap'}
      title={`Chat WhatsApp ${fmtPhone(user.phone)}`}
    >
      <IconWhatsApp className="h-3 w-3 shrink-0" /> {fmtPhone(user.phone)}
    </a>
  )
}
