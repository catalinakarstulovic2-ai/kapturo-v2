/**
 * ProspeccionPage — punto de entrada unificado para el módulo de Prospección.
 *
 * Lee el niche configurado para el tenant y renderiza:
 *   - niche === 'inmobiliaria' → InmobiliariaPage (búsqueda de terrenos/propiedades para Leo)
 *   - cualquier otro niche (o sin niche) → ProspectorPage (Apollo / Maps / Social genérico)
 */
import { useAuthStore } from '../../store/authStore'
import InmobiliariaPage from './InmobiliariaPage'
import ProspectorPage from './ProspectorPage'

export default function ProspeccionPage() {
  const { user } = useAuthStore()

  const prospectorModule = user?.modules?.find(m => m.tipo === 'prospector')
  const niche = prospectorModule?.niche

  if (niche === 'inmobiliaria') {
    return <InmobiliariaPage />
  }

  return <ProspectorPage />
}
