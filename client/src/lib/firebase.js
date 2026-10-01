/**
 * Auth module — replaces Firebase Auth with JWT-based server auth.
 * Exports same interface as before for backward compatibility.
 */
import api from './api'

/**
 * Stub for `auth` — previously Firebase Auth instance.
 * Client code checks `auth?.currentUser` which will be null.
 * We manage token state via localStorage instead.
 */
export const auth = null

/** Tidak digunakan lagi (JWT token di-manage via localStorage). */
export const firebaseConfigured = false

/** Login email + password via server API, return JWT token. */
export async function loginWithEmail(email, password) {
  try {
    const { data } = await api.post('/auth/login', { email, password })
    // Simpan token JWT di localStorage
    localStorage.setItem('daspeslus_token', data.token)
    return data.user
  } catch (err) {
    // Re-throw dengan format yang kompatibel dengan AuthContext
    const error = new Error(
      err?.response?.data?.error || 'Login gagal. Silakan coba lagi.'
    )
    error.code = err?.response?.status === 401 ? 'auth/invalid-credential' : 'auth/network-request-failed'
    throw error
  }
}

/** Logout — hapus token dari localStorage. */
export async function logout() {
  localStorage.removeItem('daspeslus_token')
  localStorage.removeItem('daspeslus_user')
}

/** Terjemahkan error auth ke bahasa Indonesia. */
export function translateAuthError(err) {
  const map = {
    'auth/not-configured': 'Konfigurasi auth belum tersedia.',
    'auth/invalid-credential': 'Email atau password salah.',
    'auth/user-not-found': 'Akun tidak ditemukan.',
    'auth/wrong-password': 'Password salah.',
    'auth/invalid-email': 'Format email tidak valid.',
    'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi beberapa saat.',
    'auth/user-disabled': 'Akun dinonaktifkan. Hubungi admin BPSDMP.',
    'auth/network-request-failed': 'Gagal terhubung ke server. Periksa koneksi internet.',
  }
  return map[err?.code] || err?.message || 'Login gagal. Silakan coba lagi.'
}
