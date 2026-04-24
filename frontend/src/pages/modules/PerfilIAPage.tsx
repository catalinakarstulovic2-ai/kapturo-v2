/**
 * Página dedicada al Perfil de Empresa para IA de Licitaciones.
 * Ruta: /licitaciones/perfil
 */
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Sparkles, CheckCircle2, AlertCircle, Loader2, X, ArrowRight,
  Building2, MapPin, Users, Award, Wand2, ChevronDown, ChevronUp, Trash2,
  FileText, Upload, Download, FilePlus,
} from 'lucide-react'
import api from '../../api/client'
import toast from 'react-hot-toast'
import clsx from 'clsx'

// Reutilizamos las mismas constantes de LicitacionesPage
const RUBRO_CATEGORIAS = [
  { label: 'Tecnología e Informática', rubros: ['software', 'informática', 'tecnología', 'telecomunicaciones', 'soporte técnico', 'ciberseguridad', 'inteligencia artificial'] },
  { label: 'Construcción e Infraestructura', rubros: ['construcción', 'obras civiles', 'arquitectura', 'ingeniería', 'pavimentación', 'instalaciones eléctricas', 'sanitaria'] },
  { label: 'Salud y Bienestar', rubros: ['salud', 'medicina', 'enfermería', 'laboratorio', 'farmacia', 'equipos médicos', 'psicología'] },
  { label: 'Educación y Capacitación', rubros: ['educación', 'capacitación', 'formación', 'consultoría educativa', 'e-learning'] },
  { label: 'Servicios Generales', rubros: ['aseo', 'seguridad', 'vigilancia', 'mantención', 'transporte', 'logística', 'alimentación', 'catering'] },
  { label: 'Consultoría y Gestión', rubros: ['consultoría', 'asesoría', 'auditoría', 'gestión', 'recursos humanos', 'contabilidad', 'legal'] },
  { label: 'Medio Ambiente', rubros: ['medioambiente', 'sustentabilidad', 'residuos', 'energía renovable', 'agua'] },
  { label: 'Equipamiento y Suministros', rubros: ['equipamiento', 'mobiliario', 'insumos', 'vestuario', 'vehículos', 'maquinaria'] },
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
    const rubrosGuardados: string[] = perfilRemoto.rubros || []
    // Abrir automáticamente las categorías que ya tienen rubros seleccionados
    setOpenCats(new Set(
      RUBRO_CATEGORIAS.filter(cat => cat.rubros.some(r => rubrosGuardados.includes(r))).map(c => c.label)
    ))
    setForm({
      rut_empresa: perfilRemoto.rut_empresa || '',
      razon_social: perfilRemoto.razon_social || '',
      descripcion: perfilRemoto.descripcion || '',
      experiencia_anos: perfilRemoto.experiencia_anos != null ? String(perfilRemoto.experiencia_anos) : '',
      proyectos_anteriores: perfilRemoto.proyectos_anteriores || '',
      certificaciones: perfilRemoto.certificaciones || '',
      diferenciadores: perfilRemoto.diferenciadores || '',
      inscrito_chile_proveedores: perfilRemoto.inscrito_chile_proveedores || false,
      rubros: (perfilRemoto.rubros as string[]) || [],
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
    // Find the scrollable ancestor at mount time
    const firstSection = document.getElementById('empresa')
    let scrollRoot: Element | null = null
    if (firstSection) {
      let p = firstSection.parentElement
      while (p && p !== document.body) {
        const ov = window.getComputedStyle(p).overflowY
        if (ov === 'auto' || ov === 'scroll') { scrollRoot = p; break }
        p = p.parentElement
      }
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) setActiveSection(entry.target.id)
        })
      },
      { root: scrollRoot, rootMargin: '-10% 0px -60% 0px', threshold: 0 }
    )
    const sections = document.querySelectorAll('[data-perfil-section]')
    sections.forEach(s => observer.observe(s))
    return () => observer.disconnect()
  }, [])

  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    setActiveSection(id)
    // Find nearest scrollable ancestor
    let parent = el.parentElement
    while (parent && parent !== document.body) {
      const { overflowY } = window.getComputedStyle(parent)
      if (overflowY === 'auto' || overflowY === 'scroll') {
        const top = el.getBoundingClientRect().top - parent.getBoundingClientRect().top + parent.scrollTop - 24
        parent.scrollTo({ top, behavior: 'smooth' })
        return
      }
      parent = parent.parentElement
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  // Estado de acordeón para categorías de rubros — DEBE estar aquí (no dentro del .map)
  const [openCats, setOpenCats] = useState<Set<string>>(new Set<string>())
  const [openRubros, setOpenRubros] = useState(false)
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

  const guardarMutation = useMutation({
    mutationFn: () => api.put('/tenant/me/licitaciones-profile', {
      ...form,
      experiencia_anos: form.experiencia_anos ? parseInt(form.experiencia_anos) : null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['licitaciones-profile'] })
      syncedRef.current = false
      toast.success('✅ Perfil guardado')
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

  const SECCIONES = [
    { key: 'empresa',    label: 'Tu empresa',          icon: Building2, desc: 'RUT, razón social y datos legales' },
    { key: 'rubros',     label: 'Rubros y regiones',   icon: MapPin,    desc: 'Dónde y en qué opera tu empresa' },
    { key: 'que_hace',   label: 'Qué hace tu empresa', icon: Sparkles,  desc: 'Descripción, proyectos, certificaciones' },
    { key: 'equipo',     label: 'Equipo',              icon: Users,     desc: 'Quiénes ejecutan los proyectos' },
    { key: 'contacto',   label: 'Contacto',            icon: Award,     desc: 'Firmante y datos para propuestas' },
    { key: 'documentos', label: 'Documentos',          icon: FileText,  desc: 'CV empresa, certificados PDF' },
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
                      sec.hasCritical ? 'text-red-600' : 'text-gray-500')}>
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
                      {/* Trigger compacto */}
                      <button type="button" onClick={() => setOpenRubros(v => !v)}
                        className={clsx('w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors text-left',
                          openRubros ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-white hover:border-indigo-200 hover:bg-gray-50')}>
                        <span className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-700">Rubros donde participas <span className="text-red-400">*</span></span>
                          {form.rubros.length > 0 && (
                            <span className="bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{form.rubros.length} sel.</span>
                          )}
                        </span>
                        {openRubros ? <ChevronUp size={13} className="text-indigo-400 shrink-0" /> : <ChevronDown size={13} className="text-gray-400 shrink-0" />}
                      </button>

                      {/* Panel expandible */}
                      {openRubros && (
                        <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
                          {/* Chips de seleccionados */}
                          {form.rubros.length > 0 && (
                            <div className="px-3 py-2 bg-indigo-50 flex flex-wrap gap-1 items-center">
                              {form.rubros.map(r => (
                                <button key={r} type="button" onClick={() => toggleRubro(r)}
                                  className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-indigo-600 text-white capitalize">
                                  {r} <X size={9} />
                                </button>
                              ))}
                              <button onClick={() => setForm(f => ({ ...f, rubros: [] }))} className="text-[10px] text-gray-400 hover:text-red-400 ml-1">limpiar</button>
                            </div>
                          )}
                          {RUBRO_CATEGORIAS.map(cat => {
                            const sel = cat.rubros.filter(r => form.rubros.includes(r))
                            const open = openCats.has(cat.label)
                            return (
                              <div key={cat.label}>
                                <button type="button" onClick={() => toggleCat(cat.label)}
                                  className={clsx('w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-left transition-colors',
                                    open ? 'bg-indigo-50 text-indigo-800' : 'text-gray-700 hover:bg-gray-50')}>
                                  <span className="flex items-center gap-2">
                                    {cat.label}
                                    {sel.length > 0 && <span className="bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{sel.length}</span>}
                                  </span>
                                  {open ? <ChevronUp size={12} className="text-indigo-400 shrink-0" /> : <ChevronDown size={12} className="text-gray-400 shrink-0" />}
                                </button>
                                {open && (
                                  <div className="px-4 pt-2 pb-3 flex flex-wrap gap-1.5 bg-gray-50 border-t border-gray-100">
                                    {cat.rubros.map(r => (
                                      <button key={r} type="button" onClick={() => toggleRubro(r)}
                                        className={clsx('text-[11px] px-2.5 py-1 rounded-lg border transition-colors capitalize',
                                          form.rubros.includes(r) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50')}>
                                        {r}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
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
                    <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 mb-2">
                      <strong>¿Para qué sirven?</strong> Se adjuntan al generar propuestas con IA. El CV de empresa es obligatorio en la mayoría de licitaciones públicas.
                    </div>
                    <div className="space-y-3">
                      {DOCS_TIPOS.map(doc => {
                        const meta = docsMeta[doc.key]
                        const isUploading = subiendo === doc.key
                        return (
                          <div key={doc.key} className="border border-gray-200 rounded-xl p-3 flex items-center gap-3">
                            <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
                              meta ? 'bg-emerald-100' : 'bg-gray-100')}>
                              <FileText size={15} className={meta ? 'text-emerald-600' : 'text-gray-400'} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-gray-800 flex items-center gap-1">
                                {doc.label}
                                {doc.requerido && <span className="text-red-400 font-normal text-[10px]">requerido</span>}
                              </p>
                              <p className="text-[10px] text-gray-400">{meta ? `✅ ${meta.nombre} (${Math.round(meta.size / 1024)} KB)` : doc.desc}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {meta && <>
                                <button onClick={() => descargarDocumento(doc.key, meta.nombre)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"><Download size={12} /></button>
                                <button onClick={() => eliminarDocumento(doc.key)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 size={12} /></button>
                              </>}
                              <label className={clsx('flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors',
                                meta ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-indigo-600 text-white hover:bg-indigo-700',
                                isUploading && 'opacity-50 pointer-events-none')}>
                                {isUploading ? <Loader2 size={10} className="animate-spin" /> : <Upload size={10} />}
                                {isUploading ? 'Subiendo…' : meta ? 'Reemplazar' : 'Subir PDF'}
                                <input type="file" accept=".pdf,.doc,.docx" className="hidden"
                                  onChange={e => { const f = e.target.files?.[0]; if (f) subirDocumento(doc.key, f); e.target.value = '' }} />
                              </label>
                            </div>
                          </div>
                        )
                      })}
                      <label className="flex items-center gap-2 text-[10px] text-indigo-500 hover:text-indigo-700 cursor-pointer w-fit">
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

          {/* Guardar sticky */}
          <div className="sticky bottom-4">
            <button onClick={() => guardarMutation.mutate()} disabled={guardarMutation.isPending}
              className="w-full flex items-center justify-center gap-2 text-sm font-semibold py-3 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 shadow-lg transition-colors">
              {guardarMutation.isPending ? <><Loader2 size={16} className="animate-spin" /> Guardando…</> : <><CheckCircle2 size={16} /> Guardar perfil</>}
            </button>
          </div>

        </div>{/* end form */}

      </div>{/* end flex */}
    </div>
  )
}
