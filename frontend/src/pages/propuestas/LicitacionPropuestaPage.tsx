import { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../../api/client'
import StepFeedback from '../../components/ui/StepFeedback'
import toast from 'react-hot-toast'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { jsPDF } from 'jspdf'
import {
  Sparkles, FileText, Copy, Download, ChevronRight, ChevronLeft,
  Building2, CheckCircle2, RotateCcw, Loader2, FileSignature,
  ClipboardList, DollarSign, Mail, BookOpen, Save, ArrowLeft,
  Users, CalendarDays, ExternalLink, AlertCircle, Info, ChevronDown,
  XCircle, Circle, AlertTriangle,
} from 'lucide-react'
import clsx from 'clsx'

type TipoDoc =
  | 'propuesta_tecnica'
  | 'metodologia'
  | 'cv_empresa'
  | 'cv_equipo'
  | 'carta_gantt'
  | 'oferta_economica'
  | 'carta_presentacion'
  | 'carta_seguimiento'

interface TipoItem {
  id: TipoDoc
  label: string
  desc: string
  icon: React.ElementType
  badge?: string
}

const TABS = [
  {
    key: 'tecnica',
    label: 'Sobre 2',
    sublabel: 'Oferta Técnica',
    color: 'violet',
    items: [
      {
        id: 'propuesta_tecnica' as TipoDoc,
        label: 'Propuesta Técnica Completa',
        desc: 'Documento principal. Incluye metodología, experiencia, equipo y valor diferencial usando las bases reales.',
        icon: ClipboardList,
        badge: 'Recomendado',
      },
      {
        id: 'metodologia' as TipoDoc,
        label: 'Metodología de Trabajo',
        desc: 'Cómo ejecutarás el servicio: fases, actividades, control de calidad y gestión de riesgos.',
        icon: FileSignature,
      },
      {
        id: 'cv_empresa' as TipoDoc,
        label: 'Currículum Empresa',
        desc: 'Presentación de la empresa, proyectos similares anteriores, certificaciones y diferenciadores.',
        icon: Building2,
      },
      {
        id: 'cv_equipo' as TipoDoc,
        label: 'CV del Equipo',
        desc: 'Perfiles del equipo que ejecutará el contrato, con roles y experiencia relevante.',
        icon: Users,
      },
      {
        id: 'carta_gantt' as TipoDoc,
        label: 'Plan de Trabajo / Carta Gantt',
        desc: 'Cronograma con actividades, semanas e hitos clave. Tabla lista para adjuntar.',
        icon: CalendarDays,
      },
    ] as TipoItem[],
  },
  {
    key: 'economica',
    label: 'Sobre 3',
    sublabel: 'Oferta Económica',
    color: 'emerald',
    items: [
      {
        id: 'oferta_economica' as TipoDoc,
        label: 'Oferta Económica',
        desc: 'Tabla itemizada con precios unitarios, cantidades, subtotal, IVA y total.',
        icon: DollarSign,
      },
    ] as TipoItem[],
  },
  {
    key: 'comunicaciones',
    label: 'Comunicaciones',
    sublabel: 'Cartas',
    color: 'blue',
    items: [
      {
        id: 'carta_presentacion' as TipoDoc,
        label: 'Carta de Presentación',
        desc: 'Carta formal dirigida al organismo para acompañar la oferta. Formato legal chileno estándar.',
        icon: Mail,
      },
      {
        id: 'carta_seguimiento' as TipoDoc,
        label: 'Carta de Seguimiento',
        desc: 'Para enviar después de postular, reforzando tu oferta ante el evaluador.',
        icon: BookOpen,
      },
    ] as TipoItem[],
  },
]

const TODOS_TIPOS: TipoItem[] = TABS.flatMap(t => t.items)

const PASOS_EXTERNOS = [
  { num: '1', titulo: 'Inscripción en Registro de Proveedores', desc: 'Debes estar inscrito y en estado hábil en ChileProveedores.', url: 'https://www.registrodeproveedores.cl', urlLabel: 'ChileProveedores', obligatorio: true },
  { num: '2', titulo: 'Declaración Jurada de no inhabilidades', desc: 'Se firma digitalmente en Mercado Público al subir la oferta.', url: 'https://www.mercadopublico.cl', urlLabel: 'Mercado Público', obligatorio: true },
  { num: '3', titulo: 'Certificado sin deuda tributaria (SII)', desc: 'Algunas licitaciones lo exigen. Se descarga desde el SII.', url: 'https://misiir.sii.cl/cgi_misii/stpag.cgi', urlLabel: 'SII en línea', obligatorio: false },
  { num: '4', titulo: 'Certificado previsional F30 (PREVIRED)', desc: 'Acredita que no tienes deudas con AFP o isapres.', url: 'https://www.previred.com', urlLabel: 'Previred', obligatorio: false },
  { num: '5', titulo: 'Garantía de seriedad de la oferta', desc: 'Solo si las bases la exigen. Se tramita con tu banco o aseguradora.', url: 'https://www.chilecompra.cl/garantias', urlLabel: 'Ver guía', obligatorio: false },
  { num: '6', titulo: 'Subir oferta y postular en Mercado Público', desc: 'Adjuntas todos los documentos en la plataforma antes del cierre.', url: 'https://www.mercadopublico.cl', urlLabel: 'Ir a postular', obligatorio: true },
]

interface PostulacionItem {
  id: string
  licitacion_nombre?: string
  licitacion_organismo?: string
  licitacion_codigo?: string
  licitacion_monto?: number
  postulacion_estado?: string
  score?: number | null
  documentos_ia?: Array<{ tipo: string; label: string; texto: string; created_at: string }>
}

// Estado de un documento: pending | done | fields (tiene [CAMPOS] sin rellenar)
type DocStatus = { state: 'done' | 'fields' | 'pending'; savedAt?: string }

const PERFIL_CAMPOS_CHECK = [
  { key: 'rut_empresa',          label: 'RUT empresa',            critical: true },
  { key: 'razon_social',         label: 'Razón social',           critical: true },
  { key: 'descripcion',          label: 'Descripción empresa',    critical: true },
  { key: 'rubros',               label: 'Rubros',                 critical: true },
  { key: 'nombre_contacto',      label: 'Nombre del firmante',    critical: true },
  { key: 'cargo_contacto',       label: 'Cargo del firmante',     critical: false },
  { key: 'correo',               label: 'Correo electrónico',     critical: false },
  { key: 'telefono',             label: 'Teléfono',               critical: false },
  { key: 'proyectos_anteriores', label: 'Proyectos anteriores',   critical: false },
  { key: 'equipo_tecnico',       label: 'Equipo técnico',         critical: false },
  { key: 'certificaciones',      label: 'Certificaciones',        critical: false },
]

// Campos requeridos por documento — si faltan, ese doc se bloquea
const DOC_CAMPOS_REQUERIDOS: Record<TipoDoc, string[]> = {
  propuesta_tecnica:  ['rut_empresa', 'razon_social', 'descripcion', 'rubros', 'nombre_contacto'],
  metodologia:        ['razon_social', 'descripcion', 'rubros'],
  cv_empresa:         ['rut_empresa', 'razon_social', 'descripcion', 'proyectos_anteriores'],
  cv_equipo:          ['razon_social', 'equipo_tecnico'],
  carta_gantt:        ['razon_social', 'descripcion'],
  oferta_economica:   ['rut_empresa', 'razon_social', 'nombre_contacto'],
  carta_presentacion: ['rut_empresa', 'razon_social', 'nombre_contacto', 'cargo_contacto', 'correo'],
  carta_seguimiento:  ['razon_social', 'nombre_contacto', 'correo'],
}

// Mapea patrones de [CAMPO] en documentos → campo del perfil donde vive el dato
// Si no está en este mapa = dato específico de la licitación = completar a mano
const CAMPOS_A_PERFIL: Array<{ patron: RegExp; perfilKey: string; perfilLabel: string }> = [
  { patron: /representante legal|firmante|nombre del firmante/i,      perfilKey: 'nombre_contacto',      perfilLabel: 'Nombre del firmante' },
  { patron: /cargo|jefe|director.*empresa|gerente/i,                   perfilKey: 'cargo_contacto',       perfilLabel: 'Cargo del firmante' },
  { patron: /tel[eé]fono|fono|celular|móvil/i,                        perfilKey: 'telefono',             perfilLabel: 'Teléfono' },
  { patron: /correo|email|e-mail/i,                                    perfilKey: 'correo',               perfilLabel: 'Correo electrónico' },
  { patron: /sitio web|página web|web|url empresa/i,                   perfilKey: 'sitio_web',            perfilLabel: 'Sitio web' },
  { patron: /direcci[oó]n|domicilio/i,                                 perfilKey: 'direccion',            perfilLabel: 'Dirección' },
  { patron: /rut empresa|rut del oferente|rut de la empresa/i,         perfilKey: 'rut_empresa',          perfilLabel: 'RUT empresa' },
  { patron: /raz[oó]n social|nombre empresa|nombre de la empresa/i,    perfilKey: 'razon_social',         perfilLabel: 'Razón social' },
  { patron: /experiencia|a[ñn]os de experiencia/i,                     perfilKey: 'experiencia_anos',     perfilLabel: 'Años de experiencia' },
  { patron: /certificaci[oó]n/i,                                       perfilKey: 'certificaciones',      perfilLabel: 'Certificaciones' },
]

const STEPS = ['Documento', 'Licitación', 'Generar']

const TAB_ACTIVE: Record<string, string> = {
  violet: 'border-violet-500 text-violet-700 bg-violet-50',
  emerald: 'border-emerald-500 text-emerald-700 bg-emerald-50',
  blue: 'border-blue-500 text-blue-700 bg-blue-50',
}
const TAB_INACTIVE = 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'

const CARD_SELECTED: Record<string, string> = {
  violet: 'border-violet-500 bg-violet-50 shadow-sm',
  emerald: 'border-emerald-500 bg-emerald-50 shadow-sm',
  blue: 'border-blue-500 bg-blue-50 shadow-sm',
}
const ICON_SELECTED: Record<string, string> = {
  violet: 'text-violet-600 bg-violet-100',
  emerald: 'text-emerald-600 bg-emerald-100',
  blue: 'text-blue-600 bg-blue-100',
}
const CHECK_COLOR: Record<string, string> = {
  violet: 'text-violet-500',
  emerald: 'text-emerald-500',
  blue: 'text-blue-500',
}

export default function LicitacionPropuestaPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const urlProspectId = searchParams.get('prospect_id')

  const [step, setStep] = useState(0)
  const [activeTab, setActiveTab] = useState(0)
  const [tipo, setTipo] = useState<TipoDoc | ''>('')
  const [selectedPostulacion, setSelectedPostulacion] = useState<PostulacionItem | null>(null)
  const [instrucciones, setInstrucciones] = useState('')
  const [resultado, setResultado] = useState('')
  const [campoValues, setCampoValues] = useState<Record<string, string>>({})
  const [copiado, setCopiado] = useState(false)
  const [docViewer, setDocViewer] = useState<{ texto: string; titulo: string } | null>(null)
  const [guardado, setGuardado] = useState(false)
  const [externosOpen, setExternosOpen] = useState(false)
  // Tracker local: { [tipoDoc]: DocStatus }
  const [docStatuses, setDocStatuses] = useState<Record<string, DocStatus>>({})
  // Preflight: mostrar checklist inicial
  const [preflightDismissed, setPreflightDismissed] = useState(false)
  const [modoTodos, setModoTodos] = useState(false)
  const [todosSeleccionados, setTodosSeleccionados] = useState<Set<TipoDoc>>(
    new Set(TODOS_TIPOS.map(t => t.id)))
  const [todosProgreso, setTodosProgreso] = useState<{
    corriendo: boolean; actual: number; total: number; labelActual: string
    resultados: Partial<Record<TipoDoc, string>>; errores: Set<TipoDoc>
  }>({ corriendo: false, actual: 0, total: 0, labelActual: '', resultados: {}, errores: new Set() })
  const [showFeedbackDocs, setShowFeedbackDocs] = useState(false)
  const canceladoRef = useRef(false)

  const { data: postulacionesData, isLoading: loadingPostulaciones } = useQuery({
    queryKey: ['licit-postulaciones-propuesta'],
    queryFn: () => api.get('/modules/licitaciones/prospectos').then(r => r.data),
  })
  const postulaciones: PostulacionItem[] = postulacionesData?.items ?? []

  const { data: perfilEmpresa } = useQuery({
    queryKey: ['licitaciones-profile-propuesta'],
    queryFn: () => api.get('/tenant/me/licitaciones-profile').then(r => r.data).catch(() => null),
    staleTime: 5 * 60 * 1000,
  })

  // Cuando se carga la postulación seleccionada, inicializar docStatuses desde documentos_ia guardados
  useEffect(() => {
    if (!urlProspectId || !postulaciones.length || selectedPostulacion) return
    const match = postulaciones.find(p => p.id === urlProspectId)
    if (match) {
      setSelectedPostulacion(match)
      // Inicializar estados desde docs guardados
      if (match.documentos_ia?.length) {
        const initial: Record<string, DocStatus> = {}
        for (const doc of match.documentos_ia) {
          initial[doc.tipo] = { state: 'done', savedAt: doc.created_at }
        }
        setDocStatuses(initial)
        // Si ya tiene docs, abrir directo en "Generar todos" con licitación seleccionada
        setModoTodos(true)
      } else {
        setStep(tipo ? 2 : 1)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlProspectId, postulaciones])

  const generarMutation = useMutation({
    mutationFn: () => {
      if (!selectedPostulacion) throw new Error('Sin licitación seleccionada')
      return api.post(`/modules/licitaciones/propuesta/${selectedPostulacion.id}`, {
        tipo_documento: tipo,
        instrucciones_extra: instrucciones.trim() || undefined,
      }).then(r => r.data)
    },
    onSuccess: async (data) => {
      const texto = data.propuesta ?? data.texto ?? JSON.stringify(data)
      setResultado(texto)
      setStep(3)
      // Auto-guardar inmediatamente en la postulación
      if (selectedPostulacion && tipo) {
        const tipoInfo = TODOS_TIPOS.find(t => t.id === tipo)
        try {
          await api.patch(`/modules/licitaciones/prospectos/${selectedPostulacion.id}/notas`, {
            notes: texto,
            tipo_doc: tipo,
            label_doc: tipoInfo?.label ?? tipo,
          })
          setGuardado(true)
          const tieneCampos = detectarCampos(texto).length > 0
          setDocStatuses(prev => ({ ...prev, [tipo]: { state: tieneCampos ? 'fields' : 'done', savedAt: new Date().toISOString() } }))
          queryClient.invalidateQueries({ queryKey: ['licitaciones-postulaciones'] })
          queryClient.invalidateQueries({ queryKey: ['licit-postulaciones-propuesta'] })
        } catch { /* silencioso — el usuario puede guardarlo manualmente */ }
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Error al generar. Intenta de nuevo.'),
  })

  const guardarMutation = useMutation({
    mutationFn: () => {
      if (!selectedPostulacion) throw new Error('Sin postulación')
      const tipoInfo = TODOS_TIPOS.find(t => t.id === tipo)
      return api.patch(`/modules/licitaciones/prospectos/${selectedPostulacion.id}/notas`, {
        notes: resultado,
        tipo_doc: tipo,
        label_doc: tipoInfo?.label ?? tipo,
      })
    },
    onSuccess: () => {
      setGuardado(true)
      toast.success('Documento guardado en la postulación')
      // Marcar en tracker
      if (tipo) {
        const tieneCampos = detectarCampos(resultado).length > 0
        setDocStatuses(prev => ({ ...prev, [tipo]: { state: tieneCampos ? 'fields' : 'done', savedAt: new Date().toISOString() } }))
      }
      // Refrescar Mis postulaciones para que aparezca el documento
      queryClient.invalidateQueries({ queryKey: ['licitaciones-postulaciones'] })
    },
    onError: () => toast.error('Error al guardar.'),
  })

  const detectarCampos = (texto: string): string[] => {
    const m1: string[] = texto.match(/\[[A-Z\u00C0-\u017E_\s]{3,60}\\?\]/g) ?? []
    const m2: string[] = texto.match(/\[(?!\[)[^\]]{3,60}\\?\]/g) ?? []
    return Array.from(new Set([...m1, ...m2]
      .map(c => c.replace(/\\$/, '').replace(/\\\]$/, ']'))
      .filter(c => /[A-Z\u00C0-\u017E_]/.test(c)))).slice(0, 12)
  }

  const puedeAvanzar = () => {
    if (step === 0) return !!tipo
    if (step === 1) {
      if (!selectedPostulacion) return false
      const score = selectedPostulacion.score
      if (score == null || score === 0 || score < 50) return false
      return true
    }
    return true
  }

  const copiar = () => {
    navigator.clipboard.writeText(resultadoConCampos); setCopiado(true)
    toast.success('Copiado al portapapeles')
    setTimeout(() => setCopiado(false), 2500)
  }

  const descargarPDF = (textoDoc: string, tipoLabel: string, nombreLicit: string) => {
    const titulo = `${tipoLabel} — ${nombreLicit.slice(0, 60)}`
    const nombreArchivo = `${tipoLabel.replace(/\s+/g, '_')}_${nombreLicit.slice(0, 40).replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
    const fecha = new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const marginX = 20; const pageWidth = doc.internal.pageSize.getWidth(); const maxWidth = pageWidth - marginX * 2; let y = 20
    const checkPage = (n = 8) => { if (y + n > doc.internal.pageSize.getHeight() - 15) { doc.addPage(); y = 20 } }
    doc.setFillColor(79, 70, 229); doc.rect(0, 0, pageWidth, 14, 'F')
    doc.setTextColor(255, 255, 255); doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text('KAPTURO', marginX, 9.5)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(`Generado el ${fecha}`, pageWidth - marginX, 9.5, { align: 'right' }); y = 22
    doc.setTextColor(30, 27, 75); doc.setFontSize(14); doc.setFont('helvetica', 'bold')
    const tituloLines = doc.splitTextToSize(titulo, maxWidth); doc.text(tituloLines, marginX, y); y += tituloLines.length * 7 + 4
    doc.setDrawColor(199, 210, 254); doc.line(marginX, y, pageWidth - marginX, y); y += 6
    for (const raw of textoDoc.split('\n')) {
      const line = raw.trim(); if (!line) { y += 3; continue }; checkPage(10)
      if (line.startsWith('## ') || line.startsWith('# ')) {
        y += 2; doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(49, 46, 129)
        const wrapped = doc.splitTextToSize(line.replace(/^#+\s+/, ''), maxWidth); doc.text(wrapped, marginX, y); y += wrapped.length * 6 + 3
        doc.setDrawColor(224, 231, 255); doc.line(marginX, y, pageWidth - marginX, y); y += 4
      } else if (line.startsWith('### ')) {
        doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(55, 65, 81)
        const wrapped = doc.splitTextToSize(line.replace(/^###\s+/, ''), maxWidth); doc.text(wrapped, marginX, y); y += wrapped.length * 5.5 + 2
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        doc.setFontSize(9.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30)
        const text = line.replace(/^[-*]\s+/, '').replace(/\*\*(.+?)\*\*/g, '$1')
        const wrapped = doc.splitTextToSize(`\u2022 ${text}`, maxWidth - 4); checkPage(wrapped.length * 5); doc.text(wrapped, marginX + 3, y); y += wrapped.length * 5 + 1
      } else {
        doc.setFontSize(9.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30)
        const wrapped = doc.splitTextToSize(line.replace(/\*\*(.+?)\*\*/g, '$1'), maxWidth); checkPage(wrapped.length * 5); doc.text(wrapped, marginX, y); y += wrapped.length * 5 + 1.5
      }
    }
    const totalPages = doc.getNumberOfPages()
    for (let pg = 1; pg <= totalPages; pg++) {
      doc.setPage(pg)
      doc.saveGraphicsState()
      doc.setGState(new (doc as any).GState({ opacity: 0.07 }))
      doc.setFontSize(52); doc.setFont('helvetica', 'bold'); doc.setTextColor(79, 70, 229)
      const cx = pageWidth / 2; const cy = doc.internal.pageSize.getHeight() / 2
      doc.text('KAPTURO', cx, cy, { align: 'center', angle: 45 })
      doc.restoreGraphicsState()
    }
    doc.save(nombreArchivo)
  }

  const descargar = () => {
    const nombre = selectedPostulacion?.licitacion_nombre ?? 'licitacion'
    const tipoInfo = TODOS_TIPOS.find(t => t.id === tipo)
    descargarPDF(resultadoConCampos, tipoInfo?.label ?? String(tipo), nombre)
  }

  const reiniciar = () => {
    setTipo(''); setInstrucciones(''); setResultado(''); setGuardado(false); setStep(0); setActiveTab(0); setCampoValues({})
    // No resetear selectedPostulacion ni docStatuses — mantener contexto de licitación
  }

  // Aplica los valores escritos por el usuario a los [CAMPOS] del resultado
  const resultadoConCampos = resultado.replace(/\[([^\]]{3,60})\]/g, (match) => {
    const key = match.replace(/[\[\]\\]/g, '').trim()
    return campoValues[key] !== undefined && campoValues[key] !== '' ? campoValues[key] : match
  })

  const handleGenerarTodos = async () => {
    if (!selectedPostulacion) return
    const score = selectedPostulacion.score
    if (score == null || score === 0 || score < 50) {
      toast.error('Debes analizar esta licitación con IA antes de generar documentos')
      return
    }
    // Only generate unlocked docs
    const docs = Array.from(todosSeleccionados).filter(id => {
      const reqs = DOC_CAMPOS_REQUERIDOS[id] ?? []
      return reqs.every(key => {
        const val = perfilEmpresa?.[key]
        return val && (!Array.isArray(val) || val.length > 0)
      })
    })
    const resultados: Partial<Record<TipoDoc, string>> = {}
    const errores = new Set<TipoDoc>()
    canceladoRef.current = false
    setTodosProgreso({ corriendo: true, actual: 0, total: docs.length, labelActual: '', resultados: {}, errores: new Set() })
    for (let i = 0; i < docs.length; i++) {
      if (canceladoRef.current) break
      const tipoDoc = docs[i]
      const tipoInfo = TODOS_TIPOS.find(t => t.id === tipoDoc)
      setTodosProgreso(prev => ({ ...prev, actual: i, labelActual: tipoInfo?.label ?? tipoDoc }))
      try {
        const res = await api.post(`/modules/licitaciones/propuesta/${selectedPostulacion.id}`, {
          tipo_documento: tipoDoc,
          instrucciones_extra: instrucciones.trim() || undefined,
        })
        const texto: string = res.data.propuesta ?? res.data.texto ?? ''
        resultados[tipoDoc] = texto
        await api.patch(`/modules/licitaciones/prospectos/${selectedPostulacion.id}/notas`, {
          notes: texto, tipo_doc: tipoDoc, label_doc: tipoInfo?.label ?? tipoDoc,
        })
        const tieneCampos = detectarCampos(texto).length > 0
        setDocStatuses(prev => ({ ...prev, [tipoDoc]: { state: tieneCampos ? 'fields' : 'done', savedAt: new Date().toISOString() } }))
      } catch { errores.add(tipoDoc) }
      setTodosProgreso(prev => ({ ...prev, resultados: { ...resultados }, errores: new Set(errores) }))
    }
    setTodosProgreso(prev => ({ ...prev, corriendo: false, actual: docs.length, labelActual: 'Completado' }))
    // Refrescar Mis postulaciones
    queryClient.invalidateQueries({ queryKey: ['licitaciones-postulaciones'] })
    queryClient.invalidateQueries({ queryKey: ['licit-postulaciones-propuesta'] })
    if (errores.size === 0) {
      toast.success(`✅ ${docs.length} documentos generados y guardados`)
      setShowFeedbackDocs(true)
    }
    else toast.error(`${errores.size} documento${errores.size !== 1 ? 's' : ''} fallaron`)
  }

  // ── Paso 0: Selección con tabs ─────────────────────────────────────────
  const renderTipo = () => {
    const currentTab = TABS[activeTab]
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-500">Selecciona el tipo de documento que necesitas generar.</p>
        <div className="grid grid-cols-3 gap-2">
          {TABS.map((tab, i) => {
            const doneInTab = tab.items.filter(item => docStatuses[item.id]?.state === 'done').length
            const TabIcon = tab.color === 'violet' ? ClipboardList : tab.color === 'emerald' ? DollarSign : Mail
            return (
              <button key={tab.key} onClick={() => setActiveTab(i)}
                className={clsx(
                  'flex flex-col items-center gap-1 p-3.5 rounded-xl border-2 transition-all text-center',
                  activeTab === i
                    ? tab.color === 'violet' ? 'border-violet-500 bg-violet-50' : tab.color === 'emerald' ? 'border-emerald-500 bg-emerald-50' : 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                )}
              >
                <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center',
                  activeTab === i
                    ? tab.color === 'violet' ? 'bg-violet-100' : tab.color === 'emerald' ? 'bg-emerald-100' : 'bg-blue-100'
                    : 'bg-gray-100'
                )}>
                  <TabIcon size={16} className={activeTab === i
                    ? tab.color === 'violet' ? 'text-violet-600' : tab.color === 'emerald' ? 'text-emerald-600' : 'text-blue-600'
                    : 'text-gray-400'} />
                </div>
                <div>
                  <p className={clsx('text-sm font-bold leading-tight',
                    activeTab === i
                      ? tab.color === 'violet' ? 'text-violet-700' : tab.color === 'emerald' ? 'text-emerald-700' : 'text-blue-700'
                      : 'text-gray-700'
                  )}>{tab.label}</p>
                  <p className={clsx('text-[11px] font-medium',
                    activeTab === i
                      ? tab.color === 'violet' ? 'text-violet-500' : tab.color === 'emerald' ? 'text-emerald-500' : 'text-blue-500'
                      : 'text-gray-400'
                  )}>{tab.sublabel}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{tab.items.length} documento{tab.items.length !== 1 ? 's' : ''}</p>
                </div>
                {doneInTab > 0 && (
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">
                    {doneInTab} generado{doneInTab !== 1 ? 's' : ''} ✓
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div className="space-y-2.5 pt-1">
          {currentTab.items.map(t => {
            const Icon = t.icon
            const sel = tipo === t.id
            const status = docStatuses[t.id]
            return (
              <button key={t.id} onClick={() => setTipo(t.id)}
                className={clsx('w-full flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all',
                  sel ? CARD_SELECTED[currentTab.color] : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50')}
              >
                <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-colors',
                  sel ? ICON_SELECTED[currentTab.color] : 'bg-gray-100 text-gray-400')}>
                  <Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-semibold text-sm text-gray-900">{t.label}</p>
                    {t.badge && <span className="text-[10px] bg-violet-600 text-white px-2 py-0.5 rounded-full font-semibold tracking-wide">{t.badge}</span>}
                    {/* Status badge */}
                    {status?.state === 'done' && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5"><CheckCircle2 size={9} /> Generado</span>}
                    {status?.state === 'fields' && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5"><AlertTriangle size={9} /> Campos por completar</span>}
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">{t.desc}</p>
                </div>
                {sel && <CheckCircle2 size={18} className={clsx('shrink-0 mt-1', CHECK_COLOR[currentTab.color])} />}
              </button>
            )
          })}
        </div>
        {tipo && (
          <div className="flex items-center gap-2 text-xs text-gray-500 pt-1 border-t border-gray-100">
            <CheckCircle2 size={13} className="text-emerald-500" />
            <span>Seleccionado: <strong className="text-gray-700">{TODOS_TIPOS.find(t => t.id === tipo)?.label}</strong></span>
          </div>
        )}
      </div>
    )
  }

  // ── Paso 1: Licitación ─────────────────────────────────────────────────
  const renderLicitacion = () => (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">¿Para qué licitación quieres generar el documento?</p>
      {loadingPostulaciones ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 size={20} className="animate-spin mr-2" /> Cargando postulaciones...
        </div>
      ) : postulaciones.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-700">
          No tienes licitaciones guardadas. Ve a <strong>Licitaciones</strong> y guarda alguna primero.
        </div>
      ) : (
        <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
          {postulaciones.map(p => {
            const sel = selectedPostulacion?.id === p.id
            const docsCount = p.documentos_ia?.length ?? 0
            return (
              <button key={p.id} onClick={() => setSelectedPostulacion(p)}
                className={clsx('w-full text-left p-4 rounded-xl border-2 transition-all',
                  sel ? 'border-violet-500 bg-violet-50 shadow-sm' : 'border-gray-200 hover:border-violet-200 hover:bg-gray-50')}
              >
                <div className="flex items-start gap-3">
                  <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                    sel ? 'bg-violet-100 text-violet-600' : 'bg-gray-100 text-gray-400')}>
                    <FileText size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={clsx('text-sm font-semibold truncate mb-1', sel ? 'text-violet-900' : 'text-gray-900')}>
                      {p.licitacion_nombre ?? p.licitacion_codigo ?? p.id}
                    </p>
                    {p.licitacion_organismo && <p className="text-xs text-gray-500 truncate">{p.licitacion_organismo}</p>}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {p.licitacion_codigo && <span className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-mono">{p.licitacion_codigo}</span>}
                      {p.licitacion_monto && <span className="text-[11px] font-semibold text-gray-600">{new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(p.licitacion_monto)}</span>}
                      {p.postulacion_estado && <span className="text-[11px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium capitalize">{p.postulacion_estado.replace(/_/g, ' ')}</span>}
                      {p.score != null && p.score > 0
                        ? <span className={clsx('text-[11px] px-2 py-0.5 rounded-full font-bold', p.score >= 75 ? 'bg-emerald-100 text-emerald-700' : p.score >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600')}>{p.score} pts</span>
                        : <span className="text-[11px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">Sin analizar</span>}
                      {docsCount > 0 && <span className="text-[11px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">{docsCount} doc{docsCount > 1 ? 's' : ''}</span>}
                    </div>
                  </div>
                  {sel && <CheckCircle2 size={18} className="text-violet-500 shrink-0 mt-1" />}
                </div>
              </button>
            )
          })}
        </div>
      )}
      {selectedPostulacion && (selectedPostulacion.score == null || selectedPostulacion.score === 0 || selectedPostulacion.score < 50) && (
        <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <span className="text-red-500 shrink-0">⛔</span>
          <div>
            <p className="text-xs font-bold text-red-700">
              {selectedPostulacion.score == null || selectedPostulacion.score === 0
                ? 'Esta licitación no ha sido analizada con IA'
                : `Score insuficiente: ${selectedPostulacion.score}/100`}
            </p>
            <p className="text-[11px] text-red-600 mt-0.5">
              Ve a <strong>Mis postulaciones</strong> y haz clic en "Analizar" para obtener un score antes de generar documentos.
            </p>
          </div>
        </div>
      )}
    </div>
  )

  // ── Paso 2: Generar ────────────────────────────────────────────────────
  const renderGenerar = () => {
    const tipoInfo = TODOS_TIPOS.find(t => t.id === tipo)
    const currentTab = TABS.find(tab => tab.items.some(i => i.id === tipo))
    const perfilFaltante = PERFIL_CAMPOS_CHECK.filter(c => {
      const val = perfilEmpresa?.[c.key]
      return !val || (Array.isArray(val) && val.length === 0)
    })
    return (
      <div className="space-y-4">
        {/* Banner: generar todos vs solo este */}
        <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200 rounded-xl px-4 py-2.5">
          <p className="text-xs font-semibold text-violet-800">✨ ¿Generar todos los documentos de una vez?</p>
          <button onClick={() => setModoTodos(true)}
            className="text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors">
            Generar todos →
          </button>
        </div>
        {/* Resumen compacto — solo referencia visual */}
        <div className="flex items-center gap-2 flex-wrap">
          {tipoInfo && currentTab && (
            <span className={clsx('inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full',
              currentTab.color === 'violet' ? 'bg-violet-100 text-violet-700' :
              currentTab.color === 'emerald' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
            )}>
              <CheckCircle2 size={12} /> {tipoInfo.label}
            </span>
          )}
          {selectedPostulacion?.licitacion_nombre && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 max-w-[260px]">
              <FileText size={11} className="shrink-0" />
              <span className="truncate">{selectedPostulacion.licitacion_nombre}</span>
            </span>
          )}
        </div>

        {/* Aviso perfil incompleto */}
        {perfilFaltante.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle size={14} className="text-amber-600 shrink-0" />
                <p className="text-xs font-semibold text-amber-800">{perfilFaltante.length} campo{perfilFaltante.length > 1 ? 's' : ''} del perfil sin completar</p>
              </div>
              <button onClick={() => navigate('/licitaciones/perfil')}
                className="text-[10px] text-amber-700 font-semibold underline hover:no-underline whitespace-nowrap">
                Completar perfil →
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {perfilFaltante.map(c => (
                <span key={c.key} className={clsx('text-[10px] px-1.5 py-0.5 rounded font-medium',
                  c.critical ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>
                  {c.critical ? '⚠️ ' : ''}{c.label}
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">Instrucciones adicionales <span className="text-gray-400 font-normal">(opcional)</span></label>
          <textarea className="input resize-none text-sm" rows={4}
            placeholder="Ej: Resaltar experiencia en proyectos municipales, precio máximo $5.000.000, mencionar socio clave..."
            value={instrucciones} onChange={e => setInstrucciones(e.target.value)} />
          <p className="text-xs text-gray-400 mt-1.5">La IA usará las bases reales de la licitación + el perfil de tu empresa automáticamente.</p>
        </div>

        <div className="bg-violet-50 border border-violet-100 rounded-xl p-3.5 flex items-center gap-3">
          <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center shrink-0">
            <Sparkles size={16} className="text-violet-600" />
          </div>
          <p className="text-xs text-violet-700"><strong>20–40 seg.</strong> Claude descarga las bases reales y redacta el documento adaptado a tu empresa.</p>
        </div>
      </div>
    )
  }

  // ── Resultado ──────────────────────────────────────────────────────────
  const renderResultado = () => {
    const tipoInfo = TODOS_TIPOS.find(t => t.id === tipo)
    const currentTab = TABS.find(tab => tab.items.some(i => i.id === tipo))
    const camposVacios = detectarCampos(resultado)
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-emerald-600">
            <CheckCircle2 size={18} />
            <p className="text-sm font-semibold">Documento generado</p>
          </div>
          {tipoInfo && currentTab && (
            <span className={clsx('text-xs px-2.5 py-1 rounded-full font-medium',
              currentTab.color === 'violet' ? 'bg-violet-100 text-violet-700' :
              currentTab.color === 'emerald' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
            )}>{tipoInfo.label}</span>
          )}
        </div>
        {camposVacios.length > 0 && (() => {
          // Clasificar cada campo: ¿viene del perfil o es dato de la licitación?
          const camposConPerfil: Array<{ campo: string; perfilKey: string; perfilLabel: string; filled: boolean }> = []
          const camposManuales: string[] = []
          for (const campo of camposVacios) {
            const textoLimpio = campo.replace(/[\[\]\\]/g, '')
            const match = CAMPOS_A_PERFIL.find(m => m.patron.test(textoLimpio))
            if (match) {
              const filled = !!(perfilEmpresa?.[match.perfilKey] && (
                !Array.isArray(perfilEmpresa[match.perfilKey]) || perfilEmpresa[match.perfilKey].length > 0
              ))
              camposConPerfil.push({ campo, perfilKey: match.perfilKey, perfilLabel: match.perfilLabel, filled })
            } else {
              camposManuales.push(campo)
            }
          }
          const hayVaciosEnPerfil = camposConPerfil.some(c => !c.filled)
          return (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertCircle size={15} className="text-amber-600 shrink-0" />
                <p className="text-sm font-semibold text-amber-800">¡Completa estos campos antes de entregar!</p>
              </div>
              {/* Campos que vienen del perfil */}
              {camposConPerfil.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-amber-800">📋 Datos de tu empresa — {hayVaciosEnPerfil ? 'completa el perfil para auto-rellenar' : 'ya están en el perfil ✓'}</p>
                    {hayVaciosEnPerfil && (
                      <button onClick={() => navigate('/licitaciones/perfil')}
                        className="text-[10px] font-bold text-violet-600 bg-violet-100 hover:bg-violet-200 px-2 py-1 rounded-lg whitespace-nowrap transition-colors">
                        Completar perfil →
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {camposConPerfil.map(c => (
                      <span key={c.campo}
                        className={clsx('text-[11px] font-mono px-2 py-0.5 rounded font-semibold flex items-center gap-1',
                          c.filled ? 'bg-emerald-100 text-emerald-800 line-through opacity-60' : 'bg-amber-200 text-amber-900')}>
                        {c.campo.replace(/[\[\]\\]/g, '')}
                        {!c.filled && <span className="text-[9px] font-sans font-normal ml-0.5 opacity-70">→ {c.perfilLabel}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {/* Campos específicos de la licitación — rellenar aquí */}
              {camposManuales.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-amber-800">✏️ Completa estos datos de la licitación</p>
                  <div className="space-y-1.5">
                    {camposManuales.map(c => {
                      const key = c.replace(/[\[\]\\]/g, '').trim()
                      const filled = campoValues[key] !== undefined && campoValues[key] !== ''
                      return (
                        <div key={c} className="flex items-center gap-2">
                          <span className={clsx('text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 font-semibold', filled ? 'bg-emerald-100 text-emerald-800' : 'bg-orange-100 text-orange-900')}>
                            {key}
                          </span>
                          <input
                            type="text"
                            placeholder={`Escribe ${key.toLowerCase().replace(/_/g, ' ')}…`}
                            value={campoValues[key] ?? ''}
                            onChange={e => setCampoValues(v => ({ ...v, [key]: e.target.value }))}
                            className="flex-1 text-xs border border-amber-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white"
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })()}
        <div className="relative bg-gray-50 border border-gray-200 rounded-xl p-5 max-h-[280px] overflow-y-auto">
          {/* Marca de agua en preview */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden rounded-xl">
            <span className="text-5xl font-black text-indigo-200 opacity-20 rotate-[-35deg] select-none whitespace-nowrap">KAPTURO</span>
          </div>
          <div className="relative prose prose-sm max-w-none text-gray-700 text-xs leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{resultadoConCampos}</ReactMarkdown>
          </div>
        </div>
        <button
          onClick={() => {
            const tipoInfo = TODOS_TIPOS.find(t => t.id === tipo)
            setDocViewer({ texto: resultadoConCampos, titulo: tipoInfo?.label ?? 'Documento' })
          }}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          <FileText size={15} /> Ver documento completo
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={copiar}
            className={clsx('flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all',
              copiado ? 'bg-emerald-500 text-white' : 'bg-violet-600 hover:bg-violet-700 text-white')}>
            {copiado ? <><CheckCircle2 size={15} /> Copiado</> : <><Copy size={15} /> Copiar</>}
          </button>
          <button onClick={() => guardarMutation.mutate()} disabled={guardarMutation.isPending || guardado}
            className={clsx('flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors',
              guardado ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-700')}>
            {guardarMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : guardado ? <CheckCircle2 size={15} /> : <Save size={15} />}
            {guardado ? 'Guardado' : 'Guardar documento'}
          </button>
          <button onClick={descargar}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors">
            <Download size={15} /> Descargar PDF
          </button>
          <button onClick={reiniciar}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors">
            <RotateCcw size={15} /> Nuevo documento
          </button>
        </div>
        <button onClick={() => navigate('/licitaciones?tab=postulaciones')}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-sm text-gray-400 hover:text-violet-600 transition-colors">
          <ArrowLeft size={14} /> Volver a Mis postulaciones
        </button>
      </div>
    )
  }

  // ── Generar todos los documentos ──────────────────────────────────────
  const renderGenerarTodos = () => {
    const { corriendo, actual, total, labelActual, resultados, errores } = todosProgreso
    const completado = !corriendo && Object.keys(resultados).length > 0

    // PASO 0: Seleccionar licitación si aún no hay una
    if (!selectedPostulacion && !completado && !corriendo) {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800">¿Para cuál licitación?</p>
            <button onClick={() => setModoTodos(false)} className="text-xs text-gray-400 hover:text-gray-600">← Volver</button>
          </div>
          <div className="rounded-xl bg-violet-50 border border-violet-200 px-4 py-3 flex items-center gap-3">
            <Sparkles size={16} className="text-violet-600 shrink-0" />
            <p className="text-xs text-violet-800">Selecciona la licitación para la que quieres generar <strong>todos los documentos de una vez</strong>.</p>
          </div>
          {loadingPostulaciones ? (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <Loader2 size={20} className="animate-spin mr-2" /> Cargando postulaciones…
            </div>
          ) : postulaciones.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-700">
              No tienes licitaciones guardadas. Ve a <strong>Buscar licitaciones</strong> y guarda alguna primero.
            </div>
          ) : (
            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {postulaciones.map(p => {
                const docsCount = p.documentos_ia?.length ?? 0
                return (
                  <button key={p.id} onClick={() => setSelectedPostulacion(p)}
                    className="w-full text-left p-4 rounded-xl border-2 border-gray-200 hover:border-violet-400 hover:bg-violet-50 transition-all">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0 mt-0.5">
                        <FileText size={14} className="text-violet-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 line-clamp-2">
                          {p.licitacion_nombre ?? p.licitacion_codigo ?? p.id}
                        </p>
                        {p.licitacion_organismo && <p className="text-xs text-gray-500 truncate mt-0.5">{p.licitacion_organismo}</p>}
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {p.licitacion_codigo && <span className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-mono">{p.licitacion_codigo}</span>}
                          {docsCount > 0 && <span className="text-[11px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">{docsCount} doc{docsCount > 1 ? 's' : ''} generados</span>}
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-gray-300 shrink-0 mt-1" />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )
    }

    if (completado) return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-600">
            <CheckCircle2 size={18} />
            <p className="font-bold text-sm">{Object.keys(resultados).length} documentos generados</p>
          </div>
          <button onClick={() => { setModoTodos(false); setTodosProgreso(p => ({ ...p, resultados: {}, errores: new Set() })) }}
            className="text-xs text-gray-400 hover:text-gray-600">Generar otro →</button>
        </div>
        <div className="space-y-2">
          {(Object.entries(resultados) as [TipoDoc, string][]).map(([tipoDoc, texto]) => {
            const tipoInfo = TODOS_TIPOS.find(t => t.id === tipoDoc)
            const campos = detectarCampos(texto)
            // Clasificar campos: perfil vs organismo
            const camposDelPerfil = campos.filter(c => CAMPOS_A_PERFIL.some(m => m.patron.test(c.replace(/[\[\]\\]/g, ''))))
            const camposDelOrganismo = campos.filter(c => !CAMPOS_A_PERFIL.some(m => m.patron.test(c.replace(/[\[\]\\]/g, ''))))
            const hayVaciosEnPerfil = camposDelPerfil.some(c => {
              const match = CAMPOS_A_PERFIL.find(m => m.patron.test(c.replace(/[\[\]\\]/g, '')))
              if (!match) return false
              return !(perfilEmpresa?.[match.perfilKey] && (!Array.isArray(perfilEmpresa[match.perfilKey]) || perfilEmpresa[match.perfilKey].length > 0))
            })
            return (
              <div key={tipoDoc} className="border border-gray-200 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                    <p className="text-sm font-semibold text-gray-900">{tipoInfo?.label}</p>
                    {campos.length > 0 && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">⚠️ {campos.length} campos</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setDocViewer({ texto, titulo: tipoInfo?.label ?? tipoDoc })}
                      className="text-xs px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 font-medium">Ver</button>
                    <button onClick={() => descargarPDF(texto, tipoInfo?.label ?? tipoDoc, selectedPostulacion?.licitacion_nombre ?? 'licitacion')}
                      className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium"><Download size={11} className="inline -mt-0.5" /> PDF</button>
                    <button onClick={() => { navigator.clipboard.writeText(texto); toast.success('Copiado') }}
                      className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium">Copiar</button>
                  </div>
                </div>
                {campos.length > 0 && (
                  <div className="space-y-2">
                    {camposDelPerfil.length > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-semibold text-violet-700">📋 Datos de tu empresa — completa en Perfil IA</p>
                          {hayVaciosEnPerfil && (
                            <button onClick={() => navigate('/licitaciones/perfil')}
                              className="text-[10px] font-bold text-violet-600 bg-violet-100 hover:bg-violet-200 px-2 py-0.5 rounded-lg whitespace-nowrap transition-colors">
                              Ir a completar →
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {camposDelPerfil.map(c => <span key={c} className="text-[10px] font-mono bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded border border-violet-200">{c.replace(/[\[\]\\]/g, '')}</span>)}
                        </div>
                      </div>
                    )}
                    {camposDelOrganismo.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold text-orange-700">✏️ Datos del organismo — completa a mano en Word/Docs</p>
                        <div className="flex flex-wrap gap-1">
                          {camposDelOrganismo.map(c => <span key={c} className="text-[10px] font-mono bg-orange-50 text-orange-800 px-1.5 py-0.5 rounded border border-orange-200">{c.replace(/[\[\]\\]/g, '')}</span>)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {errores.size > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-xs text-red-600 font-semibold">Fallaron: {Array.from(errores).map(e => TODOS_TIPOS.find(t => t.id === e)?.label ?? e).join(', ')}</p>
            </div>
          )}
        </div>
        <button onClick={() => navigate('/licitaciones?tab=postulaciones')}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-sm text-gray-400 hover:text-violet-600 transition-colors">
          <ArrowLeft size={14} /> Volver a Mis postulaciones
        </button>
      </div>
    )

    if (corriendo) {
      const pct = total > 0 ? Math.round((actual / total) * 100) : 0
      return (
        <div className="space-y-5 py-3">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-violet-100 rounded-2xl flex items-center justify-center mx-auto">
              <Loader2 size={24} className="animate-spin text-violet-600" />
            </div>
            <p className="text-sm font-bold text-gray-900">Generando {actual + 1} de {total}</p>
            <p className="text-xs text-gray-500">{labelActual}</p>
          </div>
          <div>
            <div className="flex justify-between text-[11px] text-gray-400 mb-1.5">
              <span>{actual} completados</span><span>{pct}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className="bg-violet-500 h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="space-y-1.5">
            {Array.from(todosSeleccionados).map((tipoDoc, idx) => {
              const tipoInfo = TODOS_TIPOS.find(t => t.id === tipoDoc)
              const isDone = !!resultados[tipoDoc]; const isError = errores.has(tipoDoc); const isCurrent = idx === actual
              return (
                <div key={tipoDoc} className={clsx('flex items-center gap-2 px-3 py-2 rounded-lg text-xs',
                  isDone ? 'bg-emerald-50' : isError ? 'bg-red-50' : isCurrent ? 'bg-violet-50' : 'bg-gray-50')}>
                  {isDone ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                   : isError ? <XCircle size={13} className="text-red-400 shrink-0" />
                   : isCurrent ? <Loader2 size={13} className="animate-spin text-violet-500 shrink-0" />
                   : <Circle size={13} className="text-gray-300 shrink-0" />}
                  <span className={isDone ? 'text-emerald-700' : isError ? 'text-red-600' : isCurrent ? 'text-violet-700 font-semibold' : 'text-gray-400'}>
                    {tipoInfo?.label}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="text-[11px] text-center text-gray-400">Cada documento tarda ~30 seg. No cierres esta página.</p>
          <button
            onClick={() => {
              canceladoRef.current = true
              setTodosProgreso(prev => ({ ...prev, corriendo: false, labelActual: 'Cancelado' }))
            }}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
          >
            <XCircle size={14} /> Cancelar generación
          </button>
        </div>
      )
    }

    // Pantalla de selección
    const perfilCamposCheck = PERFIL_CAMPOS_CHECK.map(c => ({
      ...c,
      filled: !!(perfilEmpresa?.[c.key] && (!Array.isArray(perfilEmpresa[c.key]) || perfilEmpresa[c.key].length > 0))
    }))
    const perfilFaltante = perfilCamposCheck.filter(c => !c.filled)
    const perfilCriticosFaltantes = perfilFaltante.filter(c => c.critical)
    const perfilCompletos = perfilCamposCheck.filter(c => c.filled).length
    const perfilTotal = perfilCamposCheck.length
    const perfilPct = Math.round((perfilCompletos / perfilTotal) * 100)
    const scoreBajo = selectedPostulacion != null && (selectedPostulacion.score == null || selectedPostulacion.score === 0 || selectedPostulacion.score < 50)
    const bloqueado = perfilCriticosFaltantes.length > 0 || !selectedPostulacion || scoreBajo

    // Helper: campos faltantes por documento
    const camposFaltantesDoc = (tipoDoc: TipoDoc): string[] => {
      const requeridos = DOC_CAMPOS_REQUERIDOS[tipoDoc] ?? []
      return requeridos
        .filter(key => {
          const val = perfilEmpresa?.[key]
          return !val || (Array.isArray(val) && val.length === 0)
        })
        .map(key => PERFIL_CAMPOS_CHECK.find(c => c.key === key)?.label ?? key)
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-800">¿Qué documentos generar?</p>
          <button onClick={() => setModoTodos(false)} className="text-xs text-gray-400 hover:text-gray-600">← Volver</button>
        </div>

        {/* Licitación seleccionada — con opción de cambiar */}
        <div className="flex items-center gap-2 px-3 py-2.5 bg-violet-50 border border-violet-200 rounded-xl">
          <FileText size={14} className="text-violet-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-violet-500 font-semibold uppercase tracking-wide">Licitación</p>
            <p className="text-xs font-semibold text-violet-900 truncate">{selectedPostulacion?.licitacion_nombre ?? selectedPostulacion?.licitacion_codigo}</p>
          </div>
          <button type="button" onClick={() => setSelectedPostulacion(null)}
            className="text-[10px] font-semibold text-violet-500 hover:text-violet-800 border border-violet-200 px-2 py-0.5 rounded-lg whitespace-nowrap">
            Cambiar
          </button>
        </div>
        {perfilPct === 100 && selectedPostulacion && (
          <div className="rounded-xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-50 to-green-50 p-3 flex items-center gap-3">
            <span className="text-2xl">🎯</span>
            <div>
              <p className="text-xs font-bold text-emerald-800">Tu perfil está al 100% — listo para generar</p>
              <p className="text-[10px] text-emerald-600">Todos los documentos están disponibles sin restricciones</p>
            </div>
          </div>
        )}

        {/* ── Progreso de preparación ─────────────────────────────────── */}
        <div className={clsx(
          'rounded-xl border-2 p-4 space-y-3 transition-all',
          bloqueado ? 'border-red-200 bg-red-50' : perfilPct === 100 ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
        )}>
          <div className="flex items-center justify-between gap-2">
            <p className={clsx('text-xs font-bold', bloqueado ? 'text-red-700' : perfilPct === 100 ? 'text-emerald-700' : 'text-amber-700')}>
              {scoreBajo
                ? `⛔ Score insuficiente (${selectedPostulacion?.score ?? 0}/100) — analiza con IA primero`
                : bloqueado
                ? `⛔ Completa ${perfilCriticosFaltantes.length + (!selectedPostulacion ? 1 : 0)} requisito${(perfilCriticosFaltantes.length + (!selectedPostulacion ? 1 : 0)) !== 1 ? 's' : ''} para desbloquear`
                : perfilPct === 100 ? '✅ Perfil completo — todos los docs disponibles'
                : `⚠️ Perfil al ${perfilPct}% — algunos docs bloqueados`}
            </p>
            <span className={clsx(
              'text-[11px] font-bold px-2 py-0.5 rounded-full',
              perfilPct === 100 ? 'bg-emerald-200 text-emerald-800'
              : perfilPct >= 60 ? 'bg-amber-200 text-amber-800'
              : 'bg-red-200 text-red-800'
            )}>
              {perfilCompletos}/{perfilTotal} campos
            </span>
          </div>

          {/* Barra de progreso */}
          <div className="space-y-1">
            <div className="w-full bg-white/70 rounded-full h-2.5 overflow-hidden">
              <div
                className={clsx('h-2.5 rounded-full transition-all duration-700',
                  perfilPct === 100 ? 'bg-emerald-500' : perfilPct >= 60 ? 'bg-amber-400' : 'bg-red-400'
                )}
                style={{ width: `${perfilPct}%` }}
              />
            </div>
            <p className={clsx('text-[10px]', bloqueado ? 'text-red-500' : 'text-emerald-600')}>
              {perfilPct}% del perfil de empresa completado
            </p>
          </div>

          {/* Checklist de requisitos */}
          <div className="space-y-1.5">
            {/* Licitación seleccionada */}
            <div className="flex items-center gap-2">
              {selectedPostulacion
                ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                : <XCircle size={13} className="text-red-400 shrink-0" />}
              <span className={clsx('text-xs', selectedPostulacion ? 'text-gray-600' : 'text-red-600 font-medium')}>
                Licitación seleccionada
                {selectedPostulacion && <span className="text-gray-400 font-normal"> — {selectedPostulacion.licitacion_nombre?.slice(0, 35) ?? selectedPostulacion.licitacion_codigo}</span>}
              </span>
            </div>
            {/* Campos del perfil */}
            {perfilCamposCheck.map(c => (
              <div key={c.key} className="flex items-center gap-2">
                {c.filled
                  ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                  : c.critical
                  ? <XCircle size={13} className="text-red-400 shrink-0" />
                  : <Circle size={13} className="text-gray-300 shrink-0" />}
                <span className={clsx('text-xs',
                  c.filled ? 'text-gray-500 line-through decoration-gray-300'
                  : c.critical ? 'text-red-600 font-medium'
                  : 'text-gray-400')}>
                  {c.label}
                  {!c.filled && c.critical && <span className="ml-1 text-[10px] bg-red-100 text-red-600 px-1 rounded">requerido</span>}
                </span>
              </div>
            ))}
          </div>

          {bloqueado && (
            <button
              onClick={() => navigate(scoreBajo ? '/licitaciones?tab=postulaciones' : '/licitaciones/perfil')}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors"
            >
              {scoreBajo ? 'Ir a analizar la licitación →' : 'Completar perfil ahora →'}
            </button>
          )}
        </div>

        {/* ── Lista de documentos ─────────────────────────────────────── */}
        <div className="space-y-1.5">
          {TODOS_TIPOS.map(t => {
            const tab = TABS.find(tb => tb.items.some(i => i.id === t.id))
            const sel = todosSeleccionados.has(t.id)
            const faltantes = camposFaltantesDoc(t.id)
            const docBloqueado = faltantes.length > 0
            return (
              <button key={t.id}
                onClick={() => {
                  if (docBloqueado) return
                  setTodosSeleccionados(prev => { const s = new Set(prev); sel ? s.delete(t.id) : s.add(t.id); return s })
                }}
                disabled={docBloqueado}
                title={docBloqueado ? `Falta: ${faltantes.join(', ')}` : undefined}
                className={clsx('w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border-2 text-left transition-all',
                  docBloqueado
                    ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                    : sel
                      ? (tab?.color === 'violet' ? 'border-violet-400 bg-violet-50' : tab?.color === 'emerald' ? 'border-emerald-400 bg-emerald-50' : 'border-blue-400 bg-blue-50')
                      : 'border-gray-200 hover:border-gray-300')}>
                <div className={clsx('w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all',
                  docBloqueado
                    ? 'border-gray-300 bg-gray-100'
                    : sel
                      ? (tab?.color === 'violet' ? 'border-violet-500 bg-violet-500' : tab?.color === 'emerald' ? 'border-emerald-500 bg-emerald-500' : 'border-blue-500 bg-blue-500')
                      : 'border-gray-300')}>
                  {docBloqueado ? <span className="text-[9px]">🔒</span> : sel && <CheckCircle2 size={11} className="text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={clsx('text-sm font-medium', docBloqueado ? 'text-gray-400' : 'text-gray-900')}>{t.label}</p>
                  {docBloqueado
                    ? <p className="text-[10px] text-red-400 truncate">Falta: {faltantes.slice(0, 2).join(', ')}{faltantes.length > 2 ? ` +${faltantes.length - 2}` : ''}</p>
                    : <p className="text-[11px] text-gray-500 truncate">{t.desc}</p>}
                </div>
                {docStatuses[t.id]?.state === 'done' && !docBloqueado && (
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold shrink-0">✓</span>
                )}
                {docBloqueado && (
                  <button type="button" onClick={e => { e.stopPropagation(); navigate('/licitaciones/perfil') }}
                    className="text-[10px] text-indigo-500 hover:underline shrink-0 whitespace-nowrap">
                    Completar →
                  </button>
                )}
              </button>
            )
          })}
        </div>

        <div className="space-y-2 pt-1">
          {(() => {
            const desbloqueados = Array.from(todosSeleccionados).filter(id => camposFaltantesDoc(id).length === 0)
            const bloqueadosCount = TODOS_TIPOS.filter(t => camposFaltantesDoc(t.id).length > 0).length
            return (<>
              {bloqueadosCount > 0 && (
                <p className="text-[10px] text-center text-amber-600">
                  🔒 {bloqueadosCount} doc{bloqueadosCount !== 1 ? 's' : ''} bloqueado{bloqueadosCount !== 1 ? 's' : ''} por perfil incompleto
                  {' · '}<button type="button" onClick={() => navigate('/licitaciones/perfil')} className="underline font-semibold">Completar perfil</button>
                </p>
              )}
              <p className="text-xs text-gray-400 text-center">
                {desbloqueados.length} documento{desbloqueados.length !== 1 ? 's' : ''} listos · ~{desbloqueados.length * 30} seg estimados
              </p>
            </>)
          })()}
          <button
            onClick={handleGenerarTodos}
            disabled={todosSeleccionados.size === 0 || bloqueado || todosProgreso.corriendo}
            className={clsx(
              'w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-colors shadow-sm',
              bloqueado
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-violet-600 text-white hover:bg-violet-700'
            )}
          >
            {bloqueado
              ? scoreBajo
                ? <>⛔ Analiza la licitación antes de generar</>
                : <>⛔ Completa el perfil para generar</>
              : <><Sparkles size={16} /> Generar {todosSeleccionados.size} documento{todosSeleccionados.size !== 1 ? 's' : ''} con IA</>
            }
          </button>
        </div>
      </div>
    )
  }

  // ── Panel de progreso (derecha) ────────────────────────────────────────
  const renderPanelProgreso = () => {
    const perfilCampos = PERFIL_CAMPOS_CHECK.map(c => ({
      ...c,
      filled: !!(perfilEmpresa?.[c.key] && (!Array.isArray(perfilEmpresa[c.key]) || perfilEmpresa[c.key].length > 0))
    }))
    const perfilCompleto = perfilCampos.filter(c => c.filled).length
    const perfilTotal = perfilCampos.length

    const allDocs = TODOS_TIPOS
    const doneCount = allDocs.filter(d => docStatuses[d.id]?.state === 'done').length
    const fieldsCount = allDocs.filter(d => docStatuses[d.id]?.state === 'fields').length

    return (
      <div className="space-y-4 lg:sticky lg:top-6">
        {/* Botón generar todos — siempre visible */}
        {(() => {
          const panelScoreBajo = selectedPostulacion != null &&
            (selectedPostulacion.score == null || selectedPostulacion.score === 0 || selectedPostulacion.score < 50)
          return (
            <button
              onClick={() => {
                if (panelScoreBajo) {
                  toast.error('Analiza primero esta licitación en "Mis postulaciones"')
                  return
                }
                setModoTodos(true)
                if (selectedPostulacion) setTimeout(() => handleGenerarTodos(), 50)
              }}
              disabled={todosProgreso.corriendo}
              className={clsx(
                'w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-colors shadow-sm',
                todosProgreso.corriendo
                  ? 'bg-violet-400 text-white cursor-not-allowed'
                  : panelScoreBajo
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    : 'bg-violet-600 text-white hover:bg-violet-700'
              )}
            >
              {todosProgreso.corriendo
                ? <><Loader2 size={15} className="animate-spin" /> Generando…</>
                : panelScoreBajo
                  ? <>⛔ Analiza la licitación primero</>
                  : <><Sparkles size={15} /> Generar todos los documentos</>
              }
            </button>
          )
        })()}
        {/* Licitación activa */}
        {selectedPostulacion ? (
          <div className="flex items-center gap-2 px-3 py-2 bg-violet-50 border border-violet-200 rounded-xl">
            <CheckCircle2 size={13} className="text-violet-500 shrink-0" />
            <p className="text-[11px] text-violet-800 font-medium flex-1 truncate">{selectedPostulacion.licitacion_nombre ?? selectedPostulacion.licitacion_codigo}</p>
            <button type="button" onClick={() => setSelectedPostulacion(null)} className="text-[10px] text-violet-400 hover:text-violet-700">cambiar</button>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertCircle size={13} className="text-amber-500 shrink-0" />
            <p className="text-[11px] text-amber-700">Sin licitación seleccionada — selecciona al generar</p>
          </div>
        )}
        {/* Perfil de empresa */}
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Perfil de empresa</p>
            <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full',
              perfilCompleto === perfilTotal ? 'bg-emerald-100 text-emerald-700' :
              perfilCompleto >= 3 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700')}>
              {perfilCompleto}/{perfilTotal}
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div className="bg-violet-500 h-1.5 rounded-full transition-all"
              style={{ width: `${(perfilCompleto / perfilTotal) * 100}%` }} />
          </div>
          <div className="space-y-1.5">
            {perfilCampos.map(c => (
              <div key={c.key} className="flex items-center gap-2">
                {c.filled
                  ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                  : c.critical
                  ? <XCircle size={13} className="text-red-400 shrink-0" />
                  : <Circle size={13} className="text-gray-300 shrink-0" />}
                <span className={clsx('text-xs', c.filled ? 'text-gray-600' : c.critical ? 'text-red-600 font-medium' : 'text-gray-400')}>
                  {c.label}
                </span>
              </div>
            ))}
          </div>
          {perfilCompleto < perfilTotal && (
            <button onClick={() => navigate('/licitaciones/perfil')}
              className="w-full text-xs text-violet-600 font-semibold py-1.5 rounded-lg border border-violet-200 hover:bg-violet-50 transition-colors">
              Completar perfil →
            </button>
          )}
        </div>

        {/* Tracker de documentos */}
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Documentos</p>
            <div className="flex items-center gap-1.5">
              {doneCount > 0 && <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">{doneCount} ✓</span>}
              {fieldsCount > 0 && <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">{fieldsCount} ⚠</span>}
            </div>
          </div>
          {TABS.map(tab => (
            <div key={tab.key}>
              <p className={clsx('text-[10px] font-semibold uppercase tracking-wide mb-1.5',
                tab.color === 'violet' ? 'text-violet-500' :
                tab.color === 'emerald' ? 'text-emerald-600' : 'text-blue-500')}>
                {tab.label} — {tab.sublabel}
              </p>
              <div className="space-y-1">
                {tab.items.map(item => {
                  const st = docStatuses[item.id]
                  const isSelected = tipo === item.id
                  return (
                    <button key={item.id}
                      onClick={() => { setTipo(item.id as TipoDoc); setStep(0); setGuardado(false); setResultado('') }}
                      className={clsx(
                        'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors text-xs',
                        isSelected ? 'bg-violet-50 border border-violet-200' : 'hover:bg-gray-50 border border-transparent'
                      )}>
                      {st?.state === 'done'
                        ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                        : st?.state === 'fields'
                        ? <AlertTriangle size={13} className="text-amber-500 shrink-0" />
                        : <Circle size={13} className="text-gray-300 shrink-0" />}
                      <span className={clsx('flex-1 truncate',
                        st?.state === 'done' ? 'text-gray-600' :
                        st?.state === 'fields' ? 'text-amber-700 font-medium' :
                        isSelected ? 'text-violet-700 font-semibold' : 'text-gray-500')}>
                        {item.label}
                      </span>
                      {st?.state === 'fields' && <span className="text-[9px] text-amber-500 shrink-0">campos</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {doneCount === 0 && fieldsCount === 0 && (
            <p className="text-[11px] text-gray-400 text-center py-1">Genera tu primer documento para ver el progreso aquí</p>
          )}
        </div>
      </div>
    )
  }

  const stepContent = [renderTipo, renderLicitacion, renderGenerar]

  // ── Pre-flight: checklist antes de empezar ──────────────────────────────
  const perfilCriticos = PERFIL_CAMPOS_CHECK.filter(c => c.critical)
  const perfilCriticosOk = perfilCriticos.filter(c => {
    const val = perfilEmpresa?.[c.key]
    return !!(val && (!Array.isArray(val) || val.length > 0))
  })
  const perfilListoParaGenerar = perfilCriticosOk.length >= perfilCriticos.length
  const tienePostulaciones = postulaciones.length > 0
  const todoListo = perfilListoParaGenerar && tienePostulaciones
  const showPreflight = !preflightDismissed && !todoListo && !loadingPostulaciones && perfilEmpresa !== undefined

  const renderPreflight = () => (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 bg-violet-600 rounded-xl flex items-center justify-center shadow-sm">
          <Sparkles size={21} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Quiero generar documentos</h1>
          <p className="text-sm text-gray-500">Kapturo verifica que tienes todo para empezar</p>
        </div>
      </div>

      {/* Cards de estado */}
      <div className="space-y-3">
        {/* Card perfil */}
        <div className={clsx('border-2 rounded-2xl p-5 transition-all',
          perfilListoParaGenerar ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50')}>
          <div className="flex items-start gap-4">
            <div className={clsx('w-11 h-11 rounded-xl flex items-center justify-center shrink-0',
              perfilListoParaGenerar ? 'bg-emerald-100' : 'bg-amber-100')}>
              {perfilListoParaGenerar
                ? <CheckCircle2 size={22} className="text-emerald-600" />
                : <AlertTriangle size={22} className="text-amber-600" />}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="font-bold text-gray-900 text-sm">
                  {perfilListoParaGenerar ? '✅ Perfil IA completo' : '⚠️ Perfil IA incompleto'}
                </p>
                <span className={clsx('text-[11px] font-bold px-2 py-0.5 rounded-full',
                  perfilListoParaGenerar ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-200 text-amber-800')}>
                  {perfilCriticosOk.length}/{perfilCriticos.length} campos clave
                </span>
              </div>
              {!perfilListoParaGenerar ? (
                <>
                  <p className="text-xs text-amber-700 mb-2">
                    La IA necesita datos de tu empresa para redactar documentos reales. Sin esto, el documento tendrá muchos <code className="bg-amber-100 px-1 rounded">[CAMPOS]</code> vacíos.
                  </p>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {perfilCriticos.filter(c => !perfilCriticosOk.find(ok => ok.key === c.key)).map(c => (
                      <span key={c.key} className="text-[11px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                        {c.label}
                      </span>
                    ))}
                  </div>
                  <button onClick={() => navigate('/licitaciones/perfil')}
                    className="flex items-center gap-2 text-sm font-semibold bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl transition-colors">
                    <ExternalLink size={14} /> Completar perfil de empresa
                  </button>
                </>
              ) : (
                <p className="text-xs text-emerald-700">Los datos de tu empresa están listos para generar documentos completos.</p>
              )}
            </div>
          </div>
        </div>

        {/* Card licitaciones */}
        <div className={clsx('border-2 rounded-2xl p-5 transition-all',
          tienePostulaciones ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-gray-50')}>
          <div className="flex items-start gap-4">
            <div className={clsx('w-11 h-11 rounded-xl flex items-center justify-center shrink-0',
              tienePostulaciones ? 'bg-emerald-100' : 'bg-gray-100')}>
              {tienePostulaciones
                ? <CheckCircle2 size={22} className="text-emerald-600" />
                : <Circle size={22} className="text-gray-400" />}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="font-bold text-gray-900 text-sm">
                  {tienePostulaciones ? `✅ ${postulaciones.length} licitación${postulaciones.length > 1 ? 'es' : ''} guardada${postulaciones.length > 1 ? 's' : ''}` : 'Sin licitaciones guardadas'}
                </p>
              </div>
              {!tienePostulaciones ? (
                <>
                  <p className="text-xs text-gray-600 mb-3">
                    Primero busca y guarda las licitaciones a las que quieres postular. Desde allí podrás generar los documentos.
                  </p>
                  <button onClick={() => navigate('/licitaciones')}
                    className="flex items-center gap-2 text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl transition-colors">
                    <ExternalLink size={14} /> Buscar licitaciones
                  </button>
                </>
              ) : (
                <p className="text-xs text-emerald-700">Tienes licitaciones guardadas listas para documentar.</p>
              )}
            </div>
          </div>
        </div>

        {/* Explicación del proceso de bases */}
        <div className="border border-indigo-100 bg-indigo-50 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <Info size={16} className="text-indigo-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-indigo-800 mb-1">¿Cómo lee la IA las bases de la licitación?</p>
              <p className="text-xs text-indigo-700 leading-relaxed">
                Cuando analizas una licitación (<strong>Analizar bases</strong>), Kapturo extrae y procesa los PDF oficiales de Mercado Público. 
                Al generar un documento, Claude lee automáticamente esas bases reales y las combina con tu perfil de empresa para 
                redactar una propuesta técnica específica para esa licitación.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Botón continuar */}
      <div className="flex items-center justify-between">
        <button onClick={() => setPreflightDismissed(true)}
          className="text-sm text-gray-400 hover:text-gray-600">
          Continuar de todos modos →
        </button>
        {todoListo && (
          <button onClick={() => setPreflightDismissed(true)}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm px-6 py-2.5 rounded-xl">
            <Sparkles size={15} /> Empezar a generar documentos
          </button>
        )}
      </div>
    </div>
  )

  if (showPreflight && !modoTodos) return renderPreflight()

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header — sin botón volver arriba */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 bg-violet-600 rounded-xl flex items-center justify-center shadow-sm">
          <FileSignature size={21} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Propuestas para Licitaciones</h1>
          <p className="text-sm text-gray-500">Genera los documentos de tu oferta con IA</p>
        </div>
      </div>

      {/* Layout 2 columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* Columna izquierda: wizard */}
        <div className="lg:col-span-2 space-y-4">
          {/* Stepper */}
          {!modoTodos && step < 3 && (
            <div className="flex items-center">
              {STEPS.map((s, i) => (
                <div key={s} className="flex items-center flex-1 last:flex-none">
                  <div className="flex items-center gap-1.5">
                    <div className={clsx(
                      'flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold transition-all shrink-0',
                      i < step ? 'bg-violet-600 text-white' : i === step ? 'bg-violet-100 text-violet-700 ring-2 ring-violet-400' : 'bg-gray-100 text-gray-400'
                    )}>
                      {i < step ? <CheckCircle2 size={13} /> : i + 1}
                    </div>
                    <span className={clsx('text-xs font-medium hidden sm:block whitespace-nowrap',
                      i === step ? 'text-violet-700' : i < step ? 'text-gray-500' : 'text-gray-300')}>{s}</span>
                  </div>
                  {i < STEPS.length - 1 && <div className={clsx('flex-1 h-px mx-2', i < step ? 'bg-violet-300' : 'bg-gray-200')} />}
                </div>
              ))}
            </div>
          )}

          {/* Card principal */}
          <div className="card p-6">
            {modoTodos ? renderGenerarTodos() : step < 3 ? stepContent[step]() : renderResultado()}
            {!modoTodos && step < 3 && (
              <div className="flex items-center justify-between mt-6 pt-5 border-t border-gray-100">
                <button onClick={() => setStep(s => s - 1)} disabled={step === 0}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 disabled:opacity-0 transition-colors">
                  <ChevronLeft size={16} /> Atrás
                </button>
                {step < 2 ? (
                  <button onClick={() => setStep(s => s + 1)} disabled={!puedeAvanzar()}
                    className="flex items-center gap-2 btn-primary text-sm px-5 disabled:opacity-40 disabled:cursor-not-allowed">
                    Continuar <ChevronRight size={15} />
                  </button>
                ) : (
                  <button onClick={() => generarMutation.mutate()} disabled={generarMutation.isPending}
                    className="flex items-center gap-2 btn-primary text-sm px-5">
                    {generarMutation.isPending
                      ? <><Loader2 size={15} className="animate-spin" /> Generando con IA...</>
                      : <><Sparkles size={15} /> Generar documento</>}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Sección externa colapsable — oculta en modo generar todos */}
          {!modoTodos && <div className="card overflow-hidden">
            <button onClick={() => setExternosOpen(o => !o)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
                  <AlertCircle size={15} className="text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Gestión fuera de Kapturo</p>
                  <p className="text-xs text-gray-500">Pasos administrativos que debes completar tú</p>
                </div>
              </div>
              <ChevronDown size={16} className={clsx('text-gray-400 transition-transform shrink-0', externosOpen && 'rotate-180')} />
            </button>
            {externosOpen && (
              <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-2.5">
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <Info size={13} className="text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">
                    Kapturo genera los <strong>documentos de contenido</strong>. Los pasos de abajo son requisitos administrativos externos.
                  </p>
                </div>
                {PASOS_EXTERNOS.map(paso => (
                  <div key={paso.num} className="flex items-start gap-3 p-3.5 rounded-xl border border-gray-200 bg-white">
                    <div className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5',
                      paso.obligatorio ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-gray-500')}>
                      {paso.num}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <p className="text-xs font-semibold text-gray-800">{paso.titulo}</p>
                        {paso.obligatorio && <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full font-medium">Obligatorio</span>}
                      </div>
                      <p className="text-[11px] text-gray-500 leading-relaxed">{paso.desc}</p>
                    </div>
                    <a href={paso.url} target="_blank" rel="noopener noreferrer"
                      className="shrink-0 flex items-center gap-1 text-[11px] text-violet-600 hover:text-violet-800 font-medium whitespace-nowrap mt-0.5">
                      {paso.urlLabel} <ExternalLink size={10} />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>}

          {step < 3 && (
            <p className="text-xs text-gray-400 text-center pb-2">
              Los documentos se generan con IA. Revísalos antes de adjuntarlos en Mercado Público.
            </p>
          )}
        </div>

        {/* Columna derecha: progreso */}
        <div className="lg:col-span-1">
          {renderPanelProgreso()}
        </div>
      </div>

      {/* ── Modal vista completa del documento ── */}
      {docViewer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center">
                  <FileText size={17} className="text-violet-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">{docViewer.titulo}</p>
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    <span className="w-2 h-2 bg-indigo-500 rounded-full inline-block" />
                    Generado por Kapturo IA — solo para uso interno
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(docViewer.texto)
                    toast.success('Copiado al portapapeles')
                  }}
                  className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium"
                >
                  <Copy size={13} /> Copiar
                </button>
                <button
                  onClick={() => {
                    // Reusar la función descargar con el texto actual
                    descargar()
                    toast.success('Descargando PDF con marca de agua…')
                  }}
                  className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-medium"
                >
                  <Download size={13} /> Descargar PDF
                </button>
                <button
                  onClick={() => setDocViewer(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-400"
                >
                  <XCircle size={18} />
                </button>
              </div>
            </div>
            {/* Body con marca de agua */}
            <div className="flex-1 overflow-y-auto px-8 py-6 relative">
              {/* Marca de agua diagonal repetida */}
              <div className="pointer-events-none fixed inset-0 flex items-center justify-center z-10 overflow-hidden" style={{ maxWidth: '3xl' }}>
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-28 opacity-[0.055] select-none rotate-[-35deg]">
                  {[...Array(6)].map((_, i) => (
                    <span key={i} className="text-6xl font-black text-indigo-700 whitespace-nowrap tracking-widest">
                      KAPTURO &nbsp;&nbsp;&nbsp; KAPTURO
                    </span>
                  ))}
                </div>
              </div>
              {/* Contenido del documento */}
              <div className="relative z-20 prose prose-sm max-w-none text-gray-800 leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{docViewer.texto}</ReactMarkdown>
              </div>
            </div>
            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 rounded-b-2xl shrink-0">
              <p className="text-[11px] text-gray-400 text-center">
                📌 Este documento es un borrador generado con IA. Revísalo antes de adjuntarlo en Mercado Público.
                Marca de agua presente en versión descargada.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Micro-feedback: docs generados ── */}
      {showFeedbackDocs && (
        <StepFeedback
          paso="documentos"
          titulo="¿Cómo fue generar los documentos?"
          onDone={() => setShowFeedbackDocs(false)}
        />
      )}
    </div>
  )
}
