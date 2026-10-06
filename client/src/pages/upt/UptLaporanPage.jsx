import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import api, { apiError } from '../../lib/api'
import { StatCard, EmptyState, SkeletonRows, Alert } from '../../components/ui'
import {
  IconFileText, IconDownload, IconTarget, IconPeople, IconGraduation, IconChevronDown,
} from '../../components/icons'
import logoBpsdm from '../../assets/logo-bpsdm.png'
import { MONTHS, yearOptions, fmtNum } from '../../utils/format'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import ExcelJS from 'exceljs'
import clsx from 'clsx'

const NAVY = [15, 23, 42]
const NAVY_SOFT = [71, 85, 105]
const GOLD = [245, 158, 11]

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
  let temp = ''
  let letter = ''
  let idx = colIndex
  while (idx > 0) {
    temp = (idx - 1) % 26
    letter = String.fromCharCode(65 + temp) + letter
    idx = (idx - temp - 1) / 26
  }
  return letter
}

/** Ekspor laporan UPT ke Excel (.xlsx) dengan rumus (Formulas). */
async function exportExcel(upt, { periodLabel, year, periodMode, activeMonths, monthFrom, monthTo, singleMonth }) {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet(`Laporan_${year}`)

  worksheet.views = [{ showGridLines: true }]

  // Title rows
  const title1 = worksheet.addRow(['KEMENTERIAN PERHUBUNGAN'])
  const title2 = worksheet.addRow(['BADAN PENGEMBANGAN SUMBER DAYA MANUSIA PERHUBUNGAN'])
  const title3 = worksheet.addRow([`LAPORAN REALISASI PK & CAPAIAN TARGET (${periodLabel.replace(/_/g, ' ').toUpperCase()})`])
  const title4 = worksheet.addRow([`Nama UPT: ${upt.uptName} (${upt.uptCode}) | Tahun Anggaran: ${year}`])
  worksheet.addRow([])

  title1.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF0F172A' } }
  title2.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } }
  title3.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF0F172A' } }
  title4.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF475569' } }

  // Jika Single Month
  if (periodMode === 'single') {
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
    const parentRowsIndices = []

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
        if ([8, 9, 15, 16].includes(colNumber)) {
          cell.numFmt = '0%'
        } else if (colNumber > 2) {
          cell.numFmt = '#,##0'
        }
      })
      currentRow++

      // Rincian diklat (sinkron dengan tampilan web)
      for (const d of p.diklatDetails || []) {
        const dRow = worksheet.addRow([
          '', `  • ${d.name}`,
          d.targetPeserta || 0, d.targetPeserta || 0, d.pesertaL || 0, d.pesertaP || 0,
          { formula: `=SUM(E${currentRow}:F${currentRow})` },
          { formula: `=IF(C${currentRow}>0, G${currentRow}/C${currentRow}, 0)` },
          { formula: `=IF(D${currentRow}>0, G${currentRow}/D${currentRow}, 0)` },
          d.targetLulusan || 0, d.targetLulusan || 0, d.lulusanL || 0, d.lulusanP || 0,
          { formula: `=SUM(L${currentRow}:M${currentRow})` },
          { formula: `=IF(J${currentRow}>0, N${currentRow}/J${currentRow}, 0)` },
          { formula: `=IF(K${currentRow}>0, N${currentRow}/K${currentRow}, 0)` },
        ])
        dRow.font = { name: 'Calibri', size: 8.5, italic: true, color: { argb: 'FF334155' } }
        dRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F7FF' } }
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          }
          cell.alignment = { horizontal: colNumber <= 2 ? 'left' : 'center', vertical: 'middle' }
          if ([8, 9, 15, 16].includes(colNumber)) {
            cell.numFmt = '0%'
          } else if (colNumber > 2) {
            cell.numFmt = '#,##0'
          }
        })
        currentRow++
      }
    })

    // Total Akumulasi
    const endRow = currentRow - 1
    const totalRowValues = [
      '', 'TOTAL AKUMULASI',
      { formula: parentRowsIndices.length ? `=${parentRowsIndices.map((r) => `C${r}`).join('+')}` : `=SUM(C9:C${endRow})` },
      { formula: parentRowsIndices.length ? `=${parentRowsIndices.map((r) => `D${r}`).join('+')}` : `=SUM(D9:D${endRow})` },
      { formula: parentRowsIndices.length ? `=${parentRowsIndices.map((r) => `E${r}`).join('+')}` : `=SUM(E9:E${endRow})` },
      { formula: parentRowsIndices.length ? `=${parentRowsIndices.map((r) => `F${r}`).join('+')}` : `=SUM(F9:F${endRow})` },
      { formula: `=SUM(E${currentRow}:F${currentRow})` },
      { formula: `=IF(C${currentRow}>0, G${currentRow}/C${currentRow}, 0)` },
      { formula: `=IF(D${currentRow}>0, G${currentRow}/D${currentRow}, 0)` },
      { formula: parentRowsIndices.length ? `=${parentRowsIndices.map((r) => `J${r}`).join('+')}` : `=SUM(J9:J${endRow})` },
      { formula: parentRowsIndices.length ? `=${parentRowsIndices.map((r) => `K${r}`).join('+')}` : `=SUM(K9:K${endRow})` },
      { formula: parentRowsIndices.length ? `=${parentRowsIndices.map((r) => `L${r}`).join('+')}` : `=SUM(L9:L${endRow})` },
      { formula: parentRowsIndices.length ? `=${parentRowsIndices.map((r) => `M${r}`).join('+')}` : `=SUM(M9:M${endRow})` },
      { formula: `=SUM(L${currentRow}:M${currentRow})` },
      { formula: `=IF(J${currentRow}>0, N${currentRow}/J${currentRow}, 0)` },
      { formula: `=IF(K${currentRow}>0, N${currentRow}/K${currentRow}, 0)` },
    ]

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
      if ([8, 9, 15, 16].includes(colNumber)) {
        cell.numFmt = '0%'
      } else if (colNumber > 2) {
        cell.numFmt = '#,##0'
      }
    })

    worksheet.getColumn(1).width = 5
    worksheet.getColumn(2).width = 38
    for (let c = 3; c <= 16; c++) worksheet.getColumn(c).width = 11

  } else {
    // Matrix Mode (All Months atau Range)
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

    // Final Total Block
    const finalBlockTitle = periodMode === 'range'
      ? `TOTAL PERIODE (${MONTHS[monthFrom - 1].slice(0, 3).toUpperCase()} - ${MONTHS[monthTo - 1].slice(0, 3).toUpperCase()})`
      : 'TOTAL 1 TAHUN'

    row6Values.push(finalBlockTitle, '', '', '', '', '', '', '', '', '')
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

        // PESERTA
        rowValues.push(bm.targetPeserta || 0)
        rowValues.push(bm.pesertaL || 0)
        rowValues.push(bm.pesertaP || 0)
        rowValues.push({ formula: `=SUM(${colL}${currentRow}:${colP}${currentRow})` })
        rowValues.push({ formula: `=IF(${cTgtP}${currentRow}>0, ${cTotP}${currentRow}/${cTgtP}${currentRow}, 0)` })

        // LULUSAN
        rowValues.push(bm.targetLulusan || 0)
        rowValues.push(bm.lulusanL || 0)
        rowValues.push(bm.lulusanP || 0)
        rowValues.push({ formula: `=SUM(${colLulL}${currentRow}:${colLulP}${currentRow})` })
        rowValues.push({ formula: `=IF(${cTgtL}${currentRow}>0, ${cTotL}${currentRow}/${cTgtL}${currentRow}, 0)` })
      })

      // Final Total Block Formulas
      const finalStartIdx = 2 + activeMonths.length * 10
      const cFinalTgtP = getColLetter(finalStartIdx + 1)
      const cFinalPL = getColLetter(finalStartIdx + 2)
      const cFinalPP = getColLetter(finalStartIdx + 3)
      const cFinalTotP = getColLetter(finalStartIdx + 4)

      rowValues.push({ formula: `=${pTgtCols.join('+')}` })
      rowValues.push({ formula: `=${pLCols.join('+')}` })
      rowValues.push({ formula: `=${pPCols.join('+')}` })
      rowValues.push({ formula: `=SUM(${cFinalPL}${currentRow}:${cFinalPP}${currentRow})` })
      rowValues.push({ formula: `=IF(${cFinalTgtP}${currentRow}>0, ${cFinalTotP}${currentRow}/${cFinalTgtP}${currentRow}, 0)` })

      const cFinalTgtL = getColLetter(finalStartIdx + 6)
      const cFinalLL = getColLetter(finalStartIdx + 7)
      const cFinalLP = getColLetter(finalStartIdx + 8)
      const cFinalTotL = getColLetter(finalStartIdx + 9)

      rowValues.push({ formula: `=${lTgtCols.join('+')}` })
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
          if (offset === 0) {
            cell.numFmt = '0%'
          } else {
            cell.numFmt = '#,##0'
          }
        }
      })
      currentRow++

      // Rincian diklat (sinkron dengan tampilan web)
      for (const d of p.diklatDetails || []) {
        const dRowVals = ['', `  • ${d.name}`]
        activeMonths.forEach((mNum, mIdx) => {
          const bm = d.byMonth?.[mNum] || { pesertaL: 0, pesertaP: 0, lulusanL: 0, lulusanP: 0 }
          const colL = getColLetter(2 + mIdx * 10 + 2)
          const colP = getColLetter(2 + mIdx * 10 + 3)
          const cTotP = getColLetter(2 + mIdx * 10 + 4)
          const colLulL = getColLetter(2 + mIdx * 10 + 7)
          const colLulP = getColLetter(2 + mIdx * 10 + 8)
          const cTotL = getColLetter(2 + mIdx * 10 + 9)
          dRowVals.push(
            0, bm.pesertaL || 0, bm.pesertaP || 0,
            { formula: `=SUM(${colL}${currentRow}:${colP}${currentRow})` },
            0,
            0, bm.lulusanL || 0, bm.lulusanP || 0,
            { formula: `=SUM(${colLulL}${currentRow}:${colLulP}${currentRow})` },
            0
          )
        })
        const fStart = 2 + activeMonths.length * 10
        // Total blok = jumlah bulan (konsisten dengan tampilan web)
        let dTotP = 0, dTotL = 0, dTotPL = 0, dTotPP = 0, dTotLL = 0, dTotLP = 0
        for (const mNum of activeMonths) {
          const bm = d.byMonth?.[mNum] || {}
          dTotPL += bm.pesertaL || 0; dTotPP += bm.pesertaP || 0
          dTotLL += bm.lulusanL || 0; dTotLP += bm.lulusanP || 0
        }
        dTotP = dTotPL + dTotPP; dTotL = dTotLL + dTotLP
        dRowVals.push(
          d.targetPeserta || 0, dTotPL, dTotPP, dTotP,
          { formula: `=IF(${getColLetter(fStart + 1)}${currentRow}>0,${getColLetter(fStart + 4)}${currentRow}/${getColLetter(fStart + 1)}${currentRow},0)` },
          d.targetLulusan || 0, dTotLL, dTotLP, dTotL,
          { formula: `=IF(${getColLetter(fStart + 6)}${currentRow}>0,${getColLetter(fStart + 9)}${currentRow}/${getColLetter(fStart + 6)}${currentRow},0)` }
        )
        const dRow = worksheet.addRow(dRowVals)
        dRow.font = { name: 'Calibri', size: 8.5, italic: true, color: { argb: 'FF334155' } }
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
            cell.numFmt = offset === 0 ? '0%' : '#,##0'
          }
        })
        currentRow++
      }
    })

    // TOTAL AKUMULASI Row (Bottom Row)
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
          const parentCells = parentRowsIndices.map((rIdx) => `${colLetter}${rIdx}`)
          totalRowValues.push({ formula: `=${parentCells.join('+')}` })
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
        if (offset === 0) {
          cell.numFmt = '0%'
        } else {
          cell.numFmt = '#,##0'
        }
      }
    })

    worksheet.getColumn(1).width = 5
    worksheet.getColumn(2).width = 38
    for (let c = 3; c <= totalColsCount; c++) {
      worksheet.getColumn(c).width = 11
    }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `Laporan_Realisasi_${upt.uptCode}_${periodLabel}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** Ekspor laporan UPT ke PDF (berkop surat, landscape A4). */
function exportPdf(upt, { periodLabel, year, periodMode, monthFrom, monthTo, singleMonth }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 36
  let y = 42

  // Kop surat
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...NAVY)
  doc.text('KEMENTERIAN PERHUBUNGAN', pageW / 2, y, { align: 'center' })
  y += 14
  doc.setFontSize(10)
  doc.text('BADAN PENGEMBANGAN SUMBER DAYA MANUSIA PERHUBUNGAN', pageW / 2, y, { align: 'center' })
  y += 18
  doc.setFontSize(12)
  doc.text('LAPORAN REALISASI PK & CAPAIAN TARGET', pageW / 2, y, { align: 'center' })

  // Info UPT
  y += 18
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...NAVY_SOFT)
  const displayPeriod = periodMode === 'range'
    ? `Rentang ${MONTHS[monthFrom - 1]} s/d ${MONTHS[monthTo - 1]} ${year}`
    : periodMode === 'single'
    ? `Bulan ${MONTHS[singleMonth - 1]} ${year}`
    : `Full 1 Tahun ${year}`

  doc.text(`Nama UPT : ${upt.uptName} (${upt.uptCode})  |  Periode : ${displayPeriod}  |  Tahun : ${year}`, pageW / 2, y, { align: 'center' })
  y += 10

  const colPeriodLabel = periodMode === 'range' ? 'PERIODE' : 'BULANAN'

  // Tabel program (16 kolom) + rincian diklat sinkron tampilan web
  const body = upt.programs.flatMap((p, i) => {
    const rows = [[
      { content: String(i + 1), styles: { halign: 'center' } },
      {
        content: p.isParent ? p.programName : `   - ${p.programName}`,
        styles: { halign: 'left', fontStyle: p.isParent ? 'bold' : 'normal' },
      },
      // PESERTA
      { content: fmtNum(p.targetPeserta), styles: { halign: 'center' } },
      { content: fmtNum(p.targetPesertaTahunan || p.targetPeserta), styles: { halign: 'center' } },
      { content: fmtNum(p.pesertaL), styles: { halign: 'center' } },
      { content: fmtNum(p.pesertaP), styles: { halign: 'center' } },
      { content: fmtNum(p.pesertaL + p.pesertaP), styles: { halign: 'center', fontStyle: 'bold' } },
      { content: pctText(p.pesertaL + p.pesertaP, p.targetPeserta), styles: { halign: 'center', fontStyle: 'bold' } },
      { content: pctText(p.pesertaL + p.pesertaP, p.targetPesertaTahunan || p.targetPeserta), styles: { halign: 'center', fontStyle: 'bold' } },
      // LULUSAN
      { content: fmtNum(p.targetLulusan), styles: { halign: 'center' } },
      { content: fmtNum(p.targetLulusanTahunan || p.targetLulusan), styles: { halign: 'center' } },
      { content: fmtNum(p.lulusanL), styles: { halign: 'center' } },
      { content: fmtNum(p.lulusanP), styles: { halign: 'center' } },
      { content: fmtNum(p.lulusanL + p.lulusanP), styles: { halign: 'center', fontStyle: 'bold' } },
      { content: pctText(p.lulusanL + p.lulusanP, p.targetLulusan), styles: { halign: 'center', fontStyle: 'bold' } },
      { content: pctText(p.lulusanL + p.lulusanP, p.targetLulusanTahunan || p.targetLulusan), styles: { halign: 'center', fontStyle: 'bold' } },
    ]]
    for (const d of p.diklatDetails || []) {
      const dpTot = (d.pesertaL || 0) + (d.pesertaP || 0)
      const dlTot = (d.lulusanL || 0) + (d.lulusanP || 0)
      rows.push([
        { content: '', styles: { halign: 'center' } },
        { content: `      • ${d.name}`, styles: { halign: 'left' } },
        { content: fmtNum(d.targetPeserta), styles: { halign: 'center' } },
        { content: fmtNum(d.targetPeserta), styles: { halign: 'center' } },
        { content: fmtNum(d.pesertaL), styles: { halign: 'center' } },
        { content: fmtNum(d.pesertaP), styles: { halign: 'center' } },
        { content: fmtNum(dpTot), styles: { halign: 'center', fontStyle: 'bold' } },
        { content: pctText(dpTot, d.targetPeserta), styles: { halign: 'center', fontStyle: 'bold' } },
        { content: pctText(dpTot, d.targetPeserta), styles: { halign: 'center', fontStyle: 'bold' } },
        { content: fmtNum(d.targetLulusan), styles: { halign: 'center' } },
        { content: fmtNum(d.targetLulusan), styles: { halign: 'center' } },
        { content: fmtNum(d.lulusanL), styles: { halign: 'center' } },
        { content: fmtNum(d.lulusanP), styles: { halign: 'center' } },
        { content: fmtNum(dlTot), styles: { halign: 'center', fontStyle: 'bold' } },
        { content: pctText(dlTot, d.targetLulusan), styles: { halign: 'center', fontStyle: 'bold' } },
        { content: pctText(dlTot, d.targetLulusan), styles: { halign: 'center', fontStyle: 'bold' } },
      ])
    }
    return rows
  })

  autoTable(doc, {
    startY: y + 8,
    margin: { left: margin, right: margin, bottom: 60 },
    head: [
      [
        { content: 'NO', rowSpan: 3, styles: { halign: 'center', valign: 'middle' } },
        { content: 'PROGRAM DIKLAT', rowSpan: 3, styles: { halign: 'left', valign: 'middle' } },
        { content: 'PESERTA', colSpan: 7, styles: { halign: 'center' } },
        { content: 'LULUSAN', colSpan: 7, styles: { halign: 'center' } },
      ],
      [
        { content: 'TARGET PK', colSpan: 2, styles: { halign: 'center' } },
        { content: 'REALISASI', colSpan: 3, styles: { halign: 'center' } },
        { content: 'CAPAIAN (%)', colSpan: 2, styles: { halign: 'center' } },
        { content: 'TARGET PK', colSpan: 2, styles: { halign: 'center' } },
        { content: 'REALISASI', colSpan: 3, styles: { halign: 'center' } },
        { content: 'CAPAIAN (%)', colSpan: 2, styles: { halign: 'center' } },
      ],
      [
        { content: colPeriodLabel, styles: { halign: 'center' } },
        { content: 'TAHUNAN', styles: { halign: 'center' } },
        { content: 'L', styles: { halign: 'center' } },
        { content: 'P', styles: { halign: 'center' } },
        { content: 'TOTAL', styles: { halign: 'center' } },
        { content: `${colPeriodLabel} %`, styles: { halign: 'center' } },
        { content: 'TAHUN %', styles: { halign: 'center' } },
        { content: colPeriodLabel, styles: { halign: 'center' } },
        { content: 'TAHUNAN', styles: { halign: 'center' } },
        { content: 'L', styles: { halign: 'center' } },
        { content: 'P', styles: { halign: 'center' } },
        { content: 'TOTAL', styles: { halign: 'center' } },
        { content: `${colPeriodLabel} %`, styles: { halign: 'center' } },
        { content: 'TAHUN %', styles: { halign: 'center' } },
      ]
    ],
    body,
    foot: [[
      { content: 'TOTAL AKUMULASI', colSpan: 2, styles: { halign: 'center', fontStyle: 'bold', fillColor: [248, 250, 252], textColor: NAVY } },
      // PESERTA
      { content: fmtNum(upt.totalTargetPeserta), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
      { content: fmtNum(upt.totalTargetPesertaTahunan || upt.totalTargetPeserta), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
      { content: fmtNum(upt.programs.filter((p) => p.isParent).reduce((s, p) => s + p.pesertaL, 0)), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
      { content: fmtNum(upt.programs.filter((p) => p.isParent).reduce((s, p) => s + p.pesertaP, 0)), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
      { content: fmtNum(upt.totalPeserta), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
      { content: pctText(upt.totalPeserta, upt.totalTargetPeserta), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
      { content: pctText(upt.totalPeserta, upt.totalTargetPesertaTahunan || upt.totalTargetPeserta), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
      // LULUSAN
      { content: fmtNum(upt.totalTargetLulusan), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
      { content: fmtNum(upt.totalTargetLulusanTahunan || upt.totalTargetLulusan), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
      { content: fmtNum(upt.programs.filter((p) => p.isParent).reduce((s, p) => s + p.lulusanL, 0)), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
      { content: fmtNum(upt.programs.filter((p) => p.isParent).reduce((s, p) => s + p.lulusanP, 0)), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
      { content: fmtNum(upt.totalLulusan), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
      { content: pctText(upt.totalLulusan, upt.totalTargetLulusan), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
      { content: pctText(upt.totalLulusan, upt.totalTargetLulusanTahunan || upt.totalTargetLulusan), styles: { halign: 'center', fontStyle: 'bold', fillColor: GOLD, textColor: NAVY } },
    ]],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 6.5,
      cellPadding: 3.5,
      lineColor: [203, 213, 225],
      lineWidth: 0.4,
      textColor: NAVY,
      valign: 'middle',
    },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 6.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  })

  // Tanda tangan
  const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : y
  const sigY = Math.min(finalY + 40, doc.internal.pageSize.getHeight() - 40)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...NAVY)
  doc.text('Petugas Pelaporan,', pageW - margin - 120, sigY, { align: 'left' })
  doc.text(`( ${upt.uptCode} )`, pageW - margin - 120, sigY + 42)

  const a = document.createElement('a')
  a.href = doc.output('bloburl')
  a.download = `Laporan_${upt.uptCode}_${periodLabel}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export default function UptLaporanPage() {
  const { user } = useAuth()
  const [year, setYear] = useState(new Date().getFullYear())
  const [periodMode, setPeriodMode] = useState('all') // 'all' | 'single' | 'range'
  const [singleMonth, setSingleMonth] = useState(new Date().getMonth() + 1)
  const [monthFrom, setMonthFrom] = useState(1)
  const [monthTo, setMonthTo] = useState(new Date().getMonth() + 1 || 1)

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exportingExcel, setExportingExcel] = useState(false)
  const matrixScrollRef = useRef(null)
  // Lebar 1 blok bulan = 8 kolom @58px + 2 kolom % @64px = 592
  const BLOCK_W = 592
  const scrollMatrixToBlock = (blockIdx) => {
    const el = matrixScrollRef.current
    if (!el) return
    el.scrollTo({ left: Math.max(0, blockIdx * BLOCK_W), behavior: 'smooth' })
  }
  const scrollMatrixByPage = (dir) => {
    const el = matrixScrollRef.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = { year }
      if (periodMode === 'single') {
        params.month = singleMonth
      } else if (periodMode === 'range') {
        params.monthFrom = monthFrom
        params.monthTo = monthTo
      }
      const { data: res } = await api.get('/reports/my', { params })
      setData(res)
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [year, periodMode, singleMonth, monthFrom, monthTo])

  useEffect(() => {
    load()
  }, [load])

  const upt = data?.upt

  // Derived month range list for matrix view
  const activeMonths = periodMode === 'range'
    ? Array.from({ length: Math.max(1, monthTo - monthFrom + 1) }, (_, i) => monthFrom + i)
    : Array.from({ length: 12 }, (_, i) => i + 1)

  const periodBadge = periodMode === 'all'
    ? `📊 Rekap Full 1 Tahun ${year}`
    : periodMode === 'range'
    ? `🗓️ Rentang ${MONTHS[monthFrom - 1]} - ${MONTHS[monthTo - 1]} ${year}`
    : `📅 Bulan ${MONTHS[singleMonth - 1]} ${year}`

  const periodFileLabel = periodMode === 'all'
    ? `Full_1_Tahun_${year}`
    : periodMode === 'range'
    ? `Rentang_${MONTHS[monthFrom - 1]}_${MONTHS[monthTo - 1]}_${year}`
    : `Bulan_${MONTHS[singleMonth - 1]}_${year}`

  const handleExportPdf = () => {
    if (!upt) return
    exportPdf(upt, {
      periodLabel: periodFileLabel,
      year,
      periodMode,
      monthFrom,
      monthTo,
      singleMonth,
    })
  }

  const handleExportExcel = async () => {
    if (!upt) return
    setExportingExcel(true)
    try {
      await exportExcel(upt, {
        periodLabel: periodFileLabel,
        year,
        periodMode,
        activeMonths,
        monthFrom,
        monthTo,
        singleMonth,
      })
    } catch (err) {
      console.error(err)
    } finally {
      setExportingExcel(false)
    }
  }

  const targetPesertaPeriode = upt?.totalTargetPeserta ?? 0
  const targetPesertaTahunan = upt?.totalTargetPesertaTahunan ?? targetPesertaPeriode
  const targetLulusanPeriode = upt?.totalTargetLulusan ?? 0
  const targetLulusanTahunan = upt?.totalTargetLulusanTahunan ?? targetLulusanPeriode

  const statPeriodLabel = periodMode === 'all'
    ? 'Thn'
    : periodMode === 'range'
    ? `${MONTHS[monthFrom - 1].slice(0, 3)}-${MONTHS[monthTo - 1].slice(0, 3)}`
    : 'Bln'

  return (
    <div className="animate-fadeUp space-y-6">
      {/* Banner Header Berwarna & Compact */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-navy-950 via-navy-900 to-navy-950 px-5 py-4 text-white shadow-card border border-navy-800">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-48 w-48 rounded-full bg-gold-500/10 blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 p-1.5 shadow-inner border border-white/15 backdrop-blur-md" style={{ width: '40px', height: '40px' }}>
              <img src={logoBpsdm} alt="Logo BPSDMP" className="h-full w-full object-contain max-h-7 max-w-7" onError={(e) => e.target.style.display = 'none'} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-black text-white tracking-tight">
                  Laporan Realisasi PK
                </h1>
                <span className="rounded-full text-[10px] font-extrabold px-2.5 py-0.5 border bg-gold-500/20 text-gold-300 border-gold-500/30">
                  {periodBadge}
                </span>
              </div>
              <p className="text-xs text-navy-200 mt-0.5 max-w-xl">
                <strong className="text-white">{user?.upt?.name || 'UPT'}</strong> — Rekapitulasi target &amp; capaian realisasi bulanan.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Custom Select Tahun */}
            <div className="relative">
              <select
                id="laporan-upt-year"
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

            {/* Custom Select Mode Periode */}
            <div className="relative">
              <select
                id="laporan-upt-period-mode"
                className="appearance-none cursor-pointer bg-white/10 hover:bg-white/15 border border-white/20 text-white font-extrabold text-xs rounded-xl py-2 pl-3 pr-8 shadow-sm backdrop-blur-md transition-all focus:outline-none focus:ring-2 focus:ring-gold-400"
                value={periodMode}
                onChange={(e) => setPeriodMode(e.target.value)}
              >
                <option value="all" className="bg-navy-900 text-white font-bold py-1">Full 1 Tahun</option>
                <option value="single" className="bg-navy-900 text-white font-bold py-1">Per Bulan (Single)</option>
                <option value="range" className="bg-navy-900 text-white font-bold py-1">Rentang Bulan (Range)</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-gold-300">
                <IconChevronDown className="h-3.5 w-3.5" />
              </div>
            </div>

            {/* Mode Single Month */}
            {periodMode === 'single' && (
              <div className="relative animate-fadeIn">
                <select
                  id="laporan-upt-single-month"
                  className="appearance-none cursor-pointer bg-white/10 hover:bg-white/15 border border-white/20 text-white font-extrabold text-xs rounded-xl py-2 pl-3 pr-8 shadow-sm backdrop-blur-md transition-all focus:outline-none focus:ring-2 focus:ring-gold-400"
                  value={singleMonth}
                  onChange={(e) => setSingleMonth(Number(e.target.value))}
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1} className="bg-navy-900 text-white font-bold py-1">{m}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-gold-300">
                  <IconChevronDown className="h-3.5 w-3.5" />
                </div>
              </div>
            )}

            {/* Mode Range: Dari Bulan s/d Sampai Bulan */}
            {periodMode === 'range' && (
              <div className="flex items-center gap-1 animate-fadeIn bg-white/5 border border-white/15 rounded-xl px-2 py-1">
                <span className="text-[11px] font-bold text-gold-300">Dari:</span>
                <div className="relative">
                  <select
                    id="laporan-upt-month-from"
                    className="appearance-none cursor-pointer bg-white/10 hover:bg-white/20 border border-white/20 text-white font-extrabold text-xs rounded-lg py-1 pl-2 pr-6 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-gold-400"
                    value={monthFrom}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      setMonthFrom(v)
                      if (v > monthTo) setMonthTo(v)
                    }}
                  >
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1} className="bg-navy-900 text-white font-bold py-1">{m.slice(0, 3)}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5 text-gold-300">
                    <IconChevronDown className="h-3 w-3" />
                  </div>
                </div>

                <span className="text-[11px] font-bold text-gold-300">s/d</span>

                <div className="relative">
                  <select
                    id="laporan-upt-month-to"
                    className="appearance-none cursor-pointer bg-white/10 hover:bg-white/20 border border-white/20 text-white font-extrabold text-xs rounded-lg py-1 pl-2 pr-6 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-gold-400"
                    value={monthTo}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      setMonthTo(v)
                      if (v < monthFrom) setMonthFrom(v)
                    }}
                  >
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1} className="bg-navy-900 text-white font-bold py-1">{m.slice(0, 3)}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5 text-gold-300">
                    <IconChevronDown className="h-3 w-3" />
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              className="btn-gold text-xs !py-2 !px-3.5 rounded-xl shadow-md"
              onClick={handleExportPdf}
              disabled={!upt || loading}
              title="Unduh Laporan PDF"
            >
              <IconDownload className="h-4 w-4" /> PDF
            </button>

            <button
              type="button"
              className="btn-primary !bg-emerald-600 hover:!bg-emerald-700 text-white text-xs !py-2 !px-3.5 rounded-xl shadow-md"
              onClick={handleExportExcel}
              disabled={!upt || loading || exportingExcel}
              title="Unduh Excel (.xlsx) Ber-Rumus"
            >
              <IconFileText className="h-4 w-4" /> {exportingExcel ? 'Memproses...' : 'Excel (.xlsx)'}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="mb-4"><Alert type="error">{error}</Alert></div>}

      {upt?.isSingleTarget && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50/60 px-4 py-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-extrabold text-sky-900">🎯 Target PK satu kali input:</span>
          <span className="font-bold tabular-nums">{fmtNum(upt.totalTargetPesertaTahunan)} peserta · {fmtNum(upt.totalTargetLulusanTahunan)} lulusan</span>
          {(upt.diklats || []).length > 0 && <span className="text-slate-500">· {(upt.diklats || []).length} rincian diklat sinkron</span>}
          <span className="ml-auto text-[11px] text-slate-500">Induk otomatis = jumlah turunan</span>
        </div>
      )}

      {/* Ringkasan 6 StatCard Simetris */}
      <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          icon={<IconTarget className="h-4 w-4" />}
          label={`Target Peserta (${statPeriodLabel})`}
          value={fmtNum(targetPesertaPeriode)}
          sub={periodMode === 'all' ? 'Akumulasi 1 Tahun' : `Tahunan: ${fmtNum(targetPesertaTahunan)}`}
          tone="navy"
        />
        <StatCard
          icon={<IconPeople className="h-4 w-4" />}
          label="Realisasi Peserta"
          value={fmtNum(upt?.totalPeserta ?? 0)}
          sub={periodMode === 'all' ? 'Total 1 Tahun' : periodMode === 'range' ? `Realisasi ${MONTHS[monthFrom - 1].slice(0, 3)} - ${MONTHS[monthTo - 1].slice(0, 3)}` : 'Realisasi Bulan ini'}
          tone="sky"
          delay={30}
        />
        <StatCard
          icon={<IconTarget className="h-4 w-4" />}
          label="Capaian Peserta"
          value={pctText(upt?.totalPeserta ?? 0, targetPesertaPeriode)}
          sub={periodMode === 'all' ? '% vs Target Tahunan' : '% vs Target Periode'}
          tone="emerald"
          delay={60}
        />
        <StatCard
          icon={<IconTarget className="h-4 w-4" />}
          label={`Target Lulusan (${statPeriodLabel})`}
          value={fmtNum(targetLulusanPeriode)}
          sub={periodMode === 'all' ? 'Akumulasi 1 Tahun' : `Tahunan: ${fmtNum(targetLulusanTahunan)}`}
          tone="gold"
          delay={90}
        />
        <StatCard
          icon={<IconGraduation className="h-4 w-4" />}
          label="Realisasi Lulusan"
          value={fmtNum(upt?.totalLulusan ?? 0)}
          sub={periodMode === 'all' ? 'Total 1 Tahun' : periodMode === 'range' ? `Realisasi ${MONTHS[monthFrom - 1].slice(0, 3)} - ${MONTHS[monthTo - 1].slice(0, 3)}` : 'Realisasi Bulan ini'}
          tone="sky"
          delay={120}
        />
        <StatCard
          icon={<IconGraduation className="h-4 w-4" />}
          label="Capaian Lulusan"
          value={pctText(upt?.totalLulusan ?? 0, targetLulusanPeriode)}
          sub={periodMode === 'all' ? '% vs Target Tahunan' : '% vs Target Periode'}
          tone="emerald"
          delay={150}
        />
      </div>

      {/* Tabel Laporan — Matrix (Scroll Menyamping) jika Semua Bulan atau Range, atau Fit Single-Month */}
      <div className="card overflow-hidden border border-slate-300 shadow-card">
        {loading ? (
          <SkeletonRows rows={8} />
        ) : error ? (
          <EmptyState
            icon={<IconFileText className="h-6 w-6" />}
            title="Gagal memuat laporan"
            desc="Periksa koneksi lalu muat ulang."
          />
        ) : upt?.programs?.length ? (
          periodMode === 'single' ? (
            /* TABEL SINGLE MONTH (16 KOLOM FIT 100%) */
            <div className="w-full overflow-x-auto matrix-scroll">
              <table className="border-collapse border border-slate-300 text-slate-800 font-sans matrix-table" style={{ width: '100%', minWidth: 940 }}>
                <colgroup>
                  <col style={{ width: '2.5%' }} />
                  <col style={{ width: '21.5%' }} />
                  {/* PESERTA */}
                  <col style={{ width: '5.5%' }} />
                  <col style={{ width: '5.5%' }} />
                  <col style={{ width: '4%' }} />
                  <col style={{ width: '4%' }} />
                  <col style={{ width: '5%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '7%' }} />
                  {/* LULUSAN */}
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
                    <th colSpan={2} className="text-center border border-slate-400 text-gold-300 bg-navy-900/90 py-1">TARGET PK</th>
                    <th colSpan={3} className="text-center border border-slate-400 bg-navy-900/90 py-1">REALISASI</th>
                    <th colSpan={2} className="text-center border border-slate-400 border-r-2 border-r-slate-500 text-emerald-300 bg-navy-900/90 py-1">CAPAIAN (%)</th>
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
                  {upt.programs.map((p, i) => {
                    const isParentRow = p.isParent
                    const tpBln = p.targetPeserta || 0
                    const tpThn = p.targetPesertaTahunan || tpBln
                    const tlBln = p.targetLulusan || 0
                    const tlThn = p.targetLulusanTahunan || tlBln

                    const pTot = p.pesertaL + p.pesertaP
                    const lTot = p.lulusanL + p.lulusanP

                    // Induk tanpa turunan (mis. Pelatihan Teknis) boleh punya rincian diklat langsung
                    const diklatRows = p.diklatDetails || []
                    return (
                      <React.Fragment key={p.programId}>
                      <tr
                        className={`transition-colors ${
                          isParentRow
                            ? 'bg-navy-50/80 row-parent font-extrabold text-navy-950 border-b-2 border-b-slate-300'
                            : i % 2 === 0
                            ? 'bg-white row-child-even border-b border-slate-200'
                            : 'bg-slate-50/70 row-child-odd border-b border-slate-200'
                        }`}
                      >
                        <td className="text-center border border-slate-300 px-1 py-1.5 text-navy-500 text-[10px] font-bold">{i + 1}</td>
                        <td className="border border-slate-300 px-2 py-1.5">
                          {isParentRow ? (
                            <div>
                              <span className="font-extrabold text-navy-950 text-[11px] leading-tight block">{p.programName}</span>
                              {diklatRows.length > 0 && (
                                <p className="text-[8.5px] text-slate-400 font-semibold mt-0.5">{diklatRows.length} rincian diklat ↓</p>
                              )}
                            </div>
                          ) : (
                            <div className="pl-2">
                              <span className="inline-flex items-center gap-1 font-semibold text-navy-800 text-[10.5px] leading-tight">
                                <span className="text-navy-400">↳</span>{p.programName}
                              </span>
                              {diklatRows.length > 0 && (
                                <p className="text-[8.5px] text-slate-400 font-semibold mt-0.5">{diklatRows.length} rincian diklat ↓</p>
                              )}
                            </div>
                          )}
                        </td>
                        {/* PESERTA */}
                        <td className="text-center border border-slate-300 px-1 py-1.5 tabular-nums text-[10.5px] font-medium text-navy-700">{fmtNum(tpBln)}</td>
                        <td className="text-center border border-slate-300 px-1 py-1.5 tabular-nums text-[10.5px] font-bold text-navy-900">{fmtNum(tpThn)}</td>
                        <td className="text-center border border-slate-300 px-1 py-1.5 tabular-nums text-[10.5px] text-navy-600">{fmtNum(p.pesertaL)}</td>
                        <td className="text-center border border-slate-300 px-1 py-1.5 tabular-nums text-[10.5px] text-navy-600">{fmtNum(p.pesertaP)}</td>
                        <td className="text-center border border-slate-300 px-1 py-1.5 font-black text-navy-950 tabular-nums text-[11px] bg-slate-100/50">{fmtNum(pTot)}</td>
                        <td className={clsx('text-center border border-slate-300 px-1 py-1.5 text-[10.5px] tabular-nums', pctColor(pTot, tpBln))}>
                          {pctText(pTot, tpBln)}
                        </td>
                        <td className={clsx('text-center border border-slate-300 border-r-2 border-r-slate-400 px-1 py-1.5 text-[10.5px] tabular-nums', pctColor(pTot, tpThn))}>
                          {pctText(pTot, tpThn)}
                        </td>

                        {/* LULUSAN */}
                        <td className="text-center border border-slate-300 px-1 py-1.5 tabular-nums text-[10.5px] font-medium text-navy-700">{fmtNum(tlBln)}</td>
                        <td className="text-center border border-slate-300 px-1 py-1.5 tabular-nums text-[10.5px] font-bold text-navy-900">{fmtNum(tlThn)}</td>
                        <td className="text-center border border-slate-300 px-1 py-1.5 tabular-nums text-[10.5px] text-navy-600">{fmtNum(p.lulusanL)}</td>
                        <td className="text-center border border-slate-300 px-1 py-1.5 tabular-nums text-[10.5px] text-navy-600">{fmtNum(p.lulusanP)}</td>
                        <td className="text-center border border-slate-300 px-1 py-1.5 font-black text-navy-950 tabular-nums text-[11px] bg-slate-100/50">{fmtNum(lTot)}</td>
                        <td className={clsx('text-center border border-slate-300 px-1 py-1.5 text-[10.5px] tabular-nums', pctColor(lTot, tlBln))}>
                          {pctText(lTot, tlBln)}
                        </td>
                        <td className={clsx('text-center border border-slate-300 px-1 py-1.5 text-[10.5px] tabular-nums', pctColor(lTot, tlThn))}>
                          {pctText(lTot, tlThn)}
                        </td>
                      </tr>
                      {/* Rincian diklat di bawah program turunan */}
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
                            <td className={clsx('text-center border border-slate-300 px-1 py-1 text-[10px] tabular-nums', pctColor(dpTot, d.targetPeserta))}>
                              {pctText(dpTot, d.targetPeserta)}
                            </td>
                            <td className={clsx('text-center border border-slate-300 border-r-2 border-r-slate-400 px-1 py-1 text-[10px] tabular-nums', pctColor(dpTot, d.targetPeserta))}>
                              {pctText(dpTot, d.targetPeserta)}
                            </td>
                            <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[10px] text-slate-500">{fmtNum(d.targetLulusan)}</td>
                            <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[10px] text-slate-500">{fmtNum(d.targetLulusan)}</td>
                            <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[10px]">{fmtNum(d.lulusanL)}</td>
                            <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[10px]">{fmtNum(d.lulusanP)}</td>
                            <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[10px] font-bold">{fmtNum(dlTot)}</td>
                            <td className={clsx('text-center border border-slate-300 px-1 py-1 text-[10px] tabular-nums', pctColor(dlTot, d.targetLulusan))}>
                              {pctText(dlTot, d.targetLulusan)}
                            </td>
                            <td className={clsx('text-center border border-slate-300 px-1 py-1 text-[10px] tabular-nums', pctColor(dlTot, d.targetLulusan))}>
                              {pctText(dlTot, d.targetLulusan)}
                            </td>
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
                    {/* PESERTA */}
                    <td className="text-center border border-slate-400 px-1 py-2 font-black text-gold-300 tabular-nums text-[10.5px]">{fmtNum(targetPesertaPeriode)}</td>
                    <td className="text-center border border-slate-400 px-1 py-2 font-black text-gold-400 tabular-nums text-[10.5px]">{fmtNum(targetPesertaTahunan)}</td>
                    <td className="text-center border border-slate-400 px-1 py-2 font-bold text-navy-200 tabular-nums text-[10.5px]">{fmtNum(upt.programs.filter((p) => p.isParent).reduce((s, p) => s + p.pesertaL, 0))}</td>
                    <td className="text-center border border-slate-400 px-1 py-2 font-bold text-navy-200 tabular-nums text-[10.5px]">{fmtNum(upt.programs.filter((p) => p.isParent).reduce((s, p) => s + p.pesertaP, 0))}</td>
                    <td className="text-center border border-slate-400 px-1 py-2 font-black text-white tabular-nums text-[11px] bg-navy-900">{fmtNum(upt.totalPeserta)}</td>
                    <td className="text-center border border-slate-400 px-1 py-2 font-black text-emerald-400 tabular-nums text-[10.5px]">{pctText(upt.totalPeserta, targetPesertaPeriode)}</td>
                    <td className="text-center border border-slate-400 border-r-2 border-r-slate-500 px-1 py-2 font-black text-emerald-400 tabular-nums text-[10.5px]">{pctText(upt.totalPeserta, targetPesertaTahunan)}</td>
                    {/* LULUSAN */}
                    <td className="text-center border border-slate-400 px-1 py-2 font-black text-gold-300 tabular-nums text-[10.5px]">{fmtNum(targetLulusanPeriode)}</td>
                    <td className="text-center border border-slate-400 px-1 py-2 font-black text-gold-400 tabular-nums text-[10.5px]">{fmtNum(targetLulusanTahunan)}</td>
                    <td className="text-center border border-slate-400 px-1 py-2 font-bold text-navy-200 tabular-nums text-[10.5px]">{fmtNum(upt.programs.filter((p) => p.isParent).reduce((s, p) => s + p.lulusanL, 0))}</td>
                    <td className="text-center border border-slate-400 px-1 py-2 font-bold text-navy-200 tabular-nums text-[10.5px]">{fmtNum(upt.programs.filter((p) => p.isParent).reduce((s, p) => s + p.lulusanP, 0))}</td>
                    <td className="text-center border border-slate-400 px-1 py-2 font-black text-white tabular-nums text-[11px] bg-navy-900">{fmtNum(upt.totalLulusan)}</td>
                    <td className="text-center border border-slate-400 px-1 py-2 font-black text-emerald-400 tabular-nums text-[10.5px]">{pctText(upt.totalLulusan, targetLulusanPeriode)}</td>
                    <td className="text-center border border-slate-400 px-1 py-2 font-black text-emerald-400 tabular-nums text-[10.5px]">{pctText(upt.totalLulusan, targetLulusanTahunan)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <>
            {/* Toolbar navigasi matriks: lompat ke bulan + geser */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border-b border-slate-200 overflow-x-auto matrix-scroll">
              <span className="text-[9px] font-extrabold uppercase tracking-wider text-navy-400 whitespace-nowrap shrink-0">Lompat ke:</span>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => scrollMatrixByPage(-1)} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-black text-navy-700" title="Geser ke kiri">‹</button>
                {activeMonths.map((mNum, idx) => (
                  <button
                    key={mNum}
                    type="button"
                    onClick={() => scrollMatrixToBlock(idx)}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-[9px] font-bold text-navy-700 whitespace-nowrap"
                  >
                    {MONTHS[mNum - 1].slice(0, 3)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => scrollMatrixToBlock(activeMonths.length)}
                  className="rounded border border-gold-500/50 bg-gold-500/15 px-2 py-1 text-[9px] font-black text-gold-700 whitespace-nowrap"
                >
                  Total
                </button>
                <button type="button" onClick={() => scrollMatrixByPage(1)} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-black text-navy-700" title="Geser ke kanan">›</button>
              </div>
              <span className="ml-auto text-[9px] text-slate-400 whitespace-nowrap hidden md:block shrink-0">Geser tabel ke kanan untuk melihat semua bulan →</span>
            </div>
            <div ref={matrixScrollRef} className="w-full overflow-x-auto relative matrix-scroll scroll-smooth">
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
                  {/* Each active month + 1 total block = (activeMonths.length + 1) * 10 columns */}
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
                    <th colSpan={10} className="total-block text-center border border-slate-400 bg-amber-600 px-2 py-1.5 text-white">
                      {periodMode === 'range'
                        ? `TOTAL PERIODE (${MONTHS[monthFrom - 1].slice(0, 3).toUpperCase()} - ${MONTHS[monthTo - 1].slice(0, 3).toUpperCase()})`
                        : 'TOTAL 1 TAHUN'}
                    </th>
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
                  {upt.programs.map((p, i) => {
                    const isParentRow = p.isParent
                    const stickyBgClass = isParentRow ? 'bg-slate-200' : i % 2 === 0 ? 'bg-white' : 'bg-slate-100'

                    // Aggregates across active months for this program row
                    const sumRange = (key) => activeMonths.reduce((s, m) => s + (p.byMonth?.[m]?.[key] || 0), 0)
                    const rangeTargetPeserta = sumRange('targetPeserta')
                    const rangePesertaL = sumRange('pesertaL')
                    const rangePesertaP = sumRange('pesertaP')
                    const rangePesertaTot = rangePesertaL + rangePesertaP

                    const rangeTargetLulusan = sumRange('targetLulusan')
                    const rangeLulusanL = sumRange('lulusanL')
                    const rangeLulusanP = sumRange('lulusanP')
                    const rangeLulusanTot = rangeLulusanL + rangeLulusanP

                    // Induk tanpa turunan (mis. Pelatihan Teknis) boleh punya rincian diklat langsung
                    const diklatRows = p.diklatDetails || []
                    return (
                      <React.Fragment key={p.programId}>
                      <tr
                        className={`transition-colors ${
                          isParentRow
                            ? 'bg-slate-200 row-parent font-extrabold text-navy-950 border-b-2 border-b-slate-400'
                            : i % 2 === 0
                            ? 'bg-white row-child-even border-b border-slate-200'
                            : 'bg-slate-100 row-child-odd border-b border-slate-200'
                        }`}
                      >
                        <td className={`text-center border border-slate-300 px-1 py-1.5 text-navy-600 text-[9px] font-bold sticky z-20 ${stickyBgClass}`} style={{ left: 0, width: 42, minWidth: 42, maxWidth: 42 }}>{i + 1}</td>
                        <td className={`border border-slate-300 px-2 py-1.5 sticky z-20 border-r-2 border-r-slate-400 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.2)] cell-program ${stickyBgClass} ${isParentRow ? '!border-l-4 !border-l-gold-500' : ''}`} style={{ left: 42, width: 240, minWidth: 240, maxWidth: 240 }}>
                          {isParentRow ? (
                            <div>
                              <span className="font-extrabold text-navy-950 text-[9px] leading-tight block">{p.programName}</span>
                              {diklatRows.length > 0 && (
                                <p className="text-[7.5px] text-slate-400 font-semibold mt-0.5">{diklatRows.length} rincian diklat ↓</p>
                              )}
                            </div>
                          ) : (
                            <div className="pl-2">
                              <span className="inline-flex items-center gap-1 font-semibold text-navy-800 text-[9px] leading-tight">
                                <span className="text-navy-400">↳</span>{p.programName}
                              </span>
                              {diklatRows.length > 0 && (
                                <p className="text-[7.5px] text-slate-400 font-semibold mt-0.5">{diklatRows.length} rincian diklat ↓</p>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Active Months Data Columns */}
                        {activeMonths.map((mNum) => {
                          const bm = p.byMonth?.[mNum] || { targetPeserta: 0, pesertaL: 0, pesertaP: 0, targetLulusan: 0, lulusanL: 0, lulusanP: 0 }
                          const pTot = bm.pesertaL + bm.pesertaP
                          const lTot = bm.lulusanL + bm.lulusanP
                          return (
                            <React.Fragment key={mNum}>
                              {/* PESERTA */}
                              <td className="text-center border border-slate-300 px-1 py-1.5 tabular-nums text-[9px] text-navy-700">{fmtNum(bm.targetPeserta)}</td>
                              <td className="text-center border border-slate-300 px-1 py-1.5 tabular-nums text-[9px] text-navy-600">{fmtNum(bm.pesertaL)}</td>
                              <td className="text-center border border-slate-300 px-1 py-1.5 tabular-nums text-[9px] text-navy-600">{fmtNum(bm.pesertaP)}</td>
                              <td className="text-center border border-slate-300 px-1 py-1.5 font-bold text-navy-950 tabular-nums text-[9px] bg-slate-100/50">{fmtNum(pTot)}</td>
                              <td className={clsx('text-center border border-slate-300 px-1 py-1.5 text-[9px] tabular-nums', pctColor(pTot, bm.targetPeserta))}>
                                {pctText(pTot, bm.targetPeserta)}
                              </td>

                              {/* LULUSAN */}
                              <td className="text-center border border-slate-300 px-1 py-1.5 tabular-nums text-[9px] text-navy-700">{fmtNum(bm.targetLulusan)}</td>
                              <td className="text-center border border-slate-300 px-1 py-1.5 tabular-nums text-[9px] text-navy-600">{fmtNum(bm.lulusanL)}</td>
                              <td className="text-center border border-slate-300 px-1 py-1.5 tabular-nums text-[9px] text-navy-600">{fmtNum(bm.lulusanP)}</td>
                              <td className="text-center border border-slate-300 px-1 py-1.5 font-bold text-navy-950 tabular-nums text-[9px] bg-slate-100/50">{fmtNum(lTot)}</td>
                              <td className={clsx('text-center border border-slate-300 border-r-2 border-r-slate-500 px-1 py-1.5 text-[9px] tabular-nums', pctColor(lTot, bm.targetLulusan))}>
                                {pctText(lTot, bm.targetLulusan)}
                              </td>
                            </React.Fragment>
                          )
                        })}

                        {/* TOTAL BLOK (PERIODE / 1 TAHUN) */}
                        <React.Fragment>
                          {/* PESERTA TOTAL */}
                          <td className="text-center border border-slate-300 px-1 py-1.5 font-bold text-navy-900 tabular-nums text-[9px] bg-amber-50/70">{fmtNum(rangeTargetPeserta)}</td>
                          <td className="text-center border border-slate-300 px-1 py-1.5 text-navy-700 tabular-nums text-[9px] bg-amber-50/70">{fmtNum(rangePesertaL)}</td>
                          <td className="text-center border border-slate-300 px-1 py-1.5 text-navy-700 tabular-nums text-[9px] bg-amber-50/70">{fmtNum(rangePesertaP)}</td>
                          <td className="text-center border border-slate-300 px-1 py-1.5 font-black text-navy-950 tabular-nums text-[9px] bg-amber-100/80">{fmtNum(rangePesertaTot)}</td>
                          <td className={clsx('text-center border border-slate-300 px-1 py-1.5 text-[9px] tabular-nums bg-amber-50/70', pctColor(rangePesertaTot, rangeTargetPeserta))}>
                            {pctText(rangePesertaTot, rangeTargetPeserta)}
                          </td>

                          {/* LULUSAN TOTAL */}
                          <td className="text-center border border-slate-300 px-1 py-1.5 font-bold text-navy-900 tabular-nums text-[9px] bg-amber-50/70">{fmtNum(rangeTargetLulusan)}</td>
                          <td className="text-center border border-slate-300 px-1 py-1.5 text-navy-700 tabular-nums text-[9px] bg-amber-50/70">{fmtNum(rangeLulusanL)}</td>
                          <td className="text-center border border-slate-300 px-1 py-1.5 text-navy-700 tabular-nums text-[9px] bg-amber-50/70">{fmtNum(rangeLulusanP)}</td>
                          <td className="text-center border border-slate-300 px-1 py-1.5 font-black text-navy-950 tabular-nums text-[9px] bg-amber-100/80">{fmtNum(rangeLulusanTot)}</td>
                          <td className={clsx('text-center border border-slate-300 px-1 py-1.5 text-[9px] tabular-nums bg-amber-50/70', pctColor(rangeLulusanTot, rangeTargetLulusan))}>
                            {pctText(rangeLulusanTot, rangeTargetLulusan)}
                          </td>
                        </React.Fragment>
                      </tr>
                      {/* Rincian diklat di bawah program turunan */}
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
                            <td className="border border-slate-300 border-r-2 border-r-slate-400 px-2 py-1 sticky z-20 bg-sky-50/80" style={{ left: 42, width: 240, minWidth: 240, maxWidth: 240 }}>
                              <span className="inline-flex items-center gap-1 text-slate-600 text-[9px] font-semibold pl-4 leading-tight">
                                <span className="text-sky-400 font-black">•</span>{d.name}
                              </span>
                            </td>
                            {activeMonths.map((mNum) => {
                              const bm = d.byMonth?.[mNum] || { pesertaL: 0, pesertaP: 0, lulusanL: 0, lulusanP: 0 }
                              const pTot = (bm.pesertaL || 0) + (bm.pesertaP || 0)
                              const lTot = (bm.lulusanL || 0) + (bm.lulusanP || 0)
                              return (
                                <React.Fragment key={mNum}>
                                  <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[9px] text-slate-500 font-medium">{fmtNum(d.targetPeserta)}</td>
                                  <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[9px]">{fmtNum(bm.pesertaL)}</td>
                                  <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[9px]">{fmtNum(bm.pesertaP)}</td>
                                  <td className="text-center border border-slate-300 px-1 py-1 font-bold tabular-nums text-[9px]">{fmtNum(pTot)}</td>
                                  <td className={clsx('text-center border border-slate-300 px-1 py-1 text-[9px] tabular-nums', pctColor(pTot, d.targetPeserta))}>{pctText(pTot, d.targetPeserta)}</td>
                                  <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[9px] text-slate-500 font-medium">{fmtNum(d.targetLulusan)}</td>
                                  <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[9px]">{fmtNum(bm.lulusanL)}</td>
                                  <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[9px]">{fmtNum(bm.lulusanP)}</td>
                                  <td className="text-center border border-slate-300 px-1 py-1 font-bold tabular-nums text-[9px]">{fmtNum(lTot)}</td>
                                  <td className={clsx('text-center border border-slate-300 border-r-2 border-r-slate-500 px-1 py-1 text-[9px] tabular-nums', pctColor(lTot, d.targetLulusan))}>{pctText(lTot, d.targetLulusan)}</td>
                                </React.Fragment>
                              )
                            })}
                            <td className="text-center border border-slate-300 px-1 py-1 font-bold tabular-nums text-[9px] bg-amber-50/70">{fmtNum(d.targetPeserta)}</td>
                            <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[9px] bg-amber-50/70">{fmtNum(dRange.pesertaL)}</td>
                            <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[9px] bg-amber-50/70">{fmtNum(dRange.pesertaP)}</td>
                            <td className="text-center border border-slate-300 px-1 py-1 font-black tabular-nums text-[9px] bg-amber-100/80">{fmtNum(dPesertaTot)}</td>
                            <td className={clsx('text-center border border-slate-300 px-1 py-1 text-[9px] tabular-nums bg-amber-50/70', pctColor(dPesertaTot, d.targetPeserta))}>
                              {pctText(dPesertaTot, d.targetPeserta)}
                            </td>
                            <td className="text-center border border-slate-300 px-1 py-1 font-bold tabular-nums text-[9px] bg-amber-50/70">{fmtNum(d.targetLulusan)}</td>
                            <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[9px] bg-amber-50/70">{fmtNum(dRange.lulusanL)}</td>
                            <td className="text-center border border-slate-300 px-1 py-1 tabular-nums text-[9px] bg-amber-50/70">{fmtNum(dRange.lulusanP)}</td>
                            <td className="text-center border border-slate-300 px-1 py-1 font-black tabular-nums text-[9px] bg-amber-100/80">{fmtNum(dLulusanTot)}</td>
                            <td className={clsx('text-center border border-slate-300 px-1 py-1 text-[9px] tabular-nums bg-amber-50/70', pctColor(dLulusanTot, d.targetLulusan))}>
                              {pctText(dLulusanTot, d.targetLulusan)}
                            </td>
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
                    {/* Active Months Footers */}
                    {activeMonths.map((mNum) => {
                      const parentProgs = upt.programs.filter((p) => p.isParent)
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
                          {/* PESERTA FOOTER */}
                          <td className="text-center border border-slate-400 px-1 py-2 font-bold text-gold-300 tabular-nums text-[10px]">{fmtNum(tPeserta)}</td>
                          <td className="text-center border border-slate-400 px-1 py-2 font-medium text-navy-200 tabular-nums text-[10px]">{fmtNum(pL)}</td>
                          <td className="text-center border border-slate-400 px-1 py-2 font-medium text-navy-200 tabular-nums text-[10px]">{fmtNum(pP)}</td>
                          <td className="text-center border border-slate-400 px-1 py-2 font-black text-white tabular-nums text-[10.5px] bg-navy-900">{fmtNum(pTot)}</td>
                          <td className="text-center border border-slate-400 px-1 py-2 font-black text-emerald-400 tabular-nums text-[10px]">{pctText(pTot, tPeserta)}</td>

                          {/* LULUSAN FOOTER */}
                          <td className="text-center border border-slate-400 px-1 py-2 font-bold text-gold-300 tabular-nums text-[10px]">{fmtNum(tLulusan)}</td>
                          <td className="text-center border border-slate-400 px-1 py-2 font-medium text-navy-200 tabular-nums text-[10px]">{fmtNum(lL)}</td>
                          <td className="text-center border border-slate-400 px-1 py-2 font-medium text-navy-200 tabular-nums text-[10px]">{fmtNum(lP)}</td>
                          <td className="text-center border border-slate-400 px-1 py-2 font-black text-white tabular-nums text-[10.5px] bg-navy-900">{fmtNum(lTot)}</td>
                          <td className="text-center border border-slate-400 border-r-2 border-r-slate-500 px-1 py-2 font-black text-emerald-400 tabular-nums text-[10px]">{pctText(lTot, tLulusan)}</td>
                        </React.Fragment>
                      )
                    })}

                    {/* Total Blok Footer */}
                    {(() => {
                      const parentProgs = upt.programs.filter((p) => p.isParent)
                      const sumAllActive = (key) => parentProgs.reduce((s, p) => s + activeMonths.reduce((sm, m) => sm + (p.byMonth?.[m]?.[key] || 0), 0), 0)
                      const totTgtPeserta = sumAllActive('targetPeserta')
                      const totPL = sumAllActive('pesertaL')
                      const totPP = sumAllActive('pesertaP')
                      const totPTot = totPL + totPP

                      const totTgtLulusan = sumAllActive('targetLulusan')
                      const totLL = sumAllActive('lulusanL')
                      const totLP = sumAllActive('lulusanP')
                      const totLTot = totLL + totLP

                      return (
                        <React.Fragment>
                          {/* PESERTA FOOTER */}
                          <td className="text-center border border-slate-400 px-1 py-2 font-black text-gold-300 tabular-nums text-[10.5px] bg-navy-900">{fmtNum(totTgtPeserta)}</td>
                          <td className="text-center border border-slate-400 px-1 py-2 font-bold text-navy-200 tabular-nums text-[10.5px] bg-navy-900">{fmtNum(totPL)}</td>
                          <td className="text-center border border-slate-400 px-1 py-2 font-bold text-navy-200 tabular-nums text-[10.5px] bg-navy-900">{fmtNum(totPP)}</td>
                          <td className="text-center border border-slate-400 px-1 py-2 font-black text-white tabular-nums text-[11px] bg-amber-600">{fmtNum(totPTot)}</td>
                          <td className="text-center border border-slate-400 px-1 py-2 font-black text-emerald-400 tabular-nums text-[10.5px] bg-navy-900">{pctText(totPTot, totTgtPeserta)}</td>

                          {/* LULUSAN FOOTER */}
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
            </>
          )
        ) : (
          <EmptyState
            icon={<IconFileText className="h-6 w-6" />}
            title="Belum ada laporan"
            desc="Belum ada data realisasi pada periode yang dipilih."
          />
        )}
      </div>
    </div>
  )
}
