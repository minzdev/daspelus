import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import api, { apiError } from '../../lib/api'
import { Alert, Spinner, EmptyState, Modal } from '../../components/ui'
import { IconLayers, IconLock, IconEye, IconChevronDown, IconRefresh } from '../../components/icons'
import { useToast } from '../../components/Toast'
import logoBpsdm from '../../assets/logo-bpsdm.png'
import { MONTHS, yearOptions, fmtNum } from '../../utils/format'
import { buildRealisasiPdf } from '../../utils/realisasiPdf'

const COLS = [
  { key: 'pesertaL', label: 'Peserta L', short: 'Peserta Laki-laki' },
  { key: 'pesertaP', label: 'Peserta P', short: 'Peserta Perempuan' },
  { key: 'lulusanL', label: 'Lulusan L', short: 'Lulusan Laki-laki' },
  { key: 'lulusanP', label: 'Lulusan P', short: 'Lulusan Perempuan' },
]

const EMPTY = { pesertaL: '0', pesertaP: '0', lulusanL: '0', lulusanP: '0' }

export default function InputRealisasiPage() {
  const { user } = useAuth()
  const toast = useToast()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [values, setValues] = useState({}) // programId -> {pesertaL,pesertaP,lulusanL,lulusanP}
  const [saving, setSaving] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [message, setMessage] = useState(null)
  const [locked, setLocked] = useState(false)
  const [hasExisting, setHasExisting] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [pdfUrl, setPdfUrl] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  const [programs, setPrograms] = useState([])
  const [programsLoading, setProgramsLoading] = useState(true)

  // State target & diklat — dideklarasikan di atas semua memo agar tidak TDZ
  const [targetApproved, setTargetApproved] = useState(true)
  const [targetBlock, setTargetBlock] = useState(null) // {title, desc, type}
  const [showBlockModal, setShowBlockModal] = useState(false)
  const [targetSingle, setTargetSingle] = useState({ peserta: 0, lulusan: 0, byProgram: {} })
  const [diklats, setDiklats] = useState([])
  const [diklatValues, setDiklatValues] = useState({}) // diklatId -> {pesertaL,pesertaP,lulusanL,lulusanP}
  const [diklatTouched, setDiklatTouched] = useState({}) // diklatId -> true bila diubah user

  // Peta induk yang memiliki turunan (auto-sum, tidak editable)
  const parentsWithChildren = useMemo(() => {
    const s = new Set()
    for (const p of programs) if (p.parentId) s.add(p.parentId)
    return s
  }, [programs])

  // Rincian diklat per program turunan (sinkron dengan Input Diklat + Target PK)
  // Dideklarasikan di atas editablePrograms agar tidak TDZ saat render pertama
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

  // Baris program yang diinput langsung: bukan induk-berturunan & bukan turunan ber-diklat (otomatis)
  const editablePrograms = useMemo(
    () => programs.filter((p) => !(p.isParent && parentsWithChildren.has(p.id)) && (diklatByProgram.get(p.id) || []).length === 0),
    [programs, parentsWithChildren, diklatByProgram]
  )

  const childIdsByParent = useMemo(() => {
    const map = {}
    for (const p of programs) {
      if (p.parentId) {
        if (!map[p.parentId]) map[p.parentId] = []
        map[p.parentId].push(p.id)
      }
    }
    return map
  }, [programs])

  // Nilai tampilan untuk tiap kolom:
  // induk = auto-sum turunan; turunan ber-diklat = auto-sum rincian diklatnya
  function cellValue(pid, key) {
    if (parentsWithChildren.has(pid)) {
      const kids = childIdsByParent[pid] || []
      return String(kids.reduce((s, cid) => s + (Number(cellValue(cid, key)) || 0), 0))
    }
    const dl = diklatByProgram.get(pid) || []
    if (dl.length > 0) {
      return String(dl.reduce((s, d) => s + (Number(diklatValues[`${pid}_${d.id}`]?.[key]) || 0), 0))
    }
    return values[pid]?.[key] ?? '0'
  }

  function handleDiklatNumChange(programId, diklatId, key, raw) {
    const cleaned = raw.replace(/[^0-9]/g, '')
    const dKey = `${programId}_${diklatId}`
    setDiklatValues((prev) => ({ ...prev, [dKey]: { ...prev[dKey], [key]: cleaned } }))
    setDiklatTouched((prev) => ({ ...prev, [dKey]: true }))
  }

  function rowTotal(pid) {
    return COLS.reduce((s, c) => s + (Number(cellValue(pid, c.key)) || 0), 0)
  }

  // Total keseluruhan = jumlah seluruh program INDUK (tiap induk sudah mencakup turunannya)
  const grandTotal = useMemo(
    () => programs.filter((p) => p.isParent).reduce((s, p) => s + rowTotal(p.id), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [programs, values, diklatValues, diklatByProgram]
  )

  // Muat daftar program (sekali)
  useEffect(() => {
    let alive = true
    api
      .get('/realizations/programs')
      .then(({ data }) => {
        if (!alive) return
        setPrograms(data.programs || [])
      })
      .catch((err) => {
        if (alive) setMessage({ type: 'error', text: apiError(err) })
      })
      .finally(() => {
        if (alive) setProgramsLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  // Muat realisasi bulan terpilih
  const loadExisting = useCallback(async () => {
    const init = {}
    for (const p of programs) init[p.id] = { ...EMPTY }
    setDiklatValues({})
    setDiklatTouched({})

    let isLocked = false
    let hasData = false
    let isTargetOk = true
    let block = null
    let hasError = false
    let errorMsg = ''
    try {
      let myRes, targetRes, diklatRes
      try {
        myRes = await api.get('/realizations/my', { params: { year } })
      } catch (e) {
        hasError = true
        errorMsg = apiError(e)
        console.error('[InputRealisasi] myRes error', e)
        myRes = { data: { realizations: [] } }
      }
      try {
        targetRes = await api.get('/targets/my', { params: { year } })
      } catch (e) {
        console.error('[InputRealisasi] targetRes error', e)
        targetRes = { data: {} }
      }
      try {
        diklatRes = await api.get('/realizations/diklats', { params: { year, month } })
      } catch (e) {
        console.error('[InputRealisasi] diklatRes error', e)
        diklatRes = { data: { diklatRealisations: [] } }
      }
      const existing = (myRes.data.realizations || []).filter((r) => Number(r.month) === Number(month))
      for (const r of existing) {
        if (r.locked === true) isLocked = true
        if (init[r.programId]) {
          hasData = true
          init[r.programId] = {
            pesertaL: String(r.pesertaL ?? '0'),
            pesertaP: String(r.pesertaP ?? '0'),
            lulusanL: String(r.lulusanL ?? '0'),
            lulusanP: String(r.lulusanP ?? '0'),
          }
        }
      }

      // Cek Target PK SINGLE-INPUT (satu kali per tahun) sudah disetujui BPSDMP
      const myT = targetRes.data?.target
      const subs = targetRes.data?.targetSubmissions || []
      const isApprovedFlag = targetRes.data?.isApproved === true
      const hasSingleTarget = ((myT?.items || []).length > 0) || ((myT?.yearlyItems || []).length > 0)
      const subSingle = subs.find((s) => Number(s.year) === Number(year) && Number(s.month) === 0)
      const isSingleApproved = isApprovedFlag || subSingle?.status === 'approved'
      if (!hasSingleTarget) {
        isTargetOk = false
        block = { type: 'belum_atur', title: 'PK Belum Diatur', desc: `Target PK ${year} belum diisi sama sekali. Alur baru: isi Input Diklat dulu, lalu isi angka satu kali di menu Target PK.` }
      } else if (!isSingleApproved) {
        const relevant = subSingle
        if (relevant) {
          if (relevant.status === 'pending_pimpinan') {
            block = { type: 'pending_pimpinan', title: 'Menunggu Persetujuan Pimpinan UPT', desc: `Target PK ${year} (${relevant.uptCode || ''}) sudah dikirim dan menunggu persetujuan Pimpinan UPT.` }
          } else if (relevant.status === 'pending_bpsdmp') {
            block = { type: 'pending_bpsdmp', title: 'Menunggu Persetujuan Admin BPSDMP', desc: `Target PK ${year} sudah disetujui Pimpinan dan menunggu persetujuan final Admin BPSDMP.` }
          } else if (relevant.status === 'rejected') {
            block = { type: 'rejected', title: 'Target PK Ditolak', desc: `Target PK ${year} ditolak${relevant.rejectNote ? `: ${relevant.rejectNote}` : ''}. Silakan revisi di menu Target PK.` }
          } else {
            block = { type: 'belum_kirim', title: 'PK Belum Disetujui', desc: `Target PK ${year} belum disetujui BPSDMP. Pastikan sudah dikirim ke Pimpinan dan disetujui sampai Admin BPSDMP.` }
          }
        } else {
          block = { type: 'belum_kirim', title: 'PK Belum Dikirim', desc: `Target PK ${year} sudah diisi tapi belum dikirim ke Pimpinan. Silakan kirim di menu Target PK → Kirim Ke Pimpinan.` }
        }
        isTargetOk = false
      }
      // Simpan ringkasan Target single + diklats untuk acuan tampilan (sinkron hierarki)
      const loadedDiklats = targetRes.data?.diklats || []
      {
        const items = myT?.items || myT?.yearlyItems || []
        const byProgram = {}
        let tp = 0, tl = 0
        for (const it of items) {
          byProgram[it.programId] = { peserta: Number(it.targetPeserta) || 0, lulusan: Number(it.targetLulusan) || 0 }
          tp += Number(it.targetPeserta) || 0
          tl += Number(it.targetLulusan) || 0
        }
        setTargetSingle({ peserta: tp, lulusan: tl, byProgram })
        setDiklats(loadedDiklats)
      }
      // Prefill rincian diklat bulan ini dari database
      {
        const rows = diklatRes.data?.diklatRealisations || []
        const byProgDiklat = new Map(rows.map((r) => [`${r.programId}_${r.diklatId}`, r]))
        const initD = {}
        for (const d of loadedDiklats) {
          for (const pid of d.programIds || []) {
            const k = `${pid}_${d.id}`
            const r = byProgDiklat.get(k)
            initD[k] = r
              ? {
                  pesertaL: String(r.pesertaL ?? '0'),
                  pesertaP: String(r.pesertaP ?? '0'),
                  lulusanL: String(r.lulusanL ?? '0'),
                  lulusanP: String(r.lulusanP ?? '0'),
                }
              : { ...EMPTY }
          }
        }
        setDiklatValues(initD)
      }
    } catch (err) {
      console.error('[InputRealisasi] loadExisting error', err)
      if (!block) {
        hasError = true
        errorMsg = apiError(err)
      }
    } finally {
      setValues(init)
      setLocked(isLocked)
      setHasExisting(hasData)
      setTargetApproved(isTargetOk)
      setTargetBlock(block)
      setShowBlockModal(!!block && !isTargetOk)
      if (hasError && !block) {
        setMessage({ type: 'error', text: errorMsg })
      } else {
        setMessage(null)
      }
    }
  }, [year, month, programs])

  useEffect(() => {
    if (programs.length === 0) return
    loadExisting().catch((err) => setMessage({ type: 'error', text: apiError(err) }))
  }, [loadExisting, programs.length])

  function handleNumChange(programId, key, raw) {
    const cleaned = raw.replace(/[^0-9]/g, '')
    setValues((prev) => ({ ...prev, [programId]: { ...prev[programId], [key]: cleaned } }))
  }

  function handleClearAll() {
    const init = {}
    for (const p of programs) init[p.id] = { ...EMPTY }
    setValues(init)
    const initD = {}
    const touchD = {}
    for (const d of diklats) { initD[d.id] = { ...EMPTY }; touchD[d.id] = true }
    setDiklatValues(initD)
    setDiklatTouched(touchD)
  }

  // Validasi: program langsung + rincian diklat (angka wajib + lulusan ≤ peserta per gender)
  function validateAll() {
    for (const p of editablePrograms) {
      const v = values[p.id] || EMPTY
      for (const c of COLS) {
        if (v[c.key] === '' || v[c.key] == null) {
          return { ok: false, msg: `Kolom ${c.short} pada "${p.name}" wajib diisi (isi 0 jika tidak ada).` }
        }
      }
    }
    for (const p of editablePrograms) {
      const v = values[p.id] || EMPTY
      const pesertaL = Number(v.pesertaL) || 0, pesertaP = Number(v.pesertaP) || 0, lulusanL = Number(v.lulusanL) || 0, lulusanP = Number(v.lulusanP) || 0
      if (lulusanL > pesertaL) {
        return { ok: false, msg: `Lulusan Laki-laki (${lulusanL}) tidak boleh lebih besar dari Peserta Laki-laki (${pesertaL}) pada "${p.name}".` }
      }
      if (lulusanP > pesertaP) {
        return { ok: false, msg: `Lulusan Perempuan (${lulusanP}) tidak boleh lebih besar dari Peserta Perempuan (${pesertaP}) pada "${p.name}".` }
      }
    }
    for (const d of diklats) {
      const v = diklatValues[d.id] || EMPTY
      for (const c of COLS) {
        if (v[c.key] === '' || v[c.key] == null) {
          return { ok: false, msg: `Kolom ${c.short} pada diklat "${d.name}" wajib diisi (isi 0 jika tidak ada).` }
        }
      }
      const pesertaL = Number(v.pesertaL) || 0, pesertaP = Number(v.pesertaP) || 0, lulusanL = Number(v.lulusanL) || 0, lulusanP = Number(v.lulusanP) || 0
      if (lulusanL > pesertaL) {
        return { ok: false, msg: `Diklat "${d.name}": Lulusan Laki-laki (${lulusanL}) tidak boleh lebih besar dari Peserta Laki-laki (${pesertaL}).` }
      }
      if (lulusanP > pesertaP) {
        return { ok: false, msg: `Diklat "${d.name}": Lulusan Perempuan (${lulusanP}) tidak boleh lebih besar dari Peserta Perempuan (${pesertaP}).` }
      }
    }
    return { ok: true }
  }

  function buildItems() {
    // Program langsung (tanpa diklat)
    const items = editablePrograms.map((p) => ({
      programId: p.id,
      pesertaL: Number(values[p.id]?.pesertaL) || 0,
      pesertaP: Number(values[p.id]?.pesertaP) || 0,
      lulusanL: Number(values[p.id]?.lulusanL) || 0,
      lulusanP: Number(values[p.id]?.lulusanP) || 0,
    }))
    // Program ber-diklat yang tersentuh: sertakan agregat terkini (server memakai agregat DB)
    for (const p of programs) {
      const dl = diklatByProgram.get(p.id) || []
      if (dl.length === 0 || parentsWithChildren.has(p.id)) continue
      if (!dl.some((d) => diklatTouched[d.id])) continue
      items.push({
        programId: p.id,
        pesertaL: Number(cellValue(p.id, 'pesertaL')) || 0,
        pesertaP: Number(cellValue(p.id, 'pesertaP')) || 0,
        lulusanL: Number(cellValue(p.id, 'lulusanL')) || 0,
        lulusanP: Number(cellValue(p.id, 'lulusanP')) || 0,
      })
    }
    return items
  }

  function buildDiklatItems() {
    // Hanya rincian yang disentuh user (nol ikut agar pengosongan tersimpan)
    const out = []
    for (const [k, touched] of Object.entries(diklatTouched)) {
      if (!touched) continue
      const [pid, dId] = k.split('_')
      if (!pid || !dId) continue
      const v = diklatValues[k] || EMPTY
      out.push({
        diklatId: dId,
        programId: pid,
        pesertaL: Number(v.pesertaL) || 0,
        pesertaP: Number(v.pesertaP) || 0,
        lulusanL: Number(v.lulusanL) || 0,
        lulusanP: Number(v.lulusanP) || 0,
      })
    }
    return out
  }

  async function doSave(finalize) {
    const check = validateAll()
    if (!check.ok) {
      setMessage({ type: 'error', text: check.msg })
      return
    }
    setSaving(true)
    setFinalizing(finalize)
    setMessage(null)
    try {
      const { data } = await api.post('/realizations', { year, month, items: buildItems(), diklatItems: buildDiklatItems(), finalize })
      setMessage({ type: 'success', text: data.message })
      setDiklatTouched({})
      if (finalize) {
        toast.success('Laporan terkirim & terkunci', data.message, 6000)
        setLocked(true)
        setConfirmOpen(false)
        setPreviewOpen(false)
        await loadExisting()
      } else {
        toast.success('Draf tersimpan', data.message)
      }
    } catch (err) {
      setMessage({ type: 'error', text: apiError(err) })
      toast.error(finalize ? 'Gagal mengirim laporan' : 'Gagal menyimpan draf', apiError(err))
    } finally {
      setSaving(false)
      setFinalizing(false)
    }
  }

  const previewRows = useMemo(() => {
    const all = programs.map((p) => ({
      id: p.id,
      name: p.name,
      isParent: p.isParent,
      isAutoSum: parentsWithChildren.has(p.id),
      values: {
        pesertaL: Number(cellValue(p.id, 'pesertaL')) || 0,
        pesertaP: Number(cellValue(p.id, 'pesertaP')) || 0,
        lulusanL: Number(cellValue(p.id, 'lulusanL')) || 0,
        lulusanP: Number(cellValue(p.id, 'lulusanP')) || 0,
      },
      total: rowTotal(p.id),
    }))
    return all
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programs, values, diklatValues, diklatByProgram])

  const previewPeserta = programs
    .filter((p) => p.isParent)
    .reduce((s, p) => s + (Number(cellValue(p.id, 'pesertaL')) || 0) + (Number(cellValue(p.id, 'pesertaP')) || 0), 0)
  const previewLulusan = programs
    .filter((p) => p.isParent)
    .reduce((s, p) => s + (Number(cellValue(p.id, 'lulusanL')) || 0) + (Number(cellValue(p.id, 'lulusanP')) || 0), 0)

  const hasAnyInvalidRow = useMemo(() => {
    const progInvalid = editablePrograms.some((p) => {
      const v = values[p.id] || EMPTY
      const pesertaL = Number(v.pesertaL) || 0, pesertaP = Number(v.pesertaP) || 0, lulusanL = Number(v.lulusanL) || 0, lulusanP = Number(v.lulusanP) || 0
      return lulusanL > pesertaL || lulusanP > pesertaP
    })
    if (progInvalid) return true
    return diklats.some((d) => {
      const v = diklatValues[d.id] || EMPTY
      const pesertaL = Number(v.pesertaL) || 0, pesertaP = Number(v.pesertaP) || 0, lulusanL = Number(v.lulusanL) || 0, lulusanP = Number(v.lulusanP) || 0
      return lulusanL > pesertaL || lulusanP > pesertaP
    })
  }, [values, editablePrograms, diklats, diklatValues])

  // Bangun pratinjau PDF setiap kali modal preview dibuka
  useEffect(() => {
    if (!previewOpen) {
      setPdfUrl('')
      return
    }
    try {
      const url = buildRealisasiPdf({
        uptCode: user?.upt?.code || '-',
        uptName: user?.upt?.name || 'UPT',
        year,
        month,
        rows: previewRows,
        totalPeserta: previewPeserta,
        totalLulusan: previewLulusan,
        grandTotal,
      })
      setPdfUrl(url)
    } catch (e) {
      console.error(e)
      setMessage({ type: 'error', text: 'Gagal membuat pratinjau PDF.' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewOpen])

  if (programsLoading) {
    return (
      <div className="animate-fadeUp">
        <div className="card p-12 text-center">
          <Spinner className="h-6 w-6 mx-auto text-navy-400" />
          <p className="text-xs text-navy-400 mt-3">Memuat daftar kategori diklat...</p>
        </div>
      </div>
    )
  }

  if (programs.length === 0) {
    return (
      <div className="animate-fadeUp">
        <EmptyState
          icon={<IconLayers className="h-6 w-6" />}
          title="Belum ada kategori diklat"
          desc="Admin BPSDMP belum menambahkan program aktif. Hubungi admin untuk menambahkan program di Master Program."
        />
      </div>
    )
  }

  return (
    <div className="animate-fadeUp space-y-6">
      {/* Banner Header Ringkas (Compact Sleek Banner) */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-navy-950 via-navy-900 to-navy-950 px-5 py-4 text-white shadow-card border border-navy-800">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-48 w-48 rounded-full bg-gold-500/10 blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Judul & Info UPT */}
          <div className="flex items-center gap-3.5">
            <div className="hidden sm:flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 p-1.5 shadow-inner border border-white/15 backdrop-blur-md">
              <img src={logoBpsdm} alt="Logo BPSDMP" className="h-full w-full object-contain" onError={(e) => e.target.style.display = 'none'} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg md:text-xl font-black text-white tracking-tight">
                  Input Realisasi Peserta dan Lulusan Bulan {MONTHS[month - 1]}
                </h1>
                {hasExisting && (
                  <span className={`rounded-full text-[10px] font-extrabold px-2.5 py-0.5 border ${
                    locked
                      ? 'bg-white/10 text-slate-300 border-white/20'
                      : 'bg-gold-500/20 text-gold-300 border-gold-500/30'
                  }`}>
                    {locked ? '🔒 Terkunci' : '📝 Draf'}
                  </span>
                )}
              </div>
              <p className="text-xs text-navy-200 mt-0.5 max-w-xl">
                <strong className="text-white">{user?.upt?.name || 'UPT'}</strong> — Isi peserta &amp; lulusan per kategori diklat.
              </p>
            </div>
          </div>

          {/* Kontrol Periode Tahun, Bulan, & Tombol Bersihkan */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div className="relative">
              <select
                className="appearance-none cursor-pointer bg-white/10 hover:bg-white/15 border border-white/20 text-white font-extrabold text-xs rounded-xl py-2 pl-3 pr-8 shadow-sm backdrop-blur-md transition-all focus:outline-none focus:ring-2 focus:ring-gold-400"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {yearOptions().map((y) => (
                  <option key={y} value={y} className="bg-navy-900 text-white font-bold py-1">Tahun {y}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-gold-300">
                <IconChevronDown className="h-3.5 w-3.5" />
              </div>
            </div>

            <div className="relative">
              <select
                className="appearance-none cursor-pointer bg-white/10 hover:bg-white/15 border border-white/20 text-white font-extrabold text-xs rounded-xl py-2 pl-3 pr-8 shadow-sm backdrop-blur-md transition-all focus:outline-none focus:ring-2 focus:ring-gold-400"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1} className="bg-navy-900 text-white font-bold py-1">{m}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-gold-300">
                <IconChevronDown className="h-3.5 w-3.5" />
              </div>
            </div>

            <button
              type="button"
              className="btn-secondary !bg-white/10 hover:!bg-white/20 !text-white !border-white/20 text-xs !py-2 !px-3 rounded-xl backdrop-blur-md disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleClearAll}
              disabled={locked}
              title={locked ? 'Laporan terkunci, tidak dapat dibersihkan' : 'Kosongkan seluruh isian kolom'}
            >
              <IconRefresh className="h-3.5 w-3.5" /> Bersihkan
            </button>
          </div>
        </div>
      </div>

      {message && <div className="mb-4"><Alert type={message.type}>{message.text}</Alert></div>}

      {!targetApproved && targetBlock && (
        <div className="mb-4">
          <Alert type={targetBlock.type === 'belum_atur' || targetBlock.type === 'rejected' ? 'error' : 'warning'}>
            ⚠️ <strong>{targetBlock.title}:</strong> {targetBlock.desc}
          </Alert>
        </div>
      )}
      <Modal open={showBlockModal && !targetApproved && !programsLoading} onClose={() => setShowBlockModal(false)} title={targetBlock?.title || 'PK Belum Siap'} subtitle={`Periode ${MONTHS[month - 1]} ${year} tidak dapat diisi`}>
        <div className="space-y-4">
          <Alert type={targetBlock?.type === 'belum_atur' || targetBlock?.type === 'rejected' ? 'error' : 'warning'}>
            {targetBlock?.desc}
          </Alert>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
            <p className="font-bold text-slate-800 mb-1">Yang harus dilakukan:</p>
            <ul className="list-disc pl-4 space-y-1">
              {targetBlock?.type === 'belum_atur' && <li>Buka menu <strong>Input Diklat</strong> → daftarkan nama diklat, lalu <strong>Target PK</strong> → isi angka satu kali → Simpan.</li>}
              {targetBlock?.type === 'belum_kirim' && <li>Di menu <strong>Target PK</strong> klik <strong>Kirim Ke Pimpinan</strong> (satu kali per tahun).</li>}
              {targetBlock?.type === 'pending_pimpinan' && <li>Hubungi <strong>Pimpinan UPT</strong> untuk menyetujui Target PK.</li>}
              {targetBlock?.type === 'pending_bpsdmp' && <li>Menunggu <strong>Admin BPSDMP</strong> menyetujui final. Cek di <strong>Persetujuan Target PK</strong>.</li>}
              {targetBlock?.type === 'rejected' && <li>Perbaiki target sesuai catatan penolakan, lalu kirim ulang.</li>}
              <li>Setelah <strong>Approved</strong>, kembali ke <strong>Input Realisasi</strong> untuk mengisi peserta/lulusan (Lulusan ≤ Peserta).</li>
            </ul>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setShowBlockModal(false)}>Tutup</button>
            <button className="btn-primary" onClick={() => { setShowBlockModal(false); window.location.href = '/upt/target-pk' }}>Ke Target PK</button>
          </div>
        </div>
      </Modal>

      {locked && (
        <div className="mb-4">
          <Alert type="error">
            Realisasi untuk periode <strong>{MONTHS[month - 1]} {year}</strong> telah <span className="font-black underline">TERKUNCI (FINAL)</span> dan tidak dapat diubah lagi. Hubungi Admin BPSDMP bila memerlukan revisi.
          </Alert>
        </div>
      )}

      {/* Acuan Target PK single + diklat — sinkron hierarki */}
      {targetApproved && (targetSingle.peserta + targetSingle.lulusan > 0) && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50/60 px-4 py-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-extrabold text-sky-900">🎯 Acuan Target PK {year} (satu kali input):</span>
          <span className="font-black tabular-nums text-slate-900">{fmtNum(targetSingle.peserta)} peserta · {fmtNum(targetSingle.lulusan)} lulusan</span>
          {diklats.length > 0 && <span className="text-slate-500">· {diklats.length} diklat terpetakan</span>}
          <span className="ml-auto text-[11px] text-slate-500">Induk otomatis = jumlah turunan · Turunan ber-diklat = jumlah diklatnya</span>
        </div>
      )}

      {/* Tabel Input Per Program — ultra rapi, center presisi */}
      <div className="card overflow-hidden border border-slate-200 shadow-sm rounded-2xl">
        <div className="w-full overflow-hidden rounded-2xl">
          <table className="w-full" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '3%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '8.5%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '8.5%' }} />
              <col style={{ width: '8.5%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '8.5%' }} />
            </colgroup>
            <thead>
              <tr className="bg-slate-900 text-white">
                <th rowSpan={2} className="!text-white !border-slate-800 text-center align-middle !py-3 !px-2 text-[11px] font-bold tracking-wide">No</th>
                <th rowSpan={2} className="!text-white !border-slate-800 align-middle !py-3 !px-3 text-left text-[11px] font-bold tracking-widest uppercase">Kategori Diklat</th>
                <th colSpan={4} className="text-center !text-white !bg-sky-700 !border-sky-800 !py-2.5">
                  <span className="inline-flex items-center justify-center gap-1.5 text-[11px] font-black tracking-[0.08em] w-full"><span className="h-1.5 w-1.5 rounded-full bg-white/90" /> PESERTA</span>
                </th>
                <th colSpan={4} className="text-center !text-white !bg-emerald-700 !border-emerald-800 !py-2.5">
                  <span className="inline-flex items-center justify-center gap-1.5 text-[11px] font-black tracking-[0.08em] w-full"><span className="h-1.5 w-1.5 rounded-full bg-white/90" /> LULUSAN</span>
                </th>
              </tr>
              <tr>
                <th title="Target PK peserta sebagai acuan" className="text-center !py-2.5 !px-1 !text-amber-800 bg-amber-50 border border-amber-200 text-[11px] font-black align-middle">PK</th>
                <th className="text-center !py-2.5 !px-1 !text-sky-800 bg-sky-50 border border-sky-100 text-[11px] font-extrabold leading-none align-middle whitespace-nowrap"><span className="inline-flex items-center justify-center w-full">Laki-laki <span className="text-amber-600 ml-0.5">*</span></span></th>
                <th className="text-center !py-2.5 !px-1 !text-sky-800 bg-sky-50 border border-sky-100 text-[11px] font-extrabold leading-none align-middle whitespace-nowrap"><span className="inline-flex items-center justify-center w-full">Perempuan <span className="text-amber-600 ml-0.5">*</span></span></th>
                <th className="text-center !py-2.5 !px-1 !text-white bg-sky-600 border border-sky-600 text-[11px] font-black align-middle">TOTAL</th>
                <th title="Target PK lulusan sebagai acuan" className="text-center !py-2.5 !px-1 !text-emerald-800 bg-emerald-50 border border-emerald-200 text-[11px] font-black align-middle">PK</th>
                <th className="text-center !py-2.5 !px-1 !text-emerald-800 bg-emerald-50 border border-emerald-100 text-[11px] font-extrabold leading-none align-middle whitespace-nowrap"><span className="inline-flex items-center justify-center w-full">Laki-laki <span className="text-amber-600 ml-0.5">*</span></span></th>
                <th className="text-center !py-2.5 !px-1 !text-emerald-800 bg-emerald-50 border border-emerald-100 text-[11px] font-extrabold leading-none align-middle whitespace-nowrap"><span className="inline-flex items-center justify-center w-full">Perempuan <span className="text-amber-600 ml-0.5">*</span></span></th>
                <th className="text-center !py-2.5 !px-1 !text-white bg-emerald-600 border border-emerald-600 text-[11px] font-black align-middle">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {programs.map((p, idx) => {
                const autoSum = parentsWithChildren.has(p.id)
                const diklatList = diklatByProgram.get(p.id) || []
                const hasDiklat = !autoSum && diklatList.length > 0
                const progAuto = autoSum || hasDiklat
                const disabled = locked || progAuto || !targetApproved
                const isParentRow = p.isParent
                const pesertaL = Number(cellValue(p.id, 'pesertaL')) || 0, pesertaP = Number(cellValue(p.id, 'pesertaP')) || 0, lulusanL = Number(cellValue(p.id, 'lulusanL')) || 0, lulusanP = Number(cellValue(p.id, 'lulusanP')) || 0
                const pesertaTotal = pesertaL + pesertaP
                const lulusanTotal = lulusanL + lulusanP
                const isInvalidRow = lulusanL > pesertaL || lulusanP > pesertaP
                // Target PK peserta & lulusan sebagai acuan kolom PK (induk = jumlah turunan)
                const pkPeserta = (() => {
                  if (p.isParent || parentsWithChildren.has(p.id)) {
                    const kids = programs.filter((c) => c.parentId === p.id)
                    return kids.reduce((s, k) => s + (targetSingle.byProgram[k.id]?.peserta || 0), 0)
                  }
                  return targetSingle.byProgram[p.id]?.peserta || 0
                })()
                const pkLulusan = (() => {
                  if (p.isParent || parentsWithChildren.has(p.id)) {
                    const kids = programs.filter((c) => c.parentId === p.id)
                    return kids.reduce((s, k) => s + (targetSingle.byProgram[k.id]?.lulusan || 0), 0)
                  }
                  return targetSingle.byProgram[p.id]?.lulusan || 0
                })()

                return (
                  <React.Fragment key={p.id}>
                    <tr
                      className={`transition-colors ${
                        isInvalidRow
                          ? 'bg-red-50 border-l-4 border-l-red-500'
                          : isParentRow
                          ? 'bg-navy-900/[0.03] border-l-4 border-l-navy-800'
                          : 'hover:bg-navy-50/30'
                      }`}
                    >
                    <td className="text-navy-400 text-[11px] font-bold text-center !px-1 !py-2">{idx + 1}</td>
                    <td className="!px-2 !py-2">
                      {isParentRow ? (
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-navy-950 text-[11px] leading-tight line-clamp-2">{p.name}</span>
                          </div>
                          {(() => {
                            const kids = programs.filter((c) => c.parentId === p.id)
                            const tpSum = kids.reduce((s, k) => s + (targetSingle.byProgram[k.id]?.peserta || 0), 0)
                            const tlSum = kids.reduce((s, k) => s + (targetSingle.byProgram[k.id]?.lulusan || 0), 0)
                            if (tpSum + tlSum === 0) return null
                            return <p className="text-[9px] text-slate-500 font-semibold mt-0.5">🎯 Target: {fmtNum(tpSum)} psr · {fmtNum(tlSum)} lls</p>
                          })()}
                        </div>
                      ) : (
                        <div className="pl-2">
                          <span className="inline-flex items-center gap-1 font-semibold text-navy-700 text-[11px] leading-tight line-clamp-2">
                            <span className="text-navy-300 shrink-0">↳</span><span className="truncate">{p.name}</span>
                          </span>
                          {(() => {
                            const t = targetSingle.byProgram[p.id]
                            const dl = diklatByProgram.get(p.id) || []
                            if (!t && dl.length === 0) return null
                            return (
                              <div className="mt-1 space-y-1">
                                {t && (t.peserta + t.lulusan > 0) && (
                                  <p className="text-[9px] text-sky-700 font-bold">🎯 {fmtNum(t.peserta)} psr · {fmtNum(t.lulusan)} lls</p>
                                )}
                                {dl.length > 0 && (
                                  <p className="text-[9px] text-slate-500 font-semibold">📋 {dl.length} diklat — isi per diklat di bawah ↓</p>
                                )}
                              </div>
                            )
                          })()}
                        </div>
                      )}
                    </td>
                    {/* Target PK peserta (acuan, read-only) */}
                    <td className="p-1">
                      <div
                        title="Target PK peserta"
                        className="tabular-nums text-center !py-1 text-[11px] font-black rounded-lg border border-amber-200 bg-amber-50 text-amber-900 h-[30px] flex items-center justify-center"
                      >
                        {pkPeserta > 0 ? fmtNum(pkPeserta) : '–'}
                      </div>
                    </td>
                    {/* Peserta Laki-laki */}
                    <td className="p-1">
                      {progAuto && !locked ? (
                        <div className="form-input tabular-nums text-center !py-1 bg-sky-50 text-sky-900 font-extrabold text-[11px] rounded-lg border-sky-200 h-[30px] flex items-center justify-center">
                          {cellValue(p.id, 'pesertaL')}
                        </div>
                      ) : (
                        <input
                          inputMode="numeric"
                          className={`form-input tabular-nums text-center !py-1 text-[11px] font-bold rounded-lg transition-all h-[30px] ${
                            disabled
                              ? 'cursor-not-allowed bg-slate-100/80 text-slate-600 border-slate-200'
                              : Number(cellValue(p.id, 'pesertaL')) > 0
                              ? '!bg-sky-50 text-sky-950 border-sky-400 font-black focus:ring-sky-500'
                              : 'bg-white text-navy-900 border-surface-border focus:border-navy-600'
                          }`}
                          placeholder="0"
                          value={cellValue(p.id, 'pesertaL')}
                          onChange={(e) => handleNumChange(p.id, 'pesertaL', e.target.value)}
                          disabled={disabled}
                          aria-label={`Peserta Laki-laki ${p.name}`}
                        />
                      )}
                    </td>
                    {/* Peserta Perempuan */}
                    <td className="p-1">
                      {progAuto && !locked ? (
                        <div className="form-input tabular-nums text-center !py-1 bg-sky-50 text-sky-900 font-extrabold text-[11px] rounded-lg border-sky-200 h-[30px] flex items-center justify-center">
                          {cellValue(p.id, 'pesertaP')}
                        </div>
                      ) : (
                        <input
                          inputMode="numeric"
                          className={`form-input tabular-nums text-center !py-1 text-[11px] font-bold rounded-lg transition-all h-[30px] ${
                            disabled
                              ? 'cursor-not-allowed bg-slate-100/80 text-slate-600 border-slate-200'
                              : Number(cellValue(p.id, 'pesertaP')) > 0
                              ? '!bg-sky-50 text-sky-950 border-sky-400 font-black focus:ring-sky-500'
                              : 'bg-white text-navy-900 border-surface-border focus:border-navy-600'
                          }`}
                          placeholder="0"
                          value={cellValue(p.id, 'pesertaP')}
                          onChange={(e) => handleNumChange(p.id, 'pesertaP', e.target.value)}
                          disabled={disabled}
                          aria-label={`Peserta Perempuan ${p.name}`}
                        />
                      )}
                    </td>
                    {/* Total Peserta */}
                    <td className="p-1">
                      <div className={`tabular-nums text-center !py-1 text-[11px] font-black rounded-lg border h-[30px] flex items-center justify-center ${pesertaTotal > 0 ? 'bg-sky-600 text-white border-sky-600 shadow-sm' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        {fmtNum(pesertaTotal)}
                      </div>
                    </td>
                    {/* Target PK lulusan (acuan, read-only) */}
                    <td className="p-1">
                      <div
                        title="Target PK lulusan"
                        className="tabular-nums text-center !py-1 text-[11px] font-black rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900 h-[30px] flex items-center justify-center"
                      >
                        {pkLulusan > 0 ? fmtNum(pkLulusan) : '–'}
                      </div>
                    </td>
                    {/* Lulusan Laki-laki */}
                    <td className="p-1">
                      {progAuto && !locked ? (
                        <div className="form-input tabular-nums text-center !py-1 bg-emerald-50 text-emerald-900 font-extrabold text-[11px] rounded-lg border-emerald-200 h-[30px] flex items-center justify-center">
                          {cellValue(p.id, 'lulusanL')}
                        </div>
                      ) : (
                        <input
                          inputMode="numeric"
                          className={`form-input tabular-nums text-center !py-1 text-[11px] font-bold rounded-lg transition-all h-[30px] ${
                            disabled
                              ? 'cursor-not-allowed bg-slate-100/80 text-slate-600 border-slate-200'
                              : Number(cellValue(p.id, 'lulusanL')) > 0
                              ? '!bg-emerald-50 text-emerald-950 border-emerald-400 font-black focus:ring-emerald-500'
                              : 'bg-white text-navy-900 border-surface-border focus:border-navy-600'
                          }`}
                          placeholder="0"
                          value={cellValue(p.id, 'lulusanL')}
                          onChange={(e) => handleNumChange(p.id, 'lulusanL', e.target.value)}
                          disabled={disabled}
                          aria-label={`Lulusan Laki-laki ${p.name}`}
                        />
                      )}
                    </td>
                    {/* Lulusan Perempuan */}
                    <td className="p-1">
                      {progAuto && !locked ? (
                        <div className="form-input tabular-nums text-center !py-1 bg-emerald-50 text-emerald-900 font-extrabold text-[11px] rounded-lg border-emerald-200 h-[30px] flex items-center justify-center">
                          {cellValue(p.id, 'lulusanP')}
                        </div>
                      ) : (
                        <input
                          inputMode="numeric"
                          className={`form-input tabular-nums text-center !py-1 text-[11px] font-bold rounded-lg transition-all h-[30px] ${
                            disabled
                              ? 'cursor-not-allowed bg-slate-100/80 text-slate-600 border-slate-200'
                              : Number(cellValue(p.id, 'lulusanP')) > 0
                              ? '!bg-emerald-50 text-emerald-950 border-emerald-400 font-black focus:ring-emerald-500'
                              : 'bg-white text-navy-900 border-surface-border focus:border-navy-600'
                          }`}
                          placeholder="0"
                          value={cellValue(p.id, 'lulusanP')}
                          onChange={(e) => handleNumChange(p.id, 'lulusanP', e.target.value)}
                          disabled={disabled}
                          aria-label={`Lulusan Perempuan ${p.name}`}
                        />
                      )}
                    </td>
                    {/* Total Lulusan */}
                    <td className="p-1">
                      <div className={`tabular-nums text-center !py-1 text-[11px] font-black rounded-lg border h-[30px] flex items-center justify-center ${lulusanTotal > 0 ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        {fmtNum(lulusanTotal)}
                      </div>
                    </td>
                    </tr>
                    {/* Rincian diklat di bawah program turunan — isi per diklat, total naik otomatis */}
                    {hasDiklat && diklatList.map((d) => {
                      const dKey = `${p.id}_${d.id}`
                      const dv = diklatValues[dKey] || EMPTY
                      const dPesertaL = Number(dv.pesertaL) || 0, dPesertaP = Number(dv.pesertaP) || 0
                      const dLulusanL = Number(dv.lulusanL) || 0, dLulusanP = Number(dv.lulusanP) || 0
                      const dInvalid = dLulusanL > dPesertaL || dLulusanP > dPesertaP
                      const dDisabled = locked || !targetApproved
                      const diklatInputCls = (active) => `form-input tabular-nums text-center !py-1 text-[11px] font-bold rounded-lg transition-all h-[30px] ${
                        dDisabled
                          ? 'cursor-not-allowed bg-slate-100/80 text-slate-600 border-slate-200'
                          : active
                          ? '!bg-sky-50 text-sky-950 border-sky-400 font-black'
                          : 'bg-white text-navy-900 border-surface-border'
                      }`
                      const diklatLulusanCls = (active) => `form-input tabular-nums text-center !py-1 text-[11px] font-bold rounded-lg transition-all h-[30px] ${
                        dDisabled
                          ? 'cursor-not-allowed bg-slate-100/80 text-slate-600 border-slate-200'
                          : active
                          ? '!bg-emerald-50 text-emerald-950 border-emerald-400 font-black'
                          : 'bg-white text-navy-900 border-surface-border'
                      }`
                      return (
                        <React.Fragment key={d.id}>
                          <tr className={`transition-colors ${dInvalid ? 'bg-red-50/60' : 'bg-sky-50/40 hover:bg-sky-50/70'}`}>
                            <td className="!px-1 !py-1.5" />
                            <td className="!px-2 !py-1.5">
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 leading-tight">
                                <span className="text-sky-400 font-black shrink-0">•</span>
                                <span className="line-clamp-2">{d.name}</span>
                              </span>
                            </td>
                            <td className="p-1">
                              {(() => {
                                const dPk = Number(d.targetByProgram?.[p.id]?.targetPeserta) || Number(d.targetPeserta) || 0
                                return (
                                  <div
                                    title="Target PK peserta diklat"
                                    className="tabular-nums text-center !py-1 text-[11px] font-black rounded-lg border border-amber-200/70 bg-amber-50/60 text-amber-900 h-[30px] flex items-center justify-center"
                                  >
                                    {dPk > 0 ? fmtNum(dPk) : '–'}
                                  </div>
                                )
                              })()}
                            </td>
                            <td className="p-1">
                              <input inputMode="numeric" className={diklatInputCls(dPesertaL > 0)} placeholder="0" value={dv.pesertaL ?? '0'}
                                onChange={(e) => handleDiklatNumChange(p.id, d.id, 'pesertaL', e.target.value)} disabled={dDisabled} aria-label={`Diklat ${d.name} Peserta Laki-laki`} />
                            </td>
                            <td className="p-1">
                              <input inputMode="numeric" className={diklatInputCls(dPesertaP > 0)} placeholder="0" value={dv.pesertaP ?? '0'}
                                onChange={(e) => handleDiklatNumChange(p.id, d.id, 'pesertaP', e.target.value)} disabled={dDisabled} aria-label={`Diklat ${d.name} Peserta Perempuan`} />
                            </td>
                            <td className="p-1">
                              <div className={`tabular-nums text-center !py-1 text-[11px] font-black rounded-lg border h-[30px] flex items-center justify-center ${dPesertaL + dPesertaP > 0 ? 'bg-sky-600 text-white border-sky-600' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                {fmtNum(dPesertaL + dPesertaP)}
                              </div>
                            </td>
                            <td className="p-1">
                              {(() => {
                                const dPkL = Number(d.targetByProgram?.[p.id]?.targetLulusan) || Number(d.targetLulusan) || 0
                                return (
                                  <div
                                    title="Target PK lulusan diklat"
                                    className="tabular-nums text-center !py-1 text-[11px] font-black rounded-lg border border-emerald-200/70 bg-emerald-50/60 text-emerald-900 h-[30px] flex items-center justify-center"
                                  >
                                    {dPkL > 0 ? fmtNum(dPkL) : '–'}
                                  </div>
                                )
                              })()}
                            </td>
                            <td className="p-1">
                              <input inputMode="numeric" className={diklatLulusanCls(dLulusanL > 0)} placeholder="0" value={dv.lulusanL ?? '0'}
                                onChange={(e) => handleDiklatNumChange(p.id, d.id, 'lulusanL', e.target.value)} disabled={dDisabled} aria-label={`Diklat ${d.name} Lulusan Laki-laki`} />
                            </td>
                            <td className="p-1">
                              <input inputMode="numeric" className={diklatLulusanCls(dLulusanP > 0)} placeholder="0" value={dv.lulusanP ?? '0'}
                                onChange={(e) => handleDiklatNumChange(p.id, d.id, 'lulusanP', e.target.value)} disabled={dDisabled} aria-label={`Diklat ${d.name} Lulusan Perempuan`} />
                            </td>
                            <td className="p-1">
                              <div className={`tabular-nums text-center !py-1 text-[11px] font-black rounded-lg border h-[30px] flex items-center justify-center ${dLulusanL + dLulusanP > 0 ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                {fmtNum(dLulusanL + dLulusanP)}
                              </div>
                            </td>
                          </tr>
                          {dInvalid && (
                            <tr>
                              <td colSpan={10} className="bg-red-50 px-3 py-1 text-[10px] font-bold text-red-600 text-center">
                                ⚠️ Lulusan tidak boleh &gt; Peserta pada diklat "{d.name}"
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                    {isInvalidRow && !isParentRow && (
                      <tr>
                        <td colSpan={10} className="bg-red-50 px-3 py-1.5 text-[10px] font-bold text-red-600 text-center border-b border-red-200">
                          ⚠️ {lulusanL > pesertaL ? `Laki-laki ${lulusanL} > ${pesertaL}` : ''}{lulusanL > pesertaL && lulusanP > pesertaP ? ' & ' : ''}{lulusanP > pesertaP ? `Perempuan ${lulusanP} > ${pesertaP}` : ''} — Lulusan tidak boleh &gt; Peserta pada "{p.name}"
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        {hasAnyInvalidRow && (
          <div className="px-5 pb-3">
            <Alert type="error">⚠️ Ada program dengan Lulusan &gt; Peserta. Perbaiki sebelum menyimpan.</Alert>
          </div>
        )}

        {/* Ringkasan Total Keseluruhan (Footer Card) */}
        <div className="p-5 border-t border-surface-border bg-gradient-to-r from-navy-950 via-navy-900 to-navy-950 text-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex-1 grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-navy-300">Total Peserta Laporan</p>
                <p className="text-2xl font-black text-gold-400 tabular-nums mt-0.5">{fmtNum(previewPeserta)}</p>
              </div>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-navy-300">Total Lulusan Laporan</p>
                <p className="text-2xl font-black text-gold-400 tabular-nums mt-0.5">{fmtNum(previewLulusan)}</p>
              </div>
            </div>
            <div className="sm:text-right border-t sm:border-t-0 sm:border-l border-white/10 pt-3 sm:pt-0 sm:pl-6">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-navy-300">Total Keseluruhan</p>
              <p className="text-3xl font-black text-white tabular-nums mt-0.5">{fmtNum(grandTotal)}</p>
            </div>
          </div>
        </div>
        {previewLulusan > previewPeserta && (
          <div className="px-5 pb-3">
            <Alert type="error">⚠️ Total Lulusan ({fmtNum(previewLulusan)}) tidak boleh lebih besar dari Total Peserta ({fmtNum(previewPeserta)}). Perbaiki per program.</Alert>
          </div>
        )}

        {/* Action Bar (Simpan Draf & Preview/Kirim) */}
        <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-surface-border bg-surface-ground">
          <p className="text-xs text-navy-500 max-w-xl">
            Isi <strong>0</strong> bila tidak ada data realisasi. Kategori ber-rincian diklat diisi <strong>per diklat</strong> — total kategori & induk menjumlah otomatis.
          </p>
          {!locked && targetApproved && (
            <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-auto">
              <button
                type="button"
                className={`btn-secondary !py-2.5 ${previewLulusan > previewPeserta || hasAnyInvalidRow ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => doSave(false)}
                disabled={saving || previewLulusan > previewPeserta || hasAnyInvalidRow}
                title={previewLulusan > previewPeserta || hasAnyInvalidRow ? 'Lulusan tidak boleh > Peserta' : ''}
              >
                {saving && !finalizing ? <><Spinner /> Menyimpan...</> : 'Simpan Draf'}
              </button>
              <button
                type="button"
                className={`btn-primary !py-2.5 ${previewLulusan > previewPeserta || hasAnyInvalidRow ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => {
                  const check = validateAll()
                  if (!check.ok) {
                    setMessage({ type: 'error', text: check.msg })
                    return
                  }
                  setPreviewOpen(true)
                }}
                disabled={previewLulusan > previewPeserta || hasAnyInvalidRow}
                title={previewLulusan > previewPeserta || hasAnyInvalidRow ? 'Perbaiki Lulusan > Peserta dulu' : ''}
              >
                <IconEye className="h-4 w-4" /> Preview &amp; Kirim
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal Preview sebelum kirim */}
      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Pratinjau Realisasi"
        subtitle={`Periksa kembali data ${MONTHS[month - 1]} ${year} sebelum dikirim. Setelah dikirim, data akan terkunci.`}
        wide
      >
        <div className="space-y-4">
          {pdfUrl ? (
            <div className="rounded-xl overflow-hidden border border-surface-border bg-navy-50">
              <iframe
                src={pdfUrl}
                title="Pratinjau PDF Realisasi"
                className="w-full h-[62vh] min-h-[420px] block"
              />
            </div>
          ) : (
            <div className="rounded-xl border border-surface-border bg-navy-50 p-10 text-center">
              <Spinner className="h-6 w-6 mx-auto text-navy-400" />
              <p className="text-xs text-navy-400 mt-3">Menyiapkan pratinjau PDF...</p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                if (!pdfUrl) return
                const a = document.createElement('a')
                a.href = pdfUrl
                a.download = `Realisasi_${user?.upt?.code || 'UPT'}_${year}_${String(month).padStart(2, '0')}.pdf`
                document.body.appendChild(a)
                a.click()
                a.remove()
              }}
              disabled={!pdfUrl}
            >
              Unduh PDF
            </button>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" onClick={() => setPreviewOpen(false)}>
                Kembali Edit
              </button>
              <button
                type="button"
                className="btn-primary min-w-[160px]"
                onClick={() => setConfirmOpen(true)}
                disabled={saving}
              >
                <IconLock className="h-4 w-4" /> Kirim &amp; Kunci
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal konfirmasi (langkah terakhir) sebelum kirim & kunci */}
      <Modal
        open={confirmOpen}
        onClose={() => { if (!saving) setConfirmOpen(false) }}
        title="Konfirmasi Kirim Realisasi"
        subtitle="Langkah terakhir sebelum laporan terkunci secara permanen."
      >
        <div className="space-y-4 text-sm text-navy-700">
          <div className="rounded-xl border border-surface-border bg-navy-50 p-4">
            <p className="font-bold text-navy-900">{user?.upt?.name} · Periode {MONTHS[month - 1]} {year}</p>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-white p-2.5 border border-surface-border">
                <p className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Total Peserta</p>
                <p className="text-lg font-extrabold text-navy-900 tabular-nums mt-0.5">{fmtNum(previewPeserta)}</p>
              </div>
              <div className="rounded-lg bg-white p-2.5 border border-surface-border">
                <p className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Total Lulusan</p>
                <p className="text-lg font-extrabold text-navy-900 tabular-nums mt-0.5">{fmtNum(previewLulusan)}</p>
              </div>
              <div className="rounded-lg bg-navy-950 p-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-navy-300">Keseluruhan</p>
                <p className="text-lg font-extrabold text-gold-400 tabular-nums mt-0.5">{fmtNum(grandTotal)}</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <IconLock className="h-5 w-5 shrink-0 text-red-500" />
            <div className="text-red-700">
              <p className="font-bold">Setelah dikirim, data akan TERKUNCI dan tidak dapat diedit lagi.</p>
              <ul className="mt-2 list-disc pl-4 text-xs space-y-1 text-red-600">
                <li>Pastikan seluruh angka peserta &amp; lulusan sudah benar.</li>
                <li>Pastikan periode laporan ({MONTHS[month - 1]} {year}) sudah sesuai.</li>
                <li>Untuk revisi, hubungi Admin BPSDMP agar laporan ini di-unlock.</li>
              </ul>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setConfirmOpen(false)}
              disabled={saving}
            >
              Kembali Periksa
            </button>
            <button
              type="button"
              className="btn-primary min-w-[190px]"
              onClick={() => doSave(true)}
              disabled={saving}
            >
              {saving && finalizing ? (<><Spinner /> Mengirim...</>) : (<><IconLock className="h-4 w-4" /> Ya, Kirim &amp; Kunci</>)}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

