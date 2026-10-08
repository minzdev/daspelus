import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { apiError } from '../../lib/api'
import { Alert, EmptyState, SkeletonRows, Spinner } from '../../components/ui'
import { IconTarget, IconRefresh, IconPlus } from '../../components/icons'
import { useToast } from '../../components/Toast'
import { fmtDateTime, yearOptions } from '../../utils/format'
import TargetRevisionHistory from '../../components/TargetRevisionHistory'

export default function UnlockTargetPkPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [reason, setReason] = useState('')
  const [list, setList] = useState([])
  const [revisions, setRevisions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [{ data: unlockData }, { data: revData }] = await Promise.all([
        api.get('/unlock-requests/my', { params: { type: 'target_pk' } }),
        api.get('/targets/my/revisions', { params: { year } }).catch(() => ({ data: { revisions: [] } })),
      ])
      setList(unlockData.requests || [])
      setRevisions(revData.revisions || [])
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => { load() }, [load])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!reason.trim()) {
      toast.error('Alasan perubahan/unlock wajib diisi')
      return
    }
    setSaving(true)
    try {
      const { data } = await api.post('/unlock-requests', {
        year,
        month: 0,
        reason: reason.trim(),
        type: 'target_pk',
      })
      toast.success('Pengajuan dikirim', data.message)
      setReason('')
      await load()
    } catch (err) {
      toast.error('Gagal mengajukan unlock target', apiError(err))
    } finally {
      setSaving(false)
    }
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'approved':
        return <span className="text-xs font-bold px-2.5 py-1 rounded-full ring-1 bg-emerald-50 text-emerald-700 ring-emerald-200">Disetujui — silakan revisi di Input Target PK</span>
      case 'rejected':
        return <span className="text-xs font-bold px-2.5 py-1 rounded-full ring-1 bg-red-50 text-red-700 ring-red-200">Ditolak</span>
      case 'pending_pimpinan':
        return <span className="text-xs font-bold px-2.5 py-1 rounded-full ring-1 bg-amber-50 text-amber-700 ring-amber-200">Menunggu Pimpinan UPT</span>
      case 'pending_pusbang':
        return <span className="text-xs font-bold px-2.5 py-1 rounded-full ring-1 bg-sky-50 text-sky-700 ring-sky-200">Menunggu Pusbang</span>
      case 'pending_bpsdmp':
        return <span className="text-xs font-bold px-2.5 py-1 rounded-full ring-1 bg-purple-50 text-purple-700 ring-purple-200">Menunggu Admin BPSDMP</span>
      default:
        return <span className="text-xs font-bold px-2.5 py-1 rounded-full ring-1 bg-slate-50 text-slate-700 ring-slate-200">{status}</span>
    }
  }

  const hasApproved = list.some((r) => Number(r.year) === Number(year) && r.status === 'approved')
  const pendingForYear = list.find((r) => Number(r.year) === Number(year) && ['pending_pimpinan', 'pending_pusbang', 'pending_bpsdmp'].includes(r.status))

  return (
    <div className="animate-fadeUp space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Perubahan Target PK</h1>
          <p className="page-desc">
            Alur tetap: <strong>input sekali per tahun → terkunci → revisi via pengajuan unlock</strong>.
            Angka yang dipakai di seluruh laporan & capaian adalah <strong>update terakhir</strong>,
            sedangkan <strong>Target Awal + setiap revisi (angka & waktu)</strong> terekam lengkap di bawah.
            Alur persetujuan unlock: Pimpinan UPT → Admin BPSDMP.
          </p>
        </div>
        <button className="btn-secondary !rounded-xl" onClick={load}>
          <IconRefresh className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* Steps */}
      <div className="grid gap-2 sm:grid-cols-3">
        {[
          { n: '1', t: 'Input sekali', d: 'Isi Target PK di menu Input Target PK, lalu kirim ke Pimpinan.', active: false },
          { n: '2', t: 'Ajukan unlock', d: 'Isi alasan perubahan di form bawah bila target sudah terkunci.', active: !hasApproved && !!pendingForYear === false },
          { n: '3', t: 'Revisi & berlaku terbaru', d: 'Setelah disetujui, revisi angka — yang terbaru langsung berlaku.', active: hasApproved },
        ].map((s) => (
          <div key={s.n} className={`rounded-2xl border p-4 flex gap-3 ${s.active ? 'border-navy-900 bg-navy-50' : 'border-slate-200 bg-white'}`}>
            <span className={`h-8 w-8 shrink-0 rounded-xl flex items-center justify-center font-black text-sm ${s.active ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-500'}`}>{s.n}</span>
            <div>
              <p className="text-sm font-extrabold text-slate-900">{s.t}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.d}</p>
            </div>
          </div>
        ))}
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {pendingForYear && (
        <Alert type="info">
          Pengajuan unlock Target PK {year} sedang <strong>{pendingForYear.status}</strong>. Tunggu persetujuan sebelum merevisi — riwayat pengajuan ada di bawah.
        </Alert>
      )}
      {hasApproved && (
        <Alert type="success">
          Unlock Target PK {year} <strong>disetujui</strong> — silakan revisi angka di{' '}
          <Link to="/upt/target-pk" className="font-bold underline">Input Target PK</Link>, lalu kirim ulang ke Pimpinan. Angka terbaru otomatis berlaku & tercatat sebagai revisi.
        </Alert>
      )}

      <div className="card rounded-2xl border border-slate-200 p-5">
        <h3 className="text-sm font-bold text-slate-900">Ajukan Perubahan / Unlock Target PK {year}</h3>
        <p className="text-xs text-slate-500 mt-1">Satu pengajuan per tahun · wajib isi alasan perubahan (mis. penyesuaian kuota, tambah diklat, koreksi program).</p>
        <form onSubmit={handleSubmit} className="mt-3 grid gap-3 sm:grid-cols-4">
          <div>
            <label className="form-label">Tahun Target</label>
            <select className="form-input !rounded-xl" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Jenis Target</label>
            <div className="form-input !rounded-xl bg-slate-50 text-slate-600 font-bold">Satu kali input ({year})</div>
          </div>
          <div className="sm:col-span-2">
            <label className="form-label">Alasan Perubahan Target <span className="text-red-500">*</span></label>
            <input
              className="form-input !rounded-xl"
              placeholder="Revisi target / tambah diklat / penyesuaian program..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="sm:col-span-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <Link to="/upt/target-pk" className="text-xs font-bold text-navy-700 hover:underline">← Kembali ke Input Target PK</Link>
            <button type="submit" className="btn-primary !rounded-xl" disabled={saving}>
              {saving ? <Spinner /> : <><IconPlus className="h-4 w-4" /> Ajukan Unlock Target PK {year}</>}
            </button>
          </div>
        </form>
      </div>

      {/* Riwayat angka: Awal + revisi */}
      <div className="card rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="h-8 w-8 rounded-xl bg-navy-900 text-gold-300 flex items-center justify-center text-sm">◷</span>
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">Riwayat Angka Target PK {year}</h3>
            <p className="text-xs text-slate-500">Target Awal = penyimpanan pertama · setiap perubahan angka & waktu terekam otomatis</p>
          </div>
        </div>
        {loading ? <SkeletonRows rows={3} /> : <TargetRevisionHistory revisions={revisions} year={year} />}
      </div>

      <div className="card rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">Riwayat Pengajuan Unlock Perubahan</h3>
          <span className="text-xs text-slate-500">{list.length} pengajuan</span>
        </div>
        {loading ? (
          <div className="p-4"><SkeletonRows rows={3} /></div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={<IconTarget className="h-6 w-6" />}
            title="Belum ada pengajuan"
            desc="Belum ada pengajuan unlock Target PK untuk UPT Anda. Ajukan di form atas bila target sudah terkunci dan perlu direvisi."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {list.map((r) => (
              <div key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-slate-900">Target PK · {r.year}</p>
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800">Target PK</span>
                    {r.status === 'approved' && (
                      <Link to="/upt/target-pk" className="text-[11px] font-bold text-emerald-700 hover:underline">Revisi sekarang →</Link>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Alasan: {r.reason}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Diajukan {r.createdAt ? fmtDateTime(r.createdAt) : '—'} · Trail: {(r.trail || []).map((t) => `${t.role}:${t.decision}`).join(' → ')}
                    {r.rejectNote || r.note ? ` · Catatan: ${r.rejectNote || r.note}` : ''}
                  </p>
                </div>
                <div className="shrink-0">{getStatusBadge(r.status)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
