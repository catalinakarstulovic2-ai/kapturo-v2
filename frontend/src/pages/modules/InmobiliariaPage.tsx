import { useState } from 'react'
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
  Home, Star, Users, Globe, Flag,
} from 'lucide-react'

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

const DEFAULT_PARAMS = {
  max_por_query: 20,
}

type FiltroCalidad = 'todos' | 'calificados' | 'con_email' | 'con_web'

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
  const [searchSeconds, setSearchSeconds] = useState(0)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['inmobiliaria-prospectos'],
    queryFn: () =>
      api.get('/inmobiliaria/prospectos', { params: { por_pagina: 200 } }).then(r => r.data),
  })
  const allProspects: Prospect[] = data?.prospectos ?? []

  const { data: dataPapelera, refetch: refetchPapelera } = useQuery({
    queryKey: ['inmobiliaria-descartados'],
    queryFn: () =>
      api.get('/inmobiliaria/descartados', { params: { por_pagina: 200 } }).then(r => r.data),
    enabled: vista === 'papelera',
  })
  const descartados: Prospect[] = dataPapelera?.prospectos ?? []

  const prospects = allProspects.filter(p => {
    if (soloCalificados && !p.is_qualified) return false
    if (filtroCalidad === 'calificados' && !p.is_qualified) return false
    if (filtroCalidad === 'con_email'   && !p.email)       return false
    if (filtroCalidad === 'con_web'     && !(p as any).website) return false
    return true
  })

  let timer: ReturnType<typeof setInterval> | null = null
  const buscarMutation = useMutation({
    mutationFn: () => {
      setSearchSeconds(0)
      timer = setInterval(() => setSearchSeconds(s => s + 1), 1000)
      return api.post('/inmobiliaria/buscar', DEFAULT_PARAMS)
    },
    onSuccess: (res) => {
      if (timer) clearInterval(timer)
      const r = res.data.resultado
      const enrich = r.total_enriquecidos ? ` · ${r.total_enriquecidos} con email` : ''
      toast.success(`${r.total_calificados} calificados de ${r.total_guardados} guardados${enrich}`)
      qc.invalidateQueries({ queryKey: ['inmobiliaria-prospectos'] })
    },
    onError: (err: any) => {
      if (timer) clearInterval(timer)
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

  const calificados = allProspects.filter(p => p.is_qualified).length
  const enContacto  = allProspects.filter(p => (p as any).contactado).length

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
            <p className="text-gray-500 text-sm">Prospección · Google Maps + Hunter.io + Claude</p>
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
              disabled={buscarMutation.isPending}
            >
              {buscarMutation.isPending
                ? <><Loader2 size={15} className="animate-spin" />
                    {searchSeconds > 0 ? `Buscando... ${searchSeconds}s` : 'Iniciando búsqueda...'}
                  </>
                : <><Search size={15} /> Buscar prospectos</>
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
            { label: 'Encontrados',  value: allProspects.length, color: 'text-gray-700',    bg: 'bg-gray-50' },
            { label: 'Calificados',  value: calificados,          color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Contactados',  value: enContacto,           color: 'text-brand-600',   bg: 'bg-brand-50' },
            { label: 'Sin contacto', value: allProspects.filter(p => !p.email && !p.phone).length, color: 'text-gray-400', bg: 'bg-gray-50' },
          ].map(s => (
            <div key={s.label} className={`card p-4 text-center ${s.bg}`}>
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
            { id: 'todos',       label: 'Todos',       icon: <Home size={11} /> },
            { id: 'calificados', label: 'Calificados', icon: <Star size={11} /> },
            { id: 'con_email',   label: 'Con email',   icon: <Mail size={11} /> },
            { id: 'con_web',     label: 'Con web',     icon: <Globe size={11} /> },
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
      {vista === 'lista' && !isLoading && allProspects.length === 0 && !buscarMutation.isPending && (
        <div className="card p-16 text-center space-y-4">
          <Home size={48} className="mx-auto text-gray-200" />
          <div>
            <p className="font-semibold text-gray-500">Sin prospectos todavía</p>
            <p className="text-sm text-gray-400 mt-1">Haz clic en <strong>"Buscar prospectos"</strong> para encontrar<br />agencias inmobiliarias, constructoras y desarrolladores.</p>
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {vista === 'lista' && buscarMutation.isPending && allProspects.length === 0 && (
        <div className="card p-14 text-center space-y-3">
          <Loader2 size={36} className="mx-auto text-brand-400 animate-spin" />
          <p className="font-semibold text-gray-600">Buscando compradores potenciales...</p>
          <p className="text-sm text-gray-400">Apollo LATAM · Apollo USA · Facebook · Reddit · Instagram · TikTok</p>
          {searchSeconds > 5 && (
            <div className="w-48 mx-auto bg-gray-100 rounded-full h-1">
              <div className="bg-brand-400 h-1 rounded-full transition-all duration-1000"
                style={{ width: `${Math.min((searchSeconds / 60) * 100, 92)}%` }} />
            </div>
          )}
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

              return (
                <div key={p.id} className={clsx('transition-colors', isExpanded ? 'bg-brand-50/40' : 'hover:bg-gray-50/60')}>

                  {/* Fila — click para expandir */}
                  <div
                    className="px-5 py-4 grid grid-cols-[auto_1fr_auto] gap-4 items-center cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : p.id)}
                  >
                    <ScoreBadge score={p.score} />

                    <div className="min-w-0 space-y-1">
                      {/* Nombre + origen */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-900">
                          {p.contact_name || p.company_name || 'Sin nombre'}
                        </span>
                        <FuenteBadge source={fuente} />
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

                  {/* Panel expandido — contacto + razón del score */}
                  {isExpanded && (
                    <div className="pl-[4.5rem] pr-5 pb-4 pt-2 border-t border-gray-100">
                      <div className="flex flex-wrap gap-x-5 gap-y-2 mb-2">
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
                          <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline">
                            <Linkedin size={12} /> Ver LinkedIn
                          </a>
                        )}
                        {!p.email && !p.phone && !p.linkedin_url && (
                          <span className="text-xs text-gray-400 italic">Sin datos de contacto disponibles</span>
                        )}
                      </div>
                      {p.score_reason && (
                        <div className="flex items-start gap-1.5 text-xs text-gray-400 italic border-t border-gray-100 pt-2">
                          <Star size={11} className="text-amber-400 mt-0.5 shrink-0" />
                          <span>{p.score_reason}</span>
                        </div>
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
