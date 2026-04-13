/**
 * ProspeccionPage — módulo de Prospección con tabs por rubro.
 *
 * Super admin → ve todos los rubros disponibles.
 * Tenant regular → ve solo su(s) rubro(s) configurados en niche_config.
 *
 * Cada tab renderiza:
 *   - niche 'inmobiliaria' → InmobiliariaPage
 *   - cualquier otro niche → ProspectorPage (genérico: Maps / Apollo / Social)
 */
import { useState } from 'react'
import clsx from 'clsx'
import { Home, TrendingUp, Calculator, Scale, Cpu, Heart, Megaphone, Briefcase, Search } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import InmobiliariaPage from './InmobiliariaPage'
import ProspectorPage from './ProspectorPage'

// ── Catálogo de rubros disponibles en la plataforma ────────────────────────
const ALL_RUBROS = [
  { key: 'inmobiliaria', label: 'Inmobiliario',  icon: Home },
  { key: 'marketing',    label: 'Marketing',     icon: Megaphone },
  { key: 'contadores',   label: 'Contadores',    icon: Calculator },
  { key: 'legal',        label: 'Legal',         icon: Scale },
  { key: 'tecnologia',   label: 'Tecnología',    icon: Cpu },
  { key: 'salud',        label: 'Salud',         icon: Heart },
  { key: 'finanzas',     label: 'Finanzas',      icon: TrendingUp },
  { key: 'consultoria',  label: 'Consultoría',   icon: Briefcase },
  { key: 'generico',     label: 'Genérico',      icon: Search },
]

// ── Componente por rubro ───────────────────────────────────────────────────
function RubroView({ niche }: { niche: string }) {
  if (niche === 'inmobiliaria') return <InmobiliariaPage />
  return <ProspectorPage />
}

// ── Página principal ───────────────────────────────────────────────────────
export default function ProspeccionPage() {
  const { user } = useAuthStore()
  const isSuperAdmin = user?.role === 'super_admin'

  // Rubros que ve este usuario
  const rubrosVisibles = isSuperAdmin
    ? ALL_RUBROS
    : ALL_RUBROS.filter(r =>
        (user?.modules ?? [])
          .filter(m => m.tipo === 'prospector')
          .some(m => (m.niche ?? 'generico') === r.key)
      )

  // Si no hay ninguno visible (tenant sin prospector), fallback a genérico
  const tabs = rubrosVisibles.length > 0 ? rubrosVisibles : [ALL_RUBROS.find(r => r.key === 'generico')!]

  const [activeKey, setActiveKey] = useState(tabs[0].key)
  const activeTab = tabs.find(t => t.key === activeKey) ?? tabs[0]

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 pt-4">
        <div className="flex items-center gap-1 overflow-x-auto pb-0 scrollbar-none">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveKey(key)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 whitespace-nowrap transition-colors',
                activeKey === key
                  ? 'border-brand-500 text-brand-600 bg-brand-50'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'
              )}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido del rubro activo */}
      <div className="flex-1 overflow-auto">
        <RubroView key={activeKey} niche={activeKey} />
      </div>
    </div>
  )
}
