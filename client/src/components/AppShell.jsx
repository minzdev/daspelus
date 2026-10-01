import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { useAuth } from '../context/AuthContext'
import {
  IconDashboard, IconBuilding, IconTarget, IconUsers, IconChart, IconLayers,
  IconInput, IconHistory, IconLogout, IconMenu, IconX, IconFileText, IconCheck,
  IconLock, IconUnlock, IconEdit, IconGraduation, IconPeople, IconCheckSquare,
  IconChevronDown,
} from './icons'
import { ConfirmDialog } from './ui'
import { useToast } from './Toast'
import NotificationDropdown from './NotificationDropdown'
import ProfileMenu from './ProfileMenu'
import logoBpsdm from '../assets/logo-bpsdm.png'

const ADMIN_NAV = [
  {
    section: 'Utama',
    items: [
      { to: '/admin', label: 'Dashboard', icon: IconDashboard, end: true },
      { to: '/admin/persetujuan', label: 'Pusat Persetujuan', icon: IconCheckSquare },
      { to: '/admin/upt', label: 'Data UPT', icon: IconBuilding },
    ],
  },
  {
    section: 'Perjanjian Kinerja (PK)',
    items: [
      { to: '/admin/programs', label: 'Master Program', icon: IconLayers },
      { to: '/admin/target-pk', label: 'Target PK (Pantau)', icon: IconTarget },
      { to: '/admin/monitoring', label: 'Monitoring Realisasi', icon: IconChart },
    ],
  },
  {
    section: 'Laporan Realisasi',
    items: [
      { to: '/admin/laporan', label: 'Laporan Realisasi', icon: IconFileText, end: true },
      { to: '/admin/riwayat-pelaporan', label: 'Riwayat Pelaporan', icon: IconHistory },
      { to: '/admin/program-detail', label: 'Detail Data Program', icon: IconLayers },
    ],
  },
  {
    section: 'Data Penyerapan Lulusan',
    items: [
      { to: '/admin/prodi', label: 'Program Studi', icon: IconLayers },
      { to: '/admin/penyerapan', label: 'Data Penyerapan Lulusan', icon: IconGraduation },
    ],
  },
  {
    section: 'Sistem & Layanan',
    items: [
      { to: '/admin/pengguna', label: 'Manajemen Pengguna', icon: IconUsers },
      { to: '/admin/aktivitas', label: 'Log Aktivitas', icon: IconLock },
    ],
  },
]

const PUSBANG_NAV = [
  {
    section: 'Menu Utama',
    items: [
      { to: '/pusbang', label: 'Dashboard Matra', icon: IconDashboard, end: true },
      { to: '/pusbang/monitoring', label: 'Monitoring Realisasi', icon: IconChart },
      { to: '/pusbang/laporan', label: 'Laporan Capaian Matra', icon: IconFileText },
    ],
  },
  {
    section: 'Layanan Buka Kunci',
    items: [
      { to: '/pusbang/unlock', label: 'Persetujuan Unlock', icon: IconUnlock },
    ],
  },
  {
    section: 'Penyerapan Lulusan',
    items: [
      { to: '/pusbang/penyerapan', label: 'Monitoring Penyerapan', icon: IconGraduation },
      { to: '/pusbang/prodi', label: 'Program Studi Matra', icon: IconLayers },
    ],
  },
]

const PIMPINAN_NAV = [
  {
    section: 'Utama',
    items: [
      { to: '/pimpinan', label: 'Dashboard', icon: IconDashboard, end: true },
    ],
  },
  {
    section: 'Persetujuan & Verifikasi',
    items: [
      { to: '/pimpinan/persetujuan', label: 'Pusat Persetujuan', icon: IconCheckSquare },
    ],
  },
  {
    section: 'Laporan & Riwayat',
    items: [
      { to: '/pimpinan/laporan', label: 'Laporan Realisasi PK', icon: IconChart },
      { to: '/pimpinan/penyerapan/laporan', label: 'Laporan Penyerapan Bulanan', icon: IconFileText },
      { to: '/pimpinan/riwayat', label: 'Riwayat UPT', icon: IconHistory },
    ],
  },
]

const UPT_NAV = [
  {
    section: 'Utama',
    items: [
      { to: '/upt', label: 'Dashboard Capaian', icon: IconDashboard, end: true },
    ],
  },
  {
    section: 'Data Peserta & Lulusan',
    items: [
      { to: '/upt/diklat', label: 'Input Diklat', icon: IconLayers },
      { to: '/upt/target-pk', label: 'Input Target PK', icon: IconTarget },
      { to: '/upt/input', label: 'Input Realisasi', icon: IconInput },
      { to: '/upt/laporan', label: 'Laporan Realisasi', icon: IconFileText },
      { to: '/upt/unlock-capaian', label: 'Unlock Capaian', icon: IconUnlock },
      { to: '/upt/perubahan-target', label: 'Perubahan Target PK', icon: IconEdit },
    ],
  },
  {
    section: 'Data Penyerapan Lulusan',
    items: [
      { to: '/upt/penyerapan/taruna', label: 'Data Taruna', icon: IconPeople },
      { to: '/upt/penyerapan/input', label: 'Input Penyerapan', icon: IconGraduation },
      { to: '/upt/penyerapan/laporan', label: 'Laporan Penyerapan (Bulanan)', icon: IconFileText },
    ],
  },
  {
    section: 'Riwayat',
    items: [
      { to: '/upt/riwayat', label: 'Riwayat Input', icon: IconHistory },
    ],
  },
]

function BrandBlock({ collapsed }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-4 border-b border-white/10 ${collapsed ? 'justify-center px-2' : ''}`}>
      <div
        className="h-10 w-10 shrink-0 rounded-xl bg-white flex items-center justify-center shadow-md overflow-hidden p-1"
        style={{ width: '40px', height: '40px' }}
      >
        <img
          src={logoBpsdm}
          alt="Logo BPSDMP"
          className="h-full w-full object-contain max-h-7 max-w-7"
          onError={(e) => (e.target.style.display = 'none')}
        />
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <p className="text-[14px] font-extrabold text-white leading-tight tracking-tight">DASPESLUS</p>
          <p className="text-[10px] font-semibold text-navy-300 leading-snug mt-0.5">
            Data Peserta &amp; Lulusan BPSDMP
          </p>
        </div>
      )}
    </div>
  )
}

function NavLinks({ nav, onNavigate, collapsed }) {
  return (
    <nav className={`sidebar-scroll flex-1 overflow-y-auto py-2 ${collapsed ? 'px-2' : 'px-2.5'}`}>
      {nav.map((group) => (
        <div key={group.section}>
          {!collapsed && <p className="sidebar-section">{group.section}</p>}
          <div className="space-y-1">
            {group.items.map((item) => {
              const Ic = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    clsx('sidebar-link', collapsed && 'justify-center !px-0', isActive && 'sidebar-link-active')
                  }
                >
                  <Ic className="h-[18px] w-[18px] shrink-0" />
                  {!collapsed && item.label}
                </NavLink>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

function UserFooter({ collapsed }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const initials = (user?.name || 'U')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const doLogout = async () => {
    setLoggingOut(true)
    try {
      await logout()
      toast.success('Logout berhasil', 'Sampai jumpa kembali.')
      navigate('/login')
    } finally {
      setLoggingOut(false)
      setLogoutOpen(false)
    }
  }

  const roleLabel = (() => {
    if (user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') return 'Super Admin BPSDMP'
    if (user?.role === 'PUSBANG') return `Admin Pusbang ${user?.pusbangMatra || ''}`.trim()
    if (user?.role === 'PIMPINAN_UPT') return `Pimpinan ${user?.upt?.name || user?.uptId || 'UPT'}`
    if (user?.role === 'UPT_ADMIN' || user?.role === 'UPT') return user?.upt?.name || 'Admin UPT'
    return user?.role || 'User'
  })()
  return (
    <div className="border-t border-white/10 p-3.5">
      <div className={`flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5 ring-1 ring-white/10 ${collapsed ? 'flex-col !gap-2 !px-1.5 !py-3' : ''}`}>
        <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-navy-400 to-navy-600 text-white flex items-center justify-center text-xs font-extrabold ring-2 ring-white/20 shadow-md" title={`${user?.name || 'User'} — ${roleLabel}`}>
          {initials}
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-white truncate">{user?.name}</p>
            <p className="text-[10px] text-navy-300 truncate" title={roleLabel}>
              {roleLabel}
            </p>
          </div>
        )}
        <button
          onClick={() => setLogoutOpen(true)}
          className="shrink-0 rounded-lg p-2 text-navy-300 hover:bg-white/10 hover:text-white transition-colors"
          title="Keluar"
        >
          <IconLogout className="h-4.5 w-4.5" />
        </button>
      </div>
      {!collapsed && (
        <p className="text-center text-[10px] text-navy-500 mt-3">
          © {new Date().getFullYear()} BPSDMP Kementerian Perhubungan
        </p>
      )}

      <ConfirmDialog
        open={logoutOpen}
        onCancel={() => setLogoutOpen(false)}
        onConfirm={doLogout}
        title="Konfirmasi Keluar"
        body="Anda yakin ingin keluar dari aplikasi? Perubahan yang belum disimpan akan hilang."
        confirmLabel="Ya, Keluar"
        cancelLabel="Batal"
        confirmTone="danger"
        loading={loggingOut}
        icon={<IconLogout className="h-5 w-5" />}
      />
    </div>
  )
}

export default function AppShell() {
  const { user } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('daspeslus_sidebar') === 'collapsed'
    } catch {
      return false
    }
  })
  const toggleSidebar = () => {
    setCollapsed((prev) => {
      try {
        localStorage.setItem('daspeslus_sidebar', prev ? 'expanded' : 'collapsed')
      } catch { /* abaikan */ }
      return !prev
    })
  }
  const nav = (() => {
    if (user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') return ADMIN_NAV
    if (user?.role === 'PUSBANG') return PUSBANG_NAV
    if (user?.role === 'PIMPINAN_UPT') return PIMPINAN_NAV
    return UPT_NAV
  })()
  const roleBadge = (() => {
    if (user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') return 'SUPER ADMIN'
    if (user?.role === 'PUSBANG') return `PUSBANG ${String(user?.pusbangMatra || '').toUpperCase()}`
    if (user?.role === 'PIMPINAN_UPT') return 'PIMPINAN'
    return 'UPT'
  })()

  return (
    <div className="min-h-screen flex">
      {/* Sidebar desktop */}
      <aside className={`hidden lg:flex shrink-0 flex-col bg-navy-950 shadow-sidebar fixed inset-y-0 left-0 z-40 transition-all duration-300 ${collapsed ? 'w-[76px]' : 'w-[264px]'}`}>
        <BrandBlock collapsed={collapsed} />
        <NavLinks nav={nav} collapsed={collapsed} />
        <UserFooter collapsed={collapsed} />
        {/* Tombol panah hide/show di tepi sidebar */}
        <button
          type="button"
          onClick={toggleSidebar}
          title={collapsed ? 'Tampilkan sidebar' : 'Sembunyikan sidebar'}
          aria-label={collapsed ? 'Tampilkan sidebar' : 'Sembunyikan sidebar'}
          className="absolute -right-3 top-1/2 -translate-y-1/2 z-50 flex h-7 w-7 items-center justify-center rounded-full bg-white text-navy-900 shadow-lg ring-1 ring-slate-200 hover:bg-navy-900 hover:text-white transition-colors"
        >
          <IconChevronDown className={`h-4 w-4 transition-transform duration-300 ${collapsed ? '-rotate-90' : 'rotate-90'}`} />
        </button>
      </aside>

      {/* Sidebar mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <aside className="w-[280px] flex flex-col bg-navy-950 animate-fadeIn">
            <div className="flex items-center justify-between pr-2">
              <div className="flex-1"><BrandBlock /></div>
              <button
                className="rounded-lg p-2 text-navy-300 hover:text-white"
                onClick={() => setMobileOpen(false)}
                aria-label="Tutup menu"
              >
                <IconX className="h-5 w-5" />
              </button>
            </div>
            <NavLinks nav={nav} onNavigate={() => setMobileOpen(false)} />
            <UserFooter />
          </aside>
          <div className="flex-1 bg-navy-950/50 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Konten */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${collapsed ? 'lg:ml-[76px]' : 'lg:ml-[264px]'}`}>
        {/* Top Header Universal (Desktop & Mobile) */}
        <header className="sticky top-0 z-30 flex items-center justify-between bg-navy-950 px-4 sm:px-6 py-2.5 shadow-md border-b border-white/10 backdrop-blur-md">
          {/* Sisi Kiri: Toggle Menu (Mobile) & Branding Ringkas */}
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden rounded-lg p-1.5 text-navy-200 hover:bg-white/10"
              onClick={() => setMobileOpen(true)}
              aria-label="Buka menu"
            >
              <IconMenu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-white tracking-wider">DASPESLUS</span>
              <span className="text-white/20">|</span>
              <span className="text-[11px] font-semibold text-navy-200 truncate max-w-[160px] sm:max-w-xs md:max-w-md">
                {(() => {
                  if (user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') return 'BPSDMP Pusat'
                  if (user?.role === 'PUSBANG') return `Pusbang SDM Perhubungan ${user?.pusbangMatra ? user.pusbangMatra.toUpperCase() : ''}`
                  if (user?.role === 'PIMPINAN_UPT') return `Pimpinan ${user?.upt?.name || user?.uptId || 'UPT'}`
                  return user?.upt?.name || 'Unit Pelaksana Teknis'
                })()}
              </span>
            </div>
          </div>

          {/* Sisi Kanan: Tanggal, Role Badge, & Notification Dropdown */}
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 text-[11px] text-navy-300 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                {new Intl.DateTimeFormat('id-ID', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                }).format(new Date())}
              </span>
            </div>

            <span className="text-[10px] font-extrabold text-gold-300 bg-gold-500/15 ring-1 ring-gold-500/30 rounded-full px-2.5 py-0.5 tracking-wide uppercase">
              {roleBadge}
            </span>

            {/* Notification Bell Dropdown */}
            <NotificationDropdown />

            {/* Menu Profil Saya */}
            <ProfileMenu />
          </div>
        </header>

        <main className="flex-1 p-5 sm:p-7 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
