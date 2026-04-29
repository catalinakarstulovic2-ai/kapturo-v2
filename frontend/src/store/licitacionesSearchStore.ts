/**
 * Store global para la búsqueda de licitaciones.
 * Sobrevive navegación — la búsqueda continúa en 2do plano aunque el usuario
 * cambie de página.
 */
import { create } from 'zustand'

export interface LicitacionPreviewItem {
  codigo: string
  nombre: string
  organismo?: string
  monto_estimado?: number
  fecha_cierre?: string
  region?: string
  rubro?: string
  score?: number
  prospect_id?: string
  [key: string]: unknown
}

interface SearchParams {
  tab: string
  filtros: {
    periodo: string
    region: string
    tipo_licitacion: string
    comprador: string
    proveedor: string
  }
  rubrosSeleccionados: string[]
  pagina: number
}

interface LicitacionesSearchState {
  // Estado de la búsqueda
  isSearching: boolean
  searchParams: SearchParams | null
  resultados: LicitacionPreviewItem[]
  totalResultados: number
  totalPaginas: number
  paginaActual: number
  totalDisponible: number | null
  rubrosConConteo: Record<string, number>
  cacheInfo: string | null
  searchSeconds: number
  error: string | null
  clearError: () => void

  // Estado búsqueda IA
  isSearchingIA: boolean
  iaResumen: string | null
  iaAdvertencia: string | null
  iaSugerencia: string | null

  // Acciones
  iniciarBusqueda: (params: SearchParams, token: string) => void
  iniciarBusquedaIA: (consulta: string, tab: string, token: string) => void
  setResultados: (items: LicitacionPreviewItem[]) => void
  limpiar: () => void
  tickSearchSeconds: () => void
  resetSearchSeconds: () => void
}

// Misma lógica que api/client.ts para calcular la baseURL
// El placeholder se reemplaza en producción vía entrypoint.sh
function getBaseURL(): string {
  const raw = import.meta.env.VITE_API_URL as string | undefined
  return raw && raw.startsWith('http') ? `${raw}/api/v1` : '/api/v1'
}

// Términos demasiado genéricos que generan falsos positivos en la búsqueda.
// Se excluyen del keyword antes de enviar a la API.
const GENERIC_TERMS = new Set([
  'gestión', 'proyectos', 'administración', 'planificación', 'estrategia',
  'comunicaciones', 'marketing', 'relaciones públicas', 'finanzas',
  'recursos humanos', 'capacitación', 'consultoría', 'asesoría',
  'servicios generales', 'ventas', 'negocios', 'coordinación', 'supervisión',
])

// Mapeo inteligente de rubros a keywords de búsqueda más precisos.
// Filtra términos genéricos y reemplaza rubros ambiguos según contexto.
function buildKeyword(rubros: string[]): string {
  if (rubros.length === 0) return ''
  const set = new Set(rubros.map(r => r.toLowerCase()))
  const isTech = set.has('tecnología') || set.has('informática') || set.has('software') || set.has('telecomunicaciones') || set.has('ti')
  const isConstruction = set.has('construcción') || set.has('obras civiles') || set.has('infraestructura')
  const isHealth = set.has('salud') || set.has('médico') || set.has('hospitalario') || set.has('farmacéutico')
  const isServices = set.has('aseo') || set.has('sanitaria') || set.has('limpieza') || set.has('ornato')

  // Primero filtrar genéricos, luego mapear los específicos
  const filtered = rubros.filter(r => !GENERIC_TERMS.has(r.toLowerCase()))

  const mapped = filtered.map(r => {
    const l = r.toLowerCase()
    if (l === 'seguridad') {
      if (isTech) return 'ciberseguridad'
      if (isConstruction) return 'seguridad vial'
      return 'seguridad vigilancia'
    }
    if (l === 'mantención') {
      if (isConstruction) return 'mantenimiento infraestructura'
      if (isServices) return 'mantención edificios'
      return 'mantención'
    }
    if (l === 'laboratorio' && isHealth) return 'laboratorio clínico'
    return r
  })
  return mapped.join(',')
}

// Timer global — sobrevive renders
let _searchTimer: ReturnType<typeof setInterval> | null = null

export const useLicitacionesSearchStore = create<LicitacionesSearchState>((set, get) => ({
  isSearching: false,
  searchParams: null,
  resultados: [],
  totalResultados: 0,
  totalPaginas: 1,
  paginaActual: 1,
  totalDisponible: null,
  rubrosConConteo: {},
  cacheInfo: null,
  searchSeconds: 0,
  error: null,
  isSearchingIA: false,
  iaResumen: null,
  iaAdvertencia: null,
  iaSugerencia: null,

  tickSearchSeconds: () => set(s => ({ searchSeconds: s.searchSeconds + 1 })),
  resetSearchSeconds: () => set({ searchSeconds: 0 }),
  clearError: () => set({ error: null }),
  setResultados: (items) => set({ resultados: items }),

  limpiar: () => {
    if (_searchTimer) { clearInterval(_searchTimer); _searchTimer = null }
    set({
      resultados: [], totalResultados: 0, totalPaginas: 1,
      paginaActual: 1, totalDisponible: null, rubrosConConteo: {},
      cacheInfo: null, searchSeconds: 0, error: null,
      iaResumen: null, iaAdvertencia: null, iaSugerencia: null,
      searchParams: null,
    })
    try { localStorage.removeItem('kapturo_licitaciones_cache') } catch {}
  },

  iniciarBusqueda: (params, token) => {
    if (_searchTimer) { clearInterval(_searchTimer); _searchTimer = null }
    set({ isSearching: true, error: null, searchSeconds: 0 })

    // Timer global que NO se cancela con el desmonte del componente
    _searchTimer = setInterval(() => get().tickSearchSeconds(), 1000)

    const { tab, filtros, rubrosSeleccionados, pagina } = params
    const fmtDate = (d: Date) => d.toISOString().slice(0, 10)
    const hasta = new Date(); hasta.setDate(hasta.getDate() - 1)
    const desde = new Date(hasta); desde.setDate(desde.getDate() - (parseInt(filtros.periodo) - 1))

    const p = new URLSearchParams({ tipo: tab, pagina: String(pagina) })
    p.set('fecha_desde', fmtDate(desde))
    p.set('fecha_hasta', fmtDate(hasta))
    if (filtros.region)          p.set('region', filtros.region)
    if (filtros.tipo_licitacion) p.set('tipo_licitacion', filtros.tipo_licitacion)
    if (rubrosSeleccionados.length > 0) p.set('keyword', buildKeyword(rubrosSeleccionados))
    if (filtros.comprador)       p.set('comprador', filtros.comprador)
    if (filtros.proveedor)       p.set('proveedor', filtros.proveedor)

    const baseURL = getBaseURL()
    fetch(`${baseURL}/modules/licitaciones/preview?${p}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => {
        if (!r.ok) throw new Error(`Error ${r.status}: ${r.statusText}`)
        return r.json()
      })
      .then(data => {
        if (_searchTimer) { clearInterval(_searchTimer); _searchTimer = null }
        const items: LicitacionPreviewItem[] = data.licitaciones ?? data.items ?? []
        const rc: Record<string, number> = data.rubros_counts ?? {}
        const savedAt = new Date().toISOString()
        set({
          isSearching: false,
          resultados: items,
          totalResultados: data.total ?? 0,
          totalPaginas: data.total_paginas ?? 1,
          paginaActual: pagina,
          totalDisponible: data.total_disponible ?? null,
          rubrosConConteo: rc,
          cacheInfo: 'guardado · expira en 4 h',
          searchSeconds: 0,
          error: null,
          searchParams: params,
        })
        try {
          localStorage.setItem('kapturo_licitaciones_cache', JSON.stringify({
            filtros, rubrosSeleccionados, rubrosConConteo: rc,
            resultados: items, total: data.total,
            total_disponible: data.total_disponible, savedAt,
          }))
        } catch {}
      })
      .catch(err => {
        if (_searchTimer) { clearInterval(_searchTimer); _searchTimer = null }
        set({ isSearching: false, error: err?.message || 'Error en la búsqueda', searchSeconds: 0 })
      })
  },

  iniciarBusquedaIA: (consulta, tab, token) => {
    if (_searchTimer) { clearInterval(_searchTimer); _searchTimer = null }
    set({ isSearchingIA: true, error: null, searchSeconds: 0, iaResumen: null, iaAdvertencia: null, iaSugerencia: null })
    try { localStorage.removeItem('kapturo_licitaciones_cache') } catch {}

    _searchTimer = setInterval(() => get().tickSearchSeconds(), 1000)

    const baseURL = getBaseURL()
    fetch(`${baseURL}/modules/licitaciones/busqueda-ia`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ consulta, tipo: tab }),
    })
      .then(r => {
        if (!r.ok) throw new Error(`Error ${r.status}: ${r.statusText}`)
        return r.json()
      })
      .then(data => {
        if (_searchTimer) { clearInterval(_searchTimer); _searchTimer = null }
        const { filtros_extraidos, resultado } = data
        const items: LicitacionPreviewItem[] = resultado?.licitaciones ?? resultado?.items ?? []
        const rc: Record<string, number> = resultado?.rubros_counts ?? {}
        set({
          isSearchingIA: false,
          resultados: items,
          totalResultados: resultado?.total ?? 0,
          totalPaginas: resultado?.total_paginas ?? 1,
          paginaActual: 1,
          totalDisponible: resultado?.total_disponible ?? null,
          rubrosConConteo: rc,
          cacheInfo: 'búsqueda IA',
          searchSeconds: 0,
          iaResumen: filtros_extraidos?.resumen || null,
          iaAdvertencia: filtros_extraidos?.advertencia || null,
          iaSugerencia: filtros_extraidos?.sugerencia || null,
        })
        if (items.length > 0) {
          try {
            localStorage.setItem('kapturo_licitaciones_cache', JSON.stringify({
              filtros: {}, rubrosSeleccionados: [], rubrosConConteo: rc,
              resultados: items, total: resultado?.total,
              total_disponible: resultado?.total_disponible,
              savedAt: new Date().toISOString(),
            }))
          } catch {}
        }
      })
      .catch(err => {
        if (_searchTimer) { clearInterval(_searchTimer); _searchTimer = null }
        set({ isSearchingIA: false, error: err?.message || 'Error en búsqueda IA', searchSeconds: 0 })
      })
  },
}))
