import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import logoBpsdm from '../assets/logo-bpsdm.png'

function FullScreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="flex flex-col items-center gap-4">
        <div className="h-14 w-14 rounded-2xl bg-white flex items-center justify-center shadow-card overflow-hidden p-1">
           <img src={logoBpsdm} alt="Logo BPSDMP" className="h-full w-full object-contain" onError={(e) => e.target.style.display = 'none'} />
        </div>
        <div className="flex items-center gap-2 text-navy-500 text-sm font-medium">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Memuat sesi Anda...
        </div>
      </div>
    </div>
  )
}

function homeFor(role) {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return '/admin'
  if (role === 'PUSBANG') return '/pusbang'
  if (role === 'PIMPINAN_UPT') return '/pimpinan'
  return '/upt'
}

/** Wajib login; redirect ke /login jika belum. */
export function ProtectedRoute() {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenLoader />
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

/** Batasi per role; redirect ke dashboard sesuai role bila tidak cocok. */
export function RoleRoute({ allow }) {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenLoader />
  if (!user) return <Navigate to="/login" replace />
  if (!allow.includes(user.role)) {
    return <Navigate to={homeFor(user.role)} replace />
  }
  return <Outlet />
}
