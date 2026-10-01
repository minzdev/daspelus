import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { apiError } from '../../lib/api'
import {
  EmptyState, SkeletonRows, Alert, Modal,
} from '../../components/ui'
import {
  IconHistory, IconEdit, IconInput, IconChevronDown,
  IconLock, IconPeople, IconGraduation, IconFileText, IconTarget,
} from '../../components/icons'
import logoBpsdm from '../../assets/logo-bpsdm.png'
import { MONTHS, fmtNum, fmtDateTime, yearOptions } from '../../utils/format'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../context/AuthContext'
import clsx from 'clsx'

import { buildRiwayatPdf } from '../../utils/riwayatPdf'

/* Badge status generik untuk riwayat Taruna & Penyerapan */
function statusBadgeFor(status) {
  switch (status) {
    case 'approved':
    case 'approved_admin':
    case 'approved_pimpinan':
    case 'approved_bpsdmp':
      return { label: 'Disetujui', cls: 'bg-emerald-50 text-emerald-700 border-emerald-300' }
    case 'rejected':
    case 'rejected_pimpinan':
    case 'rejected_admin':
    case 'rejected_bpsdmp':
      return { label: 'Ditolak', cls: 'bg-red-50 text-red-700 border-red-300' }
    case 'pending_pimpinan':
    case 'submitted_pimpinan':
      return { label: 'Pending Pimpinan', cls: 'bg-amber-50 text-amber-700 border-amber-300' }
    case 'pending_bpsdmp':
    case 'submitted_admin':
      return { label: 'Pending BPSDMP', cls: 'bg-sky-50 text-sky-700 border-sky-300' }
    default:
      return { label: 'Draf', cls: 'bg-slate-100 text-slate-600 border-slate-200' }
  }
}

export default function RiwayatPage() {
  const toast = useToast()
  const { user } = useAuth()
  const [year, setYear] = useState(new Date().getFullYear())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openMonth, setOpenMonth] = useState(null)
  const [exportingPdf, setExportingPdf] = useState(false)

  // Modal Ajukan Unlock
  const [unlockModalOpen, setUnlockModalOpen] = useState(false)
  const [selectedUnlockMonth, setSelectedUnlockMonth] = useState(null)
  const [unlockType, setUnlockType] = useState('capaian') // 'capaian' | 'target_pk'
  const [unlockReason, setUnlockReason] = useState('')
  const [submittingUnlock, setSubmittingUnlock] = useState(false)

  const [submissions, setSubmissions] = useState([])
  const [targetSubmissions, setTargetSubmissions] = useState([])
  const [absHist, setAbsHist] = useState({ taruna: { submissions: [], activeCount: 0 }, penyerapan: [] })
  const [filterType, setFilterType] = useState('semua') // 'semua' | 'target' | 'realisasi' | 'taruna' | 'penyerapan'

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [realRes, subRes, targetHistRes, absHistRes] = await Promise.all([
        api.get('/realizations/my', { params: { year } }),
        api.get('/submissions/history').catch(() => ({ data: { submissions: [] } })),
        api.get('/targets/history').catch(() => ({ data: { submissions: [] } })),
        api.get('/absorptions/upt-history', { params: { year } }).catch(() => ({ data: {} })),
      ])
      setData(realRes.data)
      setSubmissions(subRes.data?.submissions || [])
      setTargetSubmissions(targetHistRes.data?.submissions || [])
      setAbsHist({
        taruna: absHistRes.data?.taruna || { submissions: [], activeCount: 0 },
        penyerapan: absHistRes.data?.penyerapan || [],
      })
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => { load() }, [load])

  const realizations = useMemo(() => data?.realizations || [], [data?.realizations])
  const programs = useMemo(() => data?.programs || [], [data?.programs])

  const subByMonth = useMemo(() => {
    const m = new Map()
    for (const s of submissions) {
      if (Number(s.year) !== Number(year)) continue
      m.set(Number(s.month), s)
    }
    return m
  }, [submissions, year])

  const months = useMemo(() => {
    const map = new Map()
    for (const r of realizations) {
      const m = Number(r.month)
      if (!map.has(m)) map.set(m, [])
      map.get(m).push(r)
    }
    // Pastikan bulan yang punya submission tapi belum ada realisasi tetap muncul (mis. pending)
    for (const m of subByMonth.keys()) {
      if (!map.has(m)) map.set(m, [])
    }
    return [...map.entries()]
      .map(([m, list]) => {
        const sub = subByMonth.get(m)
        const locked = sub ? sub.status === 'approved' : list.some((r) => r.locked === true)
        // Status real-time berbasis submission
        let statusKey = 'DRAFT'
        let statusLabel = 'Draf'
        let statusCls = 'bg-amber-50 text-amber-700 border-amber-300'
        let approvedBy = null
        if (sub) {
          if (sub.status === 'pending_pimpinan') {
            statusKey = 'PENDING_PIMPINAN'
            statusLabel = 'Pending Pimpinan'
            statusCls = 'bg-amber-50 text-amber-700 border-amber-300'
          } else if (sub.status === 'pending_bpsdmp') {
            statusKey = 'PENDING_BPSDMP'
            statusLabel = 'Pending BPSDMP'
            statusCls = 'bg-sky-50 text-sky-700 border-sky-300'
            approvedBy = sub.pimpinanApprovedByName || sub.approvedByName || null
          } else if (sub.status === 'approved') {
            statusKey = 'TERKUNCI'
            statusLabel = 'Terkunci'
            statusCls = 'bg-emerald-50 text-emerald-700 border-emerald-300'
            approvedBy = sub.approvedByName || sub.pimpinanApprovedByName || null
          } else if (sub.status === 'rejected') {
            statusKey = 'DITOLAK'
            statusLabel = 'Ditolak'
            statusCls = 'bg-red-50 text-red-700 border-red-300'
          }
        } else if (locked) {
          statusKey = 'TERKUNCI'
          statusLabel = 'Terkunci'
          statusCls = 'bg-emerald-50 text-emerald-700 border-emerald-300'
        }
        return {
          month: m,
          list,
          sub,
          locked,
          statusKey,
          statusLabel,
          statusCls,
          approvedBy,
          totalPeserta: list.reduce((s, r) => s + (Number(r.totalPeserta) || 0), 0),
          totalLulusan: list.reduce((s, r) => s + (Number(r.totalLulusan) || 0), 0),
          total: list.reduce((s, r) => s + (Number(r.totalPeserta) || 0) + (Number(r.totalLulusan) || 0), 0),
          updatedAt: sub?.updatedAt || list.map((r) => r.updatedAt).filter(Boolean).sort()[list.length - 1],
        }
      })
      .sort((a, b) => a.month - b.month)
  }, [realizations, subByMonth])

  const targetMonths = useMemo(() => {
    const map = new Map()
    for (const s of targetSubmissions) {
      if (Number(s.year) !== Number(year)) continue
      // SINGLE-INPUT: hanya tampilkan pengajuan satu kali per tahun (month=0).
      // Baris bulanan lama (Jan–Des era sebelumnya) disembunyikan dari riwayat.
      if (Number(s.month) !== 0) continue
      const m = Number(s.month)
      if (!map.has(m)) map.set(m, [])
      map.get(m).push(s)
    }
    return [...map.entries()]
      .map(([m, list]) => {
        const sub = list[0]
        let statusKey = 'DRAFT'
        let statusLabel = 'Draf'
        let statusCls = 'bg-amber-50 text-amber-700 border-amber-300'
        if (sub) {
          if (sub.status === 'pending_pimpinan') {
            statusKey = 'PENDING_PIMPINAN'
            statusLabel = 'Pending Pimpinan'
            statusCls = 'bg-amber-50 text-amber-700 border-amber-300'
          } else if (sub.status === 'pending_bpsdmp') {
            statusKey = 'PENDING_BPSDMP'
            statusLabel = 'Pending BPSDMP'
            statusCls = 'bg-sky-50 text-sky-700 border-sky-300'
          } else if (sub.status === 'approved') {
            statusKey = 'DISETUJUI'
            statusLabel = 'Disetujui'
            statusCls = 'bg-emerald-50 text-emerald-700 border-emerald-300'
          } else if (sub.status === 'rejected') {
            statusKey = 'DITOLAK'
            statusLabel = 'Ditolak'
            statusCls = 'bg-red-50 text-red-700 border-red-300'
          }
        }
        const snapRaw = sub?.targetSnapshot
        const snap = Array.isArray(snapRaw) ? snapRaw : Array.isArray(snapRaw?.targets) ? snapRaw.targets : []
        const totalPeserta = snap.reduce((s, t) => s + (Number(t.targetPeserta) || 0), 0)
        const totalLulusan = snap.reduce((s, t) => s + (Number(t.targetLulusan) || 0), 0)
        return {
          month: m,
          list,
          sub,
          statusKey,
          statusLabel,
          statusCls,
          totalPeserta,
          totalLulusan,
          total: totalPeserta + totalLulusan,
          updatedAt: sub?.updatedAt,
        }
      })
      .sort((a, b) => a.month - b.month)
  }, [targetSubmissions, year])

  // Ringkasan stats
  const totalPeserta = months.reduce((s, m) => s + m.totalPeserta, 0)
  const totalLulusan = months.reduce((s, m) => s + m.totalLulusan, 0)
  const lockedCount = months.filter((m) => m.statusKey === 'TERKUNCI').length

  const tarunaSubs = useMemo(() => absHist.taruna?.submissions || [], [absHist])
  const tarunaCount = absHist.taruna?.activeCount || 0
  const penyerapanSubs = useMemo(() => absHist.penyerapan || [], [absHist])

  // Ekspor PDF riwayat input (rekap status realisasi, target PK, taruna & penyerapan)
  const exportRiwayatPdf = (e) => {
    if (e) e.stopPropagation()
    setExportingPdf(true)
    try {
      const tarunaRows = tarunaSubs.map((s) => ({
        id: `taruna-${s.id}`,
        jenis: 'Data Taruna',
        periode: `Tahun ${s.year}`,
        status: s.status,
        pengirim: s.submittedByName || '-',
        pimpinan: s.pimpinanApprovedByName || '-',
        bpsdmp: s.approvedByName || s.rejectedByName || '-',
        updatedAt: s.updatedAt,
      }))
      const penyerapanRows = penyerapanSubs.map((s) => ({
        id: `penyerapan-${s.id}`,
        jenis: 'Penyerapan',
        periode: s.periodName ? `${s.periodName} ${s.year}` : `${s.month ? `Bulan ${s.month}` : `TW ${s.quarter}`}/${s.year}`,
        status: s.status,
        pengirim: s.submittedByName || '-',
        pimpinan: s.pimpinanApprovedByName || '-',
        bpsdmp: s.approvedByName || '-',
        updatedAt: s.updatedAt,
      }))
      const url = buildRiwayatPdf({
        upt: user?.upt,
        year,
        filterType,
        months,
        targetMonths,
        tarunaRows,
        penyerapanRows,
      })
      const prefix = filterType === 'target' ? 'Riwayat_TargetPK' : filterType === 'realisasi' ? 'Riwayat_Realisasi' : filterType === 'taruna' ? 'Riwayat_Taruna' : filterType === 'penyerapan' ? 'Riwayat_Penyerapan' : 'Riwayat_Pelaporan'
      const a = document.createElement('a')
      a.href = url
      a.download = `${prefix}_${user?.upt?.code || 'UPT'}_${year}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      const label = filterType === 'target' ? 'Target PK' : filterType === 'realisasi' ? 'Realisasi' : filterType === 'taruna' ? 'Data Taruna' : filterType === 'penyerapan' ? 'Penyerapan' : 'semua'
      toast.success('PDF Terunduh', `Riwayat pelaporan ${label} tahun ${year} berhasil diunduh.`)
    } catch (err) {
      console.error(err)
      toast.error('Gagal Ekspor PDF', 'Terjadi kesalahan saat membuat PDF.')
    } finally {
      setExportingPdf(false)
    }
  }

  const detailRows = (month) =>
    programs.map((p) => {
      const r = realizations.find((x) => Number(x.month) === month && x.programId === p.id)
      return { program: p, real: r || null }
    })

  const handleOpenUnlockModal = (m, e) => {
    if (e) e.stopPropagation()
    setUnlockType('capaian')
    setSelectedUnlockMonth(m)
    setUnlockReason('')
    setUnlockModalOpen(true)
  }

  const handleOpenUnlockTargetModal = (m, e) => {
    if (e) e.stopPropagation()
    setUnlockType('target_pk')
    setSelectedUnlockMonth(0) // single-input: Target PK selalu satu kali per tahun
    setUnlockReason('')
    setUnlockModalOpen(true)
  }

  const handleSubmitUnlockRequest = async (e) => {
    e.preventDefault()
    if (!unlockReason.trim()) {
      toast.error('Alasan Diperlukan', 'Mohon isi alasan pengajuan unlock.')
      return
    }
    setSubmittingUnlock(true)
    try {
      const monthToSend = unlockType === 'target_pk' ? 0 : selectedUnlockMonth
      const { data } = await api.post('/unlock-requests', {
        year,
        month: monthToSend,
        reason: unlockReason,
        type: unlockType,
      })
      toast.success(
        unlockType === 'target_pk' ? 'Pengajuan Unlock Target PK Terkirim' : 'Pengajuan Unlock Laporan Terkirim',
        data.message || (unlockType === 'target_pk'
          ? `Permohonan unlock Target PK ${year} (satu kali input) telah dikirim.`
          : `Permohonan unlock Laporan bulan ${MONTHS[selectedUnlockMonth - 1]} ${year} telah dikirim.`),
        6000
      )
      setUnlockModalOpen(false)
      setUnlockReason('')
      await load()
    } catch (err) {
      toast.error('Gagal mengajukan unlock', apiError(err))
    } finally {
      setSubmittingUnlock(false)
    }
  }

  return (
    <div className="animate-fadeUp space-y-5">

      {/* ── Banner Header ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-navy-950 via-navy-900 to-navy-950 px-5 py-4 text-white shadow-card border border-navy-800">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-48 w-48 rounded-full bg-gold-500/10 blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="hidden sm:flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 p-1.5 border border-white/15 backdrop-blur-md">
              <img src={logoBpsdm} alt="Logo BPSDMP" className="h-full w-full object-contain" onError={(e) => e.target.style.display = 'none'} />
            </div>
            <div>
              <h1 className="text-lg font-black text-white tracking-tight">Riwayat Input Realisasi</h1>
              <p className="text-xs text-navy-300 mt-0.5">
                <span className="text-white font-semibold">{user?.upt?.name || 'UPT'}</span>
                {' '}· Daftar laporan bulanan yang telah dikirimkan
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Pilih Tahun */}
            <div className="relative">
              <select
                className="appearance-none cursor-pointer bg-white/10 hover:bg-white/15 border border-white/20 text-white font-extrabold text-xs rounded-xl py-2 pl-3 pr-8 backdrop-blur-md transition-all focus:outline-none focus:ring-2 focus:ring-gold-400"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {yearOptions().map((y) => (
                  <option key={y} value={y} className="bg-navy-900 text-white font-bold">Tahun {y}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-gold-300">
                <IconChevronDown className="h-3.5 w-3.5" />
              </div>
            </div>

            <Link to="/upt/input" className="btn-gold text-xs !py-2 !px-3.5 rounded-xl shadow-md">
              <IconInput className="h-4 w-4" /> Input Baru
            </Link>
          </div>
        </div>
      </div>

      {error && <div><Alert type="error">{error}</Alert></div>}

      {/* Filter Target PK / Realisasi / Taruna / Penyerapan */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 flex-wrap">
            <button type="button" onClick={() => setFilterType('semua')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${filterType === 'semua' ? 'bg-slate-900 text-white shadow' : 'text-slate-600 hover:text-slate-900'}`}>Semua ({months.length + targetMonths.length + tarunaSubs.length + penyerapanSubs.length})</button>
            <button type="button" onClick={() => setFilterType('target')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${filterType === 'target' ? 'bg-navy-900 text-white shadow' : 'text-slate-600 hover:text-slate-900'}`}>Target PK ({targetMonths.length})</button>
            <button type="button" onClick={() => setFilterType('realisasi')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${filterType === 'realisasi' ? 'bg-sky-600 text-white shadow' : 'text-slate-600 hover:text-slate-900'}`}>Realisasi ({months.length})</button>
            <button type="button" onClick={() => setFilterType('taruna')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${filterType === 'taruna' ? 'bg-violet-600 text-white shadow' : 'text-slate-600 hover:text-slate-900'}`}>Data Taruna ({tarunaSubs.length})</button>
            <button type="button" onClick={() => setFilterType('penyerapan')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${filterType === 'penyerapan' ? 'bg-emerald-600 text-white shadow' : 'text-slate-600 hover:text-slate-900'}`}>Penyerapan ({penyerapanSubs.length})</button>
          </div>
          <span className="text-xs text-slate-500 hidden sm:inline">Filter riwayat input untuk monitoring</span>
        </div>
        <button
          type="button"
          onClick={exportRiwayatPdf}
          disabled={exportingPdf || loading || (months.length === 0 && targetMonths.length === 0 && tarunaSubs.length === 0 && penyerapanSubs.length === 0)}
          className="btn-primary !py-2 !px-3.5 !text-xs font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          title={`Ekspor PDF riwayat pelaporan (${filterType === 'target' ? 'Target PK' : filterType === 'realisasi' ? 'Realisasi' : filterType === 'taruna' ? 'Data Taruna' : filterType === 'penyerapan' ? 'Penyerapan' : 'Semua'})`}
        >
          <IconFileText className="h-4 w-4" /> {exportingPdf ? 'Memproses...' : 'Ekspor PDF'}
        </button>
      </div>

      {/* ── Stat Cards ── */}
      {!loading && (filterType === 'realisasi' || filterType === 'semua') && months.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MiniStat icon={<IconFileText className="h-4 w-4" />} label="Bulan Dilaporkan" value={`${months.length} Bulan`} tone="navy" />
          <MiniStat icon={<IconLock className="h-4 w-4" />} label="Bulan Terkunci" value={`${lockedCount} Terkunci`} tone="gold" />
          <MiniStat icon={<IconPeople className="h-4 w-4" />} label="Total Peserta" value={fmtNum(totalPeserta)} tone="sky" />
          <MiniStat icon={<IconGraduation className="h-4 w-4" />} label="Total Lulusan" value={fmtNum(totalLulusan)} tone="emerald" />
        </div>
      )}

      {/* ── Tabel Riwayat Realisasi ── */}
      {(filterType === 'realisasi' || filterType === 'semua') && (
        <div className="card overflow-hidden border-surface-border shadow-card">
          {/* Card Header */}
          <div className="card-header bg-sky-50/50 border-b border-surface-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-600 text-white">
                <IconHistory className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-extrabold text-navy-900">Rekap Realisasi Bulanan {year}</p>
                <p className="text-xs text-navy-400">Klik baris untuk melihat detail per program</p>
              </div>
            </div>
            <span className="text-xs font-bold text-navy-500 bg-sky-100 rounded-full px-3 py-1">
              {months.length} laporan
            </span>
          </div>

        {loading ? (
          <SkeletonRows rows={5} />
        ) : months.length === 0 ? (
          <EmptyState
            icon={<IconHistory className="h-6 w-6" />}
            title="Belum ada realisasi"
            desc={`Anda belum menginput realisasi untuk tahun ${year}. Mulai laporkan data bulanan sekarang.`}
            action={
              <Link to="/upt/input" className="btn-primary">
                <IconInput className="h-4 w-4" /> Input Realisasi
              </Link>
            }
          />
        ) : (
          <div className="table-wrap overflow-x-auto">
            <table className="data-table" style={{ tableLayout: 'fixed', width: '100%' }}>
              <colgroup>
                <col style={{ width: '4%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '12%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th />
                  <th>Bulan</th>
                  <th className="text-right">Total Peserta</th>
                  <th className="text-right">Total Lulusan</th>
                  <th className="text-center">Jumlah</th>
                  <th>Status</th>
                  <th className="text-left">Posisi / Disetujui</th>
                  <th>Update Terakhir</th>
                  <th className="text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => {
                  const isOpen = openMonth === m.month
                  const locked = m.locked
                  return (
                    <MonthRow
                      key={m.month}
                      m={m}
                      isOpen={isOpen}
                      onToggle={() => setOpenMonth(isOpen ? null : m.month)}
                      onUnlock={(e) => handleOpenUnlockModal(m.month, e)}
                    >
                      {isOpen && (
                        <tr className="bg-gradient-to-b from-navy-50/60 to-white">
                          <td colSpan={9} className="!p-0">
                            <DetailTable rows={detailRows(m.month)} locked={locked} />
                          </td>
                        </tr>
                      )}
                    </MonthRow>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* ── Tabel Riwayat Target PK ── */}
      {(filterType === 'target' || filterType === 'semua') && (
        <div className="card overflow-hidden border-surface-border shadow-card">
          <div className="card-header bg-amber-50/50 border-b border-surface-border">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-600 text-white">
                <IconTarget className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-extrabold text-navy-900">Rekap Target PK {year} (Satu kali input)</p>
                <p className="text-xs text-navy-400">Riwayat pengajuan Target PK tahunan single-input</p>
              </div>
            </div>
            <span className="text-xs font-bold text-navy-500 bg-amber-100 rounded-full px-3 py-1">
              {targetMonths.length} pengajuan
            </span>
          </div>
          {loading ? (
            <SkeletonRows rows={3} />
          ) : targetMonths.length === 0 ? (
            <EmptyState icon={<IconTarget className="h-6 w-6" />} title="Belum ada Target PK" desc={`Belum ada pengajuan Target PK untuk tahun ${year}.`} />
          ) : (
            <div className="table-wrap overflow-x-auto">
              <table className="data-table" style={{ tableLayout: 'fixed', width: '100%' }}>
                <colgroup>
                  <col style={{ width: '4%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '14%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th />
                    <th>Periode</th>
                    <th className="text-right">Total Peserta</th>
                    <th className="text-right">Total Lulusan</th>
                    <th className="text-center">Jumlah</th>
                    <th>Status</th>
                    <th>Posisi</th>
                    <th>Update Terakhir</th>
                    <th className="text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {targetMonths.map((m) => {
                    const isApproved = m.statusKey === 'DISETUJUI' || m.sub?.status === 'approved'
                    const isDraftOrRejected = m.statusKey === 'DRAFT' || m.sub?.status === 'draft' || m.sub?.status === 'rejected'
                    return (
                      <tr key={m.month} className="hover:bg-amber-50/30">
                        <td className="text-center">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-800 text-[10px] font-black">
                            {m.month === 0 ? 'Thn' : MONTHS[m.month - 1]?.slice(0, 3)}
                          </span>
                        </td>
                        <td className="font-bold text-navy-900">{m.month === 0 ? `Target ${year}` : MONTHS[m.month - 1]}</td>
                        <td className="text-right font-bold">{fmtNum(m.totalPeserta)}</td>
                        <td className="text-right font-bold">{fmtNum(m.totalLulusan)}</td>
                        <td className="text-center font-black">{fmtNum(m.total)}</td>
                        <td>
                          <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold border', m.statusCls)}>
                            {m.statusLabel}
                          </span>
                        </td>
                        <td className="text-xs">
                          <p className="font-medium truncate max-w-[140px]" title={m.sub?.submittedByName || ''}>{m.sub?.submittedByName || '-'}</p>
                          <p className="text-[10px] text-slate-400">{m.sub?.status || '-'}</p>
                        </td>
                        <td className="text-xs">{fmtDateTime(m.updatedAt) || '—'}</td>
                        <td className="text-center">
                          {isApproved ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100 transition-colors"
                              onClick={(e) => handleOpenUnlockTargetModal(m.month, e)}
                              title="Target PK disetujui. Klik untuk mengajukan unlock perubahan Target PK"
                            >
                              <IconLock className="h-3 w-3" />
                              <span className="hidden sm:inline">Unlock</span>
                            </button>
                          ) : isDraftOrRejected ? (
                            <Link
                              to="/upt/target-pk"
                              className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1.5 rounded-lg bg-navy-800 text-white hover:bg-navy-700 transition-colors"
                              title="Edit Target PK"
                            >
                              <IconEdit className="h-3 w-3" />
                              <span className="hidden sm:inline">Edit</span>
                            </Link>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
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
      )}

      {/* ── Tabel Riwayat Data Taruna ── */}
      {(filterType === 'taruna' || filterType === 'semua') && (
        <div className="card overflow-hidden border-surface-border shadow-card">
          <div className="card-header bg-violet-50/50 border-b border-surface-border">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white">
                <IconPeople className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-extrabold text-navy-900">Rekap Data Taruna {year}</p>
                <p className="text-xs text-navy-400">Riwayat pengajuan Master Data Taruna · {tarunaCount} taruna aktif</p>
              </div>
            </div>
            <span className="text-xs font-bold text-navy-500 bg-violet-100 rounded-full px-3 py-1">
              {tarunaSubs.length} pengajuan
            </span>
          </div>
          {loading ? (
            <SkeletonRows rows={3} />
          ) : tarunaSubs.length === 0 ? (
            <EmptyState icon={<IconPeople className="h-6 w-6" />} title="Belum ada pengajuan Data Taruna" desc={`Belum ada pengajuan Master Data Taruna untuk tahun ${year}.`} />
          ) : (
            <div className="table-wrap overflow-x-auto">
              <table className="data-table" style={{ tableLayout: 'fixed', width: '100%' }}>
                <thead>
                  <tr>
                    <th>Periode</th>
                    <th className="text-right">Taruna Aktif</th>
                    <th>Status</th>
                    <th>Update Terakhir</th>
                    <th className="text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {tarunaSubs.map((s) => {
                    const b = statusBadgeFor(s.status)
                    return (
                      <tr key={s.id} className="hover:bg-violet-50/30">
                        <td className="font-bold text-navy-900">Tahun {s.year}</td>
                        <td className="text-right font-bold">{fmtNum(s.id ? tarunaCount : 0)}</td>
                        <td>
                          <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold border', b.cls)}>
                            {b.label}
                          </span>
                        </td>
                        <td className="text-xs">{fmtDateTime(s.updatedAt) || '—'}</td>
                        <td className="text-center">
                          <Link
                            to="/upt/penyerapan/taruna"
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1.5 rounded-lg bg-navy-800 text-white hover:bg-navy-700 transition-colors"
                            title="Kelola Data Taruna"
                          >
                            <IconEdit className="h-3 w-3" />
                            <span className="hidden sm:inline">Kelola</span>
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tabel Riwayat Laporan Penyerapan ── */}
      {(filterType === 'penyerapan' || filterType === 'semua') && (
        <div className="card overflow-hidden border-surface-border shadow-card">
          <div className="card-header bg-emerald-50/50 border-b border-surface-border">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
                <IconGraduation className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-extrabold text-navy-900">Rekap Penyerapan Bulanan {year}</p>
                <p className="text-xs text-navy-400">Riwayat laporan penyerapan lulusan per bulan</p>
              </div>
            </div>
            <span className="text-xs font-bold text-navy-500 bg-emerald-100 rounded-full px-3 py-1">
              {penyerapanSubs.length} laporan
            </span>
          </div>
          {loading ? (
            <SkeletonRows rows={3} />
          ) : penyerapanSubs.length === 0 ? (
            <EmptyState icon={<IconGraduation className="h-6 w-6" />} title="Belum ada laporan penyerapan" desc={`Belum ada laporan penyerapan untuk tahun ${year}.`} />
          ) : (
            <div className="table-wrap overflow-x-auto">
              <table className="data-table" style={{ tableLayout: 'fixed', width: '100%' }}>
                <thead>
                  <tr>
                    <th>Bulan</th>
                    <th className="text-right">Taruna Dilaporkan</th>
                    <th>Status</th>
                    <th>Update Terakhir</th>
                    <th className="text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {penyerapanSubs.map((s) => {
                    const b = statusBadgeFor(s.status)
                    const periodLabel = s.periodName ? `${s.periodName}` : (s.month ? MONTHS[s.month - 1] : `TW ${s.quarter}`)
                    return (
                      <tr key={s.id} className="hover:bg-emerald-50/30">
                        <td className="font-bold text-navy-900">{periodLabel}</td>
                        <td className="text-right font-bold">{fmtNum(s.recordsCount || 0)}</td>
                        <td>
                          <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold border', b.cls)}>
                            {b.label}
                          </span>
                        </td>
                        <td className="text-xs">{fmtDateTime(s.updatedAt) || '—'}</td>
                        <td className="text-center">
                          <Link
                            to="/upt/penyerapan/input"
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1.5 rounded-lg bg-navy-800 text-white hover:bg-navy-700 transition-colors"
                            title="Buka Input Penyerapan"
                          >
                            <IconEdit className="h-3 w-3" />
                            <span className="hidden sm:inline">Input</span>
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Modal Ajukan Unlock ── */}
      <Modal
        open={unlockModalOpen}
        onClose={() => setUnlockModalOpen(false)}
        title={unlockType === 'target_pk' ? 'Ajukan Perubahan / Unlock Target PK' : 'Ajukan Unlock Laporan Realisasi'}
        subtitle={unlockType === 'target_pk' ? `Kirim permohonan pembukaan kunci Target PK ${year} (satu kali input).` : `Kirim permohonan pembukaan kunci realisasi bulan ${selectedUnlockMonth ? MONTHS[selectedUnlockMonth - 1] : ''} ${year}.`}
      >
        <form onSubmit={handleSubmitUnlockRequest} className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 leading-relaxed">
            <p className="font-extrabold text-amber-950 mb-1">
              🔒 {unlockType === 'target_pk' ? 'Target PK Telah Disetujui & Terkunci' : 'Laporan Telah Terkunci (Final)'}
            </p>
            {unlockType === 'target_pk'
              ? 'Target PK ini sudah disetujui. Apabila terdapat perubahan target, sebutkan alasan pengajuan unlock perubahan Target PK di bawah ini agar disetujui oleh Pimpinan UPT.'
              : 'Laporan ini sudah bersifat final. Apabila terdapat perbaikan atau pengkinian data, sebutkan alasan spesifik di bawah ini agar Admin BPSDMP dapat membuka kunci pengeditan.'}
          </div>
          <div>
            <label className="form-label mb-1 block" htmlFor="unlock-reason">
              Alasan Pengajuan {unlockType === 'target_pk' ? 'Perubahan Target PK' : 'Unlock Laporan'} <span className="text-red-500">*</span>
            </label>
            <textarea
              id="unlock-reason"
              rows={3}
              className="form-input w-full text-xs font-medium"
              placeholder={unlockType === 'target_pk' ? 'Contoh: Terdapat penyesuaian target kuota diklat pembentukan...' : 'Contoh: Terdapat perbaikan data lulusan diklat pembentukan...'}
              value={unlockReason}
              onChange={(e) => setUnlockReason(e.target.value)}
              required
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setUnlockModalOpen(false)} disabled={submittingUnlock}>
              Batal
            </button>
            <button type="submit" className="btn-primary min-w-[140px]" disabled={submittingUnlock}>
              {submittingUnlock ? 'Mengirim...' : 'Kirim Permohonan'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

/* ─── MiniStat Card ─────────────────────────────────────────── */
function MiniStat({ icon, label, value, tone }) {
  const tones = {
    navy: 'bg-navy-900 text-white',
    gold: 'bg-gold-500 text-white',
    sky: 'bg-sky-600 text-white',
    emerald: 'bg-emerald-600 text-white',
  }
  return (
    <div className="card p-3.5 flex items-center gap-3 border-surface-border shadow-sm hover:shadow-card transition-shadow">
      <div className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', tones[tone] || tones.navy)}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-navy-500 truncate">{label}</p>
        <p className="text-sm font-black text-navy-950 truncate tabular-nums">{value}</p>
      </div>
    </div>
  )
}

/* ─── MonthRow (accordion row) ────────────────────────────────── */
function MonthRow({ m, isOpen, onToggle, onUnlock, onPdf, children }) {
  const locked = m.locked
  const monthIdx = m.month - 1
  const shortMonth = MONTHS[monthIdx]?.slice(0, 3) || ''

  return (
    <>
      <tr
        className={clsx(
          'cursor-pointer transition-colors group',
          isOpen
            ? 'bg-navy-50 border-l-4 border-l-navy-700'
            : 'hover:bg-navy-50/50 border-l-4 border-l-transparent hover:border-l-navy-300'
        )}
        onClick={onToggle}
      >
        {/* Chevron */}
        <td className="text-center">
          <span className={clsx(
            'inline-flex h-6 w-6 items-center justify-center rounded-full transition-all duration-200',
            isOpen ? 'bg-navy-800 text-white' : 'bg-navy-100 text-navy-400 group-hover:bg-navy-200'
          )}>
            <IconChevronDown className={clsx('h-3.5 w-3.5 transition-transform duration-200', isOpen && 'rotate-180')} />
          </span>
        </td>

        {/* Bulan */}
        <td>
          <div className="flex items-center gap-2">
            <div className={clsx(
              'h-7 w-7 shrink-0 flex items-center justify-center rounded-lg text-[10px] font-black',
              locked ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
            )}>
              {shortMonth}
            </div>
            <p className="text-sm font-extrabold text-navy-950 truncate">{MONTHS[monthIdx] || '-'}</p>
          </div>
        </td>

        {/* Total Peserta */}
        <td className="td-number">
          <span className="text-sm font-bold text-navy-800 tabular-nums">{fmtNum(m.totalPeserta)}</span>
        </td>

        {/* Total Lulusan */}
        <td className="td-number">
          <span className="text-sm font-bold text-navy-800 tabular-nums">{fmtNum(m.totalLulusan)}</span>
        </td>

        {/* Jumlah Total */}
        <td className="text-center">
          <span className="text-sm font-black text-navy-950 tabular-nums">{fmtNum(m.total)}</span>
        </td>

        {/* Status Badge — real-time posisi */}
        <td>
          <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold border whitespace-nowrap', m.statusCls || (m.locked ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-amber-50 text-amber-700 border-amber-300'))}>
            <span className={clsx('h-1.5 w-1.5 rounded-full', m.statusKey === 'TERKUNCI' ? 'bg-emerald-500' : m.statusKey?.startsWith('PENDING') ? 'bg-amber-500' : m.statusKey === 'DITOLAK' ? 'bg-red-500' : 'bg-slate-400')} />
            {m.statusLabel || (m.locked ? 'Terkirim' : 'Draf')}
          </span>
        </td>

        {/* Posisi / Disetujui Oleh */}
        <td>
          <div className="text-xs leading-tight min-w-0 max-w-[160px]">
            {m.approvedBy ? (
              <p className="font-semibold text-emerald-700 truncate" title={m.approvedBy}>✓ {m.approvedBy}</p>
            ) : m.sub?.status === 'pending_pimpinan' ? (
              <p className="text-amber-700 font-medium">Menunggu Pimpinan</p>
            ) : m.sub?.status === 'pending_bpsdmp' ? (
              <p className="text-sky-700 font-medium">Menunggu BPSDMP</p>
            ) : m.sub?.status === 'pending_pusbang' ? (
              <p className="text-violet-700 font-medium">Menunggu Pusbang</p>
            ) : m.sub?.status === 'rejected' ? (
              <p className="text-red-600 font-medium truncate" title={m.sub.rejectNote || ''}>Ditolak{m.sub.rejectNote ? `: ${m.sub.rejectNote}` : ''}</p>
            ) : (
              <p className="text-slate-400">—</p>
            )}
            {m.sub && <p className="text-[10px] text-slate-400 truncate">Posisi: {m.sub.status}</p>}
          </div>
        </td>

        {/* Update Terakhir */}
        <td>
          <span className="text-xs text-navy-600 tabular-nums font-medium leading-tight">
            {fmtDateTime(m.updatedAt) || '—'}
          </span>
        </td>

        {/* Aksi */}
        <td className="text-center" onClick={(e) => e.stopPropagation()}>
          {locked ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100 transition-colors"
              onClick={onUnlock}
              title="Laporan terkunci. Klik untuk mengajukan unlock ke Admin"
            >
              <IconLock className="h-3 w-3" />
              <span className="hidden sm:inline">Unlock</span>
            </button>
          ) : (
            <Link
              to="/upt/input"
              className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1.5 rounded-lg bg-navy-800 text-white hover:bg-navy-700 transition-colors"
              title={`Edit ${MONTHS[monthIdx]}`}
            >
              <IconEdit className="h-3 w-3" />
              <span className="hidden sm:inline">Edit</span>
            </Link>
          )}
        </td>
      </tr>
      {children}
    </>
  )
}

/* ─── DetailTable (expanded per program) ──────────────────────── */
function DetailTable({ rows, locked }) {
  return (
    <div className="px-4 sm:px-6 py-3 border-t border-navy-100">
      {/* Header detail */}
      <div className="flex items-center gap-2 mb-2.5">
        <div className={clsx(
          'h-5 w-1 rounded-full',
          locked ? 'bg-emerald-500' : 'bg-amber-500'
        )} />
        <p className="text-xs font-extrabold text-navy-700 uppercase tracking-wider">Detail Per Program</p>
        {locked && (
          <span className="ml-auto flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
            <IconLock className="h-2.5 w-2.5" /> Data Terkunci
          </span>
        )}
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-navy-400 border-b border-navy-100">
            <th className="py-2 w-7 text-left">#</th>
            <th className="py-2 text-left">Program</th>
            <th className="py-2 text-right">Peserta L</th>
            <th className="py-2 text-right">Peserta P</th>
            <th className="py-2 text-right">Lulusan L</th>
            <th className="py-2 text-right">Lulusan P</th>
            <th className="py-2 text-right font-black text-navy-600">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ program, real }, i) => {
            const isParent = program.isParent
            const hasData = !!real && (
              (Number(real.pesertaL) || 0) + (Number(real.pesertaP) || 0) +
              (Number(real.lulusanL) || 0) + (Number(real.lulusanP) || 0)
            ) > 0
            const total = real
              ? (Number(real.pesertaL) || 0) + (Number(real.pesertaP) || 0) +
                (Number(real.lulusanL) || 0) + (Number(real.lulusanP) || 0)
              : 0
            return (
              <tr
                key={program.id}
                className={clsx(
                  'border-b border-navy-50/80 transition-colors',
                  isParent ? 'bg-navy-50/40' : 'hover:bg-navy-50/20'
                )}
              >
                <td className="py-2 text-navy-300 text-[11px] font-bold">{i + 1}</td>
                <td className={clsx(
                  'py-2 text-xs',
                  isParent ? 'font-extrabold text-navy-900' : 'pl-4 text-navy-700 font-medium'
                )}>
                  {!isParent && <span className="text-navy-300 mr-1">↳</span>}
                  {program.name}
                </td>
                {['pesertaL', 'pesertaP', 'lulusanL', 'lulusanP'].map((key) => (
                  <td key={key} className="py-2 text-right tabular-nums text-xs">
                    {real && (Number(real[key]) || 0) > 0
                      ? <span className="font-bold text-navy-900">{fmtNum(Number(real[key]))}</span>
                      : <span className="text-navy-200">—</span>
                    }
                  </td>
                ))}
                <td className="py-2 text-right font-black tabular-nums text-xs">
                  {hasData
                    ? <span className="text-navy-950">{fmtNum(total)}</span>
                    : <span className="text-navy-200">—</span>
                  }
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
