/**
 * Página dedicada al Perfil de Empresa para IA de Licitaciones.
 * Ruta: /licitaciones/perfil
 */
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Sparkles, CheckCircle2, AlertCircle, Loader2, X, ArrowRight,
  Building2, MapPin, Users, Award, Wand2, ChevronDown, ChevronUp,
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
  { key: 'rut_empresa',        label: 'RUT empresa',           critical: true,  grupo: 'legal' },
  { key: 'razon_social',       label: 'Razón social',          critical: true,  grupo: 'legal' },
  { key: 'descripcion',        label: 'Descripción empresa',   critical: true,  grupo: 'ia' },
  { key: 'rubros',             label: 'Rubros',                critical: true,  grupo: 'ia' },
  { key: 'regiones',           label: 'Regiones',              critical: true,  grupo: 'ia' },
  { key: 'nombre_contacto',    label: 'Nombre del firmante',   critical: true,  grupo: 'contacto' },
  { key: 'cargo_contacto',     label: 'Cargo del firmante',    critical: false, grupo: 'contacto' },
  { key: 'correo',             label: 'Correo electrónico',    critical: false, grupo: 'contacto' },
  { key: 'telefono',           label: 'Teléfono',              critical: false, grupo: 'contacto' },
  { key: 'proyectos_anteriores', label: 'Proyectos anteriores', critical: false, grupo: 'ia' },
  { key: 'equipo_tecnico',     label: 'Equipo técnico',        critical: false, grupo: 'ia' },
  { key: 'certificaciones',    label: 'Certificaciones',       critical: false, grupo: 'ia' },
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
    queryKey: ['licitaciones-catalogo'],
    queryFn: () => api.get('/modules/licitaciones/catalogo').then(r => r.data).catch(() => null),
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
  }, [perfilRemoto])

  const [generando, setGenerando] = useState<string | null>(null)
  const [regionQuery, setRegionQuery] = useState('')
  const [seccionAbierta, setSeccionAbierta] = useState<string>('basico')
  // Estado de acordeón para categorías de rubros — DEBE estar aquí (no dentro del .map)
  const [openCats, setOpenCats] = useState<Set<string>>(new Set<string>())
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

  const ORDEN_REGIONES = ['XV','I','II','III','IV','V','RM','VI','VII','XVI','VIII','IX','XIV','X','XI','XII']
  const regionesOrdenadas = catalogo?.regiones
    ? [...catalogo.regiones].sort((a: any, b: any) => {
        const ia = ORDEN_REGIONES.indexOf(a.codigo); const ib = ORDEN_REGIONES.indexOf(b.codigo)
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
      })
    : []

  const regionesFiltradas = regionQuery.trim()
    ? regionesOrdenadas.filter((r: any) => r.nombre.toLowerCase().includes(regionQuery.toLowerCase()))
    : regionesOrdenadas

  const toggleRegion = (c: string) =>
    setForm(f => ({ ...f, regiones: f.regiones.includes(c) ? f.regiones.filter(x => x !== c) : [...f.regiones, c] }))

  const SECCIONES = [
    { key: 'basico', label: 'Datos legales', icon: Building2, desc: 'RUT, razón social, inscripción' },
    { key: 'ia', label: 'Perfil para IA', icon: Sparkles, desc: 'Lo que usa la IA para generar documentos' },
    { key: 'rubros', label: 'Rubros y regiones', icon: MapPin, desc: 'Dónde y en qué opera tu empresa' },
    { key: 'contacto', label: 'Contacto y firmante', icon: Users, desc: 'Datos para cartas y propuestas formales' },
    { key: 'equipo', label: 'Equipo y metodología', icon: Award, desc: 'Para propuestas técnicas detalladas' },
  ]

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      <Loader2 size={24} className="animate-spin mr-2" /> Cargando perfil…
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-10 p-6">

      {/* Header compacto + progreso en una sola franja */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles size={15} className="text-indigo-600 shrink-0" />
            <h1 className="text-sm font-bold text-gray-900">Perfil de empresa para IA</h1>
            <span className={clsx('text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0',
              pct >= 80 ? 'bg-emerald-100 text-emerald-700' :
              pct >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700')}>
              {totalOk}/{completitud.length} · {pct}%
            </span>
          </div>
          <button onClick={() => guardarMutation.mutate()} disabled={guardarMutation.isPending}
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors shrink-0">
            {guardarMutation.isPending ? <><Loader2 size={13} className="animate-spin" /> Guardando…</> : <><CheckCircle2 size={13} /> Guardar</>}
          </button>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div className={clsx('h-1.5 rounded-full transition-all duration-500',
            pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-indigo-500')}
            style={{ width: `${pct}%` }} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {completitud.map(c => (
            <span key={c.key} className={clsx('flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium',
              c.filled ? 'bg-emerald-50 text-emerald-700' :
              c.critical ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-400')}>
              {c.filled ? <CheckCircle2 size={10} /> : c.critical ? <AlertCircle size={10} /> : <span className="w-2.5 h-2.5 rounded-full border border-gray-300 inline-block" />}
              {c.label}
            </span>
          ))}
        </div>
        {!listoParaPostular && (
          <p className="text-[11px] text-red-600 font-medium">
            Faltan {criticos.length - criticosOk} campo{criticos.length - criticosOk !== 1 ? 's' : ''} crítico{criticos.length - criticosOk !== 1 ? 's' : ''} — la IA dejará [CAMPOS] vacíos.
          </p>
        )}
      </div>

      {/* Secciones acordeón */}
      {SECCIONES.map(sec => {
        const abierta = seccionAbierta === sec.key
        const Icon = sec.icon
        const camposSec = completitud.filter(c => c.grupo === sec.key || (sec.key === 'basico' && c.grupo === 'legal'))
        const secOk = camposSec.filter(c => c.filled).length
        return (
          <div key={sec.key} className="card overflow-hidden">
            <button
              onClick={() => setSeccionAbierta(abierta ? '' : sec.key)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                  secOk === camposSec.length && camposSec.length > 0 ? 'bg-emerald-100' : 'bg-indigo-100')}>
                  <Icon size={15} className={secOk === camposSec.length && camposSec.length > 0 ? 'text-emerald-600' : 'text-indigo-600'} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{sec.label}</p>
                  <p className="text-xs text-gray-500">{sec.desc}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {camposSec.length > 0 && (
                  <span className={clsx('text-[11px] font-bold px-2 py-0.5 rounded-full',
                    secOk === camposSec.length ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
                    {secOk}/{camposSec.length}
                  </span>
                )}
                {abierta ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
              </div>
            </button>

            {abierta && (
              <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-4">

                {/* ── DATOS LEGALES ── */}
                {sec.key === 'basico' && (<>
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
                </>)}

                {/* ── PERFIL PARA IA ── */}
                {sec.key === 'ia' && (<>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-gray-700">¿Qué hace tu empresa? <span className="text-red-400">*</span>
                        <span className="ml-1 text-[10px] font-normal text-indigo-500">← lo más importante</span>
                      </label>
                      <button type="button" onClick={() => generarConIA('descripcion')} disabled={generando === 'descripcion'}
                        className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-40">
                        {generando === 'descripcion' ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                        {generando === 'descripcion' ? 'Generando…' : 'Generar con IA'}
                      </button>
                    </div>
                    <textarea className="input text-sm w-full resize-none" rows={3}
                      placeholder="Ej: Empresa de aseo industrial con 8 años de experiencia en hospitales y minería. Equipo de 40 personas certificadas en RM y Biobío. Contamos con ISO 9001..."
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
                    <textarea rows={2} className="input text-xs w-full resize-none"
                      placeholder="Ej: Suministro de equipos Hospital Regional de Temuco (2023), Mantención vial Municipalidad de Rancagua…"
                      value={form.proyectos_anteriores} onChange={e => setForm(f => ({ ...f, proyectos_anteriores: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Certificaciones</label>
                    <input className="input text-xs w-full" placeholder="ISO 9001, OHSAS 18001…"
                      value={form.certificaciones} onChange={e => setForm(f => ({ ...f, certificaciones: e.target.value }))} />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-gray-700">¿Qué diferencia a tu empresa?</label>
                      <button type="button" onClick={() => generarConIA('diferenciadores')} disabled={generando === 'diferenciadores'}
                        className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-40">
                        {generando === 'diferenciadores' ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                        {generando === 'diferenciadores' ? 'Generando…' : 'Sugerir'}
                      </button>
                    </div>
                    <textarea rows={2} className="input text-xs w-full resize-none"
                      placeholder="Ej: Únicos con certificación ISO en la región, respuesta en 24h, equipo bilingüe…"
                      value={form.diferenciadores} onChange={e => setForm(f => ({ ...f, diferenciadores: e.target.value }))} />
                  </div>
                </>)}

                {/* ── RUBROS Y REGIONES ── */}
                {sec.key === 'rubros' && (<>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-gray-700">Rubros donde participas <span className="text-red-400">*</span></label>
                      {form.rubros.length > 0 && (
                        <button onClick={() => setForm(f => ({ ...f, rubros: [] }))} className="text-[10px] text-gray-400 hover:text-red-400">limpiar</button>
                      )}
                    </div>
                    {form.rubros.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {form.rubros.map(r => (
                          <button key={r} type="button" onClick={() => toggleRubro(r)}
                            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-indigo-600 text-white capitalize">
                            {r} <X size={10} />
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100 max-h-64 overflow-y-auto">
                      {RUBRO_CATEGORIAS.map(cat => {
                        const sel = cat.rubros.filter(r => form.rubros.includes(r))
                        const open = openCats.has(cat.label)
                        return (
                          <div key={cat.label}>
                            <button type="button" onClick={() => toggleCat(cat.label)}
                              className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 text-left">
                              <span>{cat.label} {sel.length > 0 && <span className="text-indigo-600 font-bold">({sel.length})</span>}</span>
                              {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                            {open && (
                              <div className="px-3 pb-2 flex flex-wrap gap-1.5 bg-gray-50">
                                {cat.rubros.map(r => (
                                  <button key={r} type="button" onClick={() => toggleRubro(r)}
                                    className={clsx('text-[11px] px-2 py-1 rounded-lg border transition-colors capitalize',
                                      form.rubros.includes(r) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300')}>
                                    {r}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-gray-700">Regiones donde operas <span className="text-red-400">*</span></label>
                      <div className="flex gap-2">
                        {form.regiones.length > 0 && <button onClick={() => setForm(f => ({ ...f, regiones: [] }))} className="text-[10px] text-gray-400 hover:text-red-400">limpiar</button>}
                        <button onClick={() => setForm(f => ({ ...f, regiones: regionesOrdenadas.map((r: any) => r.codigo) }))} className="text-[10px] text-indigo-500 hover:text-indigo-700">todas</button>
                      </div>
                    </div>
                    <input type="text" value={regionQuery} onChange={e => setRegionQuery(e.target.value)}
                      placeholder="Busca región o ciudad…" className="input text-xs w-full mb-2" />
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                      {regionesFiltradas.map((r: any) => {
                        const nombre = r.nombre.replace('Región Metropolitana de Santiago', 'RM — Santiago').replace('Región de ', '').replace('Región del ', '')
                        return (
                          <button key={r.codigo} type="button" onClick={() => toggleRegion(r.codigo)}
                            className={clsx('text-xs px-2.5 py-1 rounded-full border transition-colors',
                              form.regiones.includes(r.codigo) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300')}>
                            {nombre}
                          </button>
                        )
                      })}
                    </div>
                    {form.regiones.length > 0 && <p className="text-[10px] text-indigo-500 mt-1.5">{form.regiones.length} región{form.regiones.length > 1 ? 'es' : ''} seleccionada{form.regiones.length > 1 ? 's' : ''}</p>}
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
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Sitio web</label>
                      <input className="input text-xs w-full" placeholder="www.empresa.cl"
                        value={form.sitio_web} onChange={e => setForm(f => ({ ...f, sitio_web: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Dirección</label>
                      <input className="input text-xs w-full" placeholder="Av. Providencia 1234, Santiago"
                        value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Email para alertas de licitaciones</label>
                    <input type="email" className="input text-xs w-full" placeholder="alertas@empresa.cl"
                      value={form.email_alertas} onChange={e => setForm(f => ({ ...f, email_alertas: e.target.value }))} />
                    <p className="text-[10px] text-gray-400 mt-1">Recibirás avisos de nuevas licitaciones que coincidan con tus rubros</p>
                  </div>
                </>)}

                {/* ── EQUIPO Y METODOLOGÍA ── */}
                {sec.key === 'equipo' && (<>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Equipo técnico que ejecuta proyectos</label>
                    <textarea rows={2} className="input text-xs w-full resize-none"
                      placeholder="Ej: Equipo de 15 técnicos: 3 ingenieros civiles, 5 supervisores certificados, 7 operarios. Liderado por Ing. Juan Pérez (20 años de experiencia)."
                      value={form.equipo_tecnico} onChange={e => setForm(f => ({ ...f, equipo_tecnico: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Metodología de trabajo estándar</label>
                    <textarea rows={2} className="input text-xs w-full resize-none"
                      placeholder="Ej: Trabajamos bajo ISO 9001. Dividimos cada proyecto en diagnóstico, ejecución y entrega. Control semanal con el encargado del organismo."
                      value={form.metodologia_trabajo} onChange={e => setForm(f => ({ ...f, metodologia_trabajo: e.target.value }))} />
                  </div>
                </>)}

              </div>
            )}
          </div>
        )
      })}

      {/* CTA final */}
      {listoParaPostular && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={22} className="text-emerald-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-900">Perfil completo — listo para postular</p>
              <p className="text-xs text-emerald-600">Ya puedes buscar licitaciones y generar documentos con IA</p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => navigate('/licitaciones')}
              className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-600 text-white px-3.5 py-2 rounded-xl hover:bg-emerald-700">
              Buscar licitaciones <ArrowRight size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Guardar sticky */}
      <div className="sticky bottom-4">
        <button
          onClick={() => guardarMutation.mutate()}
          disabled={guardarMutation.isPending}
          className="w-full flex items-center justify-center gap-2 text-sm font-semibold py-3 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 shadow-lg transition-colors"
        >
          {guardarMutation.isPending ? <><Loader2 size={16} className="animate-spin" /> Guardando…</> : <><CheckCircle2 size={16} /> Guardar perfil</>}
        </button>
      </div>
    </div>
  )
}
