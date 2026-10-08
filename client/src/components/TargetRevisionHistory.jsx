import { Fragment, useState } from 'react'
import { fmtNum, fmtDateTime } from '../utils/format'

function fmtDelta(v) {
  const n = Number(v) || 0
  if (n === 0) return <span className="text-slate-300">±0</span>
  const cls = n > 0 ? 'text-emerald-600' : 'text-red-500'
  return <span className={`${cls} font-bold`}>{n > 0 ? `+${fmtNum(n)}` : `−${fmtNum(Math.abs(n))}`}</span>
}

function triggerBadge(trigger) {
  const t = String(trigger || '').toLowerCase()
  if (t.startsWith('awal')) return 'bg-navy-900 text-white'
  if (t.includes('import')) return 'bg-sky-100 text-sky-700 ring-1 ring-sky-200'
  if (t.includes('hapus')) return 'bg-red-50 text-red-700 ring-1 ring-red-200'
  return 'bg-amber-100 text-amber-800 ring-1 ring-amber-200'
}

/**
 * Riwayat Target PK: Target Awal (#1) + seluruh revisi.
 * Menampilkan setiap perubahan angka + waktu. Angka yang dipakai di
 * laporan/dashboard selalu revisi terakhir (terbaru).
 */
export default function TargetRevisionHistory({ revisions = [], year, compact = false }) {
  const [openNo, setOpenNo] = useState(null)
  const list = Array.isArray(revisions) ? revisions : []
  if (!list.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-3">
        <p className="text-xs text-slate-400 italic">Belum ada riwayat perubahan — target masih kosong atau baru pertama disimpan.</p>
      </div>
    )
  }
  const first = list[0]
  const last = list[list.length - 1]
  const revised = list.length > 1

  return (
    <div className="space-y-3">
      {/* Ringkasan Awal → Terkini */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Target Awal (pengisian pertama)</p>
          <p className="mt-1 text-sm font-black tabular-nums text-slate-900">
            <span className="text-sky-700">P: {fmtNum(first.peserta)}</span>
            <span className="text-slate-300 mx-1">·</span>
            <span className="text-emerald-700">L: {fmtNum(first.lulusan)}</span>
            <span className="text-slate-300 mx-1">·</span>
            <span>Total {fmtNum(first.total)}</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            #{first.no} · {first.at ? fmtDateTime(first.at) : '—'}{first.createdByName ? ` · oleh ${first.createdByName}` : ''}
          </p>
        </div>
        <div className={`rounded-xl border px-4 py-3 ${revised ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-slate-50/60'}`}>
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500">
            Target Berlaku (update terakhir){revised ? ` · revisi ke-${last.no - 1}` : ''}
          </p>
          {revised ? (
            <>
              <p className="mt-1 text-sm font-black tabular-nums text-slate-900">
                <span className="text-sky-700">P: {fmtNum(last.peserta)}</span>
                <span className="text-slate-300 mx-1">·</span>
                <span className="text-emerald-700">L: {fmtNum(last.lulusan)}</span>
                <span className="text-slate-300 mx-1">·</span>
                <span>Total {fmtNum(last.total)}</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                #{last.no} · {last.at ? fmtDateTime(last.at) : '—'}{last.createdByName ? ` · oleh ${last.createdByName}` : ''} · dipakai di seluruh laporan & capaian
              </p>
            </>
          ) : (
            <p className="mt-1 text-xs text-slate-400 italic">Belum ada revisi — masih memakai Target Awal.</p>
          )}
        </div>
      </div>

      {!compact && revised && (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: 640 }}>
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/60 text-[10px] uppercase tracking-widest text-slate-500">
                  <th className="text-left px-3 py-2.5">Riwayat</th>
                  <th className="text-left px-3 py-2.5">Waktu Perubahan</th>
                  <th className="text-right px-3 py-2.5 text-sky-700">Peserta</th>
                  <th className="text-right px-3 py-2.5 text-emerald-700">Lulusan</th>
                  <th className="text-right px-3 py-2.5">Selisih Total</th>
                  <th className="text-left px-3 py-2.5">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {list.map((r) => {
                  const isOpen = openNo === r.no
                  const hasItems = Array.isArray(r.items) && r.items.length > 0
                  return (
                    <Fragment key={r.no}>
                      <tr className={isOpen ? 'bg-navy-50/40' : 'hover:bg-slate-50/60'}>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold ${r.kind === 'awal' ? 'bg-navy-900 text-white' : 'bg-amber-100 text-amber-800'}`}>
                            {r.kind === 'awal' ? 'Awal' : `Revisi ${r.no - 1}`}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-slate-700 whitespace-nowrap">{r.at ? fmtDateTime(r.at) : '—'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-bold text-slate-900">
                          {fmtNum(r.peserta)} <span className="font-normal">({fmtDelta(r.deltaPeserta)})</span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-bold text-slate-900">
                          {fmtNum(r.lulusan)} <span className="font-normal">({fmtDelta(r.deltaLulusan)})</span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{fmtDelta(r.deltaTotal)}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${triggerBadge(r.trigger)}`}>{r.trigger || '-'}</span>
                            {r.createdByName && <span className="text-[10px] text-slate-400 truncate max-w-[120px]" title={r.createdByName}>{r.createdByName}</span>}
                            {hasItems && (
                              <button
                                type="button"
                                className="text-[10px] font-bold text-navy-700 hover:underline"
                                onClick={() => setOpenNo(isOpen ? null : r.no)}
                              >
                                {isOpen ? 'Tutup rincian' : 'Rincian program'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isOpen && hasItems && (
                        <tr key={`${r.no}-detail`} className="bg-slate-50/60">
                          <td colSpan={6} className="px-4 py-2">
                            <div className="grid gap-1">
                              {r.items.filter((it) => (Number(it.targetPeserta) || 0) + (Number(it.targetLulusan) || 0) > 0).map((it) => (
                                <div key={it.programId} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-white px-3 py-1.5">
                                  <span className="text-[11px] font-semibold text-slate-600 truncate">
                                    • {it.programName || it.programId}
                                    {it.isNew && <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-extrabold text-emerald-700">BARU</span>}
                                  </span>
                                  <span className="text-[11px] tabular-nums text-slate-500 whitespace-nowrap">
                                    {fmtNum(it.targetPeserta)} / {fmtNum(it.targetLulusan)}
                                    {(Number(it.deltaPeserta) || Number(it.deltaLulusan)) ? (
                                      <span className="ml-1.5">({fmtDelta(it.deltaPeserta)} P · {fmtDelta(it.deltaLulusan)} L)</span>
                                    ) : null}
                                  </span>
                                </div>
                              ))}
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
          <p className="bg-slate-50/70 px-3 py-2 text-[10px] text-slate-400 border-t border-slate-100">
            {list.length}× penyimpanan tercatat untuk tahun {year} · Target Awal = penyimpanan pertama · setiap angka & waktu perubahan terekam otomatis setiap simpan/import/hapus setelah unlock.
          </p>
        </div>
      )}
    </div>
  )
}
