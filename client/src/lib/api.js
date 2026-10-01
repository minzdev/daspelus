import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
})

// Lampirkan JWT token dari localStorage di setiap request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('daspeslus_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle 401 responses (token expired/invalid) — redirect ke login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('daspeslus_token')
      localStorage.removeItem('daspeslus_user')
      // Hanya redirect jika tidak sudah di halaman login
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

/** Ekstrak pesan error dari respons axios (tampilkan pesan asli server bila ada). */
export function apiError(err) {
  const data = err?.response?.data
  if (data?.error) return data.error
  if (data?.message && typeof data.message === 'string') return data.message
  if (err?.code === 'ERR_NETWORK') return 'Tidak dapat terhubung ke server API. Pastikan server berjalan.'
  const status = err?.response?.status
  if (status) return `Server merespons ${status}. Silakan coba lagi / hubungi admin.`
  return 'Terjadi kesalahan. Silakan coba lagi.'
}

export default api
