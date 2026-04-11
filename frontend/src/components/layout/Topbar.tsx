import { useAuthStore } from '../../store/authStore'
import { LogOut, User } from 'lucide-react'

export default function Topbar() {
  const { user, logout } = useAuthStore()

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-end px-6 gap-4">
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <User size={16} />
        <span>{user?.full_name || user?.email}</span>
        <span className="badge bg-brand-50 text-brand-600 ml-1">{user?.role}</span>
      </div>
      <button
        onClick={logout}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors"
      >
        <LogOut size={16} />
        Salir
      </button>
    </header>
  )
}
