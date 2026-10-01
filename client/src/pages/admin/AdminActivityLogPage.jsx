import React, { useCallback, useEffect, useState } from 'react'
import api, { apiError } from '../../lib/api'
import { Alert, EmptyState, SkeletonRows } from '../../components/ui'
import { IconHistory, IconRefresh, IconSearch, IconChevronDown, IconLock } from '../../components/icons'
import { fmtNum, fmtDateTime } from '../../utils/format'

const ROLES = [
  { value: '', label: 'Semua Role' },
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'PUSBANG', label: 'Pusbang' },
  { value: 'PIMPINAN_UPT', label: 'Pimpinan UPT' },
  { value: 'UPT_ADMIN', label: 'Admin UPT' },
]

const ENTITIES = [
  { value: '', label: 'Semua Kategori' },
  { value: 'auth', label: 'Autentikasi' },
  { value: 'user', label: 'Pengguna' },
  { value: 'target', label: 'Target PK' },
  { value: 'realisasi', label: 'Realisasi' },
  { value: 'diklat', label: 'Diklat' },
  { value: 'penyerapan', label: 'Penyerapan' },
  { value: 'taruna', label: 'Taruna' },
  { value: 'unlock', label: 'Unlock' },
  { value: 'program', label: 'Program' },
  { value: 'upt', label: 'UPT' },
  { value: 'prodi', label: 'Prodi' },
]

function actionBadge(action = '') {
  if (/LOGIN_FAILED/.test(action)) return 'bg-red-50 text-red-700 ring-red-200'
  if (/REJECT|DELETE|DEACTIVATE/.test(action)) return 'bg-rose-50 text-rose-700 ring-rose-200'
  if (/APPROVE|ACTIVATE|CREATE/.test(action)) return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  if (/SUBMIT|REQUEST/.test(action)) return 'bg-amber-50 text-amber-700 ring-amber-200'
  if (/UPDATE|SAVE|RESET|CHANGE/.test(action)) return 'bg-sky-50 text-sky-700 ring-sky-200'
  return 'bg-slate-100 text-slate-600 ring-slate-200'
}

function prettyDetail(detail) {
  if (!detail) return '-'
  try {
    const o = JSON.parse(detail)
    return Object.entries(o).map(([k, v]) => `${k}: ${v}`).join(' · ')
  } catch {
    return detail
  }
}

export default function AdminActivityLogPage() {
  const [logs, setLogs] = useState([])
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [role, setRole] = useState('')
  const [entity, setEntity] = useState('')
  const [expanded, setExpanded] = useState(null)

  const load = useCallback(async (page = 1) => {
    setLoading(true)
    setError('')
    try {
      const params = { page, limit: 25 }
      if (role) params.role = role
      if (entity) params.entity = entity
      if (search.trim()) params.search = search.trim()
      const { data } = await api.get('/activity-logs', { params })
      setLogs(data.logs || [])
      setPagination(data.pagination || { page: 1, limit: 25, total: 0, totalPages: 0 })
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [role, entity, search])

  useEffect(() => { load(1) }, [load])

  return (
    <div className="animate-fadeUp space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <IconLock className="h-5 w-5 text-navy-700" /> Log Aktivitas Pengguna
          </h1>
          <p className="page-desc">
            Pantau seluruh aktivitas keamanan & operasional semua user (login, pengajuan, persetujuan, penolakan, perubahan data).
          </p>
        </div>
        <button className="btn-secondary !rounded-xl" onClick={() => load(pagination.page)}>
          <IconRefresh className="h-4 w-4" /> Refresh
        </button>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      <div className="card rounded-2xl border border-slate-200/60 bg-white p-4 flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1 min-w-0">
          <IconSearch className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="form-input !rounded-xl !pl-9"
            placeholder="Cari nama user, kode UPT, ID objek, atau detail..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setSearch(searchInput) }}
          />
        </div>
        <div className="relative">
          <select className="form-input !rounded-xl appearance-none pr-8" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <IconChevronDown className="h-4 w-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select className="form-input !rounded-xl appearance-none pr-8" value={entity} onChange={(e) => setEntity(e.target.value)}>
            {ENTITIES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <IconChevronDown className="h-4 w-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        <button className="btn-primary !rounded-xl" onClick={() => setSearch(searchInput)}>Cari</button>
      </div>

      <div className="card rounded-2xl border border-slate-200/60 overflow-hidden bg-white">
        <div className="px-5 py-3 border-b border-slate-200/60 flex items-center justify-between bg-slate-50/60">
          <p className="text-xs font-extrabold text-slate-600 uppercase tracking-wider flex items-center gap-2">
            <IconHistory className="h-4 w-4" /> {fmtNum(pagination.total)} aktivitas tercatat
          </p>
          <p className="text-xs text-slate-400">Halaman {pagination.page} / {Math.max(1, pagination.totalPages)}</p>
        </div>
        {loading ? (
          <div className="p-4"><SkeletonRows rows={8} /></div>
        ) : logs.length === 0 ? (
          <EmptyState icon={<IconHistory className="h-6 w-6" />} title="Belum ada log" desc="Belum ada aktivitas tercatat untuk filter ini." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 900 }}>
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/60">
                  <th className="text-left px-4 py-3 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Waktu</th>
                  <th className="text-left px-3 py-3 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">User / Role</th>
                  <th className="text-left px-3 py-3 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Aksi</th>
                  <th className="text-left px-3 py-3 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Detail</th>
                  <th className="text-right px-4 py-3 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((l) => (
                  <React.Fragment key={l.id}>
                    <tr
                      className="hover:bg-slate-50/60 cursor-pointer"
                      onClick={() => setExpanded(expanded === l.id ? null : l.id)}
                      title="Klik untuk detail"
                    >
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDateTime(l.createdAt)}</td>
                      <td className="px-3 py-3">
                        <p className="font-bold text-slate-900 text-[13px] leading-tight">{l.actorName || '-'}</p>
                        <p className="text-[11px] text-slate-500">{l.actorRole || '-'} {l.uptCode ? `· ${l.uptCode}` : ''}</p>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-extrabold ring-1 ${actionBadge(l.action)}`}>
                          {l.action}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600 max-w-[320px] truncate" title={prettyDetail(l.detail) !== '-' ? prettyDetail(l.detail) : (l.entityId || '')}>
                        {prettyDetail(l.detail) !== '-'
                          ? prettyDetail(l.detail)
                          : (l.entityId
                            ? <span className="font-mono text-[11px]">ID: {String(l.entityId).slice(0, 8)}…</span>
                            : '-')}
                      </td>
                      <td className="px-4 py-3 text-right text-xs tabular-nums text-slate-500">{l.ip || '-'}</td>
                    </tr>
                    {expanded === l.id && (
                      <tr key={`${l.id}-detail`} className="bg-slate-50/70">
                        <td colSpan={5} className="px-4 py-3">
                          <div className="grid gap-1.5 sm:grid-cols-2 text-xs">
                            <p><span className="font-bold text-slate-500">Entity ID:</span> <span className="font-mono">{l.entityId || '-'}</span></p>
                            <p><span className="font-bold text-slate-500">UPT ID:</span> <span className="font-mono">{l.uptId || '-'}</span></p>
                            <p className="sm:col-span-2"><span className="font-bold text-slate-500">Detail mentah:</span> <span className="font-mono break-all">{l.detail || '-'}</span></p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && pagination.totalPages > 1 && (
          <div className="px-5 py-3 border-t border-slate-200/60 flex items-center justify-between">
            <button
              className="btn-secondary btn-sm !rounded-xl"
              disabled={pagination.page <= 1}
              onClick={() => load(pagination.page - 1)}
            >
              ← Sebelumnya
            </button>
            <span className="text-xs text-slate-500">Halaman {pagination.page} dari {pagination.totalPages}</span>
            <button
              className="btn-secondary btn-sm !rounded-xl"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => load(pagination.page + 1)}
            >
              Berikutnya →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
