import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
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
