import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api, { apiError } from '../lib/api'
import { Modal, Alert, Spinner } from './ui'
import { IconUsers, IconEdit, IconKey, IconLogout, IconCheck } from './icons'
import { useToast } from './Toast'

function initialsOf(name) {
  return (name || 'U').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
}

function roleLabelOf(user) {
  if (user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') return 'Super Admin BPSDMP'
  if (user?.role === 'PUSBANG') return `Admin Pusbang ${user?.pusbangMatra || ''}`.trim()
  if (user?.role === 'PIMPINAN_UPT') return `Pimpinan ${user?.upt?.name || 'UPT'}`
  if (user?.role === 'UPT_ADMIN' || user?.role === 'UPT') return user?.upt?.name || 'Admin UPT'
  return user?.role || 'User'
}

/** Menu profil di navbar atas (semua role): lihat profil + ubah email/no HP/password. */
export default function ProfileMenu() {
  const { user, logout, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [tab, setTab] = useState('profil') // 'profil' | 'data' | 'password'
  const ref = useRef(null)

  // Form ubah data
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState(null)

  // Form ganti password
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState(null)

  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open ])

  const openModal = (t = 'profil') => {
    setTab(t)
    setName(user?.name || '')
    setEmail(user?.email || '')
    setPhone(user?.phone || '')
    setProfileMsg(null)
    setPasswordMsg(null)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setOpen(false)
    setModalOpen(true)
  }

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    setProfileMsg(null)
    if (!name.trim()) { setProfileMsg({ type: 'error', text: 'Nama tidak boleh kosong.' }); return }
    if (!email.trim()) { setProfileMsg({ type: 'error', text: 'Email tidak boleh kosong.' }); return }
    setSavingProfile(true)
    try {
      const { data } = await api.patch('/auth/profile', {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
      })
      toast.success('Profil diperbarui', data.message)
      setProfileMsg({ type: 'success', text: data.message })
      await refreshProfile()
    } catch (err) {
      setProfileMsg({ type: 'error', text: apiError(err) })
    } finally {
      setSavingProfile(false)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPasswordMsg(null)
    if (!currentPassword) { setPasswordMsg({ type: 'error', text: 'Password lama wajib diisi.' }); return }
    if (newPassword.length < 6) { setPasswordMsg({ type: 'error', text: 'Password baru minimal 6 karakter.' }); return }
    if (newPassword !== confirmPassword) { setPasswordMsg({ type: 'error', text: 'Konfirmasi password tidak sama.' }); return }
    setSavingPassword(true)
    try {
      const { data } = await api.post('/auth/change-password', { currentPassword, newPassword })
      toast.success('Password diganti', data.message)
      setPasswordMsg({ type: 'success', text: data.message })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPasswordMsg({ type: 'error', text: apiError(err) })
    } finally {
      setSavingPassword(false)
    }
  }

  const handleLogout = async () => {
    setOpen(false)
    await logout()
    toast.success('Logout berhasil', 'Sampai jumpa kembali.')
    navigate('/login')
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex h-10 w-10 items-center justify-center rounded-xl text-xs font-extrabold transition-all duration-200 ${
          open
            ? 'bg-white/20 text-white shadow-inner ring-2 ring-white/30'
            : 'bg-gradient-to-br from-navy-400 to-navy-600 text-white ring-2 ring-white/20 hover:ring-white/40 shadow-md'
        }`}
        title={`Profil saya — ${user?.name || ''}`}
        aria-label="Menu profil saya"
      >
        {initialsOf(user?.name)}
      </button>

      {open && (
        <div className="absolute right-0 mt-2.5 w-64 rounded-2xl bg-white shadow-2xl ring-1 ring-black/10 border border-slate-100 z-50 overflow-hidden animate-fadeUp">
          <div className="px-4 py-3.5 bg-gradient-to-r from-navy-950 to-navy-900 text-white">
            <p className="text-sm font-black truncate">{user?.name}</p>
            <p className="text-[11px] text-navy-200 truncate">{user?.email}</p>
            <span className="mt-1.5 inline-block rounded-full bg-gold-500/20 text-gold-300 border border-gold-500/30 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">
              {roleLabelOf(user)}
            </span>
          </div>
          <div className="p-2">
            <button
              onClick={() => openModal('profil')}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <IconUsers className="h-4 w-4 text-navy-600" /> Lihat Profil Saya
            </button>
            <button
              onClick={() => openModal('data')}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <IconEdit className="h-4 w-4 text-navy-600" /> Ubah Email / No. HP
            </button>
            <button
              onClick={() => openModal('password')}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <IconKey className="h-4 w-4 text-navy-600" /> Ganti Password
            </button>
            <div className="my-1 border-t border-slate-100" />
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors"
            >
              <IconLogout className="h-4 w-4" /> Keluar
            </button>
          </div>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Profil Saya" subtitle={roleLabelOf(user)}>
        <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
          {[
            { id: 'profil', label: 'Profil' },
            { id: 'data', label: 'Ubah Data' },
            { id: 'password', label: 'Password' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTab(t.id); setProfileMsg(null); setPasswordMsg(null) }}
              className={`rounded-lg px-2 py-2 text-xs font-extrabold transition-all ${tab === t.id ? 'bg-navy-900 text-white shadow' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'profil' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-navy-950 to-navy-900 p-4 text-white">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-navy-400 to-navy-600 text-sm font-black ring-2 ring-white/25 shadow">
                {initialsOf(user?.name)}
              </div>
              <div className="min-w-0">
                <p className="font-black truncate">{user?.name}</p>
                <p className="text-xs text-navy-200 truncate">{user?.email}</p>
              </div>
            </div>
            <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-200 text-xs">
              {[
                ['Nama', user?.name || '-'],
                ['Email', user?.email || '-'],
                ['No. HP', user?.phone || '-'],
                ['Role', roleLabelOf(user)],
                ['UPT', user?.upt?.name ? `${user.upt.name} (${user.upt.code || ''})` : '-'],
                ['Matra', user?.upt?.matra || user?.pusbangMatra || '-'],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <dt className="font-bold text-slate-500">{k}</dt>
                  <dd className="font-semibold text-slate-900 text-right truncate">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-[11px] text-slate-400">Perubahan data profil & password tercatat di Log Aktivitas Admin.</p>
          </div>
        )}

        {tab === 'data' && (
          <form onSubmit={handleSaveProfile} className="space-y-3">
            {profileMsg && <Alert type={profileMsg.type}>{profileMsg.text}</Alert>}
            <div>
              <label className="form-label">Nama Lengkap</label>
              <input className="form-input !rounded-xl" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama lengkap" />
            </div>
            <div>
              <label className="form-label">Email</label>
              <input type="email" className="form-input !rounded-xl" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@contoh.go.id" />
            </div>
            <div>
              <label className="form-label">No. HP / WhatsApp</label>
              <input className="form-input !rounded-xl" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ''))} placeholder="08xxxxxxxxxx" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="btn-secondary !rounded-xl" onClick={() => setModalOpen(false)}>Batal</button>
              <button type="submit" className="btn-primary !rounded-xl min-w-[130px]" disabled={savingProfile}>
                {savingProfile ? <><Spinner /> Menyimpan...</> : <><IconCheck className="h-4 w-4" /> Simpan</>}
              </button>
            </div>
          </form>
        )}

        {tab === 'password' && (
          <form onSubmit={handleChangePassword} className="space-y-3">
            {passwordMsg && <Alert type={passwordMsg.type}>{passwordMsg.text}</Alert>}
            <div>
              <label className="form-label">Password Lama <span className="text-red-500">*</span></label>
              <input type="password" className="form-input !rounded-xl" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
            </div>
            <div>
              <label className="form-label">Password Baru (min. 6 karakter) <span className="text-red-500">*</span></label>
              <input type="password" className="form-input !rounded-xl" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
            </div>
            <div>
              <label className="form-label">Konfirmasi Password Baru <span className="text-red-500">*</span></label>
              <input type="password" className="form-input !rounded-xl" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="btn-secondary !rounded-xl" onClick={() => setModalOpen(false)}>Batal</button>
              <button type="submit" className="btn-primary !rounded-xl min-w-[130px]" disabled={savingPassword}>
                {savingPassword ? <><Spinner /> Menyimpan...</> : <><IconKey className="h-4 w-4" /> Ganti</>}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
