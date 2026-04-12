import axios from 'axios'

// En producción la URL del backend se inyecta en runtime vía entrypoint.sh.
// El placeholder se reemplaza en los .js compilados. Usamos startsWith('http')
// para detectar si ya fue reemplazado (evita que el sed rompa la condición).
const _raw = import.meta.env.VITE_API_URL as string | undefined
const baseURL = _raw && _raw.startsWith('http') ? `${_raw}/api/v1` : '/api/v1'

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

// Si el token expiró, borra el token. React se encarga de redirigir.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('kapturo_token')
      localStorage.removeItem('kapturo-auth')
      localStorage.removeItem('kapturo-auth-v2')
    }
    return Promise.reject(err)
  }
)

export default api
