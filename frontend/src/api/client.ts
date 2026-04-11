import axios from 'axios'

// En producción usa la URL del backend de Railway, en dev usa el proxy de Vite
const baseURL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/v1`
  : '/api/v1'

const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
})

// Adjunta el token JWT a cada request automáticamente
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('kapturo_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Si el token expiró, redirige al login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('kapturo_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
