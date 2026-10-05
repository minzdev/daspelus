import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { apiError } from '../../lib/api'
import { Modal, EmptyState, SkeletonRows, Alert, Spinner, FormField, ConfirmDialog } from '../../components/ui'
import {
  IconTarget,
  IconEdit,
  IconRefresh,
  IconLayers,
  IconChevronDown,
  IconPlus,
  IconDownload,
  IconFileText,
  IconCheck,
} from '../../components/icons'
import { useToast } from '../../components/Toast'
import { fmtNum, yearOptions } from '../../utils/format'
import logoBpsdm from '../../assets/logo-bpsdm.png'

function parseNum(s) {
  const cleaned = String(s ?? '').trim()
  if (cleaned === '') return NaN
  if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) return Number(cleaned.replace(/\./g, ''))
  return Number(cleaned.replace(/\.$/, ''))
}

function normalizeProgString(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/^[a-z0-9][\.\-\)]\s*/i, '') // hapus awalan seperti A. atau 1.
    .replace(/\(.*?\)/g, '')              // hapus tanda kurung
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * UPT — Target PK SINGLE-INPUT (cukup 1 nilai Target PK, tanpa peserta & lulusan terpisah).
 * Alur:
 * - Bisa atur langsung di tabel / modal.
 * - Bisa unduh template Excel & import sekaligus (No, Program Tujuan, Nama Diklat, Target PK).
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

  // Modal Atur Target
  const [modalOpen, setModalOpen] = useState(false)
  const [diklatForm, setDiklatForm] = useState({})
  const [progForm, setProgForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false)

  // Modal Import Excel
  const [importOpen, setImportOpen] = useState(false)
  const [importStep, setImportStep] = useState(1)
  const [importFile, setImportFile] = useState(null)
  const [importSending, setImportSending] = useState(false)
  const [importError, setImportError] = useState('')
  const [importParsedItems, setImportParsedItems] = useState([])
  const [importConfirmOpen, setImportConfirmOpen] = useState(false)
  const [importSkippedCount, setImportSkippedCount] = useState(0)

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

  // Kelompok induk → turunan
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
  function diklatVal(pid, dId) {
    const key = `${pid}_${dId}`
    const f = diklatForm[key]
    if (f !== undefined && String(f).trim() !== '') return String(f).trim()
    const saved = diklatById.get(dId)
    if (saved) {
      const tbp = (saved.targetByProgram && typeof saved.targetByProgram === 'object') ? saved.targetByProgram[pid] : null
      if (tbp && (tbp.targetPk !== undefined || tbp.targetPeserta !== undefined)) {
        return String(tbp.targetPk ?? tbp.targetPeserta ?? 0)
      }
      return String(saved.targetPeserta || saved.targetLulusan || 0)
    }
    return '0'
  }

  // Nilai program: INDUK = auto-sum turunan; TURUNAN ber-diklat = auto-sum diklat; TURUNAN tanpa diklat = input langsung
  function progVal(pid, _seen = new Set()) {
    if (_seen.has(pid)) return '0'
    _seen.add(pid)
    if (parentsWithChildren.has(pid)) {
      const kids = childIdsByParent.get(pid) || []
      const total = kids.reduce((s, kid) => s + (Number(progVal(kid, new Set(_seen))) || 0), 0)
      return String(total)
    }
    const f = progForm[pid]
    if (f !== undefined && String(f).trim() !== '') return String(f).trim()
    const saved = itemsByPid.get(pid)
    const hasDiklat = (diklatByProgram.get(pid) || []).length > 0
    if (hasDiklat) {
      const list = diklatByProgram.get(pid) || []
      return String(list.reduce((s, d) => s + (Number(diklatVal(pid, d.id)) || 0), 0))
    }
    if (saved) return String(saved.targetPeserta || saved.targetLulusan || 0)
    return '0'
  }

  function openModal() {
    setDiklatForm({})
    setProgForm({})
    setFormError('')
    setModalOpen(true)
  }

  const previewTotal = useMemo(() => {
    let tot = 0
    for (const p of leafPrograms) {
      tot += Number(progVal(p.id)) || 0
    }
    return tot
  }, [leafPrograms, diklatForm, progForm, diklats, myTarget]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e, andSend = false) {
    if (e) e.preventDefault()
    setFormError('')
    const diklatTargets = []

    // Kumpulkan target per diklat per program
    for (const p of leafPrograms) {
      const rincian = diklatByProgram.get(p.id) || []
      for (const d of rincian) {
        const v = diklatVal(p.id, d.id)
        const val = parseNum(v) || 0
        if (!Number.isFinite(val) || val < 0) {
          setFormError(`Diklat "${d.name}" di "${p.name}" harus berupa angka Target PK ≥ 0.`)
          return
        }
        diklatTargets.push({
          diklatId: d.id,
          programId: p.id,
          target: val,
          targetPk: val,
          targetPeserta: val,
          targetLulusan: val,
        })
      }
    }
    for (const g of parentGroups) {
      if (g.parentId && g.children.length === 0) {
        const rincian = diklatByProgram.get(g.parentId) || []
        for (const d of rincian) {
          const v = diklatVal(g.parentId, d.id)
          const val = parseNum(v) || 0
          diklatTargets.push({
            diklatId: d.id,
            programId: g.parentId,
            target: val,
            targetPk: val,
            targetPeserta: val,
            targetLulusan: val,
          })
        }
      }
    }

    const items = []
    for (const p of leafPrograms) {
      const hasDiklat = (diklatByProgram.get(p.id) || []).length > 0
      if (hasDiklat) continue
      const f = progForm[p.id]
      const saved = itemsByPid.get(p.id)
      const valStr = f !== undefined ? String(f ?? '').trim() : ''
      if (f === undefined && !saved) continue
      const val = valStr !== '' ? parseNum(valStr) : saved ? Number(saved.targetPeserta || saved.targetLulusan || 0) : 0
      if (!Number.isFinite(val) || val < 0) {
        setFormError(`Target "${p.name}" harus berupa angka Target PK ≥ 0.`)
        return
      }
      if (f !== undefined || val > 0) {
        items.push({
          programId: p.id,
          target: val || 0,
          targetPk: val || 0,
          targetPeserta: val || 0,
          targetLulusan: val || 0,
        })
      }
    }

    if (!diklatTargets.length && !items.length) {
      setFormError('Isi Target PK minimal untuk satu diklat atau satu program.')
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
      toast.error('Gagal menyimpan Target PK', apiError(err))
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

  // ─────────────────────────────────────────────────────────────
  // FITUR EXCEL: DOWNLOAD TEMPLATE & IMPORT TARGET PK
  // ─────────────────────────────────────────────────────────────
  function matchProgramClient(inputName) {
    if (!inputName || !programs.length) return null
    const rawLower = String(inputName).trim().toLowerCase()
    const clean = normalizeProgString(inputName)

    const byId = programs.find((p) => String(p.id) === String(inputName))
    if (byId) return byId
    const byExact = programs.find((p) => p.name.trim().toLowerCase() === rawLower)
    if (byExact) return byExact
    const byClean = programs.find((p) => normalizeProgString(p.name) === clean)
    if (byClean) return byClean

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

    const byIncludes = programs.find((p) => {
      const pn = normalizeProgString(p.name)
      return (pn.length >= 4 && clean.includes(pn)) || (clean.length >= 4 && pn.includes(clean))
    })
    if (byIncludes) return byIncludes
    return null
  }

  async function downloadTemplate() {
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = 'DASPESLUS'

      // Sheet 1: DATA TARGET PK
      const ws = wb.addWorksheet('DATA TARGET PK', { properties: { tabColor: { argb: '0F172A' } } })
      ws.columns = [
        { header: 'NO', key: 'no', width: 6 },
        { header: 'PROGRAM TUJUAN', key: 'program', width: 34 },
        { header: 'NAMA DIKLAT', key: 'name', width: 44 },
        { header: 'TARGET PK', key: 'target', width: 18 },
      ]

      ws.mergeCells('A1:D1')
      const tCell = ws.getCell('A1')
      tCell.value = `TEMPLATE IMPORT TARGET PK — ${upt?.code || 'UPT'} ${upt?.name || ''} (${year})`
      tCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF0F172A' } }
      tCell.alignment = { horizontal: 'center', vertical: 'middle' }
      ws.getRow(1).height = 24

      ws.mergeCells('A2:D2')
      const sCell = ws.getCell('A2')
      sCell.value = 'Petunjuk: Isi nama program di kolom PROGRAM TUJUAN, nama diklat di kolom NAMA DIKLAT, dan angka Target PK di kolom TARGET PK.'
      sCell.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF475569' } }
      sCell.alignment = { horizontal: 'center', vertical: 'middle' }
      ws.getRow(2).height = 18

      const hdr = ws.getRow(4)
      hdr.values = ['NO', 'PROGRAM TUJUAN', 'NAMA DIKLAT', 'TARGET PK']
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

      // Baris-baris contoh
      const samplePrograms = leafPrograms.slice(0, 4)
      let rIdx = 5
      let exCount = 1

      samplePrograms.forEach((sp) => {
        const row = ws.getRow(rIdx++)
        row.values = [exCount++, sp.name, `Contoh Nama Diklat di ${sp.name}`, 50]
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

      // Sheet 2: DAFTAR PROGRAM RESMI
      const wsRef = wb.addWorksheet('DAFTAR PROGRAM RESMI', { properties: { tabColor: { argb: '0284C7' } } })
      wsRef.columns = [
        { header: 'No', key: 'no', width: 6 },
        { header: 'Nama Program (Bisa Di-copy)', key: 'name', width: 38 },
        { header: 'Program Induk', key: 'parent', width: 28 },
      ]
      const rHead = wsRef.getRow(1)
      rHead.values = ['NO', 'NAMA PROGRAM RESMI (BISA DI-COPY KE TEMPLATE)', 'PROGRAM INDUK']
      rHead.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
      rHead.height = 22
      rHead.eachCell((c) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0284C7' } }
        c.alignment = { horizontal: 'center', vertical: 'middle' }
      })
      leafPrograms.forEach((p, idx) => {
        const row = wsRef.getRow(idx + 2)
        row.values = [idx + 1, p.name, p.parentName || '-']
        row.height = 19
      })

      const buffer = await wb.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `TEMPLATE_IMPORT_TARGET_PK_${upt?.code || 'UPT'}_${year}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Template Siap', 'Template Target PK berhasil diunduh.')
    } catch (err) {
      console.error(err)
      toast.error('Gagal mengunduh template', err.message)
    }
  }

  function openImport() {
    setImportStep(1)
    setImportFile(null)
    setImportParsedItems([])
    setImportSkippedCount(0)
    setImportError('')
    setImportOpen(true)
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportFile(file)
    setImportError('')
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(await file.arrayBuffer())

      const ws = wb.worksheets[0]
      if (!ws) throw new Error('File Excel tidak memiliki worksheet.')

      let headerRowIdx = -1
      let colMap = { no: -1, prog: -1, name: -1, target: -1 }

      ws.eachRow((row, rowNumber) => {
        if (headerRowIdx !== -1) return
        const vals = (row.values || []).map((v) => String(v || '').trim().toLowerCase())
        vals.forEach((txt, colIdx) => {
          if (!txt) return
          if (txt === 'no' || txt === 'nomor') colMap.no = colIdx
          else if (txt.includes('program') || txt.includes('induk')) colMap.prog = colIdx
          else if (txt.includes('nama') || txt.includes('diklat')) colMap.name = colIdx
          else if (txt.includes('target') || txt.includes('pk')) colMap.target = colIdx
        })
        if (colMap.name !== -1 || colMap.prog !== -1) {
          headerRowIdx = rowNumber
        }
      })

      if (headerRowIdx === -1) {
        headerRowIdx = 4
        colMap = { no: 1, prog: 2, name: 3, target: 4 }
      }

      const parsed = []
      let skipped = 0

      ws.eachRow((row, rowNumber) => {
        if (rowNumber <= headerRowIdx) return
        const getVal = (col) => {
          if (!col || col === -1) return ''
          const cell = row.getCell(col)
          return cell && cell.value !== undefined ? String(cell.value).trim() : ''
        }

        const progRaw = getVal(colMap.prog)
        const nameRaw = getVal(colMap.name)
        const targetRaw = getVal(colMap.target)

        const matchedProg = matchProgramClient(progRaw)
        const targetVal = Math.max(0, parseInt(targetRaw.replace(/[^0-9]/g, ''), 10) || 0)

        if (!nameRaw && !matchedProg) {
          skipped++
          return
        }

        parsed.push({
          rowNum: rowNumber,
          rawProg: progRaw,
          programId: matchedProg ? matchedProg.id : '',
          programName: matchedProg ? matchedProg.name : (progRaw || '—'),
          name: nameRaw,
          target: targetVal,
        })
      })

      if (!parsed.length) {
        throw new Error('Tidak ada baris data yang terbaca dari file Excel.')
      }

      setImportParsedItems(parsed)
      setImportSkippedCount(skipped)
      setImportStep(2)
    } catch (err) {
      console.error(err)
      setImportError(err.message || 'Gagal membaca file Excel.')
    }
  }

  async function handleImportSubmit() {
    setImportSending(true)
    try {
      const validItems = importParsedItems.filter((it) => it.programId)
      if (!validItems.length) {
        toast.warning('Program belum ditentukan', 'Pilih program tujuan untuk baris yang belum memiliki program.')
        setImportSending(false)
        return
      }

      // Coba panggil endpoint POST /targets/import
      try {
        const { data } = await api.post('/targets/import', { year, items: validItems })
        toast.success('Import Berhasil', data.message || 'Target PK berhasil diimpor.', 7000)
      } catch (postErr) {
        // Fallback: jika endpoint /targets/import 404 / belum terload di backend VPS
        if (postErr.response?.status === 404 || postErr.response?.status === 400) {
          // Siapkan payload ke PUT /targets/my
          const diklatTargets = []
          const directItems = []

          for (const it of validItems) {
            const rawName = String(it.name || '').trim()
            const tVal = Number(it.target) || 0
            if (rawName) {
              // Cari diklat yang sudah ada
              let existing = diklats.find((d) => d.name.trim().toLowerCase() === rawName.toLowerCase())
              let dId = existing ? existing.id : null
              if (!dId) {
                // Buat diklat dulu
                try {
                  const created = await api.post('/diklats', {
                    year,
                    name: rawName,
                    programIds: [it.programId],
                  })
                  dId = created.data?.id
                } catch (e) {
                  console.error('Gagal create diklat saat fallback:', e)
                }
              }
              if (dId) {
                diklatTargets.push({
                  diklatId: dId,
                  programId: it.programId,
                  target: tVal,
                  targetPk: tVal,
                  targetPeserta: tVal,
                  targetLulusan: tVal,
                })
              }
            } else {
              directItems.push({
                programId: it.programId,
                target: tVal,
                targetPk: tVal,
                targetPeserta: tVal,
                targetLulusan: tVal,
              })
            }
          }

          await api.put('/targets/my', { year, items: directItems, diklatTargets })
          toast.success('Import Berhasil', `${validItems.length} baris Target PK berhasil diimpor dan disimpan.`, 7000)
        } else {
          throw postErr
        }
      }

      setImportConfirmOpen(false)
      setImportOpen(false)
      await load()
    } catch (err) {
      toast.error('Gagal import Target PK', apiError(err))
    } finally {
      setImportSending(false)
    }
  }

  function DiklatInputList({ rincian, contextName, programId }) {
    return (
      <div className="mt-3 space-y-2 rounded-xl bg-slate-50/70 border border-slate-100 p-3">
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Rincian diklat ({rincian.length}) di bawah {contextName}</p>
        {rincian.map((d) => {
          const fKey = `${programId}_${d.id}`
          const v = diklatVal(programId, d.id)
          return (
            <div key={d.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2.5">
              <p className="text-[13px] font-semibold text-slate-700 flex items-center gap-1.5 min-w-0">
                <span className="text-slate-400 font-bold">•</span>
                <span className="truncate">{d.name}</span>
              </p>
              <div className="w-full sm:w-44 shrink-0 flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 whitespace-nowrap">Target PK:</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  className="form-input !py-1.5 tabular-nums text-center font-black !rounded-xl text-slate-900 border-slate-300 focus:border-navy-600 focus:ring-1 focus:ring-navy-600"
                  placeholder="0"
                  value={v}
                  onChange={(e) => setDiklatForm((f) => ({ ...f, [fKey]: e.target.value.replace(/[^0-9]/g, '') }))}
                />
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const totalTargetPk = myTarget?.targetPeserta || myTarget?.targetLulusan || 0
  const hasAny = (myTarget?.items || []).length > 0 || totalTargetPk > 0
  const totalProgramsCount = (myTarget?.items || []).filter((i) => (Number(i.targetPeserta) || Number(i.targetLulusan) || 0) > 0).length

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
                Tetapkan angka Target PK <strong className="text-white">satu kali</strong> per program / diklat — <strong className="text-white">{upt?.code || '—'}</strong> <span className="text-navy-100">{upt?.name || ''}</span>
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
            <p className="text-sm font-black text-navy-900">Input Target PK (saat ini)</p>
            <p className="text-xs text-slate-500">Isi angka Target PK — satu kali input per tahun</p>
          </div>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* Ketentuan konsistensi LAKIP */}
      <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white font-black text-sm shadow-sm">!</span>
        <div className="text-xs leading-relaxed text-amber-900">
          <p className="font-black text-[13px] text-amber-950">Target PK harus konsisten dengan capaian pada LAKIP</p>
          <p className="mt-0.5">
            Angka <strong>Target PK</strong> yang ditetapkan di sini wajib <strong>sama dan konsisten</strong> dengan target yang tercantum pada <strong>LAKIP</strong> (Laporan Akuntabilitas Kinerja Instansi Pemerintah) UPT Anda.
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

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-5 rounded-2xl bg-gradient-to-br from-navy-950 to-navy-900 border border-navy-800 text-white shadow-sm relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-gold-400" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">Total Target PK {year}</p>
              <p className="mt-2 text-[32px] font-black text-gold-300 tabular-nums">{fmtNum(totalTargetPk)}</p>
              <p className="text-xs text-slate-300 mt-1">Satu kali input tahunan</p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center">
              <IconTarget className="h-6 w-6 text-gold-300" />
            </div>
          </div>
        </div>

        <div className="card card-hover p-5 rounded-2xl border border-slate-200/60 shadow-sm relative overflow-hidden bg-white">
          <div className="absolute inset-x-0 top-0 h-1 bg-navy-600" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Program Terdata</p>
              <p className="mt-2 text-[32px] font-black text-slate-900 tabular-nums">{totalProgramsCount}</p>
              <p className="text-xs text-slate-500 mt-1">Dari {leafPrograms.length} program turunan</p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-navy-50 text-navy-800 flex items-center justify-center">
              <IconLayers className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="card card-hover p-5 rounded-2xl border border-slate-200/60 shadow-sm relative overflow-hidden bg-white">
          <div className="absolute inset-x-0 top-0 h-1 bg-emerald-500" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Diklat Terdata</p>
              <p className="mt-2 text-[32px] font-black text-slate-900 tabular-nums">{diklats.length}</p>
              <p className="text-xs text-slate-500 mt-1">Rincian nama diklat tahun {year}</p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <IconFileText className="h-6 w-6" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabel rincian & Toolbar */}
      <div className="card rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden bg-white">
        <div className="px-5 py-4 border-b border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-b from-white to-slate-50/40">
          <div className="flex items-center gap-2.5">
            <span className="h-8 w-8 rounded-xl bg-navy-900 text-white flex items-center justify-center"><IconLayers className="h-4 w-4" /></span>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">Rincian Target PK {year}</h3>
              <p className="text-xs text-slate-500">Per program dan rincian nama diklat di bawahnya</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <button
              type="button"
              className="btn-secondary !rounded-xl !py-2 whitespace-nowrap"
              onClick={downloadTemplate}
              title="Unduh template Excel untuk input Target PK"
            >
              <IconDownload className="h-4 w-4" /> Unduh Template
            </button>
            <button
              type="button"
              className="btn-secondary !rounded-xl !py-2 whitespace-nowrap"
              onClick={openImport}
              disabled={isLocked}
              title={isLocked ? 'Terkunci' : 'Import Target PK dari file Excel'}
            >
              <IconFileText className="h-4 w-4" /> Import Excel
            </button>
            {!isLocked && hasAny && (
              <button className="btn-gold !rounded-xl !py-2 whitespace-nowrap" onClick={() => setSendConfirmOpen(true)}>
                <IconTarget className="h-4 w-4" /> Kirim ke Pimpinan
              </button>
            )}
            <button
              className="btn-primary !rounded-xl !py-2 whitespace-nowrap"
              onClick={openModal}
              disabled={!programs.length || isLocked}
              title={isLocked ? 'Terkunci — ajukan unlock untuk revisi' : 'Atur target'}
            >
              <IconEdit className="h-4 w-4" /> {hasAny ? 'Kelola Target' : 'Atur Target'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-4"><SkeletonRows rows={5} /></div>
        ) : !hasAny ? (
          <EmptyState
            icon={<IconTarget className="h-6 w-6" />}
            title="Belum ada target PK"
            desc={diklats.length === 0
              ? `Langkah 1: input nama diklat di menu Input Diklat, atau unduh template Excel untuk isi diklat & target sekaligus.`
              : `Sudah ada ${diklats.length} diklat. Klik Atur Target atau Import Excel untuk isi angka Target PK.`}
            action={
              <div className="flex gap-2 justify-center flex-wrap">
                <button className="btn-secondary !rounded-xl" onClick={downloadTemplate}><IconDownload className="h-4 w-4" /> Unduh Template</button>
                <button className="btn-secondary !rounded-xl" onClick={openImport}><IconFileText className="h-4 w-4" /> Import Excel</button>
                <button className="btn-primary !rounded-xl" onClick={openModal}><IconEdit className="h-4 w-4" /> Atur Target</button>
              </div>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 600 }}>
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/60">
                  <th className="text-left px-5 py-3.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Program / Rincian Diklat</th>
                  <th className="text-right px-6 py-3.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-500 w-48">Target PK</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {parentGroups.map((g) => {
                  const rows = []
                  // ── Baris INDUK (auto-sum dari turunan) ──
                  if (g.parent) {
                    const pkInduk = Number(progVal(g.parentId)) || 0
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
                                const pk = (tbp && (tbp.targetPk !== undefined || tbp.targetPeserta !== undefined)) ? (tbp.targetPk ?? tbp.targetPeserta) : (d.targetPeserta || 0)
                                return (
                                  <div key={d.id} className="px-3 py-1.5 flex items-center justify-between gap-2 text-xs">
                                    <span className="font-semibold text-slate-600">• {d.name}</span>
                                    <span className="tabular-nums font-bold text-slate-700">{fmtNum(pk)}</span>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="inline-flex items-center rounded-full bg-navy-900 text-gold-300 px-3.5 py-1 text-xs font-black tabular-nums">
                            {fmtNum(pkInduk)}
                          </span>
                        </td>
                      </tr>
                    )
                  }
                  // ── Baris TURUNAN + rincian diklat ──
                  for (const child of g.children) {
                    const it = itemsByPid.get(child.id)
                    const pkVal = (it?.targetPeserta ?? Number(progVal(child.id))) || 0
                    const rincian = (diklatByProgram.get(child.id) || []).filter((d) => d)
                    rows.push(
                      <tr key={child.id} className="hover:bg-slate-50/60 align-top">
                        <td className="px-5 py-4">
                          <div className="flex items-start gap-2">
                            <span className="mt-1.5 h-4 w-1 rounded-full bg-slate-300 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-slate-900">{child.name}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{g.parentName}</p>
                              {rincian.length > 0 ? (
                                <div className="mt-2 rounded-xl bg-slate-50 border border-slate-100 divide-y divide-slate-100">
                                  {rincian.map((d) => {
                                    const tbp = (d.targetByProgram && typeof d.targetByProgram === 'object') ? d.targetByProgram[child.id] : null
                                    const dPk = (tbp && (tbp.targetPk !== undefined || tbp.targetPeserta !== undefined)) ? (tbp.targetPk ?? tbp.targetPeserta) : (d.targetPeserta || 0)
                                    return (
                                      <div key={d.id} className="px-3 py-1.5 flex items-center justify-between gap-2 text-xs">
                                        <span className="font-semibold text-slate-600">• {d.name}</span>
                                        <span className="tabular-nums font-bold text-slate-700">{fmtNum(dPk)}</span>
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
                        <td className="px-6 py-4 text-right">
                          <span className="inline-flex items-center rounded-xl bg-slate-100 text-slate-900 border border-slate-200 px-3 py-1 text-xs font-black tabular-nums">
                            {fmtNum(pkVal)}
                          </span>
                        </td>
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

      {/* Modal Atur Target PK */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={`Atur Target PK — ${upt?.code || ''} ${year}`} subtitle={`${upt?.name || ''} · satu kali input per tahun`} wide>
        <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-5">
          {formError && <Alert type="error">{formError}</Alert>}
          <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4 text-xs text-slate-600 leading-relaxed space-y-1.5">
            <p><strong className="text-slate-900">Petunjuk Pengisian:</strong> Cukup isi 1 angka <strong>Target PK</strong> per diklat bila ada rincian, atau langsung per <strong>program turunan</strong> bila tanpa rincian diklat.</p>
            <p className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-amber-900">
              <strong>Penting:</strong> Angka Target PK harus <strong>sama dan konsisten dengan angka capaian pada LAKIP</strong> UPT Anda.
            </p>
          </div>

          {diklats.length === 0 && (
            <Alert type="warning">
              Belum ada diklat terdaftar. Anda dapat isi angka langsung per program, atau <Link to="/upt/diklat" className="underline font-bold">tambah diklat dulu</Link> agar ada rincian per diklat.
            </Alert>
          )}

          {parentGroups.length === 0 ? (
            <EmptyState icon={<IconLayers className="h-6 w-6" />} title="Belum ada program" desc="Hubungi admin untuk menambah program." />
          ) : (
            parentGroups.map((g) => {
              const pkInduk = g.parentId ? Number(progVal(g.parentId)) || 0 : 0
              return (
                <div key={g.parentId || g.parentName} className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                  {/* Header INDUK */}
                  <div className="px-4 py-3 bg-gradient-to-r from-navy-900 to-navy-800 text-white flex items-center gap-2 flex-wrap">
                    <span className="h-7 w-7 rounded-lg bg-white/15 border border-white/20 text-white flex items-center justify-center"><IconLayers className="h-3.5 w-3.5" /></span>
                    <p className="text-xs font-extrabold uppercase tracking-wide">{g.parentName}</p>
                    {g.children.length > 0 && (
                      <span className="inline-flex items-center rounded-full bg-white text-navy-900 text-[10px] font-black px-2 py-0.5">induk auto</span>
                    )}
                    {g.parentId && (
                      <span className="ml-auto text-[11px] font-black tabular-nums bg-white/10 border border-white/15 rounded-full px-2.5 py-1 text-gold-300">
                        Total Target PK: {fmtNum(pkInduk)}
                      </span>
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
                      const totalPk = Number(progVal(p.id)) || 0
                      return (
                        <div key={p.id} className="px-4 py-4 bg-white">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <p className="text-sm font-bold text-slate-800">
                              <span className="mr-2 inline-block h-4 w-1 rounded-full bg-slate-300 align-middle" />
                              {p.name}
                            </p>
                            <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full tabular-nums">
                              Total: {fmtNum(totalPk)} {hasRincian && '(otomatis = jumlah diklat)'}
                            </span>
                          </div>
                          {hasRincian ? (
                            <DiklatInputList rincian={rincian} contextName={p.name} programId={p.id} />
                          ) : (
                            <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <p className="text-xs text-slate-500">Tanpa rincian — isi langsung Target PK program ini.</p>
                              <div className="w-full sm:w-44 shrink-0 flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-500 whitespace-nowrap">Target PK:</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  autoComplete="off"
                                  className="form-input !py-1.5 tabular-nums text-center font-black !rounded-xl text-slate-900 border-slate-300"
                                  placeholder="0"
                                  value={progForm[p.id] ?? String(itemsByPid.get(p.id)?.targetPeserta ?? 0)}
                                  onChange={(e) => setProgForm((f) => ({ ...f, [p.id]: e.target.value.replace(/[^0-9]/g, '') }))}
                                />
                              </div>
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
              <span className="h-10 w-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center">🎯</span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-300">Total Target PK {year}</p>
                <p className="text-base font-black text-gold-300 tabular-nums">{fmtNum(previewTotal)}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 sm:ml-auto flex-wrap">
              <button type="button" className="btn-secondary !rounded-xl !bg-white/10 !text-white !border-white/20" onClick={() => setModalOpen(false)}>Batal</button>
              <button type="submit" className="btn-secondary !rounded-xl !bg-white !text-navy-900 min-w-[130px] font-black" disabled={saving}>
                {saving ? <><Spinner /> Menyimpan...</> : 'Simpan Draf'}
              </button>
              <button type="button" className="btn-gold !rounded-xl min-w-[150px]" disabled={saving} onClick={(e) => handleSubmit(e, true)}>
                Simpan & Kirim
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Modal Import Excel Target PK */}
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title={`Import Target PK Sekaligus — ${year}`} subtitle={`${upt?.code || ''} ${upt?.name || ''} — Cukup 1 file Excel`} wide>
        <div className="space-y-5">
          {importError && <Alert type="error">{importError}</Alert>}

          {/* Stepper Import */}
          <div className="grid grid-cols-2 gap-2 text-xs font-bold">
            <div className={`p-2.5 rounded-xl border flex items-center gap-2 ${importStep === 1 ? 'border-navy-900 bg-navy-50 text-navy-900' : 'border-slate-200 bg-white text-slate-500'}`}>
              <span className="h-6 w-6 rounded-lg bg-navy-900 text-white flex items-center justify-center text-xs">1</span>
              <span>Pilih File Excel</span>
            </div>
            <div className={`p-2.5 rounded-xl border flex items-center gap-2 ${importStep === 2 ? 'border-navy-900 bg-navy-50 text-navy-900' : 'border-slate-200 bg-white text-slate-500'}`}>
              <span className="h-6 w-6 rounded-lg bg-navy-900 text-white flex items-center justify-center text-xs">2</span>
              <span>Pratinjau & Konfirmasi</span>
            </div>
          </div>

          {importStep === 1 && (
            <div className="space-y-4">
              <div className="rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center bg-slate-50/50 hover:bg-slate-50 transition-colors">
                <input type="file" accept=".xlsx,.xls" className="hidden" id="excelTargetInput" onChange={handleFileSelect} />
                <label htmlFor="excelTargetInput" className="cursor-pointer flex flex-col items-center gap-2">
                  <div className="h-14 w-14 rounded-2xl bg-navy-50 text-navy-800 flex items-center justify-center mb-1">
                    <IconFileText className="h-7 w-7" />
                  </div>
                  <p className="font-extrabold text-sm text-slate-800">Klik di sini untuk memilih file Excel Target PK</p>
                  <p className="text-xs text-slate-500">Mendukung format .xlsx atau .xls (template DASPESLUS)</p>
                  <span className="btn-secondary !rounded-xl !py-2 !px-4 mt-2">Pilih File Excel</span>
                </label>
              </div>

              <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4 text-xs text-slate-600 flex items-start gap-3">
                <span className="text-sky-600 font-black text-sm">💡</span>
                <div className="space-y-1">
                  <p className="font-bold text-slate-800">Gunakan Template Resmi agar otomatis terbaca:</p>
                  <p>Template memiliki kolom <strong>PROGRAM TUJUAN</strong>, <strong>NAMA DIKLAT</strong>, dan <strong>TARGET PK</strong>. Anda bisa langsung menetapkan target untuk semua diklat dalam 1 file.</p>
                  <button type="button" onClick={downloadTemplate} className="font-extrabold text-sky-700 underline hover:text-sky-900">
                    Unduh Template Target PK (.xlsx)
                  </button>
                </div>
              </div>
            </div>
          )}

          {importStep === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Pratinjau Data ({importParsedItems.length} baris terbaca)</h4>
                  <p className="text-xs text-slate-500">Periksa pencocokan program tujuan dan angka target sebelum disimpan.</p>
                </div>
                <button type="button" onClick={() => setImportStep(1)} className="text-xs font-bold text-slate-500 hover:text-slate-800 underline">
                  Ganti File Excel
                </button>
              </div>

              <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 text-xs">
                {importParsedItems.map((it, idx) => (
                  <div key={idx} className="p-3 bg-white hover:bg-slate-50/80 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-800 truncate">{it.name || '(Target Program Langsung)'}</p>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 font-semibold">{it.programName}</span>
                        {!it.programId && <span className="text-amber-600 font-bold">⚠️ Program tidak cocok</span>}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-black text-navy-900 bg-navy-50 border border-navy-200 rounded-lg px-2.5 py-1 tabular-nums">
                        PK: {fmtNum(it.target)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {importSkippedCount > 0 && (
                <p className="text-[11px] text-slate-400 italic">
                  * {importSkippedCount} baris kosong/header dilewati secara otomatis.
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn-secondary !rounded-xl" onClick={() => setImportOpen(false)}>Batal</button>
                <button
                  type="button"
                  className="btn-primary !rounded-xl !bg-emerald-600 hover:!bg-emerald-700 !text-white font-bold"
                  onClick={() => setImportConfirmOpen(true)}
                  disabled={!importParsedItems.length}
                >
                  <IconCheck className="h-4 w-4" /> Simpan Semua Target
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Konfirmasi Simpan Import */}
      <ConfirmDialog
        open={importConfirmOpen}
        onCancel={() => setImportConfirmOpen(false)}
        onConfirm={handleImportSubmit}
        title="Konfirmasi Simpan Target PK"
        body={`Yakin ingin menyimpan ${importParsedItems.length} baris Target PK ke sistem untuk tahun ${year}? Target yang sudah ada akan diperbarui secara otomatis.`}
        confirmLabel="Ya, Simpan Target"
        cancelLabel="Periksa Lagi"
        confirmTone="primary"
        loading={importSending}
      />

      {/* Konfirmasi Kirim ke Pimpinan */}
      <ConfirmDialog
        open={sendConfirmOpen}
        onCancel={() => setSendConfirmOpen(false)}
        onConfirm={handleSendOnly}
        title={`Kirim Target PK ${year} ke Pimpinan?`}
        body="Target PK satu kali input akan dikirim dan terkunci. Tidak dapat diedit lagi sampai ditolak atau unlock disetujui."
        confirmLabel="Ya, Kirim"
        cancelLabel="Batal"
        confirmTone="primary"
        loading={saving}
      />
    </div>
  )
}
