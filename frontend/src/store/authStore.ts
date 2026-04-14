import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '../types'
import api from '../api/client'

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  // Impersonación
  superAdminToken: string | null   // token original del super_admin guardado
  isImpersonating: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (companyName: string, fullName: string, email: string, password: string) => Promise<void>
  logout: () => void
  fetchMe: () => Promise<void>
  startImpersonation: (token: string, user: User) => void
  stopImpersonation: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      superAdminToken: null,
      isImpersonating: false,

      login: async (email, password) => {
        const res = await api.post('/auth/login', { email, password })
        const { access_token } = res.data
        localStorage.setItem('kapturo_token', access_token)
        set({ token: access_token, isAuthenticated: true })
        const me = await api.get('/auth/me')
        set({ user: me.data })
      },

      signup: async (company_name, full_name, email, password) => {
        const res = await api.post('/auth/signup', { company_name, full_name, email, password })
        const { access_token } = res.data
        localStorage.setItem('kapturo_token', access_token)
        set({ token: access_token, isAuthenticated: true })
        const me = await api.get('/auth/me')
        set({ user: me.data })
      },

      logout: () => {
        localStorage.removeItem('kapturo_token')
        set({ user: null, token: null, isAuthenticated: false, superAdminToken: null, isImpersonating: false })
      },

      fetchMe: async () => {
        const me = await api.get('/auth/me')
        set({ user: me.data, isAuthenticated: true })
      },

      startImpersonation: (token: string, user: User) => {
        const currentToken = get().token
        localStorage.setItem('kapturo_token', token)
        set({
          superAdminToken: currentToken,
          token: token,
          user: user,
          isImpersonating: true,
        })
      },

      stopImpersonation: async () => {
        const superAdminToken = get().superAdminToken
        if (!superAdminToken) return
        localStorage.setItem('kapturo_token', superAdminToken)
        set({ token: superAdminToken, superAdminToken: null, isImpersonating: false })
        const me = await api.get('/auth/me')
        set({ user: me.data })
      },
    }),
    { name: 'kapturo-auth-v2', partialize: (s) => ({ token: s.token, superAdminToken: s.superAdminToken, isImpersonating: s.isImpersonating }) }
  )
)
