import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, Kanban, FileText, Search, Bot, Settings, Zap, MessageSquare, ShieldAlert, X, Trophy } from 'lucide-react'
import clsx from 'clsx'
import { useAuthStore } from '../../store/authStore'

// hideSuperAdmin: ocultar este ítem cuando el usuario es super_admin
// onlySuperAdmin: mostrar este ítem solo a super_admin
const nav = [
  { to: '/dashboard',       icon: LayoutDashboard, label: 'Dashboard',        module: null,         hideSuperAdmin: false, onlySuperAdmin: false },
  { to: '/prospectos',      icon: Users,           label: 'Prospectos',       module: null,         hideSuperAdmin: true,  onlySuperAdmin: false },
  { to: '/pipeline',        icon: Kanban,          label: 'Pipeline',         module: null,         hideSuperAdmin: true,  onlySuperAdmin: false },
  { to: '/conversaciones',  icon: MessageSquare,   label: 'Conversaciones',   module: null,         hideSuperAdmin: true,  onlySuperAdmin: false },
  { to: '/adjudicadas',    icon: Trophy,          label: 'Adjudicadas',      module: 'adjudicadas', hideSuperAdmin: true,  onlySuperAdmin: false },
  { to: '/licitaciones',    icon: FileText,        label: 'Licitaciones',     module: 'licitador',  hideSuperAdmin: true,  onlySuperAdmin: false },
  { to: '/prospeccion',     icon: Search,          label: 'Prospección',      module: 'prospector', hideSuperAdmin: true,  onlySuperAdmin: false },
  { to: '/agentes',         icon: Bot,             label: 'Agentes IA',       module: null,         hideSuperAdmin: true,  onlySuperAdmin: false },
  { to: '/configuracion',   icon: Settings,        label: 'Configuración',    module: null,         hideSuperAdmin: false, onlySuperAdmin: false },
  { to: '/superadmin',      icon: ShieldAlert,     label: 'Super Admin',      module: null,         hideSuperAdmin: false, onlySuperAdmin: true  },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { user } = useAuthStore()
  const { isImpersonating } = useAuthStore()
  const isSuperAdmin = user?.role === 'super_admin'
  // Cuando impersonando, tratar al usuario como su rol real (no super_admin)
  const effectiveIsSuperAdmin = isSuperAdmin && !isImpersonating
  const userModuleTypes: string[] = (user?.modules ?? []).map(m => m.tipo)

  const visibleNav = nav.filter(item => {
    if (item.onlySuperAdmin)  return effectiveIsSuperAdmin               // solo super_admin real
    if (effectiveIsSuperAdmin && item.hideSuperAdmin) return false       // ocultar operacionales
    if (!item.module) return true                                        // sin módulo: siempre
    if (effectiveIsSuperAdmin) return true                               // super_admin real ve todo
    return userModuleTypes.includes(item.module)                        // módulo del tenant
  })

  return (
    <aside className={clsx(
      'w-60 bg-white border-r border-gray-200 flex flex-col flex-shrink-0',
      // Móvil: posición fija, se desliza desde la izquierda
      'fixed inset-y-0 left-0 z-30 transition-transform duration-300',
      // Desktop: posición normal, siempre visible
      'md:static md:translate-x-0',
      open ? 'translate-x-0' : '-translate-x-full'
    )}>
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-gray-200">
        <div className="flex items-center gap-2 flex-1">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
            <Zap size={16} className="text-white" />
          </div>
          <span className="font-bold text-gray-900 text-lg">Kapturo</span>
        </div>
        {/* Botón cerrar — solo visible en móvil */}
        <button onClick={onClose} className="md:hidden text-gray-400 hover:text-gray-600 p-1">
          <X size={20} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visibleNav.map(({ to, icon: Icon, label, onlySuperAdmin }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) =>
              onlySuperAdmin
                ? clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-purple-50 text-purple-700'
                      : 'text-purple-500 hover:bg-purple-50 hover:text-purple-700'
                  )
                : clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-brand-50 text-brand-600'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  )
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        <div className="text-xs text-gray-400 text-center">Kapturo v0.1</div>
      </div>
    </aside>
  )
}
