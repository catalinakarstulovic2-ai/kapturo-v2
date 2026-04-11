import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/client'
import toast from 'react-hot-toast'
import { MessageSquare, Send, Bot, Check, CheckCheck, Loader2 } from 'lucide-react'

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface Conversation {
  id: string
  prospect_id: string
  prospect_name: string | null
  prospect_contact: string | null
  prospect_phone: string | null
  channel: string
  is_open: boolean
  last_message_at: string | null
  last_message_preview: string | null
  last_message_direction: string | null
}

interface Message {
  id: string
  body: string
  direction: 'inbound' | 'outbound'
  status: string
  channel: string
  generated_by_ai: boolean
  sent_at: string | null
  created_at: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatTime(isoString: string | null): string {
  if (!isoString) return ''
  const d = new Date(isoString)
  return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(isoString: string | null): string {
  if (!isoString) return ''
  const d = new Date(isoString)
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
}

// ── Componente: burbuja de mensaje ─────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isOutbound = msg.direction === 'outbound'

  const statusIcon = () => {
    if (!isOutbound) return null
    if (msg.status === 'read') return <CheckCheck size={14} className="text-blue-400" />
    if (msg.status === 'delivered' || msg.status === 'sent') return <CheckCheck size={14} className="text-gray-400" />
    return <Check size={14} className="text-gray-400" />
  }

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'} mb-2`}>
      <div
        className={`max-w-[72%] px-4 py-2.5 rounded-2xl shadow-sm text-sm leading-relaxed ${
          isOutbound
            ? 'bg-green-500 text-white rounded-br-sm'
            : 'bg-white text-gray-800 rounded-bl-sm border border-gray-100'
        }`}
      >
        {/* Badge IA */}
        {msg.generated_by_ai && isOutbound && (
          <div className="flex items-center gap-1 mb-1 opacity-80">
            <Bot size={10} />
            <span className="text-[10px] font-medium">Generado por IA</span>
          </div>
        )}

        {/* Cuerpo del mensaje */}
        <p className="whitespace-pre-wrap">{msg.body}</p>

        {/* Hora + estado */}
        <div className={`flex items-center gap-1 mt-1 justify-end ${isOutbound ? 'opacity-75' : 'text-gray-400'}`}>
          <span className="text-[11px]">{formatTime(msg.created_at)}</span>
          {statusIcon()}
        </div>

        {/* Botones aprobación si status es pending_approval */}
        {msg.status === 'pending_approval' && isOutbound && (
          <PendingApprovalActions messageId={msg.id} />
        )}
      </div>
    </div>
  )
}

// ── Componente: botones aprobar/rechazar ───────────────────────────────────────

function PendingApprovalActions({ messageId }: { messageId: string }) {
  const qc = useQueryClient()

  const aprobar = useMutation({
    mutationFn: () => api.post(`/agents/mensajes/${messageId}/aprobar`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conv-messages'] })
      toast.success('Mensaje aprobado')
    },
    onError: () => toast.error('Error al aprobar el mensaje'),
  })

  const rechazar = useMutation({
    mutationFn: () => api.post(`/agents/mensajes/${messageId}/rechazar`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conv-messages'] })
      toast.success('Mensaje rechazado')
    },
    onError: () => toast.error('Error al rechazar el mensaje'),
  })

  return (
    <div className="flex gap-2 mt-2 pt-2 border-t border-green-400/40">
      <button
        className="flex-1 text-[11px] font-semibold bg-white/20 hover:bg-white/30 py-1 rounded-lg transition-colors"
        onClick={() => aprobar.mutate()}
        disabled={aprobar.isPending || rechazar.isPending}
      >
        {aprobar.isPending ? '...' : 'Aprobar'}
      </button>
      <button
        className="flex-1 text-[11px] font-semibold bg-red-500/40 hover:bg-red-500/60 py-1 rounded-lg transition-colors"
        onClick={() => rechazar.mutate()}
        disabled={aprobar.isPending || rechazar.isPending}
      >
        {rechazar.isPending ? '...' : 'Rechazar'}
      </button>
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function InboxPage() {
  const qc = useQueryClient()
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  const [draftBody, setDraftBody] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  // Conversaciones del tenant
  const { data: convsData, isLoading: convsLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get('/messages/conversations').then(r => r.data),
    refetchInterval: 15000,
  })

  const conversations: Conversation[] = convsData?.conversaciones ?? []

  // Mensajes de la conversación seleccionada
  const { data: messagesData, isLoading: messagesLoading } = useQuery({
    queryKey: ['conv-messages', selectedConvId],
    queryFn: () =>
      selectedConvId
        ? api.get(`/messages/conversations/${selectedConvId}/messages`).then(r => r.data)
        : null,
    enabled: !!selectedConvId,
    refetchInterval: 10000,
  })

  const messages: Message[] = messagesData?.mensajes ?? []
  const selectedConv = conversations.find(c => c.id === selectedConvId)

  // Redactar con IA
  const handleDraftWithAI = async () => {
    if (!selectedConv) return
    setAiLoading(true)
    try {
      const res = await api.post('/agents/redactar', {
        prospect_id: selectedConv.prospect_id,
        canal: 'whatsapp',
      })
      toast.success('Mensaje redactado. Revisa los pendientes de aprobación.')
      qc.invalidateQueries({ queryKey: ['conv-messages', selectedConvId] })
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error al redactar con IA')
    } finally {
      setAiLoading(false)
    }
  }

  // Enviar mensaje manual
  const sendMutation = useMutation({
    mutationFn: async () => {
      // En este flujo simplificado el usuario escribe y se envía directo
      // (en producción se crearía el mensaje y luego se aprobaría)
      // Por ahora mostramos el texto en pantalla con toast informativo
      toast('Para enviar, usa el flujo de IA: Redactar → Aprobar → Enviar desde Agentes IA')
      setDraftBody('')
    },
  })

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-50 overflow-hidden rounded-xl border border-gray-200">

      {/* ── Panel izquierdo: lista de conversaciones ── */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col shrink-0">
        {/* Header */}
        <div className="h-14 px-4 flex items-center border-b border-gray-200">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-green-600" />
            <h2 className="font-semibold text-gray-900">Conversaciones</h2>
          </div>
          {conversations.length > 0 && (
            <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
              {conversations.length}
            </span>
          )}
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {convsLoading ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 text-center px-6">
              <MessageSquare size={32} className="mb-2 opacity-30" />
              <p className="text-sm">Sin conversaciones aún.</p>
              <p className="text-xs mt-1">Los mensajes de WhatsApp aparecerán aquí.</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSelectedConvId(conv.id)}
                className={`w-full px-4 py-3 text-left border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                  selectedConvId === conv.id ? 'bg-green-50 border-l-2 border-l-green-500' : ''
                }`}
              >
                {/* Avatar + nombre */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                    <MessageSquare size={16} className="text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {conv.prospect_name ?? `Prospecto ${conv.prospect_id.slice(0, 6)}`}
                      </span>
                      <span className="text-[11px] text-gray-400 shrink-0 ml-1">
                        {formatDate(conv.last_message_at)}
                      </span>
                    </div>
                    {conv.prospect_contact && (
                      <p className="text-xs text-gray-400 truncate">{conv.prospect_contact}</p>
                    )}
                    <div className="flex items-center gap-1 mt-0.5">
                      {conv.last_message_direction === 'outbound' && (
                        <Check size={12} className="text-gray-400 shrink-0" />
                      )}
                      <p className="text-xs text-gray-500 truncate">
                        {conv.last_message_preview || 'Sin mensajes'}
                      </p>
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Panel derecho: hilo de mensajes ── */}
      <div className="flex-1 flex flex-col">
        {selectedConvId && selectedConv ? (
          <>
            {/* Header del hilo */}
            <div className="h-14 px-4 flex items-center gap-3 bg-white border-b border-gray-200 shrink-0">
              <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center">
                <MessageSquare size={16} className="text-green-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {selectedConv.prospect_name ?? `Prospecto ${selectedConv.prospect_id.slice(0, 8)}`}
                </p>
                <p className="text-xs text-gray-500">
                  {selectedConv.prospect_contact && `${selectedConv.prospect_contact} · `}
                  {selectedConv.channel} · {selectedConv.is_open ? 'Abierta' : 'Cerrada'}
                </p>
              </div>
            </div>

            {/* Mensajes */}
            <div className="flex-1 overflow-y-auto px-6 py-4 bg-[#efeae2]">
              {/* Fondo tipo WhatsApp */}
              {messagesLoading ? (
                <div className="flex justify-center items-center h-32">
                  <Loader2 size={20} className="animate-spin text-gray-500" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <MessageSquare size={32} className="mb-2 opacity-30" />
                  <p className="text-sm">Sin mensajes en esta conversación.</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <MessageBubble key={msg.id} msg={msg} />
                ))
              )}
            </div>

            {/* Caja de redacción */}
            <div className="bg-white border-t border-gray-200 px-4 py-3 shrink-0">
              <div className="flex items-end gap-3">
                <textarea
                  className="flex-1 resize-none rounded-2xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 max-h-28"
                  rows={2}
                  placeholder="Escribe un mensaje..."
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      if (draftBody.trim()) sendMutation.mutate()
                    }
                  }}
                />
                {/* Botón Redactar con IA */}
                <button
                  className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2.5 rounded-2xl transition-colors shrink-0 disabled:opacity-60"
                  onClick={handleDraftWithAI}
                  disabled={aiLoading}
                  title="La IA redacta un mensaje para este prospecto, queda pendiente de aprobación"
                >
                  {aiLoading
                    ? <Loader2 size={14} className="animate-spin" />
                    : <Bot size={14} />
                  }
                  Redactar con IA
                </button>
                {/* Botón Enviar */}
                <button
                  className="w-10 h-10 flex items-center justify-center bg-green-500 hover:bg-green-600 text-white rounded-full transition-colors shrink-0 disabled:opacity-40"
                  onClick={() => { if (draftBody.trim()) sendMutation.mutate() }}
                  disabled={!draftBody.trim()}
                  title="Enviar mensaje"
                >
                  <Send size={16} />
                </button>
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5 px-1">
                Los mensajes generados por IA requieren aprobación antes de enviarse al prospecto.
              </p>
            </div>
          </>
        ) : (
          /* Estado vacío — no hay conversación seleccionada */
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-[#efeae2]">
            <div className="w-20 h-20 bg-white/60 rounded-full flex items-center justify-center mb-4 shadow-sm">
              <MessageSquare size={36} className="opacity-40" />
            </div>
            <p className="font-medium text-gray-600">Selecciona una conversación</p>
            <p className="text-sm mt-1 text-gray-400">
              Los mensajes de WhatsApp con tus prospectos aparecerán aquí.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
