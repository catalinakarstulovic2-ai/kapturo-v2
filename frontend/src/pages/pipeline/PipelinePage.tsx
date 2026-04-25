import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../api/client'
import toast from 'react-hot-toast'
import {
  MessageCircle, Mail, Phone, Globe, MapPin,
  ChevronRight, RefreshCw, X, Loader2, Search, Star, Zap, PhoneCall, UserX,
} from 'lucide-react'
import clsx from 'clsx'

interface Prospect {
  company_name: string
  contact_name: string
  contact_title: string
  email: string | null
  phone: string | null
  whatsapp: string | null
  website: string | null
  city: string | null
  country: string | null
  industry: string | null
  score: number
  score_reason: string | null
  source: string | null
  linkedin_url?: string | null
}

interface PipelineCard {
  id: string
  prospect_id: string
  stage_id: string
  notes: string | null
  prospect: Prospect | null
}

interface PipelineStage {
  id: string
  name: string
  color: string
  order: number
  is_won: boolean
  is_lost: boolean
  cards: PipelineCard[]
  total_cards: number
}

const scoreColor = (s: number) => {
  if (s >= 80) return 'bg-emerald-100 text-emerald-700'
  if (s >= 65) return 'bg-amber-100 text-amber-700'
  return 'bg-gray-100 text-gray-500'
}

const sourceBadge = (src: string | null) => {
  if (!src) return null
  if (src.includes('linkedin')) return { label: 'LinkedIn', cls: 'bg-blue-100 text-blue-700' }
  if (src.includes('social')) return { label: 'Social', cls: 'bg-pink-100 text-pink-700' }
  if (src.includes('maps') || src.includes('google')) return { label: 'Google Maps', cls: 'bg-green-100 text-green-700' }
  return { label: src, cls: 'bg-gray-100 text-gray-500' }
}

const isMobileNumber = (num: string) => {
  const d = num.replace(/\D/g, '')
  if (!d) return false
  if (d.startsWith('569') && d.length === 11) return true
  if (d.startsWith('9') && d.length === 9) return true
  return false
}

type ContactType = 'directo' | 'diferido' | 'telefono' | 'sin_contacto'

const getContactType = (p: { whatsapp?: string | null; phone?: string | null; email?: string | null; linkedin_url?: string | null }): ContactType => {
  const hasWA = !!p.whatsapp || isMobileNumber(p.phone || '')
  if (hasWA) return 'directo'           // móvil/WA = respuesta inmediata
  if (p.phone && p.email) return 'diferido'  // fijo + email → preferir email (diferido)
  if (p.email) return 'diferido'        // solo email
  if (p.phone) return 'telefono'        // solo fijo
  return 'sin_contacto'
}

const contactTypeMeta: Record<ContactType, { label: string; cls: string; Icon: React.ElementType }> = {
  directo:      { label: 'Directo',    cls: 'bg-emerald-100 text-emerald-700', Icon: Zap },
  diferido:     { label: 'Con email',  cls: 'bg-violet-100 text-violet-700',   Icon: Mail },
  telefono:     { label: 'Teléfono',   cls: 'bg-blue-100 text-blue-700',       Icon: PhoneCall },
  sin_contacto: { label: 'Sin datos',  cls: 'bg-gray-100 text-gray-400',       Icon: UserX },
}

function KanbanCard({
  card, isExpanded, isDragging, onToggle, onDragStart, onDragEnd, stages, onMoved,
}: {
  card: PipelineCard
  isExpanded: boolean
  isDragging: boolean
  onToggle: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  stages: PipelineStage[]
  onMoved: () => void
}) {
  const p = card.prospect
  const moverMutation = useMutation({
    mutationFn: (stageId: string) =>
      api.put(`/pipeline/tarjetas/${card.id}/mover`, { stage_id: stageId }),
    onSuccess: () => { onMoved(); toast.success('Etapa actualizada') },
    onError: () => toast.error('Error al mover'),
  })
  if (!p) return null

  const waNum = p.whatsapp
    ? p.whatsapp.replace(/\D/g, '')
    : isMobileNumber(p.phone || '') ? (p.phone || '').replace(/\D/g, '') : ''
  const phoneNum = p.phone?.replace(/\D/g, '') || ''
  const hasPhone = phoneNum.length > 0
  const contactType = getContactType(p)
  const ctMeta = contactTypeMeta[contactType]

  const msgWA = encodeURIComponent(
    `Hola ${p.contact_name || p.company_name}, me pongo en contacto porque creo que podría interesarles nuestra propuesta. Tienen un momento para conversar?`
  )
  const badge = sourceBadge(p.source)
  const location = [p.city, p.country].filter(Boolean).join(', ')

  return (
    <div
      draggable={!isExpanded}
      onDragStart={e => { if (!isExpanded) { e.stopPropagation(); onDragStart(e) } }}
      onDragEnd={onDragEnd}
      className={clsx(
        'bg-white rounded-xl border transition-all duration-200 select-none',
        isExpanded ? 'border-violet-300 shadow-md ring-1 ring-violet-100' : 'border-gray-200 cursor-grab hover:shadow-sm hover:border-violet-200',
        isDragging && 'opacity-30 scale-95 cursor-grabbing ring-2 ring-violet-300'
      )}
    >
      <div className="p-3 cursor-pointer" onClick={onToggle}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900 text-sm leading-tight truncate">
              {p.company_name || p.contact_name || 'Sin nombre'}
            </p>
            {p.contact_name && p.company_name && (
              <p className="text-[11px] text-gray-500 truncate mt-0.5">{p.contact_name}</p>
            )}
            {p.contact_title && (
              <p className="text-[11px] text-gray-400 truncate">{p.contact_title}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {p.score > 0 && (
              <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded-full', scoreColor(p.score))}>
                {Math.round(p.score)}
              </span>
            )}
            <ChevronRight size={13} className={clsx('text-gray-400 transition-transform duration-200', isExpanded && 'rotate-90')} />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className={clsx('flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold', ctMeta.cls)}>
            <ctMeta.Icon size={9} /> {ctMeta.label}
          </span>
          {badge && <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-full font-medium', badge.cls)}>{badge.label}</span>}
          {location && (
            <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
              <MapPin size={9} /> {location}
            </span>
          )}
        </div>
      </div>
      {isExpanded && (
        <div className="border-t border-violet-100 px-3 pb-3 pt-3 space-y-3">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Contactar</p>
            <div className="flex gap-1.5 flex-wrap">
              {waNum ? (
                <a href={`https://wa.me/${waNum}?text=${msgWA}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                  className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors">
                  <MessageCircle size={11} /> WhatsApp
                </a>
              ) : null}
              {hasPhone ? (
                <a href={`tel:${phoneNum}`} onClick={e => e.stopPropagation()}
                  className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors">
                  <Phone size={11} /> {p.phone}
                </a>
              ) : !waNum ? (
                <span className="flex items-center gap-1 bg-gray-100 text-gray-400 text-xs px-2.5 py-1.5 rounded-lg">
                  <Phone size={11} /> Sin tel.
                </span>
              ) : null}
              {p.email ? (
                <a href={`mailto:${p.email}`} onClick={e => e.stopPropagation()}
                  className="flex items-center gap-1 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors">
                  <Mail size={11} /> Email
                </a>
              ) : (
                <span className="flex items-center gap-1 bg-gray-100 text-gray-400 text-xs px-2.5 py-1.5 rounded-lg">
                  <Mail size={11} /> Sin email
                </span>
              )}
              {p.linkedin_url && (
                <a href={p.linkedin_url.startsWith('http') ? p.linkedin_url : `https://${p.linkedin_url}`}
                  target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                  className="flex items-center gap-1 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors">
                  <Globe size={11} /> LinkedIn
                </a>
              )}
              {p.website && (
                <a href={p.website.startsWith('http') ? p.website : `https://${p.website}`}
                  target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                  className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs px-2.5 py-1.5 rounded-lg transition-colors">
                  <Globe size={11} /> Web
                </a>
              )}
            </div>
          </div>
          {p.score_reason && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Razón IA</p>
              <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-3">{p.score_reason}</p>
            </div>
          )}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Mover a</p>
            <div className="flex flex-wrap gap-1">
              {stages.filter(s => s.id !== card.stage_id).map(s => (
                <button key={s.id} onClick={e => { e.stopPropagation(); moverMutation.mutate(s.id) }}
                  disabled={moverMutation.isPending}
                  className="text-[10px] px-2 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                  style={{ borderLeftColor: s.color, borderLeftWidth: 3 }}>
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function PipelinePage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterContact, setFilterContact] = useState<ContactType | 'todos'>('todos')
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null)
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null)
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)

  const { data: stages = [], isPending, isError, refetch } = useQuery<PipelineStage[]>({
    queryKey: ['pipeline-inmobiliaria'],
    queryFn: () => api.get('/pipeline/').then(r => r.data),
    refetchInterval: 60_000,
  })

  const moverMutation = useMutation({
    mutationFn: ({ cardId, stageId }: { cardId: string; stageId: string }) =>
      api.put(`/pipeline/tarjetas/${cardId}/mover`, { stage_id: stageId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline-inmobiliaria'] }),
    onError: () => toast.error('Error al mover'),
    onSettled: () => { setDraggingCardId(null); setDragOverStageId(null) },
  })

  const handleDrop = (e: React.DragEvent, stageId: string) => {
    e.preventDefault()
    const cardId = e.dataTransfer.getData('cardId')
    if (cardId && draggingCardId) moverMutation.mutate({ cardId, stageId })
    setDragOverStageId(null)
  }

  const filteredStages = stages.map(stage => ({
    ...stage,
    cards: stage.cards.filter(c => {
      const p = c.prospect
      if (!p) return false
      if (filterContact !== 'todos') {
        const ct = getContactType(p)
        // 'diferido' = cualquiera que tenga email (aunque también tenga teléfono)
        if (filterContact === 'diferido' && !p.email) return false
        if (filterContact !== 'diferido' && ct !== filterContact) return false
      }
      if (search) {
        const q = search.toLowerCase()
        return (
          p.company_name?.toLowerCase().includes(q) ||
          p.contact_name?.toLowerCase().includes(q) ||
          p.city?.toLowerCase().includes(q) ||
          p.email?.toLowerCase().includes(q)
        )
      }
      return true
    }),
  }))

  const totalCards = stages.reduce((a, s) => a + s.total_cards, 0)

  if (isPending) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-gray-300" />
    </div>
  )

  if (isError) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <p className="text-gray-500 text-sm">Error cargando el pipeline.</p>
      <button onClick={() => refetch()} className="px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium">Reintentar</button>
    </div>
  )

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
          <p className="text-sm text-gray-500 mt-0.5">{totalCards} lead{totalCards !== 1 ? 's' : ''} en seguimiento</p>
        </div>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
              className="text-sm pl-7 pr-3 py-2 rounded-xl border border-gray-300 outline-none focus:border-violet-400 w-44" />
          </div>
          {search && (
            <button onClick={() => setSearch('')} className="p-2 rounded-xl bg-red-50 text-red-400 hover:bg-red-100"><X size={14} /></button>
          )}
          <button onClick={() => refetch()} className="p-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200" title="Actualizar">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {(['todos', 'directo', 'diferido', 'telefono', 'sin_contacto'] as const).map(f => {
          const meta = f === 'todos' ? null : contactTypeMeta[f]
          return (
            <button key={f} onClick={() => setFilterContact(f)}
              className={clsx(
                'flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full font-medium border transition-colors',
                filterContact === f
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-violet-300'
              )}>
              {meta ? <meta.Icon size={10} /> : <Star size={10} />}
              {f === 'todos' ? 'Todos' : meta!.label}
            </button>
          )
        })}
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4 items-start">
        {filteredStages.map(stage => {
          const isDragOver = dragOverStageId === stage.id
          return (
            <div key={stage.id} className="w-[264px] shrink-0 flex flex-col">
              <div className="flex items-center justify-between px-3 py-2.5 rounded-t-xl text-white text-sm font-semibold"
                style={{ backgroundColor: stage.color }}>
                <span>{stage.name}</span>
                <span className="bg-white/25 px-1.5 py-0.5 rounded-full text-xs font-bold">{stage.cards.length}</span>
              </div>
              <div
                className={clsx(
                  'flex-1 rounded-b-xl min-h-[120px] p-2 space-y-2 transition-all',
                  isDragOver ? 'bg-violet-50 border-2 border-dashed border-violet-300' : 'bg-gray-100/80'
                )}
                onDragOver={e => e.preventDefault()}
                onDragEnter={e => { e.preventDefault(); setDragOverStageId(stage.id) }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverStageId(prev => prev === stage.id ? null : prev) }}
                onDrop={e => handleDrop(e, stage.id)}
              >
                {stage.cards.map(card => (
                  <KanbanCard
                    key={card.id} card={card}
                    isExpanded={expandedCardId === card.id}
                    isDragging={draggingCardId === card.id}
                    onToggle={() => setExpandedCardId(prev => prev === card.id ? null : card.id)}
                    stages={stages}
                    onMoved={() => qc.invalidateQueries({ queryKey: ['pipeline-inmobiliaria'] })}
                    onDragStart={e => { e.dataTransfer.setData('cardId', card.id); setDraggingCardId(card.id) }}
                    onDragEnd={() => setDraggingCardId(null)}
                  />
                ))}
                {stage.cards.length === 0 && !isDragOver && (
                  <div className="h-16 flex items-center justify-center text-xs text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                    Arrastra aquí
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
