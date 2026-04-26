/**
 * Página dedicada al Perfil de Empresa para IA de Licitaciones.
 * Ruta: /licitaciones/perfil
 */
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import StepFeedback from '../../components/ui/StepFeedback'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Sparkles, CheckCircle2, AlertCircle, Loader2, X, ArrowRight,
  Building2, MapPin, Users, Award, Wand2, ChevronDown, ChevronUp, Trash2,
  FileText, Upload, Download, FilePlus, Search, Check, Plus,
} from 'lucide-react'
import api from '../../api/client'
import toast from 'react-hot-toast'
import clsx from 'clsx'

// Reutilizamos las mismas constantes de LicitacionesPage
const RUBRO_CATEGORIAS = [
  { label: 'Consultoría y Gestión',          rubros: ['asesoría', 'auditoría', 'consultoría', 'contabilidad', 'gestión', 'legal', 'recursos humanos', 'administración', 'finanzas', 'marketing', 'comunicaciones', 'relaciones públicas', 'estrategia', 'planificación'] },
  { label: 'Construcción e Infraestructura', rubros: ['arquitectura', 'construcción', 'ingeniería', 'instalaciones eléctricas', 'obras civiles', 'pavimentación', 'sanitaria', 'topografía', 'diseño', 'proyectos', 'infraestructura', 'urbanismo', 'remodelación'] },
  { label: 'Educación y Capacitación',       rubros: ['capacitación', 'consultoría educativa', 'e-learning', 'educación', 'formación', 'entrenamiento', 'coaching', 'talleres', 'cursos', 'certificación profesional'] },
  { label: 'Equipamiento y Suministros',     rubros: ['equipamiento', 'insumos', 'maquinaria', 'mobiliario', 'vehículos', 'vestuario', 'materiales', 'herramientas', 'repuestos', 'suministros', 'imprenta', 'señalética', 'uniformes'] },
  { label: 'Medio Ambiente',                 rubros: ['agua', 'energía renovable', 'medioambiente', 'residuos', 'sustentabilidad', 'eficiencia energética', 'solar', 'reciclaje', 'tratamiento de agua', 'impacto ambiental'] },
  { label: 'Salud y Bienestar',              rubros: ['enfermería', 'equipos médicos', 'farmacia', 'laboratorio', 'medicina', 'psicología', 'salud', 'dental', 'kinesiología', 'nutrición', 'salud ocupacional', 'bienestar', 'telemedicina'] },
  { label: 'Servicios Generales',            rubros: ['alimentación', 'aseo', 'catering', 'logística', 'mantención', 'seguridad', 'transporte', 'vigilancia', 'jardinería', 'lavandería', 'courier', 'bodegaje', 'casino', 'limpieza'] },
  { label: 'Tecnología e Informática',       rubros: ['ciberseguridad', 'informática', 'inteligencia artificial', 'software', 'soporte técnico', 'tecnología', 'telecomunicaciones', 'desarrollo web', 'aplicaciones', 'cloud', 'datos', 'redes', 'sistemas', 'automatización', 'erp', 'crm'] },
]

const CAMPOS_COMPLETITUD = [
  { key: 'rut_empresa',          label: 'RUT empresa',           critical: true,  grupo: 'empresa'   },
  { key: 'razon_social',         label: 'Razón social',          critical: true,  grupo: 'empresa'   },
  { key: 'rubros',               label: 'Rubros',                critical: true,  grupo: 'rubros'    },
  { key: 'regiones',             label: 'Regiones',              critical: true,  grupo: 'rubros'    },
  { key: 'descripcion',          label: 'Descripción empresa',   critical: true,  grupo: 'que_hace'  },
  { key: 'nombre_contacto',      label: 'Nombre del firmante',   critical: true,  grupo: 'contacto'  },
  { key: 'cargo_contacto',       label: 'Cargo del firmante',    critical: false, grupo: 'contacto'  },
  { key: 'correo',               label: 'Correo electrónico',    critical: false, grupo: 'contacto'  },
  { key: 'telefono',             label: 'Teléfono',              critical: false, grupo: 'contacto'  },
  { key: 'proyectos_anteriores', label: 'Proyectos anteriores',  critical: false, grupo: 'que_hace'  },
  { key: 'equipo_tecnico',       label: 'Equipo técnico',        critical: false, grupo: 'equipo'    },
  { key: 'certificaciones',      label: 'Certificaciones',       critical: false, grupo: 'que_hace'  },
]

const DOCS_TIPOS = [
  { key: 'cv_empresa',          label: 'CV de empresa',             desc: 'Presentación institucional — se adjunta en cada postulación', requerido: true  },
  { key: 'certificaciones_pdf', label: 'Certificados (ISO, etc.)',  desc: 'ISO 9001, 14001, OHSAS 18001, ChileValora u otros',           requerido: false },
  { key: 'declaracion_jurada',  label: 'Declaración jurada',        desc: 'Sin deudas tributarias, sin inhabilidades',                   requerido: false },
]

function apiError(err: any, fallback: string) {
  return err?.response?.data?.detail ?? fallback
}

export default function PerfilIAPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: perfilRemoto, isLoading } = useQuery({
    queryKey: ['licitaciones-profile'],
    queryFn: () => api.get('/tenant/me/licitaciones-profile').then(r => r.data).catch(() => null),
    staleTime: 0,
  })

  const { data: catalogo } = useQuery({
    queryKey: ['licitaciones-catalogos'],
    queryFn: () => api.get('/modules/licitaciones/catalogos').then(r => r.data).catch(() => null),
    staleTime: 60 * 60 * 1000,
  })

  const [form, setForm] = useState({
    rut_empresa: '', razon_social: '', descripcion: '', experiencia_anos: '',
    proyectos_anteriores: '', certificaciones: '', diferenciadores: '',
    inscrito_chile_proveedores: false,
    rubros: [] as string[], regiones: [] as string[],
    email_alertas: '',
    nombre_contacto: '', cargo_contacto: '', telefono: '', correo: '', sitio_web: '', direccion: '',
    equipo_tecnico: '', metodologia_trabajo: '',
  })
  const syncedRef = useRef(false)

  useEffect(() => {
    if (!perfilRemoto || syncedRef.current) return
    syncedRef.current = true
    const rubrosGuardados: string[] = (perfilRemoto.rubros || []).map((r: string) => r.toLowerCase().trim())
    // Abrir automáticamente las categorías que ya tienen rubros seleccionados
    setOpenCats(new Set(
      RUBRO_CATEGORIAS.filter(cat => cat.rubros.some(r => rubrosGuardados.includes(r))).map(c => c.label)
    ))
    // Auto-switch tab to first category with saved rubros
    const firstCatWithRubros = RUBRO_CATEGORIAS.find(cat => cat.rubros.some(r => rubrosGuardados.includes(r)))
    if (firstCatWithRubros) setTabCat(firstCatWithRubros.label)
    setForm({
      rut_empresa: perfilRemoto.rut_empresa || '',
      razon_social: perfilRemoto.razon_social || '',
      descripcion: perfilRemoto.descripcion || '',
      experiencia_anos: perfilRemoto.experiencia_anos != null ? String(perfilRemoto.experiencia_anos) : '',
      proyectos_anteriores: perfilRemoto.proyectos_anteriores || '',
      certificaciones: perfilRemoto.certificaciones || '',
      diferenciadores: perfilRemoto.diferenciadores || '',
      inscrito_chile_proveedores: perfilRemoto.inscrito_chile_proveedores || false,
      rubros: ((perfilRemoto.rubros as string[]) || []).map((r: string) => r.toLowerCase().trim()),
      regiones: (perfilRemoto.regiones as string[]) || [],
      email_alertas: perfilRemoto.email_alertas || '',
      nombre_contacto: perfilRemoto.nombre_contacto || '',
      cargo_contacto: perfilRemoto.cargo_contacto || '',
      telefono: perfilRemoto.telefono || '',
      correo: perfilRemoto.correo || '',
      sitio_web: perfilRemoto.sitio_web || '',
      direccion: perfilRemoto.direccion || '',
      equipo_tecnico: perfilRemoto.equipo_tecnico || '',
      metodologia_trabajo: perfilRemoto.metodologia_trabajo || '',
    })
    // Cargar metadatos de documentos
    if (perfilRemoto.documentos && typeof perfilRemoto.documentos === 'object') {
      setDocsMeta(perfilRemoto.documentos)
    }
  }, [perfilRemoto])

  const [generando, setGenerando] = useState<string | null>(null)
  const [regionQuery, setRegionQuery] = useState('')
  const [activeSection, setActiveSection] = useState<string>('empresa')
  // Documentos: metadatos de los archivos subidos (sin base64, eso viene del backend)
  const [docsMeta, setDocsMeta] = useState<Record<string, { nombre: string; size: number; subido_at: string }>>({})
  const [subiendo, setSubiendo] = useState<string | null>(null)

  useEffect(() => {
    // Esperar a que el DOM esté listo antes de observar
    const timer = setTimeout(() => {
      const sections = document.querySelectorAll('[data-perfil-section]')
      if (!sections.length) return

      // Buscar el contenedor scrollable (el <main> del layout)
      let scrollRoot: Element | null = null
      sections.forEach(s => {
        let p = s.parentElement
        while (p && p !== document.body) {
          const ov = window.getComputedStyle(p).overflowY
          if (ov === 'auto' || ov === 'scroll' || ov === 'overlay') { scrollRoot = p; return }
          p = p.parentElement
        }
      })

      const observer = new IntersectionObserver(
        (entries) => {
          // Tomar la sección más alta visible
          const visible = entries.filter(e => e.isIntersecting)
          if (visible.length) {
            const top = visible.reduce((a, b) =>
              a.boundingClientRect.top < b.boundingClientRect.top ? a : b
            )
            setActiveSection(top.target.id)
          }
        },
        { root: scrollRoot, rootMargin: '-5% 0px -50% 0px', threshold: 0 }
      )
      sections.forEach(s => observer.observe(s))
      return () => observer.disconnect()
    }, 300)
    return () => clearTimeout(timer)
  }, [])

  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    setActiveSection(id)

    // Buscar contenedor scrollable
    let parent = el.parentElement
    while (parent && parent !== document.body) {
      const ov = window.getComputedStyle(parent).overflowY
      if (ov === 'auto' || ov === 'scroll' || ov === 'overlay') {
        const offset = el.getBoundingClientRect().top - parent.getBoundingClientRect().top + parent.scrollTop - 80
        parent.scrollTo({ top: offset, behavior: 'smooth' })
        return
      }
      parent = parent.parentElement
    }
    // Fallback: window scroll
    const y = el.getBoundingClientRect().top + window.scrollY - 80
    window.scrollTo({ top: y, behavior: 'smooth' })
  }
  // Estado de acordeón para categorías de rubros — DEBE estar aquí (no dentro del .map)
  const [openCats, setOpenCats] = useState<Set<string>>(new Set<string>())
  const [openRubros, setOpenRubros] = useState(false)
  const [tabCat, setTabCat] = useState(RUBRO_CATEGORIAS[0].label)
  const [rubroQuery, setRubroQuery] = useState('')
  const [sugiendoRubros, setSugiendoRubros] = useState(false)
  const [rubrosSugeridos, setRubrosSugeridos] = useState<string[]>([])
  const [rubrosLocked, setRubrosLocked] = useState(() => {
    try { return localStorage.getItem('kapturo_rubros_locked') === '1' } catch { return false }
  })
  const [showUnlockConfirm, setShowUnlockConfirm] = useState(false)
  const [showResumenModal, setShowResumenModal] = useState(false)
  const [showFeedbackPerfil, setShowFeedbackPerfil] = useState(false)
  const [resumenIA, setResumenIA] = useState<{ texto: string; faltantes: string[] } | null>(null)
  const [generandoResumen, setGenerandoResumen] = useState(false)
  const [analizandoPDF, setAnalizandoPDF] = useState(false)
  const [camposSugeridosPDF, setCamposSugeridosPDF] = useState<Record<string, any> | null>(null)
  const [nombreArchivoPDF, setNombreArchivoPDF] = useState<string | null>(null)
  const toggleCat = (label: string) =>
    setOpenCats(prev => { const s = new Set(prev); s.has(label) ? s.delete(label) : s.add(label); return s })

  const generarConIA = async (campo: string) => {
    setGenerando(campo)
    try {
      const res = await api.post('/modules/licitaciones/asistente-perfil', {
        campo,
        rubros: form.rubros,
        regiones: form.regiones,
        descripcion_actual: form.descripcion,
        diferenciadores_actuales: form.diferenciadores,
      })
      setForm(f => ({ ...f, [campo]: res.data.texto }))
      toast.success('Generado — revisa y ajusta')
    } catch { toast.error('Error al generar') }
    finally { setGenerando(null) }
  }

  const sugerirRubros = async () => {
    if (!form.descripcion && !form.diferenciadores && !form.proyectos_anteriores) {
      toast.error('Primero completa la sección "Qué hace tu empresa"')
      return
    }
    setSugiendoRubros(true)
    setRubrosSugeridos([])
    try {
      const res = await api.post('/modules/licitaciones/asistente-perfil', {
        campo: 'sugerir_rubros',
        descripcion_actual: form.descripcion,
        diferenciadores_actuales: form.diferenciadores,
        proyectos: form.proyectos_anteriores,
        rubros_disponibles: RUBRO_CATEGORIAS.flatMap(c => c.rubros),
      })
      const sugeridos: string[] = res.data.rubros || res.data.texto?.split(',').map((r: string) => r.trim().toLowerCase()).filter(Boolean) || []
      const validos = sugeridos.filter(r => RUBRO_CATEGORIAS.flatMap(c => c.rubros).includes(r))
      if (validos.length > 0) {
        setRubrosSugeridos(validos)
      } else {
        // Fallback: keyword matching client-side
        const texto = `${form.descripcion} ${form.diferenciadores} ${form.proyectos_anteriores}`.toLowerCase()
        const todoRubros = RUBRO_CATEGORIAS.flatMap(c => c.rubros)
        const matches = todoRubros.filter(r => texto.includes(r) || r.split(' ').some(w => w.length > 4 && texto.includes(w)))
        setRubrosSugeridos(matches.slice(0, 8))
        if (matches.length === 0) toast('No se encontraron sugerencias — intenta completar más tu descripción', { icon: '⚠️' })
      }
    } catch {
      // Fallback client-side
      const texto = `${form.descripcion} ${form.diferenciadores} ${form.proyectos_anteriores}`.toLowerCase()
      const todoRubros = RUBRO_CATEGORIAS.flatMap(c => c.rubros)
      const matches = todoRubros.filter(r => texto.includes(r) || r.split(' ').some(w => w.length > 4 && texto.includes(w)))
      setRubrosSugeridos(matches.slice(0, 8))
    } finally {
      setSugiendoRubros(false)
    }
  }

  const guardarMutation = useMutation({
    mutationFn: () => api.put('/tenant/me/licitaciones-profile', {
      ...form,
      experiencia_anos: form.experiencia_anos ? parseInt(form.experiencia_anos) : null,
    }),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['licitaciones-profile'] })
      syncedRef.current = false
      toast.success('✅ Perfil guardado')
      setShowFeedbackPerfil(true)
      setShowFeedbackPerfil(true)
      // Lock rubros after save
      if (form.rubros.length > 0) {
        setRubrosLocked(true)
        localStorage.setItem('kapturo_rubros_locked', '1')
      }
      // Generate AI summary
      setShowResumenModal(true)
      setGenerandoResumen(true)
      setResumenIA(null)
      try {
        const res = await api.post('/modules/licitaciones/asistente-perfil', {
          campo: 'resumen_perfil',
          rubros: form.rubros,
          regiones: form.regiones,
          descripcion_actual: form.descripcion,
          diferenciadores_actuales: form.diferenciadores,
          proyectos: form.proyectos_anteriores,
          certificaciones: form.certificaciones,
        })
        const texto = res.data.texto || ''
        // Calculate missing fields
        const faltantes: string[] = []
        if (!form.descripcion) faltantes.push('Descripción de la empresa')
        if (!form.proyectos_anteriores) faltantes.push('Proyectos anteriores')
        if (!form.certificaciones) faltantes.push('Certificaciones')
        if (!form.diferenciadores) faltantes.push('Diferenciadores competitivos')
        if (form.rubros.length === 0) faltantes.push('Rubros donde participas')
        if (form.regiones.length === 0) faltantes.push('Regiones donde operas')
        setResumenIA({ texto, faltantes })
      } catch {
        // Fallback: generate client-side summary
        const faltantes: string[] = []
        if (!form.descripcion) faltantes.push('Descripción de la empresa')
        if (!form.proyectos_anteriores) faltantes.push('Proyectos anteriores')
        if (!form.certificaciones) faltantes.push('Certificaciones')
        if (!form.diferenciadores) faltantes.push('Diferenciadores competitivos')
        if (form.rubros.length === 0) faltantes.push('Rubros donde participas')
        if (form.regiones.length === 0) faltantes.push('Regiones donde operas')
        const partes = []
        if (form.razon_social) partes.push(`**${form.razon_social}**`)
        if (form.rubros.length > 0) partes.push(`opera en los rubros de ${form.rubros.slice(0, 3).join(', ')}`)
        if (form.regiones.length > 0) partes.push(`con presencia en ${form.regiones.length} región(es)`)
        if (form.experiencia_anos) partes.push(`y cuenta con ${form.experiencia_anos} años de experiencia`)
        const texto = partes.length > 0 ? partes.join(', ') + '.' : 'Completa más campos para obtener un resumen detallado.'
        setResumenIA({ texto, faltantes })
      } finally {
        setGenerandoResumen(false)
      }
    },
    onError: (err: any) => toast.error(apiError(err, 'Error al guardar')),
  })

  // Completitud
  const completitud = CAMPOS_COMPLETITUD.map(c => {
    const val = (form as any)[c.key]
    const filled = !!(val && (!Array.isArray(val) || val.length > 0))
    return { ...c, filled }
  })
  const criticos = completitud.filter(c => c.critical)
  const criticosOk = criticos.filter(c => c.filled).length
  const totalOk = completitud.filter(c => c.filled).length
  const pct = Math.round((totalOk / completitud.length) * 100)
  const listoParaPostular = criticosOk === criticos.length

  const toggleRubro = (r: string) =>
    setForm(f => ({ ...f, rubros: f.rubros.includes(r) ? f.rubros.filter(x => x !== r) : [...f.rubros, r] }))

  const regionesOrdenadas = catalogo?.regiones
    ? [...catalogo.regiones].sort((a: any, b: any) =>
        a.nombre.localeCompare(b.nombre, 'es'))
    : []

  const regionesFiltradas = regionQuery.trim()
    ? regionesOrdenadas.filter((r: any) => r.nombre.toLowerCase().includes(regionQuery.toLowerCase()))
    : regionesOrdenadas

  const toggleRegion = (c: string) =>
    setForm(f => ({ ...f, regiones: f.regiones.includes(c) ? f.regiones.filter(x => x !== c) : [...f.regiones, c] }))

  const subirDocumento = async (tipo: string, file: File) => {
    if (file.size > 3 * 1024 * 1024) { toast.error('El archivo supera el límite de 3 MB'); return }
    setSubiendo(tipo)
    try {
      const fd = new FormData()
      fd.append('archivo', file)
      const res = await api.post(`/modules/licitaciones/documentos/${tipo}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setDocsMeta(prev => ({ ...prev, [tipo]: { nombre: res.data.nombre, size: res.data.size, subido_at: new Date().toISOString() } }))
      toast.success(`✅ ${res.data.nombre} subido`)
    } catch { toast.error('Error al subir el documento') }
    finally { setSubiendo(null) }
  }

  const eliminarDocumento = async (tipo: string) => {
    if (!confirm('¿Eliminar este documento?')) return
    try {
      await api.delete(`/modules/licitaciones/documentos/${tipo}`)
      setDocsMeta(prev => { const n = { ...prev }; delete n[tipo]; return n })
      toast.success('Documento eliminado')
    } catch { toast.error('Error al eliminar') }
  }

  const descargarDocumento = async (tipo: string, nombre: string) => {
    try {
      const res = await api.get(`/modules/licitaciones/documentos/${tipo}/download`)
      const { base64, mime } = res.data
      const blob = new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: mime })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = nombre; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Error al descargar') }
  }

  const verDocumento = async (tipo: string) => {
    try {
      const res = await api.get(`/modules/licitaciones/documentos/${tipo}/download`)
      const { base64, mime } = res.data
      const blob = new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: mime })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      // Revoke after short delay to allow tab to load
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch { toast.error('Error al abrir el documento') }
  }

  const SECCIONES = [
    { key: 'empresa',    label: 'Tu empresa',          icon: Building2, desc: 'RUT, razón social y datos legales',      badge: 'obligatorio' },
    { key: 'contacto',   label: 'Contacto',            icon: Award,     desc: 'Firmante y datos para propuestas',       badge: 'obligatorio' },
    { key: 'documentos', label: 'Documentos',          icon: FileText,  desc: 'CV empresa, certificados PDF',           badge: 'obligatorio' },
    { key: 'que_hace',   label: 'Qué hace tu empresa', icon: Sparkles,  desc: 'Descripción, proyectos, certificaciones', badge: 'complementa la IA' },
    { key: 'rubros',     label: 'Rubros y regiones',   icon: MapPin,    desc: 'Dónde y en qué opera tu empresa',        badge: 'obligatorio' },
    { key: 'equipo',     label: 'Equipo',              icon: Users,     desc: 'Quiénes ejecutan los proyectos',          badge: 'complementa la IA' },
  ]

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      <Loader2 size={24} className="animate-spin mr-2" /> Cargando perfil…
    </div>
  )

  // Progreso por sección para el panel derecho
  const progresoSecciones = SECCIONES.map(sec => {
    const campos = completitud.filter(c => c.grupo === sec.key)
    const ok = campos.filter(c => c.filled).length
    const total = campos.length
    const tieneDoc = sec.key === 'documentos' ? Object.keys(docsMeta).length > 0 : null
    const done = sec.key === 'documentos' ? tieneDoc : (total > 0 && ok === total)
    const hasCritical = campos.some(c => c.critical && !c.filled)
    return { ...sec, ok, total, done, hasCritical }
  })

  return (
    <div className="max-w-6xl mx-auto pb-16 px-6 pt-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-base font-bold text-gray-900">Perfil de empresa para IA</h1>
          <p className="text-xs text-gray-400 mt-0.5">Completa tu perfil para que la IA genere propuestas de calidad</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (!confirm('¿Borrar toda la información del perfil?')) return
              setForm({ rut_empresa: '', razon_social: '', descripcion: '', experiencia_anos: '', proyectos_anteriores: '', certificaciones: '', diferenciadores: '', inscrito_chile_proveedores: false, rubros: [], regiones: [], email_alertas: '', nombre_contacto: '', cargo_contacto: '', telefono: '', correo: '', sitio_web: '', direccion: '', equipo_tecnico: '', metodologia_trabajo: '' })
              setOpenCats(new Set()); setDocsMeta({})
            }}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
          >
            <Trash2 size={12} /> Limpiar
          </button>
          <button onClick={() => guardarMutation.mutate()} disabled={guardarMutation.isPending}
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {guardarMutation.isPending ? <><Loader2 size={13} className="animate-spin" /> Guardando…</> : <><CheckCircle2 size={13} /> Guardar</>}
          </button>
        </div>
      </div>

      <div className="flex gap-6 items-start">

        {/* ── SIDEBAR IZQUIERDO: PROGRESO Y NAVEGACIÓN ─────── */}
        <div className="w-52 shrink-0 hidden lg:block self-start sticky top-4">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden max-h-[calc(100vh-6rem)] overflow-y-auto">

            {/* % progreso */}
            <div className="px-3 pt-3 pb-3 border-b border-gray-100 flex items-center gap-3">
              <div className={clsx('text-3xl font-black leading-none shrink-0',
                pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-500' : 'text-indigo-600')}>
                {pct}%
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-400">perfil completado</p>
                <div className="w-full bg-gray-100 rounded-full h-1 mt-1">
                  <div className={clsx('h-1 rounded-full transition-all duration-700',
                    pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-indigo-500')}
                    style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>

            {/* Lista de secciones navegables */}
            <div className="px-1.5 py-1.5 space-y-0.5">
              {progresoSecciones.map(sec => {
                const Icon = sec.icon
                const isActive = activeSection === sec.key
                const docCount = sec.key === 'documentos' ? Object.keys(docsMeta).length : null
                const displayOk = docCount !== null ? docCount : sec.ok
                const displayTotal = docCount !== null ? DOCS_TIPOS.length : sec.total
                const isComplementary = (sec as any).badge === 'complementa la IA'
                return (
                  <button key={sec.key} onClick={() => scrollTo(sec.key)}
                    className={clsx(
                      'w-full flex items-center gap-2 px-2 py-2 rounded-lg transition-all text-left',
                      isActive
                        ? 'bg-indigo-50 ring-1 ring-indigo-200 ring-inset'
                        : 'hover:bg-gray-50'
                    )}>
                    <Icon size={12} className={clsx('shrink-0',
                      sec.done ? 'text-emerald-500' : sec.hasCritical ? 'text-red-400' : isActive ? 'text-indigo-500' : 'text-gray-300')} />
                    <span className={clsx('text-[11px] flex-1 font-medium leading-tight',
                      isActive ? 'text-indigo-700' :
                      sec.done ? 'text-gray-700' :
                      sec.hasCritical ? 'text-red-600' :
                      isComplementary ? 'text-gray-400' : 'text-gray-500')}>
                      {sec.label}
                    </span>
                    <span className={clsx('text-[10px] font-bold shrink-0 tabular-nums',
                      sec.done ? 'text-emerald-500' : isActive ? 'text-indigo-400' : 'text-gray-300')}>
                      {displayOk}/{displayTotal}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Campos críticos pendientes */}
            {!listoParaPostular && (
              <div className="px-3 py-2.5 border-t border-gray-100 bg-red-50">
                <p className="text-[9px] font-bold text-red-700 uppercase tracking-wide mb-1.5">Obligatorios</p>
                <div className="space-y-1">
                  {completitud.filter(c => c.critical && !c.filled).map(c => (
                    <div key={c.key} className="flex items-center gap-1">
                      <AlertCircle size={8} className="text-red-400 shrink-0" />
                      <span className="text-[10px] text-red-600 leading-tight">{c.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {listoParaPostular && (
              <div className="px-4 py-3 border-t border-gray-100 bg-emerald-50 text-center">
                <CheckCircle2 size={16} className="text-emerald-500 mx-auto mb-1" />
                <p className="text-[10px] font-bold text-emerald-700">¡Listo para postular!</p>
              </div>
            )}

          </div>
        </div>

        {/* ── FORMULARIO ─────────────────────────────────────── */}
        <div className="flex-1 space-y-10 min-w-0">

          {SECCIONES.map(sec => {
            const Icon = sec.icon
            return (
              <section key={sec.key} id={sec.key} data-perfil-section>
                {/* Section header */}
                <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100">
                  <Icon size={15} className="text-indigo-500 shrink-0" />
                  <h2 className="text-sm font-bold text-gray-900">{sec.label}</h2>
                  <span className="text-xs text-gray-400">{sec.desc}</span>
                  <span className={clsx('ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0',
                    sec.badge === 'obligatorio' ? 'bg-red-50 text-red-500' : 'bg-indigo-50 text-indigo-500')}>
                    {sec.badge}
                  </span>
                </div>
                <div className="space-y-4">

                  {/* ── EMPRESA ── */}
                  {sec.key === 'empresa' && (<>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">RUT empresa <span className="text-red-400">*</span></label>
                        <input className="input text-sm w-full" placeholder="76.123.456-7"
                          value={form.rut_empresa} onChange={e => setForm(f => ({ ...f, rut_empresa: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Razón social <span className="text-red-400">*</span></label>
                        <input className="input text-sm w-full" placeholder="Empresa Ejemplo SpA"
                          value={form.razon_social} onChange={e => setForm(f => ({ ...f, razon_social: e.target.value }))} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Años de experiencia</label>
                        <input type="number" min="0" className="input text-sm w-full" placeholder="5"
                          value={form.experiencia_anos} onChange={e => setForm(f => ({ ...f, experiencia_anos: e.target.value }))} />
                      </div>
                      <div className="flex items-end pb-1">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={form.inscrito_chile_proveedores}
                            onChange={e => setForm(f => ({ ...f, inscrito_chile_proveedores: e.target.checked }))}
                            className="rounded border-gray-300 text-indigo-600 w-4 h-4" />
                          <span className="text-xs text-gray-700 font-medium">Inscrito en ChileProveedores</span>
                        </label>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Dirección</label>
                        <input className="input text-xs w-full" placeholder="Av. Providencia 1234, Santiago"
                          value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Sitio web</label>
                        <input className="input text-xs w-full" placeholder="www.empresa.cl"
                          value={form.sitio_web} onChange={e => setForm(f => ({ ...f, sitio_web: e.target.value }))} />
                      </div>
                    </div>
                  </>)}

                  {/* ── RUBROS Y REGIONES ── */}
                  {sec.key === 'rubros' && (<>
                    <div>
                      {/* Chips de seleccionados + trigger */}
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-semibold text-gray-700">Rubros donde participas <span className="text-red-400">*</span></label>
                        <div className="flex items-center gap-2">
                          {rubrosLocked ? (
                            <button type="button"
                              onClick={() => setShowUnlockConfirm(true)}
                              className="flex items-center gap-1 text-[10px] text-amber-600 border border-amber-200 bg-amber-50 px-2 py-0.5 rounded-lg hover:bg-amber-100">
                              🔒 Bloqueado · Desbloquear
                            </button>
                          ) : (
                            form.rubros.length > 0 && (
                              <button type="button" onClick={() => setForm(f => ({ ...f, rubros: [] }))} className="text-[10px] text-gray-400 hover:text-red-400">limpiar todo</button>
                            )
                          )}
                        </div>
                      </div>

                      {/* Chips seleccionados */}
                      {/* Chips seleccionados — siempre visibles */}
                      {form.rubros.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {form.rubros.map(r => (
                            rubrosLocked ? (
                              <span key={r} className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 capitalize">{r}</span>
                            ) : (
                              <button key={r} type="button" onClick={() => toggleRubro(r)}
                                className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-indigo-600 text-white capitalize">
                                {r} <X size={9} />
                              </button>
                            )
                          ))}
                        </div>
                      )}

                      {rubrosLocked ? (
                        /* Vista bloqueada */
                        <div className="border border-dashed border-amber-200 rounded-xl p-4 flex flex-col items-center gap-2 text-center bg-amber-50/50">
                          <span className="text-2xl">🔒</span>
                          <p className="text-xs font-semibold text-amber-700">Rubros bloqueados</p>
                          <p className="text-[10px] text-amber-600">Los rubros definen cómo la IA filtra licitaciones para tu empresa.<br />Para modificarlos, desbloquea primero.</p>
                          <button type="button" onClick={() => setShowUnlockConfirm(true)}
                            className="mt-1 text-xs font-semibold text-amber-700 border border-amber-300 px-3 py-1 rounded-lg hover:bg-amber-100">
                            Desbloquear para editar
                          </button>
                        </div>
                      ) : (<>

                      {/* Sugerencia IA */}
                      <div className="mb-3">
                        <button type="button" onClick={sugerirRubros} disabled={sugiendoRubros}
                          className={clsx('w-full flex items-center justify-center gap-2 text-xs font-semibold py-2.5 rounded-xl border transition-colors',
                            form.descripcion
                              ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                              : 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed')}>
                          {sugiendoRubros
                            ? <><Loader2 size={13} className="animate-spin" /> Analizando tu empresa…</>
                            : <><Sparkles size={13} /> Sugerir rubros automáticamente con IA</>}
                        </button>
                        {!form.descripcion && (
                          <p className="text-[10px] text-gray-400 text-center mt-1">Completa primero "Qué hace tu empresa" para usar esta función</p>
                        )}
                      </div>

                      {/* Rubros sugeridos por IA */}
                      {rubrosSugeridos.length > 0 && (
                        <div className="mb-3 border border-indigo-200 bg-indigo-50 rounded-xl p-3">
                          <p className="text-[10px] font-semibold text-indigo-700 mb-2 flex items-center gap-1">
                            <Sparkles size={11} /> La IA sugiere estos rubros para tu empresa:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {rubrosSugeridos.map(r => {
                              const yaSeleccionado = form.rubros.includes(r)
                              return (
                                <button key={r} type="button"
                                  onClick={() => { toggleRubro(r); if (!yaSeleccionado) setRubrosSugeridos(prev => prev.filter(x => x !== r)) }}
                                  className={clsx('flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border transition-colors capitalize',
                                    yaSeleccionado
                                      ? 'bg-indigo-600 text-white border-indigo-600'
                                      : 'bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-100')}>
                                  {yaSeleccionado ? <Check size={10} /> : <Plus size={10} />} {r}
                                </button>
                              )
                            })}
                          </div>
                          <button type="button"
                            onClick={() => {
                              rubrosSugeridos.forEach(r => { if (!form.rubros.includes(r)) toggleRubro(r) })
                              setRubrosSugeridos([])
                            }}
                            className="mt-2 text-[10px] text-indigo-600 font-semibold hover:underline">
                            ✓ Agregar todos
                          </button>
                        </div>
                      )}
                      {/* Buscador / rubro personalizado */}
                      <div className="mb-2">
                        <div className="relative">
                          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            type="text"
                            value={rubroQuery}
                            onChange={e => setRubroQuery(e.target.value)}
                            onKeyDown={e => {
                              if ((e.key === 'Enter' || e.key === ',') && rubroQuery.trim()) {
                                e.preventDefault()
                                const val = rubroQuery.trim().toLowerCase()
                                if (!form.rubros.includes(val)) toggleRubro(val)
                                setRubroQuery('')
                              }
                            }}
                            placeholder="Buscar o escribe un rubro y presiona Enter…"
                            className="w-full text-xs border border-gray-200 rounded-lg pl-7 pr-3 py-1.5 focus:outline-none focus:border-indigo-400"
                          />
                        </div>
                        {/* Resultados de búsqueda */}
                        {rubroQuery.trim() !== '' && (() => {
                          const q = rubroQuery.toLowerCase()
                          const matches = RUBRO_CATEGORIAS.flatMap(c => c.rubros).filter(r => r.includes(q))
                          const exactMatch = matches.includes(q)
                          return (
                            <div className="mt-1 border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
                              {matches.slice(0, 8).map(r => (
                                <button key={r} type="button"
                                  onClick={() => { toggleRubro(r); setRubroQuery('') }}
                                  className={clsx('w-full text-left text-xs px-3 py-2 hover:bg-indigo-50 flex items-center justify-between capitalize',
                                    form.rubros.includes(r) && 'bg-indigo-50 text-indigo-700 font-semibold')}>
                                  {r}
                                  {form.rubros.includes(r) && <Check size={11} className="text-indigo-600" />}
                                </button>
                              ))}
                              {!exactMatch && (
                                <button type="button"
                                  onClick={() => { const v = rubroQuery.trim().toLowerCase(); if (!form.rubros.includes(v)) toggleRubro(v); setRubroQuery('') }}
                                  className="w-full text-left text-xs px-3 py-2 hover:bg-indigo-50 text-indigo-600 font-semibold flex items-center gap-2 border-t border-gray-100">
                                  <Plus size={11} /> Agregar "{rubroQuery.trim()}" como rubro personalizado
                                </button>
                              )}
                            </div>
                          )
                        })()}
                      </div>

                      {/* Tabs de categorías */}
                      <div className="border border-gray-200 rounded-xl overflow-hidden">
                        {/* Tab bar */}
                        <div className="flex overflow-x-auto border-b border-gray-200 bg-gray-50 gap-1 p-1.5">
                          {RUBRO_CATEGORIAS.map(cat => {
                            const sel = cat.rubros.filter(r => form.rubros.includes(r)).length
                            const active = tabCat === cat.label
                            return (
                              <button key={cat.label} type="button" onClick={() => setTabCat(cat.label)}
                                className={clsx(
                                  'flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap shrink-0 rounded-lg transition-all',
                                  active
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : sel > 0
                                      ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                                      : 'text-gray-500 hover:text-gray-800 hover:bg-white'
                                )}>
                                {cat.label.split(' ')[0]}
                                {sel > 0 && (
                                  <span className={clsx('text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center shrink-0',
                                    active ? 'bg-white text-indigo-600' : 'bg-indigo-600 text-white')}>
                                    {sel}
                                  </span>
                                )}
                              </button>
                            )
                          })}
                        </div>
                        {/* Seleccionar todos / quitar todos de la categoría */}
                        {(() => {
                          const cat = RUBRO_CATEGORIAS.find(c => c.label === tabCat)
                          if (!cat) return null
                          const todosSeleccionados = cat.rubros.every(r => form.rubros.includes(r))
                          return (
                            <div className="px-3 pt-2 pb-1 flex items-center justify-between border-b border-gray-100 bg-white">
                              <span className="text-[10px] text-gray-400">{cat.rubros.filter(r => form.rubros.includes(r)).length} de {cat.rubros.length} seleccionados</span>
                              <button type="button"
                                onClick={() => {
                                  if (todosSeleccionados) {
                                    setForm(f => ({ ...f, rubros: f.rubros.filter(r => !cat.rubros.includes(r)) }))
                                  } else {
                                    setForm(f => ({ ...f, rubros: Array.from(new Set([...f.rubros, ...cat.rubros])) }))
                                  }
                                }}
                                className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
                                {todosSeleccionados ? 'Quitar todos' : 'Seleccionar todos'}
                              </button>
                            </div>
                          )
                        })()}
                        {/* Rubros de la tab activa */}
                        <div className="px-3 py-3 flex flex-wrap gap-1.5 bg-white">
                          {(RUBRO_CATEGORIAS.find(c => c.label === tabCat)?.rubros ?? []).map(r => (
                            <button key={r} type="button" onClick={() => toggleRubro(r)}
                              className={clsx('text-[11px] px-2.5 py-1 rounded-lg border transition-colors capitalize',
                                form.rubros.includes(r)
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50')}>
                              {r}
                            </button>
                          ))}
                        </div>
                      </div>
                      </>)}
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-xs font-semibold text-gray-700">Regiones donde operas <span className="text-red-400">*</span>
                          {form.regiones.length > 0 && <span className="ml-2 text-indigo-600 font-bold">{form.regiones.length} sel.</span>}
                        </label>
                        <div className="flex gap-2">
                          {form.regiones.length > 0 && <button type="button" onClick={() => setForm(f => ({ ...f, regiones: [] }))} className="text-[10px] text-gray-400 hover:text-red-400">limpiar</button>}
                          <button type="button" onClick={() => setForm(f => ({ ...f, regiones: regionesOrdenadas.map((r: any) => r.codigo) }))} className="text-[10px] text-indigo-500 hover:text-indigo-700">todas</button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {regionesOrdenadas.map((r: any) => {
                          const nombre = r.nombre
                            .replace('Región Metropolitana de Santiago', 'Metropolitana')
                            .replace('Región de ', '')
                            .replace('Región del ', '')
                          return (
                            <button key={r.codigo} type="button" onClick={() => toggleRegion(r.codigo)}
                              className={clsx('text-xs px-2.5 py-1 rounded-full border transition-colors',
                                form.regiones.includes(r.codigo) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50')}>
                              {nombre}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div className="pt-3 border-t border-gray-100">
                      <button onClick={() => guardarMutation.mutate()} disabled={guardarMutation.isPending}
                        className={clsx('w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-colors',
                          guardarMutation.isPending
                            ? 'bg-indigo-300 text-white cursor-not-allowed'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700')}>
                        {guardarMutation.isPending
                          ? <><Loader2 size={14} className="animate-spin" /> Guardando…</>
                          : <><CheckCircle2 size={14} /> Guardar cambios</>}
                      </button>
                    </div>
                  </>)}

                  {/* ── QUÉ HACE TU EMPRESA ── */}
                  {sec.key === 'que_hace' && (<>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-gray-700">Descripción <span className="text-red-400">*</span>
                          <span className="ml-1 text-[10px] font-normal text-indigo-500">← lo más importante para la IA</span>
                        </label>
                        <button type="button" onClick={() => generarConIA('descripcion')} disabled={generando === 'descripcion'}
                          className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-40">
                          {generando === 'descripcion' ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                          {generando === 'descripcion' ? 'Generando…' : 'Generar con IA'}
                        </button>
                      </div>
                      <textarea className="input text-sm w-full resize-none" rows={3}
                        placeholder="Ej: Empresa de aseo industrial con 8 años de experiencia en hospitales y minería. Equipo de 40 personas en RM y Biobío. ISO 9001 vigente."
                        value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-gray-700">Proyectos anteriores relevantes</label>
                        <button type="button" onClick={() => generarConIA('proyectos_anteriores')} disabled={generando === 'proyectos_anteriores'}
                          className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-40">
                          {generando === 'proyectos_anteriores' ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
                          {generando === 'proyectos_anteriores' ? 'Generando…' : 'Ayudarme'}
                        </button>
                      </div>
                      <textarea rows={3} className="input text-xs w-full resize-none"
                        placeholder="Ej: Suministro equipos Hospital Regional Temuco (2023) — 12 meses&#10;Mantención vial Municipalidad Rancagua (2022) — $65M"
                        value={form.proyectos_anteriores} onChange={e => setForm(f => ({ ...f, proyectos_anteriores: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Certificaciones</label>
                      <input className="input text-xs w-full"
                        placeholder="ISO 9001, ISO 14001, OHSAS 18001, ChileValora…"
                        value={form.certificaciones} onChange={e => setForm(f => ({ ...f, certificaciones: e.target.value }))} />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-gray-700">Diferenciadores competitivos</label>
                        <button type="button" onClick={() => generarConIA('diferenciadores')} disabled={generando === 'diferenciadores'}
                          className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-40">
                          {generando === 'diferenciadores' ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                          {generando === 'diferenciadores' ? 'Generando…' : 'Sugerir'}
                        </button>
                      </div>
                      <textarea rows={2} className="input text-xs w-full resize-none"
                        placeholder="Ej: Únicos con ISO en la región, respuesta en 24h…"
                        value={form.diferenciadores} onChange={e => setForm(f => ({ ...f, diferenciadores: e.target.value }))} />
                    </div>
                  </>)}

                  {/* ── EQUIPO ── */}
                  {sec.key === 'equipo' && (<>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Equipo técnico</label>
                      <textarea rows={2} className="input text-xs w-full resize-none"
                        placeholder="Ej: 15 técnicos: 3 ingenieros civiles, 5 supervisores, 7 operarios. Liderado por Ing. Juan Pérez (20 años)."
                        value={form.equipo_tecnico} onChange={e => setForm(f => ({ ...f, equipo_tecnico: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Metodología de trabajo</label>
                      <textarea rows={2} className="input text-xs w-full resize-none"
                        placeholder="Ej: ISO 9001. Proyecto dividido en diagnóstico, ejecución y entrega. Control semanal con el organismo."
                        value={form.metodologia_trabajo} onChange={e => setForm(f => ({ ...f, metodologia_trabajo: e.target.value }))} />
                    </div>
                  </>)}

                  {/* ── CONTACTO ── */}
                  {sec.key === 'contacto' && (<>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Nombre del firmante <span className="text-red-400">*</span></label>
                        <input className="input text-xs w-full" placeholder="Juan Pérez"
                          value={form.nombre_contacto} onChange={e => setForm(f => ({ ...f, nombre_contacto: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Cargo</label>
                        <input className="input text-xs w-full" placeholder="Gerente General"
                          value={form.cargo_contacto} onChange={e => setForm(f => ({ ...f, cargo_contacto: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Teléfono</label>
                        <input className="input text-xs w-full" placeholder="+56 9 1234 5678"
                          value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Correo electrónico</label>
                        <input type="email" className="input text-xs w-full" placeholder="contacto@empresa.cl"
                          value={form.correo} onChange={e => setForm(f => ({ ...f, correo: e.target.value }))} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Email para alertas de licitaciones</label>
                      <input type="email" className="input text-xs w-full" placeholder="alertas@empresa.cl"
                        value={form.email_alertas} onChange={e => setForm(f => ({ ...f, email_alertas: e.target.value }))} />
                      <p className="text-[10px] text-gray-400 mt-1">Recibirás avisos de nuevas licitaciones que coincidan con tus rubros</p>
                    </div>
                  </>)}

                  {/* ── DOCUMENTOS ── */}
                  {sec.key === 'documentos' && (<>

                    {/* ── Auto-rellenar perfil desde PDF ── */}
                    <div className="rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/50 p-4 mb-4">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                          <Sparkles size={16} className="text-indigo-600" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-indigo-900">Sube tu contenido y te ayudamos</p>
                          <p className="text-xs text-indigo-600 mt-0.5">Sube un brochure, presentación o carpeta de servicios — la IA extrae automáticamente tu perfil completo.</p>
                        </div>
                      </div>

                      {!camposSugeridosPDF ? (
                        <label className={clsx('flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors',
                          analizandoPDF
                            ? 'bg-indigo-200 text-indigo-500 cursor-not-allowed'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700')}>
                          {analizandoPDF
                            ? <><Loader2 size={13} className="animate-spin" /> Analizando con IA…</>
                            : <><Upload size={13} /> Subir PDF de tu empresa</>}
                          <input type="file" accept=".pdf" className="hidden" disabled={analizandoPDF}
                            onChange={async (e) => {
                              const file = e.target.files?.[0]
                              if (!file) return
                              if (file.size > 5 * 1024 * 1024) { toast.error('El archivo supera el límite de 5 MB'); return }
                              setAnalizandoPDF(true)
                              try {
                                const fd = new FormData()
                                fd.append('archivo', file)
                                const res = await api.post('/modules/licitaciones/analizar-empresa-pdf', fd, {
                                  headers: { 'Content-Type': 'multipart/form-data' }
                                })
                                setCamposSugeridosPDF(res.data.campos)
                                setNombreArchivoPDF(res.data.nombre_archivo)
                              } catch (err: any) {
                                toast.error(err.response?.data?.detail || 'Error al analizar el PDF')
                              } finally {
                                setAnalizandoPDF(false)
                                e.target.value = ''
                              }
                            }} />
                        </label>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 size={14} className="text-emerald-500" />
                            <p className="text-xs font-semibold text-gray-800">La IA encontró esto en <span className="text-indigo-600">{nombreArchivoPDF}</span></p>
                          </div>
                          <div className="space-y-1.5 max-h-48 overflow-y-auto">
                            {Object.entries(camposSugeridosPDF).filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)).map(([key, val]) => (
                              <div key={key} className="flex items-start gap-2 text-xs">
                                <span className="text-gray-400 shrink-0 w-28 truncate capitalize">{key.replace(/_/g, ' ')}</span>
                                <span className="text-gray-800 font-medium line-clamp-2">{Array.isArray(val) ? val.join(', ') : String(val)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button type="button"
                              onClick={() => {
                                const c = camposSugeridosPDF
                                setForm(f => ({
                                  ...f,
                                  ...(c.razon_social && { razon_social: c.razon_social }),
                                  ...(c.rut_empresa && { rut_empresa: c.rut_empresa }),
                                  ...(c.descripcion && { descripcion: c.descripcion }),
                                  ...(c.rubros?.length && { rubros: c.rubros }),
                                  ...(c.regiones?.length && { regiones: c.regiones }),
                                  ...(c.experiencia_anos && { experiencia_anos: String(c.experiencia_anos) }),
                                  ...(c.proyectos_anteriores && { proyectos_anteriores: c.proyectos_anteriores }),
                                  ...(c.certificaciones && { certificaciones: c.certificaciones }),
                                  ...(c.diferenciadores && { diferenciadores: c.diferenciadores }),
                                  ...(c.nombre_contacto && { nombre_contacto: c.nombre_contacto }),
                                  ...(c.cargo_contacto && { cargo_contacto: c.cargo_contacto }),
                                  ...(c.correo && { correo: c.correo }),
                                  ...(c.telefono && { telefono: c.telefono }),
                                  ...(c.sitio_web && { sitio_web: c.sitio_web }),
                                  ...(c.direccion && { direccion: c.direccion }),
                                }))
                                setCamposSugeridosPDF(null)
                                toast.success('Perfil pre-rellenado. Revisa y guarda.')
                              }}
                              className="flex-1 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors">
                              Aprobar y aplicar al perfil
                            </button>
                            <button type="button"
                              onClick={() => { setCamposSugeridosPDF(null); setNombreArchivoPDF(null) }}
                              className="px-3 py-2 rounded-xl text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">
                              Descartar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 mb-4">
                      <strong>¿Para qué sirven?</strong> Se adjuntan al generar propuestas con IA. El CV de empresa es obligatorio en la mayoría de licitaciones públicas.
                    </div>
                    <div className="space-y-3">
                      {[...DOCS_TIPOS, ...(docsMeta['otros'] ? [{ key: 'otros', label: 'Otro documento', desc: 'Documento adicional', requerido: false }] : [])].map(doc => {
                        const meta = docsMeta[doc.key]
                        const isUploading = subiendo === doc.key
                        return (
                          <div key={doc.key} className={clsx('border rounded-xl transition-colors',
                            meta ? 'border-emerald-200 bg-emerald-50/40' : 'border-dashed border-gray-300 bg-gray-50 hover:border-indigo-300 hover:bg-indigo-50/30')}>

                            {/* Estado: archivo subido */}
                            {meta ? (
                              <div className="p-3 flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                                  <FileText size={15} className="text-emerald-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-gray-800 flex items-center gap-1.5">
                                    {doc.label}
                                    {doc.requerido && <span className="text-[10px] text-emerald-600 font-medium">✓ subido</span>}
                                  </p>
                                  <button type="button" onClick={() => verDocumento(doc.key)}
                                    className="text-[10px] text-indigo-500 hover:text-indigo-700 hover:underline truncate max-w-full text-left">
                                    {meta.nombre} · {Math.round(meta.size / 1024)} KB
                                  </button>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button onClick={() => verDocumento(doc.key)}
                                    className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1.5 rounded-lg hover:bg-white text-indigo-500 hover:text-indigo-700 border border-transparent hover:border-indigo-200" title="Ver documento">
                                    <span>Ver</span>
                                  </button>
                                  <button onClick={() => descargarDocumento(doc.key, meta.nombre)}
                                    className="p-1.5 rounded-lg hover:bg-white text-gray-400 hover:text-gray-700" title="Descargar">
                                    <Download size={13} />
                                  </button>
                                  <button onClick={() => eliminarDocumento(doc.key)}
                                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500" title="Eliminar">
                                    <Trash2 size={13} />
                                  </button>
                                  <label className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg cursor-pointer bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                                    <Upload size={10} /> Reemplazar
                                    <input type="file" accept=".pdf,.doc,.docx" className="hidden"
                                      onChange={e => { const f = e.target.files?.[0]; if (f) subirDocumento(doc.key, f); e.target.value = '' }} />
                                  </label>
                                </div>
                              </div>
                            ) : (
                              /* Estado: vacío — zona de subida grande */
                              <label className={clsx('flex flex-col items-center justify-center gap-2 py-5 px-4 cursor-pointer',
                                isUploading && 'opacity-60 pointer-events-none')}>
                                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                                  {isUploading
                                    ? <Loader2 size={18} className="text-indigo-500 animate-spin" />
                                    : <Upload size={18} className="text-indigo-500" />}
                                </div>
                                <div className="text-center">
                                  <p className="text-xs font-semibold text-gray-700">
                                    {doc.label}
                                    {doc.requerido && <span className="ml-1.5 text-red-400 font-normal text-[10px]">requerido</span>}
                                  </p>
                                  <p className="text-[10px] text-gray-400 mt-0.5">{doc.desc}</p>
                                  <p className="text-[10px] text-indigo-500 font-semibold mt-2">
                                    {isUploading ? 'Subiendo…' : 'Haz click para subir PDF'}
                                  </p>
                                </div>
                                <input type="file" accept=".pdf,.doc,.docx" className="hidden"
                                  onChange={e => { const f = e.target.files?.[0]; if (f) subirDocumento(doc.key, f); e.target.value = '' }} />
                              </label>
                            )}
                          </div>
                        )
                      })}
                      <label className="flex items-center gap-2 text-[10px] text-indigo-500 hover:text-indigo-700 cursor-pointer w-fit mt-1">
                        <FilePlus size={12} /> Subir otro documento
                        <input type="file" accept=".pdf,.doc,.docx" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) subirDocumento('otros', f); e.target.value = '' }} />
                      </label>
                    </div>
                  </>)}

                </div>
              </section>
            )
          })}

          {/* CTA final */}
          {listoParaPostular && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-900">Perfil completo — listo para postular</p>
                  <p className="text-xs text-emerald-600">Ya puedes buscar licitaciones y generar documentos con IA</p>
                </div>
              </div>
              <button onClick={() => navigate('/licitaciones')}
                className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-600 text-white px-3.5 py-2 rounded-xl hover:bg-emerald-700 shrink-0">
                Buscar licitaciones <ArrowRight size={12} />
              </button>
            </div>
          )}

          {/* Feedback post-guardado */}
          {showFeedbackPerfil && (
            <StepFeedback
              paso="perfil"
              titulo="¿Cómo fue completar tu Perfil IA?"
              onDone={() => setShowFeedbackPerfil(false)}
            />
          )}

          {/* Guardar sticky */}
          <div className="sticky bottom-4">
            <button onClick={() => guardarMutation.mutate()} disabled={guardarMutation.isPending}
              className="w-full flex items-center justify-center gap-2 text-sm font-semibold py-3 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 shadow-lg transition-colors">
              {guardarMutation.isPending ? <><Loader2 size={16} className="animate-spin" /> Guardando…</> : <><CheckCircle2 size={16} /> Guardar perfil</>}
            </button>
          </div>

        </div>{/* end form */}

      </div>{/* end flex */}

      {/* ── MODAL: Confirmar desbloqueo de rubros ── */}
      {showUnlockConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="text-center mb-4">
              <span className="text-4xl">🔓</span>
              <h3 className="text-base font-bold text-gray-900 mt-2">¿Desbloquear rubros?</h3>
              <p className="text-xs text-gray-500 mt-1">Los rubros definen cómo la IA filtra licitaciones. Al modificarlos podrías perder relevancia en tus alertas actuales.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowUnlockConfirm(false)}
                className="flex-1 text-sm font-semibold py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button type="button" onClick={() => {
                setRubrosLocked(false)
                localStorage.setItem('kapturo_rubros_locked', '0')
                setShowUnlockConfirm(false)
                toast.success('Rubros desbloqueados — recuerda guardar al terminar')
              }}
                className="flex-1 text-sm font-semibold py-2 rounded-xl bg-amber-500 text-white hover:bg-amber-600">
                Sí, desbloquear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Resumen IA tras guardar ── */}
      {showResumenModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-4 text-white">
              <div className="flex items-center gap-2">
                <Sparkles size={18} />
                <h3 className="text-base font-bold">Análisis de tu perfil</h3>
              </div>
              <p className="text-xs text-indigo-200 mt-0.5">Así ve la IA tu empresa al postular licitaciones</p>
            </div>

            <div className="px-6 py-5 space-y-4">
              {generandoResumen ? (
                <div className="flex flex-col items-center gap-3 py-6">
                  <Loader2 size={28} className="animate-spin text-indigo-500" />
                  <p className="text-sm text-gray-500">Analizando tu perfil…</p>
                </div>
              ) : resumenIA ? (<>
                {/* Resumen positivo */}
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                  <p className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wide mb-1.5">✅ Tu empresa</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{resumenIA.texto}</p>
                </div>

                {/* Campos faltantes */}
                {resumenIA.faltantes.length > 0 ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide mb-1.5">⚠️ Para mejorar tu perfil, completa:</p>
                    <ul className="space-y-1">
                      {resumenIA.faltantes.map(f => (
                        <li key={f} className="text-xs text-amber-800 flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                    <p className="text-sm font-semibold text-emerald-700">🎉 ¡Perfil completo! Listo para postular con IA.</p>
                  </div>
                )}
              </>) : null}
            </div>

            {/* Footer */}
            <div className="px-6 pb-5 flex gap-2">
              <button type="button" onClick={() => setShowResumenModal(false)}
                className="flex-1 text-sm font-semibold py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50">
                Seguir editando
              </button>
              <button type="button" onClick={() => setShowResumenModal(false)}
                className="flex-1 text-sm font-semibold py-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700">
                ✓ Entendido
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
