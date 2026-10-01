import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import api, { apiError } from '../../lib/api'
import { Alert, EmptyState, SkeletonRows, Spinner, Modal, ConfirmDialog } from '../../components/ui'
import {
  IconCheckSquare, IconCheck, IconX, IconRefresh, IconEye, IconDownload,
  IconTarget, IconFileText, IconPeople, IconGraduation, IconUnlock,
  IconSearch, IconHistory, IconChevronDown, IconBuilding, IconLayers,
  IconClock, IconCheckCircle, IconXCircle, IconFilter,
} from '../../components/icons'
import { useToast } from '../../components/Toast'
import { buildRealisasiPdf } from '../../utils/realisasiPdf'
import { fmtDate, fmtNum, yearOptions } from '../../utils/format'
import logoBpsdm from '../../assets/logo-bpsdm.png'

const MATRA_OPTIONS = [
  { id: 'all', label: 'Semua Matra' },
  { id: 'laut', label: 'Matra Laut' },
  { id: 'darat', label: 'Matra Darat' },
  { id: 'udara', label: 'Matra Udara' },
]

export default function AdminApprovalHubPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const modeParam = searchParams.get('mode') || 'pending'
  const categoryParam = searchParams.get('category') || 'all'

  const [mode, setMode] = useState(modeParam)
  const [category, setCategory] = useState(categoryParam)
  const [year, setYear] = useState(new Date().getFullYear())
  const [selectedMatra, setSelectedMatra] = useState('all')
  const [search, setSearch] = useState('')

  // Raw data
  const [targets, setTargets] = useState([])
  const [targetsProc, setTargetsProc] = useState([])
  const [subs, setSubs] = useState([])
  const [subsProc, setSubsProc] = useState([])
  const [tarunaSubs, setTarunaSubs] = useState([])
  const [absSubs, setAbsSubs] = useState([])
  const [unlockReqs, setUnlockReqs] = useState([])
  const [unlockProc, setUnlockProc] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [acting, setActing] = useState(null)

  // Sync state with URL params
  useEffect(() => {
    if (modeParam && modeParam !== mode) setMode(modeParam)
    if (categoryParam && categoryParam !== category) setCategory(categoryParam)
  }, [modeParam, categoryParam])

  const updateUrlParams = (newMode, newCat) => {
    const params = new URLSearchParams(searchParams)
    if (newMode) params.set('mode', newMode)
    if (newCat) params.set('category', newCat)
    setSearchParams(params, { replace: true })
  }

  const handleModeChange = (m) => {
    setMode(m)
    updateUrlParams(m, category)
  }

  const handleCategoryChange = (c) => {
    setCategory(c)
    updateUrlParams(mode, c)
  }

  // Modals
  const [realisasiModalOpen, setRealisasiModalOpen] = useState(false)
  const [realisasiDetail, setRealisasiDetail] = useState(null)
  const [loadingRealisasiDetail, setLoadingRealisasiDetail] = useState(false)

  const [targetModalOpen, setTargetModalOpen] = useState(false)
  const [targetDetail, setTargetDetail] = useState(null)
  const [targetItem, setTargetItem] = useState(null)
  const [targetReview, setTargetReview] = useState(null)
  const [loadingTargetDetail, setLoadingTargetDetail] = useState(false)

  const [tarunaModalOpen, setTarunaModalOpen] = useState(false)
  const [tarunaDetail, setTarunaDetail] = useState(null)
  const [tarunaList, setTarunaList] = useState([])
  const [loadingTarunas, setLoadingTarunas] = useState(false)
  const [tarunaSearchInModal, setTarunaSearchInModal] = useState('')

  // Penyerapan Detail Modal
  const [absModalOpen, setAbsModalOpen] = useState(false)
  const [absDetail, setAbsDetail] = useState(null)
  const [absPreviewData, setAbsPreviewData] = useState(null)
  const [loadingAbsPreview, setLoadingAbsPreview] = useState(false)

  // Generic Confirm / Note Dialog
  const [confirmState, setConfirmState] = useState({
    open: false,
    title: '',
    message: '',
    confirmText: 'Konfirmasi',
    confirmColor: 'primary',
    requiresNote: false,
    noteLabel: 'Catatan / Alasan:',
    notePlaceholder: '',
    onConfirm: null,
  })
  const [noteInput, setNoteInput] = useState('')

  // Data Fetching
  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [
        targetInboxRes, targetProcRes,
        subInboxRes, subProcRes,
        tarunaRes,
        absRes,
        unlockRes, unlockProcRes,
      ] = await Promise.all([
        api.get('/targets/submissions/inbox').catch(() => ({ data: { targetSubmissions: [] } })),
        api.get('/targets/submissions/processed').catch(() => ({ data: { targetSubmissions: [] } })),
        api.get('/submissions/inbox').catch(() => ({ data: { submissions: [] } })),
        api.get('/submissions/processed').catch(() => ({ data: { submissions: [] } })),
        api.get('/absorptions/taruna-submissions/admin/inbox', { params: { year } }).catch(() => ({ data: { submissions: [] } })),
        api.get('/absorptions/admin/inbox', { params: { year } }).catch(() => ({ data: { submissions: [] } })),
        api.get('/unlock-requests/inbox').catch(() => ({ data: { requests: [] } })),
        api.get('/unlock-requests/processed').catch(() => ({ data: { requests: [] } })),
      ])

      // SINGLE-INPUT: hanya pengajuan satu kali per tahun (month=0); baris bulanan lama disembunyikan
      setTargets((targetInboxRes.data.targetSubmissions || []).filter((t) => Number(t.month) === 0))
      setTargetsProc((targetProcRes.data.targetSubmissions || []).filter((t) => Number(t.month) === 0))
      setSubs(subInboxRes.data.submissions || [])
      setSubsProc(subProcRes.data.submissions || [])
      setTarunaSubs(tarunaRes.data.submissions || [])
      setAbsSubs(absRes.data.submissions || [])

      const inboxUnlocks = unlockRes.data.requests || []
      setUnlockReqs(Array.isArray(inboxUnlocks) ? inboxUnlocks : [])
      const procUnlocks = unlockProcRes.data.requests || []
      setUnlockProc(Array.isArray(procUnlocks) ? procUnlocks : [])
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Normalizer: transform diverse objects into a unified shape
  const pendingItems = useMemo(() => {
    const list = []

    // 1. Target PK Pending Final BPSDMP
    targets.forEach((t) => {
      list.push({
        id: `t-${t.id}`,
        rawId: t.id,
        category: 'target',
        categoryLabel: 'Target PK',
        badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        icon: IconTarget,
        title: `Target PK Tahun ${t.year} (satu kali input)`,
        uptName: t.uptName || t.uptCode || 'UPT',
        uptCode: t.uptCode || '',
        matra: t.matra || '',
        subtitle: `${t.uptName || t.uptCode || 'UPT'} • ${t.programsCount || 0} Program Kerja`,
        date: t.submittedAt || t.updatedAt || t.createdAt,
        status: t.status,
        statusLabel: 'Menunggu Pengesahan Final BPSDMP',
        raw: t,
      })
    })

    // 2. Laporan Realisasi Bulanan Pending Final BPSDMP
    subs.forEach((s) => {
      list.push({
        id: `s-${s.id}`,
        rawId: s.id,
        category: 'realisasi',
        categoryLabel: 'Laporan Realisasi',
        badgeColor: 'bg-sky-50 text-sky-700 border-sky-200',
        icon: IconFileText,
        title: `Laporan Realisasi Bulan ${s.month} Tahun ${s.year}`,
        uptName: s.uptName || s.uptCode || 'UPT',
        uptCode: s.uptCode || '',
        matra: s.matra || '',
        subtitle: `${s.uptName || s.uptCode || 'UPT'} • Capaian ${s.pctTotal != null ? `${Number(s.pctTotal).toFixed(1)}%` : '-'}`,
        date: s.submittedAt || s.createdAt,
        status: s.status,
        statusLabel: 'Menunggu Penguncian Final BPSDMP',
        raw: s,
      })
    })

    // 3. Master Data Taruna Pending BPSDMP
    tarunaSubs
      .filter((ts) => ts.status === 'submitted_admin')
      .forEach((ts) => {
        list.push({
          id: `ts-${ts.id}`,
          rawId: ts.id,
          category: 'taruna',
          categoryLabel: 'Master Data Taruna',
          badgeColor: 'bg-violet-50 text-violet-700 border-violet-200',
          icon: IconPeople,
          title: `Master Data Taruna (Tahun ${ts.year})`,
          uptName: ts.uptName || ts.uptCode || 'UPT',
          uptCode: ts.uptCode || '',
          matra: ts.matra || '',
          subtitle: `${ts.uptName || ts.uptCode || 'UPT'} • ${ts.totalTaruna || 0} Taruna Terdaftar`,
          date: ts.submittedAt || ts.updatedAt || ts.createdAt,
          status: ts.status,
          statusLabel: 'Menunggu Pengesahan Nasional BPSDMP',
          raw: ts,
        })
      })

    // 4. Laporan Penyerapan Lulusan Pending Final BPSDMP
    absSubs
      .filter((as) => as.status === 'approved_pimpinan' || as.status === 'submitted_pimpinan')
      .forEach((as) => {
        list.push({
          id: `abs-${as.id}`,
          rawId: as.id,
          category: 'penyerapan',
          categoryLabel: 'Penyerapan Lulusan',
          badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
          icon: IconGraduation,
          title: `Laporan Penyerapan Lulusan ${as.periodName || as.quarterName || `Triwulan ${as.quarter}`} (${as.year})`,
          uptName: as.uptName || as.uptCode || 'UPT',
          uptCode: as.uptCode || '',
          matra: as.matra || '',
          subtitle: `${as.uptName || as.uptCode || 'UPT'} • ${as.recordsCount || 0} Taruna Dilaporkan`,
          date: as.approvedAt || as.submittedAt || as.updatedAt || as.createdAt,
          status: as.status,
          statusLabel: as.status === 'approved_pimpinan' ? 'Disetujui Pimpinan UPT (Menunggu Sah BPSDMP)' : 'Dikirim Admin UPT',
          raw: as,
        })
      })

    // 5. Unlock Requests Pending Final BPSDMP
    unlockReqs
      .filter((u) => u.status === 'pending_bpsdmp')
      .forEach((u) => {
        const typeLabel = u.type === 'taruna' ? 'Master Data Taruna' : u.type === 'target_pk' ? 'Target PK' : 'Capaian Realisasi'
        list.push({
          id: `u-${u.id}`,
          rawId: u.id,
          category: 'unlock',
          categoryLabel: 'Permohonan Buka Kunci',
          badgeColor: 'bg-amber-50 text-amber-800 border-amber-300',
          icon: IconUnlock,
          title: `Permohonan Unlock: ${typeLabel} ${u.year ? `(${u.year})` : ''}`,
          uptName: u.uptName || u.uptCode || 'UPT',
          uptCode: u.uptCode || '',
          matra: u.matra || '',
          subtitle: `${u.uptName || u.uptCode || 'UPT'} • Alasan: "${u.reason || '-'}"`,
          date: u.createdAt,
          status: u.status,
          statusLabel: 'Menunggu Persetujuan Final BPSDMP',
          raw: u,
        })
      })

    return list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
  }, [targets, subs, tarunaSubs, absSubs, unlockReqs])

  const historyItems = useMemo(() => {
    const list = []

    // 1. Target PK Processed
    targetsProc.forEach((t) => {
      const isApproved = t.status === 'approved_bpsdmp' || t.status === 'approved'
      list.push({
        id: `t-${t.id}`,
        rawId: t.id,
        category: 'target',
        categoryLabel: 'Target PK',
        badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        icon: IconTarget,
        title: `Target PK Tahun ${t.year} (satu kali input)`,
        uptName: t.uptName || t.uptCode || 'UPT',
        uptCode: t.uptCode || '',
        matra: t.matra || '',
        subtitle: `${t.uptName || t.uptCode || 'UPT'} • ${t.programsCount || 0} Program Kerja`,
        date: t.decidedAt || t.updatedAt || t.createdAt,
        status: t.status,
        statusLabel: isApproved ? 'Disetujui Final BPSDMP' : 'Ditolak',
        isApproved,
        raw: t,
      })
    })

    // 2. Realisasi Bulanan Processed
    subsProc.forEach((s) => {
      const isApproved = s.status === 'approved' || s.status === 'locked'
      list.push({
        id: `s-${s.id}`,
        rawId: s.id,
        category: 'realisasi',
        categoryLabel: 'Laporan Realisasi',
        badgeColor: 'bg-sky-50 text-sky-700 border-sky-200',
        icon: IconFileText,
        title: `Laporan Realisasi Bulan ${s.month} Tahun ${s.year}`,
        uptName: s.uptName || s.uptCode || 'UPT',
        uptCode: s.uptCode || '',
        matra: s.matra || '',
        subtitle: `${s.uptName || s.uptCode || 'UPT'} • Capaian ${s.pctTotal != null ? `${Number(s.pctTotal).toFixed(1)}%` : '-'}`,
        date: s.approvedAt || s.updatedAt || s.createdAt,
        status: s.status,
        statusLabel: isApproved ? 'Terkunci & Disahkan' : 'Ditolak',
        isApproved,
        raw: s,
      })
    })

    // 3. Master Data Taruna Processed
    tarunaSubs
      .filter((ts) => ts.status !== 'submitted_admin')
      .forEach((ts) => {
        const isApproved = ts.status === 'approved_admin'
        list.push({
          id: `ts-${ts.id}`,
          rawId: ts.id,
          category: 'taruna',
          categoryLabel: 'Master Data Taruna',
          badgeColor: 'bg-violet-50 text-violet-700 border-violet-200',
          icon: IconPeople,
          title: `Master Data Taruna (Tahun ${ts.year})`,
          uptName: ts.uptName || ts.uptCode || 'UPT',
          uptCode: ts.uptCode || '',
          matra: ts.matra || '',
          subtitle: `${ts.uptName || ts.uptCode || 'UPT'} • ${ts.totalTaruna || 0} Taruna`,
          date: ts.updatedAt || ts.createdAt,
          status: ts.status,
          statusLabel: isApproved ? 'Disahkan 1 Tahun Penuh' : 'Ditolak',
          isApproved,
          raw: ts,
        })
      })

    // 4. Penyerapan Lulusan Processed
    absSubs
      .filter((as) => as.status === 'approved_bpsdmp' || as.status === 'rejected_bpsdmp')
      .forEach((as) => {
        const isApproved = as.status === 'approved_bpsdmp'
        list.push({
          id: `abs-${as.id}`,
          rawId: as.id,
          category: 'penyerapan',
          categoryLabel: 'Penyerapan Lulusan',
          badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
          icon: IconGraduation,
          title: `Laporan Penyerapan Lulusan ${as.periodName || as.quarterName || `Triwulan ${as.quarter}`} (${as.year})`,
          uptName: as.uptName || as.uptCode || 'UPT',
          uptCode: as.uptCode || '',
          matra: as.matra || '',
          subtitle: `${as.uptName || as.uptCode || 'UPT'} • ${as.recordsCount || 0} Taruna Dilaporkan`,
          date: as.approvedAt || as.rejectedAt || as.updatedAt || as.createdAt,
          status: as.status,
          statusLabel: isApproved ? 'Disahkan Final BPSDMP' : 'Ditolak BPSDMP',
          isApproved,
          raw: as,
        })
      })

    // 5. Unlock Requests Processed (riwayat: disetujui final / ditolak)
    unlockProc
      .forEach((u) => {
        const typeLabel = u.type === 'taruna' ? 'Master Data Taruna' : u.type === 'target_pk' ? 'Target PK' : 'Capaian Realisasi'
        const isApproved = u.status === 'approved'
        list.push({
          id: `u-${u.id}`,
          rawId: u.id,
          category: 'unlock',
          categoryLabel: 'Permohonan Buka Kunci',
          badgeColor: 'bg-amber-50 text-amber-800 border-amber-300',
          icon: IconUnlock,
          title: `Permohonan Unlock: ${typeLabel} ${u.year ? `(${u.year})` : ''}`,
          uptName: u.uptName || u.uptCode || 'UPT',
          uptCode: u.uptCode || '',
          matra: u.matra || '',
          subtitle: `${u.uptName || u.uptCode || 'UPT'} • Alasan: "${u.reason || '-'}"`,
          date: u.updatedAt || u.createdAt,
          status: u.status,
          statusLabel: isApproved ? 'Disetujui (Data Terbuka)' : 'Ditolak',
          isApproved,
          raw: u,
        })
      })

    return list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
  }, [targetsProc, subsProc, tarunaSubs, absSubs, unlockProc])

  // Counters for badges
  const pendingCounts = useMemo(() => {
    return {
      all: pendingItems.length,
      target: pendingItems.filter((i) => i.category === 'target').length,
      realisasi: pendingItems.filter((i) => i.category === 'realisasi').length,
      taruna: pendingItems.filter((i) => i.category === 'taruna').length,
      penyerapan: pendingItems.filter((i) => i.category === 'penyerapan').length,
      unlock: pendingItems.filter((i) => i.category === 'unlock').length,
    }
  }, [pendingItems])

  const historyCounts = useMemo(() => {
    return {
      all: historyItems.length,
      target: historyItems.filter((i) => i.category === 'target').length,
      realisasi: historyItems.filter((i) => i.category === 'realisasi').length,
      taruna: historyItems.filter((i) => i.category === 'taruna').length,
      penyerapan: historyItems.filter((i) => i.category === 'penyerapan').length,
      unlock: historyItems.filter((i) => i.category === 'unlock').length,
    }
  }, [historyItems])

  const currentCounts = mode === 'pending' ? pendingCounts : historyCounts

  // Filtered display items (Matra + Category + Search)
  const displayItems = useMemo(() => {
    const source = mode === 'pending' ? pendingItems : historyItems
    return source.filter((item) => {
      // Matra filter
      if (selectedMatra !== 'all' && (item.matra || '').toLowerCase() !== selectedMatra.toLowerCase()) {
        return false
      }
      // Category filter
      if (category !== 'all' && item.category !== category) {
        return false
      }
      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchTitle = item.title.toLowerCase().includes(q)
        const matchSub = item.subtitle.toLowerCase().includes(q)
        const matchUpt = (item.uptName || '').toLowerCase().includes(q) || (item.uptCode || '').toLowerCase().includes(q)
        if (!matchTitle && !matchSub && !matchUpt) return false
      }
      return true
    })
  }, [mode, pendingItems, historyItems, selectedMatra, category, search])

  // DETAIL HANDLERS
  const handleOpenDetail = async (item) => {
    if (item.category === 'realisasi') {
      setRealisasiModalOpen(true)
      setLoadingRealisasiDetail(true)
      setRealisasiDetail(null)
      try {
        const { data } = await api.get(`/submissions/${item.rawId}/detail`)
        setRealisasiDetail(data)
      } catch (err) {
        toast.error('Gagal memuat detail', apiError(err))
        setRealisasiModalOpen(false)
      } finally {
        setLoadingRealisasiDetail(false)
      }
    } else if (item.category === 'target') {
      setTargetDetail(item.raw)
      setTargetItem(item)
      setTargetReview(null)
      setTargetModalOpen(true)
      setLoadingTargetDetail(true)
      try {
        const { data } = await api.get(`/targets/submissions/${item.rawId}/detail`)
        setTargetReview(data)
      } catch (err) {
        toast.error('Gagal memuat rincian target', apiError(err))
      } finally {
        setLoadingTargetDetail(false)
      }
    } else if (item.category === 'taruna') {
      setTarunaDetail(item.raw)
      setTarunaSearchInModal('')
      setTarunaModalOpen(true)
      setLoadingTarunas(true)
      try {
        const { data: res } = await api.get(`/absorptions/taruna-submissions/admin/${item.rawId}/detail`)
        setTarunaList(res.tarunas || [])
      } catch (err) {
        toast.error('Gagal memuat detail taruna', apiError(err))
      } finally {
        setLoadingTarunas(false)
      }
    } else if (item.category === 'penyerapan') {
      setAbsDetail(item.raw)
      setAbsModalOpen(true)
      setLoadingAbsPreview(true)
      try {
        const { data: res } = await api.get('/absorptions/my', {
          params: { uptId: item.raw.uptId, year: item.raw.year, month: item.raw.month, quarter: item.raw.quarter }
        })
        setAbsPreviewData(res)
      } catch (err) {
        toast.error('Gagal memuat rincian penyerapan', apiError(err))
      } finally {
        setLoadingAbsPreview(false)
      }
    } else if (item.category === 'unlock') {
      setConfirmState({
        open: true,
        title: 'Detail Permohonan Buka Kunci',
        message: `Instansi: ${item.uptName} (${item.uptCode})\nJenis: ${item.title}\nAlasan: "${item.raw.reason || '-'}"\nDiajukan: ${fmtDate(item.date)}`,
        confirmText: 'Tutup',
        confirmColor: 'neutral',
        requiresNote: false,
        onConfirm: () => setConfirmState((p) => ({ ...p, open: false })),
      })
    }
  }

  // ACTION HANDLERS (Final Approve / Reject)
  const triggerApprove = (item) => {
    if (item.category === 'target') {
      setConfirmState({
        open: true,
        title: 'Sahkan Target PK Final?',
        message: `Target PK ${item.title} untuk ${item.uptName} akan disetujui final. Target resmi terkunci untuk pedoman pelaporan realisasi UPT.`,
        confirmText: 'Ya, Sahkan Final',
        confirmColor: 'primary',
        requiresNote: false,
        onConfirm: async () => {
          setActing(item.id)
          try {
            const { data } = await api.patch(`/targets/submissions/${item.rawId}/approve-bpsdmp`)
            toast.success('Target PK Disetujui Final', data.message)
            await loadAll()
            setTargetModalOpen(false)
          } catch (err) {
            toast.error('Gagal menyetujui', apiError(err))
          } finally {
            setActing(null)
          }
        },
      })
    } else if (item.category === 'realisasi') {
      setConfirmState({
        open: true,
        title: 'Kunci & Sahkan Laporan Realisasi?',
        message: `Laporan Realisasi Bulan ${item.raw.month} ${item.uptName} akan disahkan dan dikunci secara permanen di database nasional BPSDMP.`,
        confirmText: 'Ya, Kunci Laporan',
        confirmColor: 'primary',
        requiresNote: false,
        onConfirm: async () => {
          setActing(item.id)
          try {
            const { data } = await api.patch(`/submissions/${item.rawId}/lock`)
            toast.success('Laporan Resmi Dikunci', data.message)
            await loadAll()
            setRealisasiModalOpen(false)
          } catch (err) {
            toast.error('Gagal mengunci laporan', apiError(err))
          } finally {
            setActing(null)
          }
        },
      })
    } else if (item.category === 'taruna') {
      setConfirmState({
        open: true,
        title: 'Sahkan Master Data Taruna?',
        message: `Master Data Taruna (${item.raw.totalTaruna} Taruna) untuk ${item.uptName} akan disahkan secara nasional untuk 1 tahun penuh. Akses input formulir penyerapan triwulan UPT akan otomatis terbuka.`,
        confirmText: 'Ya, Sahkan Data Taruna',
        confirmColor: 'primary',
        requiresNote: true,
        noteLabel: 'Catatan Pengesahan (Opsional):',
        notePlaceholder: 'Catatan resmi BPSDMP...',
        onConfirm: async () => {
          setActing(item.id)
          try {
            const { data } = await api.patch(`/absorptions/taruna-submissions/${item.rawId}/approve-admin`, { notes: noteInput })
            toast.success('Data Taruna Disahkan', data.message)
            await loadAll()
            setTarunaModalOpen(false)
          } catch (err) {
            toast.error('Gagal menyetujui', apiError(err))
          } finally {
            setActing(null)
          }
        },
      })
    } else if (item.category === 'penyerapan') {
      setConfirmState({
        open: true,
        title: 'Sahkan Laporan Penyerapan Bulanan?',
        message: `Laporan Penyerapan ${item.raw.periodName || item.raw.quarterName || `Triwulan ${item.raw.quarter}`} (${item.uptName}) akan disahkan dan dikunci secara nasional oleh BPSDMP.`,
        confirmText: 'Ya, Sahkan Penyerapan',
        confirmColor: 'primary',
        requiresNote: true,
        noteLabel: 'Catatan Pengesahan (Opsional):',
        notePlaceholder: 'Catatan arahan BPSDMP...',
        onConfirm: async () => {
          setActing(item.id)
          try {
            const { data } = await api.post('/absorptions/admin/review', {
              submissionId: item.rawId,
              action: 'approve',
              notes: noteInput,
            })
            toast.success('Laporan Penyerapan Disahkan', data.message)
            await loadAll()
          } catch (err) {
            toast.error('Gagal mengesahkan penyerapan', apiError(err))
          } finally {
            setActing(null)
          }
        },
      })
    } else if (item.category === 'unlock') {
      setConfirmState({
        open: true,
        title: 'Buka Kunci Data (Persetujuan Final BPSDMP)?',
        message: `Permohonan buka kunci ${item.title} untuk ${item.uptName} akan disetujui. Status data di UPT terkait akan kembali terbuka menjadi draft sehingga dapat diubah/ditambah kembali.`,
        confirmText: 'Ya, Buka Kunci Data',
        confirmColor: 'primary',
        requiresNote: true,
        noteLabel: 'Catatan Persetujuan (Opsional):',
        notePlaceholder: 'Catatan arahan BPSDMP...',
        onConfirm: async () => {
          setActing(item.id)
          try {
            const { data } = await api.patch(`/unlock-requests/${item.rawId}/decision`, { decision: 'approve', note: noteInput })
            toast.success('Data Berhasil Terbuka', data.message || 'Data UPT telah terbuka kembali')
            await loadAll()
          } catch (err) {
            toast.error('Gagal membuka kunci', apiError(err))
          } finally {
            setActing(null)
          }
        },
      })
    }
  }

  const triggerReject = (item) => {
    setNoteInput('')
    if (item.category === 'target') {
      setConfirmState({
        open: true,
        title: 'Tolak Target PK?',
        message: `Target PK ${item.uptName} akan dikembalikan ke status draft dan UPT terkait wajib memperbaikinya.`,
        confirmText: 'Tolak Pengajuan',
        confirmColor: 'danger',
        requiresNote: true,
        noteLabel: 'Alasan Penolakan:',
        notePlaceholder: 'Tuliskan alasan penolakan dan instruksi perbaikan...',
        onConfirm: async () => {
          if (!noteInput.trim()) {
            toast.error('Alasan penolakan wajib diisi')
            return false
          }
          setActing(item.id)
          try {
            const { data } = await api.patch(`/targets/submissions/${item.rawId}/reject-bpsdmp`, { note: noteInput })
            toast.success('Target PK Ditolak', data.message)
            await loadAll()
            setTargetModalOpen(false)
          } catch (err) {
            toast.error('Gagal menolak', apiError(err))
          } finally {
            setActing(null)
          }
        },
      })
    } else if (item.category === 'realisasi') {
      setConfirmState({
        open: true,
        title: 'Tolak Laporan Realisasi?',
        message: `Laporan akan dikembalikan ke Admin UPT dengan instruksi revisi.`,
        confirmText: 'Tolak Laporan',
        confirmColor: 'danger',
        requiresNote: true,
        noteLabel: 'Alasan Penolakan:',
        notePlaceholder: 'Tuliskan alasan penolakan laporan...',
        onConfirm: async () => {
          if (!noteInput.trim()) {
            toast.error('Alasan penolakan wajib diisi')
            return false
          }
          setActing(item.id)
          try {
            const { data } = await api.patch(`/submissions/${item.rawId}/reject`, { note: noteInput })
            toast.success('Laporan Ditolak', data.message)
            await loadAll()
            setRealisasiModalOpen(false)
          } catch (err) {
            toast.error('Gagal menolak', apiError(err))
          } finally {
            setActing(null)
          }
        },
      })
    } else if (item.category === 'taruna') {
      setConfirmState({
        open: true,
        title: 'Tolak Master Data Taruna?',
        message: `Master Data Taruna akan dikembalikan ke UPT ${item.uptName} untuk diperbaiki.`,
        confirmText: 'Tolak Data Taruna',
        confirmColor: 'danger',
        requiresNote: true,
        noteLabel: 'Alasan Penolakan:',
        notePlaceholder: 'Tuliskan catatan perbaikan data taruna...',
        onConfirm: async () => {
          if (!noteInput.trim()) {
            toast.error('Alasan penolakan wajib diisi')
            return false
          }
          setActing(item.id)
          try {
            const { data } = await api.patch(`/absorptions/taruna-submissions/${item.rawId}/reject-admin`, { notes: noteInput })
            toast.success('Data Taruna Ditolak', data.message)
            await loadAll()
            setTarunaModalOpen(false)
          } catch (err) {
            toast.error('Gagal menolak', apiError(err))
          } finally {
            setActing(null)
          }
        },
      })
    } else if (item.category === 'penyerapan') {
      setConfirmState({
        open: true,
        title: 'Tolak Laporan Penyerapan Bulanan?',
        message: `Laporan Penyerapan ${item.uptName} akan dikembalikan ke UPT untuk direvisi.`,
        confirmText: 'Tolak Laporan',
        confirmColor: 'danger',
        requiresNote: true,
        noteLabel: 'Alasan Penolakan:',
        notePlaceholder: 'Tuliskan alasan penolakan penyerapan...',
        onConfirm: async () => {
          if (!noteInput.trim()) {
            toast.error('Alasan penolakan wajib diisi')
            return false
          }
          setActing(item.id)
          try {
            const { data } = await api.post('/absorptions/admin/review', {
              submissionId: item.rawId,
              action: 'reject',
              notes: noteInput,
            })
            toast.success('Laporan Penyerapan Ditolak', data.message)
            await loadAll()
          } catch (err) {
            toast.error('Gagal menolak penyerapan', apiError(err))
          } finally {
            setActing(null)
          }
        },
      })
    } else if (item.category === 'unlock') {
      setConfirmState({
        open: true,
        title: 'Tolak Permohonan Buka Kunci?',
        message: `Permohonan buka kunci akan ditolak secara permanen dan data tetap terkunci.`,
        confirmText: 'Tolak Permohonan',
        confirmColor: 'danger',
        requiresNote: true,
        noteLabel: 'Alasan Penolakan:',
        notePlaceholder: 'Tuliskan alasan penolakan...',
        onConfirm: async () => {
          if (!noteInput.trim()) {
            toast.error('Alasan penolakan wajib diisi')
            return false
          }
          setActing(item.id)
          try {
            const { data } = await api.patch(`/unlock-requests/${item.rawId}/decision`, { decision: 'reject', note: noteInput })
            toast.success('Permohonan Ditolak', data.message || 'Permohonan berhasil ditolak')
            await loadAll()
          } catch (err) {
            toast.error('Gagal menolak permohonan', apiError(err))
          } finally {
            setActing(null)
          }
        },
      })
    }
  }

  // PDF Builder
  const handleDownloadRealisasiPdf = () => {
    if (!realisasiDetail) return
    try {
      const { submission, programs, upt } = realisasiDetail
      const rows = (programs || []).map((p) => ({
        id: p.programId,
        name: p.programName,
        isParent: p.isParent,
        isAutoSum: false,
        values: {
          pesertaL: p.pesertaL,
          pesertaP: p.pesertaP,
          lulusanL: p.lulusanL,
          lulusanP: p.lulusanP,
          instrukturL: p.instrukturL,
          instrukturP: p.instrukturP,
          serapanAnggaran: p.serapanAnggaran,
        },
      }))
      const doc = buildRealisasiPdf({
        uptName: upt?.name || 'UPT',
        uptCode: upt?.code || '',
        month: submission.month,
        year: submission.year,
        rows,
        status: submission.status,
        submittedAt: submission.submittedAt,
        approvedAt: submission.approvedAt,
        approverName: submission.approverName || 'Admin BPSDMP',
      })
      doc.save(`Laporan_Realisasi_${upt?.code || 'UPT'}_Bulan_${submission.month}_${submission.year}.pdf`)
    } catch (e) {
      toast.error('Gagal unduh PDF', e.message)
    }
  }

  return (
    <div className="space-y-6">
      {/* HEADER BANNER */}
      <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-indigo-950 text-white rounded-2xl p-5 md:p-6 shadow-xl border border-sky-800/40 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center p-2 shadow-inner border border-white/10 shrink-0">
              <img src={logoBpsdm} alt="BPSDM" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl md:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                  Pusat Persetujuan & Verifikasi
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-amber-400/20 text-amber-300 border border-amber-400/30">
                  Super Admin BPSDMP
                </span>
              </div>
              <p className="text-xs text-sky-200 mt-1 max-w-2xl">
                Otoritas persetujuan akhir tingkat nasional untuk Target PK, Penguncian Realisasi Bulanan, Master Data Taruna, Penyerapan Lulusan, serta Pembukaan Kunci (Unlock).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Matra Filter */}
            <div className="relative">
              <select
                value={selectedMatra}
                onChange={(e) => setSelectedMatra(e.target.value)}
                className="appearance-none bg-white/10 hover:bg-white/15 border border-white/20 rounded-xl px-4 py-2 pr-9 text-xs font-bold text-white transition focus:outline-none focus:ring-2 focus:ring-sky-400 cursor-pointer"
              >
                {MATRA_OPTIONS.map((m) => (
                  <option key={m.id} value={m.id} className="bg-slate-900 text-white">
                    {m.label}
                  </option>
                ))}
              </select>
              <IconChevronDown className="w-4 h-4 text-sky-300 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Year Filter */}
            <div className="relative">
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="appearance-none bg-white/10 hover:bg-white/15 border border-white/20 rounded-xl px-4 py-2 pr-9 text-xs font-bold text-white transition focus:outline-none focus:ring-2 focus:ring-sky-400 cursor-pointer"
              >
                {yearOptions().map((y) => (
                  <option key={y} value={y} className="bg-slate-900 text-white">
                    Tahun {y}
                  </option>
                ))}
              </select>
              <IconChevronDown className="w-4 h-4 text-sky-300 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <button
              onClick={loadAll}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-semibold text-white transition shadow-sm"
              title="Perbarui Data"
            >
              <IconRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI SUMMARY (6 CARDS) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-sm">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Menunggu</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-black text-slate-900">{pendingCounts.all}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Antrean</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-sm">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Target PK</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-black text-emerald-700">{pendingCounts.target}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Target</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-sm">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Laporan Realisasi</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-black text-sky-700">{pendingCounts.realisasi}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">Bulanan</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-sm">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Data Taruna</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-black text-violet-700">{pendingCounts.taruna}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-800">Master</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-sm">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Penyerapan</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-black text-indigo-700">{pendingCounts.penyerapan}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">Bulanan</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-sm">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Buka Kunci</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-black text-amber-700">{pendingCounts.unlock}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Unlock</span>
          </div>
        </div>
      </div>

      {/* TWO-TIER NAVIGATION: MODE + CATEGORY */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
        {/* Tier 1: Header Antrean & Tautan ke Riwayat */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-slate-900">
              <IconClock className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-xs font-bold">Antrean Persetujuan Final Aktif</span>
              <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-amber-500 text-white">
                {pendingCounts.all} Berkas
              </span>
            </div>

            <Link
              to="/admin/riwayat-pelaporan"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-navy-900 text-xs font-bold transition border border-slate-200 shadow-xs"
              title="Buka Pusat Arsip & Riwayat Pelaporan Nasional"
            >
              <IconHistory className="w-3.5 h-3.5 text-sky-600 shrink-0" />
              <span>Buka Riwayat & Arsip Pelaporan</span>
              <span className="text-slate-400 font-normal">→</span>
            </Link>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              placeholder="Cari nama UPT, kode, atau berkas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 transition"
            />
            <IconSearch className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          </div>
        </div>

        {/* Tier 2: Segmented Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-semibold no-scrollbar">
          {[
            { id: 'all', label: 'Semua Kategori', count: currentCounts.all },
            { id: 'target', label: 'Target PK', count: currentCounts.target },
            { id: 'realisasi', label: 'Laporan Realisasi', count: currentCounts.realisasi },
            { id: 'taruna', label: 'Master Data Taruna', count: currentCounts.taruna },
            { id: 'penyerapan', label: 'Penyerapan Lulusan', count: currentCounts.penyerapan },
            { id: 'unlock', label: 'Permohonan Buka Kunci', count: currentCounts.unlock },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleCategoryChange(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap transition ${
                category === tab.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  category === tab.id
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200/80 text-slate-600'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* CONTENT LIST */}
      {loading ? (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-3">
          <SkeletonRows count={5} />
        </div>
      ) : error ? (
        <Alert variant="error">{error}</Alert>
      ) : displayItems.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 border border-slate-200 shadow-sm text-center">
          <EmptyState
            title="Tidak Ada Berkas Menunggu Persetujuan"
            desc="Semua permohonan persetujuan final pada filter ini telah selesai diproses atau belum ada kiriman baru dari UPT. Anda dapat meninjau seluruh arsip berkas di menu Riwayat Pelaporan."
            action={
              <Link
                to="/admin/riwayat-pelaporan"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-navy-900 text-white hover:bg-slate-800 text-xs font-bold transition shadow-sm mt-3"
              >
                <IconHistory className="w-4 h-4 text-sky-400" />
                Buka Riwayat & Arsip Pelaporan →
              </Link>
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {displayItems.map((item) => {
            const IconComp = item.icon || IconFileText
            const isActing = acting === item.id

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-slate-200/90 hover:border-slate-300 p-4 md:p-5 shadow-sm hover:shadow transition flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Left Side: Identity & Meta */}
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-700 shrink-0 mt-0.5">
                    <IconComp className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${item.badgeColor}`}>
                        {item.categoryLabel}
                      </span>
                      {item.matra && (
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                          {item.matra}
                        </span>
                      )}
                      <span className="text-xs text-slate-400 font-medium">
                        Diajukan: {fmtDate(item.date)}
                      </span>
                    </div>

                    <h3 className="text-sm md:text-base font-bold text-slate-900 mt-1">
                      {item.title}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5 font-medium">
                      Instansi: <strong className="text-slate-800">{item.uptName}</strong> {item.uptCode && `(${item.uptCode})`} • {item.subtitle}
                    </p>

                    {/* Status Pill for History */}
                    {mode === 'history' && (
                      <div className="mt-2 flex items-center gap-1.5">
                        {item.isApproved ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            <IconCheckCircle className="w-3.5 h-3.5" />
                            {item.statusLabel}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                            <IconXCircle className="w-3.5 h-3.5" />
                            {item.statusLabel}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Side: Actions */}
                <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                  <button
                    onClick={() => handleOpenDetail(item)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition"
                  >
                    <IconEye className="w-3.5 h-3.5" />
                    <span>Detail Berkas</span>
                  </button>

                  {mode === 'pending' && (
                    <>
                      <button
                        onClick={() => triggerReject(item)}
                        disabled={isActing}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold transition disabled:opacity-50"
                      >
                        <IconX className="w-3.5 h-3.5" />
                        <span>Tolak</span>
                      </button>

                      <button
                        onClick={() => triggerApprove(item)}
                        disabled={isActing}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm hover:shadow disabled:opacity-50"
                      >
                        {isActing ? (
                          <Spinner size="xs" />
                        ) : (
                          <IconCheck className="w-3.5 h-3.5" />
                        )}
                        <span>Sahkan Final</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* MODAL 1: DETAIL REALISASI */}
      <Modal
        open={realisasiModalOpen}
        onClose={() => setRealisasiModalOpen(false)}
        title="Detail Laporan Realisasi Bulanan"
        size="2xl"
      >
        {loadingRealisasiDetail ? (
          <div className="p-8 text-center"><Spinner size="lg" /></div>
        ) : !realisasiDetail ? (
          <p className="text-sm text-slate-500">Data laporan tidak ditemukan.</p>
        ) : (
          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <p className="text-xs text-slate-500 font-bold uppercase">{realisasiDetail.upt?.name || 'UPT'}</p>
                <p className="text-base font-black text-slate-900">
                  Bulan {realisasiDetail.submission?.month} Tahun {realisasiDetail.submission?.year}
                </p>
              </div>
              <button
                onClick={handleDownloadRealisasiPdf}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition"
              >
                <IconDownload className="w-4 h-4" />
                <span>Unduh PDF Resmi</span>
              </button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 font-bold text-slate-700 uppercase border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Program Kerja</th>
                    <th className="p-2.5 text-center">Peserta</th>
                    <th className="p-2.5 text-center">Lulusan</th>
                    <th className="p-2.5 text-right">Serapan Anggaran</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(realisasiDetail.programs || []).map((p) => (
                    <tr key={p.programId} className={p.isParent ? 'bg-slate-50/50 font-bold' : ''}>
                      <td className="p-2.5">{p.programName}</td>
                      <td className="p-2.5 text-center">{fmtNum((p.pesertaL || 0) + (p.pesertaP || 0))}</td>
                      <td className="p-2.5 text-center">{fmtNum((p.lulusanL || 0) + (p.lulusanP || 0))}</td>
                      <td className="p-2.5 text-right">Rp {fmtNum(p.serapanAnggaran || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setRealisasiModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Tutup
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL 2: DETAIL TARGET PK — review angka sebelum sahkan/tolak */}
      <Modal
        open={targetModalOpen}
        onClose={() => setTargetModalOpen(false)}
        title="Review Target Perjanjian Kinerja (PK)"
        subtitle="Periksa rincian angka per program & diklat sebelum pengesahan final"
        wide
      >
        {targetDetail && (() => {
          const progs = targetReview?.programs || []
          const diklats = targetReview?.diklats || []
          const diklatByProg = new Map()
          for (const d of diklats) {
            for (const pid of d.programIds || []) {
              if (!diklatByProg.has(pid)) diklatByProg.set(pid, [])
              diklatByProg.get(pid).push(d)
            }
          }
          const parents = progs.filter((p) => p.isParent)
          const orphans = progs.filter((p) => !p.isParent && !parents.some((pp) => pp.programId === p.parentId))
          const groups = parents.map((pp) => ({
            parent: pp,
            children: progs.filter((c) => !c.isParent && c.parentId === pp.programId),
          }))
          if (orphans.length) groups.push({ parent: null, children: orphans })
          const leafRows = progs.filter((p) => !p.isParent)
          const totTp = leafRows.reduce((s, r) => s + (Number(r.targetPeserta) || 0), 0)
          const totTl = leafRows.reduce((s, r) => s + (Number(r.targetLulusan) || 0), 0)
          const canAct = mode === 'pending' && targetItem && targetItem.raw?.status === 'pending_bpsdmp'
          return (
            <div className="space-y-4">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <p className="text-xs text-slate-500 font-bold uppercase">{targetReview?.upt?.name || targetDetail.uptName} <span className="text-slate-400">({targetReview?.upt?.code || targetDetail.uptCode || ''})</span></p>
                <p className="text-base font-bold text-slate-900">
                  Target PK Tahun {targetDetail.year} (satu kali input)
                </p>
                <p className="text-xs text-slate-600">
                  Disetujui Pimpinan: <strong>{targetDetail.pimpinanApprovedByName || '-'}</strong> • Status: <strong>{targetDetail.status}</strong>
                  {targetDetail.rejectNote ? <span className="text-rose-600"> • Catatan: {targetDetail.rejectNote}</span> : null}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-navy-900 text-white p-3 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-300">Peserta</p>
                  <p className="text-lg font-black tabular-nums">{fmtNum(totTp)}</p>
                </div>
                <div className="rounded-xl bg-emerald-600 text-white p-3 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-100">Lulusan</p>
                  <p className="text-lg font-black tabular-nums">{fmtNum(totTl)}</p>
                </div>
                <div className="rounded-xl bg-amber-400 text-navy-950 p-3 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wide">Total</p>
                  <p className="text-lg font-black tabular-nums">{fmtNum(totTp + totTl)}</p>
                </div>
              </div>

              {loadingTargetDetail ? (
                <div className="p-8 text-center"><Spinner /></div>
              ) : progs.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">Tidak ada rincian angka pada pengajuan ini.</p>
              ) : (
                <div className="rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" style={{ minWidth: 560 }}>
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">
                          <th className="text-left px-4 py-2.5">Program / Rincian Diklat</th>
                          <th className="text-right px-3 py-2.5">Peserta</th>
                          <th className="text-right px-3 py-2.5">Lulusan</th>
                          <th className="text-right px-4 py-2.5">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {groups.map((g, gi) => (
                          <React.Fragment key={g.parent?.programId || `root-${gi}`}>
                            {g.parent && (
                              <tr className="bg-navy-50/70">
                                <td className="px-4 py-2.5">
                                  <span className="font-extrabold text-navy-900 text-[13px]">{g.parent.programName}</span>
                                  {g.children.length > 0 && (
                                    <span className="ml-2 inline-flex items-center rounded-full bg-slate-900 text-white text-[10px] font-bold px-2 py-0.5">induk auto</span>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-right font-black tabular-nums text-navy-900">{fmtNum(g.parent.targetPeserta)}</td>
                                <td className="px-3 py-2.5 text-right font-black tabular-nums text-navy-900">{fmtNum(g.parent.targetLulusan)}</td>
                                <td className="px-4 py-2.5 text-right"><span className="inline-flex items-center rounded-full bg-navy-900 text-amber-300 px-2.5 py-0.5 text-xs font-black tabular-nums">{fmtNum((g.parent.targetPeserta || 0) + (g.parent.targetLulusan || 0))}</span></td>
                              </tr>
                            )}
                            {/* Rincian diklat yang terpetakan langsung ke induk (tanpa turunan) */}
                            {g.parent && (diklatByProg.get(g.parent.programId) || []).map((d) => (
                              <tr key={`pd-${d.id}`} className="bg-sky-50/40">
                                <td className="px-4 py-2">
                                  <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-600 pl-4">
                                    <span className="text-sky-400 font-black">•</span>{d.name}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-600">{fmtNum(d.targetPeserta)}</td>
                                <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-600">{fmtNum(d.targetLulusan)}</td>
                                <td className="px-4 py-2 text-right font-black tabular-nums text-slate-700">{fmtNum((d.targetPeserta || 0) + (d.targetLulusan || 0))}</td>
                              </tr>
                            ))}
                            {g.children.map((c) => {
                              const rincian = diklatByProg.get(c.programId) || []
                              return (
                                <tr key={c.programId} className="hover:bg-slate-50/60 align-top">
                                  <td className="px-4 py-2.5">
                                    <div className="flex items-start gap-2">
                                      <span className="mt-1.5 h-4 w-1 rounded-full bg-slate-300 shrink-0" />
                                      <div className="min-w-0">
                                        <p className="font-bold text-slate-800 text-[13px]">{c.programName}</p>
                                        {rincian.length > 0 ? (
                                          <div className="mt-1.5 rounded-lg bg-slate-50 border border-slate-100 divide-y divide-slate-100">
                                            {rincian.map((d) => (
                                              <div key={d.id} className="px-2.5 py-1 flex items-center justify-between gap-2 text-xs">
                                                <span className="font-semibold text-slate-600">• {d.name}</span>
                                                <span className="tabular-nums text-slate-500 whitespace-nowrap">{fmtNum(d.targetPeserta)} / {fmtNum(d.targetLulusan)}</span>
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <p className="text-[11px] text-slate-400 italic">Tanpa rincian diklat</p>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5 text-right font-bold tabular-nums">{fmtNum(c.targetPeserta)}</td>
                                  <td className="px-3 py-2.5 text-right font-bold tabular-nums">{fmtNum(c.targetLulusan)}</td>
                                  <td className="px-4 py-2.5 text-right font-black tabular-nums">{fmtNum((c.targetPeserta || 0) + (c.targetLulusan || 0))}</td>
                                </tr>
                              )
                            })}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-800 space-y-1">
                <p className="font-bold">Pengesahan Final Nasional BPSDMP:</p>
                <p>Persetujuan ini akan mengunci target resmi UPT untuk tahun {targetDetail.year}. Angka target ini dijadikan dasar evaluasi capaian realisasi.</p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 flex-wrap">
                <button
                  onClick={() => setTargetModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Tutup
                </button>
                {canAct && (
                  <>
                    <button
                      onClick={() => targetItem && triggerReject(targetItem)}
                      disabled={acting != null}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold transition disabled:opacity-50"
                    >
                      <IconX className="w-3.5 h-3.5" /> Tolak
                    </button>
                    <button
                      onClick={() => targetItem && triggerApprove(targetItem)}
                      disabled={acting != null}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm disabled:opacity-50"
                    >
                      <IconCheck className="w-3.5 h-3.5" /> Sahkan Final
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* MODAL 3: DETAIL TARUNA */}
      <Modal
        open={tarunaModalOpen}
        onClose={() => setTarunaModalOpen(false)}
        title="Detail Master Data Taruna UPT"
        size="3xl"
      >
        {tarunaDetail && (
          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-bold uppercase">{tarunaDetail.uptName}</p>
                <p className="text-base font-bold text-slate-900">
                  Master Data Taruna ({tarunaDetail.year}) — {tarunaDetail.totalTaruna} Taruna
                </p>
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-violet-100 text-violet-800 border border-violet-200">
                {tarunaDetail.status}
              </span>
            </div>

            {/* In-modal Search */}
            <div className="relative">
              <input
                type="text"
                placeholder="Cari nama atau nomor taruna..."
                value={tarunaSearchInModal}
                onChange={(e) => setTarunaSearchInModal(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-2 rounded-xl border border-slate-200"
              />
              <IconSearch className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>

            {loadingTarunas ? (
              <div className="p-8 text-center"><Spinner size="lg" /></div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 font-bold text-slate-700 uppercase border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="p-2.5">No</th>
                      <th className="p-2.5">Nama Taruna</th>
                      <th className="p-2.5">Nomor Taruna / NIM</th>
                      <th className="p-2.5">Program Studi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tarunaList
                      .filter((t) => {
                        if (!tarunaSearchInModal.trim()) return true
                        const q = tarunaSearchInModal.toLowerCase()
                        return (t.name || '').toLowerCase().includes(q) || (t.nim || '').toLowerCase().includes(q)
                      })
                      .map((t, idx) => (
                        <tr key={t.id || idx}>
                          <td className="p-2.5 text-slate-400">{idx + 1}</td>
                          <td className="p-2.5 font-bold text-slate-900">{t.name}</td>
                          <td className="p-2.5 font-mono text-slate-600">{t.nim}</td>
                          <td className="p-2.5 text-slate-600">{t.prodi || '-'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setTarunaModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Tutup
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL 4: DETAIL PENYERAPAN LULUSAN */}
      <Modal
        open={absModalOpen}
        onClose={() => setAbsModalOpen(false)}
        title="Rincian Laporan Penyerapan Lulusan"
        size="3xl"
      >
        {absDetail && (
          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-bold uppercase">{absDetail.uptName}</p>
                <p className="text-base font-bold text-slate-900">
                  {absDetail.periodName || absDetail.quarterName || `Triwulan ${absDetail.quarter}`} Tahun {absDetail.year}
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  Total Lulusan: <strong>{absPreviewData?.summary?.totalLulusan || 0}</strong> • Terserap Bekerja: <strong>{absPreviewData?.summary?.totalBekerja || 0}</strong> ({absPreviewData?.summary?.pctAbsorption || 0}%)
                </p>
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                {absDetail.status}
              </span>
            </div>

            {loadingAbsPreview ? (
              <div className="p-8 text-center"><Spinner size="lg" /></div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 font-bold text-slate-700 uppercase border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="p-2.5">No</th>
                      <th className="p-2.5">Program Studi</th>
                      <th className="p-2.5">Nama Taruna</th>
                      <th className="p-2.5">Kategori</th>
                      <th className="p-2.5">Instansi Bekerja</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(absPreviewData?.records || []).map((r, i) => (
                      <tr key={r.id || i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                        <td className="p-2.5 text-slate-400">{i + 1}</td>
                        <td className="p-2.5 font-bold text-slate-800">{r.prodi?.namaProdi || '-'}</td>
                        <td className="p-2.5 font-bold text-slate-900">{r.namaTaruna}</td>
                        <td className="p-2.5 uppercase text-[10px] font-bold text-slate-600">{r.kategoriSerap}</td>
                        <td className="p-2.5 text-slate-700">{r.instansiBekerja || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setAbsModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Tutup
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* GENERIC CONFIRM / NOTE DIALOG — otomatis tertutup setelah proses berhasil */}
      <ConfirmDialog
        open={confirmState.open}
        onClose={() => setConfirmState((p) => ({ ...p, open: false }))}
        onConfirm={async () => {
          try {
            const r = await confirmState.onConfirm?.()
            // Handler mengembalikan false bila dialog harus tetap terbuka (mis. validasi gagal)
            if (r !== false) setConfirmState((p) => ({ ...p, open: false }))
          } catch {
            setConfirmState((p) => ({ ...p, open: false }))
          }
        }}
        loading={acting !== null}
        title={confirmState.title}
        confirmText={confirmState.confirmText}
        confirmColor={confirmState.confirmColor}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600 whitespace-pre-line">{confirmState.message}</p>
          {confirmState.requiresNote && (
            <div className="space-y-1 pt-1">
              <label className="block text-xs font-bold text-slate-700">{confirmState.noteLabel}</label>
              <textarea
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder={confirmState.notePlaceholder}
                rows={3}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          )}
        </div>
      </ConfirmDialog>
    </div>
  )
}
