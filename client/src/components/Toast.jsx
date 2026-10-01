import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { IconCheck, IconX, IconWarning, IconInfo } from './icons'

/* ============ Toast global ============
 * Provider + hook useToast() untuk feedback ekstensi. Contoh implikasi:
 *   toast.success('Laporan berhasil dikirim')
 *   toast.error('Gagal menyimpan data')
 * Toast tampil di kanan-bawah, otomatis hilang (progress bar), bisa ditutup manual.
 */

const ToastContext = createContext(null)

let toastId = 0

const TONES = {
  success: { ring: 'ring-emerald-300', bg: 'bg-emerald-600' },
  error: { ring: 'ring-red-300', bg: 'bg-red-600' },
  warning: { ring: 'ring-gold-400/60', bg: 'bg-gold-500' },
  info: { ring: 'ring-navy-100', bg: 'bg-navy-500' },
}

const DEFAULT_DURATION = { success: 3500, info: 3500, warning: 5000, error: 5500 }

function ToastItem({ toast, onClose }) {
  const tone = TONES[toast.type] || TONES.info
  const Icon =
    toast.type === 'success' ? IconCheck : toast.type === 'error' || toast.type === 'warning' ? IconWarning : IconInfo
  return (
    <div
      className={clsx(
        'toast-item animate-toast-in flex w-full max-w-sm items-start gap-3 rounded-xl bg-white p-3.5 shadow-xl ring-1',
        tone.ring
      )}
      role="status"
    >
      <span className={clsx('toast-icon shrink-0 rounded-lg', tone.bg)}>
        <Icon className="h-4 w-4 text-white" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold leading-snug text-navy-900">{toast.title}</p>
        {toast.text && <p className="mt-0.5 text-xs leading-snug text-navy-500">{toast.text}</p>}
      </div>
      <button
        type="button"
        className="btn-ghost btn-icon -mr-1 -mt-1 shrink-0"
        onClick={onClose}
        aria-label="Tutup notifikasi"
      >
        <IconX className="h-3.5 w-3.5" />
      </button>
      {/* Progress bar auto-dismiss */}
      <span
        className="toast-progress absolute bottom-0 left-0 h-0.5 rounded-full"
        style={{ backgroundColor: 'currentColor', animationDuration: `${toast.duration}ms` }}
      />
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timeouts = useRef({})

  const dismiss = useCallback((id) => {
    clearTimeout(timeouts.current[id])
    delete timeouts.current[id]
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (type, title, text, duration) => {
      const id = ++toastId
      const d = duration ?? DEFAULT_DURATION[type] ?? 4000
      setToasts((prev) => [...prev.slice(-4), { id, type, title, text, duration: d }])
      timeouts.current[id] = setTimeout(() => dismiss(id), d)
      return id
    },
    [dismiss]
  )

  const api = useMemo(
    () => ({
      success: (title, text, duration) => push('success', title, text, duration),
      error: (title, text, duration) => push('error', title, text, duration),
      warning: (title, text, duration) => push('warning', title, text, duration),
      info: (title, text, duration) => push('info', title, text, duration),
      dismiss,
    }),
    [push, dismiss]
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col items-end gap-2 p-1">
            {toasts.map((t) => (
              <div key={t.id} className="pointer-events-auto relative w-full max-w-sm">
                <ToastItem toast={t} onClose={() => dismiss(t.id)} />
              </div>
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast harus dipakai di dalam <ToastProvider>')
  return ctx
}
