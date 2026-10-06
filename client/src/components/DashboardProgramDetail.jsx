import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  IconLayers, IconSearch, IconPeople, IconGraduation, IconTruck, IconShip, IconPlane,
  IconBuilding, IconChevronDown, IconFilter, IconFileText,
} from './icons'
import { fmtNum } from '../utils/format'
import clsx from 'clsx'

const MATRA_OPTS = [
  { key: 'all', label: 'Semua Matra & Aparatur', icon: null, tone: 'navy' },
  { key: 'darat', label: 'Matra Darat (Taruna)', icon: IconTruck, tone: 'emerald', color: '#10B981' },
  { key: 'laut', label: 'Matra Laut (Taruna)', icon: IconShip, tone: 'sky', color: '#0EA5E9' },
  { key: 'udara', label: 'Matra Udara (Taruna)', icon: IconPlane, tone: 'violet', color: '#8B5CF6' },
  { key: 'aparatur', label: 'Aparatur', icon: IconBuilding, tone: 'amber', color: '#F59E0B' },
]

export default function DashboardProgramDetail({ programs = [], year, loading = false }) {
  const [selectedMatra, setSelectedMatra] = useState('all')
  const [selectedCategory, setSelectedCategory] = useState('semua') // 'semua' | 'taruna' | 'aparatur'
  const [programType, setProgramType] = useState('all') // 'all' | 'parent' | 'child'
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState('cards') // 'cards' | 'table'
  const [showAll, setShowAll] = useState(false)

  // Filter list program berdasarkan matra, kategori, tipe, & pencarian
  const filteredPrograms = useMemo(() => {
    if (!programs || !programs.length) return []
    let list = [...programs]

    // Filter Kategori (Taruna / Aparatur)
    if (selectedCategory !== 'semua') {
      list = list.filter((p) => {
        const cat = (p.category || p.targetGroup || 'semua').toLowerCase()
        return cat === selectedCategory
      })
    }

    // Filter Tipe (Induk / Turunan)
    if (programType === 'parent') {
      list = list.filter((p) => p.isParent === true)
    } else if (programType === 'child') {
      list = list.filter((p) => !p.isParent)
    }

    // Filter Pencarian
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((p) =>
        p.programName.toLowerCase().includes(q) || (p.parentName || '').toLowerCase().includes(q)
      )
    }

    return list
  }, [programs, selectedCategory, programType, search])

  // Helper untuk mendapatkan angka peserta & lulusan sesuai matra yang dipilih
  const getProgramMetrics = (p, matraKey) => {
    if (matraKey === 'all') {
      return {
        peserta: p.totalPeserta || 0,
        pesertaL: p.totalPesertaL || 0,
        pesertaP: p.totalPesertaP || 0,
        lulusan: p.totalLulusan || 0,
        lulusanL: p.totalLulusanL || 0,
        lulusanP: p.totalLulusanP || 0,
      }
    }
    const m = p.matra?.[matraKey] || {}
    const pL = m.pesertaL || 0
    const pP = m.pesertaP || 0
    const lL = m.lulusanL || 0
    const lP = m.lulusanP || 0
    return {
      peserta: pL + pP,
      pesertaL: pL,
      pesertaP: pP,
      lulusan: lL + lP,
      lulusanL: lL,
      lulusanP: lP,
    }
  }

  // Agregat Ringkasan untuk Filter Aktif
  const summary = useMemo(() => {
    let totP = 0
    let totPL = 0
    let totPP = 0
    let totL = 0
    let totLL = 0
    let totLP = 0
    let activeWithData = 0

    filteredPrograms.forEach((p) => {
      // Untuk summary, hitung program turunan jika ada turunan, atau induk jika tanpa turunan agar tidak double-count
      const isCountable = !p.isParent
      const m = getProgramMetrics(p, selectedMatra)
      if (m.peserta > 0 || m.lulusan > 0) activeWithData++

      if (isCountable) {
        totP += m.peserta
        totPL += m.pesertaL
        totPP += m.pesertaP
        totL += m.lulusan
        totLL += m.lulusanL
        totLP += m.lulusanP
      }
    })

    const rasioLulus = totP > 0 ? Math.round((totL / totP) * 100) : 0
    return { totP, totPL, totPP, totL, totLL, totLP, rasioLulus, activeWithData }
  }, [filteredPrograms, selectedMatra])

  // Batasi jumlah yang ditampilkan di mode kartu jika showAll = false
  const displayedPrograms = showAll ? filteredPrograms : filteredPrograms.slice(0, 9)

  return (
    <div className="card p-5 md:p-6 border-surface-border shadow-card bg-white space-y-5">
      {/* 1. Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-surface-border">
        <div className="flex items-start gap-3.5">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 text-white flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0">
            <IconLayers className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg md:text-xl font-black text-navy-900 tracking-tight">
                Detail Realisasi Program Diklat
              </h2>
              <span className="rounded-full text-[10px] font-extrabold px-2.5 py-0.5 border bg-amber-50 text-amber-700 border-amber-200">
                3 Matra Taruna &amp; Aparatur · {year}
              </span>
            </div>
            <p className="text-xs text-navy-500 mt-0.5">
              Rincian komprehensif jumlah peserta dan lulusan per program diklat seluruh UPT Kementerian Perhubungan.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start md:self-auto">
          <Link
            to="/admin/program-detail"
            className="btn-primary !rounded-xl !py-2 !px-3.5 bg-navy-900 hover:bg-navy-800 text-xs font-bold shadow flex items-center gap-1.5"
            title="Buka halaman rekap detail & ekspor Excel"
          >
            <IconFileText className="h-3.5 w-3.5" />
            <span>Buka Rekap Lengkap</span>
            <IconChevronDown className="h-3.5 w-3.5 rotate-[-90deg]" />
          </Link>
        </div>
      </div>

      {/* 2. Mini KPI Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl p-3 bg-navy-50/60 border border-navy-100 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-navy-500">Total Peserta</span>
            <p className="text-lg font-black text-navy-950 tabular-nums mt-0.5">{fmtNum(summary.totP)}</p>
            <span className="text-[10px] text-navy-600 font-semibold">L: {fmtNum(summary.totPL)} · P: {fmtNum(summary.totPP)}</span>
          </div>
          <div className="h-8 w-8 rounded-lg bg-navy-900 text-white flex items-center justify-center">
            <IconPeople className="h-4 w-4" />
          </div>
        </div>

        <div className="rounded-xl p-3 bg-gold-50/60 border border-gold-100 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-gold-700">Total Lulusan</span>
            <p className="text-lg font-black text-gold-900 tabular-nums mt-0.5">{fmtNum(summary.totL)}</p>
            <span className="text-[10px] text-gold-700 font-semibold">L: {fmtNum(summary.totLL)} · P: {fmtNum(summary.totLP)}</span>
          </div>
          <div className="h-8 w-8 rounded-lg bg-gold-500 text-white flex items-center justify-center">
            <IconGraduation className="h-4 w-4" />
          </div>
        </div>

        <div className="rounded-xl p-3 bg-emerald-50/60 border border-emerald-100 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">Rasio Kelulusan</span>
            <p className="text-lg font-black text-emerald-800 tabular-nums mt-0.5">{summary.rasioLulus}%</p>
            <span className="text-[10px] text-emerald-600 font-semibold">Lulusan vs Peserta</span>
          </div>
          <div className="h-8 w-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black text-xs">
            %
          </div>
        </div>

        <div className="rounded-xl p-3 bg-slate-50 border border-slate-200 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Program Aktif</span>
            <p className="text-lg font-black text-slate-800 tabular-nums mt-0.5">{filteredPrograms.length}</p>
            <span className="text-[10px] text-slate-500 font-semibold">{summary.activeWithData} ada realisasi</span>
          </div>
          <div className="h-8 w-8 rounded-lg bg-slate-700 text-white flex items-center justify-center">
            <IconLayers className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* 3. Toolbar: Filter Matra Tabs, Kategori, Search, & View Mode */}
      <div className="space-y-3 pt-1">
        {/* Matra Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
          {MATRA_OPTS.map((m) => {
            const IconComp = m.icon
            const isSelected = selectedMatra === m.key
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setSelectedMatra(m.key)}
                className={clsx(
                  'px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 whitespace-nowrap shadow-sm border',
                  isSelected
                    ? 'bg-navy-900 text-gold-300 border-navy-950 shadow-md'
                    : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
                )}
              >
                {IconComp && <IconComp className="h-3.5 w-3.5" />}
                <span>{m.label}</span>
              </button>
            )
          })}
        </div>

        {/* Sub-Filters: Kategori, Tipe, Live Search, View Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Filter Kategori */}
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200 text-[11px] font-bold">
              <button
                type="button"
                className={clsx('px-2.5 py-1 rounded-md transition-all', selectedCategory === 'semua' ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}
                onClick={() => setSelectedCategory('semua')}
              >
                Semua Kategori
              </button>
              <button
                type="button"
                className={clsx('px-2.5 py-1 rounded-md transition-all', selectedCategory === 'taruna' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800')}
                onClick={() => setSelectedCategory('taruna')}
              >
                Taruna
              </button>
              <button
                type="button"
                className={clsx('px-2.5 py-1 rounded-md transition-all', selectedCategory === 'aparatur' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800')}
                onClick={() => setSelectedCategory('aparatur')}
              >
                Aparatur
              </button>
            </div>

            {/* Filter Tipe Program (Semua / Induk / Turunan) */}
            <div className="relative">
              <select
                className="appearance-none cursor-pointer bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg py-1 pl-2.5 pr-7 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-gold-400"
                value={programType}
                onChange={(e) => setProgramType(e.target.value)}
              >
                <option value="all">Semua Tipe Program</option>
                <option value="parent">Hanya Program Induk</option>
                <option value="child">Hanya Program Turunan</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5 text-slate-400">
                <IconChevronDown className="h-3 w-3" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-48">
              <input
                type="text"
                placeholder="Cari program..."
                className="w-full text-xs font-semibold py-1.5 pl-7 pr-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gold-400"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <IconSearch className="h-3.5 w-3.5 absolute left-2 top-2 text-slate-400 pointer-events-none" />
            </div>

            {/* View Mode Switcher */}
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200 text-[11px] font-bold">
              <button
                type="button"
                className={clsx('px-2 py-1 rounded-md transition-all flex items-center gap-1', viewMode === 'cards' ? 'bg-navy-900 text-gold-300 shadow-sm' : 'text-slate-500 hover:text-slate-800')}
                onClick={() => setViewMode('cards')}
                title="Tampilan Kartu Visual"
              >
                <span>Grid</span>
              </button>
              <button
                type="button"
                className={clsx('px-2 py-1 rounded-md transition-all flex items-center gap-1', viewMode === 'table' ? 'bg-navy-900 text-gold-300 shadow-sm' : 'text-slate-500 hover:text-slate-800')}
                onClick={() => setViewMode('table')}
                title="Tampilan Tabel Rinci"
              >
                <span>Tabel</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Konten Program (Visual Cards Mode atau Tabel Mode) */}
      {loading ? (
        <div className="p-8 text-center text-xs text-slate-400">Memuat data program...</div>
      ) : filteredPrograms.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-slate-50 border border-dashed border-slate-200">
          <p className="text-xs font-bold text-slate-500">Tidak ada data program yang sesuai dengan filter.</p>
        </div>
      ) : viewMode === 'cards' ? (
        /* MODE KARTU VISUAL */
        <div className="space-y-4">
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {displayedPrograms.map((p) => {
              const m = getProgramMetrics(p, selectedMatra)
              const pTot = m.peserta
              const lTot = m.lulusan
              const rasio = pTot > 0 ? Math.min(100, Math.round((lTot / pTot) * 100)) : 0
              const isParent = p.isParent

              return (
                <div
                  key={p.programId}
                  className={clsx(
                    'rounded-2xl p-4 transition-all duration-200 border flex flex-col justify-between hover:shadow-md',
                    isParent
                      ? 'bg-gradient-to-br from-slate-50 to-navy-50/40 border-navy-200'
                      : 'bg-white border-slate-200/90'
                  )}
                >
                  {/* Top Bar: Kategori & Induk Indicator */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={clsx(
                            'text-[9.5px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider border',
                            (p.category || '').toLowerCase() === 'aparatur'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-sky-50 text-sky-700 border-sky-200'
                          )}
                        >
                          {p.category || 'Taruna'}
                        </span>
                        {isParent ? (
                          <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                            Program Induk
                          </span>
                        ) : p.parentName ? (
                          <span className="text-[10px] text-slate-400 font-medium truncate max-w-[150px]" title={p.parentName}>
                            ↳ {p.parentName}
                          </span>
                        ) : null}
                      </div>

                      {p.uptCount > 0 && (
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                          {p.uptCount} UPT
                        </span>
                      )}
                    </div>

                    {/* Kategori Diklat */}
                    <h3 className="text-sm font-black text-navy-900 leading-snug line-clamp-2 min-h-[36px]" title={p.programName}>
                      {p.programName}
                    </h3>
                  </div>

                  {/* Metrik Peserta & Lulusan */}
                  <div className="mt-3.5 pt-3 border-t border-slate-100 space-y-3">
                    <div className="grid grid-cols-2 gap-2 bg-surface-ground p-2.5 rounded-xl border border-slate-100">
                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wide text-navy-400">Peserta</span>
                        <p className="text-base font-black text-navy-950 tabular-nums">{fmtNum(pTot)}</p>
                        <div className="flex items-center gap-1.5 text-[9.5px] text-navy-500 font-bold mt-0.5">
                          <span>L: {fmtNum(m.pesertaL)}</span>
                          <span>·</span>
                          <span>P: {fmtNum(m.pesertaP)}</span>
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wide text-gold-600">Lulusan</span>
                        <p className="text-base font-black text-gold-700 tabular-nums">{fmtNum(lTot)}</p>
                        <div className="flex items-center gap-1.5 text-[9.5px] text-gold-700 font-bold mt-0.5">
                          <span>L: {fmtNum(m.lulusanL)}</span>
                          <span>·</span>
                          <span>P: {fmtNum(m.lulusanP)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Progress Rasio Kelulusan */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10.5px]">
                        <span className="font-semibold text-slate-500">Rasio Kelulusan</span>
                        <span className="font-black text-navy-900">{pTot > 0 ? `${rasio}%` : '—'}</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-navy-800 to-gold-500 rounded-full transition-all duration-500"
                          style={{ width: `${rasio}%` }}
                        />
                      </div>
                    </div>

                    {/* Chips Distribusi Matra (Tampil jika filter matra = 'all') */}
                    {selectedMatra === 'all' && (
                      <div className="pt-2 border-t border-slate-100/80">
                        <span className="text-[9.5px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1.5">
                          Distribusi Matra
                        </span>
                        <div className="grid grid-cols-2 gap-1 text-[10px]">
                          <span className="flex items-center justify-between bg-emerald-50/60 px-2 py-0.5 rounded border border-emerald-100 text-emerald-800">
                            <span className="font-bold flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Darat
                            </span>
                            <span className="font-black tabular-nums">{fmtNum((p.matra?.darat?.pesertaL || 0) + (p.matra?.darat?.pesertaP || 0))}</span>
                          </span>

                          <span className="flex items-center justify-between bg-sky-50/60 px-2 py-0.5 rounded border border-sky-100 text-sky-800">
                            <span className="font-bold flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                              Laut
                            </span>
                            <span className="font-black tabular-nums">{fmtNum((p.matra?.laut?.pesertaL || 0) + (p.matra?.laut?.pesertaP || 0))}</span>
                          </span>

                          <span className="flex items-center justify-between bg-violet-50/60 px-2 py-0.5 rounded border border-violet-100 text-violet-800">
                            <span className="font-bold flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                              Udara
                            </span>
                            <span className="font-black tabular-nums">{fmtNum((p.matra?.udara?.pesertaL || 0) + (p.matra?.udara?.pesertaP || 0))}</span>
                          </span>

                          <span className="flex items-center justify-between bg-amber-50/60 px-2 py-0.5 rounded border border-amber-100 text-amber-800">
                            <span className="font-bold flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                              Aparatur
                            </span>
                            <span className="font-black tabular-nums">{fmtNum((p.matra?.aparatur?.pesertaL || 0) + (p.matra?.aparatur?.pesertaP || 0))}</span>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Tombol Tampilkan Lebih Banyak jika > 9 */}
          {filteredPrograms.length > 9 && (
            <div className="pt-2 text-center">
              <button
                type="button"
                className="btn-secondary !text-xs !py-2 !px-4 rounded-xl font-bold shadow-sm"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? 'Tampilkan Lebih Sedikit' : `Tampilkan Semua (${filteredPrograms.length} Program)`}
              </button>
            </div>
          )}
        </div>
      ) : (
        /* MODE TABEL RINCI */
        <div className="w-full overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full border-collapse text-left text-xs text-slate-800">
            <thead>
              <tr className="bg-navy-950 text-white font-extrabold uppercase text-[10px]">
                <th className="px-2.5 py-2.5 text-center border-b border-navy-800 w-8">#</th>
                <th className="px-3 py-2.5 border-b border-navy-800">PROGRAM DIKLAT</th>
                <th className="px-2.5 py-2.5 text-center border-b border-navy-800">KATEGORI</th>
                <th className="px-2.5 py-2.5 text-center border-b border-navy-800">PESERTA L</th>
                <th className="px-2.5 py-2.5 text-center border-b border-navy-800">PESERTA P</th>
                <th className="px-2.5 py-2.5 text-center border-b border-navy-800 font-black text-gold-300">TOTAL PESERTA</th>
                <th className="px-2.5 py-2.5 text-center border-b border-navy-800">LULUSAN L</th>
                <th className="px-2.5 py-2.5 text-center border-b border-navy-800">LULUSAN P</th>
                <th className="px-2.5 py-2.5 text-center border-b border-navy-800 font-black text-gold-300">TOTAL LULUSAN</th>
                <th className="px-2.5 py-2.5 text-center border-b border-navy-800">RASIO LULUS</th>
                {selectedMatra === 'all' && (
                  <th className="px-3 py-2.5 text-center border-b border-navy-800">DISTRIBUSI MATRA</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredPrograms.map((p, i) => {
                const m = getProgramMetrics(p, selectedMatra)
                const isParent = p.isParent
                const rasio = m.peserta > 0 ? Math.round((m.lulusan / m.peserta) * 100) : 0

                return (
                  <tr
                    key={p.programId}
                    className={clsx(
                      'transition-colors',
                      isParent ? 'bg-slate-100/90 font-extrabold text-navy-950' : i % 2 === 0 ? 'bg-white hover:bg-slate-50/80' : 'bg-slate-50/50 hover:bg-slate-50/80'
                    )}
                  >
                    <td className="px-2 py-2 text-center text-[10px] font-bold text-slate-400">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">
                      {isParent ? (
                        <span className="font-extrabold text-navy-950 block">{p.programName}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-navy-800 pl-2">
                          <span className="text-slate-400">↳</span> {p.programName}
                        </span>
                      )}
                    </td>
                    <td className="px-2.5 py-2 text-center">
                      <span
                        className={clsx(
                          'text-[9.5px] font-bold px-2 py-0.5 rounded-full border',
                          (p.category || '').toLowerCase() === 'aparatur'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-sky-50 text-sky-700 border-sky-200'
                        )}
                      >
                        {p.category || 'Taruna'}
                      </span>
                    </td>
                    <td className="px-2.5 py-2 text-center tabular-nums text-slate-600">{fmtNum(m.pesertaL)}</td>
                    <td className="px-2.5 py-2 text-center tabular-nums text-slate-600">{fmtNum(m.pesertaP)}</td>
                    <td className="px-2.5 py-2 text-center font-black tabular-nums text-navy-950 bg-navy-50/30">{fmtNum(m.peserta)}</td>
                    <td className="px-2.5 py-2 text-center tabular-nums text-slate-600">{fmtNum(m.lulusanL)}</td>
                    <td className="px-2.5 py-2 text-center tabular-nums text-slate-600">{fmtNum(m.lulusanP)}</td>
                    <td className="px-2.5 py-2 text-center font-black tabular-nums text-gold-700 bg-gold-50/30">{fmtNum(m.lulusan)}</td>
                    <td className="px-2.5 py-2 text-center font-bold tabular-nums">
                      {m.peserta > 0 ? (
                        <span className={clsx('text-[10px] font-black', rasio >= 80 ? 'text-emerald-700' : rasio >= 50 ? 'text-gold-700' : 'text-rose-700')}>
                          {rasio}%
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    {selectedMatra === 'all' && (
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold tabular-nums">
                          <span title="Darat" className="text-emerald-700">D: {fmtNum((p.matra?.darat?.pesertaL || 0) + (p.matra?.darat?.pesertaP || 0))}</span>
                          <span>·</span>
                          <span title="Laut" className="text-sky-700">L: {fmtNum((p.matra?.laut?.pesertaL || 0) + (p.matra?.laut?.pesertaP || 0))}</span>
                          <span>·</span>
                          <span title="Udara" className="text-violet-700">U: {fmtNum((p.matra?.udara?.pesertaL || 0) + (p.matra?.udara?.pesertaP || 0))}</span>
                          <span>·</span>
                          <span title="Aparatur" className="text-amber-700">A: {fmtNum((p.matra?.aparatur?.pesertaL || 0) + (p.matra?.aparatur?.pesertaP || 0))}</span>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-navy-950 text-white font-black text-xs border-t-2 border-navy-800">
                <td colSpan={3} className="px-3 py-2.5 text-center font-black uppercase text-[10.5px]">
                  TOTAL REKAPITULASI
                </td>
                <td className="px-2.5 py-2.5 text-center tabular-nums text-navy-200">{fmtNum(summary.totPL)}</td>
                <td className="px-2.5 py-2.5 text-center tabular-nums text-navy-200">{fmtNum(summary.totPP)}</td>
                <td className="px-2.5 py-2.5 text-center font-black tabular-nums text-gold-300 text-sm bg-navy-900">{fmtNum(summary.totP)}</td>
                <td className="px-2.5 py-2.5 text-center tabular-nums text-navy-200">{fmtNum(summary.totLL)}</td>
                <td className="px-2.5 py-2.5 text-center tabular-nums text-navy-200">{fmtNum(summary.totLP)}</td>
                <td className="px-2.5 py-2.5 text-center font-black tabular-nums text-gold-300 text-sm bg-navy-900">{fmtNum(summary.totL)}</td>
                <td className="px-2.5 py-2.5 text-center font-black text-emerald-400 tabular-nums">{summary.rasioLulus}%</td>
                {selectedMatra === 'all' && <td className="px-3 py-2.5 text-center text-[10px] text-navy-300">Semua Matra</td>}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
