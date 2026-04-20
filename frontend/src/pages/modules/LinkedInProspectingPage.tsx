import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../api/client'
import { useAuthStore } from '../../store/authStore'
import toast from 'react-hot-toast'
import {
  Linkedin, Loader2, Search, Globe, ExternalLink, Users,
  UserCheck, TrendingUp, Mail, Phone, Copy, Building2, MapPin, Briefcase, Star,
} from 'lucide-react'
import ScoreBadge from '../../components/ui/ScoreBadge'
import type { Prospect } from '../../types'

const QUERIES_DISPLAY = [
  'CEO · Founder · Chile — inversión / patrimonio',
  'Dueño · Propietario · Chile — USA / Florida',
  'CEO · Gerente · Colombia — inversión / estados unidos',
  'Founder · Director · México — real estate / USA',
  'Empresario · Venezuela / Argentina — Miami / inversión internacional',
  'Médico · Doctor · Chile / Colombia / México — inversión',
  'Abogado · Arquitecto · Chile / Colombia — bienes raíces',
  'Family office · Wealth management — Latin America',
  'Investor · Inversionista LATAM — real estate',
  'President · Managing director · Perú / Ecuador / Panamá',
]

export default function LinkedInProspectingPage() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'

  const [jobId, setJobId] = useState<string | null>(null)
  const [searchSeconds, setSearchSeconds] = useState(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  const { data } = useQuery({
    queryKey: ['inmobiliaria-prospectos'],
    queryFn: () =>
      api.get('/inmobiliaria/prospectos', { params: { por_pagina: 200 } }).then(r => r.data),
  })

  const allProspects: Prospect[] = data?.prospectos ?? []
  const liLeads = allProspects.filter(p => (p as any).source === 'apify_linkedin')

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
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoBusqueda?.buscando])

  const startPolling = (id: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/inmobiliaria/buscar/${id}`)
        const { estado, resultado, error: jobError } = res.data
        if (estado === 'SUCCESS') {
          stopPolling(); setJobId(null)
          toast.success(`${resultado?.calificados ?? 0} calificados · ${resultado?.guardados ?? 0} nuevos leads de LinkedIn`)
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
      timerRef.current = setInterval(() => setSearchSeconds(s => s + 1), 1000)
      return api.post('/inmobiliaria/buscar')
    },
    onSuccess: (res) => {
      const { job_id, resultado } = res.data
      if (job_id) {
        setJobId(job_id)
        startPolling(job_id)
        toast('Buscando perfiles LinkedIn... puede tardar unos minutos ☕', { icon: '🔍' })
      } else if (resultado) {
        stopPolling()
        if (resultado.error) { toast.error(resultado.error); return }
        toast.success(`${resultado.calificados} calificados · ${resultado.guardados} nuevos leads`)
        qc.invalidateQueries({ queryKey: ['inmobiliaria-prospectos'] })
      } else {
        toast('Buscando en background... ☕', { icon: '🔍' })
        setJobId('background')
        let elapsed = 0
        pollRef.current = setInterval(async () => {
          elapsed += 30
          try {
            const r = await api.get('/inmobiliaria/prospectos', { params: { por_pagina: 1 } })
            if ((r.data?.total ?? 0) > 0 || elapsed >= 300) {
              stopPolling(); setJobId(null)
              qc.invalidateQueries({ queryKey: ['inmobiliaria-prospectos'] })
              toast.success('Leads encontrados')
            }
          } catch { stopPolling(); setJobId(null) }
        }, 30000)
      }
    },
    onError: (err: any) => {
      stopPolling(); setJobId(null)
      toast.error(err.response?.data?.detail || 'Error en la búsqueda')
    },
  })

  const calificados = liLeads.filter(p => p.is_qualified).length
  const conContacto = liLeads.filter(p => p.email || p.phone || p.linkedin_url).length

  const copiar = (texto: string, label: string) => {
    navigator.clipboard.writeText(texto)
    toast.success(`${label} copiado`)
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0A66C2]/10 flex items-center justify-center">
            <Linkedin size={20} className="text-[#0A66C2]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">LinkedIn Prospecting</h1>
            <p className="text-gray-500 text-sm">CEOs · Founders · Profesionales LATAM con capital para invertir en Florida</p>
          </div>
        </div>
        {isAdmin && (
          <button
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#0A66C2] hover:bg-[#004182] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* Stats — solo si hay leads */}
      {liLeads.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Leads encontrados', value: liLeads.length,  icon: <Users size={16} />,     color: 'text-gray-700',    bg: 'bg-gray-50' },
            { label: 'Calificados',        value: calificados,      icon: <UserCheck size={16} />, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Con contacto',       value: conContacto,      icon: <TrendingUp size={16} />, color: 'text-[#0A66C2]', bg: 'bg-blue-50' },
          ].map(s => (
            <div key={s.label} className={`card p-4 text-center ${s.bg}`}>
              <div className={`flex justify-center mb-1 ${s.color} opacity-60`}>{s.icon}</div>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Cómo funciona */}
      <div className="card p-5 border-l-4 border-[#0A66C2]">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">¿Cómo funciona?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="font-semibold text-gray-700 mb-1">🔍 Fase 1 — Google Search</p>
            <p className="text-gray-500">Busca URLs de perfiles LinkedIn con queries LATAM específicas (sin cookies)</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="font-semibold text-gray-700 mb-1">👤 Fase 2 — Enriquecimiento</p>
            <p className="text-gray-500">Extrae nombre real, cargo, empresa y ubicación de cada perfil</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="font-semibold text-gray-700 mb-1">⭐ Fase 3 — Calificación IA</p>
            <p className="text-gray-500">Claude puntúa 0–100. Score ≥ 65 pasa a Inmobiliaria como prospecto</p>
          </div>
        </div>
      </div>

      {/* Queries activas */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Search size={14} className="text-gray-400" />
          Búsquedas activas ({QUERIES_DISPLAY.length} queries)
        </h3>
        <div className="space-y-1.5">
          {QUERIES_DISPLAY.map((q, i) => (
            <div key={i} className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-gray-50 text-xs text-gray-600">
              <Globe size={11} className="text-[#0A66C2] flex-shrink-0" />
              {q}
            </div>
          ))}
        </div>
      </div>

      {/* Leads encontrados — tabla */}
      {liLeads.length > 0 && (
        <div className="card overflow-hidden">
          {/* Encabezado */}
          <div className="px-5 py-3 border-b border-gray-100 bg-[#0A66C2]/5 flex items-center justify-between">
            <p className="text-sm font-semibold text-[#0A66C2]">
              {liLeads.length} lead{liLeads.length !== 1 ? 's' : ''} encontrados
              <span className="ml-2 text-xs font-normal text-gray-400">· ordenados por score IA</span>
            </p>
          </div>

          {/* Cabecera de columnas */}
          <div className="hidden sm:grid grid-cols-[2fr_2.5fr_1.5fr_1fr_80px] gap-x-4 px-5 py-2 bg-gray-50 border-b border-gray-100 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            <span>Nombre</span>
            <span>Email</span>
            <span>Teléfono</span>
            <span>LinkedIn</span>
            <span className="text-right">Score</span>
          </div>

          {/* Filas */}
          <div className="divide-y divide-gray-100">
            {[...liLeads]
              .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
              .map(p => (
                <div key={p.id} className="px-5 py-4 hover:bg-gray-50/60 transition-colors">

                  {/* Fila principal — columnas de contacto */}
                  <div className="grid grid-cols-1 sm:grid-cols-[2fr_2.5fr_1.5fr_1fr_80px] gap-x-4 gap-y-2 items-center">

                    {/* Nombre */}
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-[#0A66C2]/10 flex items-center justify-center flex-shrink-0 text-[#0A66C2] font-bold text-xs">
                        {(p.contact_name || '?')[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate leading-tight">
                          {p.contact_name || 'Sin nombre'}
                        </p>
                        {p.is_qualified && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600">
                            <Star size={8} fill="currentColor" /> Calificado
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Email */}
                    <div>
                      {p.email ? (
                        <button
                          onClick={() => copiar(p.email!, 'Email')}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition-colors max-w-full"
                        >
                          <Mail size={11} className="flex-shrink-0" />
                          <span className="truncate">{p.email}</span>
                          <Copy size={9} className="flex-shrink-0 opacity-40" />
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300 italic">—</span>
                      )}
                    </div>

                    {/* Teléfono */}
                    <div>
                      {p.phone ? (
                        <button
                          onClick={() => copiar(p.phone!, 'Teléfono')}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-medium hover:bg-amber-100 transition-colors max-w-full"
                        >
                          <Phone size={11} className="flex-shrink-0" />
                          <span className="truncate">{p.phone}</span>
                          <Copy size={9} className="flex-shrink-0 opacity-40" />
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300 italic">—</span>
                      )}
                    </div>

                    {/* LinkedIn */}
                    <div>
                      {p.linkedin_url ? (
                        <a
                          href={p.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0A66C2]/10 text-[#0A66C2] text-xs font-medium hover:bg-[#0A66C2]/20 transition-colors"
                        >
                          <Linkedin size={11} />
                          <span>Ver</span>
                          <ExternalLink size={9} className="opacity-60" />
                        </a>
                      ) : (
                        <span className="text-xs text-gray-300 italic">—</span>
                      )}
                    </div>

                    {/* Score */}
                    <div className="sm:flex sm:justify-end">
                      <ScoreBadge score={p.score} />
                    </div>
                  </div>

                  {/* Fila de enriquecimiento */}
                  {(p.contact_title || p.company_name || p.city || p.country) && (
                    <div className="mt-2 ml-10 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      {p.contact_title && (
                        <span className="flex items-center gap-1">
                          <Briefcase size={11} className="text-gray-300" />
                          {p.contact_title}
                        </span>
                      )}
                      {p.company_name && (
                        <span className="flex items-center gap-1">
                          <Building2 size={11} className="text-gray-300" />
                          {p.company_name}
                          {p.industry && <span className="text-gray-400"> · {p.industry}</span>}
                        </span>
                      )}
                      {(p.city || p.country) && (
                        <span className="flex items-center gap-1">
                          <MapPin size={11} className="text-gray-300" />
                          {[p.city, p.country].filter(Boolean).join(', ')}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Estado vacío */}
      {liLeads.length === 0 && !buscarMutation.isPending && !jobId && (
        <div className="card p-12 text-center">
          <Linkedin size={40} className="mx-auto text-[#0A66C2] opacity-30 mb-3" />
          <p className="text-gray-500 text-sm font-medium">No hay leads de LinkedIn aún</p>
          <p className="text-gray-400 text-xs mt-1">
            {isAdmin ? 'Haz clic en "Buscar ahora" para iniciar el pipeline' : 'El administrador puede iniciar una búsqueda'}
          </p>
        </div>
      )}
    </div>
  )
}
