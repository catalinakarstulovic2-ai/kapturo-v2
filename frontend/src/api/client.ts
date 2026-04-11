import axios from 'axios'

// En producción la URL del backend se inyecta en runtime vía entrypoint.sh
// (el placeholder RUNTIME_API_URL_PLACEHOLDER se reemplaza en los .js compilados)
// En dev usa el proxy de Vite → '/api/v1'
const getBaseURL = (): string => {
  const env = import.meta.env.VITE_API_URL as string | undefined
  if (!env || env === 'RUNTIME_API_URL_PLACEHOLDER') return '/api/v1'
  return `${env}/api/v1`
}

const baseURL = getBaseURL()

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
