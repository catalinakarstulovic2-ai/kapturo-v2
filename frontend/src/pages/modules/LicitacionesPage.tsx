import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../api/client'
import toast from 'react-hot-toast'
import {
  FileText, Search, ChevronDown, ChevronUp, Loader2,
  Mail, Phone, Globe, MapPin, User, Building2,
  Sparkles, BookmarkPlus, CheckCircle2, ExternalLink,
  SlidersHorizontal, RefreshCw, Filter, Download, Trash2, X, ArrowRight,
} from 'lucide-react'
import clsx from 'clsx'

// ── Tipos ────────────────────────────────────────────────────────────────────

interface Catalogo {
  regiones: { codigo: string; nombre: string }[]
  tipos: { codigo: string; nombre: string }[]
  estados: { codigo: string; label: string; api_codigo: number }[]
  rubros: string[]
}

interface LicitacionPreview {
  codigo: string
  nombre: string
  descripcion: string
  monto: number | null
  monto_adjudicado?: number | null
  organismo: string
  organismo_rut: string
  categoria: string
  region: string
  estado: string
  tipo: string
  fecha_cierre: string
  fecha_adjudicacion: string
  // Módulo B
  adjudicado_nombre?: string
  adjudicado_rut?: string
  // Si ya fue guardado
  prospect_id?: string
  email?: string
  phone?: string
  website?: string
  address?: string
  contact_name?: string
  enrichment_source?: string
  score?: number
  score_reason?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatMonto = (n: number | null | undefined) => {
  if (!n) return '—'
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}

const SourceBadge = ({ source }: { source?: string | null }) => {
  if (!source) return null
  const colors: Record<string, string> = {
    Apollo: 'bg-purple-100 text-purple-700',
    SII: 'bg-blue-100 text-blue-700',
    'Google Maps': 'bg-orange-100 text-orange-700',
    Google: 'bg-orange-100 text-orange-700',
    manual: 'bg-gray-100 text-gray-600',
  }
  return (
    <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded-full', colors[source] ?? 'bg-gray-100 text-gray-500')}>
      {source}
    </span>
  )
}

const ContactRow = ({ icon: Icon, label, value, source }: { icon: any; label: string; value?: string | null; source?: string | null }) => (
  <div className="flex items-start gap-2 text-sm">
    <Icon size={13} className="text-gray-400 mt-0.5 shrink-0" />
    <span className="text-gray-500 w-16 shrink-0">{label}</span>
    {value ? (
      <span className="text-gray-900 flex items-center gap-1.5">
        {value} <SourceBadge source={source} />
      </span>
    ) : (
      <span className="text-gray-300 italic">sin dato</span>
    )}
  </div>
)

const ScoreBadge = ({ score }: { score?: number | null }) => {
  if (score == null) return null
  const color = score >= 75 ? 'bg-emerald-100 text-emerald-700' : score >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'
  return <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full', color)}>{score.toFixed(0)}</span>
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function LicitacionesPage() {
  const [tab, setTab] = useState<'licitador_b' | 'licitador_a'>('licitador_b')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filtros, setFiltros] = useState({
    region: '',
    tipo_licitacion: '',
    periodo: '30',
    keyword: '',        // se mantiene para búsqueda de texto libre
    comprador: '',
    proveedor: '',
  })
  const [rubrosSeleccionados, setRubrosSeleccionados] = useState<string[]>([])
  const [showRubrosDropdown, setShowRubrosDropdown] = useState(false)
  const [totalDisponible, setTotalDisponible] = useState<number | null>(null)
  const [contexto, setContexto] = useState({ sector: '', experiencia: '', region_cliente: '' })
  const [resultados, setResultados] = useState<LicitacionPreview[]>([])
  const [totalResultados, setTotalResultados] = useState(0)
  const [enrichingId, setEnrichingId] = useState<string | null>(null)
  const [savingCodigo, setSavingCodigo] = useState<string | null>(null)
  const [showAvanzados, setShowAvanzados] = useState(false)
  const [searchSeconds, setSearchSeconds] = useState(0)
  const [cacheInfo, setCacheInfo] = useState<string | null>(null)
  const [rubrosConConteo, setRubrosConConteo] = useState<Record<string, number>>({})
  const [buscarRubroQuery, setBuscarRubroQuery] = useState('')
  const [previewContactos, setPreviewContactos] = useState<Record<string, { phone?: string; website?: string; address?: string; source?: string; loading?: boolean }>>({})  

  const queryClient = useQueryClient()

  // ── Restaurar búsqueda guardada al volver a la página ───────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem('kapturo_licitaciones_cache')
      if (saved) {
        const data = JSON.parse(saved)
        if (data.tab) setTab(data.tab)
        if (data.filtros) setFiltros(data.filtros)
        if (data.rubrosSeleccionados) setRubrosSeleccionados(data.rubrosSeleccionados)
        if (data.rubrosConConteo) setRubrosConConteo(data.rubrosConConteo)
        if (data.resultados?.length) {
          setResultados(data.resultados)
          setTotalResultados(data.total || 0)
          setTotalDisponible(data.total_disponible ?? null)
          setCacheInfo(data.savedAt ? new Date(data.savedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : null)
        }
      }
    } catch {}
  }, [])

  // ── Catálogo ────────────────────────────────────────────────────────────
  const { data: catalogo } = useQuery<Catalogo>({
    queryKey: ['licitaciones-catalogos'],
    queryFn: () => api.get('/modules/licitaciones/catalogos').then(r => r.data),
    staleTime: Infinity,
  })

  // ── Preview / Búsqueda ──────────────────────────────────────────────────
  const buscarMutation = useMutation({
    mutationFn: () => {
      const params = new URLSearchParams({ tipo: tab, pagina: '1' })
      const fmtDate = (d: Date) => d.toISOString().slice(0, 10)
      const hasta = new Date(); hasta.setDate(hasta.getDate() - 1)
      const desde = new Date(hasta); desde.setDate(desde.getDate() - (parseInt(filtros.periodo) - 1))
      params.set('fecha_desde', fmtDate(desde))
      params.set('fecha_hasta', fmtDate(hasta))
      if (filtros.region)          params.set('region', filtros.region)
      if (filtros.tipo_licitacion) params.set('tipo_licitacion', filtros.tipo_licitacion)
      if (rubrosSeleccionados.length > 0) params.set('keyword', rubrosSeleccionados.join(','))
      if (filtros.comprador)       params.set('comprador', filtros.comprador)
      if (filtros.proveedor)       params.set('proveedor', filtros.proveedor)
      return api.get(`/modules/licitaciones/preview?${params}`)
    },
    onSuccess: (res) => {
      setResultados(res.data.items)
      setTotalResultados(res.data.total)
      setExpandedId(null)
      const savedAt = new Date().toISOString()
      const rc: Record<string, number> = res.data.rubros_counts ?? {}
      setRubrosConConteo(rc)
      setCacheInfo(new Date(savedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }))
      setTotalDisponible(res.data.total_disponible ?? null)
      try {
        localStorage.setItem('kapturo_licitaciones_cache', JSON.stringify({
          tab, filtros, rubrosSeleccionados, rubrosConConteo: rc,
          resultados: res.data.items, total: res.data.total,
          total_disponible: res.data.total_disponible, savedAt,
        }))
      } catch {}
      toast.success(`${res.data.total} licitaciones encontradas`)
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Error en la búsqueda'),
  })

  // ── Timer de progreso de búsqueda ────────────────────────────────────────
  useEffect(() => {
    if (!buscarMutation.isPending) { setSearchSeconds(0); return }
    const interval = setInterval(() => setSearchSeconds(s => s + 1), 1000)
    return () => clearInterval(interval)
  }, [buscarMutation.isPending])

  // ── Guardar ─────────────────────────────────────────────────────────────
  const guardarMutation = useMutation({
    mutationFn: (item: LicitacionPreview) =>
      api.post('/modules/licitaciones/guardar', {
        tipo: tab,
        codigo: item.codigo,
        calificar: true,
        producto: filtros.keyword,
        sector: contexto.sector,
        rubro: item.categoria || filtros.keyword,
        experiencia: contexto.experiencia,
        region_cliente: contexto.region_cliente,
      }),
    onMutate: (item) => setSavingCodigo(item.codigo),
    onSuccess: (res, item) => {
      setSavingCodigo(null)
      if (res.data.status === 'duplicate') {
        toast('Ya guardado anteriormente', { icon: '⚠️' })
      } else {
        toast.success(`Guardado con score ${res.data.score?.toFixed(0) ?? '—'}`)
        // Actualizar el item en la lista local
        setResultados(prev =>
          prev.map(r => r.codigo === item.codigo
            ? {
                ...r,
                prospect_id: res.data.prospect_id,
                score: res.data.score,
                email: res.data.email ?? r.email,
                phone: res.data.phone ?? r.phone,
                website: res.data.website ?? r.website,
                address: res.data.address ?? r.address,
                contact_name: res.data.contact_name ?? r.contact_name,
                enrichment_source: res.data.enrichment_source ?? r.enrichment_source,
              }
            : r
          )
        )
      }
    },
    onError: (err: any) => {
      setSavingCodigo(null)
      toast.error(err.response?.data?.detail || 'Error al guardar')
    },
  })

  // ── Enriquecer ──────────────────────────────────────────────────────────
  const navigate = useNavigate()

  const enriquecerMutation = useMutation({
    mutationFn: (prospect_id: string) =>
      api.post(`/modules/licitaciones/enriquecer/${prospect_id}`),
    onMutate: (id) => setEnrichingId(id),
    onSuccess: (res, prospect_id) => {
      setEnrichingId(null)
      if (res.data.status === 'enriched') {
        toast.success(`Enriquecido vía ${res.data.source}: ${res.data.campos?.join(', ')}`)
        buscarMutation.mutate()
      } else {
        toast(
          (t) => (
            <div className="flex items-center gap-3">
              <span className="text-sm">No se encontraron datos de contacto para esta empresa.</span>
              <button
                onClick={() => { toast.dismiss(t.id); navigate('/prospectos') }}
                className="shrink-0 text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
              >
                Ver prospecto <ArrowRight size={12} />
              </button>
            </div>
          ),
          { icon: '🔍', duration: 6000 }
        )
      }
    },
    onError: () => {
      setEnrichingId(null)
      toast.error('Error al enriquecer')
    },
  })

  const setF = (k: string) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) =>
    setFiltros(f => ({ ...f, [k]: e.target.value }))
  const setC = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setContexto(c => ({ ...c, [k]: e.target.value }))

  const toggleExpand = (codigo: string, item?: LicitacionPreview) => {
    const next = expandedId === codigo ? null : codigo
    setExpandedId(next)
    // Auto-fetch contacto al abrir, solo si no tiene datos ya
    if (next && item && !item.prospect_id) {
      const nombreEmpresa = item.adjudicado_nombre || item.organismo
      if (nombreEmpresa && !previewContactos[codigo]) {
        setPreviewContactos(prev => ({ ...prev, [codigo]: { loading: true } }))
        api.get('/modules/licitaciones/preview-contacto', { params: { nombre: nombreEmpresa } })
          .then(res => {
            setPreviewContactos(prev => ({ ...prev, [codigo]: { ...res.data, loading: false } }))
          })
          .catch(() => {
            setPreviewContactos(prev => ({ ...prev, [codigo]: { loading: false } }))
          })
      }
    }
  }

  const limpiarBusqueda = () => {
    try { localStorage.removeItem('kapturo_licitaciones_cache') } catch {}
    setResultados([])
    setTotalResultados(0)
    setTotalDisponible(null)
    setCacheInfo(null)
    setExpandedId(null)
    setRubrosSeleccionados([])
    setRubrosConConteo({})
    setPreviewContactos({})
  }

  const descargarCSV = () => {
    const headers = ['Empresa', 'RUT', 'Licitación', 'Monto Adj.', 'Organismo', 'Categoría', 'Región', 'Adjudicada', 'Teléfono', 'Web', 'Email', 'Dirección', 'Score']
    const rows = resultados.map(item => [
      tab === 'licitador_b' ? (item.adjudicado_nombre || '') : item.organismo,
      tab === 'licitador_b' ? (item.adjudicado_rut || '') : item.organismo_rut,
      item.nombre,
      String(item.monto_adjudicado || item.monto || ''),
      item.organismo,
      item.categoria || '',
      item.region || '',
      item.fecha_adjudicacion || '',
      item.phone || '',
      item.website || '',
      item.email || '',
      item.address || '',
      item.score?.toFixed(0) || '',
    ])
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `licitaciones_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
          <FileText size={20} className="text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Módulo Licitaciones</h1>
          <p className="text-gray-500 text-sm">Mercado Público Chile · Datos disponibles tras adjudicación</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="card p-1 flex gap-1 max-w-xl">
        <button
          className={clsx('flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors', tab === 'licitador_b' ? 'bg-brand-500 text-white' : 'text-gray-600 hover:bg-gray-50')}
          onClick={() => { setTab('licitador_b'); setResultados([]); setCacheInfo(null); try { localStorage.removeItem('kapturo_licitaciones_cache') } catch {} }}
        >
          🏆 Empresas que ganaron
        </button>
        <button
          className={clsx('flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors', tab === 'licitador_a' ? 'bg-brand-500 text-white' : 'text-gray-600 hover:bg-gray-50')}
          onClick={() => { setTab('licitador_a'); setResultados([]); setCacheInfo(null); try { localStorage.removeItem('kapturo_licitaciones_cache') } catch {} }}
        >
          📋 Licitaciones abiertas
        </button>
      </div>

      {/* Panel de filtros */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <SlidersHorizontal size={15} className="text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">Filtros de búsqueda</span>
        </div>

        {/* Fila 1: Rubros (multi-select con buscador) */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Rubros
            <span className="ml-1 text-gray-400 font-normal">— puedes seleccionar varios</span>
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => { setShowRubrosDropdown(v => !v); setBuscarRubroQuery('') }}
              className="input text-sm w-full flex items-center justify-between text-left"
            >
              <span className="truncate text-gray-600">
                {rubrosSeleccionados.length === 0
                  ? (catalogo ? 'Todos los rubros (sin filtro)' : 'Cargando rubros…')
                  : `${rubrosSeleccionados.length} rubro${rubrosSeleccionados.length > 1 ? 's' : ''} seleccionado${rubrosSeleccionados.length > 1 ? 's' : ''}`}
              </span>
              <ChevronDown size={13} className={clsx('text-gray-400 shrink-0 transition-transform', showRubrosDropdown && 'rotate-180')} />
            </button>

            {showRubrosDropdown && (() => {
              const tieneConteos = Object.keys(rubrosConConteo).length > 0
              // Ordenar: seleccionados > con conteo (desc) > sin conteo (ocultos si hay conteos)
              const todosRubros = catalogo?.rubros ?? []
              const rubrosVisibles = todosRubros
                .filter(r => {
                  const matchQuery = !buscarRubroQuery || r.toLowerCase().includes(buscarRubroQuery.toLowerCase())
                  const tieneResultados = !tieneConteos || (rubrosConConteo[r] ?? 0) > 0 || rubrosSeleccionados.includes(r)
                  return matchQuery && tieneResultados
                })
                .sort((a, b) => {
                  const selA = rubrosSeleccionados.includes(a) ? 1 : 0
                  const selB = rubrosSeleccionados.includes(b) ? 1 : 0
                  if (selA !== selB) return selB - selA
                  return (rubrosConConteo[b] ?? 0) - (rubrosConConteo[a] ?? 0)
                })
              const conResultados = rubrosVisibles.filter(r => (rubrosConConteo[r] ?? 0) > 0 || !tieneConteos)
              const soloSeleccionados = rubrosVisibles.filter(r => rubrosSeleccionados.includes(r) && (rubrosConConteo[r] ?? 0) === 0 && tieneConteos)

              return (
                <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl">
                  {/* Buscador interno */}
                  <div className="p-2 border-b border-gray-100">
                    <input
                      autoFocus
                      type="text"
                      placeholder="Buscar rubro…"
                      value={buscarRubroQuery}
                      onChange={e => setBuscarRubroQuery(e.target.value)}
                      className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 outline-none focus:border-indigo-300 bg-gray-50"
                      onClick={e => e.stopPropagation()}
                    />
                  </div>

                  {/* Cabecera conteo + limpiar */}
                  <div className="px-3 py-1.5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <span className="text-[11px] text-gray-400">
                      {tieneConteos
                        ? `${conResultados.length + soloSeleccionados.length} rubros con resultados`
                        : `${todosRubros.length} rubros disponibles — busca primero para ver conteos`}
                    </span>
                    {rubrosSeleccionados.length > 0 && (
                      <button onClick={() => setRubrosSeleccionados([])} className="text-[11px] text-red-400 hover:text-red-600">Quitar todos</button>
                    )}
                  </div>

                  {/* Lista scrolleable */}
                  <div className="overflow-y-auto max-h-52">
                    {rubrosVisibles.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-4">Sin rubros que coincidan</p>
                    )}
                    {rubrosVisibles.map((r) => {
                      const count = rubrosConConteo[r] ?? 0
                      const selected = rubrosSeleccionados.includes(r)
                      return (
                        <label
                          key={r}
                          className={clsx(
                            'flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm transition-colors',
                            selected ? 'bg-indigo-50 hover:bg-indigo-100' : 'hover:bg-gray-50'
                          )}
                        >
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-indigo-600 shrink-0"
                            checked={selected}
                            onChange={(e) => {
                              setRubrosSeleccionados(prev =>
                                e.target.checked ? [...prev, r] : prev.filter(x => x !== r)
                              )
                            }}
                          />
                          <span className="capitalize flex-1">{r}</span>
                          {tieneConteos && count > 0 && (
                            <span className={clsx(
                              'text-[11px] font-medium px-1.5 py-0.5 rounded-full min-w-[22px] text-center',
                              selected ? 'bg-indigo-200 text-indigo-800' : 'bg-gray-100 text-gray-500'
                            )}>{count}</span>
                          )}
                        </label>
                      )
                    })}
                  </div>

                  {/* Footer: cerrar */}
                  <div className="p-2 border-t border-gray-100 flex justify-end">
                    <button
                      onClick={() => setShowRubrosDropdown(false)}
                      className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1 rounded-lg hover:bg-gray-100"
                    >
                      Listo
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Chips de rubros seleccionados */}
          {rubrosSeleccionados.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {rubrosSeleccionados.map(r => (
                <span key={r} className="inline-flex items-center gap-1 text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                  {r}
                  {rubrosConConteo[r] && <span className="text-indigo-400">{rubrosConConteo[r]}</span>}
                  <button onClick={() => setRubrosSeleccionados(prev => prev.filter(x => x !== r))}>
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Fila 2: Región · Tipo · Desde · Hasta */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Región</label>
            <select className="input text-sm" value={filtros.region} onChange={setF('region')}>
              <option value="">Todas las regiones</option>
              {catalogo?.regiones.map(r => (
                <option key={r.codigo} value={r.codigo}>{r.nombre}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de licitación</label>
            <select className="input text-sm" value={filtros.tipo_licitacion} onChange={setF('tipo_licitacion')}>
              <option value="">Todos los tipos</option>
              {catalogo?.tipos.map(t => (
                <option key={t.codigo} value={t.codigo}>{t.nombre}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Antigüedad</label>
            <select className="input text-sm" value={filtros.periodo} onChange={setF('periodo')}>
              <option value="7">Últimos 7 días</option>
              <option value="30">Último mes</option>
              <option value="90">Últimos 3 meses</option>
              <option value="180">Últimos 6 meses</option>
            </select>
          </div>
        </div>

        {/* Filtros avanzados (comprador / proveedor / contexto IA) */}
        <div>
          <button
            type="button"
            onClick={() => setShowAvanzados(v => !v)}
            className="text-xs text-indigo-600 flex items-center gap-1 hover:underline"
          >
            <Filter size={11} />
            {showAvanzados ? 'Ocultar filtros avanzados' : 'Más filtros (comprador, proveedor)'}
          </button>

          {showAvanzados && (
            <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Comprador (organismo)</label>
                  <input
                    className="input text-sm"
                    placeholder="Ej: Hospital, Municipalidad…"
                    value={filtros.comprador}
                    onChange={setF('comprador')}
                  />
                </div>
                {tab === 'licitador_b' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Proveedor adjudicado</label>
                    <input
                      className="input text-sm"
                      placeholder="Nombre de empresa ganadora…"
                      value={filtros.proveedor}
                      onChange={setF('proveedor')}
                    />
                  </div>
                )}
              </div>

            </div>
          )}
        </div>

        <button
          className="btn-primary flex items-center gap-2"
          onClick={() => buscarMutation.mutate()}
          disabled={buscarMutation.isPending}
        >
          {buscarMutation.isPending
            ? <><Loader2 size={15} className="animate-spin" />
                {searchSeconds < 5 ? 'Buscando licitaciones…' :
                 searchSeconds < 20 ? `Descargando detalles… ${searchSeconds}s` :
                 `Procesando resultados… ${searchSeconds}s`}
              </>
            : <><Search size={15} /> Buscar licitaciones</>}
        </button>
        {buscarMutation.isPending && (
          <div className="mt-2 text-xs text-gray-500 space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              {searchSeconds < 5 && 'Obteniendo lista de licitaciones…'}
              {searchSeconds >= 5 && searchSeconds < 15 && 'Descargando páginas de resultados…'}
              {searchSeconds >= 15 && searchSeconds < 40 && `Descargando detalle de cada licitación (puede tardar ~30s)… ${searchSeconds}s`}
              {searchSeconds >= 40 && `⏳ Casi listo, procesando… ${searchSeconds}s`}
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1">
              <div
                className="bg-indigo-400 h-1 rounded-full transition-all duration-1000"
                style={{ width: `${Math.min((searchSeconds / 45) * 100, 95)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Resultados */}
      {resultados.length > 0 && (
        <div className="card overflow-hidden">
          {/* Header tabla */}
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50 flex-wrap gap-2">
            <span className="text-sm font-semibold text-gray-700 flex items-center gap-2 flex-wrap">
              {totalResultados} licitaciones encontradas
              {totalDisponible !== null && totalDisponible !== totalResultados && (
                <span className="text-xs text-gray-400 font-normal">de {totalDisponible} disponibles</span>
              )}
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-normal">
                Período: últimos {filtros.periodo} días
              </span>
              {cacheInfo && (
                <span className="text-xs text-gray-400 font-normal">· guardado hoy {cacheInfo}</span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={descargarCSV}
                className="text-xs text-gray-600 flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
              >
                <Download size={11} /> Descargar CSV
              </button>
              <button
                onClick={limpiarBusqueda}
                className="text-xs text-red-400 flex items-center gap-1 px-2.5 py-1 rounded-lg border border-red-100 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={11} /> Limpiar
              </button>
              <button
                onClick={() => buscarMutation.mutate()}
                disabled={buscarMutation.isPending}
                className="text-xs text-gray-500 flex items-center gap-1 hover:text-gray-700 disabled:opacity-40"
              >
                <RefreshCw size={11} className={buscarMutation.isPending ? 'animate-spin' : ''} /> Actualizar
              </button>
            </div>
          </div>

          {/* Tabla */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-3 font-medium">
                    {tab === 'licitador_b' ? 'Empresa adjudicada' : 'Licitación'}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {tab === 'licitador_b' ? 'Monto adj.' : 'Monto est.'}
                  </th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Rubro</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Región</th>
                  <th className="px-4 py-3 font-medium hidden lg:table-cell">
                    {tab === 'licitador_b' ? 'Organismo' : 'Cierre'}
                  </th>
                  <th className="px-4 py-3 font-medium text-center">Score</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {resultados.map((item) => (
                  <>
                    {/* Fila principal */}
                    <tr
                      key={item.codigo}
                      className={clsx(
                        'hover:bg-gray-50 cursor-pointer transition-colors',
                        expandedId === item.codigo && 'bg-indigo-50/30'
                      )}
                      onClick={() => toggleExpand(item.codigo, item)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 line-clamp-1">
                          {tab === 'licitador_b' ? (item.adjudicado_nombre || '—') : item.nombre}
                        </div>
                        {tab === 'licitador_b' && (
                          <div className="text-xs text-gray-400 mt-0.5 line-clamp-1">{item.nombre}</div>
                        )}
                        {tab === 'licitador_b' && item.adjudicado_rut && (
                          <div className="text-xs text-gray-400">RUT {item.adjudicado_rut}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
                        {tab === 'licitador_b'
                          ? formatMonto(item.monto_adjudicado || item.monto)
                          : formatMonto(item.monto)}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full line-clamp-1">
                          {item.categoria || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden md:table-cell text-xs">{item.region || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 hidden lg:table-cell text-xs line-clamp-1">
                        {tab === 'licitador_b' ? item.organismo : item.fecha_cierre}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {item.prospect_id
                          ? <ScoreBadge score={item.score} />
                          : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {expandedId === item.codigo
                          ? <ChevronUp size={15} className="text-gray-400 ml-auto" />
                          : <ChevronDown size={15} className="text-gray-400 ml-auto" />}
                      </td>
                    </tr>

                    {/* Panel expandido inline */}
                    {expandedId === item.codigo && (
                      <tr key={`${item.codigo}-detail`}>
                        <td colSpan={7} className="bg-gray-50 px-5 py-4 border-b border-gray-100">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                            {/* Columna izquierda: info licitación */}
                            <div className="space-y-3">
                              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Detalle licitación</h4>
                              <div className="space-y-1.5 text-sm">
                                <p><span className="text-gray-500">Código:</span> <span className="font-mono text-gray-800">{item.codigo}</span></p>
                                <p className="text-gray-800 leading-relaxed">{item.nombre}</p>
                                {item.descripcion && (
                                  <p className="text-gray-500 text-xs leading-relaxed">{item.descripcion}</p>
                                )}
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600 mt-2">
                                  <span><strong>Organismo:</strong> {item.organismo}</span>
                                  <span><strong>Estado:</strong> {item.estado}</span>
                                  <span><strong>Tipo:</strong> {item.tipo || '—'}</span>
                                  <span><strong>Región:</strong> {item.region}</span>
                                  {item.fecha_adjudicacion && <span><strong>Adjudicada:</strong> {item.fecha_adjudicacion}</span>}
                                  {item.fecha_cierre && <span><strong>Cierre:</strong> {item.fecha_cierre}</span>}
                                </div>
                                <div className="mt-2 pt-2 border-t border-gray-200">
                                  <p className="text-xs text-gray-500">Monto estimado</p>
                                  <p className="text-lg font-bold text-gray-900">{formatMonto(item.monto)}</p>
                                  {item.monto_adjudicado && item.monto_adjudicado !== item.monto && (
                                    <>
                                      <p className="text-xs text-gray-500 mt-1">Monto adjudicado</p>
                                      <p className="text-lg font-bold text-emerald-700">{formatMonto(item.monto_adjudicado)}</p>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Columna derecha: contacto */}
                            <div className="space-y-3">
                              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                {tab === 'licitador_b' ? 'Empresa adjudicada' : 'Organismo convocante'}
                              </h4>
                              {(() => {
                                const pc = previewContactos[item.codigo]
                                const phone   = item.phone   || pc?.phone
                                const website = item.website || pc?.website
                                const address = item.address || pc?.address
                                const esource = item.enrichment_source || pc?.source
                                return (
                                  <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-2.5">
                                    <ContactRow icon={Building2} label="Empresa" value={tab === 'licitador_b' ? item.adjudicado_nombre : item.organismo} source="MP" />
                                    <ContactRow icon={FileText} label="RUT" value={tab === 'licitador_b' ? item.adjudicado_rut : item.organismo_rut} source="MP" />
                                    <ContactRow icon={User} label="Contacto" value={item.contact_name} source={esource} />
                                    <ContactRow icon={Mail} label="Email" value={item.email} source={esource} />
                                    <ContactRow
                                      icon={Phone} label="Teléfono"
                                      value={pc?.loading ? '…buscando' : phone}
                                      source={phone ? esource : undefined}
                                    />
                                    <ContactRow
                                      icon={Globe} label="Web"
                                      value={pc?.loading ? '…buscando' : website}
                                      source={website ? esource : undefined}
                                    />
                                    <ContactRow
                                      icon={MapPin} label="Dirección"
                                      value={pc?.loading ? '…buscando' : address}
                                      source={address ? esource : undefined}
                                    />
                                    {pc?.loading && (
                                      <div className="flex items-center gap-1.5 text-xs text-gray-400 pt-1">
                                        <Loader2 size={11} className="animate-spin" />
                                        Buscando datos de contacto en Google Maps…
                                      </div>
                                    )}
                                    {!pc?.loading && !phone && !website && !address && !item.prospect_id && (
                                      <p className="text-xs text-gray-400 italic pt-1">No se encontraron datos de contacto públicos</p>
                                    )}
                                    {/* Razón del score si fue guardado */}
                                    {item.score_reason && (
                                      <div className="pt-2 mt-1 border-t border-gray-100">
                                        <p className="text-xs text-gray-500 italic">{item.score_reason}</p>
                                      </div>
                                    )}
                                  </div>
                                )
                              })()}

                              {/* Acciones */}
                              <div className="flex flex-wrap gap-2">
                                {/* Enriquecer (solo si ya fue guardado) */}
                                {item.prospect_id && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); enriquecerMutation.mutate(item.prospect_id!) }}
                                    disabled={enrichingId === item.prospect_id}
                                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-purple-200 text-purple-700 hover:bg-purple-50 disabled:opacity-50 transition-colors"
                                  >
                                    {enrichingId === item.prospect_id
                                      ? <Loader2 size={11} className="animate-spin" />
                                      : <Sparkles size={11} />}
                                    Enriquecer contacto
                                  </button>
                                )}

                                {/* Guardar */}
                                {item.prospect_id ? (
                                  <div className="flex items-center gap-2">
                                    <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700">
                                      <CheckCircle2 size={11} /> Guardado
                                    </span>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); navigate('/prospectos') }}
                                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                                    >
                                      Ver prospecto <ArrowRight size={11} />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); guardarMutation.mutate(item) }}
                                    disabled={savingCodigo === item.codigo}
                                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
                                  >
                                    {savingCodigo === item.codigo
                                      ? <Loader2 size={11} className="animate-spin" />
                                      : <BookmarkPlus size={11} />}
                                    Guardar como prospecto
                                  </button>
                                )}

                                {/* Ver en MP */}
                                <a
                                  href={`https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=${item.codigo}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
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

      {/* Estado vacío */}
      {resultados.length === 0 && !buscarMutation.isPending && (
        <div className="card p-10 text-center text-gray-400">
          <FileText size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Configura los filtros y lanza la búsqueda para ver licitaciones.</p>
        </div>
      )}
    </div>
  )
}
