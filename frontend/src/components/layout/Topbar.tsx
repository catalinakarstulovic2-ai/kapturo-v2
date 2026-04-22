import { useAuthStore } from '../../store/authStore'
import { useNotesStore } from '../../store/notesStore'
import { LogOut, User, Menu, StickyNote, MessageSquareWarning } from 'lucide-react'
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import BugReportButton from '../ui/BugReportButton'

interface TopbarProps {
  onMenuClick: () => void
}

export default function Topbar({ onMenuClick }: TopbarProps) {
  const { user, logout }     = useAuthStore()
  const { open, setOpen, tasks } = useNotesStore()
  const [bugOpen, setBugOpen] = useState(false)
  const location = useLocation()
  const isMercadoPublico = location.pathname.startsWith('/adjudicadas')

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center px-4 md:px-6 gap-3">
      <button
        onClick={onMenuClick}
        className="md:hidden text-gray-500 hover:text-gray-900 p-1"
        aria-label="Abrir menú"
      >
        <Menu size={22} />
      </button>

      <div className="flex-1" />

      {/* Botón Reportar problema — oculto en Mercado Público */}
      {!isMercadoPublico && (
        <button
          onClick={() => setBugOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold bg-gray-100 hover:bg-red-100 hover:text-red-700 text-gray-600 transition-all"
        >
          <MessageSquareWarning size={15} />
          <span className="hidden sm:inline">Reportar problema</span>
        </button>
      )}

      {/* Botón Notas — siempre visible */}
      <button
        onClick={() => setOpen(!open)}
        className={open
          ? 'flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold bg-amber-400 text-amber-900 shadow-sm transition-all'
          : 'flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold bg-amber-100 hover:bg-amber-200 text-amber-800 transition-all'
        }
      >
        <StickyNote size={15} />
        <span className="hidden sm:inline">Tareas</span>
        {tasks.filter(t => !t.done).length > 0 && (
          <span className="text-[10px] font-bold bg-amber-600 text-white px-1.5 py-0.5 rounded-full shrink-0">
            {tasks.filter(t => !t.done).length}
          </span>
        )}
      </button>

      <div className="flex items-center gap-2 text-sm text-gray-600">
        <User size={16} />
        <span className="hidden sm:inline">{user?.full_name || user?.email}</span>
        <span className="badge-brand ml-1">{user?.role}</span>
      </div>
      <button
        onClick={logout}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors"
      >
        <LogOut size={16} />
        <span className="hidden sm:inline">Salir</span>
      </button>
      <BugReportButton externalOpen={bugOpen} onClose={() => setBugOpen(false)} />
    </header>
  )
}
