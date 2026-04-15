#!/usr/bin/env python3
# Script that writes the new AdjudicadasPage.tsx

TARGET = '/Users/catalinakarstulovic/Desktop/KAPTURO/frontend/src/pages/modules/AdjudicadasPage.tsx'

NEW_CONTENT = """\
import { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import api from '../../api/client'
import toast from 'react-hot-toast'
import {
  Trophy, Search, SlidersHorizontal, Loader2,
  ChevronDown, ChevronUp, BookmarkPlus, CheckCircle2,
  ExternalLink, RefreshCw, Trash2, Kanban, ArrowDown,
} from 'lucide-react'
import clsx from 'clsx'

interface Catalogo {
  rubros: string[]
  regiones: { codigo: string; nombre: string }[]
  tipos: { codigo: string; nombre: string }[]
}

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

type Pestana = 'adjudicadas' | 'por_adjudicarse'

const formatCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const PLACEHOLDER_COLS = [
  { etapa_id: 'e1', etapa_nombre: 'Sin contactar', etapa_color: '#6B7280', cards: [] },
  { etapa_id: 'e2', etapa_nombre: 'Contactado',    etapa_color: '#3B82F6', cards: [] },
  { etapa_id: 'e3', etapa_nombre: 'Reuni\\u00f3n',  etapa_color: '#8B5CF6', cards: [] },
  { etapa_id: 'e4', etapa_nombre: 'Propuesta',      etapa_color: '#F59E0B', cards: [] },
  { etapa_id: 'e5', etapa_nombre: 'Ganado',         etapa_color: '#10B981', cards: [] },
  { etapa_id: 'e6', etapa_nombre: 'Perdido',        etapa_color: '#EF4444', cards: [] },
]

export default function AdjudicadasPage() {
  const pipelineRef = useRef<HTMLDivElement>(null)

  const [pestana, setPestana]                 = useState<Pestana>('adjudicadas')
  const [expandedId, setExpandedId]           = useState<string | null>(null)
  const [resultados, setResultados]           = useState<AdjudicadaItem[]>([])
  const [totalResultados, setTotalResultados] = useState(0)
  const [paginaActual, setPaginaActual]       = useState(1)
  const [pipeline, setPipeline]               = useState<any[]>([])
  const [filtros, setFiltros]                 = useState({ region: '', periodo: '30', monto_minimo: '', keyword: '' })
  const [rubrosSeleccionados, setRubrosSeleccionados] = useState<string[]>([])
  const [showRubrosDropdown, setShowRubrosDropdown]   = useState(false)
  const [buscarRubroQuery, setBuscarRubroQuery]       = useState('')
  const [savingCodigo, setSavingCodigo]       = useState<string | null>(null)

  const setF = (k: string) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) =>
    setFiltros(f => ({ ...f, [k]: e.target.value }))

  // Cat\\u00e1logo de rubros
  const { data: catalogo } = useQuery<Catalogo>({
    queryKey: ['licitaciones-catalogos'],
    queryFn: () => api.get('/modules/licitaciones/catalogos').then(r => r.data),
    staleTime: Infinity,
  })

  // Pipeline — carga al montar
  const pipelineMutation = useMutation({
    mutationFn: () => api.get('/modules/adjudicadas/pipeline'),
    onSuccess: (res) => setPipeline(res.data),
    onError: () => {},
  })

  useEffect(() => { pipelineMutation.mutate() }, [])

  // B\\u00fasqueda
  const buscarMutation = useMutation({
    mutationFn: (pagina: number) => {
      const params = new URLSearchParams({ pestana, pagina: String(pagina) })
      if (filtros.region)       params.set('region', filtros.region)
      if (filtros.periodo)      params.set('periodo', filtros.periodo)
      if (filtros.monto_minimo) params.set('monto_minimo', filtros.monto_minimo)
      const kw = rubrosSeleccionados.length > 0 ? rubrosSeleccionados.join(',') : filtros.keyword
      if (kw) params.set('keyword', kw)
      return api.get(`/modules/adjudicadas/preview?${params}`)
    },
    onSuccess: (res, pagina) => {
      const data  = res.data
      const items = Array.isArray(data) ? data : (data.resultados ?? [])
      const total = Array.isArray(data) ? items.length : (data.total ?? items.length)
      setResultados(items)
      setTotalResultados(total)
      setPaginaActual(pagina)
      setExpandedId(null)
      toast.success(`${total.toLocaleString('es-CL')} licitaciones encontradas`)
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Error en la b\\u00fasqueda'),
  })

  // Guardar al pipeline
  const guardarMutation = useMutation({
    mutationFn: (codigo: string) => api.post(`/modules/adjudicadas/guardar/${codigo}`),
    onMutate:  (codigo) => setSavingCodigo(codigo),
    onSuccess: (res, codigo) => {
      setSavingCodigo(null)
      toast.success('Guardado — aparece en el pipeline abajo')
      setResultados(prev =>
        prev.map(r => r.codigo === codigo
          ? { ...r, prospect_id: res.data?.id ?? res.data?.prospect_id ?? codigo }
          : r
        )
      )
      pipelineMutation.mutate()
      setTimeout(() => pipelineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 500)
    },
    onError: (err: any) => {
      setSavingCodigo(null)
      toast.error(err.response?.data?.detail || 'Error al guardar')
    },
  })

  // Mover etapa
  const moverEtapaMutation = useMutation({
    mutationFn: ({ cardId, etapaId }: { cardId: string; etapaId: string }) =>
      api.patch(`/modules/adjudicadas/cards/${cardId}/etapa`, { etapa_id: etapaId }),
    onSuccess: () => pipelineMutation.mutate(),
    onError:   () => toast.error('Error al cambiar etapa'),
  })

  const limpiar = () => {
    setResultados([])
    setTotalResultados(0)
    setPaginaActual(1)
    setExpandedId(null)
    setRubrosSeleccionados([])
    setFiltros({ region: '', periodo: '30', monto_minimo: '', keyword: '' })
  }

  const totalEnPipeline = pipeline.reduce((s: number, c: any) => s + (c.cards?.length ?? 0), 0)
  const displayCols     = pipeline.length > 0 ? pipeline : PLACEHOLDER_COLS

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
            <Trophy size={20} className="text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Adjudicadas</h1>
            <p className="text-gray-500 text-sm">Empresas que ganaron \\u00b7 Oportunidad de venta de p\\u00f3lizas</p>
          </div>
        </div>
        <button
          onClick={() => pipelineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
        >
          <Kanban size={14} />
          Pipeline
          {totalEnPipeline > 0 && (
            <span className="bg-brand-500 text-white text-xs px-1.5 py-0.5 rounded-full">{totalEnPipeline}</span>
          )}
        </button>
      </div>

      {/* Tabs */}
      <div className="card p-1 flex gap-1 max-w-xl">
        {(['adjudicadas', 'por_adjudicarse'] as Pestana[]).map(p => (
          <button
            key={p}
            className={clsx('flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors',
              pestana === p ? 'bg-brand-500 text-white' : 'text-gray-600 hover:bg-gray-50')}
            onClick={() => { setPestana(p); setResultados([]) }}
          >
            {p === 'adjudicadas' ? '\\ud83c\\udfc6 Empresas que ganaron' : '\\ud83d\\udccb Por adjudicarse'}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={15} className="text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">Filtros de b\\u00fasqueda</span>
        </div>

        {/* Rubros multi-select */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Rubro <span className="text-gray-400 font-normal">— puedes seleccionar varios</span>
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => { setShowRubrosDropdown(v => !v); setBuscarRubroQuery('') }}
              className="input text-sm w-full flex items-center justify-between text-left"
            >
              <span className="truncate text-gray-600">
                {rubrosSeleccionados.length === 0
                  ? (catalogo ? 'Todos los rubros' : 'Cargando\\u2026')
                  : `${rubrosSeleccionados.length} rubro${rubrosSeleccionados.length > 1 ? 's' : ''} seleccionado${rubrosSeleccionados.length > 1 ? 's' : ''}`}
              </span>
              <ChevronDown size={13} className={clsx('text-gray-400 shrink-0 transition-transform', showRubrosDropdown && 'rotate-180')} />
            </button>
            {showRubrosDropdown && (
              <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl">
                <div className="p-2 border-b border-gray-100">
                  <input
                    autoFocus type="text" placeholder="Buscar rubro\\u2026"
                    value={buscarRubroQuery}
                    onChange={e => setBuscarRubroQuery(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 outline-none focus:border-brand-300 bg-gray-50"
                    onClick={e => e.stopPropagation()}
                  />
                </div>
                <div className="px-3 py-1.5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                  <span className="text-[11px] text-gray-400">{(catalogo?.rubros ?? []).length} disponibles</span>
                  {rubrosSeleccionados.length > 0 && (
                    <button onClick={() => setRubrosSeleccionados([])} className="text-[11px] text-red-400 hover:text-red-600">Quitar todos</button>
                  )}
                </div>
                <div className="overflow-y-auto max-h-56">
                  {(catalogo?.rubros ?? [])
                    .filter(r => !buscarRubroQuery || r.toLowerCase().includes(buscarRubroQuery.toLowerCase()))
                    .sort((a, b) => {
                      const sa = rubrosSeleccionados.includes(a) ? 1 : 0
                      const sb = rubrosSeleccionados.includes(b) ? 1 : 0
                      return sb - sa || a.localeCompare(b)
                    })
                    .map(r => {
                      const sel = rubrosSeleccionados.includes(r)
                      return (
                        <label key={r} className={clsx('flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm transition-colors', sel ? 'bg-brand-50 hover:bg-brand-100' : 'hover:bg-gray-50')}>
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-brand-600 shrink-0"
                            checked={sel}
                            onChange={e => setRubrosSeleccionados(prev => e.target.checked ? [...prev, r] : prev.filter(x => x !== r))}
                          />
                          <span className="capitalize">{r}</span>
                        </label>
                      )
                    })}
                </div>
                <div className="p-2 border-t border-gray-100">
                  <button onClick={() => setShowRubrosDropdown(false)} className="w-full text-xs text-center text-gray-500 hover:text-gray-700 py-1">Cerrar</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Grid de filtros */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Regi\\u00f3n</label>
            <select className="input text-sm" value={filtros.region} onChange={setF('region')}>
              <option value="">Todas las regiones</option>
              <option value="13">Metropolitana</option>
              <option value="5">Valpara\\u00edso</option>
              <option value="8">Biob\\u00edo</option>
              <option value="9">La Araucan\\u00eda</option>
              <option value="7">Maule</option>
              <option value="10">Los Lagos</option>
              <option value="4">Coquimbo</option>
              <option value="6">O'Higgins</option>
              <option value="16">\\u00d1uble</option>
              <option value="2">Antofagasta</option>
              <option value="1">Tarapac\\u00e1</option>
              <option value="3">Atacama</option>
              <option value="11">Ays\\u00e9n</option>
              <option value="12">Magallanes</option>
              <option value="14">Los R\\u00edos</option>
              <option value="15">Arica y Parinacota</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Antig\\u00fcedad</label>
            <select className="input text-sm" value={filtros.periodo} onChange={setF('periodo')}>
              <option value="7">\\u00daltimos 7 d\\u00edas</option>
              <option value="30">\\u00daltimo mes</option>
              <option value="90">\\u00daltimos 3 meses</option>
              <option value="180">\\u00daltimos 6 meses</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Monto m\\u00ednimo</label>
            <input type="number" className="input text-sm" placeholder="Ej: 10000000" value={filtros.monto_minimo} onChange={setF('monto_minimo')} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre / texto</label>
            <input
              type="text" className="input text-sm" placeholder="Ej: construcci\\u00f3n\\u2026"
              value={filtros.keyword} onChange={setF('keyword')}
              disabled={rubrosSeleccionados.length > 0}
            />
          </div>
        </div>

        <button
          className="btn-primary flex items-center gap-2"
          onClick={() => buscarMutation.mutate(1)}
          disabled={buscarMutation.isPending}
        >
          {buscarMutation.isPending
            ? <><Loader2 size={15} className="animate-spin" /> Buscando\\u2026</>
            : <><Search size={15} /> Buscar licitaciones</>}
        </button>
      </div>

      {/* Loading */}
      {buscarMutation.isPending && resultados.length === 0 && (
        <div className="card p-10 text-center text-gray-400">
          <Loader2 size={28} className="mx-auto mb-2 animate-spin opacity-40" />
          <p className="text-sm">Consultando Mercado P\\u00fablico\\u2026</p>
        </div>
      )}

      {/* Tabla de resultados */}
      {resultados.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50 flex-wrap gap-2">
            <span className="text-sm font-semibold text-gray-700">
              {totalResultados.toLocaleString('es-CL')} licitaciones
              {totalResultados > 50 && (
                <span className="ml-1 text-gray-400 font-normal">\\u00b7 p\\u00e1g. {paginaActual} de {Math.ceil(totalResultados / 50)}</span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => buscarMutation.mutate(paginaActual)} disabled={buscarMutation.isPending} className="text-xs text-gray-500 flex items-center gap-1 hover:text-gray-700 disabled:opacity-40">
                <RefreshCw size={11} className={buscarMutation.isPending ? 'animate-spin' : ''} /> Actualizar
              </button>
              <button onClick={limpiar} className="text-xs text-red-400 flex items-center gap-1 px-2.5 py-1 rounded-lg border border-red-100 hover:bg-red-50 transition-colors">
                <Trash2 size={11} /> Limpiar
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-3 font-medium">Empresa adjudicada</th>
                  <th className="px-4 py-3 font-medium">Monto adj.</th>
                  <th className="px-4 py-3 font-medium text-blue-600">P\\u00f3liza 1%</th>
                  <th className="px-4 py-3 font-medium text-green-600">P\\u00f3liza 5%</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Organismo</th>
                  <th className="px-4 py-3 font-medium hidden lg:table-cell">Regi\\u00f3n</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {resultados.map((item) => (
                  <>
                    <tr
                      key={item.codigo}
                      className={clsx('hover:bg-gray-50 cursor-pointer transition-colors', expandedId === item.codigo && 'bg-amber-50/30')}
                      onClick={() => setExpandedId(expandedId === item.codigo ? null : item.codigo)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 line-clamp-1">{item.nombre_adjudicado || '\\u2014'}</div>
                        <div className="text-xs text-gray-400 mt-0.5 line-clamp-1">{item.nombre}</div>
                        {item.rut_adjudicado && <div className="text-xs text-gray-400">RUT {item.rut_adjudicado}</div>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">{formatCLP(item.monto_adjudicado)}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-blue-600">{formatCLP(item.poliza_seriedad)}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-green-600">{formatCLP(item.poliza_cumplimiento)}</td>
                      <td className="px-4 py-3 text-gray-600 hidden md:table-cell text-xs line-clamp-1">{item.organismo}</td>
                      <td className="px-4 py-3 text-gray-600 hidden lg:table-cell text-xs">{item.region || '\\u2014'}</td>
                      <td className="px-4 py-3 text-right">
                        {expandedId === item.codigo
                          ? <ChevronUp size={15} className="text-gray-400 ml-auto" />
                          : <ChevronDown size={15} className="text-gray-400 ml-auto" />}
                      </td>
                    </tr>
                    {expandedId === item.codigo && (
                      <tr key={`${item.codigo}-exp`}>
                        <td colSpan={7} className="bg-gray-50 px-5 py-4 border-b border-gray-100">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-3">
                              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Detalle</h4>
                              <p className="text-xs font-mono text-gray-500">{item.codigo}</p>
                              <p className="text-sm text-gray-800">{item.nombre}</p>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
                                <span><strong>Organismo:</strong> {item.organismo}</span>
                                <span><strong>Regi\\u00f3n:</strong> {item.region || '\\u2014'}</span>
                                {item.fecha_adjudicacion && <span><strong>Adjudicada:</strong> {item.fecha_adjudicacion}</span>}
                              </div>
                              <div className="pt-3 border-t border-gray-200 grid grid-cols-3 gap-3">
                                <div>
                                  <p className="text-xs text-gray-500">Monto adj.</p>
                                  <p className="text-base font-bold text-gray-900">{formatCLP(item.monto_adjudicado)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-blue-500">P\\u00f3liza 1%</p>
                                  <p className="text-base font-bold text-blue-600">{formatCLP(item.poliza_seriedad)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-green-500">P\\u00f3liza 5%</p>
                                  <p className="text-base font-bold text-green-600">{formatCLP(item.poliza_cumplimiento)}</p>
                                </div>
                              </div>
                            </div>
                            <div className="space-y-3">
                              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Empresa adjudicada</h4>
                              <div className="bg-white rounded-xl border border-gray-100 p-4">
                                <p className="font-semibold text-gray-900">{item.nombre_adjudicado}</p>
                                <p className="text-xs text-gray-500 mt-0.5">RUT {item.rut_adjudicado || '\\u2014'}</p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {item.prospect_id ? (
                                  <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 font-medium">
                                    <CheckCircle2 size={11} /> En pipeline <ArrowDown size={11} className="opacity-60" />
                                  </span>
                                ) : (
                                  <button
                                    onClick={e => { e.stopPropagation(); guardarMutation.mutate(item.codigo) }}
                                    disabled={savingCodigo === item.codigo}
                                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
                                  >
                                    {savingCodigo === item.codigo ? <Loader2 size={11} className="animate-spin" /> : <BookmarkPlus size={11} />}
                                    Guardar en pipeline
                                  </button>
                                )}
                                <a
                                  href={`https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=${item.codigo}`}
                                  target="_blank" rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                                >
                                  <ExternalLink size={11} /> Ver en MP
                                </a>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Paginaci\\u00f3n */}
      {totalResultados > 50 && (
        <div className="flex items-center justify-between px-1">
          <button disabled={paginaActual <= 1 || buscarMutation.isPending} onClick={() => buscarMutation.mutate(paginaActual - 1)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">\\u2190 Anterior</button>
          <span className="text-sm text-gray-500">P\\u00e1gina {paginaActual} de {Math.ceil(totalResultados / 50)}</span>
          <button disabled={paginaActual >= Math.ceil(totalResultados / 50) || buscarMutation.isPending} onClick={() => buscarMutation.mutate(paginaActual + 1)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Siguiente \\u2192</button>
        </div>
      )}

      {/* Empty state */}
      {resultados.length === 0 && !buscarMutation.isPending && (
        <div className="card p-8 text-center text-gray-400">
          <Trophy size={32} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">Configura los filtros y busca para ver empresas adjudicadas.</p>
        </div>
      )}

      {/* PIPELINE KANBAN — siempre visible */}
      <div ref={pipelineRef} className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Kanban size={16} className="text-brand-500" />
            <span className="font-semibold text-gray-800">Pipeline de seguimiento</span>
            {totalEnPipeline > 0 && (
              <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">
                {totalEnPipeline} empresa{totalEnPipeline !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <button
            onClick={() => pipelineMutation.mutate()}
            disabled={pipelineMutation.isPending}
            className="text-xs text-gray-500 flex items-center gap-1.5 hover:text-gray-700 disabled:opacity-40 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={11} className={pipelineMutation.isPending ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>

        {pipelineMutation.isPending && pipeline.length === 0 ? (
          <div className="card p-6 text-center">
            <Loader2 size={20} className="mx-auto animate-spin opacity-30 text-gray-400" />
          </div>
        ) : (
          <div className="overflow-x-auto pb-3">
            <div className="flex gap-3" style={{ minWidth: `${displayCols.length * 272}px` }}>
              {displayCols.map((col: any) => (
                <div key={col.etapa_id} className="w-64 shrink-0 flex flex-col">
                  <div
                    className="flex items-center gap-2 px-3 py-2.5 rounded-t-xl text-white text-xs font-semibold"
                    style={{ backgroundColor: col.etapa_color }}
                  >
                    <span className="flex-1">{col.etapa_nombre}</span>
                    <span className="bg-white/25 text-white text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                      {col.cards?.length ?? 0}
                    </span>
                  </div>
                  <div className="bg-gray-50 rounded-b-xl p-2 flex-1 min-h-[80px] space-y-2">
                    {(col.cards ?? []).length === 0 ? (
                      <p className="text-[11px] text-gray-400 text-center py-4">sin empresas</p>
                    ) : (
                      (col.cards ?? []).map((card: any) => (
                        <div key={card.card_id} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm space-y-2 hover:border-gray-200 hover:shadow transition-all">
                          <div>
                            <p className="text-xs font-semibold text-gray-900 leading-tight">{card.empresa}</p>
                            <p className="text-[11px] text-gray-400">{card.rut}</p>
                          </div>
                          {card.nombre && (
                            <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed">{card.nombre}</p>
                          )}
                          <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-gray-50">
                            <div>
                              <p className="text-[10px] text-blue-400 font-medium">P\\u00f3liza 1%</p>
                              <p className="text-xs font-bold text-blue-600">{formatCLP(card.poliza_seriedad)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-green-400 font-medium">P\\u00f3liza 5%</p>
                              <p className="text-xs font-bold text-green-600">{formatCLP(card.poliza_cumplimiento)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <select
                              value={col.etapa_id}
                              onChange={e => moverEtapaMutation.mutate({ cardId: card.card_id, etapaId: e.target.value })}
                              className="flex-1 text-[11px] px-2 py-1 rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:border-brand-400 cursor-pointer"
                            >
                              {displayCols.map((c: any) => (
                                <option key={c.etapa_id} value={c.etapa_id}>{c.etapa_nombre}</option>
                              ))}
                            </select>
                            <a
                              href={`https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=${card.codigo}`}
                              target="_blank" rel="noopener noreferrer"
                              className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-brand-600 hover:border-brand-300 hover:bg-brand-50 transition-colors"
                              title="Ver en Mercado P\\u00fablico"
                            >
                              <ExternalLink size={11} />
                            </a>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
"""

with open(TARGET, 'w', encoding='utf-8') as f:
    f.write(NEW_CONTENT)

lines = NEW_CONTENT.count('\n')
print(f"Written {lines} lines to {TARGET}")
