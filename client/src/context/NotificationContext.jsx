import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const pollTimerRef = useRef(null);

  const fetchNotifications = useCallback(async (isSilent = false) => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    if (!isSilent) setLoading(true);
    try {
      const { data } = await api.get('/notifications');
      const list = Array.isArray(data?.notifications) ? data.notifications : [];
      setNotifications(list);
      setUnreadCount(Number(data?.unreadCount) || 0);
    } catch (err) {
      console.warn('[notifications] Failed to fetch:', err?.response?.data || err.message);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [user]);

  // Initial load & Polling setiap 30 detik jika user aktif
  useEffect(() => {
    if (user) {
      fetchNotifications();
      pollTimerRef.current = setInterval(() => {
        fetchNotifications(true);
      }, 30000);
    } else {
      setNotifications([]);
      setUnreadCount(0);
    }

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [user, fetchNotifications]);

  // Tandai satu notifikasi telah dibaca
  const markAsRead = useCallback(async (id) => {
    if (!id) return;
    // Optimistic UI update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      await api.patch(`/notifications/${id}/read`);
    } catch (err) {
      console.error('[notifications] Failed to mark read:', err);
    }
  }, []);

  // Tandai semua notifikasi telah dibaca
  const markAllAsRead = useCallback(async () => {
    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);

    try {
      await api.patch('/notifications/mark-all-read');
    } catch (err) {
      console.error('[notifications] Failed to mark all read:', err);
      // Re-fetch on error
      fetchNotifications(true);
    }
  }, [fetchNotifications]);

  const value = {
    notifications,
    unreadCount,
    loading,
    refetch: fetchNotifications,
    markAsRead,
    markAllAsRead,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return ctx;
}
