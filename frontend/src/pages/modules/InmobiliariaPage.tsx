import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../api/client'
import { useAuthStore } from '../../store/authStore'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import type { Prospect } from '../../types'
import ScoreBadge from '../../components/ui/ScoreBadge'
import {
  Loader2, MapPin, Mail, Linkedin, ArrowRight, X,
  RefreshCw, Search, Phone, ChevronDown, ChevronUp,
  Home, Star, Users, Globe, MessageCircle, Instagram,
  TrendingUp, UserCheck, UserX, Building2, Zap, ExternalLink,
} from 'lucide-react'

// Parsea "razón | tipo: X | accion: Y" de score_reason
function parseScoreReason(raw?: string): { razon: string; tipo?: string; accion?: string } {
  if (!raw) return { razon: '' }
  const partes = raw.split(' | ')
  const razon = partes[0] ?? ''
  const tipo = partes.find(p => p.startsWith('tipo:'))?.replace('tipo: ', '').replace('tipo:', '').trim()
  const accion = partes.find(p => p.startsWith('accion:'))?.replace('accion: ', '').replace('accion:', '').trim()
  return { razon, tipo, accion }
}

const ACCION_LABELS: Record<string, { label: string; color: string }> = {
  contactar_hoy:          { label: '⚡ Contactar hoy',         color: 'bg-emerald-100 text-emerald-700' },
  nutrir_contenido:       { label: '📩 Nutrir con contenido',  color: 'bg-sky-100 text-sky-700' },
  invitar_programa_referidos: { label: '🤝 Invitar a referidos', color: 'bg-violet-100 text-violet-700' },
  descartar:              { label: '🗑 Descartar',             color: 'bg-gray-100 text-gray-500' },
}

// ── Helpers ────────────────────────────────────────────────────────────────

function FuenteBadge({ source }: { source?: string }) {
  if (!source) return null
  const label = source.replace(/_/g, ' ')
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700">
      {label}
    </span>
  )
}

type FiltroCalidad = 'todos' | 'calificados' | 'con_email' | 'con_contacto'

// ── Página ─────────────────────────────────────────────────────────────────

export default function InmobiliariaPage() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'
  const [vista, setVista] = useState<'lista' | 'papelera'>('lista')
  const [expandedId, setExpandedId]   = useState<string | null>(null)
  const [filtroCalidad, setFiltroCalidad] = useState<FiltroCalidad>('todos')
  const [soloCalificados, setSoloCalificados] = useState(false)
  const [excluidoLoading, setExcluidoLoading] = useState<Record<string, boolean>>({})
  const [restaurarLoading, setRestaurarLoading] = useState<Record<string, boolean>>({})
  const [pipelineLoading, setPipelineLoading] = useState<Record<string, boolean>>({})
  const [searchSeconds, setSearchSeconds] = useState(0)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['inmobiliaria-prospectos'],
    queryFn: () =>
      api.get('/inmobiliaria/prospectos', { params: { por_pagina: 200 } }).then(r => r.data),
  })

  const allProspects: Prospect[] = (data?.prospectos ?? []).filter((p: Prospect) => (p as any).source !== 'apify_linkedin')

  const { data: dataPapelera, refetch: refetchPapelera } = useQuery({
    queryKey: ['inmobiliaria-descartados'],
    queryFn: () =>
      api.get('/inmobiliaria/descartados', { params: { por_pagina: 200 } }).then(r => r.data),
    enabled: vista === 'papelera',
  })
  const descartados: Prospect[] = dataPapelera?.prospectos ?? []

  const prospects = allProspects.filter(p => {
    if (soloCalificados && !p.is_qualified) return false
    if (filtroCalidad === 'calificados'   && !p.is_qualified) return false
    if (filtroCalidad === 'con_email'     && !p.email)        return false
    if (filtroCalidad === 'con_contacto'  && !p.email && !p.phone) return false
    return true
  })

  let timer: ReturnType<typeof setInterval> | null = null
  const [jobId, setJobId] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (timer) { clearInterval(timer); timer = null }
  }

  // Al cargar la página, verificar si hay búsqueda en curso en el servidor
  const { data: estadoBusqueda } = useQuery({
    queryKey: ['inmobiliaria-estado-busqueda'],
    queryFn: () => api.get('/inmobiliaria/buscar/estado').then(r => r.data),
  })

  useEffect(() => {
    if (estadoBusqueda?.buscando && !jobId) {
      setJobId('background')
      pollRef.current = setInterval(async () => {
        try {
          const r = await api.get('/inmobiliaria/buscar/estado')
          if (!r.data?.buscando) {
            stopPolling(); setJobId(null)
            qc.invalidateQueries({ queryKey: ['inmobiliaria-prospectos'] })
            toast('Búsqueda completada', { icon: '✅' })
          }
        } catch { stopPolling(); setJobId(null) }
      }, 15000)
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoBusqueda?.buscando])

  const startPolling = (id: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/inmobiliaria/buscar/${id}`)
        const { estado, resultado, error: jobError } = res.data
        if (estado === 'SUCCESS') {
          stopPolling(); setJobId(null)
          toast.success(`${resultado?.calificados ?? 0} calificados de ${resultado?.guardados ?? 0} nuevos leads`)
          qc.invalidateQueries({ queryKey: ['inmobiliaria-prospectos'] })
        } else if (estado === 'FAILURE') {
          stopPolling(); setJobId(null)
          toast.error(jobError || 'Error en la búsqueda')
        }
      } catch { stopPolling(); setJobId(null) }
    }, 5000)
  }

  const buscarMutation = useMutation({
    mutationFn: () => {
      setSearchSeconds(0)
      timer = setInterval(() => setSearchSeconds(s => s + 1), 1000)
      return api.post('/inmobiliaria/buscar')
    },
    onSuccess: (res) => {
      const { job_id, resultado } = res.data
      if (job_id) {
        setJobId(job_id)
        startPolling(job_id)
        toast('Buscando en background... puede tardar unos minutos ☕', { icon: '🔍' })
      } else if (resultado) {
        if (timer) clearInterval(timer)
        if (resultado.error) { toast.error(resultado.error); return }
        toast.success(`${resultado.calificados} calificados de ${resultado.guardados} nuevos leads`)
        qc.invalidateQueries({ queryKey: ['inmobiliaria-prospectos'] })
      } else {
        // Background asyncio — pollear prospectos cada 30s hasta que aparezcan o pasen 5 min
        toast('Buscando en redes sociales... puede tardar 2-3 minutos ☕', { icon: '🔍' })
        setJobId('background')
        let elapsed = 0
        pollRef.current = setInterval(async () => {
          elapsed += 30
          try {
            const r = await api.get('/inmobiliaria/prospectos', { params: { por_pagina: 1 } })
            if ((r.data?.total ?? 0) > 0) {
              stopPolling(); setJobId(null)
              if (timer) clearInterval(timer)
              toast.success('Leads encontrados')
              qc.invalidateQueries({ queryKey: ['inmobiliaria-prospectos'] })
            } else if (elapsed >= 300) {
              stopPolling(); setJobId(null)
              if (timer) clearInterval(timer)
              toast('Búsqueda completada. Revisa los resultados.', { icon: '✅' })
              qc.invalidateQueries({ queryKey: ['inmobiliaria-prospectos'] })
            }
          } catch { stopPolling(); setJobId(null); if (timer) clearInterval(timer) }
        }, 30000)
      }
    },
    onError: (err: any) => {
      if (timer) clearInterval(timer)
      setJobId(null)
      toast.error(err.response?.data?.detail || 'Error en la búsqueda')
    },
  })

  const excluir = async (id: string) => {
    if (!confirm('¿Descartar este prospecto? No volverá a aparecer en la lista.')) return
    setExcluidoLoading(p => ({ ...p, [id]: true }))
    try {
      await api.post(`/modules/prospector/prospectos/${id}/excluir`)
      toast.success('Prospecto descartado')
      qc.invalidateQueries({ queryKey: ['inmobiliaria-prospectos'] })
    } catch {
      toast.error('Error')
    } finally {
      setExcluidoLoading(p => ({ ...p, [id]: false }))
    }
  }

  const agregarPipeline = async (id: string) => {
    setPipelineLoading(p => ({ ...p, [id]: true }))
    try {
      await api.post(`/modules/prospector/prospectos/${id}/pipeline`)
      toast.success('Lead agregado al pipeline')
      qc.invalidateQueries({ queryKey: ['inmobiliaria-prospectos'] })
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Error al agregar al pipeline')
    } finally {
      setPipelineLoading(p => ({ ...p, [id]: false }))
    }
  }

  const restaurar = async (id: string) => {
    setRestaurarLoading(p => ({ ...p, [id]: true }))
    try {
      await api.post(`/modules/prospector/prospectos/${id}/restaurar`)
      toast.success('Lead recuperado')
      qc.invalidateQueries({ queryKey: ['inmobiliaria-prospectos'] })
      qc.invalidateQueries({ queryKey: ['inmobiliaria-descartados'] })
    } catch {
      toast.error('Error al recuperar')
    } finally {
      setRestaurarLoading(p => ({ ...p, [id]: false }))
    }
  }

  const calificados  = allProspects.filter(p => p.is_qualified).length
  const conContacto  = allProspects.filter(p => p.email || p.phone).length
  const sinContacto  = allProspects.filter(p => !p.email && !p.phone).length

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center">
            <Home size={20} className="text-brand-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Inmobiliaria</h1>
            <p className="text-gray-500 text-sm">Leads · LinkedIn · Instagram · Facebook · YouTube</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setVista('lista')}
            className={clsx('px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              vista === 'lista' ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            Prospectos
          </button>
          <button
            onClick={() => { setVista('papelera'); refetchPapelera() }}
            className={clsx('px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              vista === 'papelera' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            Recuperar leads
          </button>
          {vista === 'lista' && isAdmin && (
            <button
              className="btn-primary flex items-center gap-2 px-5 py-2.5"
              onClick={() => buscarMutation.mutate()}
              disabled={buscarMutation.isPending || !!jobId}
            >
              {buscarMutation.isPending
                ? <><Loader2 size={15} className="animate-spin" /> Iniciando...</>
                : jobId
                  ? <><Loader2 size={15} className="animate-spin" />
                      {searchSeconds > 0 ? `Buscando... ${searchSeconds}s` : 'En background...'}
                    </>
                  : <><Search size={15} /> Buscar ahora</>
              }
            </button>
          )}
        </div>
      </div>

      {/* ── Vista Recuperar leads ── */}
      {vista === 'papelera' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-sm font-semibold text-gray-700">
              {descartados.length === 0 ? 'Sin leads descartados' : `${descartados.length} lead${descartados.length !== 1 ? 's' : ''} descartado${descartados.length !== 1 ? 's' : ''}`}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Estos leads fueron descartados. Puedes recuperarlos y volverán a la lista principal.</p>
          </div>
          {descartados.length === 0 ? (
            <div className="p-12 text-center text-gray-400 text-sm">No hay leads descartados.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {descartados.map(p => {
                const fuente = (p as any).fuente_inmobiliaria as string | undefined
                return (
                  <div key={p.id} className="px-5 py-4 grid grid-cols-[auto_1fr_auto] gap-4 items-center">
                    <ScoreBadge score={p.score} />
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-500">{p.contact_name || p.company_name || 'Sin nombre'}</span>
                        <FuenteBadge source={fuente} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 text-xs text-gray-400">
                        {p.contact_title && <span>{p.contact_title}</span>}
                        {p.company_name && p.contact_name && <span>{p.company_name}</span>}
                        {(p.city || p.country) && <span>{[p.city, p.country].filter(Boolean).join(', ')}</span>}
                      </div>
                    </div>
                    <button
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-brand-50 hover:text-brand-600 transition-colors"
                      onClick={() => restaurar(p.id)}
                      disabled={restaurarLoading[p.id]}
                    >
                      {restaurarLoading[p.id] ? <Loader2 size={11} className="animate-spin" /> : <ArrowRight size={11} />}
                      Recuperar
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Stats ── */}
      {vista === 'lista' && allProspects.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Encontrados',   value: allProspects.length, color: 'text-gray-700',    bg: 'bg-gray-50',     icon: <Users size={16} /> },
            { label: 'Calificados',   value: calificados,          color: 'text-emerald-600', bg: 'bg-emerald-50',  icon: <UserCheck size={16} /> },
            { label: 'Con contacto',  value: conContacto,          color: 'text-brand-600',   bg: 'bg-brand-50',    icon: <MessageCircle size={16} /> },
            { label: 'Sin contacto',  value: sinContacto,          color: 'text-gray-400',    bg: 'bg-gray-50',     icon: <UserX size={16} /> },
          ].map(s => (
            <div key={s.label} className={`card p-4 text-center ${s.bg}`}>
              <div className={`flex justify-center mb-1 ${s.color} opacity-60`}>{s.icon}</div>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Filtros ── */}
      {vista === 'lista' && allProspects.length > 0 && (
        <div className="card p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide mr-1">Filtrar:</span>
          {([
            { id: 'todos',         label: 'Todos',          icon: <Home size={11} /> },
            { id: 'calificados',   label: 'Calificados',    icon: <Star size={11} /> },
            { id: 'con_email',     label: 'Con email',      icon: <Mail size={11} /> },
            { id: 'con_contacto',  label: 'Con contacto',   icon: <MessageCircle size={11} /> },
          ] as { id: FiltroCalidad; label: string; icon: React.ReactNode }[]).map(f => (
            <button
              key={f.id}
              onClick={() => setFiltroCalidad(f.id)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                filtroCalidad === f.id ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {f.icon}{f.label}
            </button>
          ))}
          <label className="flex items-center gap-1.5 ml-2 cursor-pointer text-xs text-gray-600">
            <input type="checkbox" checked={soloCalificados} onChange={e => setSoloCalificados(e.target.checked)} className="rounded" />
            Solo calificados (≥65)
          </label>
          <button onClick={() => refetch()} className="ml-auto text-gray-400 hover:text-gray-600">
            <RefreshCw size={13} />
          </button>
        </div>
      )}

      {/* ── Vacío ── */}
      {vista === 'lista' && !isLoading && allProspects.length === 0 && !buscarMutation.isPending && !estadoBusqueda?.buscando && (
        <div className="card p-16 text-center space-y-4">
          <Home size={48} className="mx-auto text-gray-200" />
          <div>
            <p className="font-semibold text-gray-500">Sin leads todavía</p>
            <p className="text-sm text-gray-400 mt-1">Los leads aparecen aquí automáticamente cada noche.<br />También puedes hacer clic en <strong>"Buscar ahora"</strong> para lanzar una búsqueda manual.</p>
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {vista === 'lista' && (buscarMutation.isPending || !!jobId || estadoBusqueda?.buscando) && allProspects.length === 0 && (
        <div className="card overflow-hidden">
          <div className="bg-gradient-to-br from-brand-50 to-violet-50 px-8 py-12 text-center space-y-6">
            {/* Ícono animado */}
            <div className="relative inline-flex">
              <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center">
                <Search size={28} className="text-brand-500" />
              </div>
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-brand-500 rounded-full flex items-center justify-center">
                <Loader2 size={11} className="text-white animate-spin" />
              </span>
            </div>

            <div className="space-y-1">
              <p className="text-lg font-semibold text-gray-800">Buscando personas interesadas...</p>
              <p className="text-sm text-gray-500">
                Esto puede tardar 1-3 minutos. Puedes seguir navegando.
              </p>
            </div>

            {/* Fuentes */}
            <div className="flex flex-wrap justify-center gap-2">
              {['Instagram', 'TikTok', 'Facebook', 'YouTube', 'Meta Ads', 'LinkedIn'].map(f => (
                <span key={f} className="px-3 py-1 bg-white rounded-full text-xs font-medium text-gray-600 shadow-sm border border-gray-100">
                  {f}
                </span>
              ))}
            </div>

            {/* Barra de progreso */}
            {searchSeconds > 0 && (
              <div className="max-w-xs mx-auto space-y-1.5">
                <div className="w-full bg-white/70 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-brand-500 h-1.5 rounded-full transition-all duration-1000"
                    style={{ width: `${Math.min((searchSeconds / 120) * 100, 90)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400">{searchSeconds}s — en proceso</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tabla de resultados ── */}
      {vista === 'lista' && prospects.length > 0 && (
        <div className="card overflow-hidden">
          {/* Cabecera tabla */}
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">
                {prospects.length} prospecto{prospects.length !== 1 ? 's' : ''}
                {buscarMutation.isPending && (
                  <span className="ml-2 text-brand-500 inline-flex items-center gap-1 font-normal text-xs">
                    <Loader2 size={10} className="animate-spin" /> actualizando...
                  </span>
                )}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Haz click en un prospecto para ver su email, teléfono y LinkedIn. Usa <strong className="text-gray-500">Descartar</strong> para los que no te interesan — los podrás recuperar después.
            </p>
          </div>

          {/* Filas */}
          <div className="divide-y divide-gray-100">
            {prospects.map(p => {
              const fuente = (p as any).fuente_inmobiliaria as string | undefined
              const isExpanded = expandedId === p.id

              const { razon, accion } = parseScoreReason(p.score_reason)
              const accionMeta = accion ? ACCION_LABELS[accion] : null

              return (
                <div key={p.id} className={clsx('transition-colors', isExpanded ? 'bg-brand-50/40' : 'hover:bg-gray-50/60')}>

                  {/* Fila — click para expandir */}
                  <div
                    className="px-5 py-4 grid grid-cols-[auto_1fr_auto] gap-4 items-center cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : p.id)}
                  >
                    <ScoreBadge score={p.score} />

                    <div className="min-w-0 space-y-1">
                      {/* Nombre + origen + acción */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-900">
                          {p.contact_name || p.company_name || 'Sin nombre'}
                        </span>
                        <FuenteBadge source={fuente} />
                        {accionMeta && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${accionMeta.color}`}>
                            {accionMeta.label}
                          </span>
                        )}
                      </div>
                      {/* Cargo · Empresa · Industria · Ubicación */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
                        {p.contact_title && <span className="text-gray-700 font-medium">{p.contact_title}</span>}
                        {p.contact_title && p.company_name && <span className="text-gray-300">·</span>}
                        {p.company_name && <span>{p.company_name}</span>}
                        {p.industry && p.industry !== 'social_media' && <><span className="text-gray-300">·</span><span>{p.industry}</span></>}
                        {(p.city || p.country) && (
                          <span className="flex items-center gap-0.5">
                            <span className="text-gray-300">·</span>
                            <MapPin size={10} />
                            {[p.city, p.country].filter(Boolean).join(', ')}
                          </span>
                        )}
                      </div>
                      {/* Comentario visible sin expandir */}
                      {p.signal_text && (
                        <div className="text-xs text-gray-500 italic truncate max-w-xl">
                          💬 "{p.signal_text.slice(0, 120)}{p.signal_text.length > 120 ? '…' : ''}"
                        </div>
                      )}
                    </div>

                    {/* Chevron + Descartar */}
                    <div className="flex items-center gap-3 shrink-0" onClick={e => e.stopPropagation()}>
                      <button
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        onClick={() => excluir(p.id)}
                        disabled={excluidoLoading[p.id]}
                      >
                        {excluidoLoading[p.id] ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
                        Descartar
                      </button>
                      <span className="text-gray-300" onClick={e => { e.stopPropagation(); setExpandedId(isExpanded ? null : p.id) }}>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </span>
                    </div>
                  </div>

                  {/* Panel expandido — contacto + razón del score + pipeline */}
                  {isExpanded && (
                    <div className="pl-[4.5rem] pr-5 pb-4 pt-2 border-t border-gray-100 space-y-3">
                      {/* Contacto */}
                      <div className="flex flex-wrap gap-x-5 gap-y-2">
                        {p.email && (
                          <a href={`mailto:${p.email}`} className="flex items-center gap-1.5 text-xs text-brand-600 hover:underline font-medium">
                            <Mail size={12} />{p.email}
                          </a>
                        )}
                        {p.phone && (
                          <span className="flex items-center gap-1.5 text-xs text-gray-600">
                            <Phone size={12} />{p.phone}
                          </span>
                        )}
                        {p.linkedin_url && (
                          (() => {
                            const url = p.linkedin_url
                            const isTikTok = url.includes('tiktok.com')
                            const isInstagram = url.includes('instagram.com')
                            const isLinkedIn = url.includes('linkedin.com')
                            const label = isTikTok ? '📱 Ver TikTok' : isInstagram ? '📸 Ver Instagram' : '🔗 Ver LinkedIn'
                            const cls = isTikTok ? 'text-black' : isInstagram ? 'text-pink-600' : 'text-blue-600'
                            return (
                              <a href={url} target="_blank" rel="noopener noreferrer"
                                className={`flex items-center gap-1.5 text-xs hover:underline font-medium ${cls}`}>
                                {isLinkedIn ? <Linkedin size={12} /> : <ExternalLink size={12} />} {label}
                              </a>
                            )
                          })()
                        )}
                        {p.source_url && (
                          <a href={p.source_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-violet-600 hover:underline font-medium">
                            <ExternalLink size={12} /> Ver publicación original
                          </a>
                        )}
                        {!p.email && !p.phone && !p.linkedin_url && !p.source_url && (
                          <span className="text-xs text-gray-400 italic">Sin datos de contacto disponibles</span>
                        )}
                      </div>
                      {/* Comentario que escribió — señal de intención */}
                      {(p.signal_text || p.notes) && (
                        <div className="text-xs text-gray-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 leading-relaxed">
                          <span className="font-medium text-amber-700 block mb-1">💬 Lo que dijo:</span>
                          "{(p.signal_text || p.notes || '').slice(0, 250)}{(p.signal_text || p.notes || '').length > 250 ? '…' : ''}"
                        </div>
                      )}
                      {/* Razón del score */}
                      {razon && (
                        <div className="flex items-start gap-1.5 text-xs text-gray-400 italic">
                          <Star size={11} className="text-amber-400 mt-0.5 shrink-0" />
                          <span>{razon}</span>
                        </div>
                      )}
                      {/* Botón pipeline */}
                      {!p.in_pipeline ? (
                        <button
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-50 text-brand-600 hover:bg-brand-100 transition-colors"
                          onClick={() => agregarPipeline(p.id)}
                          disabled={pipelineLoading[p.id]}
                        >
                          {pipelineLoading[p.id] ? <Loader2 size={11} className="animate-spin" /> : <ArrowRight size={11} />}
                          Agregar al pipeline
                        </button>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                          <TrendingUp size={11} /> En pipeline
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
