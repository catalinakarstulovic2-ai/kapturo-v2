import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../store/authStore'
import { Settings, User, Building2, Key, CheckCircle, AlertCircle, Eye, EyeOff, Save, Bot } from 'lucide-react'
import api from '../../api/client'

const API_KEY_LABELS: Record<string, string> = {
  apollo_api_key:           'Apollo.io — API Key',
  apify_api_key:            'Apify — API Key',
  whatsapp_token:           'WhatsApp — Token',
  whatsapp_phone_number_id: 'WhatsApp — Phone Number ID',
  whatsapp_verify_token:    'WhatsApp — Verify Token',
}

function KeyRow({
  field,
  label,
  estado,
  value,
  onChange,
}: {
  field: string
  label: string
  estado: { configurado: boolean; preview: string }
  value: string
  onChange: (v: string) => void
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <div className="flex items-center gap-1.5">
          {estado.configurado ? (
            <>
              <CheckCircle size={14} className="text-emerald-500" />
              <span className="text-xs text-emerald-600 font-medium">Configurado</span>
              {estado.preview && <code className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{estado.preview}</code>}
            </>
          ) : (
            <>
              <AlertCircle size={14} className="text-amber-500" />
              <span className="text-xs text-amber-600 font-medium">Sin configurar</span>
            </>
          )}
        </div>
      </div>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          className="input pr-10 text-sm font-mono"
          placeholder={estado.configurado ? 'Nueva clave para reemplazar...' : 'Pegar clave aquí...'}
          value={value}
          onChange={e => onChange(e.target.value)}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const { user } = useAuthStore()
  const isSuperAdmin = user?.role === 'super_admin'
  const qc = useQueryClient()

  const { data: tenantData, isLoading } = useQuery({
    queryKey: ['tenant-me'],
    queryFn: () => api.get('/tenant/me').then(r => r.data),
    enabled: !!user?.tenant_id,
  })

  const [keys, setKeys] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  const [agentForm, setAgentForm] = useState({
    agent_name: '', product: '', target: '', value_prop: '',
    extra_context: '', tone: '', ideal_industry: '', ideal_role: '',
    ideal_size: '', meeting_type: '',
  })
  const [agentSaved, setAgentSaved] = useState(false)

  const { data: agentConfigData, isLoading: agentConfigLoading } = useQuery({
    queryKey: ['agent-config'],
    queryFn: () => api.get('/tenant/me/agent-config').then(r => r.data),
    enabled: !!user?.tenant_id,
  })

  useEffect(() => {
    if (agentConfigData) {
      const c = agentConfigData.config || {}
      setAgentForm({
        agent_name: agentConfigData.agent_name || '',
        product: c.product || '',
        target: c.target || '',
        value_prop: c.value_prop || '',
        extra_context: c.extra_context || '',
        tone: c.tone || '',
        ideal_industry: c.ideal_industry || '',
        ideal_role: c.ideal_role || '',
        ideal_size: c.ideal_size || '',
        meeting_type: c.meeting_type || '',
      })
    }
  }, [agentConfigData])

  const saveAgentMutation = useMutation({
    mutationFn: (data: Record<string, string>) => api.put('/tenant/me/agent-config', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-config'] })
      setAgentSaved(true)
      setTimeout(() => setAgentSaved(false), 3000)
    },
  })

  const handleSaveAgent = () => {
    const payload = Object.fromEntries(Object.entries(agentForm).filter(([, v]) => v !== ''))
    saveAgentMutation.mutate(payload)
  }

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, string>) => api.put('/tenant/me/api-keys', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-me'] })
      setKeys({})
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  const handleSave = () => {
    const payload = Object.fromEntries(Object.entries(keys).filter(([, v]) => v.trim() !== ''))
    if (Object.keys(payload).length === 0) return
    saveMutation.mutate(payload)
  }

  const hasPendingChanges = Object.values(keys).some(v => v.trim() !== '')

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>

      {/* Perfil */}
      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2"><User size={16} /> Tu perfil</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Nombre</p>
            <p className="font-medium text-gray-900">{user?.full_name}</p>
          </div>
          <div>
            <p className="text-gray-500">Email</p>
            <p className="font-medium text-gray-900">{user?.email}</p>
          </div>
          <div>
            <p className="text-gray-500">Rol</p>
            <p className="font-medium text-gray-900 capitalize">{user?.role}</p>
          </div>
          <div>
            <p className="text-gray-500">Tenant ID</p>
            <p className="font-mono text-xs text-gray-500 truncate">{user?.tenant_id}</p>
          </div>
        </div>
      </div>

      {/* Empresa */}
      <div className="card p-5 space-y-3">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Building2 size={16} /> Tu empresa</h2>
        {isLoading ? (
          <p className="text-sm text-gray-400">Cargando...</p>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Nombre</span>
              <span className="font-medium text-gray-900">{tenantData?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Plan</span>
              <span className="font-medium text-gray-900 capitalize">{tenantData?.plan ?? 'Sin plan'}</span>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-gray-500">Módulos activos</span>
              <div className="flex flex-wrap gap-1 justify-end">
                {tenantData?.modulos_activos?.length > 0
                  ? tenantData.modulos_activos.map((m: string) => (
                      <span key={m} className="badge bg-brand-100 text-brand-700 capitalize">{m}</span>
                    ))
                  : <span className="text-gray-400 text-xs">Ninguno activo</span>
                }
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Integraciones / API Keys — solo super admin */}
      {isSuperAdmin && <div className="card p-5 space-y-1">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Key size={16} /> Integraciones</h2>
          {saved && (
            <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
              <CheckCircle size={13} /> Guardado
            </span>
          )}
        </div>

        {isLoading ? (
          <p className="text-sm text-gray-400">Cargando...</p>
        ) : (
          <>
            {Object.entries(API_KEY_LABELS).map(([field, label]) => (
              <KeyRow
                key={field}
                field={field}
                label={label}
                estado={tenantData?.api_keys_estado?.[field] ?? { configurado: false, preview: '' }}
                value={keys[field] ?? ''}
                onChange={v => setKeys(k => ({ ...k, [field]: v }))}
              />
            ))}

            {/* Clave de Anthropic solo informativa */}
            <div className="py-3 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Claude (Anthropic) — API Key</span>
                <div className="flex items-center gap-1.5">
                  <CheckCircle size={14} className="text-emerald-500" />
                  <span className="text-xs text-emerald-600 font-medium">Configurado (global)</span>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-1">Gestionado por Kapturo. No requiere configuración.</p>
            </div>

            <div className="pt-3">
              <button
                onClick={handleSave}
                disabled={!hasPendingChanges || saveMutation.isPending}
                className="btn-primary flex items-center gap-2 text-sm disabled:opacity-40"
              >
                <Save size={14} />
                {saveMutation.isPending ? 'Guardando...' : 'Guardar claves'}
              </button>
              {hasPendingChanges && (
                <p className="text-xs text-gray-400 mt-2">Tienes cambios sin guardar.</p>
              )}
            </div>
          </>
        )}
      </div>}

      {/* Agente IA */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Bot size={16} /> Agente IA</h2>
          {agentSaved && (
            <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
              <CheckCircle size={13} /> Guardado
            </span>
          )}
        </div>
        {agentConfigLoading ? (
          <p className="text-sm text-gray-400">Cargando...</p>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nombre del agente</label>
              <input className="input text-sm" placeholder="Ej: Valentina" value={agentForm.agent_name} onChange={e => setAgentForm(f => ({ ...f, agent_name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Producto o servicio</label>
              <input className="input text-sm" placeholder="Ej: diseno web, software de gestion, consultoria..." value={agentForm.product} onChange={e => setAgentForm(f => ({ ...f, product: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Cliente ideal</label>
              <input className="input text-sm" placeholder="Ej: duenos de restaurantes en Santiago..." value={agentForm.target} onChange={e => setAgentForm(f => ({ ...f, target: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Propuesta de valor</label>
              <textarea className="input text-sm resize-none" rows={2} placeholder="Ej: aumentamos tus ventas un 30% en 90 dias..." value={agentForm.value_prop} onChange={e => setAgentForm(f => ({ ...f, value_prop: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Contexto extra</label>
              <textarea className="input text-sm resize-none" rows={2} placeholder="Ej: solo trabajamos con restaurantes de mas de 50 mesas..." value={agentForm.extra_context} onChange={e => setAgentForm(f => ({ ...f, extra_context: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Tono</label>
                <select className="input text-sm" value={agentForm.tone} onChange={e => setAgentForm(f => ({ ...f, tone: e.target.value }))}>
                  <option value="">Sin definir</option>
                  <option value="informal">Informal</option>
                  <option value="professional">Profesional</option>
                  <option value="formal">Formal</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Reunion preferida</label>
                <select className="input text-sm" value={agentForm.meeting_type} onChange={e => setAgentForm(f => ({ ...f, meeting_type: e.target.value }))}>
                  <option value="">Sin definir</option>
                  <option value="video">Video llamada</option>
                  <option value="in_person">Presencial</option>
                  <option value="phone">Telefono</option>
                  <option value="prospect_chooses">El cliente elige</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Industria ideal</label>
                <input className="input text-sm" placeholder="Ej: Tecnologia, Retail..." value={agentForm.ideal_industry} onChange={e => setAgentForm(f => ({ ...f, ideal_industry: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Cargo ideal</label>
                <input className="input text-sm" placeholder="Ej: CEO, Gerente General..." value={agentForm.ideal_role} onChange={e => setAgentForm(f => ({ ...f, ideal_role: e.target.value }))} />
              </div>
            </div>
            <button
              onClick={handleSaveAgent}
              disabled={saveAgentMutation.isPending}
              className="btn-primary flex items-center gap-2 text-sm disabled:opacity-40"
            >
              <Save size={14} />
              {saveAgentMutation.isPending ? 'Guardando...' : 'Guardar configuracion IA'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

