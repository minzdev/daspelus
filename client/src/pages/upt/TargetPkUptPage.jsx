import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { apiError } from '../../lib/api'
import { Modal, EmptyState, SkeletonRows, Alert, Spinner, FormField, ConfirmDialog } from '../../components/ui'
import { IconTarget, IconEdit, IconRefresh, IconLayers, IconChevronDown, IconPeople, IconGraduation, IconPlus } from '../../components/icons'
import { useToast } from '../../components/Toast'
import { fmtNum, yearOptions } from '../../utils/format'
import logoBpsdm from '../../assets/logo-bpsdm.png'

function parseNum(s) {
  const cleaned = String(s ?? '').trim()
  if (cleaned === '') return NaN
  if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) return Number(cleaned.replace(/\./g, ''))
  return Number(cleaned.replace(/\.$/, ''))
}

/**
 * UPT — Target PK SINGLE-INPUT (satu kali per tahun, tanpa bulanan/tahunan).
 * Alur: Langkah 1 Input Diklat (/upt/diklat) -> Langkah 2 Input Angka di sini.
 * Angka diinput per diklat (rincian) + per program langsung (bila tanpa diklat).
 * Total program = jumlah rincian diklatnya. Persetujuan & unlock tetap: Pimpinan -> Pusbang -> BPSDMP.
 */
export default function TargetPkUptPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [programs, setPrograms] = useState([])
  const [diklats, setDiklats] = useState([])
  const [myTarget, setMyTarget] = useState(null)
  const [upt, setUpt] = useState(null)
  const [targetSubmissions, setTargetSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const toast = useToast()

  const [modalOpen, setModalOpen] = useState(false)
  const [diklatForm, setDiklatForm] = useState({})
  const [progForm, setProgForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/targets/my', { params: { year } })
      setPrograms(data.programs || [])
      setMyTarget(data.target || null)
      setDiklats(data.diklats || [])
      setUpt(data.upt || null)
      setTargetSubmissions(data.targetSubmissions || [])
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => { load() }, [load])

  const uptType = (upt?.uptType || '').toLowerCase()
  const visiblePrograms = useMemo(() => {
    if (!upt || !uptType) return programs
    return programs.filter((p) => {
      const tg = (p.targetGroup || p.category || 'semua').toLowerCase()
      if (tg === 'semua') return true
      return tg === uptType
    })
  }, [programs, upt, uptType])

  const parentsWithChildren = useMemo(() => {
    const s = new Set()
    for (const p of visiblePrograms) if (p.parentId) s.add(p.parentId)
    return s
  }, [visiblePrograms])

  const leafPrograms = useMemo(
    () => visiblePrograms.filter((p) => !parentsWithChildren.has(p.id)),
    [visiblePrograms, parentsWithChildren]
  )

  const childIdsByParent = useMemo(() => {
    const map = new Map()
    for (const p of visiblePrograms) {
      if (p.parentId) {
        if (!map.has(p.parentId)) map.set(p.parentId, [])
        map.get(p.parentId).push(p.id)
      }
    }
    return map
  }, [visiblePrograms])

  // Kelompok induk → turunan (pertahankan tampilan lama: induk dulu, baru turunan, baru diklat)
  const parentGroups = useMemo(() => {
    const byParentId = new Map()
    for (const p of leafPrograms) {
      const pid = p.parentId || '__root__'
      if (!byParentId.has(pid)) byParentId.set(pid, [])
      byParentId.get(pid).push(p)
    }
    const groups = []
    for (const [pid, children] of byParentId.entries()) {
      if (pid === '__root__') {
        groups.push({ parentId: null, parent: null, parentName: 'Program Lainnya', children })
        continue
      }
      const parent = visiblePrograms.find((x) => x.id === pid)
        || programs.find((x) => x.id === pid)
        || { id: pid, name: children[0]?.parentName || 'Induk', parentName: children[0]?.parentName || 'Induk' }
      groups.push({ parentId: pid, parent, parentName: parent.name || children[0]?.parentName, children })
    }
    return groups
  }, [leafPrograms, visiblePrograms, programs])

  const diklatByProgram = useMemo(() => {
    const m = new Map()
    for (const d of diklats) {
      for (const pid of d.programIds || []) {
        if (!m.has(pid)) m.set(pid, [])
        m.get(pid).push(d)
      }
    }
    for (const [, arr] of m) arr.sort((a, b) => String(a.name).localeCompare(String(b.name)))
    return m
  }, [diklats])

  const itemsByPid = useMemo(() => {
    const m = new Map()
    for (const it of myTarget?.items || []) m.set(it.programId, it)
    return m
  }, [myTarget])

  const diklatById = useMemo(() => new Map(diklats.map((d) => [d.id, d])), [diklats])

  // Status pengiriman single
  const submission = useMemo(
    () => targetSubmissions.find((s) => Number(s.year) === Number(year) && Number(s.month) === 0) || null,
    [targetSubmissions, year]
  )
  const isLocked = submission && ['pending_pimpinan', 'pending_bpsdmp', 'approved'].includes(submission.status)

  // Nilai form: diklat terikat per kombinasi (programId, diklatId)
  function diklatVal(pid, dId, field) {
    const key = `${pid}_${dId}`
    const f = diklatForm[key]
    if (f && f[field] !== undefined && String(f[field]).trim() !== '') return String(f[field]).trim()
    const saved = diklatById.get(dId)
    if (saved) {
      const tbp = (saved.targetByProgram && typeof saved.targetByProgram === 'object') ? saved.targetByProgram[pid] : null
      if (tbp && tbp[field === 'tp' ? 'targetPeserta' : 'targetLulusan'] !== undefined) {
        return String(tbp[field === 'tp' ? 'targetPeserta' : 'targetLulusan'] ?? 0)
      }
      return String(field === 'tp' ? saved.targetPeserta || 0 : saved.targetLulusan || 0)
    }
    return '0'
  }

  // Nilai program: INDUK = auto-sum turunan; TURUNAN ber-diklat = auto-sum diklat; TURUNAN tanpa diklat = input langsung
  function progVal(pid, field, _seen = new Set()) {
    if (_seen.has(pid)) return '0'
    _seen.add(pid)
    // Induk yang punya turunan → jumlahkan semua turunannya (rekursif aman)
    if (parentsWithChildren.has(pid)) {
      const kids = childIdsByParent.get(pid) || []
      const total = kids.reduce((s, kid) => {
        const v = progVal(kid, field, new Set(_seen))
        return s + (Number(v) || 0)
      }, 0)
      return String(total)
    }
    const f = progForm[pid]
    if (f && f[field] !== undefined && String(f[field]).trim() !== '') return String(f[field]).trim()
    const saved = itemsByPid.get(pid)
    const hasDiklat = (diklatByProgram.get(pid) || []).length > 0
    if (hasDiklat) {
      // total turunan = jumlah rincian diklat spesifik untuk program ini (live dari form)
      const list = diklatByProgram.get(pid) || []
      return String(list.reduce((s, d) => s + (Number(diklatVal(pid, d.id, field)) || 0), 0))
    }
    if (saved) return String(field === 'tp' ? saved.targetPeserta || 0 : saved.targetLulusan || 0)
    return '0'
  }

  function openModal() {
    setDiklatForm({})
    setProgForm({})
    setFormError('')
    setModalOpen(true)
  }

  const preview = useMemo(() => {
    let peserta = 0
    let lulusan = 0
    for (const p of leafPrograms) {
      peserta += Number(progVal(p.id, 'tp')) || 0
      lulusan += Number(progVal(p.id, 'tl')) || 0
    }
    return { peserta, lulusan }
  }, [leafPrograms, diklatForm, progForm, diklats, myTarget]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e, andSend = false) {
    if (e) e.preventDefault()
    setFormError('')
    const diklatTargets = []

    // Kumpulkan target per diklat per program
    for (const p of leafPrograms) {
      const rincian = diklatByProgram.get(p.id) || []
      for (const d of rincian) {
        const vTp = diklatVal(p.id, d.id, 'tp')
        const vTl = diklatVal(p.id, d.id, 'tl')
        const tp = parseNum(vTp) || 0
        const tl = parseNum(vTl) || 0
        if (!Number.isFinite(tp) || !Number.isFinite(tl) || tp < 0 || tl < 0) {
          setFormError(`Diklat "${d.name}" di "${p.name}" harus berupa angka ≥ 0.`)
          return
        }
        if (tl > tp) {
          setFormError(`Diklat "${d.name}" di "${p.name}": Lulusan (${tl}) tidak boleh lebih besar dari Peserta (${tp}).`)
          return
        }
        diklatTargets.push({ diklatId: d.id, programId: p.id, targetPeserta: tp, targetLulusan: tl })
      }
    }
    for (const g of parentGroups) {
      if (g.parentId && g.children.length === 0) {
        const rincian = diklatByProgram.get(g.parentId) || []
        for (const d of rincian) {
          const vTp = diklatVal(g.parentId, d.id, 'tp')
          const vTl = diklatVal(g.parentId, d.id, 'tl')
          const tp = parseNum(vTp) || 0
          const tl = parseNum(vTl) || 0
          diklatTargets.push({ diklatId: d.id, programId: g.parentId, targetPeserta: tp, targetLulusan: tl })
        }
      }
    }

    const items = []
    for (const p of leafPrograms) {
      const hasDiklat = (diklatByProgram.get(p.id) || []).length > 0
      if (hasDiklat) continue // total otomatis dari diklat
      const f = progForm[p.id]
      const saved = itemsByPid.get(p.id)
      const tps = f?.tp !== undefined ? String(f.tp ?? '').trim() : ''
      const tls = f?.tl !== undefined ? String(f.tl ?? '').trim() : ''
      if (!f && !saved) continue
      const tp = tps !== '' ? parseNum(tps) : saved ? Number(saved.targetPeserta) : 0
      const tl = tls !== '' ? parseNum(tls) : saved ? Number(saved.targetLulusan) : 0
      if (!Number.isFinite(tp) || !Number.isFinite(tl) || tp < 0 || tl < 0) {
        setFormError(`Target "${p.name}" harus berupa angka ≥ 0.`)
        return
      }
      if (tl > tp) {
        setFormError(`"${p.name}": Lulusan (${tl}) tidak boleh lebih besar dari Peserta (${tp}).`)
        return
      }
      if (f || tp + tl > 0) items.push({ programId: p.id, targetPeserta: tp || 0, targetLulusan: tl || 0 })
    }
    if (!diklatTargets.length && !items.length) {
      setFormError('Isi target minimal untuk satu diklat atau satu program.')
      return
    }
    setSaving(true)
    try {
      await api.put('/targets/my', { year, items, diklatTargets })
      toast.success('Target PK tersimpan', `Tahun ${year} — satu kali input.`)
      if (andSend) {
        try {
          const { data } = await api.post('/targets/my/submit', { year })
          toast.success('Target PK Dikirim', data.message, 6000)
          setModalOpen(false)
        } catch (sendErr) {
          console.error('[kirim-target]', sendErr?.response || sendErr)
          setFormError(`Draf tersimpan, tetapi pengiriman gagal: ${apiError(sendErr)}`)
          toast.error('Draf tersimpan — kirim gagal', apiError(sendErr))
        }
      } else {
        setModalOpen(false)
      }
      await load()
    } catch (err) {
      console.error('[simpan-target]', err?.response || err)
      setFormError(apiError(err))
      toast.error('Gagal menyimpan target', apiError(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleSendOnly() {
    setSaving(true)
    try {
      const { data } = await api.post('/targets/my/submit', { year })
      toast.success('Target PK Dikirim', data.message, 6000)
      setSendConfirmOpen(false)
      await load()
    } catch (err) {
      console.error('[kirim-target]', err?.response || err)
      toast.error('Gagal mengirim Target PK', apiError(err))
    } finally {
      setSaving(false)
    }
  }

  function DiklatInputList({ rincian, contextName, programId }) {
    return (
      <div className="mt-3 space-y-2 rounded-xl bg-slate-50/70 border border-slate-100 p-3">
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Rincian diklat ({rincian.length}) di bawah {contextName}</p>
        {rincian.map((d) => {
          const fKey = `${programId}_${d.id}`
          const vTp = diklatVal(programId, d.id, 'tp')
          const vTl = diklatVal(programId, d.id, 'tl')
          const invalid = (Number(vTl) || 0) > (Number(vTp) || 0)
          return (
            <div key={d.id} className={`grid grid-cols-1 sm:grid-cols-[1fr_130px_130px] gap-2 items-center rounded-xl border p-2.5 ${invalid ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
              <p className="text-[13px] font-semibold text-slate-700">• {d.name}</p>
              <FormField label="Peserta" className="!mb-0">
                <input type="text" inputMode="numeric" autoComplete="off" className="form-input !py-2 tabular-nums text-center font-bold !rounded-xl" placeholder="0"
                  value={vTp} onChange={(e) => setDiklatForm((f) => ({ ...f, [fKey]: { ...f[fKey], tp: e.target.value.replace(/[^0-9]/g, '') } }))} />
              </FormField>
              <FormField label="Lulusan" className="!mb-0">
                <input type="text" inputMode="numeric" autoComplete="off" className={`form-input !py-2 tabular-nums text-center font-bold !rounded-xl ${invalid ? '!border-red-500 !bg-red-50' : ''}`} placeholder="0"
                  value={vTl} onChange={(e) => setDiklatForm((f) => ({ ...f, [fKey]: { ...f[fKey], tl: e.target.value.replace(/[^0-9]/g, '') } }))} />
              </FormField>
              {invalid && <p className="text-[10px] font-bold text-red-600 col-span-full text-right">Lulusan tidak boleh lebih besar dari Peserta</p>}
            </div>
          )
        })}
      </div>
    )
  }

  const totalPeserta = myTarget?.targetPeserta || 0
  const totalLulusan = myTarget?.targetLulusan || 0
  const totalAll = totalPeserta + totalLulusan
  const hasAny = (myTarget?.items || []).length > 0

  const statusBadge = !submission || submission.status === 'draft'
    ? <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-600 px-3 py-1 text-[11px] font-bold">{submission?.status === 'draft' ? 'Draf — unlock disetujui, silakan revisi & kirim ulang' : 'Draf — belum dikirim'}</span>
    : submission.status === 'approved'
      ? <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 px-3 py-1 text-[11px] font-bold">✓ Disetujui BPSDMP & Terkunci</span>
      : submission.status === 'pending_pimpinan'
        ? <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 px-3 py-1 text-[11px] font-bold">Menunggu Pimpinan UPT</span>
        : submission.status === 'pending_bpsdmp'
          ? <span className="inline-flex items-center rounded-full bg-sky-50 text-sky-700 ring-1 ring-sky-200 px-3 py-1 text-[11px] font-bold">Menunggu Admin BPSDMP</span>
          : submission.status === 'rejected'
            ? <span className="inline-flex items-center rounded-full bg-red-50 text-red-700 ring-1 ring-red-200 px-3 py-1 text-[11px] font-bold">Ditolak — silakan revisi</span>
            : <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-600 px-3 py-1 text-[11px] font-bold">{submission.status}</span>

  return (
    <div className="animate-fadeUp space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-navy-950 via-navy-900 to-navy-950 px-5 py-4 text-white shadow-md border border-navy-800">
        <div className="absolute right-0 top-0 -mr-20 -mt-20 h-72 w-72 rounded-full bg-gold-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 p-1.5 border border-white/15" style={{ width: 40, height: 40 }}>
              <img src={logoBpsdm} alt="Logo" className="h-full w-full object-contain max-h-7 max-w-7" onError={(e) => { e.target.style.display = 'none' }} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-black text-white tracking-tight">Input Target PK</h1>
                <span className="rounded-full bg-white/10 text-gold-300 text-[10px] font-extrabold px-2.5 py-0.5 border border-white/15">Tahun {year}</span>
                <span className="rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-extrabold px-2.5 py-0.5 border border-emerald-400/20">Satu kali input</span>
              </div>
              <p className="text-xs text-navy-200 mt-0.5">
                Tetapkan target <strong className="text-white">satu kali</strong> per program — <strong className="text-white">{upt?.code || '—'}</strong> <span className="text-navy-100">{upt?.name || ''}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button className="inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white px-3.5 py-2.5 text-xs font-bold" onClick={load} title="Muat ulang">
              <IconRefresh className="h-4 w-4" /> <span className="hidden sm:inline">Refresh</span>
            </button>
            <div className="relative">
              <select className="appearance-none cursor-pointer bg-white text-navy-900 font-extrabold text-xs rounded-xl py-2.5 pl-4 pr-9 focus:outline-none focus:ring-2 focus:ring-gold-400" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {yearOptions().map((y) => <option key={y} value={y}>Tahun {y}</option>)}
              </select>
              <IconChevronDown className="h-4 w-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Stepper */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/upt/diklat" className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center gap-3 hover:border-navy-300 hover:shadow-sm transition-all group">
          <span className="h-9 w-9 rounded-xl bg-slate-100 text-slate-500 group-hover:bg-navy-900 group-hover:text-white flex items-center justify-center font-black text-sm transition-colors">1</span>
          <div className="flex-1">
            <p className="text-sm font-black text-slate-800">Langkah 1: Input Diklat ({diklats.length}) →</p>
            <p className="text-xs text-slate-500">Daftarkan nama diklat + petakan ke program</p>
          </div>
        </Link>
        <div className="rounded-2xl border-2 border-navy-900 bg-navy-50 p-4 flex items-center gap-3">
          <span className="h-9 w-9 rounded-xl bg-navy-900 text-white flex items-center justify-center font-black text-sm">2</span>
          <div>
            <p className="text-sm font-black text-navy-900">Input Angka Target (saat ini)</p>
            <p className="text-xs text-slate-500">Isi peserta & lulusan — satu kali saja</p>
          </div>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* Ketentuan konsistensi LAKIP */}
      <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white font-black text-sm shadow-sm">!</span>
        <div className="text-xs leading-relaxed text-amber-900">
          <p className="font-black text-[13px] text-amber-950">Target & Realisasi harus sama dengan capaian pada LAKIP</p>
          <p className="mt-0.5">
            Angka <strong>Target Peserta/Lulusan</strong> yang ditetapkan di sini serta <strong>Realisasi Peserta/Lulusan</strong> yang diinput
            per bulan wajib <strong>sama dan konsisten</strong> dengan angka <strong>capaian pada LAKIP</strong> (Laporan Akuntabilitas
            Kinerja Instansi Pemerintah) UPT.
          </p>
        </div>
      </div>

      {/* Status */}
      <div className="flex flex-wrap items-center gap-2">
        {statusBadge}
        {submission?.rejectNote && <span className="text-xs text-red-600 font-semibold">Catatan: {submission.rejectNote}</span>}
        {isLocked && (
          <Link to="/upt/perubahan-target" className="text-xs font-bold text-sky-700 hover:underline ml-auto">Ajukan Perubahan / Unlock →</Link>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card card-hover p-5 rounded-2xl border border-slate-200/60 shadow-sm relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-navy-600" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Target Peserta</p>
              <p className="mt-2 text-[28px] font-black tabular-nums">{fmtNum(totalPeserta)}</p>
              <p className="text-xs text-slate-500 mt-1">Satu kali input {year}</p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-navy-900 text-gold-300 flex items-center justify-center"><IconPeople className="h-5 w-5" /></div>
          </div>
        </div>
        <div className="card card-hover p-5 rounded-2xl border border-slate-200/60 shadow-sm relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-emerald-500" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Target Lulusan</p>
              <p className="mt-2 text-[28px] font-black tabular-nums">{fmtNum(totalLulusan)}</p>
              <p className="text-xs text-slate-500 mt-1">Lulusan ≤ Peserta</p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center"><IconGraduation className="h-5 w-5" /></div>
          </div>
        </div>
        <div className="card p-5 rounded-2xl bg-gradient-to-br from-navy-950 to-navy-900 border border-navy-800 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">Total PK</p>
              <p className="mt-2 text-[28px] font-black text-amber-300 tabular-nums">{fmtNum(totalAll)}</p>
              <p className="text-xs text-slate-300 mt-1">{hasAny ? `${myTarget.items.length} program · ${diklats.length} diklat` : 'Belum ada target'}</p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center"><IconTarget className="h-5 w-5 text-amber-300" /></div>
          </div>
        </div>
      </div>

      {/* Tabel rincian */}
      <div className="card rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden bg-white">
        <div className="px-5 py-4 border-b border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-b from-white to-slate-50/40">
          <div className="flex items-center gap-2.5">
            <span className="h-8 w-8 rounded-xl bg-navy-900 text-white flex items-center justify-center"><IconLayers className="h-4 w-4" /></span>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">Rincian Target {year}</h3>
              <p className="text-xs text-slate-500">Per program + rincian nama diklat di bawahnya</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {!isLocked && hasAny && (
              <button className="btn-gold !rounded-xl !py-2" onClick={() => setSendConfirmOpen(true)}><IconTarget className="h-4 w-4" /> Kirim ke Pimpinan</button>
            )}
            <button className="btn-primary !rounded-xl !py-2" onClick={openModal} disabled={!programs.length || isLocked} title={isLocked ? 'Terkunci — ajukan unlock untuk revisi' : 'Atur target'}>
              <IconEdit className="h-4 w-4" /> {hasAny ? 'Kelola Target' : 'Atur Target'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-4"><SkeletonRows rows={5} /></div>
        ) : !hasAny ? (
          <EmptyState
            icon={<IconTarget className="h-6 w-6" />}
            title="Belum ada target"
            desc={diklats.length === 0
              ? `Langkah 1: input nama diklat dulu di menu Input Diklat, lalu kembali ke sini untuk isi angka.`
              : `Sudah ada ${diklats.length} diklat. Klik Atur Target untuk isi angka peserta & lulusan satu kali.`}
            action={
              <div className="flex gap-2 justify-center flex-wrap">
                {diklats.length === 0 && <Link to="/upt/diklat" className="btn-secondary !rounded-xl"><IconPlus className="h-4 w-4" /> Input Diklat Dulu</Link>}
                <button className="btn-primary !rounded-xl" onClick={openModal}><IconEdit className="h-4 w-4" /> Atur Target</button>
              </div>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 720 }}>
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/60">
                  <th className="text-left px-5 py-3.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Program / Rincian Diklat</th>
                  <th className="text-right px-3 py-3.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Peserta</th>
                  <th className="text-right px-3 py-3.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Lulusan</th>
                  <th className="text-right px-5 py-3.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {parentGroups.map((g) => {
                  const rows = []
                  // ── Baris INDUK (auto-sum dari turunan) ──
                  if (g.parent) {
                    const tpInduk = Number(progVal(g.parentId, 'tp')) || 0
                    const tlInduk = Number(progVal(g.parentId, 'tl')) || 0
                    rows.push(
                      <tr key={`induk-${g.parentId}`} className="bg-navy-50/60 align-top">
                        <td className="px-5 py-4">
                          <p className="font-extrabold text-navy-900 leading-snug flex items-center gap-2 flex-wrap">
                            {g.parentName}
                            {g.children.length > 0 && (
                              <span className="inline-flex items-center rounded-full bg-slate-900 text-white text-[10px] font-bold px-2 py-0.5">induk auto</span>
                            )}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {g.children.length > 0
                              ? `Total otomatis = jumlah ${g.children.length} program turunan di bawahnya`
                              : 'Total otomatis = jumlah rincian diklat di bawahnya'}
                          </p>
                          {(diklatByProgram.get(g.parentId) || []).length > 0 && (
                            <div className="mt-2 rounded-xl bg-slate-50 border border-slate-100 divide-y divide-slate-100">
                              {(diklatByProgram.get(g.parentId) || []).map((d) => {
                                const tbp = (d.targetByProgram && typeof d.targetByProgram === 'object') ? d.targetByProgram[g.parentId] : null
                                const tp = (tbp && tbp.targetPeserta !== undefined) ? tbp.targetPeserta : (d.targetPeserta || 0)
                                const tl = (tbp && tbp.targetLulusan !== undefined) ? tbp.targetLulusan : (d.targetLulusan || 0)
                                return (
                                  <div key={d.id} className="px-3 py-1.5 flex items-center justify-between gap-2 text-xs">
                                    <span className="font-semibold text-slate-600">• {d.name}</span>
                                    <span className="tabular-nums text-slate-500 whitespace-nowrap">{fmtNum(tp)} / {fmtNum(tl)}</span>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-4 text-right font-black tabular-nums text-navy-900">{fmtNum(tpInduk)}</td>
                        <td className="px-3 py-4 text-right font-black tabular-nums text-navy-900">{fmtNum(tlInduk)}</td>
                        <td className="px-5 py-4 text-right"><span className="inline-flex items-center rounded-full bg-navy-900 text-amber-300 px-3 py-1 text-xs font-black tabular-nums">{fmtNum(tpInduk + tlInduk)}</span></td>
                      </tr>
                    )
                  }
                  // ── Baris TURUNAN + rincian diklat ──
                  for (const child of g.children) {
                    const it = itemsByPid.get(child.id)
                    const tp = (it?.targetPeserta ?? Number(progVal(child.id, 'tp'))) || 0
                    const tl = (it?.targetLulusan ?? Number(progVal(child.id, 'tl'))) || 0
                    const rincian = (diklatByProgram.get(child.id) || []).filter((d) => d)
                    rows.push(
                      <tr key={child.id} className="hover:bg-slate-50/60 align-top">
                        <td className="px-5 py-4">
                          <div className="flex items-start gap-2">
                            <span className="mt-1.5 h-4 w-1 rounded-full bg-slate-300 shrink-0" />
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900">{child.name}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{g.parentName}</p>
                              {rincian.length > 0 ? (
                                <div className="mt-2 rounded-xl bg-slate-50 border border-slate-100 divide-y divide-slate-100">
                                  {rincian.map((d) => {
                                    const tbp = (d.targetByProgram && typeof d.targetByProgram === 'object') ? d.targetByProgram[child.id] : null
                                    const dTp = (tbp && tbp.targetPeserta !== undefined) ? tbp.targetPeserta : (d.targetPeserta || 0)
                                    const dTl = (tbp && tbp.targetLulusan !== undefined) ? tbp.targetLulusan : (d.targetLulusan || 0)
                                    return (
                                      <div key={d.id} className="px-3 py-1.5 flex items-center justify-between gap-2 text-xs">
                                        <span className="font-semibold text-slate-600">• {d.name}</span>
                                        <span className="tabular-nums text-slate-500 whitespace-nowrap">{fmtNum(dTp)} / {fmtNum(dTl)}</span>
                                      </div>
                                    )
                                  })}
                                </div>
                              ) : (
                                <p className="text-[11px] text-slate-400 mt-1.5 italic">Tanpa rincian diklat — angka langsung per program</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-4 text-right font-bold tabular-nums">{fmtNum(tp)}</td>
                        <td className="px-3 py-4 text-right font-bold tabular-nums">{fmtNum(tl)}</td>
                        <td className="px-5 py-4 text-right"><span className="inline-flex items-center rounded-full bg-slate-900 text-amber-300 px-3 py-1 text-xs font-black tabular-nums">{fmtNum(tp + tl)}</span></td>
                      </tr>
                    )
                  }
                  return rows
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && hasAny && !isLocked && (
          <div className="px-5 py-3.5 bg-slate-50/50 border-t border-slate-200/60 flex items-center justify-between text-xs flex-wrap gap-2">
            <span className="text-slate-600">Satu kali input · terkunci otomatis setelah dikirim ke Pimpinan</span>
            <button className="btn-secondary !rounded-xl !py-2" onClick={openModal}><IconEdit className="h-3.5 w-3.5" /> Kelola Target</button>
          </div>
        )}
        {!loading && isLocked && (
          <div className="px-5 py-3.5 bg-amber-50 border-t border-amber-100 text-xs text-amber-800 font-semibold">
            🔒 Target terkunci ({submission?.status}). Untuk revisi, ajukan <Link to="/upt/perubahan-target" className="underline font-bold">Perubahan Target PK</Link>.
          </div>
        )}
      </div>

      {/* Modal atur target single */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={`Atur Target — ${upt?.code || ''} ${year}`} subtitle={`${upt?.name || ''} · satu kali input`} wide>
        <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-5">
          {formError && <Alert type="error">{formError}</Alert>}
          <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4 text-xs text-slate-600 leading-relaxed space-y-1.5">
            <p><strong className="text-slate-900">Langkah 1 —</strong> pastikan nama diklat sudah diinput di <Link to="/upt/diklat" className="underline font-bold text-sky-700">Input Diklat</Link> ({diklats.length} terdaftar).</p>
            <p><strong className="text-slate-900">Langkah 2 —</strong> isi angka di sini: per <strong>diklat</strong> bila ada rincian, atau langsung per <strong>program turunan</strong> bila tanpa rincian. <strong>Program induk otomatis</strong> = jumlah turunannya.</p>
            <p className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-amber-900"><strong>Penting:</strong> angka Target & Realisasi Peserta/Lulusan harus <strong>sama dengan capaian pada LAKIP</strong>.</p>
          </div>

          {diklats.length === 0 && (
            <Alert type="warning">
              Belum ada diklat. Anda tetap bisa isi angka langsung per program, atau <Link to="/upt/diklat" className="underline font-bold">tambah diklat dulu</Link> agar ada rincian (disarankan).
            </Alert>
          )}

          {parentGroups.length === 0 ? (
            <EmptyState icon={<IconLayers className="h-6 w-6" />} title="Belum ada program" desc="Hubungi admin untuk menambah program." />
          ) : (
            parentGroups.map((g) => {
              const indukTp = g.parentId ? Number(progVal(g.parentId, 'tp')) || 0 : 0
              const indukTl = g.parentId ? Number(progVal(g.parentId, 'tl')) || 0 : 0
              return (
                <div key={g.parentId || g.parentName} className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                  {/* Header INDUK — sama seperti tampilan lama, kini auto-sum */}
                  <div className="px-4 py-3 bg-gradient-to-r from-navy-900 to-navy-800 text-white flex items-center gap-2 flex-wrap">
                    <span className="h-7 w-7 rounded-lg bg-white/15 border border-white/20 text-white flex items-center justify-center"><IconLayers className="h-3.5 w-3.5" /></span>
                    <p className="text-xs font-extrabold uppercase tracking-wide">{g.parentName}</p>
                    {g.children.length > 0 && (
                      <span className="inline-flex items-center rounded-full bg-white text-navy-900 text-[10px] font-black px-2 py-0.5">induk auto</span>
                    )}
                    {g.parentId && (
                      <span className="ml-auto text-[11px] font-black tabular-nums bg-white/10 border border-white/15 rounded-full px-2.5 py-1">
                        {fmtNum(indukTp)} peserta · {fmtNum(indukTl)} lulusan
                      </span>
                    )}
                    {!g.parentId && (
                      <span className="ml-auto text-[11px] font-bold text-slate-200 bg-white/10 px-2 py-1 rounded-full">{g.children.length} program</span>
                    )}
                  </div>
                  <div className="divide-y divide-slate-100">
                    {g.parentId && g.children.length === 0 && (diklatByProgram.get(g.parentId) || []).length > 0 && (
                      <div className="px-4 py-4 bg-white">
                        <DiklatInputList rincian={diklatByProgram.get(g.parentId)} contextName={g.parentName} programId={g.parentId} />
                      </div>
                    )}
                    {g.children.map((p) => {
                      const rincian = diklatByProgram.get(p.id) || []
                      const hasRincian = rincian.length > 0
                      const totalTp = Number(progVal(p.id, 'tp')) || 0
                      const totalTl = Number(progVal(p.id, 'tl')) || 0
                      return (
                        <div key={p.id} className="px-4 py-4 bg-white">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <p className="text-sm font-bold text-slate-800">
                              <span className="mr-2 inline-block h-4 w-1 rounded-full bg-slate-300 align-middle" />
                              {p.name}
                            </p>
                            <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full tabular-nums">
                              Total: {fmtNum(totalTp)} peserta · {fmtNum(totalTl)} lulusan {hasRincian && '(otomatis = jumlah diklat)'}
                            </span>
                          </div>
                          {hasRincian ? (
                            <DiklatInputList rincian={rincian} contextName={p.name} programId={p.id} />
                          ) : (
                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_150px_150px] gap-3 items-center">
                              <p className="text-xs text-slate-500">Tanpa rincian — isi langsung per program turunan. <Link to="/upt/diklat" className="underline font-bold">+ Tambah rincian diklat</Link></p>
                              <FormField label="Peserta" className="!mb-0">
                                <input type="text" inputMode="numeric" autoComplete="off" className="form-input !py-2.5 tabular-nums text-center font-bold !rounded-xl" placeholder="0"
                                  value={progForm[p.id]?.tp ?? String(itemsByPid.get(p.id)?.targetPeserta ?? 0)}
                                  onChange={(e) => setProgForm((f) => ({ ...f, [p.id]: { ...f[p.id], tp: e.target.value.replace(/[^0-9]/g, '') } }))} />
                              </FormField>
                              <FormField label="Lulusan" className="!mb-0">
                                <input type="text" inputMode="numeric" autoComplete="off" className="form-input !py-2.5 tabular-nums text-center font-bold !rounded-xl" placeholder="0"
                                  value={progForm[p.id]?.tl ?? String(itemsByPid.get(p.id)?.targetLulusan ?? 0)}
                                  onChange={(e) => setProgForm((f) => ({ ...f, [p.id]: { ...f[p.id], tl: e.target.value.replace(/[^0-9]/g, '') } }))} />
                              </FormField>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl bg-gradient-to-r from-navy-950 to-navy-900 px-5 py-4 shadow-sm text-white">
            <div className="flex items-center gap-3">
              <span className="h-10 w-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center">📊</span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-300">Total {year} (satu kali)</p>
                <p className="text-sm font-black"><span className="text-amber-300">{fmtNum(preview.peserta)}</span> peserta · <span className="text-emerald-300">{fmtNum(preview.lulusan)}</span> lulusan</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 sm:ml-auto flex-wrap">
              <button type="button" className="btn-secondary !rounded-xl !bg-white/10 !text-white !border-white/20" onClick={() => setModalOpen(false)}>Batal</button>
              <button type="submit" className="btn-secondary !rounded-xl !bg-white !text-navy-900 min-w-[130px] font-black" disabled={saving || preview.lulusan > preview.peserta}>
                {saving ? <><Spinner /> Menyimpan...</> : 'Simpan Draf'}
              </button>
              <button type="button" className="btn-gold !rounded-xl min-w-[150px]" disabled={saving || preview.lulusan > preview.peserta}
                onClick={(e) => handleSubmit(e, true)}>
                Simpan & Kirim
              </button>
            </div>
          </div>
          {preview.lulusan > preview.peserta && (
            <Alert type="error">⚠️ Total Lulusan ({fmtNum(preview.lulusan)}) tidak boleh lebih besar dari Total Peserta ({fmtNum(preview.peserta)}).</Alert>
          )}
        </form>
      </Modal>

      <ConfirmDialog open={sendConfirmOpen} onCancel={() => setSendConfirmOpen(false)} onConfirm={handleSendOnly}
        title={`Kirim Target ${year} ke Pimpinan?`}
        body="Target satu kali input akan dikirim dan terkunci. Tidak dapat diedit lagi sampai ditolak / unlock disetujui."
        confirmLabel="Ya, Kirim" cancelLabel="Batal" confirmTone="primary" loading={saving} />
    </div>
  )
}
