import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { STATUS_META, fmtPct } from '../utils/format'
import { IconX, IconEye, IconEyeOff, IconAlertTriangle, IconInfo, IconTrash } from './icons'

/* ============ Kartu Statistik ============ */
export function StatCard({ icon, label, value, sub, tone = 'navy', delay = 0 }) {
  const tones = {
    navy: { iconBg: 'bg-navy-800 text-gold-300', bar: 'bg-navy-600' },
    gold: { iconBg: 'bg-gold-500 text-white', bar: 'bg-gold-500' },
    emerald: { iconBg: 'bg-emerald-600 text-white', bar: 'bg-emerald-500' },
    slate: { iconBg: 'bg-slate-700 text-white', bar: 'bg-slate-500' },
    sky: { iconBg: 'bg-sky-600 text-white', bar: 'bg-sky-500' },
    rose: { iconBg: 'bg-rose-600 text-white', bar: 'bg-rose-500' },
  }
  const t = tones[tone] || tones.navy

  return (
    <div
      className="card card-hover p-5 animate-fadeUp relative overflow-hidden"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={clsx('absolute inset-x-0 top-0 h-1', t.bar)} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-navy-400">{label}</p>
          <p className="mt-2 text-2xl font-extrabold text-navy-900 tabular-nums tracking-tight">
            {value}
          </p>
          {sub && <p className="mt-1 text-xs text-navy-500">{sub}</p>}
        </div>
        <div className={clsx('stat-icon', t.iconBg)}>{icon}</div>
      </div>
    </div>
  )
}

/* ============ Progress bar capaian ============ */
export function ProgressBar({ value, tone, showLabel = true, compact = false }) {
  const v = Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0
  const width = Math.min(100, v)
  const fillCls =
    tone === 'gold' ? 'progress-fill-gold' : v >= 100 ? 'progress-fill-success' : ''

  return (
    <div className={clsx('flex items-center gap-2 w-full', compact ? 'min-w-0' : 'min-w-[140px]')}>
      <div className="progress-track flex-1">
        <div className={clsx('progress-fill', fillCls)} style={{ width: `${width}%` }} />
      </div>
      {showLabel && (
        <span className={clsx('text-xs font-bold text-navy-700 tabular-nums text-right shrink-0', compact ? 'w-12' : 'w-14')}>
          {fmtPct(v)}
        </span>
      )}
    </div>
  )
}

/* ============ Badge status capaian ============ */
export function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.TARGET_BELUM_DIATUR
  return (
    <span className={meta.cls}>
      <span className="badge-dot" />
      {meta.label}
    </span>
  )
}

/* ============ Badge status aktif/nonaktif ============ */
export function ActiveBadge({ active }) {
  return active ? (
    <span className="badge-success"><span className="badge-dot" />Aktif</span>
  ) : (
    <span className="badge-neutral"><span className="badge-dot" />Nonaktif</span>
  )
}

/* ============ Modal ============ */
export function Modal({ open, onClose, title, subtitle, children, wide = false }) {
  // Kunci scroll background + tutup via tombol Escape saat modal terbuka
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  // Portal ke document.body agar position:fixed tidak dirusak oleh
  // transform/animasi (animate-fadeUp) pada elemen leluhur halaman.
  return createPortal(
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-flex" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div
          className={clsx('modal-panel', wide && 'max-w-2xl')}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <div className="flex items-start justify-between gap-4 px-5 sm:px-6 pt-5 pb-4 border-b border-surface-border sticky top-0 bg-white rounded-t-2xl z-10">
            <div>
              <h3 className="text-base font-bold text-navy-900">{title}</h3>
              {subtitle && <p className="text-xs text-navy-500 mt-0.5">{subtitle}</p>}
            </div>
            <button className="btn-ghost btn-icon -mr-1 shrink-0" onClick={onClose} aria-label="Tutup">
              <IconX className="h-4.5 w-4.5" />
            </button>
          </div>
          <div className="px-5 sm:px-6 py-5">{children}</div>
        </div>
      </div>
    </div>,
    document.body
  )
}

/* ============ Empty state ============ */
export function EmptyState({ icon, title, desc, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center animate-fadeIn">
      <div className="h-14 w-14 rounded-2xl bg-navy-50 text-navy-400 flex items-center justify-center mb-4">
        {icon}
      </div>
      <h4 className="text-sm font-bold text-navy-800">{title}</h4>
      {desc && <p className="text-xs text-navy-400 mt-1.5 max-w-sm leading-relaxed">{desc}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/* ============ Skeleton ============ */
export function SkeletonRows({ rows = 5, cols = 4 }) {
  return (
    <div className="p-4 space-y-3">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="skeleton h-5 flex-1" style={{ maxWidth: c === 0 ? '220px' : undefined }} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonCards({ count = 4 }) {
  return (
    <div className={clsx('grid gap-4', count === 4 ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3')}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-5">
          <div className="skeleton h-3 w-24 mb-4" />
          <div className="skeleton h-7 w-20 mb-3" />
          <div className="skeleton h-3 w-32" />
        </div>
      ))}
    </div>
  )
}

/* ============ Spinner dalam tombol ============ */
export function Spinner({ className = 'h-4 w-4' }) {
  return (
    <svg className={clsx('animate-spin', className)} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

/* ============ Form field ============ */
export function FormField({ label, error, hint, children, required = false, className }) {
  return (
    <div className={className}>
      <label className="form-label">
        {label} {required && <span className="text-gold-600">*</span>}
      </label>
      {children}
      {error ? <p className="form-error">{error}</p> : hint ? <p className="form-hint">{hint}</p> : null}
    </div>
  )
}

/* ============ Input password dengan tombol lihat ============ */
export function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  autoComplete,
  showLabel = false,
  defaultVisible = false,
  className = '',
}) {
  const [visible, setVisible] = useState(defaultVisible)
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        className={clsx('form-input tabular-nums', showLabel ? 'pr-28' : 'pr-14', className)}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        title={visible ? 'Sembunyikan password' : 'Lihat password'}
        aria-label={visible ? 'Sembunyikan password' : 'Lihat password'}
        className={clsx(
          'absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 rounded-md px-2.5 py-1.5',
          'text-[10px] font-extrabold uppercase tracking-wider transition-all duration-150',
          'focus:outline-none focus:ring-2 focus:ring-gold-300',
          visible
            ? 'bg-gold-500 text-white shadow-sm hover:bg-gold-400'
            : 'bg-navy-800 text-gold-300 shadow-sm hover:bg-navy-700'
        )}
      >
        {visible ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
        {showLabel && (visible ? 'Tutup' : 'Lihat')}
      </button>
    </div>
  )
}

/* ============ Alert ============ */
export function Alert({ type = 'info', children }) {
  const cls = type === 'error' ? 'alert-error' : type === 'success' ? 'alert-success' : 'alert-info'
  return <div className={cls}>{children}</div>
}

/* ============ Dialog Konfirmasi Profesional ============
 * Dipakai untuk aksi destruktif/sensitif: hapus data, kirim laporan, unlock, dsb.
 * Contoh: <ConfirmDialog open={...} onClose={...} onConfirm={...} title="..." desc="..." confirmText="Hapus" confirmTone="danger" />
 */
export function ConfirmDialog({
  open,
  onCancel,
  onClose,
  onConfirm,
  title,
  body,
  desc,
  confirmLabel = 'Ya, Lanjutkan',
  confirmText,
  cancelLabel = 'Batal',
  confirmTone = 'danger',
  loading = false,
  icon,
  children,
}) {
  const handleClose = () => {
    if (loading) return
    if (onClose) onClose()
    else if (onCancel) onCancel()
  }

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => {
      if (e.key === 'Escape' && !loading) handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, loading])

  if (!open) return null

  const cLabel = confirmText || confirmLabel
  const content = body || desc

  const toneConfig = {
    danger: {
      iconBg: 'bg-rose-100/80 text-rose-600 ring-8 ring-rose-50 border border-rose-200/60',
      btn: 'btn-danger !bg-rose-600 hover:!bg-rose-700 text-white shadow-md shadow-rose-600/20',
      defaultIcon: <IconTrash className="h-5 w-5" />,
    },
    gold: {
      iconBg: 'bg-amber-100/80 text-amber-600 ring-8 ring-amber-50 border border-amber-200/60',
      btn: 'btn-gold shadow-md shadow-amber-500/20',
      defaultIcon: <IconAlertTriangle className="h-5 w-5" />,
    },
    primary: {
      iconBg: 'bg-sky-100/80 text-sky-600 ring-8 ring-sky-50 border border-sky-200/60',
      btn: 'btn-primary shadow-md shadow-sky-500/20',
      defaultIcon: <IconInfo className="h-5 w-5" />,
    },
  }[confirmTone] || {
    iconBg: 'bg-rose-100 text-rose-600 ring-8 ring-rose-50',
    btn: 'btn-danger',
    defaultIcon: <IconAlertTriangle className="h-5 w-5" />,
  }

  return createPortal(
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="modal-flex" onMouseDown={(e) => e.target === e.currentTarget && handleClose()}>
        <div
          className="modal-panel max-w-md p-6 sm:p-7 text-left space-y-5 rounded-2xl border border-surface-border bg-white shadow-2xl animate-scaleUp"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-start gap-4">
            <div className={clsx('h-11 w-11 rounded-2xl flex items-center justify-center shrink-0', toneConfig.iconBg)}>
              {icon || toneConfig.defaultIcon}
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <h3 className="text-base font-black text-navy-950 tracking-tight leading-snug">
                {title}
              </h3>
              {content && (
                <div className="mt-1.5 text-xs text-slate-600 leading-relaxed font-normal">
                  {content}
                </div>
              )}
              {children}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              className="btn-secondary !text-xs !py-2.5 !px-4 rounded-xl font-bold"
              onClick={handleClose}
              disabled={loading}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              className={clsx(toneConfig.btn, '!text-xs !py-2.5 !px-4.5 rounded-xl font-bold flex items-center gap-2')}
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Spinner className="h-3.5 w-3.5" />
                  <span>Memproses...</span>
                </>
              ) : (
                <span>{cLabel}</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
