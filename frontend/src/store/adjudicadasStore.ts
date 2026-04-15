import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AdjudicadaItem {
  codigo: string
  nombre: string
  organismo: string
  region: string
  fecha_adjudicacion: string
  rut_adjudicado: string
  nombre_adjudicado: string
  monto_adjudicado: number
  poliza_seriedad: number
  poliza_cumplimiento: number
  prospect_id?: string
}

export type Pestana = 'adjudicadas' | 'por_adjudicarse' | 'cerrada' | 'desierta' | 'revocada' | 'suspendida'

export interface BusquedaGuardada {
  id: string
  nombre: string
  fecha: string
  pestana: Pestana
  filtros: { region: string; periodo: string; monto_minimo: string; keyword: string }
  rubrosSeleccionados: string[]
}

type SortMonto = 'none' | 'asc' | 'desc'

interface AdjudicadasState {
  pestana: Pestana
  resultados: AdjudicadaItem[]
  totalResultados: number
  paginaActual: number
  filtros: { region: string; periodo: string; monto_minimo: string; keyword: string }
  rubrosSeleccionados: string[]
  sortMonto: SortMonto

  busquedasGuardadas: BusquedaGuardada[]

  setPestana: (p: Pestana) => void
  setResultados: (items: AdjudicadaItem[], total: number, pagina: number) => void
  setFiltros: (f: Partial<AdjudicadasState['filtros']>) => void
  setRubrosSeleccionados: (r: string[]) => void
  setSortMonto: (s: SortMonto) => void
  marcarGuardado: (codigo: string, prospect_id: string) => void
  guardarBusqueda: (nombre: string) => void
  eliminarBusqueda: (id: string) => void
  cargarBusqueda: (b: BusquedaGuardada) => void
  limpiar: () => void
}

const FILTROS_DEFAULT = { region: '', periodo: '30', monto_minimo: '', keyword: '' }

export const useAdjudicadasStore = create<AdjudicadasState>()(
  persist(
    (set) => ({
      pestana: 'adjudicadas',
      resultados: [],
      totalResultados: 0,
      paginaActual: 1,
      filtros: FILTROS_DEFAULT,
      rubrosSeleccionados: [],
      sortMonto: 'none',
      busquedasGuardadas: [],

      setPestana: (pestana) => set({ pestana, resultados: [], totalResultados: 0, paginaActual: 1, sortMonto: 'none' }),

      setResultados: (resultados, totalResultados, paginaActual) =>
        set({ resultados, totalResultados, paginaActual }),

      setFiltros: (f) =>
        set((s) => ({ filtros: { ...s.filtros, ...f } })),

      setRubrosSeleccionados: (rubrosSeleccionados) => set({ rubrosSeleccionados }),

      setSortMonto: (sortMonto) => set({ sortMonto }),

      marcarGuardado: (codigo, prospect_id) =>
        set((s) => ({
          resultados: s.resultados.map((r) =>
            r.codigo === codigo ? { ...r, prospect_id } : r
          ),
        })),

      guardarBusqueda: (nombre) =>
        set((s) => ({
          busquedasGuardadas: [
            {
              id: Date.now().toString(),
              nombre,
              fecha: new Date().toLocaleDateString('es-CL'),
              pestana: s.pestana,
              filtros: s.filtros,
              rubrosSeleccionados: s.rubrosSeleccionados,
            },
            ...s.busquedasGuardadas,
          ].slice(0, 20), // max 20 guardadas
        })),

      eliminarBusqueda: (id) =>
        set((s) => ({ busquedasGuardadas: s.busquedasGuardadas.filter((b) => b.id !== id) })),

      cargarBusqueda: (b) =>
        set({
          pestana: b.pestana,
          filtros: b.filtros,
          rubrosSeleccionados: b.rubrosSeleccionados,
          resultados: [],
          totalResultados: 0,
          paginaActual: 1,
          sortMonto: 'none',
        }),

      limpiar: () =>
        set({
          resultados: [],
          totalResultados: 0,
          paginaActual: 1,
          filtros: FILTROS_DEFAULT,
          rubrosSeleccionados: [],
          sortMonto: 'none',
        }),
    }),
    {
      name: 'kapturo-adjudicadas',
      // Solo persistir estado de búsqueda, no el cache de contactos
      partialize: (s) => ({
        pestana: s.pestana,
        resultados: s.resultados,
        totalResultados: s.totalResultados,
        paginaActual: s.paginaActual,
        filtros: s.filtros,
        rubrosSeleccionados: s.rubrosSeleccionados,
        sortMonto: s.sortMonto,
        busquedasGuardadas: s.busquedasGuardadas,
      }),
    }
  )
)
