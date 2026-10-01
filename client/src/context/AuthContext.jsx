import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { loginWithEmail, logout as doLogout } from '../lib/firebase'
import api from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  /** Load profile dari server menggunakan JWT token dari localStorage */
  const fetchProfile = useCallback(async () => {
    const token = localStorage.getItem('daspeslus_token')
    if (!token) {
      setUser(null)
      return
    }
    // Retry bila gagal karena network
    const isNetwork = (err) =>
      err?.code === 'ERR_NETWORK' || (err?.response?.status >= 502)
    const maxTries = 3
    for (let i = 1; i <= maxTries; i++) {
      try {
        const { data } = await api.get('/auth/me')
        setUser(data.user)
        localStorage.setItem('daspeslus_user', JSON.stringify(data.user))
        return
      } catch (err) {
        if (isNetwork(err) && i < maxTries) {
          await new Promise((r) => setTimeout(r, 800 * i))
          continue
        }
        // Token invalid/expired — logout
        localStorage.removeItem('daspeslus_token')
        localStorage.removeItem('daspeslus_user')
        setUser(null)
        return
      }
    }
  }, [])

  useEffect(() => {
    // Coba load profile saat app mount (jika ada token tersimpan)
    fetchProfile().finally(() => setLoading(false))
  }, [fetchProfile])

  const login = useCallback(async (email, password) => {
    try {
      await loginWithEmail(email, password)
      await fetchProfile()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message || 'Login gagal.' }
    }
  }, [fetchProfile])

  const logout = useCallback(async () => {
    await doLogout()
    setUser(null)
  }, [])

  const refreshProfile = useCallback(() => fetchProfile(), [fetchProfile])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth harus dipakai di dalam AuthProvider')
  return ctx
}
