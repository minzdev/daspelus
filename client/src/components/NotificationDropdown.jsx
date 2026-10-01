import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../context/NotificationContext';
import {
  IconBell,
  IconBellRing,
  IconCheckCircle,
  IconXCircle,
  IconClock,
  IconArrowRight,
  IconCheck,
} from './icons';

function formatRelativeTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) return 'Baru saja';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} mnt lalu`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} jam lalu`;
  const diffDays = Math.floor(diffHour / 24);
  if (diffDays === 1) return 'Kemarin';
  if (diffDays < 7) return `${diffDays} hari lalu`;
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

function getCategoryMeta(category) {
  switch (category) {
    case 'approval':
      return {
        icon: IconCheckCircle,
        colorCls: 'text-emerald-500 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800',
        badgeCls: 'bg-emerald-100/80 text-emerald-800 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300',
        label: 'Disetujui',
      };
    case 'rejection':
      return {
        icon: IconXCircle,
        colorCls: 'text-rose-500 bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:border-rose-800',
        badgeCls: 'bg-rose-100/80 text-rose-800 border-rose-200 dark:bg-rose-900/50 dark:text-rose-300',
        label: 'Ditolak',
      };
    case 'request':
      return {
        icon: IconClock,
        colorCls: 'text-amber-500 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800',
        badgeCls: 'bg-amber-100/80 text-amber-800 border-amber-200 dark:bg-amber-900/50 dark:text-amber-300',
        label: 'Permohonan',
      };
    case 'forward':
      return {
        icon: IconArrowRight,
        colorCls: 'text-sky-500 bg-sky-50 border-sky-200 dark:bg-sky-950/40 dark:border-sky-800',
        badgeCls: 'bg-sky-100/80 text-sky-800 border-sky-200 dark:bg-sky-900/50 dark:text-sky-300',
        label: 'Diteruskan',
      };
    default:
      return {
        icon: IconBell,
        colorCls: 'text-blue-500 bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800',
        badgeCls: 'bg-blue-100/80 text-blue-800 border-blue-200 dark:bg-blue-900/50 dark:text-blue-300',
        label: 'Informasi',
      };
  }
}

function getTypeBadge(type) {
  switch (type) {
    case 'target_pk':
      return { label: 'Target PK', cls: 'bg-indigo-600 text-white border-indigo-600', soft: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
    case 'realisasi':
      return { label: 'Realisasi', cls: 'bg-blue-600 text-white border-blue-600', soft: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'unlock_request':
      return { label: 'Buka Kunci', cls: 'bg-amber-500 text-white border-amber-500', soft: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'taruna':
      return { label: 'Data Taruna', cls: 'bg-emerald-600 text-white border-emerald-600', soft: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'penyerapan':
      return { label: 'Penyerapan', cls: 'bg-purple-600 text-white border-purple-600', soft: 'bg-purple-50 text-purple-700 border-purple-200' };
    default:
      return { label: 'Umum', cls: 'bg-slate-500 text-white border-slate-500', soft: 'bg-slate-100 text-slate-600 border-slate-200' };
  }
}

export default function NotificationDropdown() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'unread' | 'approval' | 'request'
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const filtered = notifications.filter((n) => {
    if (activeTab === 'unread') return !n.isRead;
    if (activeTab === 'approval') return n.category === 'approval' || n.category === 'forward';
    if (activeTab === 'request') return n.category === 'request' || n.category === 'rejection';
    return true;
  });

  const handleItemClick = (item) => {
    if (!item.isRead) {
      markAsRead(item.id);
    }
    setIsOpen(false);
    if (item.link) {
      navigate(item.link);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className={`relative flex items-center justify-center h-10 w-10 rounded-xl transition-all duration-200 ${
          isOpen
            ? 'bg-white/20 text-white shadow-inner ring-2 ring-white/30'
            : 'bg-white/10 hover:bg-white/15 text-white border border-white/15 backdrop-blur-md'
        }`}
        title="Pusat Notifikasi"
        aria-label="Notifikasi"
      >
        {unreadCount > 0 ? (
          <IconBellRing className="h-5 w-5 text-gold-300 animate-pulse" />
        ) : (
          <IconBell className="h-5 w-5 text-navy-200 hover:text-white transition-colors" />
        )}

        {/* Counter Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white shadow-md ring-2 ring-navy-950 animate-fadeUp">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2.5 w-[330px] sm:w-[390px] rounded-2xl bg-white shadow-2xl ring-1 ring-black/10 border border-slate-100 z-50 overflow-hidden animate-fadeUp">
          {/* Header Panel */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-navy-950 tracking-tight">Notifikasi</h3>
              {unreadCount > 0 && (
                <span className="rounded-full bg-rose-100 text-rose-700 px-2 py-0.5 text-[10px] font-extrabold border border-rose-200">
                  {unreadCount} baru
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-1 text-[11px] font-bold text-navy-600 hover:text-navy-900 transition-colors"
                title="Tandai semua pesan sudah dibaca"
              >
                <IconCheck className="h-3.5 w-3.5 text-emerald-600" />
                <span>Tandai Semua Dibaca</span>
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 border-b border-slate-100 bg-white px-3 py-1.5 text-xs">
            <button
              onClick={() => setActiveTab('all')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                activeTab === 'all'
                  ? 'bg-navy-900 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              Semua
            </button>
            <button
              onClick={() => setActiveTab('unread')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors flex items-center gap-1 ${
                activeTab === 'unread'
                  ? 'bg-navy-900 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span>Belum Dibaca</span>
              {unreadCount > 0 && (
                <span className={`rounded-full px-1.5 py-0.2 text-[9px] font-black ${
                  activeTab === 'unread' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-600'
                }`}>
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('approval')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                activeTab === 'approval'
                  ? 'bg-navy-900 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              Persetujuan
            </button>
            <button
              onClick={() => setActiveTab('request')}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                activeTab === 'request'
                  ? 'bg-navy-900 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              Permintaan
            </button>
          </div>

          {/* List Notifikasi */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                <div className="h-11 w-11 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-2.5">
                  <IconBell className="h-5 w-5" />
                </div>
                <p className="text-xs font-bold text-slate-700">Tidak ada notifikasi</p>
                <p className="text-[11px] text-slate-400 mt-0.5 max-w-[220px]">
                  {activeTab === 'unread'
                    ? 'Semua notifikasi Anda sudah dibaca.'
                    : 'Belum ada aktivitas persetujuan atau permohonan baru.'}
                </p>
              </div>
            ) : (
              filtered.map((item) => {
                const catMeta = getCategoryMeta(item.category);
                const typeMeta = getTypeBadge(item.type);
                const IconCat = catMeta.icon;

                return (
                  <div
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className={`group relative flex items-start gap-3 p-3.5 cursor-pointer transition-colors ${
                      !item.isRead
                        ? 'bg-blue-50/50 hover:bg-blue-50/80 border-l-4 border-l-blue-600'
                        : 'hover:bg-slate-50/80 border-l-4 border-l-transparent'
                    }`}
                  >
                    {/* Type Icon (warna tegas per jenis) */}
                    <div
                      className={`h-9 w-9 shrink-0 rounded-xl flex items-center justify-center text-white shadow-sm ${typeMeta.cls.split(' ').slice(0, 2).join(' ')}`}
                    >
                      <IconCat className="h-4 w-4" />
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider border ${typeMeta.cls}`}
                        >
                          {typeMeta.label}
                        </span>
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[9px] font-extrabold border ${catMeta.badgeCls}`}
                        >
                          {catMeta.label}
                        </span>
                        <span className="text-[10px] text-slate-400 ml-auto font-semibold whitespace-nowrap">
                          {formatRelativeTime(item.createdAt)}
                        </span>
                      </div>

                      <h4 className={`text-[13px] mt-1 leading-snug ${!item.isRead ? 'font-black text-navy-950' : 'font-bold text-slate-700'}`}>
                        {item.title}
                      </h4>

                      <p className={`text-[11px] mt-0.5 leading-relaxed ${!item.isRead ? 'text-slate-600 font-medium' : 'text-slate-500 line-clamp-2'}`}>
                        {item.message}
                      </p>

                      {item.senderName && (
                        <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] text-slate-500">
                          Oleh <strong className="text-navy-800">{item.senderName}</strong>
                        </p>
                      )}
                    </div>

                    {/* Unread Dot */}
                    {!item.isRead && (
                      <span className="h-2.5 w-2.5 rounded-full bg-blue-600 ring-4 ring-blue-100 shrink-0 self-center" />
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Panel */}
          <div className="border-t border-slate-100 bg-slate-50/50 p-2 text-center">
            <p className="text-[10px] font-semibold text-slate-400">
              Notifikasi terintegrasi otomatis untuk seluruh alur persetujuan
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
