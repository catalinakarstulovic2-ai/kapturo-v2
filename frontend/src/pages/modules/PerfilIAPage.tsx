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
// Categorías reales del sistema UNSPSC de ChileCompra — las mismas que usa la API de Mercado Público
const RUBRO_CATEGORIAS = [
  { label: 'Construcción e Infraestructura', rubros: [
    'Servicios de construcción y mantenimiento',
    'Materiales y productos de construcción',
    'Artículos para estructuras, obras y construcciones',
    'Servicios de ingeniería y arquitectura',
  ]},
  { label: 'Tecnología e Informática', rubros: [
    'Tecnologías de información y telecomunicaciones',
    'Equipos y suministros de oficina e informática',
    'Equipos eléctricos, electrónicos e instrumentos',
    'Servicios de investigación y desarrollo',
  ]},
  { label: 'Salud y Farmacia', rubros: [
    'Equipamiento y suministros médicos',
    'Servicios de salud y bienestar social',
    'Productos farmacéuticos y químicos',
    'Servicios de laboratorio y análisis',
  ]},
  { label: 'Servicios Generales', rubros: [
    'Servicios de limpieza, aseo y mantenimiento de espacios',
    'Servicios de seguridad y vigilancia',
    'Recursos humanos y servicios de personal',
    'Servicios hoteleros, gastronómicos y turismo',
  ]},
  { label: 'Consultoría y Gestión', rubros: [
    'Servicios profesionales, administrativos y consultorías de gestión empresarial',
    'Servicios financieros, contables y de seguros',
    'Servicios jurídicos y legales',
    'Servicios de comunicaciones, publicidad y marketing',
  ]},
  { label: 'Educación y Cultura', rubros: [
    'Servicios de educación y formación profesional',
    'Servicios deportivos, recreativos y culturales',
    'Servicios de impresión, edición y artes gráficas',
  ]},
  { label: 'Logística y Transporte', rubros: [
    'Servicios de transporte y logística',
    'Vehículos y medios de transporte',
    'Combustibles, energía y productos relacionados',
  ]},
  { label: 'Equipamiento y Suministros', rubros: [
    'Equipos y maquinaria industrial',
    'Mobiliario y equipamiento de oficina',
    'Vestuario, uniformes y calzado',
    'Alimentos, bebidas y tabaco',
  ]},
  { label: 'Medio Ambiente e Industria', rubros: [
    'Servicios de medio ambiente y gestión de residuos',
    'Servicios agrícolas, ganaderos y forestales',
    'Minería y extracción de recursos naturales',
    'Servicios veterinarios y de animales',
  ]},
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
]

const DOCS_TIPOS = [
  { key: 'cv_empresa',          label: 'CV de empresa',             desc: 'Presentación institucional — se adjunta en cada postulación', requerido: true  },
  { key: 'certificaciones_pdf', label: 'Certificados (ISO, etc.)',  desc: 'ISO 9001, 14001, OHSAS 18001, ChileValora u otros',           requerido: false },
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
    monto_max_proyecto_uf: '',
    rubros: [] as string[], regiones: [] as string[],
    email_alertas: '',
    nombre_contacto: '', cargo_contacto: '', telefono: '', correo: '', sitio_web: '', direccion: '',
    equipo_tecnico: '', metodologia_trabajo: '',
  })
  const syncedRef = useRef(false)

  useEffect(() => {
    if (!perfilRemoto || syncedRef.current) return
    syncedRef.current = true
    const rubrosGuardados: string[] = (perfilRemoto.rubros || []).map((r: string) => r.trim())
    // Migrar rubros viejos (palabras cortas) a categorías UNSPSC nuevas si aplica
    const todosRubrosNuevos = RUBRO_CATEGORIAS.flatMap(c => c.rubros)
    const rubrosMigrados = rubrosGuardados.map(rViejo => {
      // Si ya es una categoría UNSPSC nueva, la mantenemos tal cual
      if (todosRubrosNuevos.some(r => r.toLowerCase() === rViejo.toLowerCase())) return rViejo
      // Si es una palabra vieja, buscar qué categoría UNSPSC la contiene como substring
      const match = todosRubrosNuevos.find(r => r.toLowerCase().includes(rViejo.toLowerCase()))
      return match ?? rViejo
    }).filter((r, i, arr) => arr.indexOf(r) === i) // deduplicar

    // Abrir automáticamente las categorías que ya tienen rubros seleccionados
    const rubrosMigradosLower = rubrosMigrados.map(r => r.toLowerCase())
    setOpenCats(new Set(
      RUBRO_CATEGORIAS.filter(cat => cat.rubros.some(r => rubrosMigradosLower.includes(r.toLowerCase()))).map(c => c.label)
    ))
    const firstCatWithRubros = RUBRO_CATEGORIAS.find(cat => cat.rubros.some(r => rubrosMigradosLower.includes(r.toLowerCase())))
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
      monto_max_proyecto_uf: perfilRemoto.monto_max_proyecto_uf != null ? String(perfilRemoto.monto_max_proyecto_uf) : '',
      rubros: rubrosMigrados,
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
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    new Set(['equipo'])
  )
  const toggleCollapse = (key: string) => setCollapsedSections(prev => {
    const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next
  })
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
    const wasCollapsed = collapsedSections.has(id)
    if (wasCollapsed) setCollapsedSections(prev => { const next = new Set(prev); next.delete(id); return next })

    const go = () => {
      const el = document.getElementById(id)
      if (!el) return
      setActiveSection(id)
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
      const y = el.getBoundingClientRect().top + window.scrollY - 80
      window.scrollTo({ top: y, behavior: 'smooth' })
    }

    wasCollapsed ? setTimeout(go, 80) : go()
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

  // Rubros genéricos que no sirven como filtro de búsqueda — deben coincidir con buildKeyword en licitacionesSearchStore
  const RUBROS_GENERICOS = new Set([
    'gestión', 'proyectos', 'administración', 'planificación', 'estrategia',
    'comunicaciones', 'marketing', 'relaciones públicas', 'finanzas',
    'recursos humanos', 'capacitación', 'consultoría', 'asesoría',
    'servicios generales', 'ventas', 'negocios', 'coordinación', 'supervisión',
    'contabilidad', 'legal',
  ])

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
      const todoRubros = RUBRO_CATEGORIAS.flatMap(c => c.rubros)
      // Filtrar: solo rubros válidos del catálogo Y que no sean genéricos
      const validos = sugeridos.filter(r => todoRubros.includes(r) && !RUBROS_GENERICOS.has(r))
      if (validos.length > 0) {
        setRubrosSugeridos(validos)
      } else {
        // Fallback: keyword matching client-side, también filtrando genéricos
        const texto = `${form.descripcion} ${form.diferenciadores} ${form.proyectos_anteriores}`.toLowerCase()
        const matches = todoRubros.filter(r =>
          !RUBROS_GENERICOS.has(r) &&
          (texto.includes(r) || r.split(' ').some(w => w.length > 4 && texto.includes(w)))
        )
        setRubrosSugeridos(matches.slice(0, 8))
        if (matches.length === 0) toast('No se encontraron sugerencias — intenta completar más tu descripción', { icon: '⚠️' })
      }
    } catch {
      const texto = `${form.descripcion} ${form.diferenciadores} ${form.proyectos_anteriores}`.toLowerCase()
      const todoRubros = RUBRO_CATEGORIAS.flatMap(c => c.rubros)
      const matches = todoRubros.filter(r =>
        !RUBROS_GENERICOS.has(r) &&
        (texto.includes(r) || r.split(' ').some(w => w.length > 4 && texto.includes(w)))
      )
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

  // ── Archivos de contexto para la IA ────────────────────────────────────────
  const [archivosCtx, setArchivosCtx] = useState<{nombre: string; tamaño_chars: number; fecha: string}[]>([])
  const [archivosCtxCargando, setArchivosCtxCargando] = useState(false)

  useEffect(() => {
    api.get('/modules/licitaciones/archivos-contexto')
      .then(r => setArchivosCtx(r.data.archivos ?? []))
      .catch(() => {})
  }, [])

  const handleArchivoCtx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setArchivosCtxCargando(true)
    try {
      let texto = ''
      if (file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
        texto = await file.text()
      } else if (file.type === 'application/pdf') {
        try {
          const arrayBuffer = await file.arrayBuffer()
          // @ts-ignore
          const pdfjsLib = (window as any).pdfjsLib
          if (pdfjsLib) {
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
            const pages: string[] = []
            for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
              const page = await pdf.getPage(i)
              const content = await page.getTextContent()
              pages.push(content.items.map((it: any) => it.str).join(' '))
            }
            texto = pages.join('\n\n')
          } else {
            texto = `[PDF: ${file.name}]`
          }
        } catch { texto = `[Contenido de ${file.name}]` }
      } else {
        texto = await file.text()
      }
      if (!texto.trim()) { toast.error('No se pudo extraer texto del archivo'); return }
      await api.post('/modules/licitaciones/archivos-contexto/texto', {
        nombre: file.name,
        texto: texto.slice(0, 15000),
      })
      toast.success(`"${file.name}" guardado — Claude lo usará en todas tus propuestas`)
      const r = await api.get('/modules/licitaciones/archivos-contexto')
      setArchivosCtx(r.data.archivos ?? [])
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Error al subir archivo')
    } finally {
      setArchivosCtxCargando(false)
      e.target.value = ''
    }
  }

  const eliminarArchivoCtx = async (nombre: string) => {
    try {
      await api.delete(`/modules/licitaciones/archivos-contexto/${encodeURIComponent(nombre)}`)
      setArchivosCtx(prev => prev.filter(a => a.nombre !== nombre))
      toast.success('Archivo eliminado')
    } catch { toast.error('Error al eliminar') }
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
    { key: 'empresa',    label: 'Tu empresa',          icon: Building2, desc: 'RUT, razón social y datos legales',       badge: 'obligatorio'       },
    { key: 'que_hace',   label: 'Qué hace tu empresa', icon: Sparkles,  desc: 'Descripción, proyectos, diferenciadores', badge: 'complementa la IA' },
    { key: 'rubros',     label: 'Rubros y regiones',   icon: MapPin,    desc: 'Dónde y en qué opera — filtra la búsqueda', badge: 'obligatorio'     },
    { key: 'contacto',   label: 'Contacto',            icon: Award,     desc: 'Firmante y datos para propuestas',        badge: 'obligatorio'       },
  ]

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-ink-4">
      <Loader2 size={24} className="animate-spin mr-2" /> Cargando perfil…
    </div>
  )

  // Progreso por sección para el panel derecho
  const progresoSecciones = SECCIONES.map(sec => {
    const campos = completitud.filter(c => c.grupo === sec.key)
    const ok = campos.filter(c => c.filled).length
    const total = campos.length
    const criticalCampos = campos.filter(c => c.critical)
    const criticalOk = criticalCampos.filter(c => c.filled).length
    const criticalTotal = criticalCampos.length
    const tieneDoc = sec.key === 'documentos' ? Object.keys(docsMeta).length > 0 : null
    const done = sec.key === 'documentos' ? tieneDoc : (total > 0 && ok === total)
    const hasCritical = campos.some(c => c.critical && !c.filled)
    return { ...sec, ok, total, criticalOk, criticalTotal, done, hasCritical }
  })

  return (
    <div className="max-w-6xl mx-auto pb-16 px-6 pt-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-bold text-ink-9">Perfil de empresa para IA</h1>
          <p className="text-xs text-ink-4 mt-0.5">La IA usa este perfil para filtrar licitaciones relevantes y generar propuestas</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (!confirm('¿Borrar toda la información del perfil?')) return
              setForm({ rut_empresa: '', razon_social: '', descripcion: '', experiencia_anos: '', proyectos_anteriores: '', certificaciones: '', diferenciadores: '', inscrito_chile_proveedores: false, monto_max_proyecto_uf: '', rubros: [], regiones: [], email_alertas: '', nombre_contacto: '', cargo_contacto: '', telefono: '', correo: '', sitio_web: '', direccion: '', equipo_tecnico: '', metodologia_trabajo: '' })
              setOpenCats(new Set()); setDocsMeta({})
            }}
            className="flex items-center gap-1 text-xs text-ink-4 hover:text-red-500 px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
          >
            <Trash2 size={12} /> Limpiar
          </button>
          <button onClick={() => {
              if (form.rubros.length === 0) {
                toast.error('Selecciona al menos 1 rubro — sin rubros la búsqueda no funciona')
                scrollTo('rubros')
                return
              }
              if (form.regiones.length === 0) {
                toast.error('Selecciona al menos 1 región — sin regiones no recibirás licitaciones relevantes')
                scrollTo('rubros')
                return
              }
              guardarMutation.mutate()
            }} disabled={guardarMutation.isPending}
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl bg-kap-600 text-white hover:bg-kap-700 disabled:opacity-40 transition-colors">
            {guardarMutation.isPending ? <><Loader2 size={13} className="animate-spin" /> Guardando…</> : <><CheckCircle2 size={13} /> Guardar</>}
          </button>
        </div>
      </div>

      {/* Banner de flujo — solo si perfil incompleto */}
      {!listoParaPostular && (
        <div className="mb-5 grid grid-cols-3 gap-3">
          {(() => {
            const paso1ok = !!(form.descripcion && form.rubros.length > 0 && form.regiones.length > 0)
            const paso2ok = !!(perfilRemoto?.descripcion)
            const pasos = [
              { num: '1', label: 'Describe tu empresa',  desc: 'Qué hace, rubros y regiones donde operas',            done: paso1ok,  cta: null },
              { num: '2', label: 'Guarda el perfil',     desc: 'La IA analiza cómo te ve el sistema',                 done: paso2ok,  cta: null },
              { num: '3', label: 'Busca licitaciones',   desc: paso2ok ? '→ Tu perfil ya filtra los resultados' : 'Completa los pasos anteriores primero', done: false, cta: paso2ok ? () => navigate('/licitaciones') : null },
            ]
            return pasos.map(s => (
              <div
                key={s.num}
                onClick={s.cta ?? undefined}
                className={clsx('rounded-xl border px-4 py-3 flex items-start gap-3 transition-colors',
                  s.done ? 'bg-emerald-50 border-emerald-200' :
                  s.cta  ? 'bg-kap-50 border-kap-300 cursor-pointer hover:bg-kap-100' :
                           'bg-ink-1 border-ink-3')}
              >
                <span className={clsx('text-xs font-black w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                  s.done ? 'bg-emerald-500 text-white' : s.cta ? 'bg-kap-500 text-white' : 'bg-ink-4 text-white')}>
                  {s.done ? '✓' : s.num}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={clsx('text-xs font-semibold', s.done ? 'text-emerald-800' : s.cta ? 'text-kap-700' : 'text-ink-7')}>{s.label}</p>
                  <p className={clsx('text-[10px] mt-0.5', s.cta ? 'text-kap-500 font-medium' : 'text-ink-4')}>{s.desc}</p>
                </div>
                {s.cta && <ArrowRight size={14} className="text-kap-500 shrink-0 mt-0.5" />}
              </div>
            ))
          })()}
        </div>
      )}

      <div className="flex gap-6 items-start">

        {/* ── SIDEBAR IZQUIERDO: PROGRESO Y NAVEGACIÓN ─────── */}
        <div className="w-52 shrink-0 hidden lg:block self-start sticky top-4">
          <div className="bg-white border border-ink-3 rounded-2xl shadow-sm overflow-hidden max-h-[calc(100vh-6rem)] overflow-y-auto">

            {/* % progreso */}
            <div className="px-3 pt-3 pb-3 border-b border-ink-2 flex items-center gap-3">
              <div className={clsx('text-3xl font-black leading-none shrink-0',
                pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-500' : 'text-kap-600')}>
                {pct}%
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-ink-4">perfil completado</p>
                <div className="w-full bg-ink-2 rounded-full h-1 mt-1">
                  <div className={clsx('h-1 rounded-full transition-all duration-700',
                    pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-kap-500')}
                    style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>

            {/* Lista de secciones navegables */}
            <div className="px-1.5 py-1.5 space-y-0.5">
              {progresoSecciones.map(sec => {
                const Icon = sec.icon
                const isActive = activeSection === sec.key
                const isDocumentos = sec.key === 'documentos'
                const ctxCount = archivosCtx.length
                const hasCriticalFields = sec.criticalTotal > 0
                const displayOk = isDocumentos ? ctxCount : (hasCriticalFields ? sec.criticalOk : sec.ok)
                const displayTotal: number | null = isDocumentos ? null : (hasCriticalFields ? sec.criticalTotal : sec.total)
                const isComplementary = (sec as any).badge === 'complementa la IA'
                return (
                  <button key={sec.key} onClick={() => scrollTo(sec.key)}
                    className={clsx(
                      'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg transition-all text-left',
                      isActive ? 'bg-kap-600 shadow-sm' : 'hover:bg-ink-1'
                    )}>
                    <Icon size={12} className={clsx('shrink-0',
                      isActive ? 'text-white' :
                      sec.done ? 'text-emerald-500' : sec.hasCritical ? 'text-red-400' : 'text-ink-4')} />
                    <span className={clsx('text-[11px] flex-1 font-medium leading-tight',
                      isActive ? 'text-white font-semibold' :
                      sec.done ? 'text-ink-7' :
                      sec.hasCritical ? 'text-red-600' :
                      isComplementary ? 'text-ink-4' : 'text-ink-5')}>
                      {sec.label}
                    </span>
                    <span className={clsx('text-[10px] font-bold shrink-0 tabular-nums',
                      isActive ? 'text-kap-300' :
                      sec.done ? 'text-emerald-500' : 'text-ink-4')}>
                      {displayTotal !== null ? `${displayOk}/${displayTotal}` : ctxCount > 0 ? `${ctxCount}` : '—'}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Campos críticos pendientes */}
            {!listoParaPostular && (
              <div className="px-3 py-2.5 border-t border-ink-2 bg-red-50">
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
              <div className="px-4 py-3 border-t border-ink-2 bg-emerald-50 text-center">
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
            const isCollapsed = collapsedSections.has(sec.key)
            return (
              <section key={sec.key} id={sec.key} data-perfil-section>
                {/* Section header — colapsable */}
                <button type="button" onClick={() => toggleCollapse(sec.key)}
                  className="w-full flex items-center gap-2 mb-4 pb-2 border-b border-ink-2 hover:border-kap-100 transition-colors group text-left">
                  <Icon size={15} className="text-kap-500 shrink-0" />
                  <h2 className="text-sm font-bold text-ink-9">{sec.label}</h2>
                  <span className="text-xs text-ink-4 hidden sm:inline">{sec.desc}</span>
                  <span className={clsx('ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0',
                    sec.badge === 'obligatorio' ? 'bg-red-50 text-red-500' : 'bg-kap-50 text-kap-500')}>
                    {sec.badge}
                  </span>
                  <ChevronDown size={14} className={clsx('text-ink-4 group-hover:text-ink-5 transition-transform shrink-0 ml-1',
                    isCollapsed ? '' : 'rotate-180')} />
                </button>
                {!isCollapsed && <div className="space-y-4">

                  {/* ── EMPRESA ── */}
                  {sec.key === 'empresa' && (<>
                    {/* Datos legales obligatorios */}
                    <div className="rounded-xl border border-kap-100 bg-kap-50/50 p-4 space-y-3">
                      <p className="text-[10px] font-bold text-kap-500 uppercase tracking-wider">Datos legales obligatorios</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-ink-7 mb-1.5">
                            RUT empresa <span className="text-red-400">*</span>
                          </label>
                          <input className="input text-sm w-full" placeholder="76.123.456-7"
                            value={form.rut_empresa} onChange={e => setForm(f => ({ ...f, rut_empresa: e.target.value }))} />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-ink-7 mb-1.5">
                            Razón social <span className="text-red-400">*</span>
                          </label>
                          <input className="input text-sm w-full" placeholder="Empresa Ejemplo SpA"
                            value={form.razon_social} onChange={e => setForm(f => ({ ...f, razon_social: e.target.value }))} />
                        </div>
                      </div>
                      {/* Inscrito ChileProveedores */}
                      <button type="button"
                        onClick={() => setForm(f => ({ ...f, inscrito_chile_proveedores: !f.inscrito_chile_proveedores }))}
                        className={clsx(
                          'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg border text-left transition-all',
                          form.inscrito_chile_proveedores
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                            : 'bg-ink-0 border-ink-3 text-ink-6 hover:border-ink-4'
                        )}>
                        <div className={clsx(
                          'w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors',
                          form.inscrito_chile_proveedores ? 'bg-emerald-500' : 'border-2 border-ink-3'
                        )}>
                          {form.inscrito_chile_proveedores && <Check size={10} className="text-white" />}
                        </div>
                        <div>
                          <p className="text-xs font-semibold">Inscrito en ChileProveedores</p>
                          <p className="text-[10px] text-ink-4">Registro de proveedores del Estado</p>
                        </div>
                      </button>
                      {!form.inscrito_chile_proveedores && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
                          <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-semibold text-amber-700">Sin ChileProveedores no puedes postular</p>
                            <p className="text-[10px] text-amber-600 mt-0.5">El registro en chileproveedores.cl es obligatorio para participar en licitaciones públicas. Si aún no tienes cuenta, créala antes de postular a cualquier proceso.</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Datos complementarios */}
                    <div className="space-y-3">
                      <p className="text-[10px] font-bold text-ink-4 uppercase tracking-wider">Datos complementarios</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-ink-6 mb-1.5">Años de experiencia</label>
                          <input type="number" min="0" className="input text-sm w-full" placeholder="5"
                            value={form.experiencia_anos} onChange={e => setForm(f => ({ ...f, experiencia_anos: e.target.value }))} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-ink-6 mb-1.5">Capacidad máxima por proyecto (UF)</label>
                          <input type="number" min="0" className="input text-sm w-full" placeholder="Ej: 5000"
                            value={form.monto_max_proyecto_uf} onChange={e => setForm(f => ({ ...f, monto_max_proyecto_uf: e.target.value }))} />
                          <p className="text-[10px] text-ink-4 mt-1">La IA descarta licitaciones que excedan tu capacidad</p>
                        </div>
                      </div>
                    </div>
                  </>)}

                  {/* ── RUBROS Y REGIONES ── */}
                  {sec.key === 'rubros' && (<>
                    <div>
                      {/* Chips de seleccionados + trigger */}
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-semibold text-ink-7">Rubros donde participas <span className="text-red-400">*</span></label>
                        <div className="flex items-center gap-2">
                          {rubrosLocked ? (
                            <button type="button"
                              onClick={() => setShowUnlockConfirm(true)}
                              className="flex items-center gap-1 text-[10px] text-amber-600 border border-amber-200 bg-amber-50 px-2 py-0.5 rounded-lg hover:bg-amber-100">
                              🔒 Bloqueado · Desbloquear
                            </button>
                          ) : (
                            form.rubros.length > 0 && (
                              <button type="button" onClick={() => setForm(f => ({ ...f, rubros: [] }))} className="text-[10px] text-ink-4 hover:text-red-400">limpiar todo</button>
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
                              <span key={r} className="text-[11px] px-2 py-0.5 rounded-full bg-kap-100 text-kap-700 capitalize">{r}</span>
                            ) : (
                              <button key={r} type="button" onClick={() => toggleRubro(r)}
                                className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-kap-600 text-white capitalize">
                                {r} <X size={9} />
                              </button>
                            )
                          ))}
                        </div>
                      )}

                      {/* Aviso cuando no hay rubros seleccionados */}
                      {form.rubros.length === 0 && !rubrosLocked && (
                        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
                          <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-semibold text-amber-700">Sin rubros no hay búsqueda</p>
                            <p className="text-[10px] text-amber-600 mt-0.5">Selecciona los rubros en los que opera tu empresa. La IA los usa para filtrar licitaciones relevantes y descartar las que no aplican.</p>
                          </div>
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
                              ? 'bg-kap-50 border-kap-100 text-kap-700 hover:bg-kap-100'
                              : 'bg-ink-1 border-ink-3 text-ink-4 cursor-not-allowed')}>
                          {sugiendoRubros
                            ? <><Loader2 size={13} className="animate-spin" /> Analizando tu empresa…</>
                            : <><Sparkles size={13} /> Sugerir rubros automáticamente con IA</>}
                        </button>
                        {!form.descripcion && (
                          <p className="text-[10px] text-ink-4 text-center mt-1">Completa primero "Qué hace tu empresa" para usar esta función</p>
                        )}
                      </div>

                      {/* Rubros sugeridos por IA */}
                      {rubrosSugeridos.length > 0 && (
                        <div className="mb-3 border border-kap-100 bg-kap-50 rounded-xl p-3">
                          <p className="text-[10px] font-semibold text-kap-700 mb-2 flex items-center gap-1">
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
                                      ? 'bg-kap-600 text-white border-kap-600'
                                      : 'bg-white text-kap-700 border-kap-300 hover:bg-kap-100')}>
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
                            className="mt-2 text-[10px] text-kap-600 font-semibold hover:underline">
                            ✓ Agregar todos
                          </button>
                        </div>
                      )}
                      {/* Buscador / rubro personalizado */}
                      <div className="mb-2">
                        <div className="relative">
                          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4" />
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
                            className="w-full text-xs border border-ink-3 rounded-lg pl-7 pr-3 py-1.5 focus:outline-none focus:border-kap-300"
                          />
                        </div>
                        {/* Resultados de búsqueda */}
                        {rubroQuery.trim() !== '' && (() => {
                          const q = rubroQuery.toLowerCase()
                          const matches = RUBRO_CATEGORIAS.flatMap(c => c.rubros).filter(r => r.includes(q))
                          const exactMatch = matches.includes(q)
                          return (
                            <div className="mt-1 border border-ink-3 rounded-xl bg-white shadow-sm overflow-hidden">
                              {matches.slice(0, 8).map(r => (
                                <button key={r} type="button"
                                  onClick={() => { toggleRubro(r); setRubroQuery('') }}
                                  className={clsx('w-full text-left text-xs px-3 py-2 hover:bg-kap-50 flex items-center justify-between capitalize',
                                    form.rubros.includes(r) && 'bg-kap-50 text-kap-700 font-semibold')}>
                                  {r}
                                  {form.rubros.includes(r) && <Check size={11} className="text-kap-600" />}
                                </button>
                              ))}
                              {!exactMatch && (
                                <button type="button"
                                  onClick={() => { const v = rubroQuery.trim().toLowerCase(); if (!form.rubros.includes(v)) toggleRubro(v); setRubroQuery('') }}
                                  className="w-full text-left text-xs px-3 py-2 hover:bg-kap-50 text-kap-600 font-semibold flex items-center gap-2 border-t border-ink-2">
                                  <Plus size={11} /> Agregar "{rubroQuery.trim()}" como rubro personalizado
                                </button>
                              )}
                            </div>
                          )
                        })()}
                      </div>

                      {/* Tabs de categorías */}
                      <div className="border border-ink-3 rounded-xl overflow-hidden">
                        {/* Tab bar */}
                        <div className="flex overflow-x-auto border-b border-ink-3 bg-ink-1 gap-1 p-1.5">
                          {RUBRO_CATEGORIAS.map(cat => {
                            const sel = cat.rubros.filter(r => form.rubros.includes(r)).length
                            const active = tabCat === cat.label
                            return (
                              <button key={cat.label} type="button" onClick={() => setTabCat(cat.label)}
                                className={clsx(
                                  'flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap shrink-0 rounded-lg transition-all',
                                  active
                                    ? 'bg-kap-600 text-white shadow-sm'
                                    : sel > 0
                                      ? 'bg-kap-100 text-kap-700 hover:bg-kap-100'
                                      : 'text-ink-5 hover:text-ink-8 hover:bg-white'
                                )}>
                                {cat.label.split(' ')[0]}
                                {sel > 0 && (
                                  <span className={clsx('text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center shrink-0',
                                    active ? 'bg-white text-kap-600' : 'bg-kap-600 text-white')}>
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
                            <div className="px-3 pt-2 pb-1 flex items-center justify-between border-b border-ink-2 bg-white">
                              <span className="text-[10px] text-ink-4">{cat.rubros.filter(r => form.rubros.includes(r)).length} de {cat.rubros.length} seleccionados</span>
                              <button type="button"
                                onClick={() => {
                                  if (todosSeleccionados) {
                                    setForm(f => ({ ...f, rubros: f.rubros.filter(r => !cat.rubros.includes(r)) }))
                                  } else {
                                    setForm(f => ({ ...f, rubros: Array.from(new Set([...f.rubros, ...cat.rubros])) }))
                                  }
                                }}
                                className="text-[10px] font-semibold text-kap-600 hover:text-kap-700 transition-colors">
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
                                  ? 'bg-kap-600 text-white border-kap-600'
                                  : 'bg-white text-ink-6 border-ink-3 hover:border-kap-300 hover:bg-kap-50')}>
                              {r}
                            </button>
                          ))}
                        </div>
                      </div>
                      </>)}
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-xs font-semibold text-ink-7">Regiones donde operas <span className="text-red-400">*</span>
                          {form.regiones.length > 0 && <span className="ml-2 text-kap-600 font-bold">{form.regiones.length} sel.</span>}
                        </label>
                        <div className="flex gap-2">
                          {form.regiones.length > 0 && <button type="button" onClick={() => setForm(f => ({ ...f, regiones: [] }))} className="text-[10px] text-ink-4 hover:text-red-400">limpiar</button>}
                          <button type="button" onClick={() => setForm(f => ({ ...f, regiones: regionesOrdenadas.map((r: any) => r.codigo) }))} className="text-[10px] text-kap-500 hover:text-kap-700">todas</button>
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
                                form.regiones.includes(r.codigo) ? 'bg-kap-600 text-white border-kap-600' : 'bg-white text-ink-6 border-ink-3 hover:border-kap-300 hover:bg-kap-50')}>
                              {nombre}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div className="pt-3 border-t border-ink-2">
                      <button onClick={() => guardarMutation.mutate()} disabled={guardarMutation.isPending}
                        className={clsx('w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-colors',
                          guardarMutation.isPending
                            ? 'bg-kap-100 text-white cursor-not-allowed'
                            : 'bg-kap-600 text-white hover:bg-kap-700')}>
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
                        <label className="text-xs font-semibold text-ink-7">Descripción <span className="text-red-400">*</span>
                          <span className="ml-1 text-[10px] font-normal text-kap-500">← lo más importante para la IA</span>
                        </label>
                        <button type="button" onClick={() => generarConIA('descripcion')} disabled={generando === 'descripcion'}
                          className="flex items-center gap-1 text-[10px] font-semibold text-kap-600 hover:text-kap-700 disabled:opacity-40">
                          {generando === 'descripcion' ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                          {generando === 'descripcion' ? 'Generando…' : 'Generar con IA'}
                        </button>
                      </div>
                      <textarea className="input text-sm w-full resize-none" rows={4}
                        placeholder={"Ej: Empresa de servicios de aseo e higiene ambiental con 8 años de trayectoria en licitaciones públicas. Ejecutamos contratos para hospitales, municipalidades y organismos de gobierno en la RM y Región del Biobío. Equipo de 40 personas, vehículos propios y maquinaria de última generación. ISO 9001:2015 vigente. Contrato más relevante: Hospital Clínico Regional de Concepción (2023, $180M CLP)."}
                        value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
                    </div>
                  </>)}

                  {/* ── CONTACTO ── */}
                  {sec.key === 'contacto' && (<>
                    <div className="rounded-xl border border-kap-100 bg-kap-50/50 p-4 space-y-3">
                      <p className="text-[10px] font-bold text-kap-500 uppercase tracking-wider">Firmante — aparece en todos los documentos</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-ink-7 mb-1.5">Nombre completo <span className="text-red-400">*</span></label>
                          <input className="input text-xs w-full" placeholder="Juan Pérez"
                            value={form.nombre_contacto} onChange={e => setForm(f => ({ ...f, nombre_contacto: e.target.value }))} />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-ink-7 mb-1.5">Cargo</label>
                          <input className="input text-xs w-full" placeholder="Gerente General"
                            value={form.cargo_contacto} onChange={e => setForm(f => ({ ...f, cargo_contacto: e.target.value }))} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-ink-7 mb-1.5">Teléfono</label>
                          <input className="input text-xs w-full" placeholder="+56 9 1234 5678"
                            value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-ink-7 mb-1.5">Correo</label>
                          <input type="email" className="input text-xs w-full" placeholder="contacto@empresa.cl"
                            value={form.correo} onChange={e => setForm(f => ({ ...f, correo: e.target.value }))} />
                        </div>
                      </div>
                    </div>
                  </>)}

                  {/* ── PORTAFOLIO IA / DOCUMENTOS ── */}
                  {sec.key === 'documentos' && (<>

                    {/* ── Archivos de contexto — la feature más poderosa ── */}
                    <div className="rounded-xl border-2 border-kap-100 bg-kap-50 p-4 mb-5 space-y-3">
                      <div>
                        <p className="text-xs font-bold text-kap-700">Portafolio para la IA — lo más importante de esta sección</p>
                        <p className="text-[11px] text-kap-700 mt-1 leading-relaxed">
                          Sube tu presentación de empresa, portafolio o contratos anteriores.
                          Claude los usa en <strong>todas las propuestas</strong> que generes — sin esto, inventa ejemplos genéricos.
                        </p>
                      </div>

                      {archivosCtx.length > 0 && (
                        <div className="space-y-1.5">
                          {archivosCtx.map(a => (
                            <div key={a.nombre} className="flex items-center gap-2 bg-white rounded-lg border border-kap-100 px-3 py-2">
                              <FileText size={12} className="text-kap-500 shrink-0" />
                              <span className="flex-1 text-xs text-ink-8 truncate font-medium">{a.nombre}</span>
                              <span className="text-[10px] text-ink-4 shrink-0">{(a.tamaño_chars / 1000).toFixed(1)}k chars</span>
                              <button onClick={() => eliminarArchivoCtx(a.nombre)} className="text-ink-4 hover:text-red-400">
                                <X size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <label className={clsx(
                        'flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer transition-colors w-full justify-center',
                        archivosCtxCargando
                          ? 'bg-kap-100 border-kap-100 opacity-60 pointer-events-none'
                          : 'bg-white border-kap-300 hover:bg-kap-100 text-kap-700'
                      )}>
                        {archivosCtxCargando
                          ? <><Loader2 size={13} className="animate-spin" /><span className="text-xs font-semibold">Procesando…</span></>
                          : <><Upload size={13} /><span className="text-xs font-semibold">Subir PDF, TXT o Word</span></>}
                        <input type="file" accept=".pdf,.txt,.md,.doc,.docx" className="hidden"
                          disabled={archivosCtxCargando}
                          onChange={handleArchivoCtx} />
                      </label>

                      {archivosCtx.length === 0 && (
                        <p className="text-[10px] text-kap-500 text-center">Sin archivos — las propuestas serán genéricas</p>
                      )}
                    </div>

                    <hr className="border-ink-3 mb-4" />

                    {/* ── Auto-rellenar perfil desde PDF ── */}
                    {!camposSugeridosPDF ? (
                      <label className={clsx(
                        'flex items-center gap-3 px-4 py-3 rounded-xl border mb-4 cursor-pointer transition-all',
                        analizandoPDF
                          ? 'bg-emerald-50 border-emerald-200 cursor-not-allowed'
                          : 'bg-emerald-50 border-emerald-200 hover:border-emerald-400 hover:bg-emerald-100'
                      )}>
                        <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0">
                          {analizandoPDF ? <Loader2 size={14} className="text-white animate-spin" /> : <Sparkles size={14} className="text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-emerald-900">{analizandoPDF ? 'Analizando con IA…' : 'Rellenar perfil desde PDF'}</p>
                          <p className="text-[10px] text-emerald-600">Sube tu brochure o presentación — la IA completa el formulario</p>
                        </div>
                        {!analizandoPDF && <Upload size={13} className="text-emerald-500 shrink-0" />}
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
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 mb-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 size={13} className="text-emerald-500" />
                            <p className="text-xs font-semibold text-emerald-900">IA extrajo de {nombreArchivoPDF}</p>
                          </div>
                          <button type="button" onClick={() => { setCamposSugeridosPDF(null); setNombreArchivoPDF(null) }}
                            className="text-[10px] text-ink-4 hover:text-ink-6">descartar</button>
                        </div>
                        <div className="space-y-1 max-h-36 overflow-y-auto">
                          {Object.entries(camposSugeridosPDF).filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)).map(([key, val]) => (
                            <div key={key} className="flex items-start gap-2 text-[11px]">
                              <span className="text-ink-4 shrink-0 w-24 truncate capitalize">{key.replace(/_/g, ' ')}</span>
                              <span className="text-ink-8 font-medium line-clamp-1">{Array.isArray(val) ? val.join(', ') : String(val)}</span>
                            </div>
                          ))}
                        </div>
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
                          className="w-full py-2 rounded-lg text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors">
                          Aplicar al perfil
                        </button>
                      </div>
                    )}

                    <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 mb-4">
                      <strong>¿Para qué sirven?</strong> Se adjuntan al generar propuestas con IA. El CV de empresa es obligatorio en la mayoría de licitaciones públicas.
                    </div>
                    <div className="space-y-3">
                      {[...DOCS_TIPOS, ...(docsMeta['otros'] ? [{ key: 'otros', label: 'Otro documento', desc: 'Documento adicional', requerido: false }] : [])].map(doc => {
                        const meta = docsMeta[doc.key]
                        const isUploading = subiendo === doc.key
                        return (
                          <div key={doc.key} className={clsx('border rounded-xl transition-colors',
                            meta ? 'border-emerald-200 bg-emerald-50/40' : 'border-dashed border-ink-3 bg-ink-1 hover:border-kap-300 hover:bg-kap-50/30')}>

                            {/* Estado: archivo subido */}
                            {meta ? (
                              <div className="p-3 flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                                  <FileText size={15} className="text-emerald-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-ink-8 flex items-center gap-1.5">
                                    {doc.label}
                                    {doc.requerido && <span className="text-[10px] text-emerald-600 font-medium">✓ subido</span>}
                                  </p>
                                  <button type="button" onClick={() => verDocumento(doc.key)}
                                    className="text-[10px] text-kap-500 hover:text-kap-700 hover:underline truncate max-w-full text-left">
                                    {meta.nombre} · {Math.round(meta.size / 1024)} KB
                                  </button>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button onClick={() => verDocumento(doc.key)}
                                    className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1.5 rounded-lg hover:bg-white text-kap-500 hover:text-kap-700 border border-transparent hover:border-kap-100" title="Ver documento">
                                    <span>Ver</span>
                                  </button>
                                  <button onClick={() => descargarDocumento(doc.key, meta.nombre)}
                                    className="p-1.5 rounded-lg hover:bg-white text-ink-4 hover:text-ink-7" title="Descargar">
                                    <Download size={13} />
                                  </button>
                                  <button onClick={() => eliminarDocumento(doc.key)}
                                    className="p-1.5 rounded-lg hover:bg-red-50 text-ink-4 hover:text-red-500" title="Eliminar">
                                    <Trash2 size={13} />
                                  </button>
                                  <label className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg cursor-pointer bg-white border border-ink-3 text-ink-6 hover:bg-ink-1 transition-colors">
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
                                <div className="w-10 h-10 rounded-xl bg-kap-100 flex items-center justify-center">
                                  {isUploading
                                    ? <Loader2 size={18} className="text-kap-500 animate-spin" />
                                    : <Upload size={18} className="text-kap-500" />}
                                </div>
                                <div className="text-center">
                                  <p className="text-xs font-semibold text-ink-7">
                                    {doc.label}
                                    {doc.requerido && <span className="ml-1.5 text-red-400 font-normal text-[10px]">requerido</span>}
                                  </p>
                                  <p className="text-[10px] text-ink-4 mt-0.5">{doc.desc}</p>
                                  <p className="text-[10px] text-kap-500 font-semibold mt-2">
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
                      <label className="flex items-center gap-2 text-[10px] text-kap-500 hover:text-kap-700 cursor-pointer w-fit mt-1">
                        <FilePlus size={12} /> Subir otro documento
                        <input type="file" accept=".pdf,.doc,.docx" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) subirDocumento('otros', f); e.target.value = '' }} />
                      </label>
                    </div>
                  </>)}

                </div>}
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
              className="w-full flex items-center justify-center gap-2 text-sm font-semibold py-3 rounded-xl bg-kap-600 text-white hover:bg-kap-700 disabled:opacity-40 shadow-lg transition-colors">
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
              <h3 className="text-base font-bold text-ink-9 mt-2">¿Desbloquear rubros?</h3>
              <p className="text-xs text-ink-5 mt-1">Los rubros definen cómo la IA filtra licitaciones. Al modificarlos podrías perder relevancia en tus alertas actuales.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowUnlockConfirm(false)}
                className="flex-1 text-sm font-semibold py-2 rounded-xl border border-ink-3 text-ink-6 hover:bg-ink-1">
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
            <div className="bg-gradient-to-r from-kap-50 to-kap-200 px-6 py-4 text-white">
              <div className="flex items-center gap-2">
                <Sparkles size={18} />
                <h3 className="text-base font-bold">Análisis de tu perfil</h3>
              </div>
              <p className="text-xs text-kap-300 mt-0.5">Así ve la IA tu empresa al postular licitaciones</p>
            </div>

            <div className="px-6 py-5 space-y-4">
              {generandoResumen ? (
                <div className="flex flex-col items-center gap-3 py-6">
                  <Loader2 size={28} className="animate-spin text-kap-500" />
                  <p className="text-sm text-ink-5">Analizando tu perfil…</p>
                </div>
              ) : resumenIA ? (<>
                {/* Resumen positivo */}
                <div className="bg-kap-50 border border-kap-100 rounded-xl p-4">
                  <p className="text-[11px] font-semibold text-kap-600 uppercase tracking-wide mb-1.5">✅ Tu empresa</p>
                  <p className="text-sm text-ink-7 leading-relaxed">{resumenIA.texto}</p>
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
                className="flex-1 text-sm font-semibold py-2.5 rounded-xl border border-ink-3 text-ink-6 hover:bg-ink-1">
                Seguir editando
              </button>
              <button type="button" onClick={() => { setShowResumenModal(false); navigate('/licitaciones') }}
                className="flex-1 text-sm font-semibold py-2.5 rounded-xl bg-kap-600 text-white hover:bg-kap-700">
                Buscar licitaciones →
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
