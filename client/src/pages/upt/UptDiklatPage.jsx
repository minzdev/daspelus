import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { apiError } from '../../lib/api'
import { Modal, EmptyState, SkeletonRows, Alert, Spinner, FormField, ConfirmDialog } from '../../components/ui'
import { IconLayers, IconPlus, IconEdit, IconTrash, IconRefresh, IconChevronDown, IconTarget, IconSearch, IconDownload, IconFileText, IconCheck } from '../../components/icons'
import { useToast } from '../../components/Toast'
import { fmtNum, yearOptions } from '../../utils/format'
import logoBpsdm from '../../assets/logo-bpsdm.png'

/**
 * UPT — Input Diklat (Langkah 1 sebelum Input Angka Target).
 * Admin UPT menginput nama-nama diklat miliknya, lalu memetakan ke 1+ program.
 * Contoh: "Pendidikan Karakter" -> program "Pola Pembibitan".
 * Satu grup dengan Input Target PK.
 */
export default function UptDiklatPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [diklats, setDiklats] = useState([])
  const [programs, setPrograms] = useState([])
  const [upt, setUpt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filterProg, setFilterProg] = useState('')
  const toast = useToast()

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [name, setName] = useState('')
  const [checkedProg, setCheckedProg] = useState([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // Import Excel
  const [importOpen, setImportOpen] = useState(false)
  const [importProgId, setImportProgId] = useState('')
  const [importFileName, setImportFileName] = useState('')
  const [importNames, setImportNames] = useState([])
  const [importSkippedFile, setImportSkippedFile] = useState(0)
  const [importParsing, setImportParsing] = useState(false)
  const [importSending, setImportSending] = useState(false)
  const [importError, setImportError] = useState('')
  const [importConfirmOpen, setImportConfirmOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [{ data: dData }, { data: tData }] = await Promise.all([
        api.get('/diklats', { params: { year } }),
        api.get('/targets/my', { params: { year } }),
      ])
      setDiklats(dData.diklats || [])
      setPrograms(tData.programs || [])
      setUpt(tData.upt || null)
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => { load() }, [load])

  const progName = useMemo(() => new Map(programs.map((p) => [p.id, p.name])), [programs])
  const leafPrograms = useMemo(() => programs.filter((p) => !p.isParent || !programs.some((c) => c.parentId === p.id)), [programs])

  const groupedPrograms = useMemo(() => {
    const map = new Map()
    for (const p of leafPrograms) {
      if (!map.has(p.parentName)) map.set(p.parentName, [])
      map.get(p.parentName).push(p)
    }
    return [...map.entries()]
  }, [leafPrograms])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return diklats.filter((d) => {
      if (filterProg && !(d.programIds || []).includes(filterProg)) return false
      if (q && !String(d.name || '').toLowerCase().includes(q)) return false
      return true
    })
  }, [diklats, search, filterProg])

  const diklatByProgram = useMemo(() => {
    const m = new Map()
    for (const d of diklats) {
      for (const pid of d.programIds || []) {
        if (!m.has(pid)) m.set(pid, [])
        m.get(pid).push(d)
      }
    }
    return m
  }, [diklats])

  function openAdd() {
    setEditing(null)
    setName('')
    setCheckedProg([])
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(d) {
    setEditing(d)
    setName(d.name || '')
    setCheckedProg([...(d.programIds || [])])
    setFormError('')
    setModalOpen(true)
  }

  function toggleProg(pid) {
    setCheckedProg((prev) => (prev.includes(pid) ? prev.filter((x) => x !== pid) : [...prev, pid]))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    if (!name.trim()) { setFormError('Nama diklat wajib diisi.'); return }
    if (!checkedProg.length) { setFormError('Pilih minimal 1 program (boleh lebih dari satu).'); return }
    setSaving(true)
    try {
      if (editing) {
        await api.put(`/diklats/${editing.id}`, { name: name.trim(), programIds: checkedProg })
        toast.success('Diklat diperbarui', `"${name.trim()}" — ${checkedProg.length} program.`)
      } else {
        await api.post('/diklats', { year, name: name.trim(), programIds: checkedProg })
        toast.success('Diklat ditambahkan', `"${name.trim()}" masuk ke ${checkedProg.length} program.`)
      }
      setModalOpen(false)
      await load()
    } catch (err) {
      const msg = apiError(err)
      setFormError(msg)
      toast.error('Gagal menyimpan diklat', msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/diklats/${deleteTarget.id}`)
      toast.info('Diklat dihapus', `"${deleteTarget.name}"`)
      setDeleteTarget(null)
      await load()
    } catch (err) {
      toast.error('Gagal menghapus', apiError(err))
    } finally {
      setDeleting(false)
    }
  }

  function openImport() {
    setImportProgId('')
    setImportFileName('')
    setImportNames([])
    setImportSkippedFile(0)
    setImportError('')
    setImportOpen(true)
  }

  function importProgramName() {
    return progName.get(importProgId) || ''
  }

  async function downloadTemplate() {
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = 'DASPESLUS'
      const progLabel = importProgId ? importProgramName() : (filterProg ? progName.get(filterProg) : 'Umum')
      const ws = wb.addWorksheet(`Template Diklat ${year}`, { properties: { tabColor: { argb: '0F172A' } } })
      ws.columns = [{ width: 8 }, { width: 60 }]
      const head = ws.addRow(['NO', 'NAMA DIKLAT'])
      head.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
      head.height = 24
      head.eachCell((c) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
        c.alignment = { horizontal: 'center', vertical: 'middle' }
      })
      const ex1 = ws.addRow([1, 'Contoh: Pendidikan Karakter (hapus baris contoh ini)'])
      ex1.font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF64748B' } }
      ex1.height = 20
      const ex2 = ws.addRow([2, 'Contoh: Diklat Kepelautan (hapus baris contoh ini)'])
      ex2.font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF64748B' } }
      ex2.height = 20

      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      const cleanProg = progLabel.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'Umum'
      a.download = `Template_Diklat_${cleanProg}_${year}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(a.href)
      toast.success('Template diunduh', `Template Excel untuk ${progLabel} berhasil diunduh.`)
    } catch (err) {
      setImportError('Gagal membuat template: ' + apiError(err))
      toast.error('Gagal membuat template', apiError(err))
    }
  }

  async function exportToExcel() {
    if (!filtered.length) {
      toast.warning('Tidak ada data', 'Tidak ada daftar diklat untuk diekspor.')
      return
    }
    setExporting(true)
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = 'DASPESLUS'
      const ws = wb.addWorksheet(`Diklat ${year}`, { properties: { tabColor: { argb: '0F172A' } } })

      ws.columns = [
        { key: 'no', width: 6 },
        { key: 'name', width: 42 },
        { key: 'programs', width: 45 },
        { key: 'peserta', width: 16 },
        { key: 'lulusan', width: 16 },
        { key: 'total', width: 16 },
      ]

      // Header info
      ws.mergeCells('A1:F1')
      const titleCell = ws.getCell('A1')
      titleCell.value = `DAFTAR DIKLAT TAHUN ${year}`
      titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF0F172A' } }
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
      ws.getRow(1).height = 26

      ws.mergeCells('A2:F2')
      const subCell = ws.getCell('A2')
      subCell.value = `${upt?.code || ''} ${upt?.name || ''} — Diekspor pada ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`
      subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } }
      subCell.alignment = { horizontal: 'center', vertical: 'middle' }
      ws.getRow(2).height = 18

      // Table Header
      const headerRow = ws.getRow(4)
      headerRow.values = ['NO', 'NAMA DIKLAT', 'PROGRAM TERKAIT', 'TARGET PESERTA', 'TARGET LULUSAN', 'TOTAL TARGET']
      headerRow.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
      headerRow.height = 24
      headerRow.eachCell((c) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
        c.alignment = { horizontal: 'center', vertical: 'middle' }
        c.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        }
      })

      let rowNum = 5
      let totPeserta = 0
      let totLulusan = 0

      filtered.forEach((d, idx) => {
        const pNames = (d.programIds || []).map((pid) => progName.get(pid) || '—').join(', ')
        const p = Number(d.targetPeserta || 0)
        const l = Number(d.targetLulusan || 0)
        totPeserta += p
        totLulusan += l

        const row = ws.getRow(rowNum++)
        row.values = [idx + 1, d.name, pNames, p, l, p + l]
        row.height = 20
        row.eachCell((c, col) => {
          c.font = { name: 'Calibri', size: 10, color: { argb: 'FF1E293B' } }
          c.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          }
          if (col === 1) c.alignment = { horizontal: 'center', vertical: 'middle' }
          else if (col === 2 || col === 3) c.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
          else {
            c.alignment = { horizontal: 'right', vertical: 'middle' }
            c.numFmt = '#,##0'
          }
        })
        if (idx % 2 === 1) {
          row.eachCell((c) => {
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
          })
        }
      })

      // Total Row
      const totalRow = ws.getRow(rowNum)
      totalRow.values = ['TOTAL', '', '', totPeserta, totLulusan, totPeserta + totLulusan]
      totalRow.height = 22
      totalRow.eachCell((c, col) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
        c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } }
        c.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        }
        if (col <= 3) c.alignment = { horizontal: 'center', vertical: 'middle' }
        else {
          c.alignment = { horizontal: 'right', vertical: 'middle' }
          c.numFmt = '#,##0'
        }
      })

      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      const uptSlug = (upt?.code || 'UPT').replace(/[^\w\-]+/g, '_')
      a.download = `Daftar_Diklat_${uptSlug}_${year}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(a.href)
      toast.success('Ekspor berhasil', `Daftar diklat ${year} berhasil diunduh ke Excel.`)
    } catch (err) {
      toast.error('Gagal mengekspor', apiError(err))
    } finally {
      setExporting(false)
    }
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!importProgId) {
      setImportError('Pilih dulu program induk tujuan sebelum upload file.')
      return
    }
    setImportParsing(true)
    setImportError('')
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(await file.arrayBuffer())
      const ws = wb.worksheets[0]
      if (!ws) throw new Error('File kosong / sheet tidak terbaca.')
      const names = []
      let skipped = 0
      ws.eachRow((row) => {
        const raw = String(row.getCell(2).value ?? '').trim()
        if (!raw) { skipped += 1; return }
        const low = raw.toLowerCase()
        // Lewati baris judul & baris contoh template
        if (low === 'nama diklat' || low === 'no' || low.startsWith('contoh:')) { skipped += 1; return }
        names.push(raw.length > 150 ? raw.slice(0, 150) : raw)
      })
      // Hilangkan duplikat di dalam file (tampilkan sekali, sisanya terhitung dilewati)
      const seen = new Set()
      const unique = []
      let dup = 0
      for (const n of names) {
        const k = n.toLowerCase()
        if (seen.has(k)) { dup += 1; continue }
        seen.add(k)
        unique.push(n)
      }
      if (!unique.length) {
        setImportError('Tidak ada nama diklat valid di file. Ikuti format template (kolom NAMA DIKLAT).')
        setImportNames([])
        return
      }
      setImportNames(unique)
      setImportSkippedFile(skipped + dup)
      setImportFileName(file.name)
    } catch (err) {
      setImportError('Gagal membaca file: ' + apiError(err))
      setImportNames([])
    } finally {
      setImportParsing(false)
    }
  }

  async function doImport() {
    if (!importProgId || !importNames.length) return
    setImportSending(true)
    try {
      const { data } = await api.post('/diklats/import', { year, programIds: [importProgId], names: importNames })
      toast.success('Import selesai', data.message, 6000)
      setImportConfirmOpen(false)
      setImportOpen(false)
      await load()
    } catch (err) {
      toast.error('Gagal import', apiError(err))
    } finally {
      setImportSending(false)
    }
  }

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
                <h1 className="text-base sm:text-lg font-black text-white tracking-tight">Input Diklat</h1>
                <span className="rounded-full bg-white/10 text-gold-300 text-[10px] font-extrabold px-2.5 py-0.5 border border-white/15">Tahun {year}</span>
                <span className="rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-extrabold px-2.5 py-0.5 border border-emerald-400/20">Langkah 1 dari 2</span>
              </div>
              <p className="text-xs text-navy-200 mt-0.5">
                Input <strong className="text-white">nama-nama diklat</strong> UPT Anda, petakan ke <strong className="text-white">1 atau lebih program</strong> — <strong className="text-white">{upt?.code || '—'}</strong> <span className="text-navy-100">{upt?.name || ''}</span>
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
        <div className="rounded-2xl border-2 border-navy-900 bg-navy-50 p-4 flex items-center gap-3">
          <span className="h-9 w-9 rounded-xl bg-navy-900 text-white flex items-center justify-center font-black text-sm">1</span>
          <div>
            <p className="text-sm font-black text-navy-900">Input Diklat (saat ini)</p>
            <p className="text-xs text-slate-500">Daftarkan nama diklat + pilih programnya</p>
          </div>
        </div>
        <Link to="/upt/target-pk" className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center gap-3 hover:border-navy-300 hover:shadow-sm transition-all group">
          <span className="h-9 w-9 rounded-xl bg-slate-100 text-slate-500 group-hover:bg-amber-500 group-hover:text-white flex items-center justify-center font-black text-sm transition-colors">2</span>
          <div className="flex-1">
            <p className="text-sm font-black text-slate-800">Input Angka Target →</p>
            <p className="text-xs text-slate-500">Isi peserta & lulusan per diklat / program</p>
          </div>
          <IconTarget className="h-5 w-5 text-slate-300 group-hover:text-amber-500" />
        </Link>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* Toolbar */}
      <div className="card rounded-2xl border border-slate-200/60 bg-white p-4 flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1 min-w-0">
          <IconSearch className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="form-input !rounded-xl !pl-9" placeholder="Cari nama diklat... (mis. Pendidikan Karakter)" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="form-input !rounded-xl md:max-w-[260px]" value={filterProg} onChange={(e) => setFilterProg(e.target.value)}>
          <option value="">Semua Program</option>
          {leafPrograms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button
          className="btn-secondary !rounded-xl whitespace-nowrap"
          onClick={exportToExcel}
          disabled={exporting || loading || !diklats.length}
          title="Ekspor daftar diklat tahun ini ke file Excel"
        >
          {exporting ? <Spinner size="sm" /> : <IconDownload className="h-4 w-4" />} Ekspor Excel
        </button>
        <button
          className="btn-secondary !rounded-xl whitespace-nowrap"
          onClick={downloadTemplate}
          title="Unduh format template Excel untuk import diklat"
        >
          <IconDownload className="h-4 w-4" /> Unduh Template
        </button>
        <button className="btn-secondary !rounded-xl whitespace-nowrap" onClick={openImport} title="Import banyak nama diklat sekaligus dari Excel"><IconFileText className="h-4 w-4" /> Import Excel</button>
        <button className="btn-primary !rounded-xl whitespace-nowrap" onClick={openAdd}><IconPlus className="h-4 w-4" /> Tambah Diklat</button>
      </div>

      {/* Stats ringkas */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-5 rounded-2xl border border-slate-200/60">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Total Diklat {year}</p>
          <p className="mt-1 text-[28px] font-black tabular-nums">{fmtNum(diklats.length)}</p>
          <p className="text-xs text-slate-500">Terdaftar oleh UPT Anda</p>
        </div>
        <div className="card p-5 rounded-2xl border border-slate-200/60">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Program Terpetakan</p>
          <p className="mt-1 text-[28px] font-black tabular-nums">{diklatByProgram.size} <span className="text-sm font-bold text-slate-400">/ {leafPrograms.length}</span></p>
          <p className="text-xs text-slate-500">Program yang sudah punya rincian</p>
        </div>
        <div className="card p-5 rounded-2xl border border-slate-200/60 bg-gradient-to-br from-navy-950 to-navy-900 text-white border-navy-800">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">Langkah Berikutnya</p>
          <p className="mt-1 text-sm font-bold">Sudah input diklat? Lanjut isi angka target.</p>
          <Link to="/upt/target-pk" className="btn-gold !rounded-xl mt-3 !py-2 text-xs"><IconTarget className="h-4 w-4" /> Ke Input Target PK</Link>
        </div>
      </div>

      {/* Tabel diklat */}
      <div className="card rounded-2xl border border-slate-200/60 overflow-hidden bg-white">
        <div className="px-5 py-4 border-b border-slate-200/60 flex items-center gap-2.5 bg-gradient-to-b from-white to-slate-50/40">
          <span className="h-8 w-8 rounded-xl bg-navy-900 text-white flex items-center justify-center"><IconLayers className="h-4 w-4" /></span>
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">Daftar Diklat {year} ({filtered.length})</h3>
            <p className="text-xs text-slate-500">Setiap diklat dapat masuk ke lebih dari satu program</p>
          </div>
        </div>
        {loading ? (
          <div className="p-4"><SkeletonRows rows={5} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<IconLayers className="h-6 w-6" />}
            title={diklats.length === 0 ? 'Belum ada diklat' : 'Tidak ada hasil'}
            desc={diklats.length === 0 ? `Belum ada nama diklat untuk tahun ${year}. Klik Tambah Diklat — contoh: "Pendidikan Karakter" masuk ke program "Pola Pembibitan".` : 'Coba ubah kata kunci / filter program.'}
            action={diklats.length === 0 ? <button className="btn-primary !rounded-xl" onClick={openAdd}><IconPlus className="h-4 w-4" /> Tambah Diklat Pertama</button> : null}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 720 }}>
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/60">
                  <th className="text-left px-5 py-3.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Nama Diklat</th>
                  <th className="text-left px-3 py-3.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Masuk Program</th>
                  <th className="text-right px-3 py-3.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Target</th>
                  <th className="text-right px-5 py-3.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-900">{d.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{d.targetPeserta + d.targetLulusan > 0 ? `${fmtNum(d.targetPeserta)} peserta · ${fmtNum(d.targetLulusan)} lulusan` : 'Belum ada angka — isi di Input Target PK'}</p>
                    </td>
                    <td className="px-3 py-4">
                      <div className="flex flex-wrap gap-1.5 max-w-[420px]">
                        {(d.programIds || []).map((pid) => (
                          <span key={pid} className="inline-flex items-center rounded-full bg-sky-50 text-sky-700 ring-1 ring-sky-200 px-2.5 py-1 text-xs font-bold">{progName.get(pid) || 'Program terhapus'}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-4 text-right font-bold tabular-nums">{fmtNum((d.targetPeserta || 0) + (d.targetLulusan || 0))}</td>
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <button className="btn-secondary btn-sm !rounded-xl mr-1.5" onClick={() => openEdit(d)}><IconEdit className="h-3.5 w-3.5" /> Edit</button>
                      <button className="btn-secondary btn-sm !rounded-xl !text-red-600 hover:!bg-red-50" onClick={() => setDeleteTarget(d)}><IconTrash className="h-3.5 w-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal tambah/edit */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Diklat' : `Tambah Diklat — ${year}`} subtitle={`${upt?.code || ''} ${upt?.name || ''}`}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <Alert type="error">{formError}</Alert>}
          <FormField label="Nama Diklat" required hint="Contoh: Pendidikan Karakter, Diklat Kepelautan, dsb. (unik per tahun)">
            <input className="form-input !rounded-xl" placeholder="mis. Pendidikan Karakter" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </FormField>
          <div>
            <p className="form-label">Masuk ke Program <span className="text-red-500">*</span> <span className="ml-1 font-medium text-slate-400 normal-case">(boleh pilih lebih dari satu)</span></p>
            <p className="text-xs text-slate-500 mb-2">Contoh: <strong>Pendidikan Karakter</strong> masuk ke program <strong>Pola Pembibitan</strong>. Centang semua program yang relevan.</p>
            {groupedPrograms.length === 0 ? (
              <Alert type="warning">Belum ada program aktif. Hubungi admin.</Alert>
            ) : (
              <div className="space-y-3 max-h-[320px] overflow-y-auto rounded-2xl border border-slate-200 p-3 bg-slate-50/50">
                {groupedPrograms.map(([parentName, progs]) => (
                  <div key={parentName} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <p className="px-3 py-2 text-[11px] font-extrabold uppercase tracking-wide text-slate-600 bg-slate-50 border-b border-slate-100">{parentName}</p>
                    <div className="p-2 space-y-1">
                      {progs.map((p) => {
                        const checked = checkedProg.includes(p.id)
                        const count = (diklatByProgram.get(p.id) || []).length
                        return (
                          <label key={p.id} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer text-sm transition-colors ${checked ? 'bg-navy-900 text-white' : 'hover:bg-slate-50 text-slate-700'}`}>
                            <input type="checkbox" className="h-4 w-4 accent-slate-900" checked={checked} onChange={() => toggleProg(p.id)} />
                            <span className={`flex-1 font-semibold ${checked ? 'text-white' : ''}`}>{p.name}</span>
                            {count > 0 && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${checked ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{count} diklat</span>}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-1.5">Dipilih: <strong className="text-slate-800">{checkedProg.length} program</strong>{checkedProg.length > 0 && ` — ${checkedProg.map((id) => progName.get(id)).join(', ')}`}</p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-secondary !rounded-xl" onClick={() => setModalOpen(false)}>Batal</button>
            <button type="submit" className="btn-primary !rounded-xl min-w-[130px]" disabled={saving}>{saving ? <><Spinner /> Menyimpan...</> : editing ? 'Simpan Perubahan' : 'Tambah Diklat'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onCancel={() => setDeleteTarget(null)} onConfirm={handleDelete} title="Hapus Diklat?" body={`"${deleteTarget?.name}" akan dihapus dari tahun ${year}.`} confirmLabel="Ya, Hapus" cancelLabel="Batal" confirmTone="danger" loading={deleting} />

      {/* Modal import Excel */}
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title={`Import Diklat Excel — ${year}`} subtitle={`${upt?.code || ''} ${upt?.name || ''}`}>
        <div className="space-y-4">
          {importError && <Alert type="error">{importError}</Alert>}

          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
            <p className="text-xs font-extrabold text-slate-700 uppercase tracking-wide">Langkah 1 — Pilih program induk tujuan</p>
            <select className="form-input !rounded-xl" value={importProgId} onChange={(e) => { setImportProgId(e.target.value); setImportNames([]); setImportFileName(''); setImportSkippedFile(0); setImportError('') }}>
              <option value="">— Pilih program (mis. Pelatihan Teknis) —</option>
              {leafPrograms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button type="button" className="btn-secondary !rounded-xl text-xs" onClick={downloadTemplate}>
              <IconDownload className="h-4 w-4" /> Unduh Template {importProgId ? `(${importProgramName()})` : 'Excel'}
            </button>
            <p className="text-[11px] text-slate-500">Template hanya berisi 2 kolom: <strong>NO</strong> dan <strong>NAMA DIKLAT</strong> — khusus untuk program yang dipilih. Isi nama-nama diklat di bawah baris contoh.</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
            <p className="text-xs font-extrabold text-slate-700 uppercase tracking-wide">Langkah 2 — Upload file yang sudah diisi</p>
            <label className={`flex items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-sm font-bold cursor-pointer transition-colors ${!importProgId ? 'border-slate-200 text-slate-400 bg-slate-50' : 'border-navy-300 text-navy-800 hover:bg-navy-50 bg-white'}`}>
              <IconFileText className="h-5 w-5" />
              {importParsing ? 'Membaca file...' : (importFileName || 'Pilih file .xlsx')}
              <input type="file" accept=".xlsx,.xls" className="hidden" disabled={!importProgId || importParsing} onChange={handleImportFile} />
            </label>
            {importFileName && (
              <p className="text-xs text-slate-500">File: <strong className="text-slate-800">{importFileName}</strong></p>
            )}
          </div>

          {importNames.length > 0 && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
              <p className="text-xs font-extrabold text-emerald-900 uppercase tracking-wide">Langkah 3 — Pratinjau ({importNames.length} nama)</p>
              <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-emerald-100 bg-white divide-y divide-slate-100">
                {importNames.map((n, i) => (
                  <div key={i} className="px-3 py-1.5 text-[13px] font-semibold text-slate-700 flex gap-2">
                    <span className="text-slate-400 font-bold w-6 shrink-0">{i + 1}.</span><span>{n}</span>
                  </div>
                ))}
              </div>
              {importSkippedFile > 0 && <p className="text-[11px] text-slate-500 mt-1.5">{importSkippedFile} baris kosong/duplikat/contoh dilewati otomatis.</p>}
              <div className="flex justify-end gap-2 mt-3">
                <button type="button" className="btn-secondary !rounded-xl" onClick={() => setImportOpen(false)}>Batal</button>
                <button
                  type="button"
                  className="btn-primary !rounded-xl min-w-[130px]"
                  disabled={importSending}
                  onClick={() => setImportConfirmOpen(true)}
                >
                  {importSending ? <><Spinner /> Mengirim...</> : <><IconCheck className="h-4 w-4" /> Kirim</>}
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={importConfirmOpen}
        onCancel={() => { if (!importSending) setImportConfirmOpen(false) }}
        onConfirm={doImport}
        title="Yakin import data ini?"
        body={`Import ${importNames.length} nama diklat ini untuk program induk "${importProgramName()}" tahun ${year}? Nama yang sudah ada akan dilewati otomatis.`}
        confirmLabel="Ya, Import"
        cancelLabel="Cek Lagi"
        confirmTone="primary"
        loading={importSending}
      />
    </div>
  )
}
