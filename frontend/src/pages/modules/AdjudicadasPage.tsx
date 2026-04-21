import { useState, useRef, useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../api/client'
import toast from 'react-hot-toast'
import {
  Trophy, Search, SlidersHorizontal, Loader2,
  ChevronDown, ChevronUp, BookmarkPlus, CheckCircle2,
  ExternalLink, RefreshCw, Trash2, Kanban,
  Phone, Mail, Globe, Linkedin, User as UserIcon, AlertCircle,
  Download, Bookmark, BookOpen, X,
  Sparkles, Calendar,
} from 'lucide-react'
import clsx from 'clsx'
import { useAdjudicadasStore, type BusquedaGuardada, type Pestana } from '../../store/adjudicadasStore'
import { useAuthStore } from '../../store/authStore'
import SearchingPopup from '../../components/ui/SearchingPopup'

interface Contacto {
  nombre: string
  cargo: string
  email: string
  telefono: string
  linkedin: string
}

interface ContactoData {
  ok: boolean
  empresa?: string
  website?: string
  telefono?: string
  linkedin?: string
  industria?: string
  direccion?: string
  maps_url?: string
  contactos: Contacto[]
  error?: string
}

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

interface PorAdjudicarsItem {
  codigo: string
  nombre: string
  organismo: string
  organismo_rut?: string
  region: string
  fecha_cierre: string
  fecha_estimada_adjudicacion?: string
  fecha_publicacion?: string
  monto_estimado: number | null
  ofertantes: { rut?: string; nombre?: string; monto_oferta?: number }[]
  ofertantes_count: number
}

const TABS: { id: Pestana; label: string }[] = [
  { id: 'adjudicadas',     label: 'Adjudicadas'  },
  { id: 'por_adjudicarse', label: 'Publicadas'   },
  { id: 'cerrada',         label: 'Cerradas'     },
  { id: 'desierta',        label: 'Desiertas'    },
  { id: 'revocada',        label: 'Revocadas'    },
  { id: 'suspendida',      label: 'Suspendidas'  },
]

const formatCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const RUBRO_GRUPOS: { label: string; icon: string; rubros: string[] }[] = [
  { label: 'Salud y Medicina',         icon: '🏥', rubros: ['salud', 'médico', 'farmacéutico', 'hospitalario', 'laboratorio', 'veterinario'] },
  { label: 'Construcción y Obras',     icon: '🏗️', rubros: ['construcción', 'infraestructura', 'obras civiles', 'arquitectura', 'forestal'] },
  { label: 'Tecnología y TI',          icon: '💻', rubros: ['tecnología', 'informática', 'software', 'telecomunicaciones'] },
  { label: 'Educación y Capacitación', icon: '📚', rubros: ['educación', 'capacitación'] },
  { label: 'Alimentación y Hotelería', icon: '🍽️', rubros: ['alimentos', 'hotelería'] },
  { label: 'Transporte y Logística',   icon: '🚛', rubros: ['transporte', 'logística', 'vehículos'] },
  { label: 'Mantenimiento y Aseo',     icon: '🧹', rubros: ['mantención', 'aseo', 'limpieza', 'residuos'] },
  { label: 'Servicios Profesionales',  icon: '📋', rubros: ['consultoría', 'jurídico', 'recursos humanos', 'marketing'] },
  { label: 'Energía e Industria',      icon: '⚡', rubros: ['energía', 'combustible', 'maquinaria', 'minería', 'agrícola'] },
  { label: 'Seguridad y Seguros',      icon: '🛡️', rubros: ['seguridad', 'seguros'] },
  { label: 'Bienes y Otros',           icon: '📦', rubros: ['mobiliario', 'vestuario', 'uniformes', 'imprenta', 'deportes'] },
]

export default function AdjudicadasPage() {
  const navigate = useNavigate()

  // Estado persistido (sobrevive navegación)
  const {
    pestana, setPestana,
    resultados, setResultados: storeSetResultados,
    totalResultados, paginaActual,
    filtros, setFiltros: storeFiltros,
    rubrosSeleccionados, setRubrosSeleccionados,
    sortMonto, setSortMonto,
    marcarGuardado,
    busquedasGuardadas, guardarBusqueda, eliminarBusqueda, cargarBusqueda,
    limpiar: limpiarStore,
  } = useAdjudicadasStore()

  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'

  // Estado solo-UI (no necesita persistir)
  const [expandedId, setExpandedId]         = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [showRubrosDropdown, setShowRubrosDropdown] = useState(false)
  const [buscarRubroQuery, setBuscarRubroQuery]     = useState('')
  const [categoriaActiva, setCategoriaActiva]       = useState<string | null>(null)
  const [savingCodigo, setSavingCodigo]             = useState<string | null>(null)
  const [contactoCache, setContactoCache]           = useState<Record<string, ContactoData | 'loading'>>({}) 
  const [showBusquedas, setShowBusquedas]           = useState(false)
  const [nombreBusqueda, setNombreBusqueda]         = useState('')
  const [showSaveModal, setShowSaveModal]           = useState(false)

  // Estados para propuesta IA + configuración
  const [modalPropuesta, setModalPropuesta] = useState<{
    prospectId: string
    empresa: string
    proyecto: string
  } | null>(null)
  const [formatoPropuesta, setFormatoPropuesta] = useState<'whatsapp' | 'email' | 'presupuesto'>('whatsapp')
  const [propuestaGenerada, setPropuestaGenerada] = useState('')
  const [mostrarConfig, setMostrarConfig] = useState(false)
  const [contextoGuardado, setContextoGuardado] = useState('')
  const [contextoEditando, setContextoEditando] = useState('')

  // Cierra el dropdown de rubros al hacer click fuera
  const rubrosRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!showRubrosDropdown) return
    const handler = (e: MouseEvent) => {
      if (rubrosRef.current && !rubrosRef.current.contains(e.target as Node)) {
        setShowRubrosDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showRubrosDropdown])

  // Cargar configuración del módulo al montar (3d)
  useEffect(() => {
    api.get('/modules/adjudicadas/config').then(res => {
      setContextoGuardado(res.data.contexto_vendedor || '')
      setContextoEditando(res.data.contexto_vendedor || '')
    }).catch(() => {})
  }, [])

  const setF = (k: string) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) =>
    storeFiltros({ [k]: e.target.value })

  // Catálogo de rubros — usa endpoint de adjudicadas que ya filtra por tenant
  const { data: catalogo } = useQuery<Catalogo>({
    queryKey: ['adjudicadas-catalogos'],
    queryFn: () => api.get('/modules/adjudicadas/catalogos').then(r => r.data),
    staleTime: Infinity,
  })

  // Búsqueda
  const buscarMutation = useMutation({
    mutationFn: (pagina: number) => {
      // Cancelar cualquier búsqueda anterior en vuelo
      abortRef.current?.abort()
      abortRef.current = new AbortController()
      const params = new URLSearchParams({ pestana, pagina: String(pagina) })
      if (filtros.region)       params.set('region', filtros.region)
      if (filtros.periodo)      params.set('periodo', filtros.periodo)
      if (filtros.monto_minimo) params.set('monto_minimo', filtros.monto_minimo)
      const kw = rubrosSeleccionados.length > 0 ? rubrosSeleccionados.join(',') : filtros.keyword
      if (kw) params.set('keyword', kw)
      return api.get(`/modules/adjudicadas/preview?${params}`, { signal: abortRef.current.signal })
    },
    onSuccess: (res, pagina) => {
      const data  = res.data
      const items = Array.isArray(data) ? data : (data.resultados ?? [])
      const total = Array.isArray(data) ? items.length : (data.total ?? items.length)
      storeSetResultados(items, total, pagina)
      setExpandedId(null)
      setContactoCache({})
      toast.success(`${total.toLocaleString('es-CL')} licitaciones encontradas`)
    },
    onError: (err: any) => {
      // Ignorar errores de cancelación (AbortController)
      if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return
      const detail = err.response?.data?.detail
      const msg = Array.isArray(detail)
        ? detail[0]?.msg ?? 'Error de validación'
        : (detail ?? 'Error conectando con el servidor')
      toast.error(String(msg))
    },
  })

  // Guardar al pipeline
  const guardarMutation = useMutation({
    mutationFn: (codigo: string) => {
      const ct = contactoCache[codigo]
      const ctData = ct && ct !== 'loading' ? (ct as ContactoData) : null
      const primerContacto = ctData?.ok ? ctData.contactos?.[0] : null
      const body = {
        contact_name: primerContacto?.nombre || undefined,
        email:        primerContacto?.email   || undefined,
        phone:        ctData?.telefono || primerContacto?.telefono || undefined,
        whatsapp:     ctData?.telefono || primerContacto?.telefono || undefined,
      }
      return api.post(`/modules/adjudicadas/guardar/${codigo}`, body)
    },
    onMutate:  (codigo) => setSavingCodigo(codigo),
    onSuccess: (res, codigo) => {
      setSavingCodigo(null)
      toast.success('Guardado en el pipeline')
      marcarGuardado(codigo, res.data?.id ?? res.data?.prospect_id ?? codigo)
    },
    onError: (err: any) => {
      setSavingCodigo(null)
      toast.error(err.response?.data?.detail || 'Error al guardar')
    },
  })

  const propuestaMutation = useMutation({
    mutationFn: ({ prospectId, formato }: { prospectId: string; formato: string }) =>
      api.post('/modules/adjudicadas/propuesta', { prospect_id: prospectId, formato }),
    onSuccess: (res) => setPropuestaGenerada(res.data.propuesta),
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Error al generar propuesta'),
  })

  const configMutation = useMutation({
    mutationFn: (contexto: string) =>
      api.post('/modules/adjudicadas/config', { contexto_vendedor: contexto }),
    onSuccess: () => {
      setContextoGuardado(contextoEditando)
      setMostrarConfig(false)
      toast.success('Configuración guardada')
    },
    onError: () => toast.error('Error al guardar configuración'),
  })

  // Buscar contacto de empresa
  const buscarContacto = async (codigo: string, nombre: string) => {
    if (contactoCache[codigo]) return
    setContactoCache(prev => ({ ...prev, [codigo]: 'loading' }))
    try {
      const res = await api.get('/modules/adjudicadas/contacto', { params: { nombre } })
      setContactoCache(prev => ({ ...prev, [codigo]: res.data }))
    } catch {
      setContactoCache(prev => ({ ...prev, [codigo]: { ok: false, contactos: [], error: 'Sin datos de contacto disponibles' } }))
    }
  }

  const limpiar = () => {
    limpiarStore()
    setExpandedId(null)
    setContactoCache({})
    setShowRubrosDropdown(false)
    setBuscarRubroQuery('')
    setCategoriaActiva(null)
  }

  const handleGuardarBusqueda = () => {
    const nombre = nombreBusqueda.trim() || `Búsqueda ${new Date().toLocaleDateString('es-CL')}`
    guardarBusqueda(nombre)
    setNombreBusqueda('')
    setShowSaveModal(false)
    toast.success('Búsqueda guardada')
  }

  const handleCargarBusqueda = (b: BusquedaGuardada) => {
    cargarBusqueda(b)
    setShowBusquedas(false)
    toast.success(`Filtros cargados: ${b.nombre} — presiona Buscar para ver resultados`)
  }

  const exportCSV = () => {
    const headers = ['Empresa','RUT','Código','Nombre','Organismo','Región','Fecha adj.','Monto adj.','Póliza 1%','Póliza 5%']
    const rows = sortedResultados.map(r => [
      r.nombre_adjudicado, r.rut_adjudicado, r.codigo, r.nombre,
      r.organismo, r.region, r.fecha_adjudicacion,
      r.monto_adjudicado, r.poliza_seriedad, r.poliza_cumplimiento,
    ])
    const csv = [headers, ...rows].map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `adjudicadas_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  const _montoField = (r: any): number =>
    r.monto_adjudicado ?? r.monto_estimado ?? 0

  const sortedResultados = sortMonto === 'none'
    ? resultados
    : [...resultados].sort((a, b) =>
        sortMonto === 'asc'
          ? _montoField(a) - _montoField(b)
          : _montoField(b) - _montoField(a)
      )

  const toggleSortMonto = () => {
    const next = sortMonto === 'none' ? 'desc' : sortMonto === 'desc' ? 'asc' : 'none'
    setSortMonto(next as 'none' | 'asc' | 'desc')
  }

  return (
    <div className="space-y-5">
      <SearchingPopup
        visible={buscarMutation.isPending}
        title="Buscando licitaciones"
        messages={[
          'Conectando con Mercado Público...',
          'Aplicando filtros de búsqueda...',
          'Procesando resultados...',
          'Ordenando por relevancia...',
          'Preparando la información...',
        ]}
      />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
            <Trophy size={20} className="text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Mercado Público</h1>
            <p className="text-gray-500 text-xs sm:text-sm hidden sm:block">Licitaciones públicas de Chile · Empresas, contratos y oportunidades</p>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {isAdmin && (
            <button
              onClick={() => setMostrarConfig(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              <Sparkles size={14} />
              <span className="hidden sm:inline">Configurar módulo</span>
            </button>
          )}
          <button
            onClick={() => navigate('/pipeline')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200"
          >
            <Kanban size={14} /> <span className="hidden sm:inline">Ver Pipeline</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="card p-1 flex gap-1 overflow-x-auto scrollbar-none">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={clsx(
              'shrink-0 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
              pestana === tab.id ? 'bg-brand-500 text-white' : 'text-gray-600 hover:bg-gray-50'
            )}
            onClick={() => {
              setPestana(tab.id)
              setExpandedId(null)
              setContactoCache({})
              setShowRubrosDropdown(false)
              storeSetResultados([], 0, 1)
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Descripción contextual por tab */}
      {(() => {
        const INFO: Record<string, { icon: string; texto: string; color: string }> = {
          adjudicadas:     { icon: '🏆', texto: 'El ganador ya fue declarado oficialmente. Identifica la empresa adjudicada y contáctalas en el momento justo.', color: 'bg-amber-50 border-amber-200 text-amber-800' },
          por_adjudicarse: { icon: '⏳', texto: 'El plazo de ofertas aún está abierto. Detecta las licitaciones activas y las empresas que están compitiendo.', color: 'bg-blue-50 border-blue-200 text-blue-800' },
          cerrada:         { icon: '🔍', texto: 'El plazo venció y el organismo está evaluando las ofertas. En los próximos días se declarará un ganador.', color: 'bg-violet-50 border-violet-200 text-violet-800' },
          desierta:        { icon: '🚫', texto: 'Nadie presentó ofertas. El organismo podría relanzar la licitación bajo condiciones similares.', color: 'bg-gray-50 border-gray-200 text-gray-600' },
          revocada:        { icon: '↩️', texto: 'El organismo canceló el proceso antes de adjudicar. Pueden ser relanzadas en el futuro.', color: 'bg-red-50 border-red-200 text-red-700' },
          suspendida:      { icon: '⏸️', texto: 'El proceso está pausado temporalmente. Puede retomarse o terminar cancelado.', color: 'bg-orange-50 border-orange-200 text-orange-700' },
        }
        const info = INFO[pestana]
        if (!info) return null
        return (
          <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${info.color}`}>
            <span className="text-base shrink-0 mt-0.5">{info.icon}</span>
            <p className="leading-snug">{info.texto}</p>
          </div>
        )
      })()}

      {/* Filtros */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={15} className="text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">Filtros de búsqueda</span>
        </div>

        {/* Rubros */}
        <div ref={rubrosRef}>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Rubro / Industria</label>
          <button
            type="button"
            onClick={() => { setShowRubrosDropdown(v => !v); setBuscarRubroQuery(''); setCategoriaActiva(null) }}
            className={clsx(
              'w-full flex items-center justify-between px-3 py-2.5 rounded-xl border bg-white text-left transition-all',
              showRubrosDropdown
                ? 'border-brand-400 ring-2 ring-brand-100'
                : 'border-gray-300 hover:border-gray-400'
            )}
          >
            <span className={clsx('text-sm', rubrosSeleccionados.length > 0 ? 'text-gray-900 font-medium' : 'text-gray-400')}>
              {rubrosSeleccionados.length === 0
                ? 'Todos los rubros'
                : `${rubrosSeleccionados.length} rubro${rubrosSeleccionados.length > 1 ? 's' : ''} seleccionado${rubrosSeleccionados.length > 1 ? 's' : ''}`}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              {rubrosSeleccionados.length > 0 && (
                <button
                  onClick={e => { e.stopPropagation(); setRubrosSeleccionados([]); setCategoriaActiva(null) }}
                  className="text-gray-400 hover:text-red-500 transition-colors p-0.5 rounded"
                >
                  <X size={12} />
                </button>
              )}
              <ChevronDown size={15} className={clsx('text-gray-400 transition-transform', showRubrosDropdown && 'rotate-180')} />
            </div>
          </button>

          {/* Chips seleccionados visibles debajo */}
          {rubrosSeleccionados.length > 0 && !showRubrosDropdown && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {rubrosSeleccionados.slice(0, 6).map(r => (
                <button
                  key={r}
                  onClick={() => setRubrosSeleccionados(rubrosSeleccionados.filter(x => x !== r))}
                  className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-brand-50 border border-brand-200 text-brand-700 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors"
                >
                  {r} <X size={9} />
                </button>
              ))}
              {rubrosSeleccionados.length > 6 && (
                <span className="text-[11px] text-gray-400 self-center">+{rubrosSeleccionados.length - 6} más</span>
              )}
            </div>
          )}

          {/* Panel expandido */}
          {showRubrosDropdown && (
            <div className="mt-2 border border-gray-200 rounded-2xl bg-white overflow-hidden shadow-md">

              {/* Buscador */}
              <div className="px-3 pt-3 pb-2">
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    autoFocus type="text" placeholder="Buscar rubro…"
                    value={buscarRubroQuery}
                    onChange={e => { setBuscarRubroQuery(e.target.value); setCategoriaActiva(null) }}
                    className="w-full text-sm pl-8 pr-3 py-2 rounded-xl border border-gray-200 outline-none focus:border-brand-300 bg-gray-50 focus:bg-white transition-colors"
                  />
                </div>
              </div>

              {!buscarRubroQuery && (
                /* Tabs de categoría — scroll horizontal */
                <div className="px-3 pb-2">
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    <button
                      onClick={() => setCategoriaActiva(null)}
                      className={clsx(
                        'shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap',
                        categoriaActiva === null ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      )}
                    >
                      Todos
                    </button>
                    {RUBRO_GRUPOS.filter(g => g.rubros.filter(r => (catalogo?.rubros ?? []).includes(r)).length > 0).map(g => {
                      const disponibles = g.rubros.filter(r => (catalogo?.rubros ?? []).includes(r))
                      const sel = disponibles.filter(r => rubrosSeleccionados.includes(r)).length
                      return (
                        <button key={g.label}
                          onClick={() => setCategoriaActiva(cat => cat === g.label ? null : g.label)}
                          className={clsx(
                            'shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap',
                            categoriaActiva === g.label
                              ? 'bg-gray-800 text-white'
                              : sel > 0
                                ? 'bg-brand-50 border border-brand-200 text-brand-700'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          )}
                        >
                          <span>{g.icon}</span>
                          <span>{g.label.split(' ')[0]}</span>
                          {sel > 0 && (
                            <span className={clsx('rounded-full text-[10px] font-bold w-4 h-4 flex items-center justify-center',
                              categoriaActiva === g.label ? 'bg-white text-gray-800' : 'bg-brand-500 text-white'
                            )}>{sel}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Acción "Seleccionar todos" para la categoría activa o búsqueda */}
              {(() => {
                const allRubros = catalogo?.rubros ?? []
                let items: string[]
                if (buscarRubroQuery) {
                  items = allRubros.filter(r => r.toLowerCase().includes(buscarRubroQuery.toLowerCase()))
                } else if (categoriaActiva) {
                  items = RUBRO_GRUPOS.find(g => g.label === categoriaActiva)?.rubros.filter(r => allRubros.includes(r)) ?? []
                } else {
                  return null // en vista "Todos" no tiene sentido seleccionar 42 rubros
                }
                if (items.length === 0) return null
                const todosSeleccionados = items.every(r => rubrosSeleccionados.includes(r))
                return (
                  <div className="px-3 pb-2 flex items-center justify-between">
                    <span className="text-[11px] text-gray-400">{items.length} rubros en esta categoría</span>
                    <button
                      onClick={() => {
                        if (todosSeleccionados) {
                          setRubrosSeleccionados(rubrosSeleccionados.filter(r => !items.includes(r)))
                        } else {
                          setRubrosSeleccionados([...new Set([...rubrosSeleccionados, ...items])])
                        }
                      }}
                      className={clsx(
                        'text-xs px-3 py-1 rounded-lg font-semibold transition-colors',
                        todosSeleccionados
                          ? 'bg-red-50 text-red-500 hover:bg-red-100'
                          : 'bg-brand-500 text-white hover:bg-brand-600'
                      )}
                    >
                      {todosSeleccionados ? 'Quitar todos' : 'Seleccionar todos'}
                    </button>
                  </div>
                )
              })()}

              {/* Grid de rubros */}
              <div className="px-3 pb-3">
                {(() => {
                  const allRubros = catalogo?.rubros ?? []
                  let items: string[]
                  if (buscarRubroQuery) {
                    items = allRubros.filter(r => r.toLowerCase().includes(buscarRubroQuery.toLowerCase())).sort((a, b) => a.localeCompare(b))
                  } else if (categoriaActiva) {
                    items = RUBRO_GRUPOS.find(g => g.label === categoriaActiva)?.rubros.filter(r => allRubros.includes(r)) ?? []
                  } else {
                    items = RUBRO_GRUPOS.flatMap(g => g.rubros.filter(r => allRubros.includes(r)))
                  }
                  if (items.length === 0) return <p className="text-xs text-gray-400 text-center py-4">Sin resultados</p>
                  return (
                    <div className="grid grid-cols-2 gap-2">
                      {items.map(r => {
                        const sel = rubrosSeleccionados.includes(r)
                        return (
                          <button
                            key={r}
                            onClick={() => setRubrosSeleccionados(sel ? rubrosSeleccionados.filter(x => x !== r) : [...rubrosSeleccionados, r])}
                            className={clsx(
                              'flex items-center gap-2.5 px-3 py-3 rounded-xl border text-left text-sm font-medium transition-all touch-manipulation',
                              sel
                                ? 'border-brand-400 bg-brand-50 text-brand-800 shadow-sm'
                                : 'border-gray-100 bg-gray-50 text-gray-700 hover:border-gray-300 hover:bg-white active:scale-[0.98]'
                            )}
                          >
                            <span className={clsx(
                              'w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all',
                              sel ? 'border-brand-500 bg-brand-500' : 'border-gray-300'
                            )}>
                              {sel && <span className="block w-1.5 h-1.5 rounded-full bg-white" />}
                            </span>
                            <span className="capitalize leading-snug">{r}</span>
                          </button>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>

              {/* Footer */}
              <div className="px-3 pb-3 pt-1 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {rubrosSeleccionados.length === 0 ? 'Ninguno seleccionado' : `${rubrosSeleccionados.length} seleccionado${rubrosSeleccionados.length > 1 ? 's' : ''}`}
                </span>
                <button
                  onClick={() => setShowRubrosDropdown(false)}
                  className="text-sm px-4 py-1.5 rounded-xl bg-gray-900 text-white font-medium hover:bg-gray-700 transition-colors"
                >
                  Listo
                </button>
              </div>

            </div>
          )}
        </div>

        {/* Grid de filtros */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Región</label>
            <select className="input text-sm" value={filtros.region} onChange={setF('region')}>
              <option value="">Todas las regiones</option>
              <option value="13">Metropolitana</option>
              <option value="5">Valparaíso</option>
              <option value="8">Biobío</option>
              <option value="9">La Araucanía</option>
              <option value="7">Maule</option>
              <option value="10">Los Lagos</option>
              <option value="4">Coquimbo</option>
              <option value="6">O'Higgins</option>
              <option value="16">Ñuble</option>
              <option value="2">Antofagasta</option>
              <option value="1">Tarapacá</option>
              <option value="3">Atacama</option>
              <option value="11">Aysén</option>
              <option value="12">Magallanes</option>
              <option value="14">Los Ríos</option>
              <option value="15">Arica y Parinacota</option>
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
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Monto mínimo</label>
            <input type="number" className="input text-sm" placeholder="Ej: 10000000" value={filtros.monto_minimo} onChange={setF('monto_minimo')} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre / texto</label>
            <input
              type="text" className="input text-sm" placeholder="Ej: construcción…"
              value={filtros.keyword} onChange={setF('keyword')}
              disabled={rubrosSeleccionados.length > 0}
            />
          </div>
        </div>

        <div className="sticky bottom-0 -mx-5 -mb-5 px-5 pb-4 pt-3 bg-white/90 backdrop-blur-sm border-t border-gray-100 rounded-b-2xl">

          {/* Búsquedas guardadas panel */}
          {showBusquedas && busquedasGuardadas.length > 0 && (
            <div className="mb-3 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-600">Búsquedas guardadas</span>
                <button onClick={() => setShowBusquedas(false)} className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
              </div>
              <div className="divide-y divide-gray-50 max-h-44 overflow-y-auto">
                {busquedasGuardadas.map(b => (
                  <div key={b.id} className="flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 group">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{b.nombre}</p>
                      <p className="text-[11px] text-gray-400">{b.fecha} · {{ adjudicadas: 'Adjudicadas', por_adjudicarse: 'Publicadas', cerrada: 'Cerradas', desierta: 'Desiertas', revocada: 'Revocadas', suspendida: 'Suspendidas' }[b.pestana] ?? b.pestana} {b.rubrosSeleccionados.length > 0 && `· ${b.rubrosSeleccionados.length} rubros`}</p>
                    </div>
                    <button onClick={() => handleCargarBusqueda(b)}
                      className="text-[11px] font-semibold text-brand-600 hover:text-brand-700 px-2 py-1 rounded-lg hover:bg-brand-50 transition-colors shrink-0">
                      Cargar
                    </button>
                    <button onClick={() => eliminarBusqueda(b.id)}
                      className="text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Modal guardar búsqueda */}
          {showSaveModal && (
            <div className="mb-3 border border-brand-200 rounded-xl p-3 bg-brand-50">
              <p className="text-xs font-semibold text-brand-700 mb-2">Nombre para esta búsqueda</p>
              <div className="flex gap-2">
                <input
                  autoFocus
                  type="text"
                  value={nombreBusqueda}
                  onChange={e => setNombreBusqueda(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleGuardarBusqueda()}
                  placeholder="Ej: Construcción Araucanía 30 días"
                  className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-brand-200 bg-white outline-none focus:border-brand-400"
                />
                <button onClick={handleGuardarBusqueda}
                  className="text-sm px-3 py-1.5 rounded-lg bg-brand-500 text-white font-medium hover:bg-brand-600 transition-colors">
                  Guardar
                </button>
                <button onClick={() => setShowSaveModal(false)}
                  className="text-gray-400 hover:text-gray-600 px-1">
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Botones secundarios */}
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => { setShowBusquedas(v => !v); setShowSaveModal(false) }}
              className={clsx(
                'flex-1 flex items-center justify-center gap-2 text-sm font-semibold py-2.5 rounded-xl border-2 transition-all',
                showBusquedas
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : busquedasGuardadas.length > 0
                    ? 'border-brand-300 bg-white text-brand-600 hover:bg-brand-50'
                    : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
              )}
            >
              <BookOpen size={14} />
              {busquedasGuardadas.length > 0
                ? <span>Mis búsquedas <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-brand-500 text-white text-[10px] font-bold">{busquedasGuardadas.length}</span></span>
                : 'Mis búsquedas'}
            </button>
            {resultados.length > 0 && (
              <button
                onClick={() => { setShowSaveModal(v => !v); setShowBusquedas(false) }}
                className={clsx(
                  'flex-1 flex items-center justify-center gap-2 text-sm font-semibold py-2.5 rounded-xl border-2 transition-all',
                  showSaveModal
                    ? 'border-accent-500 bg-accent-50 text-accent-700'
                    : 'border-accent-300 bg-white text-accent-600 hover:bg-accent-50'
                )}
              >
                <Bookmark size={14} /> Guardar búsqueda
              </button>
            )}
          </div>

          <button
            className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-semibold text-sm text-white transition-all"
            style={{ background: buscarMutation.isPending ? '#9CA3AF' : 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)', boxShadow: buscarMutation.isPending ? 'none' : '0 4px 14px rgba(109,40,217,0.35)' }}
            onClick={() => buscarMutation.mutate(1)}
            disabled={buscarMutation.isPending}
          >
            {buscarMutation.isPending
              ? <><Loader2 size={16} className="animate-spin" /> Buscando…</>
              : <><Search size={16} /> Buscar licitaciones</>}
          </button>
        </div>
      </div>

      {/* Loading */}
      {buscarMutation.isPending && resultados.length === 0 && (
        <div className="card p-10 text-center text-gray-400">
          <Loader2 size={28} className="mx-auto mb-2 animate-spin opacity-40" />
          <p className="text-sm">
            {pestana === 'por_adjudicarse' ? 'Cargando licitaciones próximas a cerrar…'
            : pestana === 'adjudicadas' ? 'Consultando Mercado Público…'
            : `Cargando licitaciones ${pestana}s…`}
          </p>
        </div>
      )}

      {/* ── Tabla: Adjudicadas ── */}
      {pestana === 'adjudicadas' && resultados.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50 flex-wrap gap-2">
            <span className="text-sm font-semibold text-gray-700">
              {totalResultados.toLocaleString('es-CL')} licitaciones
              {totalResultados > 50 && (
                <span className="ml-1 text-gray-400 font-normal">· pág. {paginaActual} de {Math.ceil(totalResultados / 50)}</span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => buscarMutation.mutate(paginaActual)} disabled={buscarMutation.isPending} className="text-xs text-gray-500 flex items-center gap-1 hover:text-gray-700 disabled:opacity-40">
                <RefreshCw size={11} className={buscarMutation.isPending ? 'animate-spin' : ''} /> Actualizar
              </button>
              {isAdmin && pestana === 'adjudicadas' && (
                <button onClick={exportCSV} className="text-xs text-emerald-600 flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-200 hover:bg-emerald-50 transition-colors font-medium">
                  <Download size={11} /> Exportar CSV
                </button>
              )}
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
                  <th className="px-4 py-3 font-medium">
                    <button
                      onClick={toggleSortMonto}
                      className="flex items-center gap-1.5 hover:text-gray-900 transition-colors group"
                    >
                      Monto adj.
                      <span className="flex flex-col gap-[1px] opacity-40 group-hover:opacity-100 transition-opacity">
                        <span className={clsx('block w-0 h-0 border-l-[4px] border-r-[4px] border-b-[5px] border-l-transparent border-r-transparent transition-colors',
                          sortMonto === 'asc' ? 'border-b-brand-600' : 'border-b-gray-400'
                        )} />
                        <span className={clsx('block w-0 h-0 border-l-[4px] border-r-[4px] border-t-[5px] border-l-transparent border-r-transparent transition-colors',
                          sortMonto === 'desc' ? 'border-t-brand-600' : 'border-t-gray-400'
                        )} />
                      </span>
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium text-blue-600">Póliza 1%</th>
                  <th className="px-4 py-3 font-medium text-green-600">Póliza 5%</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Organismo</th>
                  <th className="px-4 py-3 font-medium hidden lg:table-cell">Región</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sortedResultados.map((item) => (
                  <>
                    <tr
                      key={item.codigo}
                      className={clsx('group hover:bg-amber-50/60 cursor-pointer transition-all duration-150', expandedId === item.codigo && 'bg-amber-50/40')}
                      onClick={() => {
                        const nuevoId = expandedId === item.codigo ? null : item.codigo
                        setExpandedId(nuevoId)
                        if (nuevoId && item.nombre_adjudicado) buscarContacto(item.codigo, item.nombre_adjudicado)
                      }}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 line-clamp-1 group-hover:text-amber-800 transition-colors">{item.nombre_adjudicado || '—'}</div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <a
                            href={`https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=${item.codigo}`}
                            target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            title="Ver esta licitación en el portal de Mercado Público"
                            className="text-xs text-gray-400 line-clamp-1 hover:text-amber-600 hover:underline transition-colors"
                          >{item.nombre}</a>
                          <ExternalLink size={9} className="shrink-0 text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        {item.rut_adjudicado && <div className="text-xs text-gray-400">RUT {item.rut_adjudicado}</div>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">{formatCLP(item.monto_adjudicado)}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-blue-600">{formatCLP(item.poliza_seriedad)}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-green-600">{formatCLP(item.poliza_cumplimiento)}</td>
                      <td className="px-4 py-3 text-gray-600 hidden md:table-cell text-xs line-clamp-1">{item.organismo}</td>
                      <td className="px-4 py-3 text-gray-600 hidden lg:table-cell text-xs">{item.region || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        {expandedId === item.codigo
                          ? <ChevronUp size={15} className="text-gray-400 ml-auto" />
                          : <ChevronDown size={15} className="text-gray-400 ml-auto" />}
                      </td>
                    </tr>
                    {expandedId === item.codigo && (() => {
                      const ctData = contactoCache[item.codigo]
                      const ctLoading = ctData === 'loading'
                      const ct = (ctData && ctData !== 'loading') ? ctData as ContactoData : null
                      return (
                        <tr key={`${item.codigo}-exp`}>
                          <td colSpan={7} className="p-0 border-b border-gray-100">
                            <div className="bg-white border-t-2 border-brand-100 px-6 py-5">
                              <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">

                                {/* ── Col 1: Licitación ── */}
                                <div className="pb-5 lg:pb-0 lg:pr-6 space-y-3">
                                  <div className="flex items-center gap-2 mb-3 pb-2 border-b-2 border-amber-200">
                                    <span className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center text-sm">📄</span>
                                    <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">Licitación</span>
                                  </div>

                                  <div>
                                    <p className="text-[10px] text-gray-400 uppercase font-medium mb-0.5">Código</p>
                                    <p className="text-sm font-mono font-semibold text-gray-700">{item.codigo}</p>
                                  </div>

                                  <div>
                                    <p className="text-[10px] text-gray-400 uppercase font-medium mb-0.5">Nombre</p>
                                    <p className="text-sm text-gray-800 leading-snug">{item.nombre}</p>
                                  </div>

                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <p className="text-[10px] text-gray-400 uppercase font-medium mb-0.5">Organismo</p>
                                      <p className="text-xs text-gray-700 font-medium leading-snug">{item.organismo}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-gray-400 uppercase font-medium mb-0.5">Región</p>
                                      <p className="text-xs text-gray-700 font-medium">{item.region || '—'}</p>
                                    </div>
                                  </div>

                                  {item.fecha_adjudicacion && (
                                    <div>
                                      <p className="text-[10px] text-gray-400 uppercase font-medium mb-0.5">Adjudicada el</p>
                                      <p className="text-xs text-gray-700">{item.fecha_adjudicacion}</p>
                                    </div>
                                  )}

                                  <a
                                    href={`https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=${item.codigo}`}
                                    target="_blank" rel="noopener noreferrer"
                                    onClick={e => e.stopPropagation()}
                                    className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand-600 transition-colors mt-1"
                                  >
                                    <ExternalLink size={11} /> Ver en Mercado Público
                                  </a>
                                </div>

                                {/* ── Col 2: Empresa ── */}
                                <div className="py-5 lg:py-0 lg:px-6 space-y-3">
                                  <div className="flex items-center gap-2 mb-3 pb-2 border-b-2 border-violet-200">
                                    <span className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center text-sm">🏢</span>
                                    <span className="text-xs font-bold text-violet-700 uppercase tracking-wider">Empresa adjudicada</span>
                                  </div>

                                  <div>
                                    <p className="font-bold text-gray-900 text-sm">{item.nombre_adjudicado}</p>
                                    {item.rut_adjudicado && (
                                      <p className="text-xs text-gray-400 mt-0.5">RUT {item.rut_adjudicado}</p>
                                    )}
                                  </div>

                                  {ctLoading && (
                                    <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                                      <Loader2 size={11} className="animate-spin" /> Buscando información…
                                    </div>
                                  )}

                                  {ct && ct.ok && (
                                    <div className="space-y-2 pt-1 border-t border-gray-100">
                                      {ct.telefono && (
                                        <a href={`tel:${ct.telefono}`} onClick={e => e.stopPropagation()}
                                          className="flex items-center gap-2 text-xs text-gray-800 hover:text-brand-700 font-medium transition-colors">
                                          <Phone size={12} className="text-gray-400 shrink-0" /> {ct.telefono}
                                        </a>
                                      )}
                                      {ct.direccion && (
                                        <p className="flex items-start gap-2 text-xs text-gray-500">
                                          <span className="shrink-0 mt-0.5 text-gray-400">📍</span> {ct.direccion}
                                        </p>
                                      )}
                                      {ct.website && (
                                        <a href={ct.website.startsWith('http') ? ct.website : `https://${ct.website}`} target="_blank" rel="noopener noreferrer"
                                          onClick={e => e.stopPropagation()}
                                          className="flex items-center gap-2 text-xs text-brand-600 hover:text-brand-700 transition-colors">
                                          <Globe size={12} className="shrink-0" /> {ct.website}
                                        </a>
                                      )}
                                      {ct.maps_url && (
                                        <a href={ct.maps_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                          className="flex items-center gap-2 text-xs text-emerald-600 hover:text-emerald-700 font-medium transition-colors">
                                          <ExternalLink size={12} /> Ver ubicación en mapa
                                        </a>
                                      )}
                                    </div>
                                  )}

                                  {ct && !ct.ok && (
                                    <p className="text-xs text-gray-400 italic">Sin datos de contacto disponibles</p>
                                  )}

                                  {/* Acción principal */}
                                  <div className="pt-2 flex items-center gap-2 flex-wrap">
                                    {item.prospect_id ? (
                                      <>
                                        <span className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold">
                                          <CheckCircle2 size={12} /> Ya guardado
                                        </span>
                                        <button
                                          onClick={e => { e.stopPropagation(); navigate('/pipeline') }}
                                          className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-brand-50 border border-brand-200 text-brand-700 font-semibold hover:bg-brand-100 transition-colors"
                                        >
                                          <Kanban size={12} /> Ver en pipeline
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        onClick={e => { e.stopPropagation(); guardarMutation.mutate(item.codigo) }}
                                        disabled={savingCodigo === item.codigo}
                                        className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl font-semibold text-white disabled:opacity-50 transition-all active:scale-95"
                                        style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)', boxShadow: '0 3px 10px rgba(109,40,217,0.25)' }}
                                      >
                                        {savingCodigo === item.codigo ? <Loader2 size={13} className="animate-spin" /> : <BookmarkPlus size={13} />}
                                        Guardar en pipeline
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* ── Col 3: Contactos — solo si hay personas de contacto reales ── */}
                                {ct && ct.ok && ct.contactos.length > 0 && (
                                <div className="pt-5 lg:pt-0 lg:pl-6 space-y-3">
                                  <div className="flex items-center gap-2 mb-3 pb-2 border-b-2 border-emerald-200">
                                    <span className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center text-sm">👤</span>
                                    <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Contactos</span>
                                  </div>

                                  {ctLoading && null}

                                  {ct && ct.ok && ct.contactos.length > 0 && (
                                    <div className="space-y-2">
                                      {ct.contactos.map((c, i) => (
                                        <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-3.5 space-y-2">
                                          <div className="flex items-start gap-2.5">
                                            <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                                              <UserIcon size={13} className="text-brand-600" />
                                            </div>
                                            <div>
                                              <p className="text-sm font-semibold text-gray-900">{c.nombre || '—'}</p>
                                              {c.cargo && <p className="text-xs text-gray-500">{c.cargo}</p>}
                                            </div>
                                          </div>
                                          <div className="space-y-1 pl-9">
                                            {c.email && (
                                              <a href={`mailto:${c.email}`} onClick={e => e.stopPropagation()}
                                                className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium">
                                                <Mail size={10} /> {c.email}
                                              </a>
                                            )}
                                            {c.telefono && (
                                              <a href={`tel:${c.telefono}`} onClick={e => e.stopPropagation()}
                                                className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900">
                                                <Phone size={10} /> {c.telefono}
                                              </a>
                                            )}
                                            {c.linkedin && (
                                              <a href={c.linkedin} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700">
                                                <Linkedin size={10} /> LinkedIn
                                              </a>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {ct && ct.ok && ct.contactos.length === 0 && (
                                    <p className="text-xs text-gray-400 italic py-1">
                                      Sin contactos encontrados para esta empresa
                                    </p>
                                  )}

                                  {ct && !ct.ok && (
                                    <div className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">
                                      {ct.error || 'Error al buscar contactos'}
                                    </div>
                                  )}

                                  {!ctLoading && !ct && (
                                    <p className="text-xs text-gray-400 italic">Cargando…</p>
                                  )}
                                </div>
                                )}

                              </div>
                            </div>
                          </td>
                        </tr>
                      )
                    })()}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Paginación — Adjudicadas */}
      {pestana === 'adjudicadas' && resultados.length > 0 && totalResultados > 50 && (
        <div className="flex items-center justify-between px-1">
          <button disabled={paginaActual <= 1 || buscarMutation.isPending} onClick={() => buscarMutation.mutate(paginaActual - 1)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">← Anterior</button>
          <span className="text-sm text-gray-500">Página {paginaActual} de {Math.ceil(totalResultados / 50)}</span>
          <button disabled={paginaActual >= Math.ceil(totalResultados / 50) || buscarMutation.isPending} onClick={() => buscarMutation.mutate(paginaActual + 1)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Siguiente →</button>
        </div>
      )}

      {/* ── Tabla: Por adjudicarse (desde caché) ── */}
      {pestana === 'por_adjudicarse' && resultados.length > 0 && (() => {
        const items = resultados as unknown as PorAdjudicarsItem[]
        const hoy = new Date()
        hoy.setHours(0, 0, 0, 0)
        const diasRestantes = (fechaStr: string) => {
          const d = new Date(fechaStr)
          d.setHours(0, 0, 0, 0)
          return Math.ceil((d.getTime() - hoy.getTime()) / 86400000)
        }
        const badgeColor = (dias: number) =>
          dias <= 3 ? 'bg-red-100 text-red-700 border-red-200'
          : dias <= 7 ? 'bg-amber-100 text-amber-700 border-amber-200'
          : 'bg-emerald-100 text-emerald-700 border-emerald-200'

        return (
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50 flex-wrap gap-2">
              <span className="text-sm font-semibold text-gray-700">
                {totalResultados.toLocaleString('es-CL')} licitaciones por cerrar
                {totalResultados > 50 && (
                  <span className="ml-1 text-gray-400 font-normal">· pág. {paginaActual} de {Math.ceil(totalResultados / 50)}</span>
                )}
              </span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> ≤3 días
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block ml-1" /> ≤7 días
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block ml-1" /> &gt;7 días
                </div>
                <button onClick={() => buscarMutation.mutate(paginaActual)} disabled={buscarMutation.isPending}
                  className="text-xs text-gray-500 flex items-center gap-1 hover:text-gray-700 disabled:opacity-40">
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
                    <th className="px-4 py-3 font-medium">Licitación</th>
                    <th className="px-4 py-3 font-medium">Cierra en</th>
                    <th className="px-4 py-3 font-medium">Monto estimado</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">Organismo</th>
                    <th className="px-4 py-3 font-medium hidden lg:table-cell">Región</th>
                    <th className="px-4 py-3 font-medium">Oferentes</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map(item => {
                    const dias = diasRestantes(item.fecha_cierre)
                    const isExp = expandedId === item.codigo
                    return (
                      <>
                        <tr key={item.codigo}
                          className={clsx('group hover:bg-blue-50/60 cursor-pointer transition-all duration-150', isExp && 'bg-blue-50/40')}
                          onClick={() => setExpandedId(isExp ? null : item.codigo)}
                        >
                          <td className="px-4 py-3 max-w-xs">
                            <div className="flex items-start gap-1.5">
                              <a
                                href={`https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=${item.codigo}`}
                                target="_blank" rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                title="Ver esta licitación en el portal de Mercado Público"
                                className="font-medium text-gray-900 line-clamp-2 leading-snug hover:text-blue-600 hover:underline transition-colors"
                              >{item.nombre}</a>
                              <ExternalLink size={10} className="shrink-0 mt-0.5 text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <div className="text-xs text-gray-400 font-mono mt-0.5">{item.codigo}</div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={clsx('inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border', badgeColor(dias))}>
                              <Calendar size={10} />
                              {dias <= 0 ? 'Hoy' : `${dias}d`}
                            </span>
                            <div className="text-[10px] text-gray-400 mt-1">{item.fecha_cierre}</div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
                            {item.monto_estimado ? formatCLP(item.monto_estimado) : <span className="text-gray-400 text-xs">No indicado</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-600 hidden md:table-cell text-xs line-clamp-1 max-w-[180px]">{item.organismo}</td>
                          <td className="px-4 py-3 text-gray-600 hidden lg:table-cell text-xs">{item.region || '—'}</td>
                          <td className="px-4 py-3">
                            {item.ofertantes_count > 0
                              ? <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700">
                                  <UserIcon size={10} /> {item.ofertantes_count}
                                </span>
                              : <span className="text-gray-300 text-xs">—</span>
                            }
                          </td>
                          <td className="px-4 py-3 text-right">
                            {isExp ? <ChevronUp size={15} className="text-gray-400 ml-auto" /> : <ChevronDown size={15} className="text-gray-400 ml-auto" />}
                          </td>
                        </tr>
                        {isExp && (
                          <tr key={`${item.codigo}-exp`}>
                            <td colSpan={7} className="p-0 border-b border-gray-100">
                              <div className="bg-white border-t-2 border-blue-100 px-6 py-5">
                                <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-100 gap-6">

                                  {/* Col 1: Detalles licitación */}
                                  <div className="space-y-3 lg:pr-6">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-base">📋</span>
                                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Licitación</span>
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-gray-400 uppercase font-medium mb-0.5">Nombre completo</p>
                                      <p className="text-sm text-gray-800 leading-snug">{item.nombre}</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <p className="text-[10px] text-gray-400 uppercase font-medium mb-0.5">Organismo</p>
                                        <p className="text-xs text-gray-700 font-medium leading-snug">{item.organismo}</p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] text-gray-400 uppercase font-medium mb-0.5">Región</p>
                                        <p className="text-xs text-gray-700 font-medium">{item.region || '—'}</p>
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <p className="text-[10px] text-gray-400 uppercase font-medium mb-0.5">Fecha cierre</p>
                                        <p className={clsx('text-sm font-semibold', diasRestantes(item.fecha_cierre) <= 3 ? 'text-red-600' : diasRestantes(item.fecha_cierre) <= 7 ? 'text-amber-600' : 'text-gray-700')}>
                                          {item.fecha_cierre}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] text-gray-400 uppercase font-medium mb-0.5">Monto estimado</p>
                                        <p className="text-sm font-semibold text-gray-900">
                                          {item.monto_estimado ? formatCLP(item.monto_estimado) : '—'}
                                        </p>
                                      </div>
                                    </div>
                                    <a
                                      href={`https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=${item.codigo}`}
                                      target="_blank" rel="noopener noreferrer"
                                      onClick={e => e.stopPropagation()}
                                      className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 transition-colors mt-1"
                                    >
                                      <ExternalLink size={11} /> Ver en Mercado Público
                                    </a>
                                  </div>

                                  {/* Col 2: Oferentes */}
                                  <div className="space-y-3">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-base">🏢</span>
                                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        Empresas oferentes {item.ofertantes_count > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">{item.ofertantes_count}</span>}
                                      </span>
                                    </div>
                                    {item.ofertantes.length === 0 ? (
                                      <p className="text-xs text-gray-400 italic">Sin oferentes registrados aún</p>
                                    ) : (
                                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                        {item.ofertantes.map((of, i) => (
                                          <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 px-3.5 py-2.5 flex items-center justify-between gap-3">
                                            <div>
                                              <p className="text-xs font-semibold text-gray-900 line-clamp-1">{of.nombre || '—'}</p>
                                              {of.rut && <p className="text-[10px] text-gray-400 mt-0.5">RUT {of.rut}</p>}
                                            </div>
                                            {of.monto_oferta != null && of.monto_oferta > 0 && (
                                              <span className="text-xs font-bold text-emerald-700 whitespace-nowrap shrink-0">
                                                {formatCLP(of.monto_oferta)}
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

      {/* Paginación — Por adjudicarse */}
      {pestana === 'por_adjudicarse' && resultados.length > 0 && totalResultados > 50 && (
        <div className="flex items-center justify-between px-1">
          <button disabled={paginaActual <= 1 || buscarMutation.isPending} onClick={() => buscarMutation.mutate(paginaActual - 1)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">← Anterior</button>
          <span className="text-sm text-gray-500">Página {paginaActual} de {Math.ceil(totalResultados / 50)}</span>
          <button disabled={paginaActual >= Math.ceil(totalResultados / 50) || buscarMutation.isPending} onClick={() => buscarMutation.mutate(paginaActual + 1)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Siguiente →</button>
        </div>
      )}

      {/* ── Tabla: Estados históricos (cerrada / desierta / revocada / suspendida) ── */}
      {(['cerrada', 'desierta', 'revocada', 'suspendida'] as Pestana[]).includes(pestana) && resultados.length > 0 && (() => {
        const items = resultados as unknown as PorAdjudicarsItem[]
        const ESTADO_LABEL: Record<string, string> = {
          cerrada:    'cerradas',
          desierta:   'desiertas',
          revocada:   'revocadas',
          suspendida: 'suspendidas',
        }
        return (
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50 flex-wrap gap-2">
              <span className="text-sm font-semibold text-gray-700">
                {totalResultados.toLocaleString('es-CL')} licitaciones {ESTADO_LABEL[pestana] ?? pestana}
                {totalResultados > 50 && (
                  <span className="ml-1 text-gray-400 font-normal">· pág. {paginaActual} de {Math.ceil(totalResultados / 50)}</span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => buscarMutation.mutate(paginaActual)} disabled={buscarMutation.isPending}
                  className="text-xs text-gray-500 flex items-center gap-1 hover:text-gray-700 disabled:opacity-40">
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
                    <th className="px-4 py-3 font-medium">Licitación</th>
                    <th className="px-4 py-3 font-medium">Fecha cierre</th>
                    <th className="px-4 py-3 font-medium">Monto estimado</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">Organismo</th>
                    <th className="px-4 py-3 font-medium hidden lg:table-cell">Región</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map(item => {
                    const isExp = expandedId === item.codigo
                    return (
                      <>
                        <tr key={item.codigo}
                          className={clsx('group hover:bg-violet-50/60 cursor-pointer transition-all duration-150', isExp && 'bg-violet-50/40')}
                          onClick={() => {
                            const nuevoId = expandedId === item.codigo ? null : item.codigo
                            setExpandedId(nuevoId)
                            if (nuevoId && item.organismo) buscarContacto(item.codigo, item.organismo)
                          }}
                        >
                          <td className="px-4 py-3 max-w-xs">
                            <div className="flex items-start gap-1.5">
                              <a
                                href={`https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=${item.codigo}`}
                                target="_blank" rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                title="Ver esta licitación en el portal de Mercado Público"
                                className="font-medium text-gray-900 line-clamp-2 leading-snug hover:text-violet-600 hover:underline transition-colors"
                              >{item.nombre}</a>
                              <ExternalLink size={10} className="shrink-0 mt-0.5 text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <div className="text-xs text-gray-400 font-mono mt-0.5">{item.codigo}</div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-xs font-medium text-gray-700">{item.fecha_cierre || '—'}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
                            {item.monto_estimado ? formatCLP(item.monto_estimado) : <span className="text-gray-400 text-xs">No indicado</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-600 hidden md:table-cell text-xs line-clamp-1 max-w-[180px]">{item.organismo}</td>
                          <td className="px-4 py-3 text-gray-600 hidden lg:table-cell text-xs">{item.region || '—'}</td>
                          <td className="px-4 py-3 text-right">
                            {isExp ? <ChevronUp size={15} className="text-gray-400 ml-auto" /> : <ChevronDown size={15} className="text-gray-400 ml-auto" />}
                          </td>
                        </tr>
                        {isExp && (() => {
                          const ctData = contactoCache[item.codigo]
                          const ctLoading = ctData === 'loading'
                          const ct = (ctData && ctData !== 'loading') ? ctData as ContactoData : null
                          return (
                          <tr key={`${item.codigo}-exp`}>
                            <td colSpan={6} className="p-0 border-b border-gray-100">
                              <div className="bg-white border-t-2 border-violet-100 px-6 py-5">
                                <div className="grid grid-cols-1 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">

                                  {/* Col 1: Detalles */}
                                  <div className="space-y-3 lg:pr-6 pb-5 lg:pb-0">
                                    <div className="flex items-center gap-2 mb-1 pb-2 border-b-2 border-violet-200">
                                      <span className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center text-sm">📋</span>
                                      <span className="text-xs font-bold text-violet-700 uppercase tracking-wider">Licitación</span>
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-gray-400 uppercase font-medium mb-0.5">Código</p>
                                      <p className="text-sm font-mono font-semibold text-gray-700">{item.codigo}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-gray-400 uppercase font-medium mb-0.5">Nombre</p>
                                      <p className="text-sm text-gray-800 leading-snug font-medium">{item.nombre}</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <p className="text-[10px] text-gray-400 uppercase font-medium mb-0.5">Organismo</p>
                                        <p className="text-xs text-gray-700 font-medium leading-snug">{item.organismo || '—'}</p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] text-gray-400 uppercase font-medium mb-0.5">Región</p>
                                        <p className="text-xs text-gray-700 font-medium">{item.region || '—'}</p>
                                      </div>
                                    </div>
                                    <a
                                      href={`https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=${item.codigo}`}
                                      target="_blank" rel="noopener noreferrer"
                                      onClick={e => e.stopPropagation()}
                                      className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand-600 transition-colors mt-1"
                                    >
                                      <ExternalLink size={11} /> Ver en Mercado Público
                                    </a>
                                  </div>

                                  {/* Col 2: Plazos y montos */}
                                  <div className="space-y-3 lg:px-6 py-5 lg:py-0">
                                    <div className="flex items-center gap-2 mb-1 pb-2 border-b-2 border-gray-200">
                                      <span className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center text-sm">📊</span>
                                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Datos</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <p className="text-[10px] text-gray-400 uppercase font-medium mb-0.5">Fecha cierre</p>
                                        <p className="text-sm font-semibold text-gray-900">{item.fecha_cierre || '—'}</p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] text-gray-400 uppercase font-medium mb-0.5">Monto estimado</p>
                                        <p className="text-sm font-bold text-gray-900">
                                          {item.monto_estimado ? formatCLP(item.monto_estimado) : <span className="text-gray-400 font-normal">No indicado</span>}
                                        </p>
                                      </div>
                                    </div>
                                    {item.fecha_estimada_adjudicacion && (
                                      <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                                        <p className="text-[10px] text-amber-500 uppercase font-medium mb-0.5">📅 Fecha estimada de adjudicación</p>
                                        <p className="text-sm font-bold text-amber-700">{item.fecha_estimada_adjudicacion}</p>
                                      </div>
                                    )}
                                    {!!(item.monto_estimado && item.monto_estimado > 0) && (
                                      <div className="grid grid-cols-2 gap-3 bg-blue-50 rounded-xl p-3 border border-blue-100">
                                        <div>
                                          <p className="text-[10px] text-blue-400 uppercase font-medium mb-0.5">Póliza 1%</p>
                                          <p className="text-sm font-bold text-blue-700">{formatCLP((item.monto_estimado ?? 0) * 0.01)}</p>
                                        </div>
                                        <div>
                                          <p className="text-[10px] text-green-500 uppercase font-medium mb-0.5">Póliza 5%</p>
                                          <p className="text-sm font-bold text-green-700">{formatCLP((item.monto_estimado ?? 0) * 0.05)}</p>
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Col 3: Empresas oferentes */}
                                  <div className="space-y-3 lg:px-6 py-5 lg:py-0">
                                    <div className="flex items-center gap-2 mb-1 pb-2 border-b-2 border-blue-200">
                                      <span className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center text-sm">🏢</span>
                                      <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">
                                        Empresas oferentes {item.ofertantes_count > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">{item.ofertantes_count}</span>}
                                      </span>
                                    </div>
                                    {item.ofertantes.length === 0 ? (
                                      <div className="flex flex-col gap-1.5 bg-amber-50 border border-amber-100 rounded-xl px-3.5 py-3">
                                        <p className="text-xs font-semibold text-amber-700">🔒 En evaluación</p>
                                        <p className="text-[11px] text-amber-600 leading-snug">El organismo aún no ha abierto el cuadro de ofertas. Los datos estarán disponibles una vez que se adjudique o declare desierta.</p>
                                      </div>
                                    ) : (
                                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                        {item.ofertantes.map((of, i) => (
                                          <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 px-3.5 py-2.5 flex items-center justify-between gap-3">
                                            <div>
                                              <p className="text-xs font-semibold text-gray-900 line-clamp-1">{of.nombre || '—'}</p>
                                              {of.rut && <p className="text-[10px] text-gray-400 mt-0.5">RUT {of.rut}</p>}
                                            </div>
                                            {of.monto_oferta != null && of.monto_oferta > 0 && (
                                              <span className="text-xs font-bold text-emerald-700 whitespace-nowrap shrink-0">
                                                {formatCLP(of.monto_oferta)}
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  {/* Col 4: Contacto del organismo */}
                                  <div className="space-y-3 lg:pl-6 pt-5 lg:pt-0">
                                    <div className="flex items-center gap-2 mb-1 pb-2 border-b-2 border-emerald-200">
                                      <span className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center text-sm">🏛️</span>
                                      <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Contacto organismo</span>
                                    </div>

                                    {ctLoading && (
                                      <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                                        <Loader2 size={11} className="animate-spin" /> Buscando información…
                                      </div>
                                    )}

                                    {ct && ct.ok && (
                                      <div className="space-y-2">
                                        {ct.telefono && (
                                          <a href={`tel:${ct.telefono}`} onClick={e => e.stopPropagation()}
                                            className="flex items-center gap-2 text-xs text-gray-800 hover:text-brand-700 font-medium transition-colors">
                                            <Phone size={12} className="text-gray-400 shrink-0" /> {ct.telefono}
                                          </a>
                                        )}
                                        {ct.website && (
                                          <a href={ct.website.startsWith('http') ? ct.website : `https://${ct.website}`} target="_blank" rel="noopener noreferrer"
                                            onClick={e => e.stopPropagation()}
                                            className="flex items-center gap-2 text-xs text-brand-600 hover:text-brand-700 transition-colors">
                                            <Globe size={12} className="shrink-0" /> {ct.website}
                                          </a>
                                        )}
                                        {ct.direccion && (
                                          <p className="flex items-start gap-2 text-xs text-gray-500">
                                            <span className="shrink-0 mt-0.5 text-gray-400">📍</span> {ct.direccion}
                                          </p>
                                        )}
                                        {ct.contactos && ct.contactos.length > 0 && (
                                          <div className="space-y-2 pt-1 border-t border-gray-100">
                                            {ct.contactos.map((c, i) => (
                                              <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-1.5">
                                                <p className="text-xs font-semibold text-gray-900">{c.nombre || '—'}</p>
                                                {c.cargo && <p className="text-[11px] text-gray-500">{c.cargo}</p>}
                                                {c.email && (
                                                  <a href={`mailto:${c.email}`} onClick={e => e.stopPropagation()}
                                                    className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700">
                                                    <Mail size={10} /> {c.email}
                                                  </a>
                                                )}
                                                {c.telefono && (
                                                  <a href={`tel:${c.telefono}`} onClick={e => e.stopPropagation()}
                                                    className="flex items-center gap-1.5 text-xs text-gray-600">
                                                    <Phone size={10} /> {c.telefono}
                                                  </a>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {ct && !ct.ok && (
                                      <p className="text-xs text-gray-400 italic">Sin datos de contacto disponibles</p>
                                    )}

                                    {!ctLoading && !ct && item.organismo && (
                                      <button
                                        onClick={e => { e.stopPropagation(); buscarContacto(item.codigo, item.organismo) }}
                                        className="text-xs text-brand-600 hover:underline"
                                      >
                                        Buscar contacto
                                      </button>
                                    )}
                                    <div className="pt-3 border-t border-gray-100 mt-2">
                                      <button
                                        onClick={e => { e.stopPropagation(); guardarMutation.mutate(item.codigo) }}
                                        disabled={savingCodigo === item.codigo}
                                        className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl font-semibold text-white disabled:opacity-50 transition-all active:scale-95 w-full justify-center"
                                        style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)', boxShadow: '0 3px 10px rgba(109,40,217,0.25)' }}
                                      >
                                        {savingCodigo === item.codigo ? <Loader2 size={13} className="animate-spin" /> : <BookmarkPlus size={13} />}
                                        Guardar en pipeline
                                      </button>
                                    </div>
                                  </div>

                                </div>
                              </div>
                            </td>
                          </tr>
                          )
                        })()}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

      {/* Paginación — Estados históricos */}
      {(['cerrada', 'desierta', 'revocada', 'suspendida'] as Pestana[]).includes(pestana) && resultados.length > 0 && totalResultados > 50 && (
        <div className="flex items-center justify-between px-1">
          <button disabled={paginaActual <= 1 || buscarMutation.isPending} onClick={() => buscarMutation.mutate(paginaActual - 1)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">← Anterior</button>
          <span className="text-sm text-gray-500">Página {paginaActual} de {Math.ceil(totalResultados / 50)}</span>
          <button disabled={paginaActual >= Math.ceil(totalResultados / 50) || buscarMutation.isPending} onClick={() => buscarMutation.mutate(paginaActual + 1)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Siguiente →</button>
        </div>
      )}

      {/* Empty state */}
      {resultados.length === 0 && !buscarMutation.isPending && (
        <div className="card p-8 text-center text-gray-400">
          {pestana === 'por_adjudicarse'
            ? <><Calendar size={32} className="mx-auto mb-3 opacity-20" /><p className="text-sm">Presiona <strong>Buscar</strong> para ver licitaciones próximas a cerrar.<br/><span className="text-xs text-gray-400">Los datos se sincronizan automáticamente cada noche.</span></p></>
            : pestana === 'adjudicadas'
              ? <><Trophy size={32} className="mx-auto mb-3 opacity-20" /><p className="text-sm">Configura los filtros y busca para ver empresas adjudicadas.</p></>
              : <><Search size={32} className="mx-auto mb-3 opacity-20" /><p className="text-sm">Configura los filtros y presiona <strong>Buscar</strong> para ver resultados.</p></>
          }
        </div>
      )}

      {/* Modal configuración */}
      {mostrarConfig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <Sparkles size={18} className="text-amber-500" /> Configurar módulo Mercado Público
              </h2>
              <button onClick={() => setMostrarConfig(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">¿Qué ofreces a tus clientes?</label>
                <p className="text-xs text-gray-400 mb-2">Sonnet usará esto cada vez que generes una propuesta.</p>
                <textarea
                  rows={5}
                  placeholder="Ej: Ofrezco seguros de garantía para licitaciones (seriedad 1% y cumplimiento 5%)..."
                  value={contextoEditando}
                  onChange={e => setContextoEditando(e.target.value)}
                  className="input text-sm w-full resize-none"
                />
              </div>
              <button
                onClick={() => configMutation.mutate(contextoEditando)}
                disabled={configMutation.isPending || !contextoEditando.trim()}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {configMutation.isPending
                  ? <><Loader2 size={15} className="animate-spin" /> Guardando…</>
                  : 'Guardar configuración'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal dame una propuesta */}
      {modalPropuesta && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900 flex items-center gap-2">
                  <Sparkles size={18} className="text-amber-500" /> Dame una propuesta
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">{modalPropuesta.empresa} · {modalPropuesta.proyecto}</p>
              </div>
              <button onClick={() => setModalPropuesta(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {!contextoGuardado && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700 flex items-center gap-2">
                  <AlertCircle size={14} />
                  Primero configura qué ofreces en{' '}
                  <button
                    onClick={() => { setModalPropuesta(null); setMostrarConfig(true) }}
                    className="underline font-medium"
                  >Configurar módulo</button>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">Formato</label>
                <div className="flex gap-2">
                  {(['whatsapp', 'email', 'presupuesto'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setFormatoPropuesta(f)}
                      className={clsx(
                        'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                        formatoPropuesta === f ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      )}
                    >
                      {f === 'whatsapp' ? '💬 WhatsApp' : f === 'email' ? '✉️ Email' : '📄 Presupuesto'}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => propuestaMutation.mutate({ prospectId: modalPropuesta.prospectId, formato: formatoPropuesta })}
                disabled={propuestaMutation.isPending || !contextoGuardado}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {propuestaMutation.isPending
                  ? <><Loader2 size={15} className="animate-spin" /> Generando…</>
                  : <><Sparkles size={15} /> Generar propuesta</>}
              </button>
              {propuestaGenerada && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-amber-700">Propuesta generada</span>
                    <button
                      onClick={() => { navigator.clipboard.writeText(propuestaGenerada); toast.success('Copiado') }}
                      className="text-xs text-amber-600 hover:underline"
                    >Copiar</button>
                  </div>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{propuestaGenerada}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
