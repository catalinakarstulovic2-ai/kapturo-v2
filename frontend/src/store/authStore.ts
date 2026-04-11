import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '../types'
import api from '../api/client'

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (companyName: string, fullName: string, email: string, password: string) => Promise<void>
  logout: () => void
  fetchMe: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

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
        set({ user: null, token: null, isAuthenticated: false })
      },

      fetchMe: async () => {
        const me = await api.get('/auth/me')
        set({ user: me.data, isAuthenticated: true })
      },
    }),
    { name: 'kapturo-auth', partialize: (s) => ({ token: s.token }) }
  )
)
