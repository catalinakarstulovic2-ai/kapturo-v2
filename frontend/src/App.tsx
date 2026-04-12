import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuthStore } from './store/authStore'
import api from './api/client'
import Layout from './components/layout/Layout'
import LoginPage from './pages/auth/LoginPage'
import SignupPage from './pages/auth/SignupPage'
import ResetPage from './pages/auth/ResetPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import ProspectsPage from './pages/prospects/ProspectsPage'
import PipelinePage from './pages/pipeline/PipelinePage'
import LicitacionesPage from './pages/modules/LicitacionesPage'
import ProspectorPage from './pages/modules/ProspectorPage'
import AgentsPage from './pages/agents/AgentsPage'
import SettingsPage from './pages/settings/SettingsPage'
import InboxPage from './pages/conversations/InboxPage'
import SuperAdminPage from './pages/superadmin/SuperAdminPage'
import OnboardingPage from './pages/onboarding/OnboardingPage'

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore()
  return user?.role === 'super_admin' ? <>{children}</> : <Navigate to="/dashboard" replace />
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { token, logout } = useAuthStore()
  const [checking, setChecking] = useState(true)
  const [valid, setValid] = useState(false)

  useEffect(() => {
    if (!token) { setChecking(false); setValid(false); return }
    api.get('/auth/me')
      .then(() => setValid(true))
      .catch(() => { logout(); setValid(false) })
      .finally(() => setChecking(false))
  }, [token])

  if (checking) return null
  return valid ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/reset" element={<ResetPage />} />
        <Route path="/onboarding" element={<PrivateRoute><OnboardingPage /></PrivateRoute>} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="prospectos" element={<ProspectsPage />} />
          <Route path="pipeline" element={<PipelinePage />} />
          <Route path="licitaciones" element={<LicitacionesPage />} />
          <Route path="prospector" element={<ProspectorPage />} />
          <Route path="conversaciones" element={<InboxPage />} />
          <Route path="agentes" element={<AgentsPage />} />
          <Route path="configuracion" element={<SettingsPage />} />
          <Route
            path="superadmin"
            element={
              <SuperAdminRoute>
                <SuperAdminPage />
              </SuperAdminRoute>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
