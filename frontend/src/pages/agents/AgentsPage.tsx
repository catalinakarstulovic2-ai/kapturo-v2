import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/client'
import toast from 'react-hot-toast'
import { Bot, Sparkles, Trash2, RefreshCw, CheckCircle, XCircle, Loader2, MessageSquare } from 'lucide-react'

function AgentCard({ icon: Icon, title, desc, color, onRun, loading }: any) {
  return (
    <div className="card p-5 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
      <div className="flex-1">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500 mt-0.5">{desc}</p>
      </div>
      <button
        className="btn-primary flex items-center gap-2 text-sm py-2"
        onClick={onRun}
        disabled={loading}
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
        Ejecutar
      </button>
    </div>
  )
}

export default function AgentsPage() {
  const qc = useQueryClient()
  const [activeAgent, setActiveAgent] = useState<string | null>(null)
  const [resultado, setResultado] = useState<any>(null)

  const run = (agent: string, payload?: any) => {
    setActiveAgent(agent)
    setResultado(null)
    return api.post(`/agents/${agent}`, payload || {})
      .then(r => { setResultado({ agent, ...r.data }); toast.success('Agente ejecutado') })
      .catch(err => toast.error(err.response?.data?.detail || 'Error al ejecutar agente'))
      .finally(() => { setActiveAgent(null); qc.invalidateQueries({ queryKey: ['mensajes-pendientes'] }) })
  }

  const { data: pendientes = [] } = useQuery({
    queryKey: ['mensajes-pendientes'],
    queryFn: () => api.get('/agents/mensajes/pendientes').then(r => Array.isArray(r.data) ? r.data : r.data?.items ?? r.data?.mensajes ?? []),
    refetchInterval: 30000,
  })

  const aprobarMutation = useMutation({
    mutationFn: (id: string) => api.post(`/agents/mensajes/${id}/aprobar`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mensajes-pendientes'] }); toast.success('Mensaje aprobado') },
  })

  const rechazarMutation = useMutation({
    mutationFn: (id: string) => api.post(`/agents/mensajes/${id}/rechazar`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mensajes-pendientes'] }); toast.success('Mensaje rechazado') },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Agentes IA</h1>
        <p className="text-gray-500 text-sm mt-1">Los agentes trabajan para ti. Tú apruebas antes de enviar.</p>
      </div>

      {/* Agentes */}
      <div className="space-y-3">
        <AgentCard
          icon={Sparkles}
          title="Agente Calificador"
          desc="Califica todos los prospectos sin score con Claude Haiku. Asigna un puntaje 0-100 a cada uno."
          color="bg-brand-500"
          loading={activeAgent === 'calificar'}
          onRun={() => run('calificar', { limit: 50 })}
        />
        <AgentCard
          icon={MessageSquare}
          title="Agente Seguimiento"
          desc="Detecta prospectos contactados sin respuesta y genera mensajes de follow-up."
          color="bg-blue-500"
          loading={activeAgent === 'seguimiento'}
          onRun={() => run('seguimiento', { horas_sin_respuesta: 24 })}
        />
        <AgentCard
          icon={Trash2}
          title="Agente Limpiador"
          desc="Marca como descartados los prospectos con datos viejos (+180 días) o score muy bajo."
          color="bg-red-500"
          loading={activeAgent === 'limpiar'}
          onRun={() => run('limpiar', { dias_antiguedad: 180 })}
        />
        <AgentCard
          icon={RefreshCw}
          title="Agente Redactor"
          desc="Redacta un mensaje personalizado para un prospecto específico (ve a Prospectos para seleccionar uno)."
          color="bg-amber-500"
          loading={false}
          onRun={() => toast('Selecciona un prospecto desde la tabla de Prospectos')}
        />
      </div>

      {/* Resultado del último agente */}
      {resultado && (
        <div className="card p-4 bg-brand-50 border-brand-100">
          <p className="text-sm font-medium text-brand-700 mb-1">Resultado — Agente {resultado.agent}</p>
          <pre className="text-xs text-brand-600 whitespace-pre-wrap">
            {JSON.stringify(resultado, null, 2)}
          </pre>
        </div>
      )}

      {/* Bandeja de mensajes pendientes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">
            Mensajes pendientes de aprobación
            {pendientes.length > 0 && (
              <span className="ml-2 badge bg-amber-100 text-amber-700">{pendientes.length}</span>
            )}
          </h2>
        </div>

        {pendientes.length === 0 ? (
          <div className="card p-8 text-center text-gray-400">
            <Bot size={32} className="mx-auto mb-2 opacity-30" />
            <p>No hay mensajes pendientes. Ejecuta el Agente Seguimiento para generar algunos.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendientes.map((msg: any) => (
              <div key={msg.id} className="card p-4 border-l-4 border-amber-400">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="badge bg-amber-100 text-amber-700 text-xs">Pendiente aprobación</span>
                      <span className="badge bg-gray-100 text-gray-600 text-xs">{msg.channel}</span>
                      {msg.generated_by_ai && (
                        <span className="badge bg-brand-50 text-brand-600 text-xs">Generado por IA</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-line">{msg.body}</p>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      className="flex items-center gap-1.5 text-sm text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors"
                      onClick={() => aprobarMutation.mutate(msg.id)}
                      disabled={aprobarMutation.isPending}
                    >
                      <CheckCircle size={14} /> Aprobar
                    </button>
                    <button
                      className="flex items-center gap-1.5 text-sm text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
                      onClick={() => rechazarMutation.mutate(msg.id)}
                      disabled={rechazarMutation.isPending}
                    >
                      <XCircle size={14} /> Rechazar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
