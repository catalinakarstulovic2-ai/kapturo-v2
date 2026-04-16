import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../api/client'
import toast from 'react-hot-toast'
import {
  MessageCircle, Mail, Phone, Building2, MapPin, Calendar,
  ExternalLink, X, Loader2, Search, ChevronRight, RefreshCw,
  Shield, DollarSign, Sparkles,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuthStore } from '../../store/authStore'

interface AdjCard {
  card_id: string
  prospect_id: string
  empresa: string
  rut: string
  codigo: string
  nombre: string
  licitacion_nombre: string
  organismo: string
  region: string
  monto_adjudicado: number
  poliza_seriedad: number
  poliza_cumplimiento: number
  fecha_adjudicacion: string
  contact_name: string | null
  email: string | null
  phone: string | null
  whatsapp: string | null
  tiene_contacto: boolean
}

interface AdjStage {
  etapa_id: string
  etapa_nombre: string
  etapa_color: string
  cards: AdjCard[]
}

const formatCLP = (n?: number | null) => {
  if (!n) return '—'
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}

function KanbanCard({ card, isExpanded, isDragging, onToggle, onDragStart, onDragEnd, stages, onMoved }: {
  card: AdjCard; isExpanded: boolean; isDragging: boolean
  onToggle: () => void
  onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void
  stages: AdjStage[]; onMoved: () => void
}) {
  const [buscandoContacto, setBuscandoContacto] = useState(false)
  const [contactoLocal, setContactoLocal] = useState({
    contact_name: card.contact_name,
    email: card.email,
    phone: card.phone,
    whatsapp: card.whatsapp,
    tiene_contacto: card.tiene_contacto,
  })

  const numRaw = (contactoLocal.whatsapp || contactoLocal.phone || '').replace(/\D/g, '')
  const numWA = numRaw.startsWith('56') ? numRaw : `56${numRaw}`
  const msgWA = encodeURIComponent(
    `Hola, somos de Kapturo. Felicitamos a ${card.empresa} por la adjudicacion de "${card.licitacion_nombre}". Nos gustaria presentarles nuestra propuesta de polizas de garantia. Tienen un momento para conversar?`
  )
  const mailSubject = `Poliza de garantia — ${card.licitacion_nombre}`
  const mailBody = `Estimado equipo de ${card.empresa},%0A%0AHemos visto que han sido adjudicados en el proyecto "${card.licitacion_nombre}".%0A%0AQuisieramos presentarles nuestra propuesta de polizas de garantia.%0A%0ASaludos`

  const moverMutation = useMutation({
    mutationFn: (etapaId: string) =>
      api.patch(`/modules/adjudicadas/cards/${card.card_id}/etapa`, { etapa_id: etapaId }),
    onSuccess: () => { onMoved(); toast.success('Etapa actualizada') },
    onError: () => toast.error('Error al mover'),
  })

  const buscarContacto = async () => {
    if (!card.empresa) return
    setBuscandoContacto(true)
    try {
      const res = await api.get(`/modules/adjudicadas/contacto?nombre=${encodeURIComponent(card.empresa)}`)
      const ct = res.data
      if (ct.ok) {
        const primer = ct.contactos?.[0]
        await api.post(`/modules/adjudicadas/guardar/${card.codigo}`, {
          contact_name: primer?.nombre || undefined,
          email: primer?.email || undefined,
          phone: ct.telefono || primer?.telefono || undefined,
          whatsapp: ct.telefono || primer?.telefono || undefined,
        })
        setContactoLocal({
          contact_name: primer?.nombre || null,
          email: primer?.email || null,
          phone: ct.telefono || primer?.telefono || null,
          whatsapp: ct.telefono || primer?.telefono || null,
          tiene_contacto: true,
        })
        onMoved()
        toast.success('Contacto encontrado')
      } else {
        toast.error('No se encontraron datos de contacto')
      }
    } catch {
      toast.error('Error buscando contacto')
    } finally {
      setBuscandoContacto(false)
    }
  }

  const stageList = stages.map(s => ({ id: s.etapa_id, name: s.etapa_nombre, color: s.etapa_color }))
  const monto = card.monto_adjudicado || 0

  return (
    <div
      draggable={!isExpanded}
      onDragStart={e => { if (!isExpanded) { e.stopPropagation(); onDragStart(e) } }}
      onDragEnd={onDragEnd}
      className={clsx(
        'bg-white rounded-xl border transition-all duration-200 select-none',
        isExpanded
          ? 'border-violet-300 shadow-md ring-1 ring-violet-100'
          : 'border-gray-200 cursor-grab hover:shadow-sm hover:border-violet-200',
        isDragging && 'opacity-30 scale-95 cursor-grabbing ring-2 ring-violet-300'
      )}
    >
      {/* Header siempre visible — click para expandir */}
      <div className="p-3 cursor-pointer" onClick={onToggle}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{card.empresa}</p>
            {card.rut && <p className="text-[11px] text-gray-400 font-mono mt-0.5">{card.rut}</p>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={clsx('w-2 h-2 rounded-full border',
                card.tiene_contacto ? 'bg-emerald-400 border-emerald-300' : 'bg-gray-200 border-gray-100'
              )}
            />
            <ChevronRight size={13} className={clsx('text-gray-400 transition-transform duration-200', isExpanded && 'rotate-90')} />
          </div>
        </div>
        {(card.licitacion_nombre || card.nombre) && (
          <p className="text-[11px] text-gray-500 line-clamp-2 mt-1.5 leading-relaxed">
            {card.licitacion_nombre || card.nombre}
          </p>
        )}
        {monto > 0 && (
          <div className="flex items-center gap-2 mt-1.5 text-[11px]">
            <span className="font-semibold text-gray-700">{formatCLP(monto)}</span>
            <span className="text-blue-500">S: {formatCLP(card.poliza_seriedad)}</span>
          </div>
        )}
      </div>

      {/* Detalle expandido */}
      {isExpanded && (
        <div className="border-t border-violet-100 px-3 pb-3 pt-3 space-y-3">

          {/* Contactar */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Contactar</p>
            <div className="flex gap-2">
              {numRaw ? (
                <a
                  href={`https://wa.me/${numWA}?text=${msgWA}`}
                  target="_blank" rel="noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
                >
                  <MessageCircle size={12} /> WhatsApp
                </a>
              ) : (
                <div className="flex-1 flex items-center justify-center gap-1.5 bg-gray-100 text-gray-400 text-xs py-2 rounded-lg">
                  <Phone size={12} /> Sin tel.
                </div>
              )}
              {contactoLocal.email ? (
                <a
                  href={`mailto:${contactoLocal.email}?subject=${mailSubject}&body=${mailBody}`}
                  onClick={e => e.stopPropagation()}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
                >
                  <Mail size={12} /> Email
                </a>
              ) : (
                <div className="flex-1 flex items-center justify-center gap-1.5 bg-gray-100 text-gray-400 text-xs py-2 rounded-lg">
                  <Mail size={12} /> Sin email
                </div>
              )}
            </div>
            {contactoLocal.contact_name && (
              <p className="text-[10px] text-gray-400 mt-1.5">👤 {contactoLocal.contact_name}</p>
            )}
            {!contactoLocal.tiene_contacto && (
              <button
                onClick={e => { e.stopPropagation(); buscarContacto() }}
                disabled={buscandoContacto}
                className="mt-1.5 w-full flex items-center justify-center gap-1.5 text-xs text-violet-700 bg-violet-50 border border-violet-200 hover:bg-violet-100 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-60"
              >
                {buscandoContacto
                  ? <><Loader2 size={11} className="animate-spin" /> Buscando…</>
                  : <><Search size={11} /> Buscar contacto</>}
              </button>
            )}
          </div>

          {/* Licitación */}
          <div className="bg-gray-50 rounded-lg p-2.5 space-y-1.5">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Licitación</p>
            <p className="text-xs font-semibold text-gray-800 leading-snug">
              {card.licitacion_nombre || card.nombre}
            </p>
            {card.organismo && (
              <p className="text-[10px] text-gray-500 flex items-center gap-1">
                <Building2 size={9} className="text-gray-300 shrink-0" /> {card.organismo}
              </p>
            )}
            {card.region && (
              <p className="text-[10px] text-gray-500 flex items-center gap-1">
                <MapPin size={9} className="text-gray-300 shrink-0" /> {card.region}
              </p>
            )}
            {card.fecha_adjudicacion && (
              <p className="text-[10px] text-gray-400 flex items-center gap-1">
                <Calendar size={9} className="text-gray-300 shrink-0" /> {card.fecha_adjudicacion}
              </p>
            )}
            {monto > 0 && (
              <div className="grid grid-cols-3 gap-1.5 pt-1">
                <div className="bg-white rounded-lg p-1.5 text-center border border-gray-100">
                  <p className="text-[9px] text-gray-400">Monto</p>
                  <p className="text-[10px] font-bold text-gray-700">{formatCLP(monto)}</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-1.5 text-center">
                  <p className="text-[9px] text-blue-400">Seriedad</p>
                  <p className="text-[10px] font-bold text-blue-700">{formatCLP(card.poliza_seriedad)}</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-1.5 text-center">
                  <p className="text-[9px] text-emerald-400">Cumpl.</p>
                  <p className="text-[10px] font-bold text-emerald-700">{formatCLP(card.poliza_cumplimiento)}</p>
                </div>
              </div>
            )}
            {card.codigo && (
              <a
                href={`https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=${card.codigo}`}
                target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-[10px] text-violet-500 hover:text-violet-700 font-medium pt-0.5"
              >
                <ExternalLink size={9} /> Ver en Mercado Público
              </a>
            )}
          </div>

          {/* Cambiar etapa */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Mover a</p>
            <div className="flex flex-wrap gap-1">
              {stageList.map(s => (
                <button
                  key={s.id}
                  onClick={e => { e.stopPropagation(); moverMutation.mutate(s.id) }}
                  disabled={moverMutation.isPending}
                  className="text-[10px] px-2 py-1 rounded-lg font-medium border transition-all disabled:opacity-50"
                  style={{ backgroundColor: `${s.color}18`, borderColor: `${s.color}60`, color: s.color }}
                >
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

function CardPanel({ card, stages, currentStageId, onClose, onRefresh }: {
  card: AdjCard; stages: AdjStage[]; currentStageId: string
  onClose: () => void; onRefresh: () => void
}) {
  const [localStageId, setLocalStageId] = useState(currentStageId)
  const [buscandoContacto, setBuscandoContacto] = useState(false)
  const [contactoLocal, setContactoLocal] = useState({
    contact_name: card.contact_name,
    email: card.email,
    phone: card.phone,
    whatsapp: card.whatsapp,
    tiene_contacto: card.tiene_contacto,
  })

  const numRaw = (contactoLocal.whatsapp || contactoLocal.phone || '').replace(/\D/g, '')
  const numWA = numRaw.startsWith('56') ? numRaw : `56${numRaw}`
  const msgWA = encodeURIComponent(
    `Hola, somos de Kapturo. Felicitamos a ${card.empresa} por la adjudicacion de "${card.licitacion_nombre}". Nos gustaria presentarles nuestra propuesta de polizas de garantia. Tienen un momento para conversar?`
  )
  const mailSubject = `Poliza de garantia — ${card.licitacion_nombre}`
  const mailBody = `Estimado equipo de ${card.empresa},%0A%0AHemos visto que han sido adjudicados en el proyecto "${card.licitacion_nombre}".%0A%0AQuisieramos presentarles nuestra propuesta de polizas de garantia.%0A%0ASaludos`

  const moverMutation = useMutation({
    mutationFn: (etapaId: string) =>
      api.patch(`/modules/adjudicadas/cards/${card.card_id}/etapa`, { etapa_id: etapaId }),
    onSuccess: (_data, etapaId) => {
      setLocalStageId(etapaId)
      onRefresh()
      toast.success('Etapa actualizada')
    },
    onError: () => toast.error('Error al mover'),
  })

  const buscarContacto = async () => {
    if (!card.empresa) return
    setBuscandoContacto(true)
    try {
      const res = await api.get(`/modules/adjudicadas/contacto?nombre=${encodeURIComponent(card.empresa)}`)
      const ct = res.data
      if (ct.ok) {
        const primer = ct.contactos?.[0]
        await api.post(`/modules/adjudicadas/guardar/${card.codigo}`, {
          contact_name: primer?.nombre || undefined,
          email: primer?.email || undefined,
          phone: ct.telefono || primer?.telefono || undefined,
          whatsapp: ct.telefono || primer?.telefono || undefined,
        })
        setContactoLocal({
          contact_name: primer?.nombre || null,
          email: primer?.email || null,
          phone: ct.telefono || primer?.telefono || null,
          whatsapp: ct.telefono || primer?.telefono || null,
          tiene_contacto: true,
        })
        onRefresh()
        toast.success('Contacto encontrado y guardado')
      } else {
        toast.error('No se encontraron datos de contacto')
      }
    } catch {
      toast.error('Error buscando contacto')
    } finally {
      setBuscandoContacto(false)
    }
  }

  const currentStage = stages.find(s => s.etapa_id === localStageId)
  const stageList = stages.map(s => ({ id: s.etapa_id, name: s.etapa_nombre, color: s.etapa_color }))
  const currentIdx = stageList.findIndex(s => s.id === localStageId)
  const nextStage = currentIdx >= 0 && currentIdx < stageList.length - 1 ? stageList[currentIdx + 1] : null
  const monto = card.monto_adjudicado || 0

  return (
    <div
      className="w-full md:w-80 xl:w-96 shrink-0 md:sticky top-4 self-start bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden"
      style={{ maxHeight: 'calc(100vh - 88px)', overflowY: 'auto' }}
    >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-start justify-between gap-3 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
              <Building2 size={16} className="text-violet-500" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-gray-900 text-sm leading-tight truncate">{card.empresa}</p>
              {card.rut && <p className="text-xs text-gray-400 font-mono mt-0.5">{card.rut}</p>}
              {currentStage && (
                <span
                  className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full text-white font-medium"
                  style={{ backgroundColor: currentStage.etapa_color }}
                >
                  {currentStage.etapa_nombre}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors shrink-0">
            <X size={15} className="text-gray-400" />
          </button>
        </div>

        <div className="flex-1 p-5 space-y-5">
          <section>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Contactar</p>
            <div className="flex gap-2">
              {numRaw ? (
                <a
                  href={`https://wa.me/${numWA}?text=${msgWA}`}
                  target="_blank" rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
                >
                  <MessageCircle size={14} /> WhatsApp
                </a>
              ) : (
                <div className="flex-1 flex items-center justify-center gap-2 bg-gray-100 text-gray-400 text-sm py-2.5 rounded-xl">
                  <Phone size={14} /> Sin telefono
                </div>
              )}
              {contactoLocal.email ? (
                <a
                  href={`mailto:${contactoLocal.email}?subject=${mailSubject}&body=${mailBody}`}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
                >
                  <Mail size={14} /> Email
                </a>
              ) : (
                <div className="flex-1 flex items-center justify-center gap-2 bg-gray-100 text-gray-400 text-sm py-2.5 rounded-xl">
                  <Mail size={14} /> Sin email
                </div>
              )}
            </div>
            {contactoLocal.contact_name && (
              <p className="text-xs text-gray-400 mt-2">👤 {contactoLocal.contact_name}</p>
            )}
            {!contactoLocal.tiene_contacto && (
              <button
                onClick={buscarContacto}
                disabled={buscandoContacto}
                className="mt-2 w-full flex items-center justify-center gap-2 text-sm text-violet-700 bg-violet-50 border border-violet-200 hover:bg-violet-100 py-2 rounded-xl font-medium transition-colors disabled:opacity-60"
              >
                {buscandoContacto
                  ? <><Loader2 size={13} className="animate-spin" /> Buscando...</>
                  : <><Search size={13} /> Buscar contacto</>
                }
              </button>
            )}
          </section>

          <section>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Licitacion</p>
            <div className="bg-gray-50 rounded-xl p-3.5 space-y-2">
              <p className="text-sm font-semibold text-gray-800 leading-snug">
                {card.licitacion_nombre || card.nombre}
              </p>
              {card.organismo && (
                <p className="flex items-center gap-2 text-xs text-gray-500">
                  <Building2 size={11} className="text-gray-300 shrink-0" /> {card.organismo}
                </p>
              )}
              {card.region && (
                <p className="flex items-center gap-2 text-xs text-gray-500">
                  <MapPin size={11} className="text-gray-300 shrink-0" /> {card.region}
                </p>
              )}
              {card.fecha_adjudicacion && (
                <p className="flex items-center gap-2 text-xs text-gray-400">
                  <Calendar size={11} className="text-gray-300 shrink-0" /> Adjudicado {card.fecha_adjudicacion}
                </p>
              )}
              {card.codigo && (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-500">
                    {card.codigo}
                  </span>
                  <a
                    href={`https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=${card.codigo}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-violet-500 hover:text-violet-700 flex items-center gap-1 text-xs"
                  >
                    <ExternalLink size={10} /> Ver
                  </a>
                </div>
              )}
            </div>
            {monto > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-2">
                <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                  <p className="text-[10px] text-gray-400 mb-0.5 flex items-center justify-center gap-1">
                    <DollarSign size={9} /> Monto
                  </p>
                  <p className="text-xs font-bold text-gray-700">{formatCLP(monto)}</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-2.5 text-center">
                  <p className="text-[10px] text-blue-400 mb-0.5 flex items-center justify-center gap-1">
                    <Shield size={9} /> Seriedad
                  </p>
                  <p className="text-xs font-bold text-blue-700">{formatCLP(card.poliza_seriedad)}</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-2.5 text-center">
                  <p className="text-[10px] text-emerald-400 mb-0.5 flex items-center justify-center gap-1">
                    <Shield size={9} /> Cumplim.
                  </p>
                  <p className="text-xs font-bold text-emerald-700">{formatCLP(card.poliza_cumplimiento)}</p>
                </div>
              </div>
            )}
          </section>

          <section>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Etapa</p>
            <div className="flex flex-wrap gap-1.5">
              {stageList.map(s => (
                <button
                  key={s.id}
                  onClick={() => moverMutation.mutate(s.id)}
                  disabled={moverMutation.isPending}
                  className={clsx(
                    'text-xs px-3 py-1.5 rounded-lg font-medium border transition-all',
                    s.id === localStageId
                      ? 'text-white border-transparent'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  )}
                  style={s.id === localStageId ? { backgroundColor: s.color, borderColor: s.color } : {}}
                >
                  {s.name}
                </button>
              ))}
            </div>
            {nextStage && (
              <button
                onClick={() => moverMutation.mutate(nextStage.id)}
                disabled={moverMutation.isPending}
                className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm text-white transition-opacity disabled:opacity-60"
                style={{ backgroundColor: nextStage.color }}
              >
                <ChevronRight size={15} /> Mover a {nextStage.name}
              </button>
            )}
          </section>

          <section>
            <a
              href="/adjudicadas"
              className="w-full flex items-center justify-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 py-2.5 rounded-xl font-medium transition-colors"
            >
              <Sparkles size={14} /> Generar propuesta IA
            </a>
            <p className="text-[10px] text-gray-400 text-center mt-1">Disponible en Adjudicadas</p>
          </section>
        </div>
    </div>
  )
}

export default function PipelinePage() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'
  const [inputRut, setInputRut] = useState('')
  const [rutFiltro, setRutFiltro] = useState('')
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null)
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null)
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)

  const { data: stages = [], isPending, isError, refetch } = useQuery<AdjStage[]>({
    queryKey: ['adjudicadas-pipeline', rutFiltro],
    queryFn: () =>
      api
        .get(`/modules/adjudicadas/pipeline${rutFiltro ? `?rut=${encodeURIComponent(rutFiltro)}` : ''}`)
        .then(r => r.data),
  })

  const moverMutation = useMutation({
    mutationFn: ({ cardId, etapaId }: { cardId: string; etapaId: string }) =>
      api.patch(`/modules/adjudicadas/cards/${cardId}/etapa`, { etapa_id: etapaId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['adjudicadas-pipeline'] }),
    onError: () => toast.error('Error al mover'),
    onSettled: () => { setDraggingCardId(null); setDragOverStageId(null) },
  })

  const resetMutation = useMutation({
    mutationFn: () => api.post('/modules/adjudicadas/etapas/reset'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adjudicadas-pipeline'] })
      toast.success('Etapas reiniciadas')
    },
    onError: () => toast.error('Error al reiniciar'),
  })

  const totalCards = stages.reduce((a, s) => a + s.cards.length, 0)

  const handleDrop = (e: React.DragEvent, etapaId: string) => {
    e.preventDefault()
    const cardId = e.dataTransfer.getData('cardId')
    if (cardId && draggingCardId) moverMutation.mutate({ cardId, etapaId })
    setDragOverStageId(null)
  }

  if (isPending) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-gray-300" />
    </div>
  )
  if (isError) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <p className="text-gray-500 text-sm">Error cargando el pipeline.</p>
      <button onClick={() => refetch()} className="px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium">
        Reintentar
      </button>
    </div>
  )
  if (stages.length === 0) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
      <p className="text-gray-500 text-sm">No hay etapas configuradas.</p>
      <button
        onClick={() => resetMutation.mutate()}
        disabled={resetMutation.isPending}
        className="px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium disabled:opacity-60"
      >
        {resetMutation.isPending ? 'Configurando...' : 'Inicializar pipeline'}
      </button>
    </div>
  )

  return (
    <div className="space-y-4 min-w-0">
      {/* Header — siempre full width */}
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {totalCards} empresa{totalCards !== 1 ? 's' : ''} en seguimiento
          </p>
        </div>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              placeholder="Empresa o RUT..."
              value={inputRut}
              onChange={e => setInputRut(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && setRutFiltro(inputRut)}
              className="text-sm px-3 py-2 rounded-xl border border-gray-300 outline-none focus:border-violet-400 w-44"
            />
            <button
              onClick={() => setRutFiltro(inputRut)}
              className="p-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              <Search size={14} />
            </button>
            {rutFiltro && (
              <button
                onClick={() => { setRutFiltro(''); setInputRut('') }}
                className="p-2 rounded-xl bg-red-50 text-red-400 hover:bg-red-100 transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button
            onClick={() => refetch()}
            className="p-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            title="Actualizar"
          >
            <RefreshCw size={14} />
          </button>
          {isAdmin && (
            <button
              onClick={() => {
                if (confirm('Reiniciar etapas? Las tarjetas se moveran a Sin contactar.')) {
                  resetMutation.mutate()
                }
              }}
              disabled={resetMutation.isPending}
              className="px-3 py-2 text-xs rounded-xl border border-gray-300 text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Reiniciar etapas
            </button>
          )}
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex gap-4 overflow-x-auto pb-4 items-start">
          {stages.map(stage => {
          const isDragOver = dragOverStageId === stage.etapa_id
          const totalMonto = stage.cards.reduce((a, c) => a + (c.monto_adjudicado || 0), 0)
          return (
            <div key={stage.etapa_id} className="w-[264px] shrink-0 flex flex-col">
              <div
                className="flex items-center justify-between px-3 py-2.5 rounded-t-xl text-white text-sm font-semibold"
                style={{ backgroundColor: stage.etapa_color }}
              >
                <div className="flex items-center gap-2">
                  <span>{stage.etapa_nombre}</span>
                  <span className="bg-white/25 px-1.5 py-0.5 rounded-full text-xs font-bold">
                    {stage.cards.length}
                  </span>
                </div>
                {totalMonto > 0 && (
                  <span className="text-xs opacity-75 font-normal">
                    {totalMonto >= 1_000_000
                      ? `$${(totalMonto / 1_000_000).toFixed(0)}M`
                      : `$${(totalMonto / 1_000).toFixed(0)}K`}
                  </span>
                )}
              </div>
              <div
                className={clsx(
                  'flex-1 rounded-b-xl min-h-[120px] p-2 space-y-2 transition-all',
                  isDragOver
                    ? 'bg-violet-50 border-2 border-dashed border-violet-300'
                    : 'bg-gray-100/80'
                )}
                onDragOver={e => e.preventDefault()}
                onDragEnter={e => { e.preventDefault(); setDragOverStageId(stage.etapa_id) }}
                onDragLeave={e => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragOverStageId(prev => prev === stage.etapa_id ? null : prev)
                  }
                }}
                onDrop={e => handleDrop(e, stage.etapa_id)}
              >
                {stage.cards.map(card => (
                  <KanbanCard
                    key={card.card_id}
                    card={card}
                    isExpanded={expandedCardId === card.card_id}
                    isDragging={draggingCardId === card.card_id}
                    onToggle={() => setExpandedCardId(id => id === card.card_id ? null : card.card_id)}
                    stages={stages}
                    onMoved={() => qc.invalidateQueries({ queryKey: ['adjudicadas-pipeline'] })}
                    onDragStart={e => {
                      e.dataTransfer.setData('cardId', card.card_id)
                      setDraggingCardId(card.card_id)
                    }}
                    onDragEnd={() => setDraggingCardId(null)}
                  />
                ))}
                {stage.cards.length === 0 && !isDragOver && (
                  <div className="h-16 flex items-center justify-center text-xs text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                    Arrastra aqui
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
