import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../api/client'
import { useAuthStore } from '../../store/authStore'
import toast from 'react-hot-toast'
import {
  Phone, Mail, Globe, MapPin, Clock, ChevronRight,
  X, Edit2, Plus, Trash2, MessageCircle, Bell,
  Building2, Settings, ExternalLink,
} from 'lucide-react'
import type { PipelineStage, PipelineCard } from '../../types'
import clsx from 'clsx'

// ── Helpers ───────────────────────────────────────────────────────────────────

const daysInStage = (created_at?: string) => {
  if (!created_at) return 0
  return Math.floor((Date.now() - new Date(created_at).getTime()) / 86400000)
}

const ScoreBadge = ({ score }: { score: number }) => {
  const color =
    score >= 70 ? 'bg-emerald-100 text-emerald-700'
    : score >= 40 ? 'bg-amber-100 text-amber-700'
    : 'bg-red-100 text-red-700'
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>
      {score.toFixed(0)} pts
    </span>
  )
}

const DaysBadge = ({ days }: { days: number }) => {
  const color = days <= 2 ? 'text-emerald-600' : days <= 6 ? 'text-amber-600' : 'text-red-500'
  return (
    <span className={`text-xs flex items-center gap-0.5 font-medium ${color}`}>
      <Clock size={10} />{days}d
    </span>
  )
}

const COLORS = ['#6366f1', '#f59e0b', '#3b82f6', '#8b5cf6', '#10b981', '#ef4444', '#06b6d4', '#f97316']

// ── Tarjeta Kanban ────────────────────────────────────────────────────────────

function KanbanCard({ card, onClick, onDragStart, onDragEnd, isDragging }: {
  card: PipelineCard
  onClick: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  isDragging: boolean
}) {
  const p = card.prospect
  const days = daysInStage(card.created_at)

  return (
    <div
      draggable
      onDragStart={e => { e.stopPropagation(); onDragStart(e) }}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={clsx(
        'bg-white rounded-xl p-3 shadow-sm border border-gray-100 cursor-grab select-none',
        'hover:shadow-md hover:border-brand-200 transition-all duration-150',
        isDragging && 'opacity-30 scale-95 rotate-1 cursor-grabbing'
      )}
    >
      <div className={clsx(isDragging && 'pointer-events-none')}>
      {/* Score + días */}
      <div className="flex items-center justify-between mb-2">
        <ScoreBadge score={p?.score || 0} />
        <DaysBadge days={days} />
      </div>

      {/* Empresa */}
      <p className="font-semibold text-gray-900 text-sm truncate leading-tight">
        {p?.company_name || 'Empresa sin nombre'}
      </p>

      {/* Contacto */}
      {p?.contact_name && (
        <p className="text-xs text-gray-500 truncate mt-0.5">
          {p.contact_name}{p.contact_title ? ` · ${p.contact_title}` : ''}
        </p>
      )}

      {/* Ciudad */}
      {p?.city && (
        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
          <MapPin size={10} />{p.city}
        </p>
      )}

      {/* Iconos de contacto disponible */}
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-50">
        {p?.phone || p?.whatsapp
          ? <Phone size={11} className="text-emerald-500" />
          : null}
        {p?.email
          ? <Mail size={11} className="text-blue-500" />
          : null}
        {p?.website
          ? <Globe size={11} className="text-purple-500" />
          : null}
        {!p?.phone && !p?.whatsapp && !p?.email && (
          <span className="text-xs text-gray-300">Sin datos de contacto</span>
        )}
      </div>
      </div>
    </div>
  )
}

// ── Panel lateral ─────────────────────────────────────────────────────────────

function ProspectPanel({ card, stages, onClose, isAdmin }: {
  card: PipelineCard
  stages: PipelineStage[]
  onClose: () => void
  isAdmin: boolean
}) {
  const qc = useQueryClient()
  const p = card.prospect
  const [notes, setNotes] = useState(card.notes || '')
  const [alarmDate, setAlarmDate] = useState(
    card.next_action_at ? card.next_action_at.split('T')[0] : ''
  )

  const currentStage = stages.find(s => s.id === card.stage_id)
  const nextStage = stages.find(
    s => s.order === (currentStage?.order || 0) + 1 && !s.is_won && !s.is_lost
  )

  const updateMutation = useMutation({
    mutationFn: (data: { notes?: string; next_action_at?: string | null }) =>
      api.put(`/pipeline/tarjetas/${card.id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline'] })
      toast.success('Guardado')
    },
  })

  const moverMutation = useMutation({
    mutationFn: (stageId: string) =>
      api.put(`/pipeline/tarjetas/${card.id}/mover`, { stage_id: stageId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline'] })
      toast.success('Lead movido')
      onClose()
    },
  })

  const eliminarMutation = useMutation({
    mutationFn: () => api.delete(`/pipeline/tarjetas/${card.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline'] })
      toast.success('Removido del pipeline')
      onClose()
    },
  })

  const phone = p?.whatsapp || p?.phone || ''
  const whatsappUrl = phone ? `https://wa.me/${phone.replace(/\D/g, '')}` : null
  const emailUrl = p?.email ? `mailto:${p.email}` : null

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Fondo oscuro */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-96 bg-white shadow-2xl flex flex-col h-full overflow-y-auto">

        {/* Cabecera */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-lg leading-tight truncate">
              {p?.company_name || 'Empresa'}
            </p>
            {p?.contact_name && (
              <p className="text-sm text-gray-500 mt-0.5">
                {p.contact_name}{p.contact_title ? ` · ${p.contact_title}` : ''}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <ScoreBadge score={p?.score || 0} />
              {currentStage && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full text-white font-medium"
                  style={{ backgroundColor: currentStage.color }}
                >
                  {currentStage.name}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-3 shrink-0 mt-1">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 p-5 space-y-6">

          {/* Contactar ahora */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Contactar ahora
            </p>
            <div className="flex gap-2">
              {whatsappUrl ? (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
                >
                  <MessageCircle size={15} />WhatsApp
                </a>
              ) : (
                <div className="flex-1 flex items-center justify-center gap-2 bg-gray-100 text-gray-400 text-sm py-2.5 rounded-xl">
                  <Phone size={15} />Sin teléfono
                </div>
              )}
              {emailUrl ? (
                <a
                  href={emailUrl}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
                >
                  <Mail size={15} />Email
                </a>
              ) : (
                <div className="flex-1 flex items-center justify-center gap-2 bg-gray-100 text-gray-400 text-sm py-2.5 rounded-xl">
                  <Mail size={15} />Sin email
                </div>
              )}
            </div>
            {p?.website && (
              <a
                href={p.website.startsWith('http') ? p.website : `https://${p.website}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 w-full flex items-center justify-center gap-2 border border-gray-200 hover:bg-gray-50 text-gray-600 text-sm py-2 rounded-xl transition-colors"
              >
                <Globe size={13} />
                <span className="truncate max-w-[200px]">{p.website}</span>
                <ExternalLink size={11} className="text-gray-400 shrink-0" />
              </a>
            )}
          </div>

          {/* Datos del prospecto */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Datos
            </p>
            <div className="space-y-1.5 text-sm text-gray-600">
              {(p?.city || p?.country) && (
                <div className="flex items-center gap-2">
                  <MapPin size={13} className="text-gray-400 shrink-0" />
                  {[p.city, p.country].filter(Boolean).join(', ')}
                </div>
              )}
              {p?.industry && (
                <div className="flex items-center gap-2">
                  <Building2 size={13} className="text-gray-400 shrink-0" />
                  {p.industry}
                </div>
              )}
              {p?.phone && (
                <div className="flex items-center gap-2">
                  <Phone size={13} className="text-gray-400 shrink-0" />
                  {p.phone}
                </div>
              )}
              {p?.email && (
                <div className="flex items-center gap-2">
                  <Mail size={13} className="text-gray-400 shrink-0" />
                  <span className="truncate">{p.email}</span>
                </div>
              )}
            </div>
            {p?.score_reason && (
              <p className="text-xs text-gray-400 italic mt-2 leading-relaxed">
                "{p.score_reason}"
              </p>
            )}
          </div>

          {/* Notas */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Notas
            </p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Agrega una nota sobre este lead..."
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
            <button
              onClick={() => updateMutation.mutate({ notes })}
              disabled={updateMutation.isPending}
              className="mt-1 text-xs text-brand-600 hover:text-brand-700 font-medium disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Guardando...' : 'Guardar nota'}
            </button>
          </div>

          {/* Alarma */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
              <Bell size={11} />Alarma de seguimiento
            </p>
            <input
              type="date"
              value={alarmDate}
              onChange={e => setAlarmDate(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
            {alarmDate && (
              <button
                onClick={() =>
                  updateMutation.mutate({
                    next_action_at: alarmDate ? new Date(alarmDate).toISOString() : null,
                  })
                }
                className="mt-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
              >
                Guardar alarma
              </button>
            )}
          </div>

          {/* Mover a siguiente etapa */}
          {nextStage && (
            <button
              onClick={() => moverMutation.mutate(nextStage.id)}
              disabled={moverMutation.isPending}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: nextStage.color }}
            >
              <ChevronRight size={16} />
              Mover a {nextStage.name}
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-100">
          {isAdmin && <button
            onClick={() => {
              if (confirm('¿Sacar este lead del pipeline? El prospecto no se elimina.')) {
                eliminarMutation.mutate()
              }
            }}
            className="w-full text-sm text-red-500 hover:text-red-600 hover:bg-red-50 py-2 rounded-xl transition-colors"
          >
            Quitar del pipeline
          </button>}
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function PipelinePage() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null)
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null)
  const dragCounters = useState<Record<string, number>>(() => ({}))[0]
  const [selectedCard, setSelectedCard] = useState<PipelineCard | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editingStage, setEditingStage] = useState<{ id: string; name: string; color: string } | null>(null)
  const [newStageName, setNewStageName] = useState('')
  const [showAddStage, setShowAddStage] = useState(false)

  const { data: stages = [], isPending, isError, refetch } = useQuery<PipelineStage[]>({
    queryKey: ['pipeline'],
    queryFn: () => api.get('/pipeline/').then(r => r.data),
    retry: 2,
  })

  const moverMutation = useMutation({
    mutationFn: ({ cardId, stageId }: { cardId: string; stageId: string }) =>
      api.put(`/pipeline/tarjetas/${cardId}/mover`, { stage_id: stageId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline'] }),
    onError: () => toast.error('Error al mover'),
    onSettled: () => { setDraggingCardId(null); setDragOverStageId(null) },
  })

  const actualizarEtapaMutation = useMutation({
    mutationFn: ({ id, nombre, color }: { id: string; nombre: string; color: string }) =>
      api.put(`/pipeline/etapas/${id}`, { nombre, color }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline'] })
      setEditingStage(null)
      toast.success('Etapa actualizada')
    },
  })

  const eliminarEtapaMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/pipeline/etapas/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline'] })
      toast.success('Etapa eliminada')
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.detail || 'No se puede eliminar'),
  })

  const crearEtapaMutation = useMutation({
    mutationFn: (nombre: string) =>
      api.post('/pipeline/etapas', { nombre, color: '#6366f1', order: stages.length }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline'] })
      setNewStageName('')
      setShowAddStage(false)
      toast.success('Etapa creada')
    },
  })

  const inicializarMutation = useMutation({
    mutationFn: () => api.post('/pipeline/inicializar'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline'] })
      toast.success('Pipeline inicializado')
    },
  })

  const totalLeads = stages.reduce((acc, s) => acc + (s.cards?.length || 0), 0)

  if (isPending) return <div className="p-8 text-center text-gray-400 animate-pulse">Cargando pipeline...</div>
  if (isError) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <p className="text-gray-500">No se pudo cargar el pipeline.</p>
      <button className="btn-primary" onClick={() => refetch()}>Reintentar</button>
    </div>
  )

  if (!stages.length) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-gray-500">El pipeline no tiene etapas todavía.</p>
        <button className="btn-primary" onClick={() => inicializarMutation.mutate()}>
          Inicializar pipeline
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full space-y-4">

      {/* Cabecera */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pipeline CRM</h1>
          <p className="text-sm text-gray-500 mt-0.5">{totalLeads} leads en seguimiento</p>
        </div>
        {isAdmin && <button
          onClick={() => { setEditMode(!editMode); setEditingStage(null) }}
          className={clsx(
            'flex items-center gap-2 text-sm px-4 py-2 rounded-xl border transition-colors',
            editMode
              ? 'bg-brand-50 border-brand-300 text-brand-700'
              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
          )}
        >
          <Settings size={15} />
          {editMode ? 'Listo' : 'Editar etapas'}
        </button>}
      </div>

      {/* Tablero Kanban */}
      <div className="flex gap-4 overflow-x-auto pb-4 flex-1 items-start">
        {stages.map((stage) => (
          <div key={stage.id} className="w-72 shrink-0 flex flex-col">

            {/* Header de columna */}
            {editMode && editingStage?.id === stage.id ? (
              <div className="p-2 rounded-t-xl bg-gray-100 space-y-2">
                <input
                  value={editingStage.name}
                  onChange={e => setEditingStage({ ...editingStage, name: e.target.value })}
                  className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-300"
                />
                <div className="flex gap-1.5 flex-wrap">
                  {COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setEditingStage({ ...editingStage, color: c })}
                      className={clsx(
                        'w-6 h-6 rounded-full border-2 transition-transform',
                        editingStage.color === c ? 'border-gray-800 scale-125' : 'border-transparent'
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      actualizarEtapaMutation.mutate({
                        id: stage.id,
                        nombre: editingStage.name,
                        color: editingStage.color,
                      })
                    }
                    className="flex-1 text-xs bg-brand-600 text-white py-1.5 rounded-lg"
                  >
                    Guardar
                  </button>
                  <button
                    onClick={() => setEditingStage(null)}
                    className="flex-1 text-xs border border-gray-300 py-1.5 rounded-lg"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="flex items-center justify-between px-3 py-2.5 rounded-t-xl text-white text-sm font-semibold"
                style={{ backgroundColor: stage.color }}
              >
                <div className="flex items-center gap-2">
                  <span>{stage.name}</span>
                  <span className="bg-white/25 px-2 py-0.5 rounded-full text-xs">
                    {stage.cards?.length || 0}
                  </span>
                </div>
                {editMode && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() =>
                        setEditingStage({ id: stage.id, name: stage.name, color: stage.color })
                      }
                      className="hover:bg-white/20 p-1 rounded transition-colors"
                    >
                      <Edit2 size={13} />
                    </button>
                    {!stage.is_won && !stage.is_lost && (
                      <button
                        onClick={() => {
                          if ((stage.cards?.length || 0) > 0) {
                            toast.error('Mueve los leads antes de eliminar esta etapa')
                            return
                          }
                          if (confirm(`¿Eliminar la etapa "${stage.name}"?`)) {
                            eliminarEtapaMutation.mutate(stage.id)
                          }
                        }}
                        className="hover:bg-white/20 p-1 rounded transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Zona de tarjetas */}
            <div
              className={clsx(
                'flex-1 rounded-b-xl min-h-32 p-2 space-y-2 transition-colors',
                dragOverStageId === stage.id
                  ? 'bg-brand-50 border-2 border-dashed border-brand-300'
                  : 'bg-gray-100'
              )}
              onDragOver={e => { e.preventDefault() }}
              onDragEnter={e => {
                e.preventDefault()
                dragCounters[stage.id] = (dragCounters[stage.id] || 0) + 1
                setDragOverStageId(stage.id)
              }}
              onDragLeave={() => {
                dragCounters[stage.id] = (dragCounters[stage.id] || 1) - 1
                if (dragCounters[stage.id] <= 0) {
                  dragCounters[stage.id] = 0
                  setDragOverStageId(prev => prev === stage.id ? null : prev)
                }
              }}
              onDrop={e => {
                e.preventDefault()
                dragCounters[stage.id] = 0
                const cardId = e.dataTransfer.getData('cardId')
                if (cardId && draggingCardId) moverMutation.mutate({ cardId, stageId: stage.id })
                setDragOverStageId(null)
              }}
            >
              {(stage.cards || []).map(card => (
                <KanbanCard
                  key={card.id}
                  card={card}
                  onClick={() => setSelectedCard(card)}
                  onDragStart={e => {
                    e.dataTransfer.setData('cardId', card.id)
                    setDraggingCardId(card.id)
                  }}
                  onDragEnd={() => setDraggingCardId(null)}
                  isDragging={draggingCardId === card.id}
                />
              ))}

              {(stage.cards || []).length === 0 && dragOverStageId !== stage.id && (
                <div className="h-16 flex items-center justify-center text-xs text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                  Arrastra un lead aquí
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Agregar etapa (solo en edit mode) */}
        {editMode && (
          <div className="w-72 shrink-0">
            {showAddStage ? (
              <div className="bg-gray-100 rounded-xl p-3 space-y-2">
                <input
                  value={newStageName}
                  onChange={e => setNewStageName(e.target.value)}
                  placeholder="Nombre de la etapa"
                  autoFocus
                  className="w-full text-sm border border-gray-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-300"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newStageName.trim()) {
                      crearEtapaMutation.mutate(newStageName.trim())
                    }
                  }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { if (newStageName.trim()) crearEtapaMutation.mutate(newStageName.trim()) }}
                    className="flex-1 text-sm bg-brand-600 text-white py-2 rounded-xl"
                  >
                    Crear
                  </button>
                  <button
                    onClick={() => setShowAddStage(false)}
                    className="flex-1 text-sm border border-gray-300 py-2 rounded-xl"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddStage(true)}
                className="w-full h-12 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-400 hover:border-brand-300 hover:text-brand-500 transition-colors flex items-center justify-center gap-2"
              >
                <Plus size={16} />Agregar etapa
              </button>
            )}
          </div>
        )}
      </div>

      {/* Panel lateral */}
      {selectedCard && (
        <ProspectPanel
          card={selectedCard}
          stages={stages}
          onClose={() => setSelectedCard(null)}
          isAdmin={isAdmin}
        />
      )}
    </div>
  )
}
