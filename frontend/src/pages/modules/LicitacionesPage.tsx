import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams, NavLink } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import api from '../../api/client'
import { useAuthStore } from '../../store/authStore'
import { useLicitacionesSearchStore } from '../../store/licitacionesSearchStore'
import toast from 'react-hot-toast'
import {
  FileText, Search, ChevronDown, ChevronUp, Loader2,
  Mail, Phone, Globe, MapPin, User, Building2,
  Sparkles, BookmarkPlus, CheckCircle2, ExternalLink,
  SlidersHorizontal, RefreshCw, Filter, Download, Trash2, X, ArrowRight,
  Wand2, FileSignature, Copy, Check,
  ClipboardList, AlertTriangle, CheckCircle, XCircle, BarChart3,
  Trophy, Flag, Clock, ListChecks, Settings,
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

const RUBRO_CATEGORIAS: { label: string; emoji: string; rubros: string[] }[] = [
  { label: 'Construcción & Obras',   emoji: '🏗️', rubros: ['construcción', 'infraestructura', 'obras civiles', 'arquitectura', 'forestal'] },
  { label: 'Tecnología',             emoji: '💻', rubros: ['tecnología', 'informática', 'software', 'telecomunicaciones'] },
  { label: 'Salud',                  emoji: '🏥', rubros: ['salud', 'farmacéutico', 'médico', 'hospitalario', 'laboratorio', 'veterinario'] },
  { label: 'Servicios Generales',    emoji: '🧹', rubros: ['aseo', 'limpieza', 'mantención', 'seguridad', 'residuos'] },
  { label: 'Logística & Transporte', emoji: '🚛', rubros: ['transporte', 'logística', 'vehículos', 'combustible'] },
  { label: 'Consultoría & Negocios', emoji: '💼', rubros: ['consultoría', 'jurídico', 'marketing', 'recursos humanos', 'seguros'] },
  { label: 'Educación',              emoji: '📚', rubros: ['educación', 'capacitación', 'deportes'] },
  { label: 'Industria & Producción', emoji: '⚙️', rubros: ['alimentos', 'agrícola', 'minería', 'energía', 'maquinaria'] },
  { label: 'Equipamiento',           emoji: '🪡', rubros: ['mobiliario', 'vestuario', 'uniformes', 'imprenta'] },
  { label: 'Turismo & Gastronomía',  emoji: '🏨', rubros: ['hotelería'] },
]

// Badge de rubro con color según categoría detectada desde el texto de la categoría MP
const CATEGORIA_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Tecnología':             { bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-200' },
  'Construcción & Obras':   { bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200' },
  'Salud':                  { bg: 'bg-red-50',     text: 'text-red-700',    border: 'border-red-200' },
  'Servicios Generales':    { bg: 'bg-gray-100',   text: 'text-gray-700',   border: 'border-gray-200' },
  'Logística & Transporte': { bg: 'bg-orange-50',  text: 'text-orange-700', border: 'border-orange-200' },
  'Consultoría & Negocios': { bg: 'bg-violet-50',  text: 'text-violet-700', border: 'border-violet-200' },
  'Educación':              { bg: 'bg-green-50',   text: 'text-green-700',  border: 'border-green-200' },
  'Industria & Producción': { bg: 'bg-yellow-50',  text: 'text-yellow-700', border: 'border-yellow-200' },
  'Equipamiento':           { bg: 'bg-pink-50',    text: 'text-pink-700',   border: 'border-pink-200' },
  'Turismo & Gastronomía':  { bg: 'bg-teal-50',    text: 'text-teal-700',   border: 'border-teal-200' },
}

function detectarCategoria(categoria: string | undefined): { label: string; emoji: string } | null {
  if (!categoria) return null
  const lower = categoria.toLowerCase()
  // Buscar qué categoría contiene algún rubro que aparezca en el string de la categoría MP
  for (const cat of RUBRO_CATEGORIAS) {
    if (cat.rubros.some(r => lower.includes(r.toLowerCase()))) {
      return { label: cat.label, emoji: cat.emoji }
    }
  }
  // Fallback: buscar por label de categoría
  for (const cat of RUBRO_CATEGORIAS) {
    const catLower = cat.label.toLowerCase().replace(' & ', ' ')
    if (catLower.split(' ').some(w => w.length > 4 && lower.includes(w))) {
      return { label: cat.label, emoji: cat.emoji }
    }
  }
  return null
}

const RubroBadge = ({ categoria, rubrosSeleccionados }: { categoria?: string; rubrosSeleccionados: string[] }) => {
  const cat = detectarCategoria(categoria)
  if (!cat) {
    return <span className="text-xs text-gray-400">—</span>
  }
  // Verificar si esta categoría hace match con algún rubro seleccionado por el usuario
  const catData = RUBRO_CATEGORIAS.find(c => c.label === cat.label)
  const isMatched = rubrosSeleccionados.length > 0 && catData
    ? catData.rubros.some(r => rubrosSeleccionados.map(x => x.toLowerCase()).includes(r.toLowerCase()))
    : false
  const colors = CATEGORIA_COLORS[cat.label] ?? { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' }
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${colors.bg} ${colors.text} ${colors.border} ${isMatched ? 'ring-1 ring-offset-0' : ''}`}
      title={categoria}>
      <span>{cat.emoji}</span>
      <span className="truncate max-w-[100px]">{cat.label}</span>
    </span>
  )
}

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
  <div className="flex items-center gap-2 text-xs">
    <Icon size={11} className="text-gray-300 shrink-0" />
    <span className="text-gray-400 w-12 shrink-0">{label}</span>
    {value ? (
      <span className="text-gray-800 flex items-center gap-1 truncate">
        {value} <SourceBadge source={source} />
      </span>
    ) : (
      <span className="text-gray-300">sin dato</span>
    )}
  </div>
)

const ScoreBadge = ({ score }: { score?: number | null }) => {
  if (score == null) return null
  const color = score >= 75 ? 'bg-emerald-100 text-emerald-700' : score >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'
  return <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full', color)}>{score.toFixed(0)}</span>
}

// ── Guía rápida ───────────────────────────────────────────────────────────────

const PASOS_GUIA = [
  {
    num: '1',
    icon: Search,
    color: 'bg-indigo-100 text-indigo-600',
    titulo: 'Busca licitaciones',
    desc: 'Filtra por rubro, región, monto o estado. Kapturo busca en Mercado Público en tiempo real.',
  },
  {
    num: '2',
    icon: BookmarkPlus,
    color: 'bg-violet-100 text-violet-600',
    titulo: 'Guarda las que te interesan',
    desc: 'Haz clic en "Guardar". Quedará registrada en "Mis Postulaciones" para seguirle la pista.',
  },
  {
    num: '3',
    icon: Sparkles,
    color: 'bg-amber-100 text-amber-700',
    titulo: 'Analiza con IA',
    desc: 'La IA descarga las bases, evalúa si calificás y genera una propuesta técnica adaptada.',
  },
  {
    num: '4',
    icon: FileSignature,
    color: 'bg-emerald-100 text-emerald-600',
    titulo: 'Genera documentos',
    desc: 'En "Propuestas Licita." genera la propuesta técnica, oferta económica o carta al organismo.',
  },
  {
    num: '5',
    icon: ListChecks,
    color: 'bg-blue-100 text-blue-600',
    titulo: 'Haz seguimiento',
    desc: 'Cambia el estado de cada postulación: En preparación → Postulada → Ganada / Perdida.',
  },
]

function GuiaRapida() {
  const [abierta, setAbierta] = useState(() => {
    return localStorage.getItem('guia_licit_cerrada') !== '1'
  })

  const toggle = () => {
    if (abierta) {
      localStorage.setItem('guia_licit_cerrada', '1')
    } else {
      localStorage.removeItem('guia_licit_cerrada')
    }
    setAbierta(v => !v)
  }

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 rounded-2xl overflow-hidden">
      {/* Header siempre visible — clickeable */}
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-indigo-50/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-indigo-500" />
          <span className="text-sm font-semibold text-indigo-800">¿Cómo usar Licitaciones?</span>
          <span className="text-[11px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-medium">Guía rápida</span>
        </div>
        <ChevronDown size={15} className={clsx('text-indigo-400 transition-transform duration-200', abierta && 'rotate-180')} />
      </button>

      {/* Contenido desplegable */}
      {abierta && (
        <div className="px-5 pb-5">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            {PASOS_GUIA.map((paso, idx) => {
              const Icon = paso.icon
              return (
                <div key={paso.num} className="relative flex sm:flex-col items-start sm:items-center gap-3 sm:gap-2 bg-white rounded-xl p-3 border border-white shadow-sm text-left sm:text-center">
                  {idx < PASOS_GUIA.length - 1 && (
                    <ArrowRight size={12} className="hidden sm:block absolute -right-2 top-1/2 -translate-y-1/2 text-indigo-300 z-10" />
                  )}
                  <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', paso.color)}>
                    <Icon size={16} />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-gray-800 leading-tight">{paso.titulo}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">{paso.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-[10px] text-indigo-400 mt-3 text-center">
            Tip: la IA tarda ~30 seg en analizar las bases. Puedes seguir navegando mientras trabaja en segundo plano.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Modal de perfil empresa ─────────────────────────────────────────────────

function PerfilEmpresaModal({ onClose, catalogo }: { onClose: () => void; catalogo?: Catalogo }) {
  const queryClient = useQueryClient()
  const perfilCached = queryClient.getQueryData<any>(['licitaciones-profile'])

  // Siempre cargamos del servidor al abrir el modal para tener datos frescos
  const { data: perfilRemoto } = useQuery({
    queryKey: ['licitaciones-profile'],
    queryFn: () => api.get('/tenant/me/licitaciones-profile').then(r => r.data).catch(() => null),
    staleTime: 0,  // siempre refrescar al montar el modal
  })

  const [form, setForm] = useState({
    rut_empresa: perfilCached?.rut_empresa || '',
    razon_social: perfilCached?.razon_social || '',
    descripcion: perfilCached?.descripcion || '',
    experiencia_anos: perfilCached?.experiencia_anos != null ? String(perfilCached.experiencia_anos) : '',
    proyectos_anteriores: perfilCached?.proyectos_anteriores || '',
    certificaciones: perfilCached?.certificaciones || '',
    inscrito_chile_proveedores: perfilCached?.inscrito_chile_proveedores || false,
    rubros: (perfilCached?.rubros as string[]) || [],
    regiones: (perfilCached?.regiones as string[]) || [],
    email_alertas: perfilCached?.email_alertas || '',
    diferenciadores: perfilCached?.diferenciadores || '',
  })

  // Sincronizar form cuando llega el perfil del servidor (si el caché estaba vacío al abrir)
  useEffect(() => {
    if (!perfilRemoto) return
    setForm({
      rut_empresa: perfilRemoto.rut_empresa || '',
      razon_social: perfilRemoto.razon_social || '',
      descripcion: perfilRemoto.descripcion || '',
      experiencia_anos: perfilRemoto.experiencia_anos != null ? String(perfilRemoto.experiencia_anos) : '',
      proyectos_anteriores: perfilRemoto.proyectos_anteriores || '',
      certificaciones: perfilRemoto.certificaciones || '',
      inscrito_chile_proveedores: perfilRemoto.inscrito_chile_proveedores || false,
      rubros: (perfilRemoto.rubros as string[]) || [],
      regiones: (perfilRemoto.regiones as string[]) || [],
      email_alertas: perfilRemoto.email_alertas || '',
      diferenciadores: perfilRemoto.diferenciadores || '',
    })
  }, [perfilRemoto])

  // ── Sugerir rubros automáticamente cuando el usuario escribe la descripción ──
  const [sugirendoRubros, setSugirendoRubros] = useState(false)
  const [rubrosSugeridos, setRubrosSugeridos] = useState<string[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onDescripcionChange = (valor: string) => {
    setForm(f => ({ ...f, descripcion: valor }))
    setRubrosSugeridos([])
    if (debounceRef.current) clearTimeout(debounceRef.current)
    // Solo sugerir si hay texto suficiente y aún no tiene rubros
    if (valor.trim().length < 10) return
    debounceRef.current = setTimeout(async () => {
      setSugirendoRubros(true)
      try {
        const res = await api.post('/modules/licitaciones/sugerir-rubros', { descripcion: valor.trim() })
        const sugeridos: string[] = res.data.rubros || []
        // Filtrar los que ya tiene seleccionados
        const nuevos = sugeridos.filter(r => !form.rubros.includes(r))
        if (nuevos.length > 0) setRubrosSugeridos(nuevos)
      } catch { /* silencioso */ }
      finally { setSugirendoRubros(false) }
    }, 1200)  // 1.2s de debounce
  }

  const aplicarRubrosSugeridos = () => {
    setForm(f => ({ ...f, rubros: [...new Set([...f.rubros, ...rubrosSugeridos])] }))
    setRubrosSugeridos([])
  }


  const guardarMutation = useMutation({
    mutationFn: () => api.put('/tenant/me/licitaciones-profile', {
      ...form,
      experiencia_anos: form.experiencia_anos ? parseInt(form.experiencia_anos) : null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['licitaciones-profile'] })
      const tieneEmail = !!form.email_alertas.trim()
      toast.success(
        tieneEmail
          ? '✅ Perfil guardado — recibirás alertas en ' + form.email_alertas
          : '✅ Perfil guardado — ya puedes buscar licitaciones',
        { duration: 4000 }
      )
      onClose()
    },
    onError: () => toast.error('Error al guardar perfil'),
  })

  const toggleRubro = (r: string) =>
    setForm(f => ({ ...f, rubros: f.rubros.includes(r) ? f.rubros.filter(x => x !== r) : [...f.rubros, r] }))
  const toggleRegion = (c: string) =>
    setForm(f => ({ ...f, regiones: f.regiones.includes(c) ? f.regiones.filter(x => x !== c) : [...f.regiones, c] }))

  // Todos los rubros como lista plana ordenada alfabéticamente
  const todosLosRubros = RUBRO_CATEGORIAS.flatMap(c => c.rubros).sort((a, b) => a.localeCompare(b, 'es'))

  // Regiones en orden geográfico Norte → Sur (códigos de Mercado Público)
  const ORDEN_REGIONES = ['XV','I','II','III','IV','V','RM','VI','VII','XVI','VIII','IX','XIV','X','XI','XII']
  const regionesOrdenadas = catalogo?.regiones
    ? [...catalogo.regiones].sort((a, b) => {
        const ia = ORDEN_REGIONES.indexOf(a.codigo)
        const ib = ORDEN_REGIONES.indexOf(b.codigo)
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
      })
    : []

  // Mapeo ciudad → código de región
  const CIUDAD_A_REGION: Record<string, string> = {
    // XV - Arica y Parinacota
    'arica': 'XV', 'parinacota': 'XV', 'putre': 'XV',
    // I - Tarapacá
    'iquique': 'I', 'alto hospicio': 'I', 'pozo almonte': 'I', 'pica': 'I',
    // II - Antofagasta
    'antofagasta': 'II', 'calama': 'II', 'tocopilla': 'II', 'mejillones': 'II', 'taltal': 'II', 'san pedro de atacama': 'II',
    // III - Atacama
    'copiapó': 'III', 'copiapo': 'III', 'vallenar': 'III', 'chañaral': 'III', 'chanar': 'III', 'diego de almagro': 'III',
    // IV - Coquimbo
    'la serena': 'IV', 'coquimbo': 'IV', 'ovalle': 'IV', 'illapel': 'IV', 'vicuña': 'IV', 'monte patria': 'IV',
    // V - Valparaíso
    'valparaíso': 'V', 'valparaiso': 'V', 'viña del mar': 'V', 'vina del mar': 'V', 'quilpué': 'V', 'quilpue': 'V',
    'san antonio': 'V', 'quillota': 'V', 'los andes': 'V', 'san felipe': 'V', 'villa alemana': 'V', 'limache': 'V',
    // RM - Metropolitana
    'santiago': 'RM', 'providencia': 'RM', 'las condes': 'RM', 'ñuñoa': 'RM', 'nunoa': 'RM', 'maipú': 'RM', 'maipu': 'RM',
    'pudahuel': 'RM', 'quilicura': 'RM', 'puente alto': 'RM', 'la florida': 'RM', 'peñalolén': 'RM', 'penalolen': 'RM',
    'san bernardo': 'RM', 'lo barnechea': 'RM', 'vitacura': 'RM', 'recoleta': 'RM', 'independencia': 'RM',
    'talagante': 'RM', 'melipilla': 'RM', 'colina': 'RM', 'buin': 'RM', 'lampa': 'RM',
    // VI - O'Higgins
    'rancagua': 'VI', 'san fernando': 'VI', 'pichilemu': 'VI', 'santa cruz': 'VI', 'rengo': 'VI',
    // VII - Maule
    'talca': 'VII', 'curicó': 'VII', 'curico': 'VII', 'linares': 'VII', 'cauquenes': 'VII', 'constitución': 'VII', 'constitucion': 'VII',
    // XVI - Ñuble
    'chillán': 'XVI', 'chillan': 'XVI', 'san carlos': 'XVI', 'bulnes': 'XVI', 'yungay': 'XVI',
    // VIII - Biobío
    'concepción': 'VIII', 'concepcion': 'VIII', 'talcahuano': 'VIII', 'los ángeles': 'VIII', 'los angeles': 'VIII',
    'chiguayante': 'VIII', 'hualpén': 'VIII', 'hualpen': 'VIII', 'coronel': 'VIII', 'tomé': 'VIII', 'tome': 'VIII',
    'lebu': 'VIII', 'arauco': 'VIII', 'cañete': 'VIII', 'canete': 'VIII',
    // IX - La Araucanía
    'temuco': 'IX', 'villarrica': 'IX', 'pucón': 'IX', 'pucon': 'IX', 'angol': 'IX', 'nueva imperial': 'IX',
    'padre las casas': 'IX', 'victoria': 'IX',
    // XIV - Los Ríos
    'valdivia': 'XIV', 'la unión': 'XIV', 'la union': 'XIV', 'río bueno': 'XIV', 'rio bueno': 'XIV',
    // X - Los Lagos
    'puerto montt': 'X', 'osorno': 'X', 'castro': 'X', 'ancud': 'X', 'puerto varas': 'X', 'calbuco': 'X',
    'chiloé': 'X', 'chiloe': 'X',
    // XI - Aysén
    'coyhaique': 'XI', 'coihaique': 'XI', 'puerto aysén': 'XI', 'puerto aysen': 'XI', 'cochrane': 'XI',
    // XII - Magallanes
    'punta arenas': 'XII', 'puerto natales': 'XII', 'porvenir': 'XII',
  }

  const [regionQuery, setRegionQuery] = useState('')

  const regionesFiltradas = regionQuery.trim()
    ? (() => {
        const q = regionQuery.toLowerCase().trim()
        // ¿coincide con ciudad?
        const codigoPorCiudad = CIUDAD_A_REGION[q]
        // Filtrar regiones por nombre o por código encontrado
        return regionesOrdenadas.filter(r =>
          r.nombre.toLowerCase().includes(q) ||
          r.codigo === codigoPorCiudad
        )
      })()
    : regionesOrdenadas

  const completeness = [
    !!form.descripcion,
    form.rubros.length > 0,
    form.regiones.length > 0,
    !!form.rut_empresa,
    !!form.experiencia_anos,
  ].filter(Boolean).length

  const [generando, setGenerando] = useState<'descripcion' | 'proyectos' | 'diferenciadores' | null>(null)

  const generarConIA = async (campo: 'descripcion' | 'proyectos' | 'diferenciadores') => {
    if (form.rubros.length === 0) {
      toast('Primero selecciona al menos un rubro', { icon: '⚠️' })
      return
    }
    setGenerando(campo)
    try {
      const res = await api.post('/modules/licitaciones/asistente-perfil', {
        campo,
        rubros: form.rubros,
        regiones: form.regiones,
        descripcion_actual: form.descripcion,
        diferenciadores_actuales: form.diferenciadores,
      })
      const texto: string = res.data.texto
      setForm(f => ({ ...f, [campo]: texto }))
      toast.success('Generado — revisa y ajusta si quieres')
    } catch {
      toast.error('Error al generar. ¿Está el backend activo?')
    } finally {
      setGenerando(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center">
              <Sparkles size={16} className="text-indigo-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">Perfil para IA</p>
              <p className="text-[11px] text-gray-400">Claude usa esto para calificar licitaciones y redactar propuestas</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Mini progreso */}
            <div className="flex items-center gap-1.5">
              {[0,1,2,3,4].map(i => (
                <div key={i} className={clsx('w-1.5 h-1.5 rounded-full', i < completeness ? 'bg-indigo-500' : 'bg-gray-200')} />
              ))}
              <span className="text-[10px] text-gray-400 ml-0.5">{completeness}/5</span>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">

          {/* 1. Descripción — LO MÁS IMPORTANTE */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-700">
                ¿Qué hace tu empresa? <span className="text-red-400">*</span>
                <span className="ml-1 text-[10px] font-normal text-indigo-500">← lo más importante</span>
              </label>
              <button
                type="button"
                onClick={() => generarConIA('descripcion')}
                disabled={generando === 'descripcion' || form.rubros.length === 0}
                className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-40 transition-colors"
              >
                {generando === 'descripcion' ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                {generando === 'descripcion' ? 'Generando…' : 'Generar con IA'}
              </button>
            </div>
            <textarea
              autoFocus
              className="input text-sm w-full resize-none"
              rows={3}
              placeholder="Ej: Empresa de aseo industrial con 8 años de experiencia en hospitales y minería. Equipo de 40 personas certificadas en RM y Biobío. Contamos con ISO 9001..."
              value={form.descripcion}
              onChange={e => onDescripcionChange(e.target.value)}
            />
            {/* Banner sugerencia de rubros */}
            {sugirendoRubros && (
              <p className="text-[10px] text-indigo-400 mt-1.5 flex items-center gap-1">
                <Loader2 size={10} className="animate-spin" /> Detectando rubros…
              </p>
            )}
            {rubrosSugeridos.length > 0 && !sugirendoRubros && (
              <div className="mt-2 flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
                <Sparkles size={12} className="text-indigo-500 shrink-0" />
                <span className="text-[11px] text-indigo-700 flex-1">
                  Rubros detectados: <strong>{rubrosSugeridos.join(', ')}</strong>
                </span>
                <button
                  type="button"
                  onClick={aplicarRubrosSugeridos}
                  className="text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-2.5 py-1 rounded-md shrink-0"
                >
                  Agregar
                </button>
                <button type="button" onClick={() => setRubrosSugeridos([])} className="text-gray-400 hover:text-gray-600">
                  <X size={12} />
                </button>
              </div>
            )}
            <p className="text-[10px] text-gray-400 mt-1">
              {form.rubros.length === 0
                ? '⚠️ Selecciona rubros primero para habilitar la generación con IA'
                : 'Incluye: rubro, años de experiencia, tamaño, regiones, diferenciadores clave'}
            </p>
          </div>

          {/* 2. Rubros — chips planos todos juntos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-700">Rubros donde participas <span className="text-red-400">*</span></label>
              {form.rubros.length > 0 && (
                <button onClick={() => setForm(f => ({ ...f, rubros: [] }))} className="text-[10px] text-gray-400 hover:text-red-400">limpiar</button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {todosLosRubros.map(r => (
                <button key={r} type="button" onClick={() => toggleRubro(r)}
                  className={clsx('text-xs px-2.5 py-1 rounded-full border transition-colors capitalize',
                    form.rubros.includes(r)
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'
                  )}>
                  {r}
                </button>
              ))}
            </div>
            {form.rubros.length > 0 && (
              <p className="text-[10px] text-indigo-500 mt-1.5">{form.rubros.length} seleccionado{form.rubros.length > 1 ? 's' : ''}</p>
            )}
          </div>

          {/* 3. Regiones — buscador ciudad/región + chips N→S */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-700">Regiones donde operas <span className="text-red-400">*</span></label>
              <div className="flex gap-2">
                {form.regiones.length > 0 && (
                  <button onClick={() => setForm(f => ({ ...f, regiones: [] }))} className="text-[10px] text-gray-400 hover:text-red-400">limpiar</button>
                )}
                <button
                  onClick={() => setForm(f => ({ ...f, regiones: regionesOrdenadas.map(r => r.codigo) }))}
                  className="text-[10px] text-indigo-500 hover:text-indigo-700"
                >
                  todas
                </button>
              </div>
            </div>
            {/* Buscador */}
            <div className="relative mb-2">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={regionQuery}
                onChange={e => setRegionQuery(e.target.value)}
                placeholder="Busca por región o ciudad (ej: Santiago, Concepción, Iquique…)"
                className="input text-xs w-full pl-7 py-2"
              />
              {regionQuery && (
                <button onClick={() => setRegionQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={12} />
                </button>
              )}
            </div>
            {/* Chips */}
            <div className="flex flex-wrap gap-1.5">
              {regionesFiltradas.map(r => {
                const nombre = r.nombre
                  .replace('Región Metropolitana de Santiago', 'RM — Santiago')
                  .replace('Región de ', '')
                  .replace('Región del ', '')
                return (
                  <button key={r.codigo} type="button" onClick={() => { toggleRegion(r.codigo); setRegionQuery('') }}
                    className={clsx('text-xs px-2.5 py-1 rounded-full border transition-colors',
                      form.regiones.includes(r.codigo)
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'
                    )}>
                    {nombre}
                  </button>
                )
              })}
              {regionesFiltradas.length === 0 && regionQuery && (
                <p className="text-xs text-gray-400 py-1">Sin resultados — prueba con otra ciudad o región</p>
              )}
            </div>
            {form.regiones.length > 0 && (
              <p className="text-[10px] text-indigo-500 mt-1.5">{form.regiones.length} región{form.regiones.length > 1 ? 'es' : ''} seleccionada{form.regiones.length > 1 ? 's' : ''}</p>
            )}
          </div>

          {/* 4. Datos básicos — secundarios */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">RUT empresa</label>
              <input className="input text-sm w-full" placeholder="76.123.456-7" value={form.rut_empresa} onChange={e => setForm(f => ({ ...f, rut_empresa: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Años de experiencia</label>
              <input type="number" min="0" className="input text-sm w-full" placeholder="5" value={form.experiencia_anos} onChange={e => setForm(f => ({ ...f, experiencia_anos: e.target.value }))} />
            </div>
          </div>

          {/* 5. ChileProveedores */}
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={form.inscrito_chile_proveedores} onChange={e => setForm(f => ({ ...f, inscrito_chile_proveedores: e.target.checked }))} className="rounded border-gray-300 text-indigo-600 w-4 h-4" />
            <div>
              <span className="text-sm text-gray-700 font-medium">Inscrito en ChileProveedores</span>
              <p className="text-[10px] text-gray-400">Requisito obligatorio para postular a licitaciones públicas</p>
            </div>
          </label>

          {/* 6. Proyectos y certificaciones */}
          <div className="grid grid-cols-1 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-700">Proyectos anteriores relevantes</label>
                <button
                  type="button"
                  onClick={() => generarConIA('proyectos')}
                  disabled={generando === 'proyectos' || form.rubros.length === 0}
                  className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-40 transition-colors"
                >
                  {generando === 'proyectos' ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
                  {generando === 'proyectos' ? 'Generando…' : 'Ayudarme a redactar'}
                </button>
              </div>
              <textarea
                rows={2}
                className="input text-xs w-full resize-none"
                placeholder="Ej: Suministro de equipos para Hospital Regional de Temuco (2023), Mantención vial Municipalidad de Rancagua…"
                value={form.proyectos_anteriores}
                onChange={e => setForm(f => ({ ...f, proyectos_anteriores: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Certificaciones</label>
              <input
                className="input text-xs w-full"
                placeholder="ISO 9001, OHSAS 18001…"
                value={form.certificaciones}
                onChange={e => setForm(f => ({ ...f, certificaciones: e.target.value }))}
              />
            </div>
          </div>

          {/* 7. Diferenciadores */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-700">¿Qué diferencia a tu empresa de la competencia?</label>
              <button
                type="button"
                onClick={() => generarConIA('diferenciadores')}
                disabled={generando === 'diferenciadores' || form.rubros.length === 0}
                className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-40 transition-colors"
              >
                {generando === 'diferenciadores' ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                {generando === 'diferenciadores' ? 'Generando…' : 'Sugerir'}
              </button>
            </div>
            <textarea
              rows={2}
              className="input text-xs w-full resize-none"
              placeholder="Ej: Somos el único proveedor certificado ISO 9001 en la región, tiempo de respuesta 24h, equipo bilingüe, precios más competitivos del mercado…"
              value={form.diferenciadores}
              onChange={e => setForm(f => ({ ...f, diferenciadores: e.target.value }))}
            />
            <p className="text-[10px] text-gray-400 mt-1">La IA usará esto para destacarte en la propuesta final</p>
          </div>

          {/* 8. Email alertas */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email para alertas de nuevas licitaciones</label>
            <input
              type="email"
              className="input text-xs w-full"
              placeholder="hola@miempresa.cl"
              value={form.email_alertas}
              onChange={e => setForm(f => ({ ...f, email_alertas: e.target.value }))}
            />
            <p className="text-[10px] text-gray-400 mt-1">Recibirás un aviso diario con licitaciones que coincidan con tus rubros</p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-gray-100 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">Cancelar</button>
          <button
            onClick={() => guardarMutation.mutate()}
            disabled={guardarMutation.isPending || !form.descripcion.trim()}
            className="flex items-center gap-2 text-sm font-semibold px-5 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            {guardarMutation.isPending ? <><Loader2 size={14} className="animate-spin" /> Guardando…</> : <><CheckCircle2 size={14} /> Guardar</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function LicitacionesPage() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'
  const tab = 'licitador_a' as const
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
  // searchSeconds viene del store global (ver más abajo)
  const [cacheInfo, setCacheInfo] = useState<string | null>(null)
  const [rubrosConConteo, setRubrosConConteo] = useState<Record<string, number>>({})
  const [buscarRubroQuery, setBuscarRubroQuery] = useState('')
  const [previewContactos, setPreviewContactos] = useState<Record<string, { phone?: string; website?: string; address?: string; source?: string; loading?: boolean }>>({})  
  const [paginaActual, setPaginaActual] = useState(1)
  const [totalPaginas, setTotalPaginas] = useState(1)

  // ── Estado IA ────────────────────────────────────────────────────────────
  const [iaConsulta, setIaConsulta] = useState('')
  const [iaResumen, setIaResumen] = useState<string | null>(null)
  const [iaAdvertencia, setIaAdvertencia] = useState<string | null>(null)
  const [iaSugerencia, setIaSugerencia] = useState<string | null>(null)
  const [propuestaModal, setPropuestaModal] = useState<{ prospectId: string; nombre: string } | null>(null)
  const [propuestaTexto, setPropuestaTexto] = useState<string | null>(null)
  const [propuestaCopied, setPropuestaCopied] = useState(false)
  const [analisisData, setAnalisisData] = useState<any | null>(null)
  const [analisisTab, setAnalisisTab] = useState<'analisis' | 'propuesta' | 'docs'>('analisis')

  // ── Tab principal (persistido en URL para sobrevivir F5) ─────────────────
  const [searchParams, setSearchParams] = useSearchParams()
  const mainTab = (searchParams.get('tab') as 'buscar' | 'postulaciones') ?? 'buscar'
  const setMainTab = (tab: 'buscar' | 'postulaciones') =>
    setSearchParams(prev => { prev.set('tab', tab); return prev }, { replace: true })

  const queryClient = useQueryClient()
  const [showPerfilModal, setShowPerfilModal] = useState(false)

  // ── Prospectos guardados (Mis postulaciones) ──────────────────────────────
  const { data: postulacionesData, isLoading: loadingPostulaciones } = useQuery({
    queryKey: ['licitaciones-postulaciones'],
    queryFn: () => api.get('/modules/licitaciones/prospectos', {
      params: { modulo: 'licitaciones', por_pagina: 100 }
    }).then(r => r.data),
    staleTime: 30_000,
  })

  // ── Sincronizar prospect_id de BD → lista local de resultados ─────────────
  // Cuando llegan los prospectos guardados, marcamos en los resultados locales
  // cuáles ya están guardados (por licitacion_codigo). Así el badge verde
  // aparece aunque el caché no tenga el prospect_id.
  useEffect(() => {
    if (!postulacionesData?.items?.length) return
    const codigoToId: Record<string, string> = {}
    for (const p of postulacionesData.items) {
      if (p.licitacion_codigo) codigoToId[p.licitacion_codigo] = p.id
    }
    setResultados(prev => {
      if (!prev.length) return prev
      return prev.map(r =>
        !r.prospect_id && codigoToId[r.codigo]
          ? { ...r, prospect_id: codigoToId[r.codigo] }
          : r
      )
    })
  }, [postulacionesData])

  // ── Restaurar búsqueda guardada al volver a la página ───────────────────
  const CACHE_TTL_MS = 4 * 60 * 60 * 1000  // 4 horas — MP publica en lotes, no en tiempo real

  useEffect(() => {
    try {
      const saved = localStorage.getItem('kapturo_licitaciones_cache')
      if (!saved) return
      const data = JSON.parse(saved)
      const ageMs = data.savedAt ? Date.now() - new Date(data.savedAt).getTime() : Infinity
      const isStale = ageMs > CACHE_TTL_MS

      // Invalidar caché si los rubros guardados son [] (todos) pero el perfil tiene rubros específicos
      // Esto evita mostrar resultados sin filtro cuando el perfil ya está configurado
      const cachedRubros: string[] = data.rubrosSeleccionados || []
      // Intentar leer perfil del queryClient (puede estar disponible por otra query)
      const perfil = (window as any).__kapturo_perfil_rubros as string[] | undefined
      const perfilTieneRubros = perfil && perfil.length > 0
      const cacheEsSinFiltro = cachedRubros.length === 0
      if (perfilTieneRubros && cacheEsSinFiltro) {
        // El caché no tiene filtro de rubros pero el perfil sí — descartarlo
        localStorage.removeItem('kapturo_licitaciones_cache')
        return
      }

      if (data.filtros) setFiltros(data.filtros)
      if (cachedRubros.length > 0) setRubrosSeleccionados(cachedRubros)
      if (data.rubrosConConteo) setRubrosConConteo(data.rubrosConConteo)
      if (data.resultados?.length) {
        setResultados(data.resultados)
        setTotalResultados(data.total || 0)
        setTotalDisponible(data.total_disponible ?? null)
        if (isStale) {
          // Caché expirado — no auto-refrescamos (puede colgar si los filtros son inválidos)
          // El usuario puede actualizar manualmente con el botón "Actualizar"
          setCacheInfo('expirado · pulsa Actualizar')
        } else {
          const mins = Math.round(ageMs / 60000)
          const expiraMins = Math.round((CACHE_TTL_MS - ageMs) / 60000)
          setCacheInfo(
            data.savedAt
              ? `hace ${mins < 2 ? '1 min' : `${mins} min`} · expira en ${expiraMins} min`
              : null
          )
        }
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Perfil de empresa → auto-filtros si no hay caché ────────────────────
  const { data: perfilEmpresa } = useQuery({
    queryKey: ['licitaciones-profile'],
    queryFn: () => api.get('/tenant/me/licitaciones-profile').then(r => r.data).catch(() => null),
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (!perfilEmpresa) return
    try {
      // Guardar rubros del perfil en window para que el check de caché pueda accederlos
      if (perfilEmpresa.rubros?.length > 0) {
        (window as any).__kapturo_perfil_rubros = perfilEmpresa.rubros
      }
      // Si el perfil tiene rubros, aplicarlos SIEMPRE como filtro por defecto
      // (sobreescribe caché sin filtro o con rubros distintos)
      if (perfilEmpresa.rubros?.length > 0) {
        setRubrosSeleccionados(prev => {
          // Solo sobreescribir si los rubros actuales no son un subconjunto del perfil
          // (respeta si el usuario manualmente seleccionó un subconjunto de sus rubros)
          const perfilSet = new Set(perfilEmpresa.rubros)
          const todosEnPerfil = prev.every((r: string) => perfilSet.has(r))
          if (prev.length === 0 || !todosEnPerfil) return perfilEmpresa.rubros
          return prev  // el usuario ya tenia rubros del perfil seleccionados
        })
      }
      if (perfilEmpresa.regiones?.length === 1) setFiltros(f => ({ ...f, region: perfilEmpresa.regiones[0] }))
    } catch {}
  }, [perfilEmpresa])

  // ── Limpiar resultados cuando cambian los filtros activos ────────────────
  // Evita mostrar resultados de una búsqueda anterior con otros filtros
  const prevFiltrosRef = useRef<string>('')
  const iaSearchActiveRef = useRef(false)  // true mientras IA está seteando rubros — evita limpiar sus propios resultados
  useEffect(() => {
    const key = JSON.stringify({ rubrosSeleccionados, region: filtros.region, periodo: filtros.periodo })
    if (iaSearchActiveRef.current) {
      iaSearchActiveRef.current = false
      prevFiltrosRef.current = key
      return
    }
    if (prevFiltrosRef.current && prevFiltrosRef.current !== key) {
      // Los filtros cambiaron después de una búsqueda — limpiar caché y resultados
      setResultados([])
      setTotalResultados(0)
      setCacheInfo(null)
      try { localStorage.removeItem('kapturo_licitaciones_cache') } catch {}
    }
    prevFiltrosRef.current = key
  }, [rubrosSeleccionados, filtros.region, filtros.periodo])

  // ── Catálogo ────────────────────────────────────────────────────────────
  const { data: catalogo } = useQuery<Catalogo>({
    queryKey: ['licitaciones-catalogos'],
    queryFn: () => api.get('/modules/licitaciones/catalogos').then(r => r.data),
    staleTime: Infinity,
  })

  // ── Preview / Búsqueda ──────────────────────────────────────────────────
  // ── Store global de búsqueda (sobrevive navegación) ───────────────────────
  const searchStore = useLicitacionesSearchStore()
  const getToken = () => localStorage.getItem('kapturo_token') || ''

  // Sincronizar resultados del store al estado local del componente
  useEffect(() => {
    // Sincronizar siempre que la búsqueda termine (incluso con 0 resultados)
    const searchJustFinished = !searchStore.isSearching && !searchStore.isSearchingIA
      && searchStore.searchParams !== null
    if (searchJustFinished) {
      setResultados(searchStore.resultados as unknown as LicitacionPreview[])
      setTotalResultados(searchStore.totalResultados)
      setTotalPaginas(searchStore.totalPaginas)
      setPaginaActual(searchStore.paginaActual)
      setTotalDisponible(searchStore.totalDisponible)
      setRubrosConConteo(searchStore.rubrosConConteo)
      setCacheInfo(searchStore.cacheInfo)
      if (searchStore.iaResumen !== null) setIaResumen(searchStore.iaResumen)
      if (searchStore.iaAdvertencia !== null) setIaAdvertencia(searchStore.iaAdvertencia)
      if (searchStore.iaSugerencia !== null) setIaSugerencia(searchStore.iaSugerencia)
      // Cruzar con prospectos guardados
      if (postulacionesData?.items?.length) {
        const codigoToId: Record<string, string> = {}
        for (const p of postulacionesData.items) {
          if (p.licitacion_codigo) codigoToId[p.licitacion_codigo] = p.id
        }
        setResultados(prev => prev.map(r =>
          !r.prospect_id && codigoToId[r.codigo] ? { ...r, prospect_id: codigoToId[r.codigo] } : r
        ))
      }
    }
    if (searchStore.error) {
      toast.error(searchStore.error)
      searchStore.clearError()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchStore.isSearching, searchStore.isSearchingIA, searchStore.resultados])

  const buscarMutation = {
    isPending: searchStore.isSearching,
    mutate: (pagina: number = 1) => {
      searchStore.iniciarBusqueda(
        { tab, filtros, rubrosSeleccionados, pagina },
        getToken()
      )
      setPaginaActual(pagina)
      setExpandedId(null)
    },
  }

  // ── Búsqueda con IA ────────────────────────────────────────────────────────
  const busquedaIAMutation = {
    isPending: searchStore.isSearchingIA,
    mutate: (consulta: string) => {
      setResultados([])
      setTotalResultados(0)
      setCacheInfo(null)
      setIaResumen(null)
      setIaAdvertencia(null)
      setIaSugerencia(null)
      setExpandedId(null)
      searchStore.iniciarBusquedaIA(consulta, tab, getToken())
    },
  }

  // ── Generar propuesta ─────────────────────────────────────────────────────
  const propuestaMutation = useMutation({
    mutationFn: ({ prospectId }: { prospectId: string }) =>
      api.post(`/modules/licitaciones/propuesta/${prospectId}`, {}),
    onSuccess: (res) => {
      setPropuestaTexto(res.data.propuesta)
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Error al generar propuesta'),
  })

  // ── Analizar bases con IA — background + polling ─────────────────────────
  const [analysisJobId, setAnalysisJobId] = useState<string | null>(null)
  const [analysisSeconds, setAnalysisSeconds] = useState(0)

  // Iniciar job
  const analizarMutation = useMutation({
    mutationFn: ({ prospectId }: { prospectId: string }) =>
      api.post(`/modules/licitaciones/analizar/${prospectId}/start`),
    onSuccess: (res) => {
      setAnalysisJobId(res.data.job_id)
      setAnalysisSeconds(0)
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Error al iniciar análisis'),
  })

  // Polling del job cada 3s
  const { data: jobData } = useQuery({
    queryKey: ['analysis-job', analysisJobId],
    queryFn: () => api.get(`/modules/licitaciones/analizar/job/${analysisJobId}`).then(r => r.data),
    enabled: !!analysisJobId,
    refetchInterval: (query: any) => {
      const data = query.state.data as any
      if (!data || data.status === 'pending') return 3000
      return false // parar cuando done o error
    },
  } as any)

  // Reaccionar al resultado del job (onSuccess fue eliminado en TanStack Query v5)
  useEffect(() => {
    if (!jobData) return
    if ((jobData as any).status === 'done') {
      setAnalisisData((jobData as any).result)
      setPropuestaTexto((jobData as any).result?.propuesta || null)
      setAnalisisTab('analisis')
      setAnalysisJobId(null)
      queryClient.removeQueries({ queryKey: ['analysis-job'] })
    } else if ((jobData as any).status === 'error') {
      toast.error((jobData as any).error || 'Error en el análisis')
      setAnalysisJobId(null)
      queryClient.removeQueries({ queryKey: ['analysis-job'] })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobData])

  // Contador de segundos mientras analiza + timeout de 120s
  useEffect(() => {
    if (!analysisJobId) { setAnalysisSeconds(0); return }
    const t = setInterval(() => setAnalysisSeconds(s => {
      if (s >= 119) {
        clearInterval(t)
        setAnalysisJobId(null)
        queryClient.removeQueries({ queryKey: ['analysis-job'] })
        toast.error('El análisis tardó demasiado. Intenta de nuevo.')
        return 0
      }
      return s + 1
    }), 1000)
    return () => clearInterval(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisJobId])

  const isAnalyzing = analizarMutation.isPending || !!analysisJobId

  // ── Eliminar postulación ──────────────────────────────────────────────────
  const eliminarMutation = useMutation({
    mutationFn: (prospectId: string) =>
      api.delete(`/modules/licitaciones/prospectos/${prospectId}`),
    onSuccess: () => {
      toast.success('Postulación eliminada')
      queryClient.invalidateQueries({ queryKey: ['licitaciones-postulaciones'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Error al eliminar'),
  })

  // ── Actualizar estado de postulación ─────────────────────────────────────
  const actualizarEstadoMutation = useMutation({
    mutationFn: ({ prospectId, estado }: { prospectId: string; estado: string }) =>
      api.patch(`/modules/licitaciones/prospectos/${prospectId}/estado`, { estado }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['licitaciones-postulaciones'] })
      toast.success('Estado actualizado')
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Error al actualizar estado'),
  })

  // ── Timer de progreso de búsqueda — sincronizado con el store global ────
  const searchSeconds = searchStore.searchSeconds
  const setSearchSeconds = (_: number) => {}  // el store maneja el timer

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
      queryClient.invalidateQueries({ queryKey: ['licitaciones-postulaciones'] })
      setResultados(prev => {
        const updated = prev.map(r => r.codigo === item.codigo
          ? {
              ...r,
              prospect_id: res.data.prospect_id ?? r.prospect_id,
              score: res.data.score ?? r.score,
              email: res.data.email ?? r.email,
              phone: res.data.phone ?? r.phone,
              website: res.data.website ?? r.website,
              address: res.data.address ?? r.address,
              contact_name: res.data.contact_name ?? r.contact_name,
              enrichment_source: res.data.enrichment_source ?? r.enrichment_source,
            }
          : r
        )
        // Persistir en caché local
        try {
          const cached = localStorage.getItem('kapturo_licitaciones_cache')
          if (cached) {
            const parsed = JSON.parse(cached)
            parsed.resultados = updated
            localStorage.setItem('kapturo_licitaciones_cache', JSON.stringify(parsed))
          }
        } catch {}
        return updated
      })
      // Navegar directo al prospecto recién guardado (o duplicado)
      const prospectId = res.data.prospect_id
      const isDuplicate = res.data.status === 'duplicate'
      if (isDuplicate) {
        toast('Ya estaba guardada — abriéndola…', { icon: 'ℹ️' })
      } else {
        toast.success(`Guardada ✓ — score ${res.data.score?.toFixed(0) ?? '—'}`)
      }
      if (prospectId) {
        setMainTab('postulaciones')
        // Esperar a que el panel cargue los nuevos datos antes de hacer scroll
        setTimeout(() => setExpandedId(prospectId), 500)
      } else if (isDuplicate) {
        setMainTab('postulaciones')
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
        buscarMutation.mutate(paginaActual)
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
    setPaginaActual(1)
    setTotalPaginas(1)
    setPreviewContactos({})
  }

  const descargarCSV = () => {
    const headers = ['Empresa', 'RUT', 'Licitación', 'Monto Adj.', 'Organismo', 'Categoría', 'Región', 'Adjudicada', 'Teléfono', 'Web', 'Email', 'Dirección', 'Score']
    const rows = resultados.map(item => [
      item.organismo,
      item.organismo_rut,
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
        <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center shrink-0">
          <FileText size={20} className="text-indigo-600" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Licitaciones</h1>
          <p className="text-gray-500 text-sm">Mercado Público Chile · Licitaciones abiertas y próximas a cerrar</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowPerfilModal(true)}
            className={clsx(
              'flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border transition-colors whitespace-nowrap',
              perfilEmpresa?.descripcion
                ? 'border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-indigo-300'
                : 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
            )}
          >
            <Settings size={13} />
            {perfilEmpresa?.descripcion ? 'Perfil para IA' : '⚠️ Configurar perfil IA'}
          </button>
        )}
      </div>

      {/* Guía rápida */}
      <GuiaRapida />

      {/* Tab switcher principal */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        <button
          onClick={() => {
            if (!perfilEmpresa?.descripcion) { setShowPerfilModal(true); return }
            setMainTab('buscar')
            // Limpiar badge nuevas_pendientes al abrir el tab
            if (perfilEmpresa?.nuevas_pendientes > 0) {
              api.put('/tenant/me/licitaciones-profile', { nuevas_pendientes: 0 }).catch(() => {})
              queryClient.setQueryData(['licitaciones-profile'], (old: any) => old ? { ...old, nuevas_pendientes: 0 } : old)
            }
          }}
          className={clsx(
            'flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition-all',
            mainTab === 'buscar'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <Search size={14} /> Buscar licitaciones
          {!perfilEmpresa?.descripcion && <span className="text-amber-500 text-xs">⚠️</span>}
          {perfilEmpresa?.descripcion && (perfilEmpresa?.nuevas_pendientes ?? 0) > 0 && (
            <span className="text-xs bg-indigo-600 text-white px-1.5 py-0.5 rounded-full font-bold animate-pulse">
              {perfilEmpresa.nuevas_pendientes}
            </span>
          )}
        </button>
        <button
          onClick={() => setMainTab('postulaciones')}
          className={clsx(
            'flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition-all',
            mainTab === 'postulaciones'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <ListChecks size={14} /> Mis postulaciones
          {postulacionesData?.items?.length > 0 && (
            <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-bold">
              {postulacionesData.items.length}
            </span>
          )}
        </button>
      </div>

      {/* ─────────── PANEL MIS POSTULACIONES ─────────── */}
      {mainTab === 'postulaciones' && (
        <PostulacionesPanel
          prospectos={postulacionesData?.items ?? []}
          loading={loadingPostulaciones}
          highlightId={expandedId}
          onHighlightClear={() => setExpandedId(null)}
          onAnalizar={(p) => {
            setAnalisisData(null)
            setPropuestaTexto(null)
            setPropuestaModal({ prospectId: p.id, nombre: p.licitacion_nombre || p.company_name || '' })
            analizarMutation.mutate({ prospectId: p.id })
          }}
          onCambiarEstado={(prospectId, estado) =>
            actualizarEstadoMutation.mutate({ prospectId, estado })
          }
          updatingId={actualizarEstadoMutation.isPending ? (actualizarEstadoMutation.variables as any)?.prospectId : null}
          onEliminar={(prospectId) => eliminarMutation.mutate(prospectId)}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['licitaciones-postulaciones'] })}
        />
      )}


      {/* ─────────── SECCIÓN BUSCAR (solo cuando tab=buscar) ─────────── */}
      {mainTab === 'buscar' && (<>

      {/* Gate: perfil no configurado */}
      {!perfilEmpresa?.descripcion ? (
        <div className="flex flex-col items-center justify-center py-16 gap-5 text-center">
          <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center">
            <Settings size={28} className="text-indigo-500" />
          </div>
          <div className="max-w-sm">
            <p className="font-semibold text-gray-900 text-base mb-1">Configura tu perfil antes de buscar</p>
            <p className="text-sm text-gray-500 leading-relaxed">
              La IA usa tu perfil para pre-filtrar licitaciones relevantes y generar propuestas personalizadas. Sin esto, los resultados no tienen valor real.
            </p>
          </div>
          <button
            onClick={() => setShowPerfilModal(true)}
            className="flex items-center gap-2 text-sm font-semibold px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
          >
            <Sparkles size={15} /> Configurar perfil — 2 minutos
          </button>
        </div>
      ) : (<>

      {/* Barra de búsqueda IA */}
      {isAdmin && (
        <div className="card p-4 bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-100">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
              <Wand2 size={15} className="text-white" />
            </div>
            <div className="flex-1 space-y-2">
              <div>
                <p className="text-sm font-semibold text-indigo-900">Búsqueda con IA</p>
                <p className="text-xs text-indigo-400">Describe en tus propias palabras qué tipo de licitación busca tu empresa</p>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={iaConsulta}
                  onChange={e => setIaConsulta(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && iaConsulta.trim()) busquedaIAMutation.mutate(iaConsulta.trim()) }}
                  placeholder="Ej: quiero limpiar hospitales en Santiago, servicios de mantención eléctrica…"
                  className="flex-1 text-sm px-3 py-2 rounded-xl border border-indigo-200 bg-white outline-none focus:border-indigo-400 placeholder:text-gray-300"
                />
                <button
                  onClick={() => iaConsulta.trim() && busquedaIAMutation.mutate(iaConsulta.trim())}
                  disabled={busquedaIAMutation.isPending || !iaConsulta.trim()}
                  className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {busquedaIAMutation.isPending
                    ? <><Loader2 size={14} className="animate-spin" /> Analizando…</>
                    : <><Sparkles size={14} /> Buscar con IA</>}
                </button>
              </div>
              {iaResumen && !busquedaIAMutation.isPending && (
                <div className="flex items-center gap-1.5 text-xs text-indigo-600 bg-indigo-100/60 px-3 py-1.5 rounded-lg">
                  <Sparkles size={11} />
                  <span>Entendí: <strong>{iaResumen}</strong></span>
                  <button onClick={() => { setIaResumen(null); setIaAdvertencia(null); setIaSugerencia(null) }} className="ml-auto text-indigo-300 hover:text-indigo-600"><X size={11} /></button>
                </div>
              )}
              {iaAdvertencia && !busquedaIAMutation.isPending && (
                <div className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
                  <span className="text-amber-500 mt-0.5">⚠️</span>
                  <div className="flex-1">
                    <p className="text-amber-800 font-medium">{iaAdvertencia}</p>
                    {iaSugerencia && (
                      <button
                        onClick={() => { setIaConsulta(iaSugerencia); setIaAdvertencia(null) }}
                        className="mt-1 text-amber-700 underline hover:text-amber-900"
                      >
                        Buscar: “{iaSugerencia}” →
                      </button>
                    )}
                  </div>
                  <button onClick={() => setIaAdvertencia(null)} className="text-amber-300 hover:text-amber-600"><X size={11} /></button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Panel de filtros */}
      <div className="card p-4 space-y-3">

        {/* ── Fila principal: Rubros + Región + Período ── */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">

          {/* Rubros */}
          <div className="sm:col-span-1">
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Rubros</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => { setShowRubrosDropdown(v => !v); setBuscarRubroQuery('') }}
                className="input text-sm w-full flex items-center justify-between text-left"
            >
              <span className="truncate text-gray-600">
                {rubrosSeleccionados.length === 0
                  ? 'Todos los rubros'
                  : `${rubrosSeleccionados.length} rubro${rubrosSeleccionados.length > 1 ? 's' : ''} seleccionado${rubrosSeleccionados.length > 1 ? 's' : ''}`}
              </span>
              <ChevronDown size={13} className={clsx('text-gray-400 shrink-0 transition-transform', showRubrosDropdown && 'rotate-180')} />
            </button>

            {showRubrosDropdown && (
              <div className="absolute z-30 mt-1 w-[min(480px,90vw)] bg-white border border-gray-200 rounded-xl shadow-xl left-0">
                {/* Buscador + limpiar */}
                <div className="flex items-center gap-2 p-2 border-b border-gray-100">
                  <div className="relative flex-1">
                    <input
                      autoFocus
                      type="text"
                      placeholder="Buscar rubro…"
                      value={buscarRubroQuery}
                      onChange={e => setBuscarRubroQuery(e.target.value)}
                      className="w-full text-xs pl-7 pr-2 py-1.5 rounded-lg border border-gray-200 outline-none focus:border-indigo-300 bg-gray-50"
                      onClick={e => e.stopPropagation()}
                    />
                    <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  </div>
                  {rubrosSeleccionados.length > 0 && (
                    <button onClick={() => setRubrosSeleccionados([])} className="text-[11px] text-red-400 hover:text-red-600 whitespace-nowrap px-2">Limpiar</button>
                  )}
                </div>

                {/* Categorías o resultados de búsqueda */}
                <div className="overflow-y-auto max-h-72 p-2 space-y-1">
                  {buscarRubroQuery ? (
                    // Modo búsqueda: lista plana con conteos
                    <div className="grid grid-cols-2 gap-1">
                      {RUBRO_CATEGORIAS.flatMap(c => c.rubros)
                        .filter(r => r.includes(buscarRubroQuery.toLowerCase()))
                        .map(r => {
                          const sel = rubrosSeleccionados.includes(r)
                          const count = rubrosConConteo[r]
                          return (
                            <label key={r} className={clsx(
                              'flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer text-xs capitalize transition-colors',
                              sel ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-50 text-gray-700'
                            )}>
                              <input type="checkbox" className="rounded border-gray-300 text-indigo-600 shrink-0 w-3.5 h-3.5"
                                checked={sel}
                                onChange={e => setRubrosSeleccionados(prev => e.target.checked ? [...prev, r] : prev.filter(x => x !== r))} />
                              <span className="flex-1">{r}</span>
                              {count > 0 && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 rounded-full">{count}</span>}
                            </label>
                          )
                        })}
                    </div>
                  ) : (
                    // Modo categorías
                    RUBRO_CATEGORIAS.map(cat => {
                      const selEnCat = cat.rubros.filter(r => rubrosSeleccionados.includes(r))
                      const rubrosConRes = cat.rubros.filter(r => !Object.keys(rubrosConConteo).length || (rubrosConConteo[r] ?? 0) > 0 || rubrosSeleccionados.includes(r))
                      if (rubrosConRes.length === 0) return null
                      return (
                        <div key={cat.label}>
                          {/* Encabezado categoría */}
                          <div className="flex items-center gap-1.5 px-1 py-1 mb-0.5">
                            <span className="text-sm">{cat.emoji}</span>
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide flex-1">{cat.label}</span>
                            {selEnCat.length > 0 && (
                              <span className="text-[10px] text-indigo-600 font-bold">{selEnCat.length} ✓</span>
                            )}
                          </div>
                          {/* Rubros en grid 3 cols */}
                          <div className="grid grid-cols-3 gap-1 mb-1">
                            {rubrosConRes.map(r => {
                              const sel = rubrosSeleccionados.includes(r)
                              const count = rubrosConConteo[r]
                              return (
                                <button key={r} onClick={() => setRubrosSeleccionados(prev => sel ? prev.filter(x => x !== r) : [...prev, r])}
                                  className={clsx(
                                    'flex flex-col items-center justify-center px-1 py-2 rounded-lg border text-[11px] font-medium capitalize transition-colors leading-tight text-center',
                                    sel
                                      ? 'bg-indigo-600 text-white border-indigo-600'
                                      : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'
                                  )}>
                                  <span>{r}</span>
                                  {count > 0 && (
                                    <span className={clsx('text-[10px] mt-0.5', sel ? 'text-indigo-200' : 'text-gray-400')}>{count}</span>
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                {/* Footer */}
                <div className="p-2 border-t border-gray-100 flex justify-end">
                  <button onClick={() => setShowRubrosDropdown(false)}
                    className="text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-1.5 rounded-lg">
                    Listo
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Chips de rubros seleccionados */}
          {rubrosSeleccionados.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {rubrosSeleccionados.map(r => (
                <span key={r} className="inline-flex items-center gap-1 text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                  {r}
                  {rubrosConConteo[r] > 0 && <span className="text-indigo-400">{rubrosConConteo[r]}</span>}
                  <button onClick={() => setRubrosSeleccionados(prev => prev.filter(x => x !== r))}><X size={10} /></button>
                </span>
              ))}
            </div>
          )}
          </div>

          {/* Región */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Región</label>
            <select className="input text-sm w-full" value={filtros.region} onChange={setF('region')}>
              <option value="">Todas</option>
              {catalogo?.regiones.map(r => (
                <option key={r.codigo} value={r.codigo}>{r.nombre}</option>
              ))}
            </select>
          </div>

          {/* Período */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Período</label>
            <select className="input text-sm w-full" value={filtros.periodo} onChange={setF('periodo')}>
              <option value="7">Últimos 7 días</option>
              <option value="30">Último mes</option>
              <option value="90">3 meses</option>
              <option value="180">6 meses</option>
            </select>
          </div>
        </div>

        {/* ── Filtros opcionales (colapsables) ── */}
        <div>
          <button
            type="button"
            onClick={() => setShowAvanzados(v => !v)}
            className="text-[11px] text-gray-400 flex items-center gap-1 hover:text-gray-600"
          >
            <ChevronDown size={11} className={clsx('transition-transform', showAvanzados && 'rotate-180')} />
            {showAvanzados ? 'Ocultar opciones' : 'Más opciones — tipo de licitación, organismo'}
          </button>

          {showAvanzados && (
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 pt-2 border-t border-gray-100">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Tipo de licitación</label>
                <select className="input text-sm w-full" value={filtros.tipo_licitacion} onChange={setF('tipo_licitacion')}>
                  <option value="">Todos los tipos</option>
                  {catalogo?.tipos.map(t => (
                    <option key={t.codigo} value={t.codigo}>{t.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Organismo comprador</label>
                <input
                  className="input text-sm w-full"
                  placeholder="Ej: Hospital, Municipalidad…"
                  value={filtros.comprador}
                  onChange={setF('comprador')}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Botón buscar ── */}
        {isAdmin && (
          <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
            <button
              className="btn-primary flex items-center gap-2 py-2.5 px-5"
              onClick={() => { setPaginaActual(1); buscarMutation.mutate(1) }}
              disabled={buscarMutation.isPending}
            >
              {buscarMutation.isPending
                ? <><Loader2 size={14} className="animate-spin" />
                    {searchSeconds < 5 ? 'Buscando…' :
                     searchSeconds < 20 ? `Descargando… ${searchSeconds}s` :
                     `Procesando… ${searchSeconds}s`}
                  </>
                : <><Search size={14} /> Buscar</>}
            </button>
            {resultados.length > 0 && (
              <button onClick={limpiarBusqueda} className="text-xs text-gray-400 hover:text-red-400 flex items-center gap-1">
                <X size={12} /> Limpiar
              </button>
            )}
            {cacheInfo && !buscarMutation.isPending && (
              <span className="text-xs text-gray-400 ml-auto">{cacheInfo}</span>
            )}
          </div>
        )}
        {isAdmin && buscarMutation.isPending && (
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
        <div className="card overflow-hidden relative">
          {/* Overlay de carga sobre resultados existentes */}
          {buscarMutation.isPending && (
            <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
              <Loader2 size={28} className="animate-spin text-indigo-500" />
              <p className="text-sm font-semibold text-gray-700">
                {searchSeconds < 5 && 'Buscando licitaciones…'}
                {searchSeconds >= 5 && searchSeconds < 15 && 'Descargando resultados…'}
                {searchSeconds >= 15 && searchSeconds < 40 && 'Procesando bases técnicas…'}
                {searchSeconds >= 40 && '⏳ Casi listo…'}
              </p>
              <div className="w-48 bg-gray-100 rounded-full h-1.5">
                <div
                  className="bg-indigo-500 h-1.5 rounded-full transition-all duration-1000"
                  style={{ width: `${Math.min((searchSeconds / 45) * 100, 92)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400">{searchSeconds}s — puede tardar hasta 45s</p>
            </div>
          )}
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
                onClick={() => buscarMutation.mutate(paginaActual)}
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
                  <th className="px-4 py-3 font-medium">Licitación</th>
                  <th className="px-4 py-3 font-medium">Monto est.</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Rubro</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Región</th>
                  <th className="px-4 py-3 font-medium hidden lg:table-cell">Cierre</th>
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
                        <div className="font-medium text-gray-900 line-clamp-1">{item.nombre}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
                        {formatMonto(item.monto)}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <RubroBadge categoria={item.categoria} rubrosSeleccionados={rubrosSeleccionados} />
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden md:table-cell text-xs">{item.region || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 hidden lg:table-cell text-xs line-clamp-1">
                        {item.fecha_cierre}
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
                        <td colSpan={7} className="bg-gray-50/60 px-4 py-3 border-b border-gray-100">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                            {/* Columna izquierda: info licitación */}
                            <div className="space-y-2 text-xs">
                              <p className="font-mono text-gray-400">{item.codigo}</p>
                              <p className="text-gray-800 font-medium leading-snug">{item.nombre}</p>
                              {item.descripcion && (
                                <p className="text-gray-400 leading-relaxed line-clamp-3">{item.descripcion}</p>
                              )}
                              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-gray-600">
                                <span><span className="text-gray-400">Organismo:</span> {item.organismo}</span>
                                <span><span className="text-gray-400">Estado:</span> {item.estado}</span>
                                <span><span className="text-gray-400">Tipo:</span> {item.tipo || '—'}</span>
                                <span><span className="text-gray-400">Región:</span> {item.region}</span>
                                {item.fecha_adjudicacion && <span><span className="text-gray-400">Adjudicada:</span> {item.fecha_adjudicacion}</span>}
                                {item.fecha_cierre && <span><span className="text-gray-400">Cierre:</span> {item.fecha_cierre}</span>}
                              </div>
                              <div className="flex items-baseline gap-3 pt-1 border-t border-gray-200">
                                <div>
                                  <span className="text-gray-400">Monto est. </span>
                                  <span className="font-bold text-gray-900 text-sm">{formatMonto(item.monto)}</span>
                                </div>
                                {item.monto_adjudicado && item.monto_adjudicado !== item.monto && (
                                  <div>
                                    <span className="text-gray-400">Adj. </span>
                                    <span className="font-bold text-emerald-700 text-sm">{formatMonto(item.monto_adjudicado)}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Columna derecha: acciones */}
                            <div className="flex flex-col justify-between gap-3">
                              {/* Organismo comprador (solo nombre) */}
                              <div className="bg-white rounded-lg border border-gray-100 px-3 py-2.5 flex items-center gap-2 text-xs">
                                <Building2 size={13} className="text-gray-400 shrink-0" />
                                <div>
                                  <span className="text-gray-400">Organismo comprador · </span>
                                  <span className="font-medium text-gray-700">{item.organismo}</span>
                                </div>
                              </div>

                              {/* Botones de acción */}
                              <div className="flex flex-col gap-2">
                                {item.prospect_id ? (
                                  <>
                                    <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                                      <CheckCircle2 size={13} /> Agregada a tus postulaciones
                                    </div>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setMainTab('postulaciones') }}
                                      className="flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 w-full font-medium"
                                    >
                                      <ListChecks size={12} /> Ir a mis postulaciones
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setAnalisisData(null)
                                        setPropuestaTexto(null)
                                        setPropuestaModal({ prospectId: item.prospect_id!, nombre: item.nombre })
                                        analizarMutation.mutate({ prospectId: item.prospect_id! })
                                      }}
                                      className="flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 w-full"
                                    >
                                      <ClipboardList size={12} /> Analizar bases con IA
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); guardarMutation.mutate(item) }}
                                    disabled={savingCodigo === item.codigo}
                                    className="flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 w-full"
                                  >
                                    {savingCodigo === item.codigo ? <Loader2 size={12} className="animate-spin" /> : <BookmarkPlus size={12} />}
                                    Agregar a mis postulaciones
                                  </button>
                                )}
                                <a
                                  href={`https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=${item.codigo}`}
                                  target="_blank" rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 w-full"
                                >
                                  <ExternalLink size={12} /> Ver ficha completa en Mercado Público
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

          {/* Paginación */}
          {totalPaginas > 1 && (
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50 flex-wrap gap-2">
              <span className="text-xs text-gray-500">
                Página <strong>{paginaActual}</strong> de <strong>{totalPaginas}</strong>
                <span className="ml-1 text-gray-400">· {totalResultados.toLocaleString('es-CL')} licitaciones</span>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => buscarMutation.mutate(paginaActual - 1)}
                  disabled={paginaActual <= 1 || buscarMutation.isPending}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ← Anterior
                </button>
                {Array.from({ length: Math.min(totalPaginas, 5) }, (_, i) => {
                  const startPage = Math.max(1, paginaActual - 2)
                  const page = startPage + i
                  if (page > totalPaginas) return null
                  return (
                    <button
                      key={page}
                      onClick={() => buscarMutation.mutate(page)}
                      disabled={buscarMutation.isPending}
                      className={clsx(
                        'text-xs w-8 h-8 rounded-lg border transition-colors disabled:opacity-40',
                        page === paginaActual
                          ? 'bg-brand-500 text-white border-brand-500 font-semibold'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-100'
                      )}
                    >
                      {page}
                    </button>
                  )
                })}
                <button
                  onClick={() => buscarMutation.mutate(paginaActual + 1)}
                  disabled={paginaActual >= totalPaginas || buscarMutation.isPending}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Estado cargando (primera búsqueda, sin resultados previos) */}
      {resultados.length === 0 && buscarMutation.isPending && (
        <div className="card p-12 flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-14 h-14 rounded-full border-4 border-indigo-100 border-t-indigo-500 animate-spin" />
            <Search size={16} className="absolute inset-0 m-auto text-indigo-400" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-semibold text-gray-700">
              {searchSeconds < 5 && 'Conectando con Mercado Público…'}
              {searchSeconds >= 5 && searchSeconds < 15 && 'Descargando licitaciones del período…'}
              {searchSeconds >= 15 && searchSeconds < 35 && 'Obteniendo detalle de cada licitación…'}
              {searchSeconds >= 35 && '⏳ Procesando resultados, ya casi…'}
            </p>
            <p className="text-xs text-gray-400">
              {searchSeconds < 5 ? 'Iniciando búsqueda' : `${searchSeconds}s — este proceso puede tomar hasta 45 segundos`}
            </p>
          </div>
          <div className="w-64 bg-gray-100 rounded-full h-2">
            <div
              className="bg-indigo-500 h-2 rounded-full transition-all duration-1000"
              style={{ width: `${Math.min((searchSeconds / 45) * 100, 92)}%` }}
            />
          </div>
          <div className="flex items-center gap-4 text-[11px] text-gray-400 mt-1">
            <span className={searchSeconds >= 0 ? 'text-indigo-500 font-medium' : ''}>① Conectar</span>
            <span className="text-gray-200">──</span>
            <span className={searchSeconds >= 5 ? 'text-indigo-500 font-medium' : ''}>② Descargar</span>
            <span className="text-gray-200">──</span>
            <span className={searchSeconds >= 15 ? 'text-indigo-500 font-medium' : ''}>③ Procesar</span>
            <span className="text-gray-200">──</span>
            <span className={searchSeconds >= 35 ? 'text-indigo-500 font-medium' : ''}>④ Listo</span>
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

      </>)} {/* fin perfil configurado */}
      </>)} {/* fin mainTab === 'buscar' */}

      {/* Modal: Analizar y Postular */}
      {propuestaModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2">
                <ClipboardList size={18} className="text-indigo-600" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">Análisis IA · Postulación</p>
                  <p className="text-xs text-gray-400 line-clamp-1">{propuestaModal.nombre}</p>
                </div>
              </div>
              <button onClick={() => { setPropuestaModal(null); setAnalisisData(null); setPropuestaTexto(null) }}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">
                <X size={16} />
              </button>
            </div>

            {/* Tabs */}
            {!isAnalyzing && (
              <div className="flex border-b border-gray-100 shrink-0">
                {[
                  { key: 'analisis', label: 'Análisis de fit', icon: BarChart3 },
                  { key: 'propuesta', label: 'Propuesta técnica', icon: FileSignature },
                  { key: 'docs', label: 'Documentos', icon: FileText },
                ].map(tab => (
                  <button key={tab.key}
                    onClick={() => setAnalisisTab(tab.key as any)}
                    className={clsx('flex-1 text-xs font-medium py-2.5 flex items-center justify-center gap-1.5 transition-colors',
                      analisisTab === tab.key ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-400 hover:text-gray-600')}
                  >
                    <tab.icon size={12} /> {tab.label}
                  </button>
                ))}
              </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {isAnalyzing ? (
                <div className="flex flex-col items-center justify-center py-10 gap-4">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full border-4 border-indigo-100 border-t-indigo-500 animate-spin" />
                    <ClipboardList size={18} className="absolute inset-0 m-auto text-indigo-400" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-sm font-semibold text-gray-700">
                      {analysisSeconds < 5 && 'Conectando con Mercado Público…'}
                      {analysisSeconds >= 5 && analysisSeconds < 20 && 'Descargando bases técnicas y PDFs…'}
                      {analysisSeconds >= 20 && analysisSeconds < 45 && 'Claude analizando requisitos vs tu perfil…'}
                      {analysisSeconds >= 45 && '⏳ Casi listo, generando propuesta…'}
                    </p>
                    <p className="text-xs text-gray-400">{analysisSeconds}s — puede tomar hasta 60s</p>
                  </div>
                  <div className="w-56 bg-gray-100 rounded-full h-1.5">
                    <div className="bg-indigo-500 h-1.5 rounded-full transition-all duration-1000"
                      style={{ width: `${Math.min((analysisSeconds / 60) * 100, 90)}%` }} />
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-gray-400">
                    <span className={analysisSeconds >= 0 ? 'text-indigo-500 font-medium' : ''}>① Conectar</span>
                    <span className="text-gray-200">──</span>
                    <span className={analysisSeconds >= 5 ? 'text-indigo-500 font-medium' : ''}>② Descargar</span>
                    <span className="text-gray-200">──</span>
                    <span className={analysisSeconds >= 20 ? 'text-indigo-500 font-medium' : ''}>③ Analizar</span>
                    <span className="text-gray-200">──</span>
                    <span className={analysisSeconds >= 45 ? 'text-indigo-500 font-medium' : ''}>④ Propuesta</span>
                  </div>
                </div>
              ) : analisisData ? (
                <>
                  {/* ── TAB: Análisis de fit ── */}
                  {analisisTab === 'analisis' && (
                    <div className="space-y-4">
                      <div className={clsx(
                        'rounded-xl p-4 flex items-center gap-4',
                        analisisData.nivel === 'alto' ? 'bg-emerald-50 border border-emerald-200' :
                        analisisData.nivel === 'medio' ? 'bg-amber-50 border border-amber-200' :
                        'bg-red-50 border border-red-200'
                      )}>
                        <div className={clsx('text-3xl font-black',
                          analisisData.nivel === 'alto' ? 'text-emerald-600' :
                          analisisData.nivel === 'medio' ? 'text-amber-600' : 'text-red-500'
                        )}>
                          {analisisData.score}<span className="text-sm font-normal">/100</span>
                        </div>
                        <div>
                          <p className={clsx('text-xs font-bold uppercase tracking-wide',
                            analisisData.nivel === 'alto' ? 'text-emerald-600' :
                            analisisData.nivel === 'medio' ? 'text-amber-600' : 'text-red-500'
                          )}>
                            Fit {analisisData.nivel === 'alto' ? 'Alto ✓' : analisisData.nivel === 'medio' ? 'Medio ⚠' : 'Bajo ✗'}
                          </p>
                          <p className="text-xs text-gray-600 mt-0.5">{analisisData.resumen}</p>
                        </div>
                      </div>

                      {analisisData.documentos_analizados?.length > 0 ? (
                        <p className="text-[11px] text-gray-400 flex items-center gap-1">
                          <FileText size={10} /> Bases analizadas: {analisisData.documentos_analizados.join(' · ')}
                        </p>
                      ) : (
                        <p className="text-[11px] text-amber-500 flex items-center gap-1">
                          <AlertTriangle size={10} /> No se encontraron bases técnicas. Análisis basado en rubro.
                        </p>
                      )}

                      {analisisData.requisitos?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-700 mb-2">Requisitos evaluados</p>
                          <div className="space-y-1.5">
                            {analisisData.requisitos.map((req: any, i: number) => (
                              <div key={i} className="flex items-start gap-2 text-xs">
                                {req.cumple === true ? <CheckCircle size={13} className="text-emerald-500 shrink-0 mt-0.5" />
                                  : req.cumple === false ? <XCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
                                  : <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />}
                                <div>
                                  <span className={clsx('font-medium',
                                    req.cumple === true ? 'text-gray-800' : req.cumple === false ? 'text-red-700' : 'text-amber-700'
                                  )}>{req.item}</span>
                                  {req.observacion && <span className="text-gray-400 ml-1">— {req.observacion}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {analisisData.alertas?.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
                          <p className="text-xs font-semibold text-amber-700 flex items-center gap-1"><AlertTriangle size={12} /> Alertas</p>
                          {analisisData.alertas.map((a: string, i: number) => (
                            <p key={i} className="text-xs text-amber-700">• {a}</p>
                          ))}
                        </div>
                      )}

                      <button onClick={() => setAnalisisTab('propuesta')}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">
                        <FileSignature size={14} /> Ver propuesta técnica →
                      </button>
                    </div>
                  )}

                  {/* ── TAB: Propuesta técnica ── */}
                  {analisisTab === 'propuesta' && (
                    <div
                      className="prose prose-sm max-w-none text-gray-800 leading-relaxed"
                      style={{ fontSize: '13px' }}
                    >
                      <ReactMarkdown>{propuestaTexto || 'No se generó propuesta.'}</ReactMarkdown>
                    </div>
                  )}

                  {/* ── TAB: Documentos a preparar ── */}
                  {analisisTab === 'docs' && (
                    <div className="space-y-4 text-xs">
                      <p className="text-gray-500 text-[11px]">Lista de documentos que debes reunir y subir a Mercado Público antes del cierre.</p>

                      {[
                        {
                          grupo: '🏛️ Habilitación legal (siempre)',
                          items: [
                            { label: 'Certificado estado hábil ChileProveedores', url: 'https://www.chileproveedores.cl', tipo: 'Descargar del portal' },
                            { label: 'Declaración jurada simple (no condenas, no conflicto)', url: null, tipo: 'Redactar + firmar' },
                            { label: 'Cédula de identidad representante legal', url: null, tipo: 'Escanear' },
                            { label: 'RUT empresa (SII)', url: 'https://homer.sii.cl/', tipo: 'Descargar del SII' },
                          ]
                        },
                        {
                          grupo: '📋 Oferta técnica',
                          items: [
                            { label: 'Propuesta técnica (generada arriba)', url: null, tipo: 'Copiar/descargar' },
                            { label: 'Metodología de trabajo', url: null, tipo: 'Redactar' },
                            { label: 'Currículum empresa + proyectos similares', url: null, tipo: 'Redactar' },
                            { label: 'CV equipo profesional (si lo exigen las bases)', url: null, tipo: 'Preparar' },
                          ]
                        },
                        {
                          grupo: '💰 Oferta económica',
                          items: [
                            { label: 'Formulario de oferta económica (en MP)', url: 'https://www.mercadopublico.cl', tipo: 'Completar en MP' },
                            { label: 'Garantía de seriedad (boleta bancaria si exigen)', url: null, tipo: 'Solicitar al banco' },
                            { label: 'Detalle de costos / itemizado', url: null, tipo: 'Preparar' },
                          ]
                        },
                        {
                          grupo: '✅ Antes de enviar',
                          items: [
                            { label: 'Revisar que todos los archivos estén en PDF', url: null, tipo: 'Verificar' },
                            { label: 'Confirmar que el nombre de archivos coincide con lo pedido', url: null, tipo: 'Verificar' },
                            { label: 'Subir TODO antes del cierre (hora exacta)', url: 'https://www.mercadopublico.cl', tipo: 'Subir en MP' },
                          ]
                        },
                      ].map((grupo, gi) => (
                        <div key={gi}>
                          <p className="font-semibold text-gray-700 mb-2">{grupo.grupo}</p>
                          <div className="space-y-1.5 pl-1">
                            {grupo.items.map((item, ii) => (
                              <div key={ii} className="flex items-center gap-2">
                                <span className="text-gray-300 shrink-0">☐</span>
                                <span className="flex-1 text-gray-700">{item.label}</span>
                                {item.url ? (
                                  <a href={item.url} target="_blank" rel="noopener noreferrer"
                                    className="text-[10px] text-indigo-500 hover:underline shrink-0 flex items-center gap-0.5">
                                    {item.tipo} <ExternalLink size={8} />
                                  </a>
                                ) : (
                                  <span className="text-[10px] text-gray-400 shrink-0">{item.tipo}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-10 text-gray-400 text-sm">No se pudo generar el análisis.</div>
              )}
            </div>

            {/* Footer */}
            {!isAnalyzing && analisisData && (
              <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2 shrink-0 flex-wrap">
                {analisisTab === 'propuesta' && propuestaTexto && (
                  <>
                    {/* Copiar */}
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(propuestaTexto)
                        setPropuestaCopied(true)
                        setTimeout(() => setPropuestaCopied(false), 2000)
                      }}
                      className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
                    >
                      {propuestaCopied ? <><Check size={12} className="text-green-500" /> Copiado</> : <><Copy size={12} /> Copiar</>}
                    </button>
                    {/* Descargar .txt */}
                    <button
                      onClick={() => {
                        const blob = new Blob([propuestaTexto], { type: 'text/plain' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = `propuesta_${propuestaModal.nombre?.slice(0, 40).replace(/[^a-zA-Z0-9]/g, '_') || 'licitacion'}.txt`
                        a.click()
                        URL.revokeObjectURL(url)
                      }}
                      className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
                    >
                      <Download size={12} /> Descargar
                    </button>
                    {/* Enviar WhatsApp */}
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(`📋 *Propuesta técnica: ${propuestaModal.nombre}*\n\n${propuestaTexto.slice(0, 1000)}...\n\n_Generada con Kapturo_`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-green-500 text-white hover:bg-green-600"
                    >
                      <span className="text-sm leading-none">💬</span> WhatsApp
                    </a>
                  </>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => {
                      setAnalisisData(null)
                      setPropuestaTexto(null)
                      analizarMutation.mutate({ prospectId: propuestaModal.prospectId })
                    }}
                    className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    <Wand2 size={12} /> Regenerar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal perfil empresa */}
      {showPerfilModal && (
        <PerfilEmpresaModal
          onClose={() => setShowPerfilModal(false)}
          catalogo={catalogo}
        />
      )}
    </div>
  )
}
// ── Configuración de estados ─────────────────────────────────────────────────

const ESTADOS_CONFIG: Record<string, { label: string; color: string; icon: any; next?: string }> = {
  en_preparacion: { label: 'En preparación', color: 'bg-blue-100 text-blue-700 border-blue-200',   icon: Clock,        next: 'postulada' },
  postulada:      { label: 'Postulada',       color: 'bg-indigo-100 text-indigo-700 border-indigo-200', icon: Flag,      next: 'evaluando' },
  evaluando:      { label: 'Evaluando',        color: 'bg-amber-100 text-amber-700 border-amber-200',  icon: Loader2,    next: 'ganada' },
  ganada:         { label: '🎉 Ganada',        color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: Trophy, next: undefined },
  perdida:        { label: 'Perdida',          color: 'bg-red-100 text-red-600 border-red-200',      icon: XCircle,    next: undefined },
}

const KANBAN_COLS = [
  { key: 'en_preparacion', label: 'En preparación', icon: Clock,   bg: 'bg-blue-50',    border: 'border-blue-200' },
  { key: 'postulada',      label: 'Postulada',       icon: Flag,    bg: 'bg-indigo-50',  border: 'border-indigo-200' },
  { key: 'evaluando',      label: 'Evaluando',       icon: Loader2, bg: 'bg-amber-50',   border: 'border-amber-200' },
  { key: 'ganada',         label: 'Ganadas 🎉',       icon: Trophy,  bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { key: 'perdida',        label: 'Perdidas',        icon: XCircle, bg: 'bg-red-50',     border: 'border-red-200' },
]

// ── Componente PostulacionesPanel ────────────────────────────────────────────

interface ProspectoLicit {
  id: string
  licitacion_nombre?: string
  licitacion_codigo?: string
  licitacion_organismo?: string
  licitacion_monto?: number
  licitacion_fecha_cierre?: string
  licitacion_region?: string
  company_name?: string
  score?: number
  postulacion_estado?: string
  notes?: string
  created_at?: string
}

function PostulacionesPanel({
  prospectos,
  loading,
  highlightId,
  onHighlightClear,
  onAnalizar,
  onCambiarEstado,
  updatingId,
  onEliminar,
  onRefresh,
}: {
  prospectos: ProspectoLicit[]
  loading: boolean
  highlightId?: string | null
  onHighlightClear?: () => void
  onAnalizar: (p: ProspectoLicit) => void
  onCambiarEstado: (id: string, estado: string) => void
  updatingId: string | null
  onEliminar: (id: string) => void
  onRefresh: () => void
}) {
  const queryClient = useQueryClient()
  const [vistaKanban, setVistaKanban] = useState(false)
  const [estadoDropdown, setEstadoDropdown] = useState<string | null>(null)
  const [filtroEstado, setFiltroEstado] = useState<string>('todos')
  const [busquedaLocal, setBusquedaLocal] = useState('')
  const highlightRef = useRef<HTMLDivElement>(null)

  // Scroll al item destacado cuando llega — con retry para esperar el render
  useEffect(() => {
    if (!highlightId) return
    let attempts = 0
    const tryScroll = () => {
      if (highlightRef.current) {
        highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
        const t = setTimeout(() => onHighlightClear?.(), 3000)
        return () => clearTimeout(t)
      }
      if (attempts++ < 10) setTimeout(tryScroll, 150)
    }
    tryScroll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId])

  const notasMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      api.patch(`/modules/licitaciones/prospectos/${id}/notas`, { notes }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['licitaciones-postulaciones'] }),
  })

  const prospectosFiltrados = prospectos.filter(p => {
    const matchEstado = filtroEstado === 'todos' ? true
      : filtroEstado === 'sin_estado' ? !p.postulacion_estado
      : p.postulacion_estado === filtroEstado
    const matchBusqueda = !busquedaLocal || (p.licitacion_nombre || p.company_name || '').toLowerCase().includes(busquedaLocal.toLowerCase())
    return matchEstado && matchBusqueda
  })

  const sinEstado = prospectosFiltrados.filter(p => !p.postulacion_estado)
  const conEstado = prospectosFiltrados.filter(p => !!p.postulacion_estado)

  if (loading) return (
    <div className="card p-10 text-center text-gray-400">
      <Loader2 size={28} className="animate-spin mx-auto mb-2 text-indigo-400" />
      <p className="text-sm">Cargando postulaciones…</p>
    </div>
  )

  if (prospectos.length === 0) return (
    <div className="space-y-4">
      <div className="rounded-xl bg-indigo-50 border border-indigo-100 px-5 py-4 flex gap-4 items-start">
        <div className="text-2xl mt-0.5">📋</div>
        <div>
          <p className="text-sm font-semibold text-indigo-800 mb-0.5">¿Para qué sirve este panel?</p>
          <p className="text-xs text-indigo-600 leading-relaxed">
            Haz seguimiento de las licitaciones en las que tu empresa está participando.
            Guarda oportunidades desde la búsqueda, analiza las bases con IA, genera propuestas
            y avanza su estado:{' '}
            <span className="font-medium">En preparación → Postulada → Evaluando → Ganada</span>.
          </p>
        </div>
      </div>
      <div className="card p-10 text-center text-gray-400">
        <ListChecks size={36} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium mb-1">Sin postulaciones aún</p>
        <p className="text-xs text-gray-400">Ve a <span className="font-medium text-indigo-500">Buscar licitaciones</span>, encuentra una oportunidad y haz clic en <span className="font-medium text-indigo-500">Agregar a mis postulaciones</span>.</p>
      </div>
    </div>
  )

  // Compute urgency alerts
  const urgentes = prospectos.filter(p => {
    if (!p.licitacion_fecha_cierre) return false
    const raw = p.licitacion_fecha_cierre
    let fecha: Date | null = null
    const ddmm = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
    if (ddmm) fecha = new Date(Number(ddmm[3]), Number(ddmm[2]) - 1, Number(ddmm[1]))
    else { const d = new Date(raw); if (!isNaN(d.getTime())) fecha = d }
    if (!fecha) return false
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const dias = Math.ceil((fecha.getTime() - today.getTime()) / 86400000)
    return dias >= 0 && dias <= 3
  })

  return (
    <div className="space-y-4">
      {/* Intro banner */}
      <div className="rounded-xl bg-indigo-50 border border-indigo-100 px-5 py-4 flex gap-4 items-start">
        <div className="text-2xl mt-0.5">📋</div>
        <div>
          <p className="text-sm font-semibold text-indigo-800 mb-0.5">Seguimiento de postulaciones</p>
          <p className="text-xs text-indigo-600 leading-relaxed">
            Analiza las bases técnicas con IA, genera propuestas y avanza el estado de cada licitación:{' '}
            <span className="font-medium">En preparación → Postulada → Evaluando → Ganada</span>.
          </p>
        </div>
      </div>

      {/* Alerta de cierre urgente */}
      {urgentes.length > 0 && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <span className="text-base mt-0.5">⚠️</span>
          <div>
            <span className="font-semibold">{urgentes.length} licitación{urgentes.length > 1 ? 'es cierran' : ' cierra'} en ≤3 días:</span>{' '}
            {urgentes.map(u => u.licitacion_nombre || u.company_name).join(', ')}
          </div>
        </div>
      )}

      {/* Métricas */}
      {(() => {
        const ganadas = prospectos.filter(p => p.postulacion_estado === 'ganada').length
        const perdidas = prospectos.filter(p => p.postulacion_estado === 'perdida').length
        const terminadas = ganadas + perdidas
        const winRate = terminadas > 0 ? Math.round(ganadas / terminadas * 100) : null
        const montoTotal = prospectos.reduce((sum, p) => sum + (p.licitacion_monto || 0), 0)
        const enCurso = prospectos.filter(p => ['en_preparacion', 'postulada', 'evaluando'].includes(p.postulacion_estado || '')).length
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card p-3 text-center">
              <p className="text-2xl font-bold text-gray-900">{prospectos.length}</p>
              <p className="text-xs text-gray-500 mt-0.5">Total guardadas</p>
            </div>
            <div className="card p-3 text-center">
              <p className="text-2xl font-bold text-indigo-600">{enCurso}</p>
              <p className="text-xs text-gray-500 mt-0.5">En proceso</p>
            </div>
            <div className="card p-3 text-center">
              <p className={clsx('text-2xl font-bold', winRate != null ? (winRate >= 50 ? 'text-emerald-600' : 'text-amber-600') : 'text-gray-300')}>
                {winRate != null ? `${winRate}%` : '—'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Win rate</p>
              {terminadas > 0 && <p className="text-[10px] text-gray-400">{ganadas}/{terminadas} resueltas</p>}
            </div>
            <div className="card p-3 text-center">
              <p className="text-lg font-bold text-gray-900 leading-tight">
                {montoTotal > 0
                  ? new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', notation: 'compact' as const, maximumFractionDigits: 1 }).format(montoTotal)
                  : '—'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Monto total</p>
            </div>
          </div>
        )
      })()}

      {/* Header del panel */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-700">{prospectos.length} licitaciones guardadas</p>
          <p className="text-xs text-gray-400">{prospectosFiltrados.length !== prospectos.length ? `${prospectosFiltrados.length} visibles · ` : ''}{conEstado.length + sinEstado.length > 0 ? `${prospectos.filter(p=>!!p.postulacion_estado).length} con estado · ${prospectos.filter(p=>!p.postulacion_estado).length} sin estado` : ''}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Buscador */}
          <div className="relative">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              value={busquedaLocal}
              onChange={e => setBusquedaLocal(e.target.value)}
              placeholder="Buscar…"
              className="pl-6 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-300 w-36"
            />
          </div>
          {/* Filtro estado */}
          <select
            value={filtroEstado}
            onChange={e => setFiltroEstado(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300 bg-white"
          >
            <option value="todos">Todos los estados</option>
            <option value="sin_estado">Sin estado</option>
            <option value="en_preparacion">En preparación</option>
            <option value="postulada">Postulada</option>
            <option value="evaluando">Evaluando</option>
            <option value="ganada">Ganada</option>
            <option value="perdida">Perdida</option>
          </select>
          <button onClick={onRefresh} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
            <RefreshCw size={11} /> Actualizar
          </button>
          <button
            onClick={() => setVistaKanban(v => !v)}
            className={clsx('flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors',
              vistaKanban ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            )}
          >
            <SlidersHorizontal size={11} /> {vistaKanban ? 'Lista' : 'Kanban'}
          </button>
        </div>
      </div>

      {/* Sin resultados del filtro */}
      {prospectosFiltrados.length === 0 && (
        <div className="card p-8 text-center text-gray-400">
          <p className="text-sm">No hay licitaciones con ese filtro.</p>
          <button onClick={() => { setFiltroEstado('todos'); setBusquedaLocal('') }} className="text-xs text-indigo-500 mt-1 hover:underline">Limpiar filtros</button>
        </div>
      )}

      {/* Sin estado asignado */}
      {sinEstado.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <Clock size={13} className="text-gray-400" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sin estado ({sinEstado.length})</span>
          </div>
          <div className="divide-y divide-gray-50">
            {sinEstado.map(p => (
              <PostulacionCard
                key={p.id}
                p={p}
                highlight={p.id === highlightId}
                highlightRef={p.id === highlightId ? highlightRef : undefined}
                onAnalizar={onAnalizar}
                onCambiarEstado={onCambiarEstado}
                updatingId={updatingId}
                estadoDropdown={estadoDropdown}
                setEstadoDropdown={setEstadoDropdown}
                onGuardarNotas={(id, notes) => notasMutation.mutate({ id, notes })}
                onEliminar={onEliminar}
              />
            ))}
          </div>
        </div>
      )}

      {/* Vista Kanban */}
      {vistaKanban ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {KANBAN_COLS.map(col => {
            const items = prospectosFiltrados.filter(p => p.postulacion_estado === col.key)
            return (
              <div key={col.key} className={clsx('rounded-xl border p-3 space-y-2', col.bg, col.border)}>
                <div className="flex items-center gap-1.5">
                  <col.icon size={12} className="text-gray-500" />
                  <span className="text-xs font-semibold text-gray-600">{col.label}</span>
                  <span className="ml-auto text-xs text-gray-400 font-bold">{items.length}</span>
                </div>
                {items.length === 0 && (
                  <p className="text-[11px] text-gray-400 text-center py-2">vacío</p>
                )}
                {items.map(p => (
                  <div key={p.id} className="bg-white rounded-lg p-2.5 border border-gray-100 shadow-sm space-y-1.5">
                    <p className="text-xs font-medium text-gray-800 line-clamp-2 leading-snug">
                      {p.licitacion_nombre || p.company_name}
                    </p>
                    <p className="text-[10px] text-gray-400 truncate">{p.licitacion_organismo}</p>
                    {p.licitacion_monto && (
                      <p className="text-[10px] font-semibold text-gray-700">
                        {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(p.licitacion_monto)}
                      </p>
                    )}
                    <div className="flex gap-1 pt-0.5">
                      <button
                        onClick={() => onAnalizar(p)}
                        className="flex-1 text-[10px] py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 text-center"
                      >
                        Analizar
                      </button>
                      <div className="relative">
                        <button
                          onClick={() => setEstadoDropdown(estadoDropdown === p.id ? null : p.id)}
                          className="text-[10px] px-1.5 py-1 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50"
                        >
                          ···
                        </button>
                        {estadoDropdown === p.id && (
                          <EstadoMenu
                            onSelect={(e) => { onCambiarEstado(p.id, e); setEstadoDropdown(null) }}
                            onClose={() => setEstadoDropdown(null)}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      ) : (
        /* Vista lista por estado */
        KANBAN_COLS.filter(col => prospectos.some(p => p.postulacion_estado === col.key)).map(col => {
          const items = prospectos.filter(p => p.postulacion_estado === col.key)
          return (
            <div key={col.key} className="card overflow-hidden">
              <div className={clsx('px-4 py-2.5 border-b border-gray-100 flex items-center gap-2', col.bg)}>
                <col.icon size={13} className="text-gray-500" />
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{col.label} ({items.length})</span>
              </div>
              <div className="divide-y divide-gray-50">
                {items.map(p => (
                  <PostulacionCard
                    key={p.id}
                    p={p}
                    highlight={p.id === highlightId}
                    highlightRef={p.id === highlightId ? highlightRef : undefined}
                    onAnalizar={onAnalizar}
                    onCambiarEstado={onCambiarEstado}
                    updatingId={updatingId}
                    estadoDropdown={estadoDropdown}
                    setEstadoDropdown={setEstadoDropdown}
                    onGuardarNotas={(id, notes) => notasMutation.mutate({ id, notes })}
                    onEliminar={onEliminar}
                  />
                ))}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

// ── Menú de estados ───────────────────────────────────────────────────────────

function EstadoMenu({ onSelect, onClose }: { onSelect: (e: string) => void; onClose: () => void }) {
  return (
    <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-xl py-1 min-w-[170px]">
      {Object.entries(ESTADOS_CONFIG).map(([key, cfg]) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
        >
          <cfg.icon size={11} />
          {cfg.label}
        </button>
      ))}
      <div className="border-t border-gray-100 mt-1 pt-1">
        <button
          onClick={() => onSelect('')}
          className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:bg-gray-50"
        >
          <X size={11} /> Quitar estado
        </button>
      </div>
    </div>
  )
}

// ── Tarjeta de postulación ────────────────────────────────────────────────────

function PostulacionCard({
  p, highlight, highlightRef, onAnalizar, onCambiarEstado, updatingId, estadoDropdown, setEstadoDropdown, onGuardarNotas, onEliminar
}: {
  p: ProspectoLicit
  highlight?: boolean
  highlightRef?: React.RefObject<HTMLDivElement>
  onAnalizar: (p: ProspectoLicit) => void
  onCambiarEstado: (id: string, estado: string) => void
  updatingId: string | null
  estadoDropdown: string | null
  setEstadoDropdown: (id: string | null) => void
  onGuardarNotas: (id: string, notes: string) => void
  onEliminar: (id: string) => void
}) {
  const [showChecklist, setShowChecklist] = useState(false)
  const [showNotas, setShowNotas] = useState(false)
  const [notasText, setNotasText] = useState(p.notes || '')
  const [notasSaved, setNotasSaved] = useState(false)
  const notasTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const estado = p.postulacion_estado ? ESTADOS_CONFIG[p.postulacion_estado] : null
  const monto = p.licitacion_monto
    ? new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(p.licitacion_monto)
    : null

  // Compute days until close
  let diasCierre: number | null = null
  if (p.licitacion_fecha_cierre) {
    const raw = p.licitacion_fecha_cierre
    let fecha: Date | null = null
    const ddmm = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
    if (ddmm) fecha = new Date(Number(ddmm[3]), Number(ddmm[2]) - 1, Number(ddmm[1]))
    else { const d = new Date(raw); if (!isNaN(d.getTime())) fecha = d }
    if (fecha) {
      const today = new Date(); today.setHours(0, 0, 0, 0)
      diasCierre = Math.ceil((fecha.getTime() - today.getTime()) / 86400000)
    }
  }
  const cierreColor = diasCierre != null && diasCierre >= 0
    ? diasCierre <= 3 ? 'bg-red-100 text-red-700 border-red-200'
    : diasCierre <= 7 ? 'bg-amber-100 text-amber-700 border-amber-200'
    : null
    : null

  const mpUrl = p.licitacion_codigo
    ? `https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=${p.licitacion_codigo}`
    : null

  return (
    <div ref={highlightRef} className={clsx('border-b border-gray-100 last:border-0 transition-colors', highlight && 'bg-indigo-50/60 ring-1 ring-inset ring-indigo-200')}>
      {/* Fila principal */}
      <div className="px-4 py-3 hover:bg-gray-50/60 transition-colors">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 flex-wrap">
              <p className="text-sm font-medium text-gray-900 line-clamp-1 flex-1">
                {p.licitacion_nombre || p.company_name}
              </p>
              {cierreColor && diasCierre != null && (
                <span className={clsx('inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0', cierreColor)}>
                  ⏰ {diasCierre === 0 ? 'Cierra hoy' : diasCierre === 1 ? 'Cierra mañana' : `Cierra en ${diasCierre}d`}
                </span>
              )}
              {estado && (
                <span className={clsx('inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0', estado.color)}>
                  <estado.icon size={9} />
                  {estado.label}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
              {p.licitacion_organismo && <span>{p.licitacion_organismo}</span>}
              {monto && <span className="font-semibold text-gray-700">{monto}</span>}
              {p.licitacion_fecha_cierre && <span>Cierre: {p.licitacion_fecha_cierre}</span>}
              {p.licitacion_codigo && <span className="font-mono">{p.licitacion_codigo}</span>}
              {p.score != null && p.score > 0 && (
                <span className={clsx(
                  'font-bold px-1.5 py-0.5 rounded-full',
                  p.score >= 75 ? 'bg-emerald-100 text-emerald-700' :
                  p.score >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'
                )}>
                  {p.score.toFixed(0)} pts
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {mpUrl && (
              <a
                href={mpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 font-semibold"
              >
                <ExternalLink size={11} /> Postular en MP
              </a>
            )}
            <NavLink
              to={`/propuestas/licitaciones?prospect_id=${p.id}&nombre=${encodeURIComponent(p.licitacion_nombre || p.company_name || '')}`}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 font-semibold"
            >
              <FileSignature size={11} /> Docs
            </NavLink>
            <button
              onClick={() => onAnalizar(p)}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
            >
              <ClipboardList size={11} /> Analizar
            </button>
            <div className="relative">
              <button
                onClick={() => setEstadoDropdown(estadoDropdown === p.id ? null : p.id)}
                disabled={updatingId === p.id}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                {updatingId === p.id
                  ? <Loader2 size={11} className="animate-spin" />
                  : <><Flag size={11} /> Estado</>}
              </button>
              {estadoDropdown === p.id && (
                <EstadoMenu
                  onSelect={(e) => { onCambiarEstado(p.id, e); setEstadoDropdown(null) }}
                  onClose={() => setEstadoDropdown(null)}
                />
              )}
            </div>
            <button
              onClick={() => setShowNotas(v => !v)}
              className={clsx(
                'flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border transition-colors',
                notasText ? 'border-indigo-200 bg-indigo-50 text-indigo-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              )}
              title="Notas de esta postulación"
            >
              <FileText size={11} /> {notasText ? 'Nota ✓' : 'Nota'}
            </button>
            <button
              onClick={() => setShowChecklist(v => !v)}
              className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
              title="Ver requisitos para postular"
            >
              {showChecklist ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            <button
              onClick={() => {
                if (confirm('¿Eliminar esta postulación? No se puede deshacer.')) {
                  onEliminar(p.id)
                }
              }}
              className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border border-red-100 text-red-400 hover:bg-red-50 hover:border-red-300"
              title="Eliminar postulación"
            >
              <Trash2 size={11} />
            </button>
          </div>
        </div>
      </div>

      {showNotas && (
        <div className="mx-4 mb-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
          <p className="text-[11px] font-semibold text-indigo-600 mb-2 flex items-center gap-1">
            <FileText size={10} /> Notas de esta postulación
          </p>
          <textarea
            value={notasText}
            onChange={e => {
              setNotasText(e.target.value)
              setNotasSaved(false)
              if (notasTimer.current) clearTimeout(notasTimer.current)
              notasTimer.current = setTimeout(() => {
                onGuardarNotas(p.id, e.target.value)
                setNotasSaved(true)
              }, 1000)
            }}
            placeholder="Ej: Enviamos consulta el lunes 21. Exigen garantía de 3%. Contacto: María González 9-1234567..."
            rows={3}
            className="w-full text-xs rounded-lg border border-indigo-200 bg-white px-3 py-2 text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none"
          />
          <p className="text-[10px] text-gray-400 mt-1 text-right">
            {notasSaved ? '✓ Guardado' : notasText ? 'Guardando...' : 'Se guarda automáticamente'}
          </p>
        </div>
      )}

      {/* Checklist colapsable */}
      {showChecklist && (
        <div className="mx-4 mb-3 rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Requisitos legales previos */}
            <div>
              <p className="font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                🏛️ Habilitación legal previa
                <span className="text-[10px] font-normal text-gray-400">(obligatorio para TODAS las licitaciones)</span>
              </p>
              <ul className="space-y-1.5">
                {[
                  { label: 'Inscrito en Mercado Público (mercadopublico.cl)', url: 'https://proveedor.mercadopublico.cl/registrarme' },
                  { label: 'Estado HÁBIL en ChileProveedores', url: 'https://www.chileproveedores.cl' },
                  { label: 'Sin deudas SII (impuestos al día)', url: 'https://homer.sii.cl/' },
                  { label: 'Sin deudas previsionales (AFP/IPS)', url: 'https://www.previred.com' },
                  { label: 'Representante legal con poderes vigentes', url: null },
                  { label: 'Sin condenas por corrupción o lavado de activos', url: null },
                ].map((req, i) => (
                  <li key={i} className="flex items-start gap-2 text-gray-600">
                    <span className="mt-0.5 text-gray-300 shrink-0">☐</span>
                    {req.url ? (
                      <a href={req.url} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600 hover:underline flex-1">
                        {req.label} <ExternalLink size={9} className="inline mb-0.5" />
                      </a>
                    ) : (
                      <span className="flex-1">{req.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {/* Requisitos para esta licitación */}
            <div>
              <p className="font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                📋 Para esta postulación
              </p>
              <ul className="space-y-1.5">
                {[
                  { label: 'Leer bases técnicas y administrativas completas' },
                  { label: 'Preparar oferta técnica (responde punto a punto las bases)' },
                  { label: 'Garantía de seriedad de la oferta (boleta bancaria si la exigen)' },
                  { label: 'Declaración jurada de no conflicto de interés' },
                  { label: 'Acreditar experiencia previa (contratos, certificados)' },
                  { label: 'Certificaciones técnicas requeridas por las bases' },
                  { label: `Subir oferta ANTES del cierre${p.licitacion_fecha_cierre ? `: ${p.licitacion_fecha_cierre}` : ''}` },
                ].map((req, i) => (
                  <li key={i} className="flex items-start gap-2 text-gray-600">
                    <span className="mt-0.5 text-gray-300 shrink-0">☐</span>
                    <span className="flex-1">{req.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* CTA directo al portal */}
          {mpUrl && (
            <div className="pt-3 border-t border-gray-200">
              <a
                href={mpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
              >
                <ExternalLink size={14} />
                Ir a postular en Mercado Público →
              </a>
              <p className="text-[10px] text-gray-400 text-center mt-1.5">
                Se abre la ficha oficial de la licitación donde debes subir tu oferta
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}