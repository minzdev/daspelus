import React, { useState } from 'react'
import { fmtNum, MONTHS_SHORT } from '../utils/format'
import { EmptyState, SkeletonRows } from './ui'
import {
  IconGraduation, IconEye, IconFileText, IconCheck, IconChevronDown,
} from './icons'

/** Daftar nama taruna per blok (bulan / total) lengkap dengan kategori serap. */
function tarunaNameList(qData) {
  if (!qData) return []
  const out = []
  const push = (arr, cat) => {
    for (const t of arr || []) out.push({ name: t.namaTaruna, instansi: t.instansiBekerja, cat })
  }
  push(qData.pns, 'PNS')
  push(qData.ppnpn, 'PPNPN')
  push(qData.bumn, 'BUMN')
  push(qData.swasta, 'Swasta')
  push(qData.belumBekerja, 'Belum')
  return out
}

function TarunaNamesCell({ qData }) {
  const list = tarunaNameList(qData)
  if (list.length === 0) return <span className="text-slate-300">-</span>
  return (
    <ol className="space-y-0.5 text-left">
      {list.map((t, i) => (
        <li key={i} className="text-[10px] leading-snug text-slate-700">
          <span className="font-bold text-slate-400 mr-1">{i + 1}.</span>
          <span className="font-semibold text-navy-900">{t.name}</span>
          <span className="ml-1 rounded bg-slate-100 border border-slate-200 px-1 text-[8.5px] font-bold text-slate-500 whitespace-nowrap">{t.cat}</span>
        </li>
      ))}
    </ol>
  )
}

export default function AbsorptionReportView({
  data,
  year,
  month,
  quarter, // LEGACY: dukung pemanggil lama (triwulan)
  loading = false,
  showTarunaNamesDefault = true,
}) {
  const [showTarunaNames, setShowTarunaNames] = useState(showTarunaNamesDefault)
  const [tarunaModalData, setTarunaModalData] = useState(null) // { title, list: [] }

  // Mode tampil ditentukan utamanya oleh pilihan filter (bukan flag payload),
  // agar "pilih Juli" selalu menampilkan Juli saja.
  const monthSelected = month !== undefined && month !== null && month !== 'all'
  const quarterSelected = !monthSelected && quarter !== undefined && quarter !== null && quarter !== 'all'
  const isAllQuarters = !monthSelected && !quarterSelected
  const matrix = data?.matrix || []
  const monthsData = data?.months || {}
  const summary = data?.summary || {
    totalPns: 0, totalPpnpn: 0, totalBumn: 0, totalSwasta: 0,
    totalBelumBekerja: 0, totalBekerja: 0, totalLulusan: 0, pctAbsorption: 0,
  }

  const openTarunaListModal = (title, list) => {
    if (!list || list.length === 0) return
    setTarunaModalData({ title, list })
  }

  if (loading) {
    return <SkeletonRows rows={8} />
  }

  if (!matrix || matrix.length === 0) {
    return (
      <EmptyState
        icon={<IconGraduation className="h-7 w-7" />}
        title="Belum Ada Data Penyerapan"
        desc={`Belum ada data taruna penyerapan yang dilaporkan pada periode ini.`}
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* View Toolbar Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          {!isAllQuarters && (
            <button
              type="button"
              className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 shadow-sm ${
                showTarunaNames
                  ? 'bg-navy-900 text-white border-navy-950 shadow-navy-900/20'
                  : 'bg-white text-navy-800 border-slate-300 hover:bg-slate-50'
              }`}
              onClick={() => setShowTarunaNames(!showTarunaNames)}
            >
              <IconEye className="h-3.5 w-3.5" />
              <span>{showTarunaNames ? 'Sembunyikan Nama Taruna' : 'Tampilkan Nama Taruna'}</span>
            </button>
          )}

          {isAllQuarters && (
            <span className="text-[11px] font-bold text-navy-700 bg-navy-50 border border-navy-200 px-3 py-1 rounded-xl">
              Mode Matriks 12 Bulan (Geser / Scroll ke Samping untuk melihat Jan s/d Des)
            </span>
          )}
        </div>

        <div className="text-[11px] text-slate-500 font-medium">
          Total: <strong className="text-navy-950">{fmtNum(summary.totalLulusan)} Lulusan</strong> ({fmtNum(summary.totalBekerja)} Terserap · {summary.pctAbsorption}%)
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 1. KASUS SEMUA BULAN (MENYAMPING / HORIZONTAL SCROLL JAN - DES) */}
      {/* ------------------------------------------------------------- */}
      {isAllQuarters ? (
        <div className="w-full overflow-x-auto rounded-xl border border-slate-300 shadow-sm custom-scrollbar">
          <table className="border-collapse border border-slate-300 text-slate-800 text-[10.5px]" style={{ minWidth: 3000 }}>
            <thead>
              {/* Row 1: Header Bulan */}
              <tr className="bg-navy-950 text-white font-extrabold uppercase text-[10px]">
                <th
                  rowSpan={2}
                  className="sticky left-0 z-20 bg-navy-950 text-center border-r border-navy-800 px-2.5 py-2 w-10 shadow-[2px_0_4px_rgba(0,0,0,0.15)]"
                  style={{ left: 0, width: '42px', minWidth: '42px' }}
                >
                  NO
                </th>
                <th
                  rowSpan={2}
                  className="sticky z-20 bg-navy-950 text-left border-r border-navy-800 px-3 py-2 min-w-[220px] shadow-[4px_0_6px_rgba(0,0,0,0.15)]"
                  style={{ left: '42px', width: '220px', minWidth: '220px' }}
                >
                  PROGRAM STUDI
                </th>

                {/* 12 Bulan Headers */}
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                  <th
                    key={m}
                    colSpan={9}
                    className={`text-center border-r border-navy-800 py-1.5 ${
                      m % 2 === 1 ? 'bg-navy-900 text-gold-300' : 'bg-navy-950 text-amber-200'
                    }`}
                  >
                    {MONTHS_SHORT[m - 1].toUpperCase()}
                  </th>
                ))}

                {/* Total Kumulatif Tahunan */}
                <th colSpan={9} className="text-center bg-emerald-900 text-emerald-200 py-1.5 border-l-2 border-emerald-500">
                  TOTAL TAHUNAN ({year})
                </th>
              </tr>

              {/* Row 2: Sub-columns per Bulan */}
              <tr className="bg-slate-100 text-slate-800 font-black text-[9px] border-b border-slate-300">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((idx) => {
                  const isCumulative = idx === 13
                  const bgH = isCumulative ? 'bg-emerald-50 text-emerald-950' : idx % 2 === 1 ? 'bg-slate-100' : 'bg-amber-50/50'
                  return (
                    <React.Fragment key={idx}>
                      <th className={`text-center border border-slate-300 px-1.5 py-1 ${bgH} min-w-[150px]`}>NAMA TARUNA</th>
                      <th className={`text-center border border-slate-300 px-1.5 py-1 ${bgH}`}>PNS</th>
                      <th className={`text-center border border-slate-300 px-1.5 py-1 ${bgH}`}>PPNPN</th>
                      <th className={`text-center border border-slate-300 px-1.5 py-1 ${bgH}`}>BUMN</th>
                      <th className={`text-center border border-slate-300 px-1.5 py-1 ${bgH}`}>SWASTA</th>
                      <th className={`text-center border border-slate-300 px-1.5 py-1 text-amber-700 ${bgH}`}>BELUM</th>
                      <th className={`text-center border border-slate-300 px-1.5 py-1 font-bold ${bgH}`}>BEKERJA</th>
                      <th className={`text-center border border-slate-300 px-1.5 py-1 font-bold ${bgH}`}>LULUSAN</th>
                      <th className={`text-center border-r border-slate-400 px-1.5 py-1 font-black text-emerald-700 ${bgH}`}>%</th>
                    </React.Fragment>
                  )
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {matrix.map((p, rowIdx) => {
                const zebraCls = rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'
                const zebraSticky = rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-100'

                // Ambil data per bulan untuk prodi ini
                const qList = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(
                  (m) => monthsData[m]?.rows?.find((r) => r.prodiId === p.prodiId) || {}
                )

                return (
                  <tr key={p.prodiId} className={`${zebraCls} hover:bg-amber-50/30 transition-colors`}>
                    {/* Sticky Left: No */}
                    <td
                      className={`sticky left-0 z-10 text-center border-r border-slate-300 font-bold text-slate-500 px-2 py-1.5 shadow-[2px_0_4px_rgba(0,0,0,0.06)] ${zebraSticky}`}
                      style={{ left: 0, width: '42px', minWidth: '42px' }}
                    >
                      {rowIdx + 1}
                    </td>

                    {/* Sticky Left: Nama Prodi */}
                    <td
                      className={`sticky z-10 border-r border-slate-300 px-3 py-1.5 font-extrabold text-navy-950 shadow-[4px_0_6px_rgba(0,0,0,0.06)] ${zebraSticky}`}
                      style={{ left: '42px', width: '220px', minWidth: '220px' }}
                    >
                      <span>{p.namaProdi}</span>
                      <span className="ml-1.5 text-[9.5px] font-semibold text-slate-400">({p.jenjang || 'D4'})</span>
                    </td>

                    {/* 12 Bulan Columns */}
                    {qList.map((qData, qIdx) => {
                      const mShort = MONTHS_SHORT[qIdx]
                      const hasData = (qData.totalLulusan || 0) > 0
                      return (
                        <React.Fragment key={qIdx}>
                          <td className="border border-slate-200 px-1.5 py-1.5 align-top min-w-[150px] max-w-[220px]">
                            <TarunaNamesCell qData={qData} />
                          </td>
                          <td
                            className={`text-center border border-slate-200 px-1 py-1.5 tabular-nums ${
                              qData.countPns ? 'font-bold text-blue-700 cursor-pointer hover:bg-blue-50' : 'text-slate-300'
                            }`}
                            onClick={() => qData.countPns && openTarunaListModal(`${p.namaProdi} - PNS (${mShort})`, qData.pns)}
                            title={qData.countPns ? 'Klik untuk melihat nama taruna' : ''}
                          >
                            {fmtNum(qData.countPns || 0)}
                          </td>
                          <td
                            className={`text-center border border-slate-200 px-1 py-1.5 tabular-nums ${
                              qData.countPpnpn ? 'font-bold text-indigo-700 cursor-pointer hover:bg-indigo-50' : 'text-slate-300'
                            }`}
                            onClick={() => qData.countPpnpn && openTarunaListModal(`${p.namaProdi} - PPNPN (${mShort})`, qData.ppnpn)}
                            title={qData.countPpnpn ? 'Klik untuk melihat nama taruna' : ''}
                          >
                            {fmtNum(qData.countPpnpn || 0)}
                          </td>
                          <td
                            className={`text-center border border-slate-200 px-1 py-1.5 tabular-nums ${
                              qData.countBumn ? 'font-bold text-emerald-700 cursor-pointer hover:bg-emerald-50' : 'text-slate-300'
                            }`}
                            onClick={() => qData.countBumn && openTarunaListModal(`${p.namaProdi} - BUMN/BUMD (${mShort})`, qData.bumn)}
                            title={qData.countBumn ? 'Klik untuk melihat nama taruna' : ''}
                          >
                            {fmtNum(qData.countBumn || 0)}
                          </td>
                          <td
                            className={`text-center border border-slate-200 px-1 py-1.5 tabular-nums ${
                              qData.countSwasta ? 'font-bold text-violet-700 cursor-pointer hover:bg-violet-50' : 'text-slate-300'
                            }`}
                            onClick={() => qData.countSwasta && openTarunaListModal(`${p.namaProdi} - Swasta (${mShort})`, qData.swasta)}
                            title={qData.countSwasta ? 'Klik untuk melihat nama taruna' : ''}
                          >
                            {fmtNum(qData.countSwasta || 0)}
                          </td>
                          <td
                            className={`text-center border border-slate-200 px-1 py-1.5 tabular-nums text-amber-700 ${
                              qData.countBelumBekerja ? 'font-bold cursor-pointer hover:bg-amber-50' : 'text-slate-300'
                            }`}
                            onClick={() => qData.countBelumBekerja && openTarunaListModal(`${p.namaProdi} - Belum Bekerja (${mShort})`, qData.belumBekerja)}
                            title={qData.countBelumBekerja ? 'Klik untuk melihat nama taruna' : ''}
                          >
                            {fmtNum(qData.countBelumBekerja || 0)}
                          </td>
                          <td className="text-center border border-slate-200 px-1 py-1.5 tabular-nums font-bold text-navy-900 bg-slate-50/50">
                            {fmtNum(qData.totalBekerja || 0)}
                          </td>
                          <td className="text-center border border-slate-200 px-1 py-1.5 tabular-nums font-bold text-navy-900 bg-slate-50/50">
                            {fmtNum(qData.totalLulusan || 0)}
                          </td>
                          <td className={`text-center border-r border-slate-300 px-1 py-1.5 tabular-nums font-extrabold ${
                            hasData ? 'text-emerald-700' : 'text-slate-300'
                          }`}>
                            {hasData ? `${qData.pct}%` : '-'}
                          </td>
                        </React.Fragment>
                      )
                    })}

                    {/* Total Kumulatif Tahunan — bisa diklik untuk melihat nama taruna */}
                    <td className="border border-slate-200 px-1.5 py-1.5 align-top bg-emerald-50/20 min-w-[150px] max-w-[220px]">
                      <TarunaNamesCell qData={p} />
                    </td>
                    <td
                      className={`text-center border border-slate-200 px-1 py-1.5 tabular-nums bg-emerald-50/20 ${
                        p.countPns ? 'font-bold text-blue-700 cursor-pointer hover:bg-blue-50' : 'text-slate-300'
                      }`}
                      onClick={() => p.countPns && openTarunaListModal(`${p.namaProdi} - PNS (Total Tahunan)`, p.pns)}
                      title={p.countPns ? 'Klik untuk melihat nama taruna' : ''}
                    >
                      {fmtNum(p.countPns)}
                    </td>
                    <td
                      className={`text-center border border-slate-200 px-1 py-1.5 tabular-nums bg-emerald-50/20 ${
                        p.countPpnpn ? 'font-bold text-indigo-700 cursor-pointer hover:bg-indigo-50' : 'text-slate-300'
                      }`}
                      onClick={() => p.countPpnpn && openTarunaListModal(`${p.namaProdi} - PPNPN (Total Tahunan)`, p.ppnpn)}
                      title={p.countPpnpn ? 'Klik untuk melihat nama taruna' : ''}
                    >
                      {fmtNum(p.countPpnpn)}
                    </td>
                    <td
                      className={`text-center border border-slate-200 px-1 py-1.5 tabular-nums bg-emerald-50/20 ${
                        p.countBumn ? 'font-bold text-emerald-700 cursor-pointer hover:bg-emerald-50' : 'text-slate-300'
                      }`}
                      onClick={() => p.countBumn && openTarunaListModal(`${p.namaProdi} - BUMN/BUMD (Total Tahunan)`, p.bumn)}
                      title={p.countBumn ? 'Klik untuk melihat nama taruna' : ''}
                    >
                      {fmtNum(p.countBumn)}
                    </td>
                    <td
                      className={`text-center border border-slate-200 px-1 py-1.5 tabular-nums bg-emerald-50/20 ${
                        p.countSwasta ? 'font-bold text-violet-700 cursor-pointer hover:bg-violet-50' : 'text-slate-300'
                      }`}
                      onClick={() => p.countSwasta && openTarunaListModal(`${p.namaProdi} - Swasta (Total Tahunan)`, p.swasta)}
                      title={p.countSwasta ? 'Klik untuk melihat nama taruna' : ''}
                    >
                      {fmtNum(p.countSwasta)}
                    </td>
                    <td
                      className={`text-center border border-slate-200 px-1 py-1.5 tabular-nums text-amber-700 bg-emerald-50/20 ${
                        p.countBelumBekerja ? 'font-bold cursor-pointer hover:bg-amber-50' : 'text-slate-300'
                      }`}
                      onClick={() => p.countBelumBekerja && openTarunaListModal(`${p.namaProdi} - Belum Bekerja (Total Tahunan)`, p.belumBekerja)}
                      title={p.countBelumBekerja ? 'Klik untuk melihat nama taruna' : ''}
                    >
                      {fmtNum(p.countBelumBekerja)}
                    </td>
                    <td className="text-center border border-slate-200 px-1 py-1.5 tabular-nums font-black text-navy-950 bg-emerald-100/40">
                      {fmtNum(p.totalBekerja)}
                    </td>
                    <td className="text-center border border-slate-200 px-1 py-1.5 tabular-nums font-black text-navy-950 bg-emerald-100/40">
                      {fmtNum(p.totalLulusan)}
                    </td>
                    <td className="text-center border-r border-slate-400 px-1 py-1.5 tabular-nums font-black text-emerald-800 bg-emerald-200/50">
                      {p.pct}%
                    </td>
                  </tr>
                )
              })}
            </tbody>

            <tfoot>
              <tr className="bg-navy-950 text-white font-black text-xs border-t-2 border-slate-500">
                <td
                  colSpan={2}
                  className="sticky left-0 z-20 bg-navy-950 px-3 py-2.5 text-center font-black uppercase text-[10px] tracking-wider border-r border-slate-600 shadow-[4px_0_6px_rgba(0,0,0,0.2)]"
                  style={{ left: 0, width: '262px', minWidth: '262px' }}
                >
                  TOTAL KESELURUHAN
                </td>

                {/* Totals per Bulan */}
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((q) => {
                  const qSum = monthsData[q]?.summary || {}
                  return (
                    <React.Fragment key={q}>
                      <td className="text-center border border-slate-700 px-1 py-2 font-bold tabular-nums text-gold-300" title="Jumlah nama taruna">{fmtNum(qSum.totalLulusan || 0)}</td>
                      <td className="text-center border border-slate-700 px-1 py-2 font-bold tabular-nums text-gold-300">{fmtNum(qSum.totalPns || 0)}</td>
                      <td className="text-center border border-slate-700 px-1 py-2 font-bold tabular-nums text-gold-300">{fmtNum(qSum.totalPpnpn || 0)}</td>
                      <td className="text-center border border-slate-700 px-1 py-2 font-bold tabular-nums text-gold-300">{fmtNum(qSum.totalBumn || 0)}</td>
                      <td className="text-center border border-slate-700 px-1 py-2 font-bold tabular-nums text-gold-300">{fmtNum(qSum.totalSwasta || 0)}</td>
                      <td className="text-center border border-slate-700 px-1 py-2 font-bold tabular-nums text-amber-400">{fmtNum(qSum.totalBelumBekerja || 0)}</td>
                      <td className="text-center border border-slate-700 px-1 py-2 font-black tabular-nums text-white bg-navy-900">{fmtNum(qSum.totalBekerja || 0)}</td>
                      <td className="text-center border border-slate-700 px-1 py-2 font-black tabular-nums text-white bg-navy-900">{fmtNum(qSum.totalLulusan || 0)}</td>
                      <td className="text-center border-r border-slate-600 px-1 py-2 font-black tabular-nums text-emerald-400 bg-navy-900">{qSum.pctAbsorption || 0}%</td>
                    </React.Fragment>
                  )
                })}

                {/* Total Kumulatif Tahunan */}
                <td className="text-center border border-slate-700 px-1 py-2 font-bold tabular-nums text-gold-300 bg-emerald-950" title="Jumlah nama taruna">{fmtNum(summary.totalLulusan)}</td>
                <td className="text-center border border-slate-700 px-1 py-2 font-bold tabular-nums text-gold-300 bg-emerald-950">{fmtNum(summary.totalPns)}</td>
                <td className="text-center border border-slate-700 px-1 py-2 font-bold tabular-nums text-gold-300 bg-emerald-950">{fmtNum(summary.totalPpnpn)}</td>
                <td className="text-center border border-slate-700 px-1 py-2 font-bold tabular-nums text-gold-300 bg-emerald-950">{fmtNum(summary.totalBumn)}</td>
                <td className="text-center border border-slate-700 px-1 py-2 font-bold tabular-nums text-gold-300 bg-emerald-950">{fmtNum(summary.totalSwasta)}</td>
                <td className="text-center border border-slate-700 px-1 py-2 font-bold tabular-nums text-amber-400 bg-emerald-950">{fmtNum(summary.totalBelumBekerja)}</td>
                <td className="text-center border border-slate-700 px-1 py-2 font-black tabular-nums text-white text-sm bg-emerald-950">{fmtNum(summary.totalBekerja)}</td>
                <td className="text-center border border-slate-700 px-1 py-2 font-black tabular-nums text-white text-sm bg-emerald-950">{fmtNum(summary.totalLulusan)}</td>
                <td className="text-center border-r border-slate-600 px-1 py-2 font-black tabular-nums text-emerald-300 text-sm bg-emerald-950">{summary.pctAbsorption}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="w-full overflow-x-auto rounded-xl border border-slate-300 shadow-sm">
          <table className="w-full border-collapse border border-slate-300 text-slate-800 text-[11px]">
            <thead>
              {/* Row 1: Header Utama Kemenhub (Background Soft Gold) */}
              <tr className="bg-amber-100 text-slate-900 font-black uppercase text-[10px] border-b border-slate-400">
                <th rowSpan={showTarunaNames ? 3 : 2} className="text-center border border-slate-400 px-2 py-2 w-8">NO.</th>
                <th rowSpan={showTarunaNames ? 3 : 2} className="text-left border border-slate-400 px-3 py-2 min-w-[200px]">PROGRAM STUDI</th>
                <th colSpan={showTarunaNames ? 6 : 2} className="text-center border border-slate-400 py-1.5 bg-amber-200/80">PEMERINTAH</th>
                <th colSpan={showTarunaNames ? 6 : 2} className="text-center border border-slate-400 py-1.5 bg-amber-200/60">NON PEMERINTAH</th>
                <th colSpan={showTarunaNames ? 2 : 1} className="text-center border border-slate-400 py-1.5 bg-amber-100">BELUM BEKERJA</th>
                <th rowSpan={showTarunaNames ? 3 : 2} className="text-center border border-slate-400 px-2 py-2 bg-amber-200/90 w-20">TOTAL BEKERJA</th>
                <th rowSpan={showTarunaNames ? 3 : 2} className="text-center border border-slate-400 px-2 py-2 bg-amber-200/90 w-20">TOTAL LULUSAN</th>
                <th rowSpan={showTarunaNames ? 3 : 2} className="text-center border border-slate-400 px-2 py-2 bg-emerald-100 text-emerald-950 w-20 font-black">PERSENTASE (%)</th>
              </tr>

              {/* Row 2: Sub-Kategori */}
              <tr className="bg-amber-50 text-slate-900 font-black text-[9.5px] border-b border-slate-400">
                <th colSpan={showTarunaNames ? 3 : 1} className="text-center border border-slate-400 py-1">PNS</th>
                <th colSpan={showTarunaNames ? 3 : 1} className="text-center border border-slate-400 py-1">PPNPN</th>
                <th colSpan={showTarunaNames ? 3 : 1} className="text-center border border-slate-400 py-1">BUMN / BUMD</th>
                <th colSpan={showTarunaNames ? 3 : 1} className="text-center border border-slate-400 py-1">SWASTA</th>
                <th colSpan={showTarunaNames ? 2 : 1} className="text-center border border-slate-400 py-1">BELUM BEKERJA</th>
              </tr>

              {/* Row 3: Kolom Rincian jika showTarunaNames aktif */}
              {showTarunaNames && (
                <tr className="bg-amber-50/70 text-slate-800 font-bold text-[9px] border-b-2 border-slate-400">
                  <th className="text-center border border-slate-400 px-1 py-1 w-6">NO</th>
                  <th className="text-left border border-slate-400 px-2 py-1 min-w-[120px]">NAMA TARUNA</th>
                  <th className="text-left border border-slate-400 px-2 py-1 min-w-[130px]">INSTANSI BEKERJA</th>

                  <th className="text-center border border-slate-400 px-1 py-1 w-6">NO</th>
                  <th className="text-left border border-slate-400 px-2 py-1 min-w-[120px]">NAMA TARUNA</th>
                  <th className="text-left border border-slate-400 px-2 py-1 min-w-[130px]">INSTANSI BEKERJA</th>

                  <th className="text-center border border-slate-400 px-1 py-1 w-6">NO</th>
                  <th className="text-left border border-slate-400 px-2 py-1 min-w-[120px]">NAMA TARUNA</th>
                  <th className="text-left border border-slate-400 px-2 py-1 min-w-[130px]">INSTANSI BEKERJA</th>

                  <th className="text-center border border-slate-400 px-1 py-1 w-6">NO</th>
                  <th className="text-left border border-slate-400 px-2 py-1 min-w-[120px]">NAMA TARUNA</th>
                  <th className="text-left border border-slate-400 px-2 py-1 min-w-[130px]">INSTANSI BEKERJA</th>

                  <th className="text-center border border-slate-400 px-1 py-1 w-6">NO</th>
                  <th className="text-left border border-slate-400 px-2 py-1 min-w-[140px]">NAMA TARUNA</th>
                </tr>
              )}
            </thead>

            <tbody>
              {matrix.map((p, idx) => {
                if (!showTarunaNames) {
                  // Mode Ringkas (Angka saja per Prodi)
                  return (
                    <tr
                      key={p.prodiId}
                      className={`transition-colors border-b border-slate-200 ${
                        idx % 2 === 0 ? 'bg-white hover:bg-amber-50/20' : 'bg-slate-50/60 hover:bg-amber-50/20'
                      }`}
                    >
                      <td className="text-center border border-slate-300 font-bold text-slate-500 py-2">{idx + 1}</td>
                      <td className="border border-slate-300 px-3 py-2 font-extrabold text-navy-950">
                        {p.namaProdi} <span className="text-[10px] text-slate-400 font-semibold">({p.jenjang || 'D4'})</span>
                      </td>
                      <td
                        className={`text-center border border-slate-300 py-2 tabular-nums ${
                          p.countPns ? 'font-bold text-blue-700 cursor-pointer hover:bg-blue-50' : 'text-slate-400'
                        }`}
                        onClick={() => p.countPns && openTarunaListModal(`${p.namaProdi} - PNS`, p.pns)}
                        title="Klik untuk melihat nama taruna"
                      >
                        {fmtNum(p.countPns)}
                      </td>
                      <td
                        className={`text-center border border-slate-300 py-2 tabular-nums ${
                          p.countPpnpn ? 'font-bold text-indigo-700 cursor-pointer hover:bg-indigo-50' : 'text-slate-400'
                        }`}
                        onClick={() => p.countPpnpn && openTarunaListModal(`${p.namaProdi} - PPNPN`, p.ppnpn)}
                        title="Klik untuk melihat nama taruna"
                      >
                        {fmtNum(p.countPpnpn)}
                      </td>
                      <td
                        className={`text-center border border-slate-300 py-2 tabular-nums ${
                          p.countBumn ? 'font-bold text-emerald-700 cursor-pointer hover:bg-emerald-50' : 'text-slate-400'
                        }`}
                        onClick={() => p.countBumn && openTarunaListModal(`${p.namaProdi} - BUMN/BUMD`, p.bumn)}
                        title="Klik untuk melihat nama taruna"
                      >
                        {fmtNum(p.countBumn)}
                      </td>
                      <td
                        className={`text-center border border-slate-300 py-2 tabular-nums ${
                          p.countSwasta ? 'font-bold text-violet-700 cursor-pointer hover:bg-violet-50' : 'text-slate-400'
                        }`}
                        onClick={() => p.countSwasta && openTarunaListModal(`${p.namaProdi} - Swasta`, p.swasta)}
                        title="Klik untuk melihat nama taruna"
                      >
                        {fmtNum(p.countSwasta)}
                      </td>
                      <td
                        className={`text-center border border-slate-300 py-2 tabular-nums text-amber-700 ${
                          p.countBelumBekerja ? 'font-bold cursor-pointer hover:bg-amber-50' : 'text-slate-400'
                        }`}
                        onClick={() => p.countBelumBekerja && openTarunaListModal(`${p.namaProdi} - Belum Bekerja`, p.belumBekerja)}
                        title="Klik untuk melihat nama taruna"
                      >
                        {fmtNum(p.countBelumBekerja)}
                      </td>
                      <td className="text-center border border-slate-300 py-2 font-black tabular-nums text-navy-950 bg-slate-50/50">
                        {fmtNum(p.totalBekerja)}
                      </td>
                      <td className="text-center border border-slate-300 py-2 font-black tabular-nums text-navy-950 bg-slate-50/50">
                        {fmtNum(p.totalLulusan)}
                      </td>
                      <td className="text-center border border-slate-300 py-2 font-black tabular-nums text-emerald-800 bg-emerald-50/50">
                        {p.pct}%
                      </td>
                    </tr>
                  )
                }

                // Mode Rinci (Persis Format Gambar Kemenhub dengan Nama Taruna)
                const maxRows = Math.max(
                  1,
                  p.pns.length,
                  p.ppnpn.length,
                  p.bumn.length,
                  p.swasta.length,
                  p.belumBekerja.length
                )

                return Array.from({ length: maxRows }).map((_, line) => {
                  const pnsItem = p.pns[line]
                  const ppnpnItem = p.ppnpn[line]
                  const bumnItem = p.bumn[line]
                  const swastaItem = p.swasta[line]
                  const bbItem = p.belumBekerja[line]

                  return (
                    <tr
                      key={`${p.prodiId}-${line}`}
                      className={`transition-colors border-b border-slate-200 ${
                        idx % 2 === 0 ? 'bg-white hover:bg-amber-50/20' : 'bg-slate-50/60 hover:bg-amber-50/20'
                      }`}
                    >
                      {line === 0 && (
                        <td rowSpan={maxRows} className="text-center border border-slate-300 font-bold text-slate-500 align-middle bg-slate-50/40">
                          {idx + 1}
                        </td>
                      )}
                      {line === 0 && (
                        <td rowSpan={maxRows} className="border border-slate-300 px-3 py-1.5 font-extrabold text-navy-950 align-middle bg-slate-50/40">
                          {p.namaProdi}
                        </td>
                      )}

                      {/* PNS */}
                      <td className="text-center border border-slate-300 text-slate-400 text-[10px] px-1 py-1">{pnsItem ? line + 1 : ''}</td>
                      <td className="border border-slate-300 px-2 py-1 font-bold text-navy-900">{pnsItem?.namaTaruna || ''}</td>
                      <td className="border border-slate-300 px-2 py-1 text-slate-700">{pnsItem?.instansiBekerja || ''}</td>

                      {/* PPNPN */}
                      <td className="text-center border border-slate-300 text-slate-400 text-[10px] px-1 py-1">{ppnpnItem ? line + 1 : ''}</td>
                      <td className="border border-slate-300 px-2 py-1 font-bold text-navy-900">{ppnpnItem?.namaTaruna || ''}</td>
                      <td className="border border-slate-300 px-2 py-1 text-slate-700">{ppnpnItem?.instansiBekerja || ''}</td>

                      {/* BUMN / BUMD */}
                      <td className="text-center border border-slate-300 text-slate-400 text-[10px] px-1 py-1">{bumnItem ? line + 1 : ''}</td>
                      <td className="border border-slate-300 px-2 py-1 font-bold text-navy-900">{bumnItem?.namaTaruna || ''}</td>
                      <td className="border border-slate-300 px-2 py-1 text-slate-700">{bumnItem?.instansiBekerja || ''}</td>

                      {/* SWASTA */}
                      <td className="text-center border border-slate-300 text-slate-400 text-[10px] px-1 py-1">{swastaItem ? line + 1 : ''}</td>
                      <td className="border border-slate-300 px-2 py-1 font-bold text-navy-900">{swastaItem?.namaTaruna || ''}</td>
                      <td className="border border-slate-300 px-2 py-1 text-slate-700">{swastaItem?.instansiBekerja || ''}</td>

                      {/* BELUM BEKERJA */}
                      <td className="text-center border border-slate-300 text-slate-400 text-[10px] px-1 py-1">{bbItem ? line + 1 : ''}</td>
                      <td className="border border-slate-300 px-2 py-1 text-amber-800 italic">{bbItem?.namaTaruna || ''}</td>

                      {/* Summary Columns */}
                      {line === 0 && (
                        <td rowSpan={maxRows} className="text-center border border-slate-300 font-black tabular-nums text-navy-950 align-middle bg-slate-50/50">
                          {fmtNum(p.totalBekerja)}
                        </td>
                      )}
                      {line === 0 && (
                        <td rowSpan={maxRows} className="text-center border border-slate-300 font-black tabular-nums text-navy-950 align-middle bg-slate-50/50">
                          {fmtNum(p.totalLulusan)}
                        </td>
                      )}
                      {line === 0 && (
                        <td rowSpan={maxRows} className="text-center border border-slate-300 font-black tabular-nums align-middle bg-emerald-50/50 text-emerald-800">
                          {p.pct}%
                        </td>
                      )}
                    </tr>
                  )
                })
              })}
            </tbody>

            <tfoot>
              <tr className="bg-navy-950 text-white font-black text-xs border-t-2 border-slate-500">
                <td colSpan={2} className="border border-slate-400 px-3 py-2.5 text-center font-black uppercase text-[10px] tracking-wider">
                  TOTAL KESELURUHAN
                </td>
                <td colSpan={showTarunaNames ? 3 : 1} className="text-center border border-slate-400 px-2 py-2 font-bold tabular-nums text-gold-300">
                  {showTarunaNames ? `PNS: ${fmtNum(summary.totalPns)}` : fmtNum(summary.totalPns)}
                </td>
                <td colSpan={showTarunaNames ? 3 : 1} className="text-center border border-slate-400 px-2 py-2 font-bold tabular-nums text-gold-300">
                  {showTarunaNames ? `PPNPN: ${fmtNum(summary.totalPpnpn)}` : fmtNum(summary.totalPpnpn)}
                </td>
                <td colSpan={showTarunaNames ? 3 : 1} className="text-center border border-slate-400 px-2 py-2 font-bold tabular-nums text-gold-300">
                  {showTarunaNames ? `BUMN: ${fmtNum(summary.totalBumn)}` : fmtNum(summary.totalBumn)}
                </td>
                <td colSpan={showTarunaNames ? 3 : 1} className="text-center border border-slate-400 px-2 py-2 font-bold tabular-nums text-gold-300">
                  {showTarunaNames ? `Swasta: ${fmtNum(summary.totalSwasta)}` : fmtNum(summary.totalSwasta)}
                </td>
                <td colSpan={showTarunaNames ? 2 : 1} className="text-center border border-slate-400 px-2 py-2 font-bold tabular-nums text-amber-400">
                  {showTarunaNames ? `Belum: ${fmtNum(summary.totalBelumBekerja)}` : fmtNum(summary.totalBelumBekerja)}
                </td>
                <td className="text-center border border-slate-400 px-2 py-2 font-black tabular-nums text-white text-sm bg-navy-900">
                  {fmtNum(summary.totalBekerja)}
                </td>
                <td className="text-center border border-slate-400 px-2 py-2 font-black tabular-nums text-white text-sm bg-navy-900">
                  {fmtNum(summary.totalLulusan)}
                </td>
                <td className="text-center border border-slate-400 px-2 py-2 font-black tabular-nums text-emerald-400 text-sm bg-navy-900">
                  {summary.pctAbsorption}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* MODAL DETAIL NAMA TARUNA (POPUP JIKA CELL DIKLIK) */}
      {tarunaModalData && (
        <div className="modal-overlay">
          <div className="modal-flex">
            <div className="modal-panel max-w-lg p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-surface-border">
                <div>
                  <h3 className="text-base font-black text-navy-900">Daftar Nama Taruna</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{tarunaModalData.title}</p>
                </div>
                <button type="button" className="text-slate-400 hover:text-slate-600 text-sm" onClick={() => setTarunaModalData(null)}>✕</button>
              </div>

              <div className="max-h-80 overflow-y-auto w-full border border-slate-200 rounded-xl divide-y divide-slate-100">
                {tarunaModalData.list.map((item, idx) => (
                  <div key={item.id || idx} className="p-3 flex items-start justify-between gap-3 text-xs hover:bg-slate-50">
                    <div className="flex items-start gap-2.5">
                      <span className="text-slate-400 font-bold text-[11px] pt-0.5">{idx + 1}.</span>
                      <div>
                        <p className="font-black text-navy-950">{item.namaTaruna}</p>
                        {item.nimTaruna && item.nimTaruna !== '-' && (
                          <p className="text-[10px] text-slate-400">NIM: {item.nimTaruna}</p>
                        )}
                        {item.keterangan && (
                          <p className="text-[10px] text-slate-500 italic mt-0.5">{item.keterangan}</p>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {item.instansiBekerja && item.instansiBekerja !== '-' ? (
                        <span className="text-[11px] font-bold text-navy-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {item.instansiBekerja}
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          Belum Bekerja
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2 text-right">
                <button type="button" className="btn-secondary !text-xs !py-1.5 !px-3.5" onClick={() => setTarunaModalData(null)}>
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
