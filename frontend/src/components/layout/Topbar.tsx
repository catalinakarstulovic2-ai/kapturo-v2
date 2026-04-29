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
  const { user, logout }          = useAuthStore()
  const { open, setOpen, tasks }  = useNotesStore()
  const [bugOpen, setBugOpen]     = useState(false)
  const location  = useLocation()
  const isMercadoPublico = location.pathname.startsWith('/adjudicadas')

  return (
    <header className="h-16 bg-ink-0 border-b border-ink-3 flex items-center px-4 md:px-6 gap-3">
      <button
        onClick={onMenuClick}
        className="md:hidden text-ink-5 hover:text-ink-8 p-1"
        aria-label="Abrir menú"
      >
        <Menu size={22} />
      </button>

      <div className="flex-1" />

      {/* Botón Reportar problema — oculto en Mercado Público */}
      {!isMercadoPublico && (
        <button
          onClick={() => setBugOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold bg-ink-2 hover:bg-bad-light hover:text-bad text-ink-6 transition-all"
        >
          <MessageSquareWarning size={15} />
          <span className="hidden sm:inline">Reportar problema</span>
        </button>
      )}

      {/* Botón Notas */}
      <button
        onClick={() => setOpen(!open)}
        className={open
          ? 'flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold bg-kap-500 text-white shadow-sm transition-all'
          : 'flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold bg-kap-100 hover:bg-kap-300/40 text-kap-700 transition-all'
        }
      >
        <StickyNote size={15} />
        <span className="hidden sm:inline">Tareas</span>
        {tasks.filter(t => !t.done).length > 0 && (
          <span className="text-[10px] font-bold bg-kap-600 text-white px-1.5 py-0.5 rounded-full shrink-0">
            {tasks.filter(t => !t.done).length}
          </span>
        )}
      </button>

      {/* Usuario */}
      <div className="flex items-center gap-2 text-sm text-ink-6">
        <User size={16} />
        <span className="hidden sm:inline font-medium text-ink-7">{user?.full_name || user?.email}</span>
        <span className="pill-neutral text-[10px]">{user?.role}</span>
      </div>

      <button
        onClick={logout}
        className="flex items-center gap-1.5 text-sm text-ink-5 hover:text-bad transition-colors"
      >
        <LogOut size={16} />
        <span className="hidden sm:inline">Salir</span>
      </button>

      <BugReportButton externalOpen={bugOpen} onClose={() => setBugOpen(false)} />
    </header>
  )
}
