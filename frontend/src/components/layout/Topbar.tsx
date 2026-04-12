import { useAuthStore } from '../../store/authStore'
import { LogOut, User, Menu } from 'lucide-react'

interface TopbarProps {
  onMenuClick: () => void
}

export default function Topbar({ onMenuClick }: TopbarProps) {
  const { user, logout } = useAuthStore()

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center px-4 md:px-6 gap-4">
      {/* Botón hamburguesa — solo visible en móvil */}
      <button
        onClick={onMenuClick}
        className="md:hidden text-gray-500 hover:text-gray-900 p-1"
        aria-label="Abrir menú"
      >
        <Menu size={22} />
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-2 text-sm text-gray-600">
        <User size={16} />
        <span className="hidden sm:inline">{user?.full_name || user?.email}</span>
        <span className="badge bg-brand-50 text-brand-600 ml-1">{user?.role}</span>
      </div>
      <button
        onClick={logout}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors"
      >
        <LogOut size={16} />
        <span className="hidden sm:inline">Salir</span>
      </button>
    </header>
  )
}
