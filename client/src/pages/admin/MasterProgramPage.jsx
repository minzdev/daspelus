import { useCallback, useEffect, useMemo, useState } from 'react'
import api, { apiError } from '../../lib/api'
import {
  Modal, EmptyState, Alert, Spinner, FormField,
} from '../../components/ui'
import {
  IconLayers, IconPlus, IconEdit, IconSearch, IconRefresh, IconChevronDown, IconTrash,
} from '../../components/icons'
import { useToast } from '../../components/Toast'

/**
 * Master Program — struktur dua level:
 * Program Induk (mis. Pendidikan Pembentukan)
 *   └ Program Turunan (Pola Pembibitan, Non Pola Pembibitan, Mandiri)
 * Turunan dipakai untuk input realisasi & target PK per program.
 *
 * targetGroup: 'taruna' | 'aparatur' | 'semua'
 *   - taruna   : hanya tampil di UPT taruna (3 matra)
 *   - aparatur : hanya tampil di UPT aparatur
 *   - semua    : tampil di semua UPT
 */

const TARGET_GROUP_OPTIONS = [
  { value: 'semua', label: 'Semua UPT' },
  { value: 'taruna', label: 'Taruna (3 Matra)' },
  { value: 'aparatur', label: 'Aparatur' },
]

function TargetGroupBadge({ value }) {
  const cfg = {
    taruna: { cls: 'bg-blue-50 text-blue-700 ring-blue-300', icon: '⚓', label: 'Taruna' },
    aparatur: { cls: 'bg-amber-50 text-amber-700 ring-amber-300', icon: '🏢', label: 'Aparatur' },
    semua: { cls: 'bg-slate-50 text-slate-600 ring-slate-200', icon: '🌐', label: 'Semua' },
  }
  const s = cfg[value] || cfg.semua
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${s.cls}`}>
      <span className="text-xs leading-none">{s.icon}</span>{s.label}
    </span>
  )
}

export default function MasterProgramPage() {
  const [parents, setParents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [activeGroup, setActiveGroup] = useState('semua') // semua | taruna | aparatur

  // modal tambah/edit: editing = null berarti tambah
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  // mode tambah: addMode = 'parent' | 'child'; childParentId utk induk tujuan
  const [addMode, setAddMode] = useState('parent')
  const [childParentId, setChildParentId] = useState('')
  const [form, setForm] = useState({ name: '', order: 0, targetGroup: 'semua' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // modal hapus
  const [deleteTarget, setDeleteTarget] = useState(null) // { id, name, isParent, childCount }
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/programs')
      setParents(data.parents)
    } catch (err) {
      setError(apiError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const totalChildren = useMemo(
    () => parents.reduce((s, p) => s + (p.children?.length || 0), 0),
    [parents]
  )

  const counts = useMemo(() => {
    const c = { semua: parents.length, taruna: 0, aparatur: 0 }
    parents.forEach((p) => {
      const g = (p.targetGroup || 'semua').toLowerCase()
      if (g === 'taruna') c.taruna += 1
      else if (g === 'aparatur') c.aparatur += 1
      else c.semua -= 0 // keep
    })
    // hitung turunan juga
    const ct = { semua: totalChildren, taruna: 0, aparatur: 0 }
    parents.forEach((p) => {
      const g = (p.targetGroup || 'semua').toLowerCase()
      const n = p.children?.length || 0
      if (g === 'taruna') ct.taruna += n
      else if (g === 'aparatur') ct.aparatur += n
      else { ct.taruna += 0; ct.aparatur += 0 }
    })
    return { induk: c, turunan: ct }
  }, [parents, totalChildren])

  const groupedParents = useMemo(() => {
    if (activeGroup === 'semua') return parents
    return parents.filter((p) => (p.targetGroup || 'semua').toLowerCase() === activeGroup)
  }, [parents, activeGroup])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let base = groupedParents
    if (!q) return base
    return base
      .map((p) => {
        const childMatch = (p.children || []).filter((c) => c.name.toLowerCase().includes(q))
        if (p.name.toLowerCase().includes(q)) return p // induk cocok -> tampilkan semua turunan
        if (childMatch.length > 0) return { ...p, children: childMatch }
        return null
      })
      .filter(Boolean)
  }, [groupedParents, search])

  function openAddParent() {
    setEditing(null)
    setAddMode('parent')
    setChildParentId('')
    const defaultGroup = activeGroup !== 'semua' ? activeGroup : 'taruna'
    setForm({ name: '', order: 0, targetGroup: defaultGroup })
    setFormError('')
    setModalOpen(true)
  }

  function openAddChild(parent) {
    setEditing(null)
    setAddMode('child')
    setChildParentId(parent.id)
    setForm({ name: '', order: (parent.children?.length || 0) + 1, targetGroup: parent.targetGroup || 'semua' })
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(p) {
    setEditing(p)
    setAddMode(p.parentId ? 'child' : 'parent')
    setChildParentId(p.parentId || '')
    setForm({ name: p.name, order: p.order || 0, targetGroup: p.targetGroup || 'semua' })
    setFormError('')
    setModalOpen(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim()) {
      setFormError('Nama kategori diklat wajib diisi.')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await api.put(`/programs/${editing.id}`, {
          name: form.name,
          order: form.order,
          targetGroup: form.targetGroup,
        })
        toast.success('Program diperbarui', `"${form.name}" berhasil diperbarui.`)
      } else {
        const body = { name: form.name, order: form.order, targetGroup: form.targetGroup }
        if (addMode === 'child') body.parentId = childParentId
        await api.post('/programs', body)
        toast.success(
          addMode === 'child' ? 'Jenis diklat ditambahkan' : 'Program induk ditambahkan',
          `"${form.name}"`
        )
      }
      setModalOpen(false)
      await load()
    } catch (err) {
      setFormError(apiError(err))
      toast.error('Gagal menyimpan program', apiError(err))
    } finally {
      setSaving(false)
    }
  }

  function openDelete(p) {
    setDeleteTarget({
      id: p.id,
      name: p.name,
      isParent: !p.parentId,
      childCount: p.children?.length || 0,
    })
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const { data } = await api.delete(`/programs/${deleteTarget.id}`)
      toast.success('Program dihapus', data.message)
      setDeleteTarget(null)
      await load()
    } catch (err) {
      toast.error('Gagal menghapus program', apiError(err))
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  const modalTitle = editing
    ? `Edit Kategori Diklat`
    : addMode === 'child'
      ? 'Tambah Jenis Diklat'
      : 'Tambah Kategori Diklat'

  return (
    <div className="animate-fadeUp">
      <div className="page-header">
        <div>
          <h1 className="page-title">Master Kategori Diklat</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={load} title="Muat ulang">
            <IconRefresh className="h-4 w-4" />
          </button>
          <button className="btn-primary" onClick={openAddParent}>
            <IconPlus className="h-4 w-4" /> Kategori Diklat
          </button>
        </div>
      </div>

      {error && <div className="mb-5"><Alert type="error">{error}</Alert></div>}

      {/* Pemisah Taruna vs Aparatur */}
      <div className="card p-3 mb-5">
        <div className="flex flex-col gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {[
              { id: 'semua', label: 'Semua', icon: '🌐', count: `${parents.length}·${totalChildren}` },
              { id: 'taruna', label: 'Taruna (3 Matra)', icon: '⚓', count: `${counts.induk.taruna}·${counts.turunan.taruna}` },
              { id: 'aparatur', label: 'Aparatur', icon: '🏢', count: `${counts.induk.aparatur}·${counts.turunan.aparatur}` },
            ].map((tab) => {
              const active = activeGroup === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveGroup(tab.id)}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition ${
                    active
                      ? 'bg-navy-800 text-white shadow'
                      : 'bg-white text-navy-600 ring-1 ring-surface-border hover:bg-navy-50'
                  }`}
                >
                  <span>{tab.icon}</span> {tab.label} <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${active ? 'bg-white/20' : 'bg-navy-50'}`}>{tab.count}</span>
                </button>
              )
            })}
          </div>
          {/* Pencarian + info */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 border-t border-surface-border pt-3">
            <p className="text-xs text-navy-500 order-2 sm:order-1">
              {activeGroup === 'semua' ? (
                <>{parents.length} induk · {totalChildren} jenis diklat</>
              ) : (
                <>
                  <span className="font-bold text-navy-700 capitalize">{activeGroup}</span> — {groupedParents.length} induk · {groupedParents.reduce((s, p) => s + (p.children?.length || 0), 0)} jenis diklat
                  <span className="text-navy-300"> · dari {parents.length} total</span>
                </>
              )}
            </p>
            <div className="relative w-full sm:w-auto sm:ml-auto order-1 sm:order-2">
              <IconSearch className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-navy-300" />
              <input
                className="form-input !py-2 pl-9 w-full sm:w-[280px]"
                placeholder={activeGroup === 'semua' ? 'Cari kategori diklat...' : `Cari di ${activeGroup}...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card p-8 text-center">
          <Spinner className="h-6 w-6 mx-auto text-navy-400" />
          <p className="text-xs text-navy-400 mt-3">Memuat program...</p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<IconLayers className="h-6 w-6" />}
          title={search ? 'Tidak ditemukan' : 'Belum ada program'}
          desc={
            search
              ? 'Tidak ada program yang cocok dengan pencarian Anda.'
              : 'Tambahkan program induk pertama (mis. Pendidikan Pembentukan), lalu tambahkan turunannya (mis. Pola Pembibitan, Mandiri).'
          }
          action={!search && (
            <button className="btn-primary" onClick={openAddParent}>
              <IconPlus className="h-4 w-4" /> Tambah Kategori Diklat
            </button>
          )}
        />
      ) : (
        <div className="space-y-6">
          {/* Jika "Semua" tampilkan pemisah header Taruna / Aparatur agar rapi dan tidak tercampur */}
          {activeGroup === 'semua' && filtered.some((p) => (p.targetGroup || 'semua') === 'taruna') && filtered.some((p) => (p.targetGroup || 'semua') === 'aparatur') ? (
            <>
              {/* Taruna Section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="h-7 w-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs">⚓</span>
                  <h3 className="font-extrabold text-navy-900 text-sm">Taruna — 3 Matra</h3>
                  <span className="text-xs text-navy-400">{filtered.filter((p) => (p.targetGroup || 'semua') === 'taruna').length} induk</span>
                  <div className="h-px flex-1 bg-blue-100 ml-2" />
                </div>
                <div className="space-y-4">
                  {filtered.filter((p) => (p.targetGroup || 'semua') === 'taruna').map((parent) => (
                    <div key={parent.id} className="card overflow-hidden ring-1 ring-blue-100 border-l-4 border-l-blue-500">
                      {/* Header induk */}
                      <div className="flex flex-col md:flex-row md:items-center gap-3 px-5 py-4 border-b border-surface-border bg-blue-50/40">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-9 w-9 shrink-0 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                            <IconLayers className="h-4.5 w-4.5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-navy-900 text-sm truncate">{parent.name}</p>
                              <TargetGroupBadge value={parent.targetGroup || 'semua'} />
                            </div>
                            <p className="text-[11px] text-navy-400">
                              {parent.children?.length || 0} jenis diklat · urutan {parent.order || 0}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 md:ml-auto shrink-0">
                          <button className="btn-secondary btn-sm" onClick={() => openEdit(parent)}>
                            <IconEdit className="h-3.5 w-3.5" /> Edit
                          </button>
                          <button className="btn-danger btn-sm" onClick={() => openDelete(parent)} title="Hapus program induk beserta seluruh turunannya">
                            <IconTrash className="h-3.5 w-3.5" /> Hapus
                          </button>
                          <button className="btn-primary btn-sm" onClick={() => openAddChild(parent)}>
                            <IconPlus className="h-3.5 w-3.5" /> Jenis Diklat
                          </button>
                        </div>
                      </div>
                      {parent.children && parent.children.length > 0 ? (
                        <div className="table-wrap">
                          <table className="data-table">
                            <thead><tr><th className="w-12">No</th><th>Jenis Diklat</th><th className="w-28">Unit Kerja</th><th className="w-24">Urutan</th><th className="w-48 text-right">Aksi</th></tr></thead>
                            <tbody>{parent.children.map((child, idx) => (
                              <tr key={child.id}><td className="text-navy-400"><span className="inline-flex items-center gap-1"><IconChevronDown className="h-3 w-3 text-navy-300" />{idx + 1}</span></td><td className="font-semibold text-navy-900">{child.name}</td><td><TargetGroupBadge value={child.targetGroup || 'semua'} /></td><td className="text-navy-500 text-xs">{child.order || 0}</td><td><div className="flex items-center justify-end gap-1.5"><button className="btn-secondary btn-sm" onClick={() => openEdit(child)}><IconEdit className="h-3.5 w-3.5" /> Edit</button><button className="btn-danger btn-sm" onClick={() => openDelete(child, parent)}><IconTrash className="h-3.5 w-3.5" /> Hapus</button></div></td></tr>
                            ))}</tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="px-5 py-6 text-center"><p className="text-xs text-navy-400">Belum ada jenis diklat. <button className="font-bold text-navy-700 underline underline-offset-2 hover:text-navy-900" onClick={() => openAddChild(parent)}>Tambah jenis diklat pertama</button></p></div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {/* Aparatur Section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="h-7 w-7 rounded-lg bg-amber-500 text-white flex items-center justify-center text-xs">🏢</span>
                  <h3 className="font-extrabold text-navy-900 text-sm">Aparatur</h3>
                  <span className="text-xs text-navy-400">{filtered.filter((p) => (p.targetGroup || 'semua') === 'aparatur').length} induk</span>
                  <div className="h-px flex-1 bg-amber-100 ml-2" />
                </div>
                <div className="space-y-4">
                  {filtered.filter((p) => (p.targetGroup || 'semua') === 'aparatur').map((parent) => (
                    <div key={parent.id} className="card overflow-hidden ring-1 ring-amber-100 border-l-4 border-l-amber-500">
                      <div className="flex flex-col md:flex-row md:items-center gap-3 px-5 py-4 border-b border-surface-border bg-amber-50/30">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-9 w-9 shrink-0 rounded-lg bg-amber-600 text-white flex items-center justify-center">
                            <IconLayers className="h-4.5 w-4.5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-navy-900 text-sm truncate">{parent.name}</p>
                              <TargetGroupBadge value={parent.targetGroup || 'semua'} />
                            </div>
                            <p className="text-[11px] text-navy-400">
                              {parent.children?.length || 0} jenis diklat · urutan {parent.order || 0}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 md:ml-auto shrink-0">
                          <button className="btn-secondary btn-sm" onClick={() => openEdit(parent)}><IconEdit className="h-3.5 w-3.5" /> Edit</button>
                          <button className="btn-danger btn-sm" onClick={() => openDelete(parent)}><IconTrash className="h-3.5 w-3.5" /> Hapus</button>
                          <button className="btn-primary btn-sm" onClick={() => openAddChild(parent)}><IconPlus className="h-3.5 w-3.5" /> Jenis Diklat</button>
                        </div>
                      </div>
                      {parent.children && parent.children.length > 0 ? (
                        <div className="table-wrap"><table className="data-table"><thead><tr><th className="w-12">No</th><th>Jenis Diklat</th><th className="w-28">Unit Kerja</th><th className="w-24">Urutan</th><th className="w-48 text-right">Aksi</th></tr></thead><tbody>{parent.children.map((child, idx) => (
                        <tr key={child.id}><td className="text-navy-400"><span className="inline-flex items-center gap-1"><IconChevronDown className="h-3 w-3 text-navy-300" />{idx + 1}</span></td><td className="font-semibold text-navy-900">{child.name}</td><td><TargetGroupBadge value={child.targetGroup || 'semua'} /></td><td className="text-navy-500 text-xs">{child.order || 0}</td><td><div className="flex items-center justify-end gap-1.5"><button className="btn-secondary btn-sm" onClick={() => openEdit(child)}><IconEdit className="h-3.5 w-3.5" /> Edit</button><button className="btn-danger btn-sm" onClick={() => openDelete(child, parent)}><IconTrash className="h-3.5 w-3.5" /> Hapus</button></div></td></tr>
                      ))}</tbody></table></div>
                      ) : (
                        <div className="px-5 py-6 text-center"><p className="text-xs text-navy-400">Belum ada jenis diklat. <button className="font-bold text-navy-700 underline underline-offset-2 hover:text-navy-900" onClick={() => openAddChild(parent)}>Tambah jenis diklat pertama</button></p></div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {/* Lainnya (semua) jika ada */}
              {filtered.filter((p) => !['taruna','aparatur'].includes((p.targetGroup||'semua'))).length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3"><span className="h-7 w-7 rounded-lg bg-slate-600 text-white flex items-center justify-center text-xs">🌐</span><h3 className="font-extrabold text-navy-900 text-sm">Umum (Semua UPT)</h3><div className="h-px flex-1 bg-slate-200 ml-2" /></div>
                  <div className="space-y-4">{filtered.filter((p) => !['taruna','aparatur'].includes((p.targetGroup||'semua'))).map((parent) => (
                    <div key={parent.id} className="card overflow-hidden">
                      <div className="flex flex-col md:flex-row md:items-center gap-3 px-5 py-4 border-b border-surface-border bg-navy-50/40">
                        <div className="flex items-center gap-3 min-w-0"><div className="h-9 w-9 shrink-0 rounded-lg bg-navy-800 text-gold-300 flex items-center justify-center"><IconLayers className="h-4.5 w-4.5" /></div><div className="min-w-0"><div className="flex items-center gap-2 flex-wrap"><p className="font-bold text-navy-900 text-sm truncate">{parent.name}</p><TargetGroupBadge value={parent.targetGroup || 'semua'} /></div><p className="text-[11px] text-navy-400">{parent.children?.length || 0} jenis diklat · urutan {parent.order || 0}</p></div></div><div className="flex items-center gap-2 md:ml-auto shrink-0"><button className="btn-secondary btn-sm" onClick={() => openEdit(parent)}><IconEdit className="h-3.5 w-3.5" /> Edit</button><button className="btn-danger btn-sm" onClick={() => openDelete(parent)}><IconTrash className="h-3.5 w-3.5" /> Hapus</button><button className="btn-primary btn-sm" onClick={() => openAddChild(parent)}><IconPlus className="h-3.5 w-3.5" /> Jenis Diklat</button></div>
                      </div>
                      {parent.children && parent.children.length > 0 ? (<div className="table-wrap"><table className="data-table"><thead><tr><th className="w-12">No</th><th>Jenis Diklat</th><th className="w-28">Unit Kerja</th><th className="w-24">Urutan</th><th className="w-48 text-right">Aksi</th></tr></thead><tbody>{parent.children.map((child, idx) => (<tr key={child.id}><td className="text-navy-400"><span className="inline-flex items-center gap-1"><IconChevronDown className="h-3 w-3 text-navy-300" />{idx + 1}</span></td><td className="font-semibold text-navy-900">{child.name}</td><td><TargetGroupBadge value={child.targetGroup || 'semua'} /></td><td className="text-navy-500 text-xs">{child.order || 0}</td><td><div className="flex items-center justify-end gap-1.5"><button className="btn-secondary btn-sm" onClick={() => openEdit(child)}><IconEdit className="h-3.5 w-3.5" /> Edit</button><button className="btn-danger btn-sm" onClick={() => openDelete(child, parent)}><IconTrash className="h-3.5 w-3.5" /> Hapus</button></div></td></tr>))}</tbody></table></div>) : (<div className="px-5 py-6 text-center"><p className="text-xs text-navy-400">Belum ada jenis diklat. <button className="font-bold text-navy-700 underline underline-offset-2 hover:text-navy-900" onClick={() => openAddChild(parent)}>Tambah jenis diklat pertama</button></p></div>)}
                    </div>
                  ))}</div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              {filtered.map((parent) => (
                <div key={parent.id} className={`card overflow-hidden ${activeGroup==='taruna' ? 'ring-1 ring-blue-100 border-l-4 border-l-blue-500' : activeGroup==='aparatur' ? 'ring-1 ring-amber-100 border-l-4 border-l-amber-500' : ''}`}>
                  {/* Header induk */}
                  <div className={`flex flex-col md:flex-row md:items-center gap-3 px-5 py-4 border-b border-surface-border ${activeGroup==='taruna' ? 'bg-blue-50/40' : activeGroup==='aparatur' ? 'bg-amber-50/30' : 'bg-navy-50/40'}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-9 w-9 shrink-0 rounded-lg flex items-center justify-center ${activeGroup==='taruna' ? 'bg-blue-600 text-white' : activeGroup==='aparatur' ? 'bg-amber-600 text-white' : 'bg-navy-800 text-gold-300'}`}>
                        <IconLayers className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-navy-900 text-sm truncate">{parent.name}</p>
                          <TargetGroupBadge value={parent.targetGroup || 'semua'} />
                        </div>
                        <p className="text-[11px] text-navy-400">
                          {parent.children?.length || 0} jenis diklat · urutan {parent.order || 0}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 md:ml-auto shrink-0">
                      <button className="btn-secondary btn-sm" onClick={() => openEdit(parent)}>
                        <IconEdit className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        className="btn-danger btn-sm"
                        onClick={() => openDelete(parent)}
                        title="Hapus program induk beserta seluruh turunannya"
                      >
                        <IconTrash className="h-3.5 w-3.5" /> Hapus
                      </button>
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => openAddChild(parent)}
                      >
                        <IconPlus className="h-3.5 w-3.5" /> Jenis Diklat
                      </button>
                    </div>
                  </div>

              {/* Tabel turunan */}
              {parent.children && parent.children.length > 0 ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th className="w-12">No</th>
                        <th>Jenis Diklat</th>
                        <th className="w-28">Unit Kerja</th>
                        <th className="w-24">Urutan</th>
                        <th className="w-48 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parent.children.map((child, idx) => (
                        <tr key={child.id}>
                          <td className="text-navy-400">
                            <span className="inline-flex items-center gap-1">
                              <IconChevronDown className="h-3 w-3 text-navy-300" />{idx + 1}
                            </span>
                          </td>
                          <td className="font-semibold text-navy-900">{child.name}</td>
                          <td><TargetGroupBadge value={child.targetGroup || 'semua'} /></td>
                          <td className="text-navy-500 text-xs">{child.order || 0}</td>
                          <td>
                            <div className="flex items-center justify-end gap-1.5">
                              <button className="btn-secondary btn-sm" onClick={() => openEdit(child)}>
                                <IconEdit className="h-3.5 w-3.5" /> Edit
                              </button>
                              <button
                                className="btn-danger btn-sm"
                                onClick={() => openDelete(child, parent)}
                                title="Hapus jenis diklat ini"
                              >
                                <IconTrash className="h-3.5 w-3.5" /> Hapus
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-5 py-6 text-center">
                  <p className="text-xs text-navy-400">
                    Belum ada jenis diklat.{' '}
                    <button className="font-bold text-navy-700 underline underline-offset-2 hover:text-navy-900" onClick={() => openAddChild(parent)}>
                      Tambah jenis diklat pertama
                    </button>
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
          )}
        </div>
      )}

      {/* Modal tambah/edit */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        subtitle={
          editing
            ? `Perbarui kategori diklat "${editing.name}".`
            : addMode === 'child'
              ? `Turunan baru di bawah "${parents.find((p) => p.id === childParentId)?.name || ''}".`
              : undefined
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <Alert type="error">{formError}</Alert>}
          <FormField label="Kategori Diklat" required>
            <input
              className="form-input"
              placeholder={addMode === 'child' && !editing ? 'Pola Pembibitan' : 'Pendidikan Pembentukan'}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              autoFocus
            />
          </FormField>
          <FormField label="Unit Kerja">
            <select
              className="form-input"
              value={form.targetGroup}
              onChange={(e) => setForm((f) => ({ ...f, targetGroup: e.target.value }))}
            >
              {TARGET_GROUP_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Urutan Tampil">
            <input
              type="number"
              min={0}
              className="form-input"
              value={form.order}
              onChange={(e) => setForm((f) => ({ ...f, order: Number(e.target.value) || 0 }))}
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Batal</button>
            <button type="submit" className="btn-primary min-w-[140px]" disabled={saving}>
              {saving ? <><Spinner /> Menyimpan...</> : editing ? 'Simpan Perubahan' : 'Tambah Kategori'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal konfirmasi hapus program */}
      <Modal
        open={!!deleteTarget}
        onClose={() => { if (!deleting) setDeleteTarget(null) }}
        title="Hapus Program"
        subtitle={deleteTarget ? `"${deleteTarget.name}"` : ''}
      >
        <div className="space-y-4">
          <Alert type="warning">
            {deleteTarget?.isParent && deleteTarget.childCount > 0 ? (
              <>
                Program induk <strong>{deleteTarget?.name}</strong> beserta <strong>{deleteTarget.childCount} program turunan</strong> akan dihapus secara permanen.
              </>
            ) : (
              <>
                Program <strong>{deleteTarget?.name}</strong> akan dihapus secara permanen.
              </>
            )}
          </Alert>
          <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
            <p className="font-bold mb-1.5">Penghapusan tidak dapat dilakukan jika:</p>
            <ul className="list-disc pl-4 space-y-1 text-xs text-red-600">
              <li>Program sudah memiliki data realisasi yang tersimpan.</li>
              <li>Program sudah memiliki data target PK yang diatur.</li>
            </ul>
            <p className="mt-2 text-xs text-red-500">Jika program belum memiliki data apapun, penghapusan akan berhasil.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Batal
            </button>
            <button
              type="button"
              className="btn-danger min-w-[140px]"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? <><Spinner /> Menghapus...</> : <><IconTrash className="h-4 w-4" /> Hapus Program</>}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
