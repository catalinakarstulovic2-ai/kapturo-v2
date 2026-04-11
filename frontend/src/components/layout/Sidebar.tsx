import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, Kanban, FileText, Search, Bot, Settings, Zap, MessageSquare, ShieldAlert } from 'lucide-react'
import clsx from 'clsx'
import { useAuthStore } from '../../store/authStore'

const nav = [
  { to: '/dashboard',       icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/prospectos',      icon: Users,           label: 'Prospectos' },
  { to: '/pipeline',        icon: Kanban,          label: 'Pipeline' },
  { to: '/conversaciones',  icon: MessageSquare,   label: 'Conversaciones' },
  { to: '/licitaciones',    icon: FileText,        label: 'Licitaciones' },
  { to: '/prospector',      icon: Search,          label: 'Prospector' },
  { to: '/agentes',         icon: Bot,             label: 'Agentes IA' },
  { to: '/configuracion',   icon: Settings,        label: 'Configuración' },
]

export default function Sidebar() {
  const { user } = useAuthStore()

  return (
    <aside className="w-60 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
            <Zap size={16} className="text-white" />
          </div>
          <span className="font-bold text-gray-900 text-lg">Kapturo</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
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

        {/* Super Admin — solo visible para super_admin */}
        {user?.role === 'super_admin' && (
          <NavLink
            to="/superadmin"
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mt-2 border border-dashed',
                isActive
                  ? 'bg-purple-50 text-purple-700 border-purple-300'
                  : 'text-purple-500 hover:bg-purple-50 hover:text-purple-700 border-purple-200'
              )
            }
          >
            <ShieldAlert size={18} />
            Super Admin
          </NavLink>
        )}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        <div className="text-xs text-gray-400 text-center">Kapturo v0.1</div>
      </div>
    </aside>
  )
}
