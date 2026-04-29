import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import api from '../../api/client'
import type { Prospect } from '../../types'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../store/authStore'
import {
  Star, MapPin, Mail, Phone, Building2, X, TrendingUp,
  Sparkles, Trash2, Bell, FileText, Send, Loader2,
  CheckCircle2, Globe, ChevronRight, Users,
} from 'lucide-react'

// ── Badges ────────────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-emerald-100 text-emerald-700' : score >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>{score.toFixed(0)}</span>
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  new:          { label: 'Nuevo',      color: 'bg-ink-2 text-ink-6' },
  qualified:    { label: 'Calificado', color: 'bg-blue-100 text-blue-700' },
  contacted:    { label: 'Contactado', color: 'bg-purple-100 text-purple-700' },
  responded:    { label: 'Respondió',  color: 'bg-green-100 text-green-700' },
  converted:    { label: 'Convertido', color: 'bg-emerald-100 text-emerald-700' },
  disqualified: { label: 'Descartado', color: 'bg-red-100 text-red-600' },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, color: 'bg-ink-2 text-ink-5' }
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>
}

// ── Panel lateral ─────────────────────────────────────────────────────────────

function ProspectPanel({ p, onClose }: { p: Prospect; onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [notas, setNotas] = useState((p as any).notes || '')
  const [alarmaFecha, setAlarmaFecha] = useState('')
  const [alarmaMotivo, setAlarmaMotivo] = useState('')
  const [enriching, setEnriching] = useState(false)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['prospectos'] })

  const mutNotas = useMutation({
    mutationFn: () => api.put(`/modules/prospector/prospectos/${p.id}/notas`, { notas }),
    onSuccess: () => { toast.success('Notas guardadas'); invalidate() },
    onError: () => toast.error('Error al guardar notas'),
  })

  const mutPipeline = useMutation({
    mutationFn: () => api.post(`/modules/prospector/prospectos/${p.id}/pipeline`),
    onSuccess: () => { toast.success('Agregado al pipeline'); invalidate(); navigate('/pipeline') },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Error al agregar al pipeline'),
  })

  const mutExcluir = useMutation({
    mutationFn: () => api.post(`/modules/prospector/prospectos/${p.id}/excluir`),
    onSuccess: () => { toast.success('Prospecto excluido'); invalidate(); onClose() },
    onError: () => toast.error('Error al excluir'),
  })

  const mutAlarma = useMutation({
    mutationFn: () => api.put(`/modules/prospector/prospectos/${p.id}/alarma`, { fecha: alarmaFecha, motivo: alarmaMotivo }),
    onSuccess: () => { toast.success('Alarma configurada'); invalidate() },
    onError: () => toast.error('Error al configurar alarma'),
  })

  const mutEnriquecer = useMutation({
    mutationFn: () => api.post(`/modules/licitaciones/enriquecer/${p.id}`),
    onMutate: () => setEnriching(true),
    onSuccess: (res) => {
      setEnriching(false)
      if (res.data.status === 'enriched') {
        toast.success(`Enriquecido: ${res.data.campos?.join(', ') || 'datos actualizados'}`)
        invalidate(); onClose()
      } else {
        toast('No se encontraron datos adicionales', { icon: '🔍', duration: 4000 })
      }
    },
    onError: () => { setEnriching(false); toast.error('Error al enriquecer') },
  })

  const mutMensaje = useMutation({
    mutationFn: () => api.post(`/modules/prospector/prospectos/${p.id}/generar-mensaje`, { canal: 'whatsapp' }),
    onSuccess: (res) => {
      navigator.clipboard.writeText(res.data.mensaje || '').catch(() => {})
      toast.success('Mensaje copiado al portapapeles')
    },
    onError: () => toast.error('Error al generar mensaje'),
  })

  return (
    <div className="w-full md:w-80 xl:w-96 shrink-0 md:sticky top-4 self-start bg-white rounded-2xl border border-ink-3 shadow-lg overflow-hidden" style={{ maxHeight: 'calc(100vh - 88px)', overflowY: 'auto' }}>

      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-ink-2 sticky top-0 bg-white z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-kap-50 flex items-center justify-center shrink-0">
            <Building2 size={16} className="text-kap-500" />
          </div>
          <div>
            <p className="font-semibold text-ink-9 leading-tight text-sm">{p.company_name || '—'}</p>
            {p.rut && <p className="text-xs text-ink-4">RUT: {p.rut}</p>}
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-ink-2 rounded-lg transition-colors shrink-0">
          <X size={15} className="text-ink-4" />
        </button>
      </div>

      <div className="p-4 space-y-4">

          {/* Score y estado */}
          <div className="flex items-center gap-2 flex-wrap">
            <ScoreBadge score={p.score} />
            <StatusBadge status={p.status} />
            {p.source_module && (
              <span className="text-xs bg-ink-2 text-ink-5 px-2 py-0.5 rounded-full">{p.source_module}</span>
            )}
          </div>
          {(p as any).score_reason && (
            <p className="text-xs text-ink-5 bg-ink-1 rounded-xl p-3 leading-relaxed">{(p as any).score_reason}</p>
          )}

          {/* Contacto */}
          <div>
            <p className="text-xs font-semibold text-ink-5 uppercase tracking-wide mb-2">Contacto</p>
            <div className="space-y-2">
              {p.contact_name && (
                <div className="flex items-center gap-2 text-sm">
                  <Building2 size={13} className="text-ink-4 shrink-0" />
                  <span className="text-ink-7">{p.contact_name}</span>
                </div>
              )}
              {p.email ? (
                <a href={`mailto:${p.email}`} className="flex items-center gap-2 text-sm text-kap-600 hover:underline">
                  <Mail size={13} className="shrink-0" />{p.email}
                </a>
              ) : (
                <div className="flex items-center gap-2 text-sm text-ink-4">
                  <Mail size={13} className="shrink-0" /><span className="italic">Sin email</span>
                </div>
              )}
              {p.phone ? (
                <a href={`tel:${p.phone}`} className="flex items-center gap-2 text-sm text-kap-600 hover:underline">
                  <Phone size={13} className="shrink-0" />{p.phone}
                </a>
              ) : (
                <div className="flex items-center gap-2 text-sm text-ink-4">
                  <Phone size={13} className="shrink-0" /><span className="italic">Sin teléfono</span>
                </div>
              )}
              {(p as any).website && (
                <a href={(p as any).website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-kap-600 hover:underline">
                  <Globe size={13} className="shrink-0" />{(p as any).website}
                </a>
              )}
              {p.city && (
                <div className="flex items-center gap-2 text-sm text-ink-5">
                  <MapPin size={13} className="shrink-0" />{p.city}{(p as any).region ? `, ${(p as any).region}` : ''}
                </div>
              )}
            </div>
          </div>

          {/* Acciones */}
          <div>
            <p className="text-xs font-semibold text-ink-5 uppercase tracking-wide mb-2">Acciones</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => mutEnriquecer.mutate()}
                disabled={enriching}
                className="flex items-center justify-center gap-2 p-3 rounded-xl border border-purple-200 text-purple-700 hover:bg-purple-50 disabled:opacity-50 transition-colors text-sm"
              >
                {enriching ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Enriquecer
              </button>
              <button
                onClick={() => mutPipeline.mutate()}
                disabled={mutPipeline.isPending}
                className="flex items-center justify-center gap-2 p-3 rounded-xl border border-kap-100 text-kap-700 hover:bg-kap-50 disabled:opacity-50 transition-colors text-sm"
              >
                {mutPipeline.isPending ? <Loader2 size={14} className="animate-spin" /> : <TrendingUp size={14} />}
                Al pipeline
              </button>
              <button
                onClick={() => mutMensaje.mutate()}
                disabled={mutMensaje.isPending}
                className="flex items-center justify-center gap-2 p-3 rounded-xl border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 transition-colors text-sm"
              >
                {mutMensaje.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Generar mensaje
              </button>
              <button
                onClick={() => { if (window.confirm('¿Excluir este prospecto?')) mutExcluir.mutate() }}
                disabled={mutExcluir.isPending}
                className="flex items-center justify-center gap-2 p-3 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors text-sm"
              >
                {mutExcluir.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Excluir
              </button>
            </div>
          </div>

          {/* Alarma */}
          <div>
            <p className="text-xs font-semibold text-ink-5 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Bell size={11} /> Alarma de seguimiento
            </p>
            <div className="space-y-2">
              <input
                type="date"
                value={alarmaFecha}
                onChange={e => setAlarmaFecha(e.target.value)}
                className="input w-full text-sm"
              />
              <input
                type="text"
                placeholder="Motivo (ej: Llamar para cotización)"
                value={alarmaMotivo}
                onChange={e => setAlarmaMotivo(e.target.value)}
                className="input w-full text-sm"
              />
              <button
                onClick={() => mutAlarma.mutate()}
                disabled={!alarmaFecha || mutAlarma.isPending}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 disabled:opacity-50 transition-colors text-sm"
              >
                {mutAlarma.isPending ? <Loader2 size={13} className="animate-spin" /> : <Bell size={13} />}
                Configurar alarma
              </button>
            </div>
          </div>

          {/* Notas */}
          <div>
            <p className="text-xs font-semibold text-ink-5 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <FileText size={11} /> Notas
            </p>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              rows={4}
              placeholder="Escribe notas sobre este prospecto..."
              className="input w-full text-sm resize-none"
            />
            <button
              onClick={() => mutNotas.mutate()}
              disabled={mutNotas.isPending}
              className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-ink-1 text-ink-7 border border-ink-3 hover:bg-ink-2 disabled:opacity-50 transition-colors text-sm"
            >
              {mutNotas.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              Guardar notas
            </button>
          </div>

      </div>
    </div>
  )
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="animate-pulse divide-y divide-ink-2">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-lg bg-ink-3 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-ink-3 rounded w-44" />
            <div className="h-2.5 bg-ink-2 rounded w-28" />
          </div>
          <div className="h-5 w-10 bg-ink-3 rounded-full" />
          <div className="h-5 w-16 bg-ink-2 rounded-full hidden md:block" />
        </div>
      ))}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function ProspectsPage() {
  const [modulo, setModulo] = useState('')
  const [soloCalificados, setSoloCalificados] = useState(false)
  const [pagina, setPagina] = useState(1)
  const [selected, setSelected] = useState<Prospect | null>(null)

  const { user } = useAuthStore()
  const isSuperAdmin = user?.role === 'super_admin'
  const userModuleTypes: string[] = isSuperAdmin
    ? ['licitador', 'prospector']
    : (user?.modules ?? []).map(m => m.tipo)
  const tieneLicitador  = userModuleTypes.includes('licitador')
  const tieneProspector = userModuleTypes.includes('prospector')

  const { data, isLoading } = useQuery({
    queryKey: ['prospectos', modulo, soloCalificados, pagina],
    queryFn: () => api.get('/modules/prospector/prospectos', {
      params: { modulo: modulo || undefined, solo_calificados: soloCalificados, pagina, por_pagina: 25 }
    }).then(r => r.data),
  })

  // Stats — fetch todos para contar por estado
  const { data: allData } = useQuery({
    queryKey: ['prospectos-stats'],
    queryFn: () => api.get('/modules/prospector/prospectos', { params: { por_pagina: 500 } }).then(r => r.data),
    staleTime: 30_000,
  })

  const stats = {
    total:       allData?.total ?? 0,
    calificados: allData?.prospectos?.filter((p: Prospect) => p.is_qualified).length ?? 0,
    contactados: allData?.prospectos?.filter((p: Prospect) => ['contacted','responded','converted'].includes(p.status)).length ?? 0,
    enPipeline:  allData?.prospectos?.filter((p: Prospect) => (p as any).in_pipeline).length ?? 0,
  }

  return (
    <div className={`min-w-0 ${selected ? 'flex flex-col md:flex-row gap-4 md:items-start' : 'space-y-4'}`}>

      {/* Columna izquierda: todo el contenido */}
      <div className="flex-1 min-w-0 space-y-4">

      {/* Título */}
      <div>
        <h1 className="text-2xl font-bold text-ink-9">Prospectos</h1>
        <p className="text-sm text-ink-5 mt-0.5">{stats.total} en total</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: Users,      label: 'Total',       value: stats.total,       color: 'text-kap-600',   bg: 'bg-kap-50'   },
          { icon: Star,       label: 'Calificados', value: stats.calificados, color: 'text-amber-600',   bg: 'bg-amber-50'   },
          { icon: Send,       label: 'Contactados', value: stats.contactados, color: 'text-purple-600',  bg: 'bg-purple-50'  },
          { icon: TrendingUp, label: 'En pipeline', value: stats.enPipeline,  color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map(({ icon: Icon, label, value, color, bg }) => (
          <div key={label} className="card p-3 md:p-4 flex items-center gap-3 min-w-0">
            <div className={`w-8 h-8 md:w-9 md:h-9 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
              <Icon size={15} className={color} />
            </div>
            <div className="min-w-0">
              <p className="text-lg md:text-xl font-bold text-ink-9 leading-none">{value}</p>
              <p className="text-xs text-ink-5 mt-0.5 truncate">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="card px-4 py-3 flex flex-wrap items-center gap-2">
        {[
          { value: '',            label: 'Todos',                  show: true },
          { value: 'licitador_a', label: 'Licitaciones Abiertas',  show: tieneLicitador },
          { value: 'licitador_b', label: 'Empresas Ganadoras',     show: tieneLicitador },
          { value: 'prospector',  label: 'Prospección',           show: tieneProspector },
        ].filter(opt => opt.show).map(opt => (
          <button
            key={opt.value}
            onClick={() => { setModulo(opt.value); setPagina(1) }}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
              modulo === opt.value
                ? 'bg-kap-500 text-white border-kap-300'
                : 'bg-white text-ink-6 border-ink-3 hover:border-kap-300 hover:text-kap-600'
            }`}
          >
            {opt.label}
          </button>
        ))}
        <div className="w-px h-5 bg-ink-3 mx-1" />
        <button
          onClick={() => { setSoloCalificados(v => !v); setPagina(1) }}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
            soloCalificados
              ? 'bg-amber-500 text-white border-amber-500'
              : 'bg-white text-ink-6 border-ink-3 hover:border-amber-400 hover:text-amber-600'
          }`}
        >
          ⭐ Solo calificados
        </button>
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden mt-2">
        {isLoading ? (
          <TableSkeleton />
        ) : !data?.prospectos?.length ? (
          <div className="p-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-ink-2 flex items-center justify-center mx-auto mb-4">
              <Users size={24} className="text-ink-4" />
            </div>
            <p className="font-semibold text-ink-7 mb-1">Todavía no tienes prospectos</p>
            <p className="text-sm text-ink-4 mb-4">
              {tieneLicitador && tieneProspector && <>Ve a{' '}<Link to="/licitaciones" className="text-kap-500 font-medium hover:underline">Licitaciones</Link>{' '}o{' '}<Link to="/prospeccion" className="text-kap-500 font-medium hover:underline">Prospección</Link>{' '}para encontrar clientes.</>}
              {tieneLicitador && !tieneProspector && <>Ve a{' '}<Link to="/licitaciones" className="text-kap-500 font-medium hover:underline">Licitaciones</Link>{' '}para encontrar clientes.</>}
              {!tieneLicitador && tieneProspector && <>Ve a{' '}<Link to="/prospeccion" className="text-kap-500 font-medium hover:underline">Prospección</Link>{' '}para encontrar clientes.</>}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-ink-1 border-b border-ink-3">
              <tr>
                <th className="text-left pl-5 pr-4 py-3 font-medium text-ink-6">Empresa</th>
                <th className="text-left px-4 py-3 font-medium text-ink-6 hidden sm:table-cell">Contacto</th>
                <th className="text-left px-4 py-3 font-medium text-ink-6">Score</th>
                <th className="text-left px-4 py-3 font-medium text-ink-6 hidden md:table-cell">Estado</th>
                <th className="px-4 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-2">
              {data.prospectos.map((p: Prospect) => (
                <tr
                  key={p.id}
                  onClick={() => setSelected(p)}
                  className="hover:bg-kap-50/40 transition-colors cursor-pointer group"
                >
                  <td className="pl-4 pr-3 py-3 md:pl-5 md:pr-4">
                    <div className="flex items-center gap-2 md:gap-3">
                      <div className="w-8 h-8 rounded-lg bg-kap-50 flex items-center justify-center shrink-0">
                        <Building2 size={14} className="text-kap-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-ink-9 truncate text-sm">{p.company_name || '—'}</p>
                        {p.city && <p className="text-xs text-ink-4 truncate md:hidden">{p.city}</p>}
                        {p.rut && <p className="text-xs text-ink-4 hidden md:block">RUT: {p.rut}</p>}
                        {p.source_module && (
                          <span className="text-[10px] bg-ink-2 text-ink-5 px-1.5 py-0.5 rounded-full hidden md:inline">{p.source_module}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <div className="space-y-0.5">
                      {p.contact_name && <p className="text-ink-7">{p.contact_name}</p>}
                      {p.email
                        ? <p className="text-ink-4 flex items-center gap-1"><Mail size={11} />{p.email}</p>
                        : <p className="text-ink-4 flex items-center gap-1 italic text-xs"><Mail size={11} />Sin email</p>
                      }
                      {p.phone && <p className="text-ink-4 flex items-center gap-1"><Phone size={11} />{p.phone}</p>}
                      {p.city && <p className="text-ink-4 flex items-center gap-1"><MapPin size={11} />{p.city}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <ScoreBadge score={p.score} />
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3 text-ink-4 group-hover:text-kap-600 transition-colors">
                    <ChevronRight size={16} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginación */}
      {data?.total > 25 && (
        <div className="flex justify-center gap-2">
          <button className="btn-secondary text-sm py-1.5" disabled={pagina === 1} onClick={() => setPagina(p => p - 1)}>Anterior</button>
          <span className="px-4 py-1.5 text-sm text-ink-6">Página {pagina}</span>
          <button className="btn-secondary text-sm py-1.5" disabled={pagina * 25 >= data.total} onClick={() => setPagina(p => p + 1)}>Siguiente</button>
        </div>
      )}

      </div>{/* fin columna izquierda */}

      {/* Panel derecho inline */}
      {selected && <ProspectPanel p={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
