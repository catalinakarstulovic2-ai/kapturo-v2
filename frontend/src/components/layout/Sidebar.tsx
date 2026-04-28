import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Settings, Zap, ShieldAlert, X, Trophy,
  Building2, Search, Linkedin, FileSignature, ClipboardList,
  SlidersHorizontal, MessageSquare,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuthStore } from '../../store/authStore'

type Section = 'captura' | 'trabajo' | 'comunicacion' | 'cuenta' | null

const SECTION_LABELS: Record<string, string> = {
  captura:      'Captura',
  trabajo:      'Trabajo',
  comunicacion: 'Comunicación',
  cuenta:       'Cuenta',
}

const nav: Array<{
  to: string
  icon: any
  label: string
  module: string | null
  hideSuperAdmin: boolean
  onlySuperAdmin: boolean
  section: Section
}> = [
  { to: '/dashboard',               icon: LayoutDashboard,  label: 'Dashboard',           module: null,           hideSuperAdmin: false, onlySuperAdmin: false, section: 'captura'      },
  { to: '/licitaciones/perfil',     icon: SlidersHorizontal,label: 'Perfil IA',           module: 'licitaciones', hideSuperAdmin: true,  onlySuperAdmin: false, section: 'captura'      },
  { to: '/licitaciones',            icon: FileText,          label: 'Buscar licitaciones', module: 'licitaciones', hideSuperAdmin: true,  onlySuperAdmin: false, section: 'captura'      },
  { to: '/licitaciones/postulaciones',     icon: ClipboardList, label: 'Mis postulaciones', module: 'licitaciones', hideSuperAdmin: true, onlySuperAdmin: false, section: 'trabajo'     },
  { to: '/propuestas/licitaciones', icon: FileSignature,     label: 'Generar documentos', module: 'licitaciones', hideSuperAdmin: true,  onlySuperAdmin: false, section: 'trabajo'      },
  { to: '/adjudicadas',             icon: Trophy,            label: 'Mercado Público',     module: 'adjudicadas',  hideSuperAdmin: true,  onlySuperAdmin: false, section: 'trabajo'      },
  { to: '/prospeccion',             icon: Search,            label: 'Prospección',         module: 'prospector',   hideSuperAdmin: true,  onlySuperAdmin: false, section: 'captura'      },
  { to: '/inmobiliaria',            icon: Building2,         label: 'Inmobiliaria',        module: 'inmobiliaria', hideSuperAdmin: true,  onlySuperAdmin: false, section: 'captura'      },
  { to: '/linkedin-prospecting',    icon: Linkedin,          label: 'LinkedIn',            module: 'inmobiliaria', hideSuperAdmin: true,  onlySuperAdmin: false, section: 'captura'      },
  { to: '/conversaciones',          icon: MessageSquare,     label: 'Conversaciones',      module: null,           hideSuperAdmin: false, onlySuperAdmin: false, section: 'comunicacion' },
  { to: '/configuracion',           icon: Settings,          label: 'Configuración',       module: null,           hideSuperAdmin: false, onlySuperAdmin: false, section: 'cuenta'       },
  { to: '/superadmin',              icon: ShieldAlert,       label: 'Super Admin',         module: null,           hideSuperAdmin: false, onlySuperAdmin: true,  section: 'cuenta'       },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { user, isImpersonating } = useAuthStore()
  const isSuperAdmin = user?.role === 'super_admin'
  const effectiveIsSuperAdmin = isSuperAdmin && !isImpersonating
  const userModuleTypes: string[] = (user?.modules ?? []).map((m: any) => m.tipo)

  const visibleNav = nav.filter(item => {
    if (item.onlySuperAdmin)                          return effectiveIsSuperAdmin
    if (effectiveIsSuperAdmin && item.hideSuperAdmin) return false
    if (!item.module)                                 return true
    if (effectiveIsSuperAdmin)                        return true
    if (item.module === 'licitaciones' && userModuleTypes.includes('licitador')) return true
    return userModuleTypes.includes(item.module)
  })

  return (
    <aside className={clsx(
      'w-60 bg-ink-0 border-r border-ink-3 flex flex-col flex-shrink-0',
      'fixed inset-y-0 left-0 z-30 transition-transform duration-300',
      'md:static md:translate-x-0',
      open ? 'translate-x-0' : '-translate-x-full'
    )}>
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-ink-3">
        <div className="flex items-center gap-2 flex-1">
          <div className="w-8 h-8 bg-kap-500 rounded-lg flex items-center justify-center">
            <Zap size={16} className="text-white" />
          </div>
          <span className="font-bold text-ink-9 text-lg tracking-tight">Kapturo</span>
        </div>
        <button onClick={onClose} className="md:hidden text-ink-5 hover:text-ink-8 p-1">
          <X size={20} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {(() => {
          let lastSection: Section | undefined = undefined
          return visibleNav.map(({ to, icon: Icon, label, onlySuperAdmin, section }) => {
            const showHeader = section !== null && section !== lastSection
            lastSection = section
            const hasQuery = to.includes('?')

            return (
              <div key={to}>
                {showHeader && section && (
                  <p className="px-3 pt-4 pb-1 text-[10px] font-bold text-ink-4 uppercase tracking-wider first:pt-1">
                    {SECTION_LABELS[section]}
                  </p>
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
                          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors mb-0.5',
                          realActive ? 'bg-bad-light text-bad' : 'text-bad/70 hover:bg-bad-light hover:text-bad'
                        )
                      : clsx(
                          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors mb-0.5',
                          realActive ? 'bg-kap-100 text-kap-700' : 'text-ink-6 hover:bg-ink-2 hover:text-ink-8'
                        )
                  }}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                </NavLink>
              </div>
            )
          })
        })()}
      </nav>

      {/* Footer — usuario */}
      <div className="p-4 border-t border-ink-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-kap-500 flex items-center justify-center shrink-0 text-white text-xs font-bold uppercase">
            {user?.full_name?.charAt(0) ?? user?.email?.charAt(0) ?? '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-ink-8 truncate leading-tight">{user?.full_name ?? user?.email ?? '—'}</p>
            <p className="text-[10px] text-ink-4 truncate leading-tight mt-0.5">{user?.tenant_name ?? 'Kapturo'}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
