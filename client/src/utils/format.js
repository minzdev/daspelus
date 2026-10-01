export const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/** Format angka gaya Indonesia: 12.345 */
export function fmtNum(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '0'
  return v.toLocaleString('id-ID')
}

/** Format persen: 87,5% */
export function fmtPct(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '-'
  return `${v.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`
}

/** Tahun yang tersedia di dropdown (tahun lalu .. tahun depan) */
export function yearOptions(currentYear = new Date().getFullYear()) {
  const list = []
  for (let y = currentYear + 1; y >= currentYear - 3; y--) list.push(y)
  return list
}

/** Format Firestore timestamp ke tanggal Indonesia */
export function fmtDate(ts) {
  if (!ts) return '-'
  let d
  if (ts?.toDate) d = ts.toDate()
  else if (ts?._seconds) d = new Date(ts._seconds * 1000)
  else if (ts?.seconds) d = new Date(ts.seconds * 1000)
  else d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Format timestamp real-time tanggal & jam Indonesia: 24 Agu 2026, 08:55 */
export function fmtDateTime(ts) {
  if (!ts) return '-'
  let d
  if (ts?.toDate) d = ts.toDate()
  else if (ts?._seconds) d = new Date(ts._seconds * 1000)
  else if (ts?.seconds) d = new Date(ts.seconds * 1000)
  else d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '-'
  const dateStr = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
  const timeStr = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  return `${dateStr}, ${timeStr} WIB`
}

/** Metadata tampilan status capaian PK & Laporan */
export const STATUS_META = {
  TERLAPOR: { label: 'Terlapor', cls: 'badge-success' },
  TERKIRIM: { label: 'Terkirim', cls: 'badge-success' },
  DRAF: { label: 'Draf', cls: 'badge-warning' },
  TERCAPAI: { label: 'Tercapai', cls: 'badge-success' },
  BELUM_TERCAPAI: { label: 'Belum Tercapai', cls: 'badge-danger' },
  TARGET_BELUM_DIATUR: { label: 'Target Belum Diatur', cls: 'badge-neutral' },
}

/** Nilai minimum 0 untuk input angka */
export function numMin0(v) {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/* ============ Nomor HP / WhatsApp Indonesia ============ */

/** Normalisasi ke digit internasional: 0812... / +62812... -> 62812... */
export function normalizePhone(raw) {
  let d = String(raw || '').replace(/[^\d+]/g, '')
  if (d.startsWith('+')) d = d.slice(1)
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('0')) d = '62' + d.slice(1)
  return d
}

/** Validasi nomor HP Indonesia (08xx atau +628xx, 10-14 digit). */
export function isValidPhone(raw) {
  return /^628\d{8,12}$/.test(normalizePhone(raw))
}

/** Format tampilan: +62 812-3456-7890 */
export function fmtPhone(raw) {
  const d = normalizePhone(raw)
  if (!/^62\d+$/.test(d)) return raw || '-'
  return `+${d}`
}

/** Link chat WhatsApp: https://wa.me/62812... */
export function waLink(raw) {
  return `https://wa.me/${normalizePhone(raw)}`
}
