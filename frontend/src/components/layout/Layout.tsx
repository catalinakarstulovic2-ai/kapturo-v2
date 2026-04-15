import { useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { ShieldAlert, ArrowLeft, Loader2 } from 'lucide-react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import { useAuthStore } from '../../store/authStore'
import FloatingNotes from '../ui/FloatingNotes'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [returning, setReturning] = useState(false)
  const { isImpersonating, user, stopImpersonation } = useAuthStore()
  const navigate = useNavigate()

  const handleStopImpersonation = async () => {
    setReturning(true)
    await stopImpersonation()
    setReturning(false)
    navigate('/superadmin')
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Overlay oscuro en móvil cuando el sidebar está abierto */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Banner impersonación */}
        {isImpersonating && (
          <div className="flex-shrink-0 bg-purple-600 text-white px-4 py-2 flex items-center justify-between text-sm z-10">
            <div className="flex items-center gap-2">
              <ShieldAlert size={15} />
              <span>Viendo como <strong>{user?.full_name}</strong> · {user?.email}</span>
            </div>
            <button
              onClick={handleStopImpersonation}
              disabled={returning}
              className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg font-medium transition-colors"
            >
              {returning
                ? <><Loader2 size={13} className="animate-spin" /> Volviendo...</>
                : <><ArrowLeft size={13} /> Volver a Super Admin</>
              }
            </button>
          </div>
        )}

        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>

      {/* Notas flotantes — visible en toda la app */}
      <FloatingNotes />
    </div>
  )
}

