import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
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

  // Import Excel (Multi-Program / Grouping Sekaligus)
  const [importOpen, setImportOpen] = useState(false)
  const [defaultFallbackProgId, setDefaultFallbackProgId] = useState('')
  const [importFileName, setImportFileName] = useState('')
  const [importParsedItems, setImportParsedItems] = useState([])
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

  function normalizeProgString(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/^[a-z0-9][\.\-\)]\s*/i, '') // hapus awalan A. atau 1.
      .replace(/\(.*?\)/g, '')              // hapus tanda kurung
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function matchProgramClient(inputName) {
    if (!inputName || !programs.length) return null
    const rawLower = String(inputName).trim().toLowerCase()
    const clean = normalizeProgString(inputName)

    // 1. Direct ID match
    const byId = programs.find((p) => String(p.id) === String(inputName))
    if (byId) return byId

    // 2. Exact Name match
    const byExact = programs.find((p) => p.name.trim().toLowerCase() === rawLower)
    if (byExact) return byExact

    // 3. Clean Name match
    const byClean = programs.find((p) => normalizeProgString(p.name) === clean)
    if (byClean) return byClean

    // 4. Sinonim umum (Mandiri -> Non Pola Pembibitan)
    if (clean.includes('mandiri')) {
      const nonPola = programs.find((p) => {
        const pn = normalizeProgString(p.name)
        return pn.includes('non pola') || pn.includes('mandiri')
      })
      if (nonPola) return nonPola
    }
    if (clean.includes('pola pembibitan')) {
      const pola = programs.find((p) => normalizeProgString(p.name).includes('pola pembibitan'))
      if (pola) return pola
    }

    // 5. Partial contains match
    const byIncludes = programs.find((p) => {
      const pn = normalizeProgString(p.name)
      return (pn.length >= 4 && clean.includes(pn)) || (clean.length >= 4 && pn.includes(clean))
    })
    if (byIncludes) return byIncludes

    // 6. Match parentName jika input mencantumkan nama induk
    const byParent = programs.find((p) => {
      const prn = normalizeProgString(p.parentName)
      return prn && (prn === clean || clean.includes(prn))
    })
    if (byParent) return byParent

    return null
  }

  function openImport() {
    setDefaultFallbackProgId(leafPrograms[0]?.id || '')
    setImportFileName('')
    setImportParsedItems([])
    setImportSkippedFile(0)
    setImportError('')
    setImportOpen(true)
  }

  async function downloadTemplate() {
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = 'DASPESLUS'

      // Sheet 1: DATA DIKLAT
      const ws = wb.addWorksheet('DATA DIKLAT', { properties: { tabColor: { argb: '0F172A' } } })
      ws.columns = [
        { header: 'NO', key: 'no', width: 6 },
        { header: 'PROGRAM TUJUAN', key: 'program', width: 34 },
        { header: 'NAMA DIKLAT', key: 'name', width: 44 },
        { header: 'TARGET PESERTA (OPSIONAL)', key: 'tp', width: 25 },
        { header: 'TARGET LULUSAN (OPSIONAL)', key: 'tl', width: 25 },
      ]

      // Header Judul
      ws.mergeCells('A1:E1')
      const tCell = ws.getCell('A1')
      tCell.value = `TEMPLATE IMPORT DATA DIKLAT — ${upt?.code || 'UPT'} ${upt?.name || ''} (${year})`
      tCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF0F172A' } }
      tCell.alignment = { horizontal: 'center', vertical: 'middle' }
      ws.getRow(1).height = 24

      ws.mergeCells('A2:E2')
      const sCell = ws.getCell('A2')
      sCell.value = 'Petunjuk: Cukup isi 1 file ini untuk semua program! Tulis nama program di kolom PROGRAM TUJUAN dan nama diklat di kolom NAMA DIKLAT.'
      sCell.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF475569' } }
      sCell.alignment = { horizontal: 'center', vertical: 'middle' }
      ws.getRow(2).height = 18

      // Table Header Row 4
      const hdr = ws.getRow(4)
      hdr.values = ['NO', 'PROGRAM TUJUAN', 'NAMA DIKLAT', 'TARGET PESERTA (OPSIONAL)', 'TARGET LULUSAN (OPSIONAL)']
      hdr.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
      hdr.height = 24
      hdr.eachCell((c) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
        c.alignment = { horizontal: 'center', vertical: 'middle' }
        c.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        }
      })

      // Baris-baris contoh berdasarkan program nyata UPT
      const samplePrograms = leafPrograms.slice(0, 4)
      let rIdx = 5
      let exCount = 1

      samplePrograms.forEach((sp) => {
        const row = ws.getRow(rIdx++)
        row.values = [exCount++, sp.name, `Contoh Nama Diklat di ${sp.name}`, 20, 20]
        row.height = 20
        row.eachCell((c, col) => {
          c.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } }
          c.alignment = { horizontal: col === 2 || col === 3 ? 'left' : 'center', vertical: 'middle' }
          c.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          }
        })
      })

      // Sheet 2: PANDUAN & DAFTAR PROGRAM RESMI
      const wsRef = wb.addWorksheet('DAFTAR PROGRAM RESMI', { properties: { tabColor: { argb: '0284C7' } } })
      wsRef.columns = [
        { header: 'No', key: 'no', width: 6 },
        { header: 'Nama Program (Bisa Di-copy)', key: 'name', width: 38 },
        { header: 'Program Induk', key: 'parent', width: 28 },
        { header: 'Kategori', key: 'cat', width: 14 },
      ]
      const rHead = wsRef.getRow(1)
      rHead.values = ['NO', 'NAMA PROGRAM RESMI (BISA DI-COPY KE TEMPLATE)', 'PROGRAM INDUK', 'KATEGORI']
      rHead.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
      rHead.height = 22
      rHead.eachCell((c) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0284C7' } }
        c.alignment = { horizontal: 'center', vertical: 'middle' }
      })
      leafPrograms.forEach((p, idx) => {
        const row = wsRef.getRow(idx + 2)
        row.values = [idx + 1, p.name, p.parentName || '—', p.targetGroup || p.category || 'taruna']
        row.height = 19
        row.eachCell((c, col) => {
          c.font = { name: 'Calibri', size: 10, bold: col === 2, color: { argb: 'FF1E293B' } }
          c.alignment = { horizontal: col === 2 || col === 3 ? 'left' : 'center', vertical: 'middle' }
          c.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          }
        })
      })

      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      const uptSlug = (upt?.code || 'UPT').replace(/[^\w\-]+/g, '_')
      a.download = `Template_Import_Diklat_${uptSlug}_${year}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(a.href)
      toast.success('Template diunduh', `Template import diklat lengkap tahun ${year} berhasil diunduh.`)
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
    setImportParsing(true)
    setImportError('')
    setImportParsedItems([])
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(await file.arrayBuffer())
      const ws = wb.worksheets[0]
      if (!ws) throw new Error('File kosong / sheet tidak terbaca.')

      const parsed = []
      let skippedCount = 0
      let activeProgram = null

      ws.eachRow((row, rowNumber) => {
        // Ambil isi sel 1 sampai 5
        const c1 = String(row.getCell(1).value ?? '').trim()
        const c2 = String(row.getCell(2).value ?? '').trim()
        const c3 = String(row.getCell(3).value ?? '').trim()
        const c4 = row.getCell(4).value
        const c5 = row.getCell(5).value

        const low1 = c1.toLowerCase()
        const low2 = c2.toLowerCase()
        const low3 = c3.toLowerCase()

        // Lewati baris header judul utama template
        if (low1.includes('template import') || low2.includes('template import') || low1.includes('petunjuk:') || low2.includes('petunjuk:')) {
          return
        }

        // Lewati baris header kolom
        if (
          low2 === 'nama diklat' || low3 === 'nama diklat' ||
          low2 === 'program tujuan' || low2 === 'program' ||
          low2.startsWith('contoh:') || low3.startsWith('contoh:') ||
          low1 === 'no' && (low2 === 'program tujuan' || low2 === 'nama diklat')
        ) {
          skippedCount += 1
          return
        }

        // POLA 1: Format Template Baru (Kolom B = Program, Kolom C = Nama Diklat)
        if (c2 && c3 && isNaN(Number(c3))) {
          const matchedProg = matchProgramClient(c2)
          if (matchedProg) {
            const dName = c3.length > 150 ? c3.slice(0, 150) : c3
            parsed.push({
              name: dName,
              programId: matchedProg.id,
              programName: matchedProg.name,
              targetPeserta: Math.max(0, parseInt(c4, 10) || 0),
              targetLulusan: Math.max(0, parseInt(c5, 10) || 0),
            })
            return
          }
        }

        // POLA 2: Format Grouping / Laptah (seperti di lembar Laptah asli UPT):
        // Sebuah baris berisi judul program (misal "Pola Pembibitan", "Mandiri", "D. Pelatihan Teknis (Short Course)")
        const possibleProgMatch = matchProgramClient(c2 || c1)
        if (possibleProgMatch && (!c3 || isNaN(Number(c3)))) {
          activeProgram = possibleProgMatch
          skippedCount += 1
          return
        }

        // Jika ada activeProgram dan baris ini berisi nama diklat di kolom B (atau kolom A/C)
        const possibleDiklatName = c2 || c3 || c1
        if (activeProgram && possibleDiklatName) {
          const low = possibleDiklatName.toLowerCase()
          if (
            low === 'no' || low === 'nama' || low.includes('total') || low.includes('jumlah') ||
            low.startsWith('politeknik') || low.startsWith('balai') || low.startsWith('sekolah')
          ) {
            skippedCount += 1
            return
          }
          const tp = Math.max(0, parseInt(c3, 10) || parseInt(c4, 10) || 0)
          const tl = Math.max(0, parseInt(c4, 10) || parseInt(c5, 10) || 0)
          parsed.push({
            name: possibleDiklatName.slice(0, 150),
            programId: activeProgram.id,
            programName: activeProgram.name,
            targetPeserta: tp,
            targetLulusan: tl,
          })
          return
        }

        // POLA 3: Diklat baris tunggal di kolom B tanpa program terdeteksi
        if (c2 && !c3) {
          parsed.push({
            name: c2.slice(0, 150),
            programId: defaultFallbackProgId || null,
            programName: defaultFallbackProgId ? progName.get(defaultFallbackProgId) : null,
            targetPeserta: Math.max(0, parseInt(c4, 10) || 0),
            targetLulusan: Math.max(0, parseInt(c5, 10) || 0),
          })
          return
        }

        skippedCount += 1
      })

      // Dedup nama diklat per program
      const uniqueItems = []
      const seenKey = new Set()
      let dupCount = 0
      for (const item of parsed) {
        const k = `${item.name.toLowerCase()}|${item.programId || ''}`
        if (seenKey.has(k)) {
          dupCount += 1
          continue
        }
        seenKey.add(k)
        uniqueItems.push(item)
      }

      if (!uniqueItems.length) {
        setImportError('Tidak ada nama diklat valid yang ditemukan di file. Pastikan menggunakan format template yang disediakan.')
        setImportParsedItems([])
        return
      }

      setImportParsedItems(uniqueItems)
      setImportSkippedFile(skippedCount + dupCount)
      setImportFileName(file.name)
    } catch (err) {
      setImportError('Gagal membaca file Excel: ' + apiError(err))
      setImportParsedItems([])
    } finally {
      setImportParsing(false)
    }
  }

  async function doImport() {
    if (!importParsedItems.length) return
    setImportSending(true)
    try {
      // Pastikan semua item memiliki programId (gunakan defaultFallbackProgId jika ada yang belum diset)
      const finalItems = importParsedItems
        .map((item) => {
          if (!item.programId && defaultFallbackProgId) {
            return {
              ...item,
              programId: defaultFallbackProgId,
              programName: progName.get(defaultFallbackProgId) || 'Program',
            }
          }
          return item
        })
        .filter((it) => it.programId)

      if (!finalItems.length) {
        toast.warning('Program belum ditentukan', 'Pilih program tujuan untuk diklat yang belum memiliki program.')
        setImportSending(false)
        return
      }

      const { data } = await api.post('/diklats/import', { year, items: finalItems })
      toast.success('Import Berhasil', data.message, 7000)
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

      {/* Modal import Excel Sekaligus (Multi-Program) */}
      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title={`Import Diklat Sekaligus — ${year}`}
        subtitle={`${upt?.code || ''} ${upt?.name || ''} — Cukup 1 file Excel untuk semua program diklat Anda`}
      >
        <div className="space-y-4">
          {importError && <Alert type="error">{importError}</Alert>}

          {/* Langkah 1: Unduh Template */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-black text-slate-800 uppercase tracking-wide">
                Langkah 1 — Unduh Template Excel Lengkap
              </p>
              <button
                type="button"
                className="btn-primary !rounded-xl !py-1.5 !px-3 text-xs bg-navy-900 hover:bg-navy-800 text-white flex items-center gap-1.5 shadow-sm"
                onClick={downloadTemplate}
              >
                <IconDownload className="h-4 w-4" /> Unduh Template Excel
              </button>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Template Excel telah dilengkapi kolom <strong>PROGRAM TUJUAN</strong>, <strong>NAMA DIKLAT</strong>, serta <strong>TARGET (opsional)</strong>. Anda bisa langsung mengelompokkan semua diklat UPT Anda ke dalam <strong>satu file</strong> sekaligus tanpa perlu upload berkali-kali.
            </p>
          </div>

          {/* Langkah 2: Upload File */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-2.5">
            <p className="text-xs font-black text-slate-800 uppercase tracking-wide">
              Langkah 2 — Upload File Excel yang Sudah Diisi
            </p>
            <label
              className={clsx(
                'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 text-sm font-bold cursor-pointer transition-colors',
                importParsing
                  ? 'border-slate-300 bg-slate-100 text-slate-500'
                  : 'border-navy-300 text-navy-900 hover:bg-navy-50/60 bg-white'
              )}
            >
              <IconFileText className="h-6 w-6 text-navy-700" />
              <span>{importParsing ? 'Membaca data file Excel...' : (importFileName || 'Klik atau Drag file Excel (.xlsx / .xls) ke sini')}</span>
              <span className="text-[11px] font-normal text-slate-500">Mendukung format template DASPESLUS maupun tabel Laptah UPT</span>
              <input type="file" accept=".xlsx,.xls" className="hidden" disabled={importParsing} onChange={handleImportFile} />
            </label>
            {importFileName && (
              <p className="text-xs text-slate-600">
                File terpilih: <strong className="text-slate-900">{importFileName}</strong>
              </p>
            )}
          </div>

          {/* Langkah 3: Pratinjau Pengelompokan & Data */}
          {importParsedItems.length > 0 && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/60 pb-2">
                <div>
                  <p className="text-xs font-black text-emerald-950 uppercase tracking-wide">
                    Langkah 3 — Pratinjau Pengelompokan ({importParsedItems.length} Diklat Terbaca)
                  </p>
                  <p className="text-[11px] text-emerald-800">
                    Semua diklat di bawah ini akan diimpor sekaligus ke program masing-masing:
                  </p>
                </div>
                <span className="rounded-full bg-emerald-100 text-emerald-900 text-xs font-black px-2.5 py-0.5">
                  Siap diimport
                </span>
              </div>

              {/* Rincian per grup program */}
              <div className="flex flex-wrap gap-1.5">
                {[...new Set(importParsedItems.map((it) => it.programName || 'Belum Ditentukan'))].map((pName) => {
                  const count = importParsedItems.filter((it) => (it.programName || 'Belum Ditentukan') === pName).length
                  const isUnassigned = pName === 'Belum Ditentukan'
                  return (
                    <span
                      key={pName}
                      className={clsx(
                        'rounded-lg px-2.5 py-1 text-xs font-bold border flex items-center gap-1.5',
                        isUnassigned
                          ? 'bg-amber-100 text-amber-900 border-amber-300'
                          : 'bg-white text-navy-900 border-emerald-200 shadow-xs'
                      )}
                    >
                      <span>{pName}</span>
                      <span className={clsx('rounded-full text-[10px] px-1.5 py-0.2 font-black', isUnassigned ? 'bg-amber-200 text-amber-950' : 'bg-navy-900 text-white')}>
                        {count} diklat
                      </span>
                    </span>
                  )
                })}
              </div>

              {/* Dropdown fallback jika ada diklat yang belum memiliki program */}
              {importParsedItems.some((it) => !it.programId) && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs space-y-1">
                  <p className="font-bold text-amber-900">
                    ⚠️ Beberapa baris belum terpetakan ke program otomatis:
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-amber-800 text-[11px] shrink-0">Pilih program untuk baris tersebut:</span>
                    <select
                      className="form-input !py-1 !text-xs font-semibold !rounded-lg"
                      value={defaultFallbackProgId}
                      onChange={(e) => setDefaultFallbackProgId(e.target.value)}
                    >
                      {leafPrograms.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Tabel mini daftar nama diklat */}
              <div className="max-h-52 overflow-y-auto rounded-xl border border-emerald-200 bg-white divide-y divide-slate-100 text-xs">
                {importParsedItems.map((item, i) => (
                  <div key={i} className="px-3 py-2 flex items-center justify-between gap-3 hover:bg-slate-50">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-slate-400 font-bold w-6 shrink-0">{i + 1}.</span>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 truncate" title={item.name}>{item.name}</p>
                        <p className="text-[10px] text-slate-500">
                          Program:{' '}
                          <span className="font-semibold text-navy-800">
                            {item.programName || (defaultFallbackProgId ? progName.get(defaultFallbackProgId) : 'Pilih program')}
                          </span>
                        </p>
                      </div>
                    </div>
                    {(item.targetPeserta > 0 || item.targetLulusan > 0) && (
                      <div className="text-[10px] text-right shrink-0 font-medium text-slate-500">
                        <span>Tgt Pst: <strong>{fmtNum(item.targetPeserta)}</strong></span>
                        <span className="ml-2">Tgt Lls: <strong>{fmtNum(item.targetLulusan)}</strong></span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {importSkippedFile > 0 && (
                <p className="text-[11px] text-slate-500">
                  ℹ️ {importSkippedFile} baris header/kosong/duplikat dilewati secara otomatis.
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn-secondary !rounded-xl" onClick={() => setImportOpen(false)}>
                  Batal
                </button>
                <button
                  type="button"
                  className="btn-primary !rounded-xl min-w-[170px] bg-emerald-600 hover:bg-emerald-700 shadow-sm"
                  disabled={importSending}
                  onClick={() => setImportConfirmOpen(true)}
                >
                  {importSending ? <><Spinner /> Mengimpor...</> : <><IconCheck className="h-4 w-4" /> Import Semua Diklat</>}
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
        title="Konfirmasi Import Sekaligus"
        body={`Yakin ingin mengimpor ${importParsedItems.length} diklat ke program-program terkait untuk tahun ${year}? Diklat yang sudah terdaftar akan diperbarui secara otomatis tanpa duplikasi.`}
        confirmLabel="Ya, Import Sekarang"
        cancelLabel="Periksa Lagi"
        confirmTone="primary"
        loading={importSending}
      />
    </div>
  )
}
