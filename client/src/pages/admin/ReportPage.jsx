import React, { Fragment, useCallback, useEffect, useState } from 'react'
import api, { apiError } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { StatCard, EmptyState, SkeletonRows, Alert } from '../../components/ui'
import {
  IconFileText, IconDownload, IconCheck, IconX, IconBuilding, IconChevronDown, IconSearch,
} from '../../components/icons'
import { MONTHS, yearOptions, fmtNum } from '../../utils/format'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import clsx from 'clsx'

const NAVY = [15, 23, 42]
const NAVY_SOFT = [71, 85, 105]
const GOLD = [245, 158, 11]
const MATRA_LABEL = { darat: 'Matra Darat', laut: 'Matra Laut', udara: 'Matra Udara' }
const MATRA_SHORT = { darat: 'Darat', laut: 'Laut', udara: 'Udara' }
const ALL_MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

const pct = (real, target) => {
  if (!target || target <= 0) return null
  return Math.round((real / target) * 100)
}
const pctText = (real, target) => {
  const p = pct(real, target)
  return p === null ? '-' : `${p}%`
}
const pctColor = (real, target) => {
  const p = pct(real, target)
  if (p === null) return 'text-slate-400 font-medium'
  if (p >= 100) return 'text-emerald-700 font-black'
  if (p >= 75) return 'text-gold-700 font-black'
  return 'text-rose-700 font-black'
}

function getColLetter(colIndex) {
  let letter = ''
  let idx = colIndex
  while (idx > 0) {
    const temp = (idx - 1) % 26
    letter = String.fromCharCode(65 + temp) + letter
    idx = (idx - temp - 1) / 26
  }
  return letter
}

/* ─────────────────────────────────────────────
   EKSPOR EXCEL utama (semua UPT)
───────────────────────────────────────────── */
async function exportExcel({ periodLabel, upts, missing, summary, year, month }) {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'DASPESLUS'
  wb.created = new Date()

  const navy = '0F172A'
  const gold = 'F59E0B'
  const slate50 = 'F8FAFC'
  const borderStyle = { style: 'thin', color: { argb: 'CBD5E1' } }
  const thinBorder = { top: borderStyle, left: borderStyle, bottom: borderStyle, right: borderStyle }

  const isSingleMonth = !!month
  const activeMonths = isSingleMonth ? [] : ALL_MONTHS
  const modeLabel = isSingleMonth ? `Bulan ${MONTHS[Number(month) - 1]} ${year}` : `Full 1 Tahun ${year}`

  // Tentukan lebar sheet berdasarkan mode
  const totalCols = isSingleMonth ? 16 : 2 + (ALL_MONTHS.length + 1) * 10
  const lastColLetter = getColLetter(totalCols)

  const ws = wb.addWorksheet('Rekapitulasi', { properties: { tabColor: { argb: navy } } })

  // Judul
  ws.mergeCells(`A1:${lastColLetter}1`)
  const titleCell = ws.getCell('A1')
  titleCell.value = `LAPORAN REALISASI PK — ${periodLabel.replace(/_/g, ' ')} (${modeLabel})`
  titleCell.font = { size: 12, bold: true, color: { argb: navy } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 22
  ws.mergeCells(`A2:${lastColLetter}2`)
  ws.getCell('A2').value = `BPSDMP Kementerian Perhubungan — ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}${isSingleMonth ? ` | Filter Bulan: ${MONTHS[Number(month) - 1]}` : ' | Filter: Semua Bulan'}`
  ws.getCell('A2').font = { size: 8, color: { argb: '64748B' } }
  ws.getCell('A2').alignment = { horizontal: 'center' }
  ws.getRow(2).height = 14

  // ——— Rekap singkat (tetap di atas) ———
  const rekapStartRow = 4
  const headerRow = ws.getRow(rekapStartRow)
  headerRow.values = ['No', 'Nama UPT', 'Matra', 'Target Peserta', 'Realisasi Peserta', '% Peserta', 'Target Lulusan', 'Realisasi Lulusan', '% Lulusan', 'Status']
  headerRow.height = 20
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } }
    cell.font = { color: { argb: 'FFFFFF' }, bold: true, size: 8 }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = thinBorder
  })
  // Lebar kolom rekap (hanya 10 kolom pertama, sisanya untuk detail)
  ws.getColumn(1).width = 5
  ws.getColumn(2).width = 42
  ws.getColumn(3).width = 13
  for (let c = 4; c <= 10; c++) ws.getColumn(c).width = c % 3 === 0 ? 10 : 14

  let rIdx = rekapStartRow + 1
  upts.forEach((u, i) => {
    const row = ws.getRow(rIdx++)
    row.values = [
      i + 1, u.uptName, MATRA_LABEL[u.matra] || '-',
      u.totalTargetPeserta, u.totalPeserta, pctText(u.totalPeserta, u.totalTargetPeserta),
      u.totalTargetLulusan, u.totalLulusan, pctText(u.totalLulusan, u.totalTargetLulusan),
      u.hasReported ? 'Sudah Lapor' : 'Belum Lapor',
    ]
    row.height = 16
    row.eachCell((cell, col) => {
      cell.font = { size: 8, color: { argb: col === 10 ? (u.hasReported ? '059669' : 'BE123C') : '1E293B' }, bold: col === 10 }
      cell.alignment = { horizontal: col === 2 ? 'left' : 'center', vertical: 'middle' }
      if (col === 2) cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
      cell.border = thinBorder
      if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: slate50 } }
      if (col >= 4 && col <= 9) cell.numFmt = '#,##0'
    })
  })

  const foot = ws.getRow(rIdx++)
  foot.values = ['TOTAL', '', '', summary.totalTargetPeserta, summary.totalPeserta, pctText(summary.totalPeserta, summary.totalTargetPeserta), summary.totalTargetLulusan, summary.totalLulusan, pctText(summary.totalLulusan, summary.totalTargetLulusan), '']
  foot.height = 18
  foot.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: gold } }
    cell.font = { color: { argb: navy }, bold: true, size: 8 }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = thinBorder
    if (foot.getCell(cell.col).col >= 4) foot.getCell(cell.col).numFmt = '#,##0'
  })
  rIdx += 1

  // ——— Detail per UPT (memanjang kesamping, urut ke bawah) ———
  if (isSingleMonth) {
    // Mode single month: 16 kolom (sama persis dengan detail di UI)
    for (const u of upts) {
      const secRow = rIdx
      ws.mergeCells(`A${rIdx}:${getColLetter(16)}${rIdx}`)
      const secTitle = ws.getCell(`A${rIdx}`)
      secTitle.value = `${u.uptName} (${u.uptCode}) — ${MATRA_LABEL[u.matra] || '-'} | ${modeLabel}`
      secTitle.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }
      secTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } }
      secTitle.alignment = { horizontal: 'left', vertical: 'middle' }
      secTitle.border = thinBorder
      ws.getRow(rIdx).height = 16
      rIdx++

      // Header 3 baris (identik dengan UptProgramMatrix single)
      const row6 = ['#', 'PROGRAM DIKLAT', 'PESERTA', '', '', '', '', '', '', 'LULUSAN', '', '', '', '', '', '']
      const row7 = ['', '', 'TARGET PK', '', 'REALISASI', '', '', 'CAPAIAN (%)', '', 'TARGET PK', '', 'REALISASI', '', '', 'CAPAIAN (%)', '']
      const row8 = ['', '', 'BULANAN', 'TAHUNAN', 'L', 'P', 'TOTAL', 'BULAN %', 'TAHUN %', 'BULANAN', 'TAHUNAN', 'L', 'P', 'TOTAL', 'BULAN %', 'TAHUN %']
      ws.addRow(row6); ws.addRow(row7); ws.addRow(row8)
      ws.mergeCells(`A${rIdx}:A${rIdx + 2}`); ws.mergeCells(`B${rIdx}:B${rIdx + 2}`)
      ws.mergeCells(`C${rIdx}:I${rIdx}`); ws.mergeCells(`J${rIdx}:P${rIdx}`)
      ws.mergeCells(`C${rIdx + 1}:D${rIdx + 1}`); ws.mergeCells(`E${rIdx + 1}:G${rIdx + 1}`); ws.mergeCells(`H${rIdx + 1}:I${rIdx + 1}`)
      ws.mergeCells(`J${rIdx + 1}:K${rIdx + 1}`); ws.mergeCells(`L${rIdx + 1}:N${rIdx + 1}`); ws.mergeCells(`O${rIdx + 1}:P${rIdx + 1}`)
      for (let r = rIdx; r <= rIdx + 2; r++) {
        const row = ws.getRow(r)
        row.font = { size: 7, bold: true, color: { argb: 'FFFFFFFF' } }
        row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F172A' } }
          cell.border = thinBorder
        })
        row.height = r === rIdx ? 14 : 12
      }
      rIdx += 3
      // Atur lebar kolom untuk section ini (hanya sekali, tapi tidak masalah diulang)
      ws.getColumn(1).width = 5; ws.getColumn(2).width = 32
      for (let c = 3; c <= 16; c++) ws.getColumn(c).width = c % 2 === 0 ? 11 : 9

      const startDataRow = rIdx
      const parentRowsIndices = []
      let cur = rIdx
      u.programs.forEach((p, idx) => {
        const tpBln = p.targetPeserta || 0
        const tpThn = p.targetPesertaTahunan || tpBln
        const tlBln = p.targetLulusan || 0
        const tlThn = p.targetLulusanTahunan || tlBln
        const vals = [
          idx + 1, p.isParent ? p.programName : `  - ${p.programName}`,
          tpBln, tpThn, p.pesertaL, p.pesertaP,
          { formula: `=SUM(E${cur}:F${cur})` },
          { formula: `=IF(C${cur}>0,G${cur}/C${cur},0)` },
          { formula: `=IF(D${cur}>0,G${cur}/D${cur},0)` },
          tlBln, tlThn, p.lulusanL, p.lulusanP,
          { formula: `=SUM(L${cur}:M${cur})` },
          { formula: `=IF(J${cur}>0,N${cur}/J${cur},0)` },
          { formula: `=IF(K${cur}>0,N${cur}/K${cur},0)` },
        ]
        const row = ws.addRow(vals)
        if (p.isParent) {
          parentRowsIndices.push(cur)
          row.font = { size: 7.5, bold: true, color: { argb: 'FF0F172A' } }
          row.eachCell({ includeEmpty: true }, (c) => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } })
        } else row.font = { size: 7, color: { argb: 'FF1E293B' } }
        row.eachCell({ includeEmpty: true }, (cell, col) => {
          cell.border = thinBorder
          cell.alignment = { horizontal: col <= 2 ? 'left' : 'center', vertical: 'middle' }
          if ([8, 9, 15, 16].includes(col)) cell.numFmt = '0%'
          else if (col > 2) cell.numFmt = '#,##0'
        })
        row.height = 12
        cur++
        // Rincian diklat (sinkron tampilan web)
        for (const d of p.diklatDetails || []) {
          const dRow = ws.addRow([
            '', `  • ${d.name}`,
            d.targetPeserta || 0, d.targetPeserta || 0, d.pesertaL || 0, d.pesertaP || 0,
            { formula: `=SUM(E${cur}:F${cur})` },
            { formula: `=IF(C${cur}>0,G${cur}/C${cur},0)` },
            { formula: `=IF(D${cur}>0,G${cur}/D${cur},0)` },
            d.targetLulusan || 0, d.targetLulusan || 0, d.lulusanL || 0, d.lulusanP || 0,
            { formula: `=SUM(L${cur}:M${cur})` },
            { formula: `=IF(J${cur}>0,N${cur}/J${cur},0)` },
            { formula: `=IF(K${cur}>0,N${cur}/K${cur},0)` },
          ])
          dRow.font = { size: 7, italic: true, color: { argb: 'FF334155' } }
          dRow.eachCell({ includeEmpty: true }, (cell, col) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F7FF' } }
            cell.border = thinBorder
            cell.alignment = { horizontal: col <= 2 ? 'left' : 'center', vertical: 'middle' }
            if ([8, 9, 15, 16].includes(col)) cell.numFmt = '0%'
            else if (col > 2) cell.numFmt = '#,##0'
          })
          dRow.height = 12
          cur++
        }
      })
      rIdx = cur
      const endRow = rIdx - 1
      const totVals = [
        '', 'TOTAL AKUMULASI',
        { formula: parentRowsIndices.length ? `=${parentRowsIndices.map((r) => `C${r}`).join('+')}` : `=SUM(C${startDataRow}:C${endRow})` },
        { formula: parentRowsIndices.length ? `=${parentRowsIndices.map((r) => `D${r}`).join('+')}` : `=SUM(D${startDataRow}:D${endRow})` },
        { formula: parentRowsIndices.length ? `=${parentRowsIndices.map((r) => `E${r}`).join('+')}` : `=SUM(E${startDataRow}:E${endRow})` },
        { formula: parentRowsIndices.length ? `=${parentRowsIndices.map((r) => `F${r}`).join('+')}` : `=SUM(F${startDataRow}:F${endRow})` },
        { formula: `=SUM(E${rIdx}:F${rIdx})` },
        { formula: `=IF(C${rIdx}>0,G${rIdx}/C${rIdx},0)` },
        { formula: `=IF(D${rIdx}>0,G${rIdx}/D${rIdx},0)` },
        { formula: parentRowsIndices.length ? `=${parentRowsIndices.map((r) => `J${r}`).join('+')}` : `=SUM(J${startDataRow}:J${endRow})` },
        { formula: parentRowsIndices.length ? `=${parentRowsIndices.map((r) => `K${r}`).join('+')}` : `=SUM(K${startDataRow}:K${endRow})` },
        { formula: parentRowsIndices.length ? `=${parentRowsIndices.map((r) => `L${r}`).join('+')}` : `=SUM(L${startDataRow}:L${endRow})` },
        { formula: parentRowsIndices.length ? `=${parentRowsIndices.map((r) => `M${r}`).join('+')}` : `=SUM(M${startDataRow}:M${endRow})` },
        { formula: `=SUM(L${rIdx}:M${rIdx})` },
        { formula: `=IF(J${rIdx}>0,N${rIdx}/J${rIdx},0)` },
        { formula: `=IF(K${rIdx}>0,N${rIdx}/K${rIdx},0)` },
      ]
      const tRow = ws.addRow(totVals)
      tRow.font = { bold: true, size: 7, color: { argb: 'FFFFFFFF' } }
      tRow.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F172A' } }
        cell.border = thinBorder
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        if ([8, 9, 15, 16].includes(col)) cell.numFmt = '0%'
        else if (col > 2) cell.numFmt = '#,##0'
      })
      tRow.height = 14
      rIdx++
      rIdx += 1
      ws.getRow(rIdx - 1).commit && ws.getRow(rIdx - 1).commit()
    }
  } else {
    // Mode matriks 12 bulan: memanjang kesamping per UPT, urut ke bawah
    // Atur lebar kolom global untuk matriks
    ws.getColumn(1).width = 5; ws.getColumn(2).width = 28
    for (let c = 3; c <= totalCols; c++) ws.getColumn(c).width = 8

    for (const u of upts) {
      ws.mergeCells(`A${rIdx}:${lastColLetter}${rIdx}`)
      const secTitle = ws.getCell(`A${rIdx}`)
      secTitle.value = `${u.uptName} (${u.uptCode}) — ${MATRA_LABEL[u.matra] || '-'} | Tahun ${year}`
      secTitle.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }
      secTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } }
      secTitle.alignment = { horizontal: 'left', vertical: 'middle' }
      secTitle.border = thinBorder
      ws.getRow(rIdx).height = 16
      rIdx++

      const totalBlocks = ALL_MONTHS.length + 1
      const row6Vals = ['#', 'PROGRAM DIKLAT']
      const row7Vals = ['', '']
      const row8Vals = ['', '']
      const row9Vals = ['', '']
      ALL_MONTHS.forEach((mNum) => {
        const mn = MONTHS[mNum - 1].toUpperCase()
        row6Vals.push(mn, '', '', '', '', '', '', '', '', '')
        row7Vals.push('PESERTA', '', '', '', '', 'LULUSAN', '', '', '', '')
        row8Vals.push('TARGET PK', 'REALISASI', '', '', 'CAPAIAN (%)', 'TARGET PK', 'REALISASI', '', '', 'CAPAIAN (%)')
        row9Vals.push('TARGET', 'L', 'P', 'TOTAL', '%', 'TARGET', 'L', 'P', 'TOTAL', '%')
      })
      row6Vals.push(`TOTAL 1 TAHUN ${year}`, '', '', '', '', '', '', '', '', '')
      row7Vals.push('PESERTA', '', '', '', '', 'LULUSAN', '', '', '', '')
      row8Vals.push('TARGET PK', 'REALISASI', '', '', 'CAPAIAN (%)', 'TARGET PK', 'REALISASI', '', '', 'CAPAIAN (%)')
      row9Vals.push('TARGET', 'L', 'P', 'TOTAL', '%', 'TARGET', 'L', 'P', 'TOTAL', '%')

      ws.addRow(row6Vals); ws.addRow(row7Vals); ws.addRow(row8Vals); ws.addRow(row9Vals)
      ws.mergeCells(`A${rIdx}:A${rIdx + 3}`); ws.mergeCells(`B${rIdx}:B${rIdx + 3}`)
      for (let b = 1; b <= totalBlocks; b++) {
        const sIdx = 2 + (b - 1) * 10 + 1
        const eIdx = sIdx + 9
        const c1 = getColLetter(sIdx), c10 = getColLetter(eIdx)
        ws.mergeCells(`${c1}${rIdx}:${c10}${rIdx}`)
        ws.mergeCells(`${c1}${rIdx + 1}:${getColLetter(sIdx + 4)}${rIdx + 1}`)
        ws.mergeCells(`${getColLetter(sIdx + 5)}${rIdx + 1}:${c10}${rIdx + 1}`)
        ws.mergeCells(`${getColLetter(sIdx + 1)}${rIdx + 2}:${getColLetter(sIdx + 3)}${rIdx + 2}`)
        ws.mergeCells(`${getColLetter(sIdx + 6)}${rIdx + 2}:${getColLetter(sIdx + 8)}${rIdx + 2}`)
      }
      for (let r = rIdx; r <= rIdx + 3; r++) {
        const row = ws.getRow(r)
        row.font = { size: 7, bold: true, color: { argb: 'FFFFFFFF' } }
        row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F172A' } }
          cell.border = thinBorder
        })
        row.height = r === rIdx ? 14 : 12
      }
      rIdx += 4

      const startDataRow = rIdx
      const parentRowsIndices = []
      let cur = rIdx
      u.programs.forEach((p, idx) => {
        const vals = [idx + 1, p.isParent ? p.programName : `  - ${p.programName}`]
        const pTgtCols = [], pLCols = [], pPCols = [], lTgtCols = [], lLCols = [], lPCols = []
        ALL_MONTHS.forEach((mNum, mIdx) => {
          const bm = p.byMonth?.[mNum] || { targetPeserta: 0, pesertaL: 0, pesertaP: 0, targetLulusan: 0, lulusanL: 0, lulusanP: 0 }
          const cTgtP = getColLetter(2 + mIdx * 10 + 1)
          const colL = getColLetter(2 + mIdx * 10 + 2)
          const colP = getColLetter(2 + mIdx * 10 + 3)
          const cTotP = getColLetter(2 + mIdx * 10 + 4)
          const cTgtL = getColLetter(2 + mIdx * 10 + 6)
          const colLulL = getColLetter(2 + mIdx * 10 + 7)
          const colLulP = getColLetter(2 + mIdx * 10 + 8)
          const cTotL = getColLetter(2 + mIdx * 10 + 9)
          pTgtCols.push(`${cTgtP}${cur}`); pLCols.push(`${colL}${cur}`); pPCols.push(`${colP}${cur}`)
          lTgtCols.push(`${cTgtL}${cur}`); lLCols.push(`${colLulL}${cur}`); lPCols.push(`${colLulP}${cur}`)
          vals.push(bm.targetPeserta || 0, bm.pesertaL || 0, bm.pesertaP || 0,
            { formula: `=SUM(${colL}${cur}:${colP}${cur})` },
            { formula: `=IF(${cTgtP}${cur}>0,${cTotP}${cur}/${cTgtP}${cur},0)` },
            bm.targetLulusan || 0, bm.lulusanL || 0, bm.lulusanP || 0,
            { formula: `=SUM(${colLulL}${cur}:${colLulP}${cur})` },
            { formula: `=IF(${cTgtL}${cur}>0,${cTotL}${cur}/${cTgtL}${cur},0)` })
        })
        const finalStart = 2 + ALL_MONTHS.length * 10
        const cFTgtP = getColLetter(finalStart + 1), cFPL = getColLetter(finalStart + 2), cFPP = getColLetter(finalStart + 3), cFTotP = getColLetter(finalStart + 4)
        const cFTgtL = getColLetter(finalStart + 6), cFLL = getColLetter(finalStart + 7), cFLP = getColLetter(finalStart + 8), cFTotL = getColLetter(finalStart + 9)
        vals.push(
          { formula: `=${pTgtCols.join('+')}` }, { formula: `=${pLCols.join('+')}` }, { formula: `=${pPCols.join('+')}` },
          { formula: `=SUM(${cFPL}${cur}:${cFPP}${cur})` }, { formula: `=IF(${cFTgtP}${cur}>0,${cFTotP}${cur}/${cFTgtP}${cur},0)` },
          { formula: `=${lTgtCols.join('+')}` }, { formula: `=${lLCols.join('+')}` }, { formula: `=${lPCols.join('+')}` },
          { formula: `=SUM(${cFLL}${cur}:${cFLP}${cur})` }, { formula: `=IF(${cFTgtL}${cur}>0,${cFTotL}${cur}/${cFTgtL}${cur},0)` },
        )
        const row = ws.addRow(vals)
        if (p.isParent) {
          parentRowsIndices.push(cur)
          row.font = { size: 7, bold: true, color: { argb: 'FF0F172A' } }
          row.eachCell({ includeEmpty: true }, (c) => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } })
        } else row.font = { size: 6.5, color: { argb: 'FF1E293B' } }
        row.eachCell({ includeEmpty: true }, (cell, col) => {
          cell.border = thinBorder
          cell.alignment = { horizontal: col <= 2 ? 'left' : 'center', vertical: 'middle' }
          if (col > 2) {
            const off = (col - 2) % 10
            // % columns at offset 5 and 10
            if (off === 5 || off === 0) cell.numFmt = '0%'
            else cell.numFmt = '#,##0'
          }
        })
        row.height = 11
        cur++
        // Rincian diklat (sinkron tampilan web)
        for (const d of p.diklatDetails || []) {
          const dRowVals = ['', `  • ${d.name}`]
          let dTotPL = 0, dTotPP = 0, dTotLL = 0, dTotLP = 0
          ALL_MONTHS.forEach((mNum, mIdx) => {
            const bm = d.byMonth?.[mNum] || { pesertaL: 0, pesertaP: 0, lulusanL: 0, lulusanP: 0 }
            const colL = getColLetter(2 + mIdx * 10 + 2)
            const colP = getColLetter(2 + mIdx * 10 + 3)
            const colLulL = getColLetter(2 + mIdx * 10 + 7)
            const colLulP = getColLetter(2 + mIdx * 10 + 8)
            dTotPL += bm.pesertaL || 0; dTotPP += bm.pesertaP || 0
            dTotLL += bm.lulusanL || 0; dTotLP += bm.lulusanP || 0
            dRowVals.push(
              0, bm.pesertaL || 0, bm.pesertaP || 0,
              { formula: `=SUM(${colL}${cur}:${colP}${cur})` },
              0,
              0, bm.lulusanL || 0, bm.lulusanP || 0,
              { formula: `=SUM(${colLulL}${cur}:${colLulP}${cur})` },
              0
            )
          })
          const fS = 2 + ALL_MONTHS.length * 10
          dRowVals.push(
            d.targetPeserta || 0, dTotPL, dTotPP, dTotPL + dTotPP,
            { formula: `=IF(${getColLetter(fS + 1)}${cur}>0,${getColLetter(fS + 4)}${cur}/${getColLetter(fS + 1)}${cur},0)` },
            d.targetLulusan || 0, dTotLL, dTotLP, dTotLL + dTotLP,
            { formula: `=IF(${getColLetter(fS + 6)}${cur}>0,${getColLetter(fS + 9)}${cur}/${getColLetter(fS + 6)}${cur},0)` }
          )
          const dRow = ws.addRow(dRowVals)
          dRow.font = { size: 6.5, italic: true, color: { argb: 'FF334155' } }
          dRow.eachCell({ includeEmpty: true }, (cell, col) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F7FF' } }
            cell.border = thinBorder
            cell.alignment = { horizontal: col <= 2 ? 'left' : 'center', vertical: 'middle' }
            if (col > 2) {
              const off = (col - 2) % 10
              if (off === 5 || off === 0) cell.numFmt = '0%'
              else cell.numFmt = '#,##0'
            }
          })
          dRow.height = 11
          cur++
        }
      })
      rIdx = cur
      const endDataRow = rIdx - 1
      const totalVals = ['', 'TOTAL AKUMULASI']
      const totalColsCount = 2 + totalBlocks * 10
      for (let c = 3; c <= totalColsCount; c++) {
        const colLetter = getColLetter(c)
        const off = (c - 2) % 10
        if (off === 5 || off === 0) {
          const tgtLetter = getColLetter(c - 4)
          const totLetter = getColLetter(c - 1)
          totalVals.push({ formula: `=IF(${tgtLetter}${rIdx}>0,${totLetter}${rIdx}/${tgtLetter}${rIdx},0)` })
        } else {
          if (parentRowsIndices.length) totalVals.push({ formula: `=${parentRowsIndices.map((ri) => `${colLetter}${ri}`).join('+')}` })
          else totalVals.push({ formula: `=SUM(${colLetter}${startDataRow}:${colLetter}${endDataRow})` })
        }
      }
      const tRow = ws.addRow(totalVals)
      tRow.font = { bold: true, size: 7, color: { argb: 'FFFFFFFF' } }
      tRow.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F172A' } }
        cell.border = thinBorder
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        if (col > 2) {
          const off = (col - 2) % 10
          if (off === 5 || off === 0) cell.numFmt = '0%'
          else cell.numFmt = '#,##0'
        }
      })
      tRow.height = 14
      rIdx++
      rIdx += 1
    }
  }

  if (missing.length > 0) {
    ws.mergeCells(`A${rIdx}:${getColLetter(Math.min(3, totalCols))}${rIdx}`)
    const mTitle = ws.getCell(`A${rIdx}`)
    mTitle.value = 'UPT BELUM MELAPOR'
    mTitle.font = { bold: true, size: 9, color: { argb: 'FFFFFF' } }
    mTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'BE123C' } }
    mTitle.border = thinBorder
    ws.getRow(rIdx).height = 16
    rIdx++
    const h = ws.getRow(rIdx++)
    h.values = ['No', 'Nama UPT', 'Matra']
    h.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'BE123C' } }
      cell.font = { color: { argb: 'FFFFFF' }, bold: true, size: 7 }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = thinBorder
    })
    missing.forEach((m, i) => {
      const row = ws.getRow(rIdx++)
      row.values = [i + 1, m.name, MATRA_LABEL[m.matra] || '-']
      row.height = 14
      row.eachCell((cell, col) => {
        cell.font = { size: 7, color: { argb: '1E293B' } }
        cell.alignment = { horizontal: col === 1 ? 'center' : 'left', vertical: 'middle' }
        cell.border = thinBorder
      })
    })
  }

  ws.views = [{ state: 'frozen', ySplit: rekapStartRow, xSplit: 2 }]
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `Laporan_Realisasi_${periodLabel}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(a.href)
}

/* ─────────────────────────────────────────────
   EKSPOR EXCEL per UPT (matrix 12 bulan / single month)
───────────────────────────────────────────── */
async function exportUptExcel(upt, { periodLabel, year, month }) {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet(`Laporan_${year}`)
  worksheet.views = [{ showGridLines: true }]

  const title1 = worksheet.addRow(['KEMENTERIAN PERHUBUNGAN'])
  const title2 = worksheet.addRow(['BADAN PENGEMBANGAN SUMBER DAYA MANUSIA PERHUBUNGAN'])
  const modeLabel = month ? `Bulan ${MONTHS[month - 1]} ${year}` : `Full 1 Tahun ${year}`
  const title3 = worksheet.addRow([`LAPORAN REALISASI PK & CAPAIAN TARGET (${modeLabel.toUpperCase()})`])
  const title4 = worksheet.addRow([`Nama UPT: ${upt.uptName} (${upt.uptCode}) | Tahun: ${year}`])
  worksheet.addRow([])

  title1.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF0F172A' } }
  title2.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } }
  title3.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF0F172A' } }
  title4.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF475569' } }

  if (month) {
    // Single Month - 16 kolom
    const row6 = ['#', 'PROGRAM DIKLAT', 'PESERTA', '', '', '', '', '', '', 'LULUSAN', '', '', '', '', '', '']
    const row7 = ['', '', 'TARGET PK', '', 'REALISASI', '', '', 'CAPAIAN (%)', '', 'TARGET PK', '', 'REALISASI', '', '', 'CAPAIAN (%)', '']
    const row8 = ['', '', 'BULANAN', 'TAHUNAN', 'L', 'P', 'TOTAL', 'BULAN %', 'TAHUN %', 'BULANAN', 'TAHUNAN', 'L', 'P', 'TOTAL', 'BULAN %', 'TAHUN %']

    worksheet.addRow(row6)
    worksheet.addRow(row7)
    worksheet.addRow(row8)
    worksheet.mergeCells('A6:A8')
    worksheet.mergeCells('B6:B8')
    worksheet.mergeCells('C6:I6')
    worksheet.mergeCells('J6:P6')
    worksheet.mergeCells('C7:D7')
    worksheet.mergeCells('E7:G7')
    worksheet.mergeCells('H7:I7')
    worksheet.mergeCells('J7:K7')
    worksheet.mergeCells('L7:N7')
    worksheet.mergeCells('O7:P7')

    for (let r = 6; r <= 8; r++) {
      const row = worksheet.getRow(r)
      row.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
      row.alignment = { horizontal: 'center', vertical: 'middle' }
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF94A3B8' } },
          bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
          left: { style: 'thin', color: { argb: 'FF94A3B8' } },
          right: { style: 'thin', color: { argb: 'FF94A3B8' } },
        }
      })
    }

    let currentRow = 9
    upt.programs.forEach((p, idx) => {
      const tpBln = p.targetPeserta || 0
      const tpThn = p.targetPesertaTahunan || tpBln
      const tlBln = p.targetLulusan || 0
      const tlThn = p.targetLulusanTahunan || tlBln

      const rowValues = [
        idx + 1, p.programName,
        tpBln, tpThn, p.pesertaL, p.pesertaP,
        { formula: `=SUM(E${currentRow}:F${currentRow})` },
        { formula: `=IF(C${currentRow}>0, G${currentRow}/C${currentRow}, 0)` },
        { formula: `=IF(D${currentRow}>0, G${currentRow}/D${currentRow}, 0)` },
        tlBln, tlThn, p.lulusanL, p.lulusanP,
        { formula: `=SUM(L${currentRow}:M${currentRow})` },
        { formula: `=IF(J${currentRow}>0, N${currentRow}/J${currentRow}, 0)` },
        { formula: `=IF(K${currentRow}>0, N${currentRow}/K${currentRow}, 0)` },
      ]

      const row = worksheet.addRow(rowValues)
      if (p.isParent) {
        row.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF0F172A' } }
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
        })
      } else {
        row.font = { name: 'Calibri', size: 9, color: { argb: 'FF1E293B' } }
      }
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        }
        cell.alignment = { horizontal: colNumber <= 2 ? 'left' : 'center', vertical: 'middle' }
        if ([8, 9, 15, 16].includes(colNumber)) cell.numFmt = '0%'
        else if (colNumber > 2) cell.numFmt = '#,##0'
      })
      currentRow++
      // Rincian diklat (sinkron tampilan web)
      for (const d of p.diklatDetails || []) {
        const dRow = worksheet.addRow([
          '', `  • ${d.name}`,
          d.targetPeserta || 0, d.targetPeserta || 0, d.pesertaL || 0, d.pesertaP || 0,
          { formula: `=SUM(E${currentRow}:F${currentRow})` },
          { formula: `=IF(C${currentRow}>0,G${currentRow}/C${currentRow},0)` },
          { formula: `=IF(D${currentRow}>0,G${currentRow}/D${currentRow},0)` },
          d.targetLulusan || 0, d.targetLulusan || 0, d.lulusanL || 0, d.lulusanP || 0,
          { formula: `=SUM(L${currentRow}:M${currentRow})` },
          { formula: `=IF(J${currentRow}>0,N${currentRow}/J${currentRow},0)` },
          { formula: `=IF(K${currentRow}>0,N${currentRow}/K${currentRow},0)` },
        ])
        dRow.font = { size: 7, italic: true, color: { argb: 'FF334155' } }
        dRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F7FF' } }
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          }
          cell.alignment = { horizontal: colNumber <= 2 ? 'left' : 'center', vertical: 'middle' }
          if ([8, 9, 15, 16].includes(colNumber)) cell.numFmt = '0%'
          else if (colNumber > 2) cell.numFmt = '#,##0'
        })
        currentRow++
      }
    })

    worksheet.getColumn(1).width = 5
    worksheet.getColumn(2).width = 38
    for (let c = 3; c <= 16; c++) worksheet.getColumn(c).width = 11
  } else {
    // Matrix Mode - 12 bulan
    const activeMonths = ALL_MONTHS
    const totalBlocks = activeMonths.length + 1
    const row6Values = ['#', 'PROGRAM DIKLAT']
    const row7Values = ['', '']
    const row8Values = ['', '']
    const row9Values = ['', '']

    activeMonths.forEach((mNum) => {
      const monthName = MONTHS[mNum - 1].toUpperCase()
      row6Values.push(monthName, '', '', '', '', '', '', '', '', '')
      row7Values.push('PESERTA', '', '', '', '', 'LULUSAN', '', '', '', '')
      row8Values.push('TARGET PK', 'REALISASI', '', '', 'CAPAIAN (%)', 'TARGET PK', 'REALISASI', '', '', 'CAPAIAN (%)')
      row9Values.push('TARGET', 'L', 'P', 'TOTAL', '%', 'TARGET', 'L', 'P', 'TOTAL', '%')
    })

    row6Values.push(`TOTAL 1 TAHUN ${year}`, '', '', '', '', '', '', '', '', '')
    row7Values.push('PESERTA', '', '', '', '', 'LULUSAN', '', '', '', '')
    row8Values.push('TARGET PK', 'REALISASI', '', '', 'CAPAIAN (%)', 'TARGET PK', 'REALISASI', '', '', 'CAPAIAN (%)')
    row9Values.push('TARGET', 'L', 'P', 'TOTAL', '%', 'TARGET', 'L', 'P', 'TOTAL', '%')

    worksheet.addRow(row6Values)
    worksheet.addRow(row7Values)
    worksheet.addRow(row8Values)
    worksheet.addRow(row9Values)
    worksheet.mergeCells('A6:A9')
    worksheet.mergeCells('B6:B9')

    for (let b = 1; b <= totalBlocks; b++) {
      const startColIdx = 2 + (b - 1) * 10 + 1
      const endColIdx = startColIdx + 9
      const c1 = getColLetter(startColIdx)
      const c10 = getColLetter(endColIdx)
      worksheet.mergeCells(`${c1}6:${c10}6`)
      const c5 = getColLetter(startColIdx + 4)
      const c6 = getColLetter(startColIdx + 5)
      worksheet.mergeCells(`${c1}7:${c5}7`)
      worksheet.mergeCells(`${c6}7:${c10}7`)
      const c2 = getColLetter(startColIdx + 1)
      const c4 = getColLetter(startColIdx + 3)
      const c7 = getColLetter(startColIdx + 6)
      const c9 = getColLetter(startColIdx + 8)
      worksheet.mergeCells(`${c2}8:${c4}8`)
      worksheet.mergeCells(`${c7}8:${c9}8`)
    }

    for (let r = 6; r <= 9; r++) {
      const row = worksheet.getRow(r)
      row.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
      row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF94A3B8' } },
          bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
          left: { style: 'thin', color: { argb: 'FF94A3B8' } },
          right: { style: 'thin', color: { argb: 'FF94A3B8' } },
        }
      })
    }

    const startDataRow = 10
    let currentRow = startDataRow
    const parentRowsIndices = []

    upt.programs.forEach((p, idx) => {
      const rowValues = [idx + 1, p.programName]
      const pTgtCols = []
      const pLCols = []
      const pPCols = []
      const lTgtCols = []
      const lLCols = []
      const lPCols = []

      activeMonths.forEach((mNum, mIdx) => {
        const bm = p.byMonth?.[mNum] || { targetPeserta: 0, pesertaL: 0, pesertaP: 0, targetLulusan: 0, lulusanL: 0, lulusanP: 0 }
        const cTgtP = getColLetter(2 + mIdx * 10 + 1)
        const colL = getColLetter(2 + mIdx * 10 + 2)
        const colP = getColLetter(2 + mIdx * 10 + 3)
        const cTotP = getColLetter(2 + mIdx * 10 + 4)
        const cTgtL = getColLetter(2 + mIdx * 10 + 6)
        const colLulL = getColLetter(2 + mIdx * 10 + 7)
        const colLulP = getColLetter(2 + mIdx * 10 + 8)
        const cTotL = getColLetter(2 + mIdx * 10 + 9)

        pTgtCols.push(`${cTgtP}${currentRow}`)
        pLCols.push(`${colL}${currentRow}`)
        pPCols.push(`${colP}${currentRow}`)
        lTgtCols.push(`${cTgtL}${currentRow}`)
        lLCols.push(`${colLulL}${currentRow}`)
        lPCols.push(`${colLulP}${currentRow}`)

        rowValues.push(bm.targetPeserta || 0)
        rowValues.push(bm.pesertaL || 0)
        rowValues.push(bm.pesertaP || 0)
        rowValues.push({ formula: `=SUM(${colL}${currentRow}:${colP}${currentRow})` })
        rowValues.push({ formula: `=IF(${cTgtP}${currentRow}>0, ${cTotP}${currentRow}/${cTgtP}${currentRow}, 0)` })
        rowValues.push(bm.targetLulusan || 0)
        rowValues.push(bm.lulusanL || 0)
        rowValues.push(bm.lulusanP || 0)
        rowValues.push({ formula: `=SUM(${colLulL}${currentRow}:${colLulP}${currentRow})` })
        rowValues.push({ formula: `=IF(${cTgtL}${currentRow}>0, ${cTotL}${currentRow}/${cTgtL}${currentRow}, 0)` })
      })

      const finalStartIdx = 2 + activeMonths.length * 10
      const cFinalTgtP = getColLetter(finalStartIdx + 1)
      const cFinalPL = getColLetter(finalStartIdx + 2)
      const cFinalPP = getColLetter(finalStartIdx + 3)
      const cFinalTotP = getColLetter(finalStartIdx + 4)
      const cFinalTgtL = getColLetter(finalStartIdx + 6)
      const cFinalLL = getColLetter(finalStartIdx + 7)
      const cFinalLP = getColLetter(finalStartIdx + 8)
      const cFinalTotL = getColLetter(finalStartIdx + 9)

      // Target single-input = angka tetap tahunan (jangan jumlah 12 bulan)
      rowValues.push(p.isSingle ? (p.targetPesertaTahunan || p.targetPeserta || 0) : { formula: `=${pTgtCols.join('+')}` })
      rowValues.push({ formula: `=${pLCols.join('+')}` })
      rowValues.push({ formula: `=${pPCols.join('+')}` })
      rowValues.push({ formula: `=SUM(${cFinalPL}${currentRow}:${cFinalPP}${currentRow})` })
      rowValues.push({ formula: `=IF(${cFinalTgtP}${currentRow}>0, ${cFinalTotP}${currentRow}/${cFinalTgtP}${currentRow}, 0)` })
      rowValues.push(p.isSingle ? (p.targetLulusanTahunan || p.targetLulusan || 0) : { formula: `=${lTgtCols.join('+')}` })
      rowValues.push({ formula: `=${lLCols.join('+')}` })
      rowValues.push({ formula: `=${lPCols.join('+')}` })
      rowValues.push({ formula: `=SUM(${cFinalLL}${currentRow}:${cFinalLP}${currentRow})` })
      rowValues.push({ formula: `=IF(${cFinalTgtL}${currentRow}>0, ${cFinalTotL}${currentRow}/${cFinalTgtL}${currentRow}, 0)` })

      const row = worksheet.addRow(rowValues)
      if (p.isParent) {
        parentRowsIndices.push(currentRow)
        row.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF0F172A' } }
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
        })
      } else {
        row.font = { name: 'Calibri', size: 9, color: { argb: 'FF1E293B' } }
      }

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        }
        cell.alignment = { horizontal: colNumber <= 2 ? 'left' : 'center', vertical: 'middle' }
        if (colNumber > 2) {
          const offset = (colNumber - 2) % 5
          if (offset === 0) cell.numFmt = '0%'
          else cell.numFmt = '#,##0'
        }
      })
      currentRow++
      // Rincian diklat (sinkron tampilan web)
      for (const d of p.diklatDetails || []) {
        const dRowVals = ['', `  • ${d.name}`]
        let dTotPL = 0, dTotPP = 0, dTotLL = 0, dTotLP = 0
        activeMonths.forEach((mNum, mIdx) => {
          const bm = d.byMonth?.[mNum] || { pesertaL: 0, pesertaP: 0, lulusanL: 0, lulusanP: 0 }
          const colL = getColLetter(2 + mIdx * 10 + 2)
          const colP = getColLetter(2 + mIdx * 10 + 3)
          const colLulL = getColLetter(2 + mIdx * 10 + 7)
          const colLulP = getColLetter(2 + mIdx * 10 + 8)
          dTotPL += bm.pesertaL || 0; dTotPP += bm.pesertaP || 0
          dTotLL += bm.lulusanL || 0; dTotLP += bm.lulusanP || 0
          dRowVals.push(
            0, bm.pesertaL || 0, bm.pesertaP || 0,
            { formula: `=SUM(${colL}${currentRow}:${colP}${currentRow})` },
            0,
            0, bm.lulusanL || 0, bm.lulusanP || 0,
            { formula: `=SUM(${colLulL}${currentRow}:${colLulP}${currentRow})` },
            0
          )
        })
        const fS = 2 + activeMonths.length * 10
        dRowVals.push(
          d.targetPeserta || 0, dTotPL, dTotPP, dTotPL + dTotPP,
          { formula: `=IF(${getColLetter(fS + 1)}${currentRow}>0,${getColLetter(fS + 4)}${currentRow}/${getColLetter(fS + 1)}${currentRow},0)` },
          d.targetLulusan || 0, dTotLL, dTotLP, dTotLL + dTotLP,
          { formula: `=IF(${getColLetter(fS + 6)}${currentRow}>0,${getColLetter(fS + 9)}${currentRow}/${getColLetter(fS + 6)}${currentRow},0)` }
        )
        const dRow = worksheet.addRow(dRowVals)
        dRow.font = { size: 7, italic: true, color: { argb: 'FF334155' } }
        dRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F7FF' } }
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          }
          cell.alignment = { horizontal: colNumber <= 2 ? 'left' : 'center', vertical: 'middle' }
          if (colNumber > 2) {
            const offset = (colNumber - 2) % 5
            if (offset === 0) cell.numFmt = '0%'
            else cell.numFmt = '#,##0'
          }
        })
        currentRow++
      }
    })

    const endDataRow = currentRow - 1
    const totalRowValues = ['', 'TOTAL AKUMULASI']
    const totalColsCount = 2 + totalBlocks * 10

    for (let c = 3; c <= totalColsCount; c++) {
      const colLetter = getColLetter(c)
      const offset = (c - 2) % 5
      if (offset === 0) {
        const tgtColLetter = getColLetter(c - 4)
        const totColLetter = getColLetter(c - 1)
        totalRowValues.push({ formula: `=IF(${tgtColLetter}${currentRow}>0, ${totColLetter}${currentRow}/${tgtColLetter}${currentRow}, 0)` })
      } else {
        if (parentRowsIndices.length > 0) {
          totalRowValues.push({ formula: `=${parentRowsIndices.map((rIdx) => `${colLetter}${rIdx}`).join('+')}` })
        } else {
          totalRowValues.push({ formula: `=SUM(${colLetter}${startDataRow}:${colLetter}${endDataRow})` })
        }
      }
    }

    const totalRow = worksheet.addRow(totalRowValues)
    totalRow.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
      cell.border = {
        top: { style: 'double', color: { argb: 'FFFFFFFF' } },
        bottom: { style: 'double', color: { argb: 'FFFFFFFF' } },
        left: { style: 'thin', color: { argb: 'FF475569' } },
        right: { style: 'thin', color: { argb: 'FF475569' } },
      }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      if (colNumber > 2) {
        const offset = (colNumber - 2) % 5
        if (offset === 0) cell.numFmt = '0%'
        else cell.numFmt = '#,##0'
      }
    })

    worksheet.getColumn(1).width = 5
    worksheet.getColumn(2).width = 38
    for (let c = 3; c <= totalColsCount; c++) worksheet.getColumn(c).width = 11
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `Laporan_${upt.uptCode}_${periodLabel}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(a.href)
}

/* ─────────────────────────────────────────────
   EKSPOR PDF per UPT (kop surat, tabel detail)
───────────────────────────────────────────── */
function drawUptPdf(doc, upt, { periodLabel, year, pageW, margin }) {
  doc.addPage()
  let y = 60

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...NAVY)
  doc.text('KEMENTERIAN PERHUBUNGAN', pageW / 2, y, { align: 'center' })
  y += 16
  doc.setFontSize(10)
  doc.text('BADAN PENGEMBANGAN SUMBER DAYA MANUSIA PERHUBUNGAN', pageW / 2, y, { align: 'center' })
  y += 22
  doc.setFontSize(13)
  doc.text('LAPORAN REALISASI PK', pageW / 2, y, { align: 'center' })

  y += 22
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...NAVY_SOFT)
  const labelW = 62
  const colonX = margin + labelW
  const valueX = colonX + 8
  doc.text('Nama UPT', margin, y)
  doc.text(':', colonX, y)
  doc.text(upt.uptName, valueX, y)
  y += 14
  doc.text('Matra', margin, y)
  doc.text(':', colonX, y)
  doc.text(MATRA_LABEL[upt.matra] || '-', valueX, y)
  y += 14
  doc.text('Periode', margin, y)
  doc.text(':', colonX, y)
  doc.text(`${periodLabel.replace(/_/g, ' ')}  (Tahun ${year})`, valueX, y)
  y += 8

  const body = upt.programs.flatMap((p, i) => {
    const rows = [[
      { content: String(i + 1), styles: { halign: 'center' } },
      { content: p.isParent ? p.programName : `   - ${p.programName}`, styles: { halign: 'left', fontStyle: p.isParent ? 'bold' : 'normal' } },
      { content: fmtNum(p.targetPeserta), styles: { halign: 'center' } },
      { content: fmtNum(p.pesertaL), styles: { halign: 'center' } },
      { content: fmtNum(p.pesertaP), styles: { halign: 'center' } },
      { content: fmtNum(p.pesertaL + p.pesertaP), styles: { halign: 'center', fontStyle: 'bold' } },
      { content: pctText(p.pesertaL + p.pesertaP, p.targetPeserta), styles: { halign: 'center', fontStyle: 'bold' } },
      { content: fmtNum(p.targetLulusan), styles: { halign: 'center' } },
      { content: fmtNum(p.lulusanL), styles: { halign: 'center' } },
      { content: fmtNum(p.lulusanP), styles: { halign: 'center' } },
      { content: fmtNum(p.lulusanL + p.lulusanP), styles: { halign: 'center', fontStyle: 'bold' } },
      { content: pctText(p.lulusanL + p.lulusanP, p.targetLulusan), styles: { halign: 'center', fontStyle: 'bold' } },
    ]]
    for (const d of p.diklatDetails || []) {
      const dpTot = (d.pesertaL || 0) + (d.pesertaP || 0)
      const dlTot = (d.lulusanL || 0) + (d.lulusanP || 0)
      rows.push([
        { content: '', styles: { halign: 'center' } },
        { content: `      • ${d.name}`, styles: { halign: 'left' } },
        { content: fmtNum(d.targetPeserta), styles: { halign: 'center' } },
        { content: fmtNum(d.pesertaL), styles: { halign: 'center' } },
        { content: fmtNum(d.pesertaP), styles: { halign: 'center' } },
        { content: fmtNum(dpTot), styles: { halign: 'center', fontStyle: 'bold' } },
        { content: pctText(dpTot, d.targetPeserta), styles: { halign: 'center', fontStyle: 'bold' } },
        { content: fmtNum(d.targetLulusan), styles: { halign: 'center' } },
        { content: fmtNum(d.lulusanL), styles: { halign: 'center' } },
        { content: fmtNum(d.lulusanP), styles: { halign: 'center' } },
        { content: fmtNum(dlTot), styles: { halign: 'center', fontStyle: 'bold' } },
        { content: pctText(dlTot, d.targetLulusan), styles: { halign: 'center', fontStyle: 'bold' } },
      ])
    }
    return rows
  })

  const parentRows = upt.programs.filter((p) => p.isParent)
  const sumL = parentRows.reduce((s, p) => s + p.pesertaL, 0)
  const sumP = parentRows.reduce((s, p) => s + p.pesertaP, 0)
  const sumLL = parentRows.reduce((s, p) => s + p.lulusanL, 0)
  const sumLP = parentRows.reduce((s, p) => s + p.lulusanP, 0)
  const sumTgP = parentRows.reduce((s, p) => s + p.targetPeserta, 0)
  const sumTgL = parentRows.reduce((s, p) => s + p.targetLulusan, 0)

  autoTable(doc, {
    startY: y + 8,
    margin: { left: margin, right: margin, bottom: 90 },
    head: [[
      { content: 'NO', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
      { content: 'PROGRAM', rowSpan: 2, styles: { halign: 'left', valign: 'middle' } },
      { content: 'PESERTA', colSpan: 5, styles: { halign: 'center' } },
      { content: 'LULUSAN', colSpan: 5, styles: { halign: 'center' } },
    ], [
      { content: 'TARGET PK', styles: { halign: 'center' } },
      { content: 'L', styles: { halign: 'center' } },
      { content: 'P', styles: { halign: 'center' } },
      { content: 'TOTAL', styles: { halign: 'center' } },
      { content: '%', styles: { halign: 'center' } },
      { content: 'TARGET PK', styles: { halign: 'center' } },
      { content: 'L', styles: { halign: 'center' } },
      { content: 'P', styles: { halign: 'center' } },
      { content: 'TOTAL', styles: { halign: 'center' } },
      { content: '%', styles: { halign: 'center' } },
    ]],
    body,
    foot: [[
      { content: 'TOTAL', colSpan: 2, styles: { halign: 'center', fontStyle: 'bold', fillColor: [248, 250, 252], textColor: NAVY } },
      { content: fmtNum(sumTgP), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
      { content: fmtNum(sumL), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
      { content: fmtNum(sumP), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
      { content: fmtNum(sumL + sumP), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
      { content: pctText(sumL + sumP, sumTgP), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
      { content: fmtNum(sumTgL), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
      { content: fmtNum(sumLL), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
      { content: fmtNum(sumLP), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
      { content: fmtNum(sumLL + sumLP), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
      { content: pctText(sumLL + sumLP, sumTgL), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
    ]],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 4.5, lineColor: [203, 213, 225], lineWidth: 0.5, textColor: NAVY, valign: 'middle' },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  })
}

/** Export PDF utama: rekap semua UPT + detail per UPT + daftar belum lapor. */
function exportPdf({ periodLabel, year, upts, missing, summary }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 40

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...NAVY)
  doc.text('KEMENTERIAN PERHUBUNGAN', pageW / 2, 56, { align: 'center' })
  doc.setFontSize(10)
  doc.text('BADAN PENGEMBANGAN SUMBER DAYA MANUSIA PERHUBUNGAN', pageW / 2, 72, { align: 'center' })
  doc.setFontSize(13)
  doc.text('LAPORAN REALISASI PK — REKAPITULASI', pageW / 2, 96, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...NAVY_SOFT)
  doc.text(`Periode: ${periodLabel.replace(/_/g, ' ')}  |  Tahun ${year}`, pageW / 2, 112, { align: 'center' })

  autoTable(doc, {
    startY: 128,
    margin: { left: margin, right: margin, bottom: 60 },
    head: [[
      { content: 'No', styles: { halign: 'center' } },
      { content: 'Kode UPT', styles: { halign: 'left' } },
      { content: 'Nama UPT', styles: { halign: 'left' } },
      { content: 'Matra', styles: { halign: 'center' } },
      { content: 'Target Peserta', styles: { halign: 'center' } },
      { content: 'Realisasi Peserta', styles: { halign: 'center' } },
      { content: '%', styles: { halign: 'center' } },
      { content: 'Target Lulusan', styles: { halign: 'center' } },
      { content: 'Realisasi Lulusan', styles: { halign: 'center' } },
      { content: '%', styles: { halign: 'center' } },
      { content: 'Status', styles: { halign: 'center' } },
    ]],
    body: upts.map((u, i) => [
      { content: String(i + 1), styles: { halign: 'center' } },
      { content: u.uptCode, styles: { halign: 'left', fontStyle: 'bold' } },
      { content: u.uptName, styles: { halign: 'left' } },
      { content: MATRA_LABEL[u.matra] || '-', styles: { halign: 'center' } },
      { content: fmtNum(u.totalTargetPeserta), styles: { halign: 'center' } },
      { content: fmtNum(u.totalPeserta), styles: { halign: 'center' } },
      { content: pctText(u.totalPeserta, u.totalTargetPeserta), styles: { halign: 'center', fontStyle: 'bold' } },
      { content: fmtNum(u.totalTargetLulusan), styles: { halign: 'center' } },
      { content: fmtNum(u.totalLulusan), styles: { halign: 'center' } },
      { content: pctText(u.totalLulusan, u.totalTargetLulusan), styles: { halign: 'center', fontStyle: 'bold' } },
      { content: u.hasReported ? 'Sudah Lapor' : 'Belum Lapor', styles: { halign: 'center', fontStyle: 'bold', textColor: u.hasReported ? [5, 122, 85] : [190, 24, 60] } },
    ]),
    foot: [[
      { content: 'TOTAL', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold', fillColor: [248, 250, 252], textColor: NAVY } },
      { content: fmtNum(summary.totalTargetPeserta), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
      { content: fmtNum(summary.totalPeserta), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
      { content: pctText(summary.totalPeserta, summary.totalTargetPeserta), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
      { content: fmtNum(summary.totalTargetLulusan), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
      { content: fmtNum(summary.totalLulusan), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
      { content: pctText(summary.totalLulusan, summary.totalTargetLulusan), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
      { content: '', styles: { fillColor: GOLD } },
    ]],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 5, lineColor: [226, 232, 240], lineWidth: 0.5, textColor: NAVY },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  })

  for (const u of upts) {
    drawUptPdf(doc, u, { periodLabel, year, pageW: doc.internal.pageSize.getWidth(), margin: 46 })
  }

  doc.addPage()
  let my = 70
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...NAVY)
  doc.text('UPT BELUM MELAPOR', margin, my)
  my += 10
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  if (!missing.length) {
    doc.setTextColor(...NAVY_SOFT)
    doc.text('- Tidak ada UPT yang belum melapor pada periode ini.', margin, my + 8)
  } else {
    autoTable(doc, {
      startY: my + 8,
      margin: { left: margin, right: margin, bottom: 60 },
      head: [[
        { content: 'No', styles: { halign: 'center' } },
        { content: 'Nama UPT', styles: { halign: 'left' } },
        { content: 'Matra', styles: { halign: 'center' } },
      ]],
      body: missing.map((m, i) => [
        { content: String(i + 1), styles: { halign: 'center' } },
        { content: m.name, styles: { halign: 'left' } },
        { content: MATRA_LABEL[m.matra] || '-', styles: { halign: 'center' } },
      ]),
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 5, textColor: NAVY, lineColor: [226, 232, 240], lineWidth: 0.5 },
      headStyles: { fillColor: [190, 24, 60], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [255, 245, 247] },
    })
  }

  const a = document.createElement('a')
  a.href = doc.output('bloburl')
  a.download = `Laporan_Realisasi_${periodLabel}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** Export PDF untuk satu UPT saja. */
function exportSingleUptPdf(upt, { periodLabel, year }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' })
  drawUptPdf(doc, upt, { periodLabel, year, pageW: doc.internal.pageSize.getWidth(), margin: 46 })
  const a = document.createElement('a')
  a.href = doc.output('bloburl')
  a.download = `Laporan_${upt.uptCode}_${periodLabel}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/* ─────────────────────────────────────────────
   TABEL MATRIKS PROGRAM UPT (12 bulan menyamping / single month)
───────────────────────────────────────────── */
function UptProgramMatrix({ u, month, periodLabel, year }) {
  const [exportingExcel, setExportingExcel] = React.useState(false)
  const scrollRef = React.useRef(null)
  // Lebar 1 blok bulan = 8 kolom @58px + 2 kolom % @64px = 592
  const BLOCK_W = 592
  const scrollToBlock = (blockIdx) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: Math.max(0, blockIdx * BLOCK_W), behavior: 'smooth' })
  }
  const scrollByPage = (dir) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  const handleExportUptExcel = async (e) => {
    e.stopPropagation()
    setExportingExcel(true)
    try {
      await exportUptExcel(u, { periodLabel, year, month: month ? Number(month) : null })
    } catch (err) {
      console.error(err)
    } finally {
      setExportingExcel(false)
    }
  }

  const isSingleMonth = !!month

  /* ── Single Month: 16 kolom ── */
  if (isSingleMonth) {
    const parents = u.programs.filter((p) => p.isParent)
    const sumPesL = parents.reduce((s, p) => s + p.pesertaL, 0)
    const sumPesP = parents.reduce((s, p) => s + p.pesertaP, 0)
    const sumLulL = parents.reduce((s, p) => s + p.lulusanL, 0)
    const sumLulP = parents.reduce((s, p) => s + p.lulusanP, 0)

    return (
      <div className="rounded-xl border border-slate-300 bg-white overflow-hidden shadow-sm">
        {/* Header bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-navy-950 text-white">
          <p className="text-xs font-extrabold flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0 flex-1 leading-snug">
            <span className="text-gold-300 shrink-0">▶</span>
            <span className="whitespace-nowrap">Detail Realisasi — <span className="text-gold-200">{u.uptCode}</span></span><span className="min-w-0 break-words">· {u.uptName}</span>
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              className="rounded-md bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1.5 text-[10px] font-extrabold text-white flex items-center gap-1"
              onClick={handleExportUptExcel}
              disabled={exportingExcel}
            >
              <IconFileText className="h-3.5 w-3.5" />
              {exportingExcel ? '...' : 'Excel'}
            </button>
            <button
              type="button"
              className="rounded-md bg-gold-500 hover:bg-gold-400 px-2.5 py-1.5 text-[10px] font-extrabold text-navy-900 flex items-center gap-1"
              onClick={(e) => { e.stopPropagation(); exportSingleUptPdf(u, { periodLabel, year }) }}
            >
              <IconDownload className="h-3.5 w-3.5" /> PDF UPT Ini
            </button>
          </div>
        </div>
        {/* Tabel single month: 16 kolom */}
        <div className="w-full overflow-x-auto matrix-scroll">
          <table className="border-collapse border border-slate-300 text-slate-800 font-sans matrix-table" style={{ width: '100%', minWidth: 940 }}>
            <colgroup>
              <col style={{ width: '2.5%' }} />
              <col style={{ width: '21.5%' }} />
              <col style={{ width: '5.5%' }} />
              <col style={{ width: '5.5%' }} />
              <col style={{ width: '4%' }} />
              <col style={{ width: '4%' }} />
              <col style={{ width: '5%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '5.5%' }} />
              <col style={{ width: '5.5%' }} />
              <col style={{ width: '4%' }} />
              <col style={{ width: '4%' }} />
              <col style={{ width: '5%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '7%' }} />
            </colgroup>
            <thead>
              <tr className="bg-navy-950 text-white font-black uppercase text-[10px]">
                <th rowSpan={3} className="text-center border border-slate-400 px-1 py-2 w-7">#</th>
                <th rowSpan={3} className="text-left border border-slate-400 px-2 py-2">PROGRAM DIKLAT</th>
                <th colSpan={7} className="text-center border border-slate-400 border-r-2 border-r-slate-500 bg-navy-900 py-1.5 text-white">PESERTA</th>
                <th colSpan={7} className="text-center border border-slate-400 bg-navy-950 py-1.5 text-white">LULUSAN</th>
              </tr>
              <tr className="bg-navy-900 text-white font-extrabold text-[10px]">
                <th colSpan={2} className="text-center border border-slate-400 text-gold-300 py-1">TARGET PK</th>
                <th colSpan={3} className="text-center border border-slate-400 py-1">REALISASI</th>
                <th colSpan={2} className="text-center border border-slate-400 border-r-2 border-r-slate-500 text-emerald-300 py-1">CAPAIAN (%)</th>
                <th colSpan={2} className="text-center border border-slate-400 text-gold-300 bg-navy-950 py-1">TARGET PK</th>
                <th colSpan={3} className="text-center border border-slate-400 bg-navy-950 py-1">REALISASI</th>
                <th colSpan={2} className="text-center border border-slate-400 text-emerald-300 bg-navy-950 py-1">CAPAIAN (%)</th>
              </tr>
              <tr className="bg-slate-800 text-slate-100 font-bold text-[9.5px]">
                <th className="text-center border border-slate-400 text-gold-200 py-1">BULANAN</th>
                <th className="text-center border border-slate-400 text-gold-200 py-1">TAHUNAN</th>
                <th className="text-center border border-slate-400 py-1">L</th>
                <th className="text-center border border-slate-400 py-1">P</th>
                <th className="text-center border border-slate-400 py-1">TOTAL</th>
                <th className="text-center border border-slate-400 text-emerald-200 py-1">BULAN %</th>
                <th className="text-center border border-slate-400 border-r-2 border-r-slate-500 text-emerald-200 py-1">TAHUN %</th>
                <th className="text-center border border-slate-400 text-gold-200 py-1">BULANAN</th>
                <th className="text-center border border-slate-400 text-gold-200 py-1">TAHUNAN</th>
                <th className="text-center border border-slate-400 py-1">L</th>
                <th className="text-center border border-slate-400 py-1">P</th>
                <th className="text-center border border-slate-400 py-1">TOTAL</th>
                <th className="text-center border border-slate-400 text-emerald-200 py-1">BULAN %</th>
                <th className="text-center border border-slate-400 text-emerald-200 py-1">TAHUN %</th>
              </tr>
            </thead>
            <tbody>
              {u.programs.map((p, i) => {
                const isParentRow = p.isParent
                const tpBln = p.targetPeserta || 0
                const tpThn = p.targetPesertaTahunan || tpBln
                const tlBln = p.targetLulusan || 0
                const tlThn = p.targetLulusanTahunan || tlBln
                const pTot = p.pesertaL + p.pesertaP
                const lTot = p.lulusanL + p.lulusanP
                const diklatRows = p.diklatDetails || []
                return (
                  <React.Fragment key={p.programId}>
                  <tr
                    className={`transition-colors ${isParentRow
                      ? 'bg-navy-50/80 row-parent font-extrabold text-navy-950 border-b-2 border-b-slate-300'
                      : i % 2 === 0
                      ? 'bg-white row-child-even border-b border-slate-200'
                      : 'bg-slate-50/70 row-child-odd border-b border-slate-200'
                    }`}
                  >
                    <td className="text-center border border-slate-300 px-1 py-1.5 text-navy-500 text-[10px] font-bold">{i + 1}</td>
                    <td className="border border-slate-300 px-2 py-1.5">
                      {isParentRow
                        ? <span className="font-extrabold text-navy-950 text-[11px] leading-tight block">{p.programName}</span>
                        : <div className="pl-2">
                            <span className="inline-flex items-center gap-1 font-semibold text-navy-800 text-[10.5px] leading-tight">
                              <span className="text-navy-400">↳</span>{p.programName}
                            </span>
                            {diklatRows.length > 0 && (
                              <p className="text-[8.5px] text-slate-400 font-semibold mt-0.5">{diklatRows.length} rincian diklat ↓</p>
                            )}
                          </div>
                      }
                    </td>
                    <td className="text-center border border-slate-300 px-1 py-1.5 tabular-nums text-[10.5px] font-medium text-navy-700">{fmtNum(tpBln)}</td>
                    <td className="text-center border border-slate-300 px-1 py-1.5 tabular-nums text-[10.5px] font-bold text-navy-900">{fmtNum(tpThn)}</td>
                    <td className="text-center border border-slate-300 px-1 py-1.5 tabular-nums text-[10.5px] text-navy-600">{fmtNum(p.pesertaL)}</td>
                    <td className="text-center border border-slate-300 px-1 py-1.5 tabular-nums text-[10.5px] text-navy-600">{fmtNum(p.pesertaP)}</td>
                    <td className="text-center border border-slate-300 px-1 py-1.5 font-black text-navy-950 tabular-nums text-[11px] bg-slate-100/50">{fmtNum(pTot)}</td>
                    <td className={clsx('text-center border border-slate-300 px-1 py-1.5 text-[10.5px] tabular-nums', pctColor(pTot, tpBln))}>{pctText(pTot, tpBln)}</td>
                    <td className={clsx('text-center border border-slate-300 border-r-2 border-r-slate-400 px-1 py-1.5 text-[10.5px] tabular-nums', pctColor(pTot, tpThn))}>{pctText(pTot, tpThn)}</td>
                    <td className="text-center border border-slate-300 px-1 py-1.5 tabular-nums text-[10.5px] font-medium text-navy-700">{fmtNum(tlBln)}</td>
                    <td className="text-center border border-slate-300 px-1 py-1.5 tabular-nums text-[10.5px] font-bold text-navy-900">{fmtNum(tlThn)}</td>
                    <td className="text-center border border-slate-300 px-1 py-1.5 tabular-nums text-[10.5px] text-navy-600">{fmtNum(p.lulusanL)}</td>
                    <td className="text-center border border-slate-300 px-1 py-1.5 tabular-nums text-[10.5px] text-navy-600">{fmtNum(p.lulusanP)}</td>
                    <td className="text-center border border-slate-300 px-1 py-1.5 font-black text-navy-950 tabular-nums text-[11px] bg-slate-100/50">{fmtNum(lTot)}</td>
                      <td className={clsx('text-center border border-slate-300 px-1 py-1.5 text-[10.5px] tabular-nums', pctColor(lTot, tlBln))}>{pctText(lTot, tlBln)}</td>
                      <td className={clsx('text-center border border-slate-300 px-1 py-1.5 text-[10.5px] tabular-nums', pctColor(lTot, tlThn))}>{pctText(lTot, tlThn)}</td>
                    </tr>
                    {/* Rincian diklat di bawah program (termasuk induk tanpa turunan) */}
                    {diklatRows.map((d) => {
                      const dpTot = (d.pesertaL || 0) + (d.pesertaP || 0)
                      const dlTot = (d.lulusanL || 0) + (d.lulusanP || 0)
                      return (
                        <tr key={d.diklatId} className="bg-sky-50/40 hover:bg-sky-50/70">
                          <td className="border border-slate-300" />
                          <td className="border border-slate-300 px-2 py-1">
                            <span className="inline-flex items-center gap-1 text-slate-600 text-[10px] font-semibold pl-5 leading-tight">
                              <span className="text-sky-400 font-black">•</span>{d.name}
                            </span>
                          </td>
                          <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[10px] text-slate-500">{fmtNum(d.targetPeserta)}</td>
                          <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[10px] text-slate-500">{fmtNum(d.targetPeserta)}</td>
                          <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[10px]">{fmtNum(d.pesertaL)}</td>
                          <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[10px]">{fmtNum(d.pesertaP)}</td>
                          <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[10px] font-bold">{fmtNum(dpTot)}</td>
                          <td className={clsx('text-center border border-slate-300 px-1 py-1 text-[10px] tabular-nums', pctColor(dpTot, d.targetPeserta))}>{pctText(dpTot, d.targetPeserta)}</td>
                          <td className={clsx('text-center border border-slate-300 border-r-2 border-r-slate-400 px-1 py-1 text-[10px] tabular-nums', pctColor(dpTot, d.targetPeserta))}>{pctText(dpTot, d.targetPeserta)}</td>
                          <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[10px] text-slate-500">{fmtNum(d.targetLulusan)}</td>
                          <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[10px] text-slate-500">{fmtNum(d.targetLulusan)}</td>
                          <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[10px]">{fmtNum(d.lulusanL)}</td>
                          <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[10px]">{fmtNum(d.lulusanP)}</td>
                          <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[10px] font-bold">{fmtNum(dlTot)}</td>
                          <td className={clsx('text-center border border-slate-300 px-1 py-1 text-[10px] tabular-nums', pctColor(dlTot, d.targetLulusan))}>{pctText(dlTot, d.targetLulusan)}</td>
                          <td className={clsx('text-center border border-slate-300 px-1 py-1 text-[10px] tabular-nums', pctColor(dlTot, d.targetLulusan))}>{pctText(dlTot, d.targetLulusan)}</td>
                        </tr>
                      )
                    })}
                    </React.Fragment>
                  )
                })}
              </tbody>
            <tfoot>
              <tr className="bg-navy-950 text-white font-black border-t-2 border-slate-500">
                <td colSpan={2} className="border border-slate-400 px-2 py-2 font-black text-center text-[10.5px] uppercase tracking-wider">TOTAL AKUMULASI</td>
                <td className="text-center border border-slate-400 px-1 py-2 font-black text-gold-300 tabular-nums text-[10.5px]">{fmtNum(u.totalTargetPeserta)}</td>
                <td className="text-center border border-slate-400 px-1 py-2 font-black text-gold-400 tabular-nums text-[10.5px]">{fmtNum(u.totalTargetPesertaTahunan || u.totalTargetPeserta)}</td>
                <td className="text-center border border-slate-400 px-1 py-2 font-bold text-navy-200 tabular-nums text-[10.5px]">{fmtNum(sumPesL)}</td>
                <td className="text-center border border-slate-400 px-1 py-2 font-bold text-navy-200 tabular-nums text-[10.5px]">{fmtNum(sumPesP)}</td>
                <td className="text-center border border-slate-400 px-1 py-2 font-black text-white tabular-nums text-[11px] bg-navy-900">{fmtNum(u.totalPeserta)}</td>
                <td className="text-center border border-slate-400 px-1 py-2 font-black text-emerald-400 tabular-nums text-[10.5px]">{pctText(u.totalPeserta, u.totalTargetPeserta)}</td>
                <td className="text-center border border-slate-400 border-r-2 border-r-slate-500 px-1 py-2 font-black text-emerald-400 tabular-nums text-[10.5px]">{pctText(u.totalPeserta, u.totalTargetPesertaTahunan || u.totalTargetPeserta)}</td>
                <td className="text-center border border-slate-400 px-1 py-2 font-black text-gold-300 tabular-nums text-[10.5px]">{fmtNum(u.totalTargetLulusan)}</td>
                <td className="text-center border border-slate-400 px-1 py-2 font-black text-gold-400 tabular-nums text-[10.5px]">{fmtNum(u.totalTargetLulusanTahunan || u.totalTargetLulusan)}</td>
                <td className="text-center border border-slate-400 px-1 py-2 font-bold text-navy-200 tabular-nums text-[10.5px]">{fmtNum(sumLulL)}</td>
                <td className="text-center border border-slate-400 px-1 py-2 font-bold text-navy-200 tabular-nums text-[10.5px]">{fmtNum(sumLulP)}</td>
                <td className="text-center border border-slate-400 px-1 py-2 font-black text-white tabular-nums text-[11px] bg-navy-900">{fmtNum(u.totalLulusan)}</td>
                <td className="text-center border border-slate-400 px-1 py-2 font-black text-emerald-400 tabular-nums text-[10.5px]">{pctText(u.totalLulusan, u.totalTargetLulusan)}</td>
                <td className="text-center border border-slate-400 px-1 py-2 font-black text-emerald-400 tabular-nums text-[10.5px]">{pctText(u.totalLulusan, u.totalTargetLulusanTahunan || u.totalTargetLulusan)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    )
  }

  /* ── All Months: tabel matriks 12 bulan menyamping ── */
  const activeMonths = ALL_MONTHS

  return (
    <div className="rounded-xl border border-slate-300 bg-white overflow-hidden shadow-sm">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-navy-950 text-white">
        <p className="text-xs font-extrabold flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0 flex-1 leading-snug">
          <span className="text-gold-300 shrink-0">▶</span>
          <span className="whitespace-nowrap">Detail Realisasi — <span className="text-gold-200">{u.uptCode}</span></span><span className="min-w-0 break-words">· {u.uptName}</span>
          <span className="ml-1 rounded-full bg-gold-500/20 border border-gold-500/30 text-gold-300 text-[9px] font-bold px-1.5 py-0.5 whitespace-nowrap">📊 Matriks 12 Bulan</span>
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            className="rounded-md bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1.5 text-[10px] font-extrabold text-white flex items-center gap-1"
            onClick={handleExportUptExcel}
            disabled={exportingExcel}
          >
            <IconFileText className="h-3.5 w-3.5" />
            {exportingExcel ? '...' : 'Excel'}
          </button>
          <button
            type="button"
            className="rounded-md bg-gold-500 hover:bg-gold-400 px-2.5 py-1.5 text-[10px] font-extrabold text-navy-900 flex items-center gap-1"
            onClick={(e) => { e.stopPropagation(); exportSingleUptPdf(u, { periodLabel, year }) }}
          >
            <IconDownload className="h-3 w-3" /> PDF UPT Ini
          </button>
        </div>
      </div>
      {/* Toolbar navigasi matriks: lompat ke bulan + geser */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border-b border-slate-200 overflow-x-auto matrix-scroll">
        <span className="text-[9px] font-extrabold uppercase tracking-wider text-navy-400 whitespace-nowrap shrink-0">Lompat ke:</span>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => scrollByPage(-1)} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-black text-navy-700" title="Geser ke kiri">‹</button>
          {activeMonths.map((mNum, idx) => (
            <button
              key={mNum}
              type="button"
              onClick={() => scrollToBlock(idx)}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-[9px] font-bold text-navy-700 whitespace-nowrap"
            >
              {MONTHS[mNum - 1].slice(0, 3)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => scrollToBlock(activeMonths.length)}
            className="rounded border border-gold-500/50 bg-gold-500/15 px-2 py-1 text-[9px] font-black text-gold-700 whitespace-nowrap"
          >
            Total
          </button>
          <button type="button" onClick={() => scrollByPage(1)} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-black text-navy-700" title="Geser ke kanan">›</button>
        </div>
        <span className="ml-auto text-[9px] text-slate-400 whitespace-nowrap hidden md:block shrink-0">Geser tabel ke kanan untuk melihat semua bulan →</span>
      </div>
      {/* Tabel matriks 12 bulan + scroll horizontal */}
      <div ref={scrollRef} className="w-full overflow-x-auto relative matrix-scroll scroll-smooth">
        <table
          className="border-collapse border border-slate-300 text-slate-800 font-sans matrix-table"
          style={{
            minWidth: Math.max(1040, 282 + (activeMonths.length + 1) * 592),
            tableLayout: 'fixed',
          }}
        >
          <colgroup>
            <col style={{ width: '42px', minWidth: '42px' }} />
            <col style={{ width: '240px', minWidth: '240px' }} />
            {Array.from({ length: (activeMonths.length + 1) * 10 }).map((_, idx) => (
              <col key={idx} style={{ width: idx % 5 === 4 ? '64px' : '58px', minWidth: idx % 5 === 4 ? '64px' : '58px' }} />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-navy-950 text-white font-black uppercase text-[10px]">
              <th rowSpan={4} className="text-center border border-slate-400 px-1 py-2 sticky left-0 z-40 bg-navy-950 text-white" style={{ left: 0, top: 0, width: 42, minWidth: 42, maxWidth: 42, backgroundColor: '#16283f' }}>#</th>
              <th rowSpan={4} className="text-left border border-slate-400 px-2 py-2 sticky z-40 bg-navy-950 text-white border-r-2 border-r-slate-400 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.4)]" style={{ left: 42, top: 0, width: 240, minWidth: 240, maxWidth: 240, backgroundColor: '#16283f' }}>PROGRAM DIKLAT</th>
              {activeMonths.map((mNum) => (
                <th key={mNum} colSpan={10} className="text-center border border-slate-400 border-r-2 border-r-slate-500 bg-navy-900 px-2 py-1.5 text-gold-300">
                  {MONTHS[mNum - 1].toUpperCase()}
                </th>
              ))}
              <th colSpan={10} className="total-block text-center border border-slate-400 bg-amber-600 px-2 py-1.5 text-white">TOTAL 1 TAHUN</th>
            </tr>
            <tr className="bg-navy-900 text-white font-extrabold text-[10px]">
              {Array.from({ length: activeMonths.length + 1 }).map((_, i) => (
                <React.Fragment key={i}>
                  <th colSpan={5} className="text-center border border-slate-400 bg-navy-900/90 py-1 text-sky-200">PESERTA</th>
                  <th colSpan={5} className={`text-center border border-slate-400 bg-navy-950 py-1 text-emerald-200 ${i < activeMonths.length ? 'border-r-2 border-r-slate-500' : ''}`}>LULUSAN</th>
                </React.Fragment>
              ))}
            </tr>
            <tr className="bg-slate-800 text-slate-100 font-bold text-[9.5px]">
              {Array.from({ length: activeMonths.length + 1 }).map((_, i) => (
                <React.Fragment key={i}>
                  <th className="text-center border border-slate-400 text-gold-200 py-1">TARGET PK</th>
                  <th colSpan={3} className="text-center border border-slate-400 py-1">REALISASI</th>
                  <th className="text-center border border-slate-400 text-emerald-300 py-1">CAPAIAN (%)</th>
                  <th className="text-center border border-slate-400 text-gold-200 py-1">TARGET PK</th>
                  <th colSpan={3} className="text-center border border-slate-400 py-1">REALISASI</th>
                  <th className={`text-center border border-slate-400 text-emerald-300 py-1 ${i < activeMonths.length ? 'border-r-2 border-r-slate-500' : ''}`}>CAPAIAN (%)</th>
                </React.Fragment>
              ))}
            </tr>
            <tr className="bg-slate-700 text-slate-100 font-bold text-[9px]">
              {Array.from({ length: activeMonths.length + 1 }).map((_, i) => (
                <React.Fragment key={i}>
                  <th className="text-center border border-slate-400 text-gold-200 py-1">TARGET</th>
                  <th className="text-center border border-slate-400 py-1">L</th>
                  <th className="text-center border border-slate-400 py-1">P</th>
                  <th className="text-center border border-slate-400 py-1">TOTAL</th>
                  <th className="text-center border border-slate-400 text-emerald-200 py-1">%</th>
                  <th className="text-center border border-slate-400 text-gold-200 py-1">TARGET</th>
                  <th className="text-center border border-slate-400 py-1">L</th>
                  <th className="text-center border border-slate-400 py-1">P</th>
                  <th className="text-center border border-slate-400 py-1">TOTAL</th>
                  <th className={`text-center border border-slate-400 text-emerald-200 py-1 ${i < activeMonths.length ? 'border-r-2 border-r-slate-500' : ''}`}>%</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {u.programs.map((p, i) => {
              const isParentRow = p.isParent
              const stickyBgClass = isParentRow ? 'bg-slate-200' : i % 2 === 0 ? 'bg-white' : 'bg-slate-100'

              const sumRange = (key) => activeMonths.reduce((s, m) => s + (p.byMonth?.[m]?.[key] || 0), 0)
              // Target single-input = angka tetap tahunan (bukan jumlah 12 bulan)
              const rangeTargetPeserta = p.isSingle ? (p.targetPesertaTahunan || p.targetPeserta || 0) : sumRange('targetPeserta')
              const rangePesertaL = sumRange('pesertaL')
              const rangePesertaP = sumRange('pesertaP')
              const rangePesertaTot = rangePesertaL + rangePesertaP
              const rangeTargetLulusan = p.isSingle ? (p.targetLulusanTahunan || p.targetLulusan || 0) : sumRange('targetLulusan')
              const rangeLulusanL = sumRange('lulusanL')
              const rangeLulusanP = sumRange('lulusanP')
              const rangeLulusanTot = rangeLulusanL + rangeLulusanP
              const diklatRows = p.diklatDetails || []

              return (
                <React.Fragment key={p.programId}>
                <tr
                  className={`transition-colors ${isParentRow
                    ? 'bg-slate-200 row-parent font-extrabold text-navy-950 border-b-2 border-b-slate-400'
                    : i % 2 === 0
                    ? 'bg-white row-child-even border-b border-slate-200'
                    : 'bg-slate-100 row-child-odd border-b border-slate-200'
                  }`}
                >
                  <td className={`text-center border border-slate-300 px-1 py-1.5 text-navy-600 text-[9px] font-bold sticky z-20 ${stickyBgClass}`} style={{ left: 0, width: 42, minWidth: 42, maxWidth: 42 }}>{i + 1}</td>
                  <td className={`border border-slate-300 px-2 py-1.5 sticky z-20 border-r-2 border-r-slate-400 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.2)] cell-program ${stickyBgClass} ${isParentRow ? '!border-l-4 !border-l-gold-500' : ''}`} style={{ left: 42, width: 240, minWidth: 240, maxWidth: 240 }}>
                    {isParentRow
                      ? <div>
                          <span className="font-extrabold text-navy-950 text-[9px] leading-tight block">{p.programName}</span>
                          {diklatRows.length > 0 && (
                            <p className="text-[7.5px] text-slate-400 font-semibold mt-0.5">{diklatRows.length} rincian diklat ↓</p>
                          )}
                        </div>
                      : <div className="pl-2">
                          <span className="inline-flex items-center gap-1 font-semibold text-navy-800 text-[9px] leading-tight">
                            <span className="text-navy-400">↳</span>{p.programName}
                          </span>
                          {diklatRows.length > 0 && (
                            <p className="text-[7.5px] text-slate-400 font-semibold mt-0.5">{diklatRows.length} rincian diklat ↓</p>
                          )}
                        </div>
                    }
                  </td>

                  {activeMonths.map((mNum) => {
                    const bm = p.byMonth?.[mNum] || { targetPeserta: 0, pesertaL: 0, pesertaP: 0, targetLulusan: 0, lulusanL: 0, lulusanP: 0 }
                    const pTot = bm.pesertaL + bm.pesertaP
                    const lTot = bm.lulusanL + bm.lulusanP
                    return (
                      <React.Fragment key={mNum}>
                        <td className="text-center border border-slate-300 px-1 py-1.5 tabular-nums text-[9px] text-navy-700">{fmtNum(bm.targetPeserta)}</td>
                        <td className="text-center border border-slate-300 px-1 py-1.5 tabular-nums text-[9px] text-navy-600">{fmtNum(bm.pesertaL)}</td>
                        <td className="text-center border border-slate-300 px-1 py-1.5 tabular-nums text-[9px] text-navy-600">{fmtNum(bm.pesertaP)}</td>
                        <td className="text-center border border-slate-300 px-1 py-1.5 font-bold text-navy-950 tabular-nums text-[9px] bg-slate-100/50">{fmtNum(pTot)}</td>
                        <td className={clsx('text-center border border-slate-300 px-1 py-1.5 text-[9px] tabular-nums', pctColor(pTot, bm.targetPeserta))}>{pctText(pTot, bm.targetPeserta)}</td>
                        <td className="text-center border border-slate-300 px-1 py-1.5 tabular-nums text-[9px] text-navy-700">{fmtNum(bm.targetLulusan)}</td>
                        <td className="text-center border border-slate-300 px-1 py-1.5 tabular-nums text-[9px] text-navy-600">{fmtNum(bm.lulusanL)}</td>
                        <td className="text-center border border-slate-300 px-1 py-1.5 tabular-nums text-[9px] text-navy-600">{fmtNum(bm.lulusanP)}</td>
                        <td className="text-center border border-slate-300 px-1 py-1.5 font-bold text-navy-950 tabular-nums text-[9px] bg-slate-100/50">{fmtNum(lTot)}</td>
                        <td className={clsx('text-center border border-slate-300 border-r-2 border-r-slate-500 px-1 py-1.5 text-[9px] tabular-nums', pctColor(lTot, bm.targetLulusan))}>{pctText(lTot, bm.targetLulusan)}</td>
                      </React.Fragment>
                    )
                  })}

                  {/* Total blok */}
                  <td className="text-center border border-slate-300 px-1 py-1.5 font-bold text-navy-900 tabular-nums text-[9px] bg-amber-50/70">{fmtNum(rangeTargetPeserta)}</td>
                  <td className="text-center border border-slate-300 px-1 py-1.5 text-navy-700 tabular-nums text-[9px] bg-amber-50/70">{fmtNum(rangePesertaL)}</td>
                  <td className="text-center border border-slate-300 px-1 py-1.5 text-navy-700 tabular-nums text-[9px] bg-amber-50/70">{fmtNum(rangePesertaP)}</td>
                  <td className="text-center border border-slate-300 px-1 py-1.5 font-black text-navy-950 tabular-nums text-[9px] bg-amber-100/80">{fmtNum(rangePesertaTot)}</td>
                  <td className={clsx('text-center border border-slate-300 px-1 py-1.5 text-[9px] tabular-nums bg-amber-50/70', pctColor(rangePesertaTot, rangeTargetPeserta))}>{pctText(rangePesertaTot, rangeTargetPeserta)}</td>
                  <td className="text-center border border-slate-300 px-1 py-1.5 font-bold text-navy-900 tabular-nums text-[9px] bg-amber-50/70">{fmtNum(rangeTargetLulusan)}</td>
                  <td className="text-center border border-slate-300 px-1 py-1.5 text-navy-700 tabular-nums text-[9px] bg-amber-50/70">{fmtNum(rangeLulusanL)}</td>
                  <td className="text-center border border-slate-300 px-1 py-1.5 text-navy-700 tabular-nums text-[9px] bg-amber-50/70">{fmtNum(rangeLulusanP)}</td>
                  <td className="text-center border border-slate-300 px-1 py-1.5 font-black text-navy-950 tabular-nums text-[9px] bg-amber-100/80">{fmtNum(rangeLulusanTot)}</td>
                  <td className={clsx('text-center border border-slate-300 px-1 py-1.5 text-[9px] tabular-nums bg-amber-50/70', pctColor(rangeLulusanTot, rangeTargetLulusan))}>{pctText(rangeLulusanTot, rangeTargetLulusan)}</td>
                </tr>
                {/* Rincian diklat di bawah program (termasuk induk tanpa turunan) */}
                {diklatRows.map((d) => {
                  const dRange = { pesertaL: 0, pesertaP: 0, lulusanL: 0, lulusanP: 0 }
                  for (const mNum of activeMonths) {
                    const bm = d.byMonth?.[mNum] || {}
                    dRange.pesertaL += bm.pesertaL || 0; dRange.pesertaP += bm.pesertaP || 0
                    dRange.lulusanL += bm.lulusanL || 0; dRange.lulusanP += bm.lulusanP || 0
                  }
                  const dPesertaTot = dRange.pesertaL + dRange.pesertaP
                  const dLulusanTot = dRange.lulusanL + dRange.lulusanP
                  return (
                    <tr key={d.diklatId} className="bg-sky-50/40 hover:bg-sky-50/70">
                      <td className="border border-slate-300 sticky z-20 bg-sky-50/80" style={{ left: 0, width: 42, minWidth: 42, maxWidth: 42 }} />
                      <td className="border border-slate-300 border-r-2 border-r-slate-400 px-2 py-1 sticky z-20 bg-sky-50/80 cell-program" style={{ left: 42, width: 240, minWidth: 240, maxWidth: 240 }}>
                        <span className="inline-flex items-start gap-1 text-slate-600 text-[9px] font-semibold pl-4 leading-snug">
                          <span className="text-sky-400 font-black shrink-0">•</span><span className="break-words">{d.name}</span>
                        </span>
                      </td>
                      {activeMonths.map((mNum) => {
                        const bm = d.byMonth?.[mNum] || { pesertaL: 0, pesertaP: 0, lulusanL: 0, lulusanP: 0 }
                        const pTot = (bm.pesertaL || 0) + (bm.pesertaP || 0)
                        const lTot = (bm.lulusanL || 0) + (bm.lulusanP || 0)
                        return (
                          <React.Fragment key={mNum}>
                            <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[9px] text-slate-400">0</td>
                            <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[9px]">{fmtNum(bm.pesertaL)}</td>
                            <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[9px]">{fmtNum(bm.pesertaP)}</td>
                            <td className="text-center border border-slate-300 px-1 py-1 font-bold tabular-nums text-[9px]">{fmtNum(pTot)}</td>
                            <td className="text-center border border-slate-300 px-1 py-1 text-[9px] tabular-nums text-slate-400">-</td>
                            <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[9px] text-slate-400">0</td>
                            <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[9px]">{fmtNum(bm.lulusanL)}</td>
                            <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[9px]">{fmtNum(bm.lulusanP)}</td>
                            <td className="text-center border border-slate-300 px-1 py-1 font-bold tabular-nums text-[9px]">{fmtNum(lTot)}</td>
                            <td className="text-center border border-slate-300 border-r-2 border-r-slate-500 px-1 py-1 text-[9px] tabular-nums text-slate-400">-</td>
                          </React.Fragment>
                        )
                      })}
                      <td className="text-center border border-slate-300 px-1 py-1 font-bold tabular-nums text-[9px] bg-amber-50/70">{fmtNum(d.targetPeserta)}</td>
                      <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[9px] bg-amber-50/70">{fmtNum(dRange.pesertaL)}</td>
                      <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[9px] bg-amber-50/70">{fmtNum(dRange.pesertaP)}</td>
                      <td className="text-center border border-slate-300 px-1 py-1 font-black tabular-nums text-[9px] bg-amber-100/80">{fmtNum(dPesertaTot)}</td>
                      <td className={clsx('text-center border border-slate-300 px-1 py-1 text-[9px] tabular-nums bg-amber-50/70', pctColor(dPesertaTot, d.targetPeserta))}>{pctText(dPesertaTot, d.targetPeserta)}</td>
                      <td className="text-center border border-slate-300 px-1 py-1 font-bold tabular-nums text-[9px] bg-amber-50/70">{fmtNum(d.targetLulusan)}</td>
                      <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[9px] bg-amber-50/70">{fmtNum(dRange.lulusanL)}</td>
                      <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[9px] bg-amber-50/70">{fmtNum(dRange.lulusanP)}</td>
                      <td className="text-center border border-slate-300 px-1 py-1 font-black tabular-nums text-[9px] bg-amber-100/80">{fmtNum(dLulusanTot)}</td>
                      <td className={clsx('text-center border border-slate-300 px-1 py-1 text-[9px] tabular-nums bg-amber-50/70', pctColor(dLulusanTot, d.targetLulusan))}>{pctText(dLulusanTot, d.targetLulusan)}</td>
                    </tr>
                  )
                })}
                </React.Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-navy-950 text-white font-black border-t-2 border-slate-500">
              <td colSpan={2} className="border border-slate-400 px-2 py-1.5 font-black text-center text-[9px] uppercase tracking-wider sticky z-30 bg-navy-950 text-white border-r-2 border-r-slate-400 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.4)] whitespace-nowrap" style={{ left: 0, width: 282, minWidth: 282, maxWidth: 282, backgroundColor: '#16283f' }}>TOTAL AKUMULASI</td>
              {activeMonths.map((mNum) => {
                const parentProgs = u.programs.filter((p) => p.isParent)
                const sumKey = (key) => parentProgs.reduce((s, p) => s + (p.byMonth?.[mNum]?.[key] || 0), 0)
                const tPeserta = sumKey('targetPeserta')
                const pL = sumKey('pesertaL')
                const pP = sumKey('pesertaP')
                const pTot = pL + pP
                const tLulusan = sumKey('targetLulusan')
                const lL = sumKey('lulusanL')
                const lP = sumKey('lulusanP')
                const lTot = lL + lP
                return (
                  <React.Fragment key={mNum}>
                    <td className="text-center border border-slate-400 px-1 py-2 font-bold text-gold-300 tabular-nums text-[10px]">{fmtNum(tPeserta)}</td>
                    <td className="text-center border border-slate-400 px-1 py-2 font-medium text-navy-200 tabular-nums text-[10px]">{fmtNum(pL)}</td>
                    <td className="text-center border border-slate-400 px-1 py-2 font-medium text-navy-200 tabular-nums text-[10px]">{fmtNum(pP)}</td>
                    <td className="text-center border border-slate-400 px-1 py-2 font-black text-white tabular-nums text-[10.5px] bg-navy-900">{fmtNum(pTot)}</td>
                    <td className="text-center border border-slate-400 px-1 py-2 font-black text-emerald-400 tabular-nums text-[10px]">{pctText(pTot, tPeserta)}</td>
                    <td className="text-center border border-slate-400 px-1 py-2 font-bold text-gold-300 tabular-nums text-[10px]">{fmtNum(tLulusan)}</td>
                    <td className="text-center border border-slate-400 px-1 py-2 font-medium text-navy-200 tabular-nums text-[10px]">{fmtNum(lL)}</td>
                    <td className="text-center border border-slate-400 px-1 py-2 font-medium text-navy-200 tabular-nums text-[10px]">{fmtNum(lP)}</td>
                    <td className="text-center border border-slate-400 px-1 py-2 font-black text-white tabular-nums text-[10.5px] bg-navy-900">{fmtNum(lTot)}</td>
                    <td className="text-center border border-slate-400 border-r-2 border-r-slate-500 px-1 py-2 font-black text-emerald-400 tabular-nums text-[10px]">{pctText(lTot, tLulusan)}</td>
                  </React.Fragment>
                )
              })}
              {(() => {
                const parentProgs = u.programs.filter((p) => p.isParent)
                const sumAllActive = (key) => parentProgs.reduce((s, p) => s + activeMonths.reduce((sm, m) => sm + (p.byMonth?.[m]?.[key] || 0), 0), 0)
                // Target tetap tahunan untuk baris single-input (jangan ×12 bulan)
                const fixedTarget = (p, key) => key === 'targetPeserta' ? (p.targetPesertaTahunan || p.targetPeserta || 0) : (p.targetLulusanTahunan || p.targetLulusan || 0)
                const totTgtPeserta = parentProgs.reduce((s, p) => s + (p.isSingle ? fixedTarget(p, 'targetPeserta') : activeMonths.reduce((sm, m) => sm + (p.byMonth?.[m]?.targetPeserta || 0), 0)), 0)
                const totPL = sumAllActive('pesertaL')
                const totPP = sumAllActive('pesertaP')
                const totPTot = totPL + totPP
                const totTgtLulusan = parentProgs.reduce((s, p) => s + (p.isSingle ? fixedTarget(p, 'targetLulusan') : activeMonths.reduce((sm, m) => sm + (p.byMonth?.[m]?.targetLulusan || 0), 0)), 0)
                const totLL = sumAllActive('lulusanL')
                const totLP = sumAllActive('lulusanP')
                const totLTot = totLL + totLP
                return (
                  <React.Fragment>
                    <td className="text-center border border-slate-400 px-1 py-2 font-black text-gold-300 tabular-nums text-[10.5px] bg-navy-900">{fmtNum(totTgtPeserta)}</td>
                    <td className="text-center border border-slate-400 px-1 py-2 font-bold text-navy-200 tabular-nums text-[10.5px] bg-navy-900">{fmtNum(totPL)}</td>
                    <td className="text-center border border-slate-400 px-1 py-2 font-bold text-navy-200 tabular-nums text-[10.5px] bg-navy-900">{fmtNum(totPP)}</td>
                    <td className="text-center border border-slate-400 px-1 py-2 font-black text-white tabular-nums text-[11px] bg-amber-600">{fmtNum(totPTot)}</td>
                    <td className="text-center border border-slate-400 px-1 py-2 font-black text-emerald-400 tabular-nums text-[10.5px] bg-navy-900">{pctText(totPTot, totTgtPeserta)}</td>
                    <td className="text-center border border-slate-400 px-1 py-2 font-black text-gold-300 tabular-nums text-[10.5px] bg-navy-900">{fmtNum(totTgtLulusan)}</td>
                    <td className="text-center border border-slate-400 px-1 py-2 font-bold text-navy-200 tabular-nums text-[10.5px] bg-navy-900">{fmtNum(totLL)}</td>
                    <td className="text-center border border-slate-400 px-1 py-2 font-bold text-navy-200 tabular-nums text-[10.5px] bg-navy-900">{fmtNum(totLP)}</td>
                    <td className="text-center border border-slate-400 px-1 py-2 font-black text-white tabular-nums text-[11px] bg-amber-600">{fmtNum(totLTot)}</td>
                    <td className="text-center border border-slate-400 px-1 py-2 font-black text-emerald-400 tabular-nums text-[10.5px] bg-navy-900">{pctText(totLTot, totTgtLulusan)}</td>
                  </React.Fragment>
                )
              })()}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   HALAMAN UTAMA LAPORAN REALISASI ADMIN BPSDMP
───────────────────────────────────────────── */
export default function ReportPage() {
  const { user } = useAuth()
  const isPusbang = user?.role === 'PUSBANG'
  const pusbangMatra = (user?.pusbangMatra || '').toLowerCase()
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState('')
  const [matra, setMatra] = useState('')
  const [search, setSearch] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    if (isPusbang && pusbangMatra && matra !== pusbangMatra) setMatra(pusbangMatra)
  }, [isPusbang, pusbangMatra, matra])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = { year }
      if (month) params.month = month
      const { data: res } = await api.get('/reports', { params })
      setData(res)
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => {
    load()
  }, [load])

  const s = data?.summary
  const periodLabel = data?.monthName ? `${data.monthName}_${year}` : `Tahun_${year}`

  const filteredUpts = (data?.upts || []).filter((u) => {
    if (matra && u.matra !== matra) return false
    if (search) {
      const q = search.toLowerCase()
      if (!u.uptCode?.toLowerCase().includes(q) && !u.uptName?.toLowerCase().includes(q)) return false
    }
    return true
  })
  const filteredMissing = (data?.missing || []).filter((m) => !matra || m.matra === matra)

  const handleExportPdf = () => {
    if (!data) return
    exportPdf({ periodLabel, year, upts: filteredUpts, missing: filteredMissing, summary: s || {} })
  }
  const handleExportExcel = async () => {
    if (!data) return
    try {
      await exportExcel({ periodLabel, upts: filteredUpts, missing: filteredMissing, summary: s || {}, year, month })
    } catch (e) {
      console.error(e)
      alert('Gagal mengekspor Excel: ' + (e.message || ''))
    }
  }

  return (
    <div className="animate-fadeUp">
      <div className="page-header">
        <div>
          <h1 className="page-title">Laporan Realisasi</h1>
          <p className="page-desc">
            Laporan realisasi per UPT dengan perbandingan target PK. Klik UPT untuk melihat detail per program{!month ? ' (matriks 12 bulan menyamping)' : ' per bulan'}.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={handleExportExcel} disabled={!data || loading}>
            <IconDownload className="h-4 w-4" /> Excel
          </button>
          <button type="button" className="btn-primary" onClick={handleExportPdf} disabled={!data || loading}>
            <IconDownload className="h-4 w-4" /> PDF
          </button>
        </div>
      </div>

      {error && <div className="mb-5"><Alert type="error">{error}</Alert></div>}

      {/* Filter */}
      <div className="card p-4 mb-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="form-label" htmlFor="report-year">Tahun</label>
            <select
              id="report-year"
              className="form-input"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {yearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="report-month">Bulan</label>
            <select
              id="report-month"
              className="form-input"
              value={month}
              onChange={(e) => { setMonth(e.target.value); setExpanded(null) }}
            >
              <option value="">Semua Bulan</option>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="report-matra">
              Matra{isPusbang && <span className="text-amber-600 font-normal"> — {pusbangMatra.toUpperCase()} (terkunci)</span>}
            </label>
            <select
              id="report-matra"
              className="form-input disabled:bg-slate-100 disabled:text-slate-500"
              value={matra}
              onChange={(e) => setMatra(e.target.value)}
              disabled={isPusbang}
            >
              <option value="">Semua Matra</option>
              <option value="darat">Matra Darat</option>
              <option value="laut">Matra Laut</option>
              <option value="udara">Matra Udara</option>
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="report-search">Cari UPT</label>
            <div className="relative">
              <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-300" />
              <input
                id="report-search"
                className="form-input !pl-9"
                placeholder="Kode atau nama UPT..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
        {/* Info mode tampilan */}
        {!month && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-sky-50 border border-sky-200 px-3 py-2">
            <span className="text-sky-600 text-sm">📊</span>
            <p className="text-xs text-sky-800 font-medium">
              Mode <strong>Semua Bulan</strong> — klik baris UPT untuk membuka detail realisasi per program dalam format <strong>matriks 12 bulan menyamping</strong> (dapat di-scroll horizontal).
            </p>
          </div>
        )}
      </div>

      {/* Ringkasan */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-5">
        <StatCard
          icon={<IconBuilding className="h-5 w-5" />}
          label="Total UPT"
          value={fmtNum(s?.uptTotal ?? 0)}
          sub="UPT aktif terdaftar"
          tone="navy"
        />
        <StatCard
          icon={<IconCheck className="h-5 w-5" />}
          label="Sudah Melapor"
          value={fmtNum(s?.uptReported ?? 0)}
          sub="UPT yang mengirim realisasi"
          tone="emerald"
          delay={60}
        />
        <StatCard
          icon={<IconX className="h-5 w-5" />}
          label="Belum Melapor"
          value={fmtNum(s?.uptMissing ?? 0)}
          sub={month ? `Untuk ${MONTHS[Number(month) - 1]}` : 'Pilih bulan untuk melihat daftar'}
          tone="rose"
          delay={120}
        />
        <StatCard
          icon={<IconFileText className="h-5 w-5" />}
          label="Capaian Peserta"
          value={pctText(s?.totalPeserta ?? 0, s?.totalTargetPeserta ?? 0)}
          sub={`Target ${fmtNum(s?.totalTargetPeserta ?? 0)} · Realisasi ${fmtNum(s?.totalPeserta ?? 0)}`}
          tone="gold"
          delay={180}
        />
      </div>

      {/* UPT belum melapor */}
      {month && (
        <div className="card p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-extrabold text-navy-900">
                UPT Belum Melapor — {MONTHS[Number(month) - 1]} {year}
              </h2>
              <p className="text-xs text-navy-400 mt-0.5">Daftar UPT yang belum mengirim realisasi pada bulan terpilih.</p>
            </div>
            <span className="badge-danger">{fmtNum(filteredMissing.length)} UPT</span>
          </div>
          {loading ? (
            <SkeletonRows rows={3} />
          ) : filteredMissing.length ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filteredMissing.map((m) => (
                <div key={m.uptId} className="flex items-center gap-3 rounded-xl border border-rose-100 bg-rose-50/60 px-3 py-2.5">
                  <IconX className="h-4 w-4 text-rose-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-rose-800">
                      {m.code} <span className="text-rose-400 font-semibold">· {MATRA_LABEL[m.matra] || '-'}</span>
                    </p>
                    <p className="text-[11px] text-rose-600 truncate">{m.name}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
              <IconCheck className="h-4 w-4 text-emerald-600" />
              <p className="text-xs font-semibold text-emerald-800">Semua UPT sudah melapor untuk periode ini.</p>
            </div>
          )}
        </div>
      )}

      {/* Tabel per UPT */}
      <div className="card overflow-hidden">
        {loading ? (
          <SkeletonRows rows={8} />
        ) : error ? (
          <EmptyState
            icon={<IconFileText className="h-6 w-6" />}
            title="Gagal memuat laporan"
            desc="Periksa koneksi lalu muat ulang."
          />
        ) : filteredUpts.length ? (
          <>
            {/* Tabel rekap ringkas: layar lg ke atas */}
            <div className="table-wrap hidden lg:block">
              <table className="data-table compact-table">
                <colgroup>
                  <col style={{ width: '4%' }} />
                  <col style={{ width: '29%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '5%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '5%' }} />
                  <col style={{ width: '15%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th rowSpan={2}>#</th>
                    <th rowSpan={2} className="!text-left">UPT</th>
                    <th rowSpan={2}>Matra</th>
                    <th colSpan={3}>Peserta</th>
                    <th colSpan={3}>Lulusan</th>
                    <th rowSpan={2}>Status</th>
                  </tr>
                  <tr>
                    <th>Target</th>
                    <th>Realisasi</th>
                    <th>%</th>
                    <th>Target</th>
                    <th>Realisasi</th>
                    <th>%</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUpts.map((u, i) => {
                    const isOpen = expanded === u.uptId
                    return (
                      <Fragment key={u.uptId}>
                        <tr
                          className={clsx('cursor-pointer transition-colors', isOpen ? 'bg-navy-50/70' : 'hover:bg-navy-50/40')}
                          onClick={() => setExpanded(isOpen ? null : u.uptId)}
                        >
                          <td className="!px-2 !text-center">
                            <span className="inline-flex items-center gap-1 text-navy-400">
                              <IconChevronDown className={clsx('h-4 w-4 text-navy-300 transition-transform', isOpen && 'rotate-180')} />
                              {i + 1}
                            </span>
                          </td>
                          <td className="!pr-3">
                            <p className="font-bold text-navy-900 truncate">{u.uptCode}</p>
                            <p className="text-[11px] text-navy-400 truncate" title={u.uptName}>{u.uptName}</p>
                          </td>
                          <td className="!text-center">
                            <span className="badge-neutral" title={MATRA_LABEL[u.matra] || '-'}>{MATRA_SHORT[u.matra] || '-'}</span>
                          </td>
                          <td className="text-center tabular-nums">{fmtNum(u.totalTargetPeserta)}</td>
                          <td className="text-center font-bold text-navy-900 tabular-nums">{fmtNum(u.totalPeserta)}</td>
                          <td className={clsx('text-center font-extrabold tabular-nums', pctColor(u.totalPeserta, u.totalTargetPeserta))}>
                            {pctText(u.totalPeserta, u.totalTargetPeserta)}
                          </td>
                          <td className="text-center tabular-nums">{fmtNum(u.totalTargetLulusan)}</td>
                          <td className="text-center font-bold text-navy-900 tabular-nums">{fmtNum(u.totalLulusan)}</td>
                          <td className={clsx('text-center font-extrabold tabular-nums', pctColor(u.totalLulusan, u.totalTargetLulusan))}>
                            {pctText(u.totalLulusan, u.totalTargetLulusan)}
                          </td>
                          <td className="text-center">
                            {u.hasReported ? (
                              <span className="badge-success" title="Sudah lapor"><span className="badge-dot" /> Lapor</span>
                            ) : (
                              <span className="badge-danger" title="Belum lapor"><span className="badge-dot" /> Belum</span>
                            )}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr key={`${u.uptId}-detail`} className="bg-navy-50/30">
                            <td colSpan={10} className="!p-0">
                              <div className="px-3 sm:px-4 pb-4 pt-2">
                                <UptProgramMatrix u={u} month={month} periodLabel={periodLabel} year={year} />
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Kartu rekap: layar di bawah lg */}
            <div className="lg:hidden divide-y divide-surface-border">
              {filteredUpts.map((u, i) => {
                const isOpen = expanded === u.uptId
                return (
                  <Fragment key={u.uptId}>
                    <div
                      className={clsx('px-4 sm:px-5 py-4 cursor-pointer transition-colors', isOpen ? 'bg-navy-50/60' : 'hover:bg-navy-50/40')}
                      onClick={() => setExpanded(isOpen ? null : u.uptId)}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-5 shrink-0 text-right text-[11px] font-bold text-navy-300">{i + 1}</span>
                        <IconChevronDown className={clsx('h-4 w-4 shrink-0 text-navy-300 transition-transform', isOpen && 'rotate-180')} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-bold text-navy-900 truncate">{u.uptCode}</p>
                          <p className="text-[11px] text-navy-400 truncate">{u.uptName}</p>
                        </div>
                        <span className="badge-neutral shrink-0">{MATRA_SHORT[u.matra] || '-'}</span>
                        {u.hasReported ? (
                          <span className="badge-success shrink-0"><span className="badge-dot" /> Lapor</span>
                        ) : (
                          <span className="badge-danger shrink-0"><span className="badge-dot" /> Belum</span>
                        )}
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                        <div className="rounded-lg bg-navy-50/60 px-2.5 py-1.5">
                          <p className="text-[9px] font-bold uppercase tracking-wide text-navy-400">Target Peserta</p>
                          <p className="text-[13px] font-bold text-navy-800 tabular-nums">{fmtNum(u.totalTargetPeserta)}</p>
                        </div>
                        <div className="rounded-lg bg-navy-50/60 px-2.5 py-1.5">
                          <p className="text-[9px] font-bold uppercase tracking-wide text-navy-400">Real. Peserta</p>
                          <p className="text-[13px] font-bold text-navy-900 tabular-nums">{fmtNum(u.totalPeserta)}</p>
                        </div>
                        <div className="rounded-lg bg-navy-50/60 px-2.5 py-1.5">
                          <p className="text-[9px] font-bold uppercase tracking-wide text-navy-400">% Peserta</p>
                          <p className={clsx('text-[13px] font-extrabold tabular-nums', pctColor(u.totalPeserta, u.totalTargetPeserta))}>
                            {pctText(u.totalPeserta, u.totalTargetPeserta)}
                          </p>
                        </div>
                        <div className="rounded-lg bg-navy-50/60 px-2.5 py-1.5">
                          <p className="text-[9px] font-bold uppercase tracking-wide text-navy-400">Target Lulusan</p>
                          <p className="text-[13px] font-bold text-navy-800 tabular-nums">{fmtNum(u.totalTargetLulusan)}</p>
                        </div>
                        <div className="rounded-lg bg-navy-50/60 px-2.5 py-1.5">
                          <p className="text-[9px] font-bold uppercase tracking-wide text-navy-400">Real. Lulusan</p>
                          <p className="text-[13px] font-bold text-navy-900 tabular-nums">{fmtNum(u.totalLulusan)}</p>
                        </div>
                        <div className="rounded-lg bg-navy-50/60 px-2.5 py-1.5">
                          <p className="text-[9px] font-bold uppercase tracking-wide text-navy-400">% Lulusan</p>
                          <p className={clsx('text-[13px] font-extrabold tabular-nums', pctColor(u.totalLulusan, u.totalTargetLulusan))}>
                            {pctText(u.totalLulusan, u.totalTargetLulusan)}
                          </p>
                        </div>
                      </div>
                    </div>
                    {isOpen && (
                      <div className="bg-navy-50/30 px-3 pb-4 pt-1 sm:px-4">
                        <UptProgramMatrix u={u} month={month} periodLabel={periodLabel} year={year} />
                      </div>
                    )}
                  </Fragment>
                )
              })}
            </div>
          </>
        ) : (
          <EmptyState
            icon={<IconFileText className="h-6 w-6" />}
            title="Tidak ada UPT"
            desc="Tidak ada UPT yang cocok dengan filter yang dipilih."
          />
        )}
      </div>
    </div>
  )
}
