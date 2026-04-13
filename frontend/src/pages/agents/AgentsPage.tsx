import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../api/client'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../store/authStore'
import {
  Bot, Sparkles, Trash2, RefreshCw, CheckCircle, XCircle,
  Loader2, MessageSquare, Settings, Zap, ZapOff, Edit3,
  MessageCircle, TrendingUp,
} from 'lucide-react'
import clsx from 'clsx'

// ── Tarjeta de agente ────────────────────────────────────────────────────────

function AgentCard({
  icon: Icon, title, desc, color, onRun, loading, badge,
}: {
  icon: any; title: string; desc: string; color: string
  onRun: () => void; loading: boolean; badge?: string
}) {
  return (
    <div className="card p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
          {badge && (
            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5 truncate">{desc}</p>
      </div>
      <button
        className="btn-primary flex items-center gap-2 text-sm py-1.5 px-3 shrink-0"
        onClick={onRun}
        disabled={loading}
      >
        {loading ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
        {loading ? 'Ejecutando...' : 'Ejecutar'}
      </button>
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────

export default function AgentsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'
  const [activeAgent, setActiveAgent] = useState<string | null>(null)
  const [resultado, setResultado] = useState<any>(null)

  // Config del agente del tenant
  const { data: agentData } = useQuery({
    queryKey: ['agent-config'],
    queryFn: () => api.get('/tenant/me/agent-config').then(r => r.data),
    enabled: !!user?.tenant_id && isAdmin,
  })

  const agentName = agentData?.agent_name
  const agentConfig = agentData?.config || {}
  const onboardingCompleto = agentData?.onboarding_completed

  const TONOS: Record<string, string> = {
    informal: '😊 Cercano',
    professional: '💼 Profesional',
    formal: '🎓 Formal',
  }

  // Mensajes pendientes
  const { data: pendientes = [] } = useQuery({
    queryKey: ['mensajes-pendientes'],
    queryFn: () =>
      api.get('/agents/mensajes/pendientes').then(r =>
        Array.isArray(r.data) ? r.data : r.data?.items ?? r.data?.mensajes ?? []
      ),
    refetchInterval: 30000,
    enabled: !!user?.tenant_id && isAdmin,
  })

  const run = (agent: string, payload?: any) => {
    setActiveAgent(agent)
    setResultado(null)
    return api
      .post(`/agents/${agent}`, payload || {})
      .then(r => {
        setResultado({ agent, ...r.data })
        toast.success('Agente ejecutado')
      })
      .catch(err => toast.error(err.response?.data?.detail || 'Error al ejecutar agente'))
      .finally(() => {
        setActiveAgent(null)
        qc.invalidateQueries({ queryKey: ['mensajes-pendientes'] })
      })
  }

  const aprobarMutation = useMutation({
    mutationFn: (id: string) => api.post(`/agents/mensajes/${id}/aprobar`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mensajes-pendientes'] })
      toast.success('Mensaje aprobado y enviado')
    },
  })

  const rechazarMutation = useMutation({
    mutationFn: (id: string) => api.post(`/agents/mensajes/${id}/rechazar`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mensajes-pendientes'] })
      toast.success('Mensaje rechazado')
    },
  })

  return (
    <div className="space-y-6 max-w-3xl">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Agentes IA</h1>
        <p className="text-gray-500 text-sm mt-1">
          Los agentes trabajan para ti. Tú apruebas antes de enviar.
        </p>
      </div>

      {/* Member — sin acceso a ejecución */}
      {!isAdmin && (
        <div className="card p-8 text-center text-gray-400">
          <Bot size={36} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-600">Solo los administradores pueden gestionar los agentes.</p>
          <p className="text-sm mt-1">Contacta al admin de tu equipo para configurar o ejecutar agentes.</p>
        </div>
      )}

      {/* Admin+ — vista completa */}
      {isAdmin && (
      <div className="contents">
      {onboardingCompleto && agentName ? (
        <div className="card p-5 bg-gradient-to-r from-brand-50 to-purple-50 border-brand-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Avatar del agente */}
              <div className="w-14 h-14 bg-brand-600 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-brand-200">
                {agentName[0].toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-bold text-gray-900 text-lg">{agentName}</p>
                  <span className="flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    Activo
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-0.5">
                  {agentConfig.product || 'Sin producto configurado'}
                </p>
                <div className="flex items-center gap-3 mt-1.5">
                  {agentConfig.tone && (
                    <span className="text-xs text-gray-500">
                      {TONOS[agentConfig.tone] || agentConfig.tone}
                    </span>
                  )}
                  {agentConfig.ideal_industry && (
                    <span className="text-xs text-gray-400">· {agentConfig.ideal_industry}</span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => navigate('/onboarding')}
              className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 border border-brand-200 hover:bg-brand-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Edit3 size={13} />Editar
            </button>
          </div>
        </div>
      ) : (
        /* Sin configurar */
        <div className="card p-5 border-dashed border-2 border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center">
                <Bot size={22} className="text-gray-400" />
              </div>
              <div>
                <p className="font-semibold text-gray-700">Tu agente no está configurado</p>
                <p className="text-sm text-gray-400 mt-0.5">
                  Configúralo en 5 pasos para que trabaje a tu medida
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate('/onboarding')}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <Settings size={14} />Configurar ahora
            </button>
          </div>
        </div>
      )}

      {/* Los 4 agentes */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Herramientas del agente
        </h2>
        <div className="space-y-2">
          <AgentCard
            icon={Sparkles}
            title="Calificador"
            desc="Califica prospectos sin score según tu cliente ideal. Asigna puntaje 0-100."
            color="bg-brand-500"
            loading={activeAgent === 'calificar'}
            onRun={() => run('calificar', { limit: 50 })}
          />
          <AgentCard
            icon={MessageSquare}
            title="Seguimiento"
            desc="Detecta prospectos sin respuesta y genera mensajes de follow-up personalizados."
            color="bg-blue-500"
            loading={activeAgent === 'seguimiento'}
            onRun={() => run('seguimiento', { horas_sin_respuesta: 24 })}
          />
          <AgentCard
            icon={Trash2}
            title="Limpiador"
            desc="Descarta prospectos con datos viejos (+180 días) o score muy bajo."
            color="bg-red-500"
            loading={activeAgent === 'limpiar'}
            onRun={() => run('limpiar', { dias_antiguedad: 180 })}
          />
          <AgentCard
            icon={RefreshCw}
            title="Redactor"
            desc="Escribe el primer mensaje de contacto. Selecciona un prospecto desde la tabla."
            color="bg-amber-500"
            loading={false}
            onRun={() => {
              toast('Ve a Prospectos → selecciona uno → clic en "Generar mensaje"', {
                icon: '💡',
                duration: 4000,
              })
            }}
          />
        </div>
      </div>

      {/* Agente conversacional — próximamente */}
      <div className="card p-4 border-dashed border-2 border-gray-200 opacity-60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
            <MessageCircle size={18} className="text-gray-400" />
          </div>
          <div>
            <p className="font-semibold text-gray-600 text-sm">
              Agente Conversacional WhatsApp
            </p>
            <p className="text-xs text-gray-400">
              Responde a tus prospectos en tiempo real · Próximamente
            </p>
          </div>
          <div className="ml-auto">
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">
              En construcción
            </span>
          </div>
        </div>
      </div>

      {/* Resultado del último agente ejecutado */}
      {resultado && (
        <div className="card p-4 bg-brand-50 border-brand-100">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={15} className="text-brand-600" />
            <p className="text-sm font-semibold text-brand-700">
              Resultado — {resultado.agent}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(resultado)
              .filter(([k]) => k !== 'agent')
              .map(([k, v]) => (
                <div key={k} className="bg-white rounded-lg p-3">
                  <p className="text-xs text-gray-400 capitalize">{k.replace(/_/g, ' ')}</p>
                  <p className="text-lg font-bold text-gray-900">{String(v)}</p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Mensajes pendientes de aprobación */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            Mensajes pendientes de aprobación
            {pendientes.length > 0 && (
              <span className="badge bg-amber-100 text-amber-700 text-xs">
                {pendientes.length}
              </span>
            )}
          </h2>
        </div>

        {pendientes.length === 0 ? (
          <div className="card p-8 text-center text-gray-400">
            <Bot size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Sin mensajes pendientes.</p>
            <p className="text-xs mt-1 text-gray-300">
              Ejecuta el Agente Seguimiento para generar mensajes.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendientes.map((msg: any) => (
              <div key={msg.id} className="card p-4 border-l-4 border-amber-400">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="badge bg-amber-100 text-amber-700 text-xs">
                        Pendiente aprobación
                      </span>
                      <span className="badge bg-gray-100 text-gray-600 text-xs">
                        {msg.channel}
                      </span>
                      {msg.generated_by_ai && (
                        <span className="badge bg-brand-50 text-brand-600 text-xs">
                          IA
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                      {msg.body}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      className="flex items-center gap-1.5 text-sm text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors font-medium"
                      onClick={() => aprobarMutation.mutate(msg.id)}
                      disabled={aprobarMutation.isPending}
                    >
                      <CheckCircle size={14} />Aprobar
                    </button>
                    <button
                      className="flex items-center gap-1.5 text-sm text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
                      onClick={() => rechazarMutation.mutate(msg.id)}
                      disabled={rechazarMutation.isPending}
                    >
                      <XCircle size={14} />Rechazar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>)}
    </div>
  )
}
