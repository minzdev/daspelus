import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { NotificationProvider } from './context/NotificationContext'
import { ProtectedRoute, RoleRoute } from './routes/guards'
import { ToastProvider } from './components/Toast'
import AppShell from './components/AppShell'

import LoginPage from './pages/login/LoginPage'
import AdminDashboardPage from './pages/admin/AdminDashboardPage'
import DataUptPage from './pages/admin/DataUptPage'
import MasterProgramPage from './pages/admin/MasterProgramPage'
import TargetPkPage from './pages/admin/TargetPkPage'
import MonitoringPage from './pages/admin/MonitoringPage'
import ReportPage from './pages/admin/ReportPage'
import DetailMatraPage from './pages/admin/DetailMatraPage'
import ProgramDetailPage from './pages/admin/ProgramDetailPage'
import PenggunaPage from './pages/admin/PenggunaPage'
import UptDashboardPage from './pages/upt/UptDashboardPage'
import InputRealisasiPage from './pages/upt/InputRealisasiPage'
import RiwayatPage from './pages/upt/RiwayatPage'
import UptLaporanPage from './pages/upt/UptLaporanPage'
import TargetPkUptPage from './pages/upt/TargetPkUptPage'
import UptDiklatPage from './pages/upt/UptDiklatPage'
import UnlockPage from './pages/upt/UnlockPage'
import UnlockTargetPkPage from './pages/upt/UnlockTargetPkPage'
import AdminUnlockInboxPage from './pages/admin/UnlockInboxPage'
import AdminSubmissionInboxPage from './pages/admin/AdminSubmissionInboxPage'
import AdminHistoryPage from './pages/admin/AdminHistoryPage'
import PimpinanInboxPage from './pages/pimpinan/InboxPage'
import PimpinanUnlockInboxPage from './pages/pimpinan/UnlockInboxPage'
import PimpinanTargetInboxPage from './pages/pimpinan/TargetInboxPage'
import PimpinanDashboardPage from './pages/pimpinan/DashboardPage'
import PimpinanLaporanPage from './pages/pimpinan/LaporanPage'
import PusbangInboxPage from './pages/pusbang/InboxPage'
import PusbangUnlockInboxPage from './pages/pusbang/UnlockInboxPage'
import PusbangDashboardPage from './pages/pusbang/DashboardPage'
import PusbangTargetInboxPage from './pages/pusbang/TargetInboxPage'
import AdminTargetInboxPage from './pages/admin/AdminTargetInboxPage'
import UptAbsorptionInputPage from './pages/upt/UptAbsorptionInputPage'
import UptAbsorptionReportPage from './pages/upt/UptAbsorptionReportPage'
import UptTarunaPage from './pages/upt/UptTarunaPage'
import PimpinanAbsorptionPage from './pages/pimpinan/PimpinanAbsorptionPage'
import PimpinanTarunaInboxPage from './pages/pimpinan/PimpinanTarunaInboxPage'
import AdminAbsorptionPage from './pages/admin/AdminAbsorptionPage'
import AdminProdiPage from './pages/admin/AdminProdiPage'
import AdminTarunaInboxPage from './pages/admin/AdminTarunaInboxPage'
import AdminApprovalHubPage from './pages/admin/AdminApprovalHubPage'
import AdminActivityLogPage from './pages/admin/AdminActivityLogPage'
import PimpinanApprovalHubPage from './pages/pimpinan/PimpinanApprovalHubPage'

/** Redirect "/" ke dashboard sesuai role user. */
function RootRedirect() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  const r = user.role
  if (r === 'SUPER_ADMIN' || r === 'ADMIN') return <Navigate to="/admin" replace />
  if (r === 'PUSBANG') return <Navigate to="/pusbang" replace />
  if (r === 'PIMPINAN_UPT') return <Navigate to="/pimpinan" replace />
  return <Navigate to="/upt" replace />
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <NotificationProvider>
          <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<RootRedirect />} />
          </Route>

          {/* Area SUPER ADMIN BPSDMP */}
          <Route element={<RoleRoute allow={['SUPER_ADMIN', 'ADMIN']} />}>
            <Route element={<AppShell />}>
              <Route path="/admin" element={<AdminDashboardPage />} />
              <Route path="/admin/persetujuan" element={<AdminApprovalHubPage />} />
              <Route path="/admin/upt" element={<DataUptPage />} />
              <Route path="/admin/programs" element={<MasterProgramPage />} />
              <Route path="/admin/target-pk" element={<TargetPkPage />} />
              <Route path="/admin/inbox-target" element={<Navigate to="/admin/persetujuan?category=target" replace />} />
              <Route path="/admin/monitoring" element={<MonitoringPage />} />
              <Route path="/admin/laporan" element={<ReportPage />} />
              <Route path="/admin/laporan/detail-matra" element={<DetailMatraPage />} />
              <Route path="/admin/program-detail" element={<ProgramDetailPage />} />
              <Route path="/admin/prodi" element={<AdminProdiPage />} />
              <Route path="/admin/taruna-inbox" element={<Navigate to="/admin/persetujuan?category=taruna" replace />} />
              <Route path="/admin/penyerapan" element={<AdminAbsorptionPage />} />
              <Route path="/admin/pengguna" element={<PenggunaPage />} />
              <Route path="/admin/aktivitas" element={<AdminActivityLogPage />} />
              <Route path="/admin/inbox-laporan" element={<Navigate to="/admin/persetujuan?category=realisasi" replace />} />
              <Route path="/admin/riwayat-pelaporan" element={<AdminHistoryPage />} />
              <Route path="/admin/inbox-unlock" element={<Navigate to="/admin/persetujuan?category=unlock" replace />} />
            </Route>
          </Route>

          {/* Area PUSBANG */}
          <Route element={<RoleRoute allow={['PUSBANG']} />}>
            <Route element={<AppShell />}>
             <Route path="/pusbang" element={<PusbangDashboardPage />} />
             <Route path="/pusbang/monitoring" element={<MonitoringPage />} />
             <Route path="/pusbang/laporan" element={<ReportPage />} />
             <Route path="/pusbang/prodi" element={<AdminProdiPage />} />
             <Route path="/pusbang/taruna-inbox" element={<AdminTarunaInboxPage />} />
             <Route path="/pusbang/penyerapan" element={<AdminAbsorptionPage />} />
             <Route path="/pusbang/inbox" element={<PusbangInboxPage />} />
             <Route path="/pusbang/inbox-target" element={<PusbangTargetInboxPage />} />
             <Route path="/pusbang/unlock" element={<PusbangUnlockInboxPage />} />
            </Route>
          </Route>

          {/* Area PIMPINAN UPT */}
          <Route element={<RoleRoute allow={['PIMPINAN_UPT']} />}>
            <Route element={<AppShell />}>
              <Route path="/pimpinan" element={<PimpinanDashboardPage />} />
              <Route path="/pimpinan/persetujuan" element={<PimpinanApprovalHubPage />} />
              <Route path="/pimpinan/inbox" element={<Navigate to="/pimpinan/persetujuan?category=realisasi" replace />} />
              <Route path="/pimpinan/inbox-target" element={<Navigate to="/pimpinan/persetujuan?category=target" replace />} />
              <Route path="/pimpinan/penyerapan/taruna-inbox" element={<Navigate to="/pimpinan/persetujuan?category=taruna" replace />} />
              <Route path="/pimpinan/penyerapan/inbox" element={<Navigate to="/pimpinan/persetujuan?category=taruna" replace />} />
              <Route path="/pimpinan/penyerapan/laporan" element={<UptAbsorptionReportPage />} />
              <Route path="/pimpinan/laporan" element={<PimpinanLaporanPage />} />
              <Route path="/pimpinan/unlock" element={<Navigate to="/pimpinan/persetujuan?category=unlock" replace />} />
              <Route path="/pimpinan/riwayat" element={<RiwayatPage />} />
            </Route>
          </Route>

          {/* Area UPT_ADMIN */}
          <Route element={<RoleRoute allow={['UPT_ADMIN', 'UPT']} />}>
            <Route element={<AppShell />}>
              <Route path="/upt" element={<UptDashboardPage />} />
              <Route path="/upt/diklat" element={<UptDiklatPage />} />
              <Route path="/upt/target-pk" element={<TargetPkUptPage />} />
              <Route path="/upt/input" element={<InputRealisasiPage />} />
              <Route path="/upt/riwayat" element={<RiwayatPage />} />
              <Route path="/upt/laporan" element={<UptLaporanPage />} />
              <Route path="/upt/penyerapan/taruna" element={<UptTarunaPage />} />
              <Route path="/upt/penyerapan/input" element={<UptAbsorptionInputPage />} />
              <Route path="/upt/penyerapan/laporan" element={<UptAbsorptionReportPage />} />
              <Route path="/upt/unlock" element={<UnlockPage />} />
              <Route path="/upt/unlock-capaian" element={<UnlockPage />} />
              <Route path="/upt/perubahan-target" element={<UnlockTargetPkPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </BrowserRouter>
        </NotificationProvider>
      </AuthProvider>
    </ToastProvider>
  )
}
