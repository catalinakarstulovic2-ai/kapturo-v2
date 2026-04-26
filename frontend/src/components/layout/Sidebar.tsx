import { NavLink } from 'react-router-dom'
import { LayoutDashboard, FileText, Settings, Zap, ShieldAlert, X, Trophy, Building2, Search, Linkedin, FileSignature, ClipboardList, SlidersHorizontal, MessageSquare } from 'lucide-react'
import clsx from 'clsx'
import { useAuthStore } from '../../store/authStore'

// hideSuperAdmin: ocultar este ítem cuando el usuario es super_admin
// onlySuperAdmin: mostrar este ítem solo a super_admin
const nav = [
  { to: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard',           module: null,           hideSuperAdmin: false, onlySuperAdmin: false, group: null },
  { to: '/licitaciones',  icon: FileText,        label: 'Buscar licitaciones', module: 'licitaciones', hideSuperAdmin: true,  onlySuperAdmin: false, group: 'licitaciones' },
  { to: '/licitaciones/perfil', icon: SlidersHorizontal, label: 'Perfil IA', module: 'licitaciones', hideSuperAdmin: true, onlySuperAdmin: false, group: 'licitaciones' },
  { to: '/licitaciones?tab=postulaciones', icon: ClipboardList, label: 'Mis postulaciones', module: 'licitaciones', hideSuperAdmin: true, onlySuperAdmin: false, group: 'licitaciones' },
  { to: '/propuestas/licitaciones', icon: FileSignature, label: 'Generar documentos', module: 'licitaciones', hideSuperAdmin: true, onlySuperAdmin: false, group: 'licitaciones' },
  { to: '/adjudicadas',   icon: Trophy,          label: 'Mercado Público',     module: 'adjudicadas',  hideSuperAdmin: true,  onlySuperAdmin: false, group: null },
  { to: '/prospeccion',   icon: Search,          label: 'Prospección',         module: 'prospector',   hideSuperAdmin: true,  onlySuperAdmin: false, group: null },
  { to: '/inmobiliaria',         icon: Building2, label: 'Inmobiliaria',       module: 'inmobiliaria', hideSuperAdmin: true,  onlySuperAdmin: false, group: null },
  { to: '/linkedin-prospecting', icon: Linkedin,  label: 'LinkedIn',           module: 'inmobiliaria', hideSuperAdmin: true,  onlySuperAdmin: false, group: null },
  { to: '/conversaciones',       icon: MessageSquare, label: 'Conversaciones',  module: null,           hideSuperAdmin: false, onlySuperAdmin: false, group: null },
  { to: '/configuracion',        icon: Settings,  label: 'Configuración',      module: null,           hideSuperAdmin: false, onlySuperAdmin: false, group: null },
  { to: '/superadmin',   icon: ShieldAlert,      label: 'Super Admin',        module: null,           hideSuperAdmin: false, onlySuperAdmin: true,  group: null },
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
    // 'licitador' es el nombre legacy de 'licitaciones' (mismo módulo, nombre viejo en BD)
    if (item.module === 'licitaciones' && userModuleTypes.includes('licitador')) return true
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
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
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
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {(() => {
          let lastGroup: string | null = undefined as any
          return visibleNav.map(({ to, icon: Icon, label, onlySuperAdmin, group }) => {
            const showGroupHeader = group === 'licitaciones' && lastGroup !== 'licitaciones'
            lastGroup = group ?? null
            const hasQuery = to.includes('?')
            const isSubItem = group === 'licitaciones' && to !== '/licitaciones'
            return (
              <div key={to}>
                {showGroupHeader && (
                  <div className="px-3 pt-3 pb-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Licitaciones</p>
                  </div>
                )}
                <NavLink
                  to={to}
                  end={!hasQuery}
                  onClick={onClose}
                  className={({ isActive: routerActive }) => {
                    const realActive = hasQuery
                      ? (typeof window !== 'undefined' && window.location.pathname + window.location.search === to)
                      : routerActive
                    return onlySuperAdmin
                      ? clsx(
                          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                          isSubItem && 'pl-5',
                          realActive
                            ? 'bg-purple-50 text-purple-700'
                            : 'text-purple-500 hover:bg-purple-50 hover:text-purple-700'
                        )
                      : clsx(
                          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                          isSubItem && 'pl-5',
                          realActive
                            ? 'bg-brand-50 text-brand-600'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        )
                  }}
                >
                  <Icon size={isSubItem ? 16 : 18} />
                  <span className={isSubItem ? 'text-[13px]' : ''}>{label}</span>
                </NavLink>
              </div>
            )
          })
        })()}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        <div className="text-xs text-gray-400 text-center">Kapturo v0.1</div>
      </div>
    </aside>
  )
}
