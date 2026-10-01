import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Spinner, Alert, PasswordInput } from '../../components/ui'
import { IconTarget, IconChart, IconBuilding, IconLock } from '../../components/icons'
import logoBpsdm from '../../assets/logo-bpsdm.png'

const FEATURES = [
  {
    icon: IconTarget,
    title: 'Target & Realisasi PK',
    desc: 'Input realisasi peserta dan lulusan per program kinerja.',
  },
  {
    icon: IconChart,
    title: 'Rekap Otomatis',
    desc: 'Rekapitulasi bulanan dan capaian kinerja terhitung otomatis.',
  },
  {
    icon: IconBuilding,
    title: 'Akses Seluruh UPT',
    desc: 'Satu akun resmi untuk setiap unit pelaksana teknis.',
  },
]

export default function LoginPage() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!loading && user) {
    return <Navigate to={user.role === 'ADMIN' ? '/admin' : '/upt'} replace />
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) {
      setError('Email dan password wajib diisi.')
      return
    }
    setSubmitting(true)
    const res = await login(email.trim(), password)
    setSubmitting(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-dvh flex">
      {/* ================= Panel Branding (desktop) ================= */}
      <div className="relative hidden lg:flex w-[46%] xl:w-[44%] flex-col justify-between overflow-hidden bg-navy-950 p-10 xl:p-14">
        {/* tekstur titik halus */}
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
          }}
        />
        {/* pendar lembut */}
        <div className="absolute -top-40 -right-40 h-[480px] w-[480px] rounded-full bg-navy-700/30 blur-3xl" />
        <div className="absolute -bottom-48 -left-24 h-[420px] w-[420px] rounded-full bg-gold-500/[0.07] blur-3xl" />
        {/* garis emas tipis di tepi kanan panel */}
        <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-gold-500/40 to-transparent" />

        {/* brand */}
        <div className="relative flex items-center gap-3.5 animate-fadeUp">
          <div className="h-14 w-14 shrink-0 rounded-2xl bg-white p-1.5 shadow-xl shadow-navy-950/50 ring-1 ring-white/10">
               <img src={logoBpsdm} alt="Logo BPSDMP" className="h-full w-full object-contain" onError={(e) => e.target.style.display = 'none'} />
          </div>
          <div>
            <p className="text-xl font-extrabold text-white tracking-tight leading-none">DASPESLUS</p>
            <p className="text-[11px] font-semibold text-navy-300 mt-1.5">Dashboard Peserta &amp; Lulusan</p>
          </div>
        </div>

        {/* pesan utama */}
        <div className="relative max-w-md">
          <p
            className="text-gold-300 text-[11px] font-extrabold uppercase tracking-[0.22em] animate-fadeUp"
            style={{ animationDelay: '80ms' }}
          >
            BPSDMP Kementerian Perhubungan
          </p>
          <h1
            className="mt-4 text-[2.3rem] xl:text-[2.6rem] font-extrabold text-white leading-[1.12] tracking-tight animate-fadeUp"
            style={{ animationDelay: '150ms' }}
          >
            Data peserta &amp; lulusan taruna, dalam satu dashboard.
          </h1>
          <p
            className="mt-5 text-sm text-navy-300 leading-relaxed animate-fadeUp"
            style={{ animationDelay: '220ms' }}
          >
            Monitoring realisasi Perjanjian Kinerja pendidikan transportasi dari seluruh Unit
            Pelaksana Teknis di lingkungan Badan Pengembangan SDM Perhubungan.
          </p>

          <ul className="mt-9 space-y-4">
            {FEATURES.map(({ icon: Ic, title, desc }, i) => (
              <li
                key={title}
                className="group flex items-start gap-3.5 animate-fadeUp"
                style={{ animationDelay: `${300 + i * 80}ms` }}
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-gold-300 ring-1 ring-white/10 transition-colors duration-300 group-hover:bg-gold-500/15 group-hover:ring-gold-500/25">
                  <Ic className="h-[18px] w-[18px]" />
                </span>
                <span>
                  <span className="block text-[13px] font-bold text-white leading-tight">{title}</span>
                  <span className="block text-xs text-navy-300 mt-1 leading-relaxed">{desc}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11px] text-navy-400">
          © {new Date().getFullYear()} Badan Pengembangan SDM Perhubungan · Kementerian Perhubungan RI
        </p>
      </div>

      {/* ================= Panel Form ================= */}
      <div className="relative flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, #F0F4FA 0%, #F4F6FA 45%, #F4F6FA 100%)',
          }}
        />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-navy-50/70 to-transparent" />

        <div className="relative w-full max-w-[420px]">
          {/* brand mobile */}
          <div className="lg:hidden mb-8 flex flex-col items-center text-center animate-fadeUp">
            <div className="h-16 w-16 rounded-2xl bg-white p-1.5 shadow-card ring-1 ring-navy-100">
              <img src={logoBpsdm} alt="Logo BPSDMP" className="h-full w-full object-contain" onError={(e) => e.target.style.display = 'none'} />
            </div>
            <p className="mt-3 text-[15px] font-extrabold text-navy-900 tracking-tight">DASPESLUS</p>
            <p className="text-[11px] font-semibold text-navy-500 mt-0.5">
              Dashboard Peserta &amp; Lulusan — BPSDMP Kemenhub
            </p>
          </div>

          <div className="card !rounded-2xl p-7 sm:p-9 animate-fadeUp" style={{ animationDelay: '120ms' }}>
            <h2 className="text-[22px] font-extrabold text-navy-900 tracking-tight">Masuk ke Sistem</h2>
            <p className="text-[13px] text-navy-500 mt-1.5 leading-relaxed">
              Gunakan akun resmi yang diberikan oleh Admin BPSDMP.
            </p>

            {error && (
              <div className="mt-5 animate-fadeUp">
                <Alert type="error">{error}</Alert>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-7 space-y-5">
              <div>
                <label className="form-label" htmlFor="login-email">Email</label>
                <input
                  id="login-email"
                  type="email"
                  className="form-input !rounded-xl !py-3"
                  placeholder="nama.instansi@dephub.go.id"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="form-label" htmlFor="login-password">Password</label>
                <PasswordInput
                  id="login-password"
                  className="form-input !rounded-xl !py-3"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password"
                  autoComplete="current-password"
                />
              </div>

              <button
                type="submit"
                className="btn-primary w-full !rounded-xl !py-3 mt-2 shadow-md shadow-navy-900/15 hover:shadow-lg hover:shadow-navy-900/20 transition-all duration-200"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Spinner /> Memproses...
                  </>
                ) : (
                  <>
                    <IconLock className="h-4 w-4" /> Masuk
                  </>
                )}
              </button>
            </form>

            <div className="mt-7 border-t border-surface-border pt-5">
              <p className="text-center text-xs text-navy-400 leading-relaxed">
                Lupa password atau belum memiliki akun?
                <br />
                Hubungi <span className="font-semibold text-navy-600">Admin BPSDMP</span> untuk pengaturan akses.
              </p>
            </div>
          </div>

          <p className="lg:hidden mt-6 text-center text-[11px] text-navy-400 animate-fadeUp" style={{ animationDelay: '200ms' }}>
            © {new Date().getFullYear()} Badan Pengembangan SDM Perhubungan
          </p>
        </div>
      </div>
    </div>
  )
}
