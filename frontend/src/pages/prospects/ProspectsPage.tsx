import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../api/client'
import type { Prospect } from '../../types'
import toast from 'react-hot-toast'
import {
  Star, MapPin, Mail, Phone, Building2, X, TrendingUp,
  Sparkles, Trash2, Bell, FileText, Send, Loader2,
  CheckCircle2, Globe, ChevronRight,
} from 'lucide-react'

// ── Badges ────────────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-emerald-100 text-emerald-700' : score >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>{score.toFixed(0)}</span>
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  new:          { label: 'Nuevo',      color: 'bg-gray-100 text-gray-600' },
  qualified:    { label: 'Calificado', color: 'bg-blue-100 text-blue-700' },
  contacted:    { label: 'Contactado', color: 'bg-purple-100 text-purple-700' },
  responded:    { label: 'Respondió',  color: 'bg-green-100 text-green-700' },
  converted:    { label: 'Convertido', color: 'bg-emerald-100 text-emerald-700' },
  disqualified: { label: 'Descartado', color: 'bg-red-100 text-red-600' },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, color: 'bg-gray-100 text-gray-500' }
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
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white shadow-2xl flex flex-col h-full overflow-y-auto">

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
              <Building2 size={18} className="text-brand-500" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 leading-tight">{p.company_name || '—'}</p>
              {p.rut && <p className="text-xs text-gray-400">RUT: {p.rut}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-1 p-5 space-y-6">

          {/* Score y estado */}
          <div className="flex items-center gap-3 flex-wrap">
            <ScoreBadge score={p.score} />
            <StatusBadge status={p.status} />
            {p.source_module && (
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{p.source_module}</span>
            )}
          </div>
          {(p as any).score_reason && (
            <p className="text-xs text-gray-500 bg-gray-50 rounded-xl p-3 leading-relaxed">{(p as any).score_reason}</p>
          )}

          {/* Contacto */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Contacto</p>
            <div className="space-y-2">
              {p.contact_name && (
                <div className="flex items-center gap-2 text-sm">
                  <Building2 size={13} className="text-gray-400 shrink-0" />
                  <span className="text-gray-700">{p.contact_name}</span>
                </div>
              )}
              {p.email ? (
                <a href={`mailto:${p.email}`} className="flex items-center gap-2 text-sm text-brand-600 hover:underline">
                  <Mail size={13} className="shrink-0" />{p.email}
                </a>
              ) : (
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <Mail size={13} className="shrink-0" /><span className="italic">Sin email</span>
                </div>
              )}
              {p.phone ? (
                <a href={`tel:${p.phone}`} className="flex items-center gap-2 text-sm text-brand-600 hover:underline">
                  <Phone size={13} className="shrink-0" />{p.phone}
                </a>
              ) : (
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <Phone size={13} className="shrink-0" /><span className="italic">Sin teléfono</span>
                </div>
              )}
              {(p as any).website && (
                <a href={(p as any).website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-brand-600 hover:underline">
                  <Globe size={13} className="shrink-0" />{(p as any).website}
                </a>
              )}
              {p.city && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <MapPin size={13} className="shrink-0" />{p.city}{(p as any).region ? `, ${(p as any).region}` : ''}
                </div>
              )}
            </div>
          </div>

          {/* Acciones */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Acciones</p>
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
                className="flex items-center justify-center gap-2 p-3 rounded-xl border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 transition-colors text-sm"
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
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
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
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
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
              className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 disabled:opacity-50 transition-colors text-sm"
            >
              {mutNotas.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              Guardar notas
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function ProspectsPage() {
  const [modulo, setModulo] = useState('')
  const [soloCalificados, setSoloCalificados] = useState(false)
  const [pagina, setPagina] = useState(1)
  const [selected, setSelected] = useState<Prospect | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['prospectos', modulo, soloCalificados, pagina],
    queryFn: () => api.get('/modules/prospector/prospectos', {
      params: { modulo: modulo || undefined, solo_calificados: soloCalificados, pagina, por_pagina: 25 }
    }).then(r => r.data),
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Prospectos</h1>
        <span className="text-sm text-gray-500">{data?.total ?? 0} en total</span>
      </div>

      {/* Filtros */}
      <div className="card p-4 flex flex-wrap gap-3">
        <select className="input w-auto" value={modulo} onChange={e => { setModulo(e.target.value); setPagina(1) }}>
          <option value="">Todos los módulos</option>
          <option value="licitador_a">Licitador A</option>
          <option value="licitador_b">Licitador B</option>
          <option value="prospector">Prospector</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={soloCalificados} onChange={e => { setSoloCalificados(e.target.checked); setPagina(1) }} className="rounded" />
          Solo calificados
        </label>
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Cargando prospectos...</div>
        ) : !data?.prospectos?.length ? (
          <div className="p-8 text-center text-gray-400">
            <Star size={32} className="mx-auto mb-2 opacity-30" />
            <p>No hay prospectos aún. Lanza una búsqueda en Licitaciones o Prospector.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Empresa</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Contacto</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Score</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Estado</th>
                <th className="px-4 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.prospectos.map((p: Prospect) => (
                <tr
                  key={p.id}
                  onClick={() => setSelected(p)}
                  className="hover:bg-brand-50/40 transition-colors cursor-pointer group"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                        <Building2 size={14} className="text-brand-500" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{p.company_name || '—'}</p>
                        {p.rut && <p className="text-xs text-gray-400">RUT: {p.rut}</p>}
                        {p.source_module && (
                          <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{p.source_module}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <div className="space-y-0.5">
                      {p.contact_name && <p className="text-gray-700">{p.contact_name}</p>}
                      {p.email
                        ? <p className="text-gray-400 flex items-center gap-1"><Mail size={11} />{p.email}</p>
                        : <p className="text-gray-300 flex items-center gap-1 italic text-xs"><Mail size={11} />Sin email</p>
                      }
                      {p.phone && <p className="text-gray-400 flex items-center gap-1"><Phone size={11} />{p.phone}</p>}
                      {p.city && <p className="text-gray-400 flex items-center gap-1"><MapPin size={11} />{p.city}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <ScoreBadge score={p.score} />
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-300 group-hover:text-brand-400 transition-colors">
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
          <span className="px-4 py-1.5 text-sm text-gray-600">Página {pagina}</span>
          <button className="btn-secondary text-sm py-1.5" disabled={pagina * 25 >= data.total} onClick={() => setPagina(p => p + 1)}>Siguiente</button>
        </div>
      )}

      {/* Panel lateral */}
      {selected && <ProspectPanel p={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
