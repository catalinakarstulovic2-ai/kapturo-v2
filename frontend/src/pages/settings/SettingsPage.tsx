import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../store/authStore'
import { User, Building2, Key, CheckCircle, AlertCircle, Eye, EyeOff, Save, Bot, Tag, RotateCcw } from 'lucide-react'
import api from '../../api/client'

const API_KEY_LABELS: Record<string, string> = {
  apollo_api_key:           'Directorio B2B — API Key',
  apify_api_key:            'Automatización Web — API Key',
  whatsapp_token:           'WhatsApp — Token',
  whatsapp_phone_number_id: 'WhatsApp — Phone Number ID',
  whatsapp_verify_token:    'WhatsApp — Verify Token',
}

function KeyRow({
  field, label, estado, value, onChange,
}: {
  field: string; label: string
  estado: { configurado: boolean; preview: string }
  value: string; onChange: (v: string) => void
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
        <button type="button" onClick={() => setVisible(v => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const { user } = useAuthStore()
  const isSuperAdmin = user?.role === 'super_admin'
  const isAdmin     = user?.role === 'admin' || isSuperAdmin
  const qc = useQueryClient()

  // ── Tab activo ─────────────────────────────────────────────────────────
  const [tab, setTab] = useState<'general' | 'agente' | 'mercado' | 'integraciones'>('general')

  // ── Tenant / empresa ───────────────────────────────────────────────────
  const { data: tenantData, isLoading } = useQuery({
    queryKey: ['tenant-me'],
    queryFn: () => api.get('/tenant/me').then(r => r.data),
    enabled: !!user?.tenant_id && isAdmin,
  })

  // ── API Keys ───────────────────────────────────────────────────────────
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const hasPendingChanges = Object.values(keys).some(v => v.trim() !== '')

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

  // ── Agente IA ──────────────────────────────────────────────────────────
  const [agentForm, setAgentForm] = useState({
    agent_name: '', product: '', target: '', value_prop: '',
    extra_context: '', tone: '', ideal_industry: '', ideal_role: '',
    ideal_size: '', meeting_type: '',
  })
  const [agentSaved, setAgentSaved] = useState(false)

  const { data: agentConfigData, isLoading: agentConfigLoading } = useQuery({
    queryKey: ['agent-config'],
    queryFn: () => api.get('/tenant/me/agent-config').then(r => r.data),
    enabled: !!user?.tenant_id && isAdmin,
  })

  useEffect(() => {
    if (agentConfigData) {
      const c = agentConfigData.config || {}
      setAgentForm({
        agent_name: agentConfigData.agent_name || '',
        product: c.product || '', target: c.target || '',
        value_prop: c.value_prop || '', extra_context: c.extra_context || '',
        tone: c.tone || '', ideal_industry: c.ideal_industry || '',
        ideal_role: c.ideal_role || '', ideal_size: c.ideal_size || '',
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

  // ── Rubros ─────────────────────────────────────────────────────────────
  const [rubrosSeleccionados, setRubrosSeleccionados] = useState<string[]>([])
  const [rubrosGuardados, setRubrosGuardados] = useState(false)

  const { data: rubrosData, isLoading: rubrosLoading } = useQuery({
    queryKey: ['rubros-config'],
    queryFn: () => api.get('/modules/adjudicadas/rubros-config').then(r => r.data),
    enabled: !!user?.tenant_id && isAdmin,
  })
  useEffect(() => {
    if (rubrosData) setRubrosSeleccionados(rubrosData.habilitados ?? [])
  }, [rubrosData])

  const saveRubrosMutation = useMutation({
    mutationFn: (payload: { rubros: string[]; resetear: boolean }) =>
      api.put('/modules/adjudicadas/rubros-config', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rubros-config'] })
      setRubrosGuardados(true)
      setTimeout(() => setRubrosGuardados(false), 3000)
    },
  })
  const toggleRubro = (r: string) =>
    setRubrosSeleccionados(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])

  // ── Tabs config ────────────────────────────────────────────────────────
  const allTabs = [
    { id: 'general'       as const, label: 'General',          icon: User                                          },
    { id: 'agente'        as const, label: 'Agente IA',        icon: Bot,  adminOnly: true, requiresTenant: true   },
    { id: 'mercado'       as const, label: 'Mercado Público',  icon: Tag,  adminOnly: true, requiresTenant: true   },
    { id: 'integraciones' as const, label: 'Integraciones',    icon: Key,  superOnly: true                         },
  ]
  const visibleTabs = allTabs.filter(t =>
    (!t.adminOnly || isAdmin) &&
    (!t.superOnly || isSuperAdmin) &&
    (!(t as any).requiresTenant || !!user?.tenant_id)
  )

  // Si el tab activo queda oculto, volver a general
  useEffect(() => {
    if (!visibleTabs.find(t => t.id === tab)) setTab('general')
  }, [user?.tenant_id])

  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {visibleTabs.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                active
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ── GENERAL ─────────────────────────────────────────── */}
      {tab === 'general' && (
        <div className="space-y-4">
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2"><User size={15} /> Tu perfil</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Nombre</p>
                <p className="font-medium text-gray-900">{user?.full_name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Email</p>
                <p className="font-medium text-gray-900">{user?.email}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Rol</p>
                <p className="font-medium text-gray-900 capitalize">{user?.role}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Tenant ID</p>
                <p className="font-mono text-xs text-gray-500 truncate">{user?.tenant_id}</p>
              </div>
            </div>
          </div>

          {isAdmin && (
            <div className="card p-5 space-y-3">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Building2 size={15} /> Tu empresa</h2>
              {isLoading ? <p className="text-sm text-gray-400">Cargando...</p> : (
                <div className="space-y-2.5 text-sm">
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
          )}
        </div>
      )}

      {/* ── AGENTE IA ────────────────────────────────────────── */}
      {tab === 'agente' && isAdmin && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Bot size={15} /> Agente IA</h2>
            {agentSaved && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                <CheckCircle size={13} /> Guardado
              </span>
            )}
          </div>
          {agentConfigLoading ? <p className="text-sm text-gray-400">Cargando...</p> : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nombre del agente</label>
                <input className="input text-sm" placeholder="Ej: Valentina" value={agentForm.agent_name} onChange={e => setAgentForm(f => ({ ...f, agent_name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Producto o servicio</label>
                <input className="input text-sm" placeholder="Ej: diseño web, software de gestión..." value={agentForm.product} onChange={e => setAgentForm(f => ({ ...f, product: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Cliente ideal</label>
                <input className="input text-sm" placeholder="Ej: dueños de restaurantes en Santiago..." value={agentForm.target} onChange={e => setAgentForm(f => ({ ...f, target: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Propuesta de valor</label>
                <textarea className="input text-sm resize-none" rows={2} placeholder="Ej: aumentamos tus ventas un 30% en 90 días..." value={agentForm.value_prop} onChange={e => setAgentForm(f => ({ ...f, value_prop: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Contexto extra</label>
                <textarea className="input text-sm resize-none" rows={2} placeholder="Ej: solo trabajamos con restaurantes de más de 50 mesas..." value={agentForm.extra_context} onChange={e => setAgentForm(f => ({ ...f, extra_context: e.target.value }))} />
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
                  <label className="block text-xs font-medium text-gray-700 mb-1">Reunión preferida</label>
                  <select className="input text-sm" value={agentForm.meeting_type} onChange={e => setAgentForm(f => ({ ...f, meeting_type: e.target.value }))}>
                    <option value="">Sin definir</option>
                    <option value="video">Video llamada</option>
                    <option value="in_person">Presencial</option>
                    <option value="phone">Teléfono</option>
                    <option value="prospect_chooses">El cliente elige</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Industria ideal</label>
                  <input className="input text-sm" placeholder="Ej: Tecnología, Retail..." value={agentForm.ideal_industry} onChange={e => setAgentForm(f => ({ ...f, ideal_industry: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Cargo ideal</label>
                  <input className="input text-sm" placeholder="Ej: CEO, Gerente General..." value={agentForm.ideal_role} onChange={e => setAgentForm(f => ({ ...f, ideal_role: e.target.value }))} />
                </div>
              </div>
              <button onClick={handleSaveAgent} disabled={saveAgentMutation.isPending}
                className="btn-primary flex items-center gap-2 text-sm disabled:opacity-40">
                <Save size={14} />
                {saveAgentMutation.isPending ? 'Guardando...' : 'Guardar configuración IA'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── MERCADO PÚBLICO ──────────────────────────────────── */}
      {tab === 'mercado' && isAdmin && (
        <div className="card p-5 space-y-4">
          {!user?.modules?.some(m => m.tipo === 'adjudicadas') ? (
            <div className="text-center py-8">
              <Tag size={28} className="mx-auto text-gray-200 mb-3" />
              <p className="text-sm font-medium text-gray-600">Módulo Mercado Público no activado</p>
              <p className="text-xs text-gray-400 mt-1">
                Este módulo no está habilitado para tu empresa. Contacta al administrador de Kapturo para activarlo.
              </p>
            </div>
          ) : (
            <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Tag size={15} /> Rubros habilitados</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Solo los rubros seleccionados aparecerán en los filtros de Mercado Público.
              </p>
            </div>
            {rubrosGuardados && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                <CheckCircle size={13} /> Guardado
              </span>
            )}
          </div>

          {rubrosData?.personalizado && (
            <div className="flex items-center gap-2 bg-violet-50 border border-violet-100 rounded-xl px-3 py-2">
              <span className="text-xs text-violet-700 font-medium">
                {rubrosSeleccionados.length} de {rubrosData?.todos?.length} rubros habilitados
              </span>
              <button
                onClick={() => {
                  setRubrosSeleccionados(rubrosData.todos)
                  saveRubrosMutation.mutate({ rubros: [], resetear: true })
                }}
                disabled={saveRubrosMutation.isPending}
                className="ml-auto flex items-center gap-1 text-xs text-violet-500 hover:text-violet-700"
              >
                <RotateCcw size={11} /> Mostrar todos
              </button>
            </div>
          )}

          {rubrosLoading ? (
            <p className="text-sm text-gray-400">Cargando...</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {(rubrosData?.todos ?? []).map((r: string) => {
                  const activo = rubrosSeleccionados.includes(r)
                  return (
                    <button key={r} onClick={() => toggleRubro(r)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors capitalize ${
                        activo
                          ? 'bg-violet-600 text-white border-violet-600'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-violet-300 hover:text-violet-600'
                      }`}>
                      {r}
                    </button>
                  )
                })}
              </div>
              <button
                onClick={() => saveRubrosMutation.mutate({ rubros: rubrosSeleccionados, resetear: false })}
                disabled={rubrosSeleccionados.length === 0 || saveRubrosMutation.isPending}
                className="btn-primary flex items-center gap-2 text-sm disabled:opacity-40"
              >
                <Save size={14} />
                {saveRubrosMutation.isPending ? 'Guardando...' : 'Guardar selección'}
              </button>
            </>
          )}
            </>
          )}
        </div>
      )}

      {/* ── INTEGRACIONES ────────────────────────────────────── */}
      {tab === 'integraciones' && isSuperAdmin && (
        <div className="card p-5 space-y-1">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Key size={15} /> API Keys</h2>
            {saved && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                <CheckCircle size={13} /> Guardado
              </span>
            )}
          </div>
          {isLoading ? <p className="text-sm text-gray-400">Cargando...</p> : (
            <>
              {Object.entries(API_KEY_LABELS).map(([field, label]) => (
                <KeyRow
                  key={field} field={field} label={label}
                  estado={tenantData?.api_keys_estado?.[field] ?? { configurado: false, preview: '' }}
                  value={keys[field] ?? ''} onChange={v => setKeys(k => ({ ...k, [field]: v }))}
                />
              ))}
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
                <button onClick={handleSave} disabled={!hasPendingChanges || saveMutation.isPending}
                  className="btn-primary flex items-center gap-2 text-sm disabled:opacity-40">
                  <Save size={14} />
                  {saveMutation.isPending ? 'Guardando...' : 'Guardar claves'}
                </button>
                {hasPendingChanges && <p className="text-xs text-gray-400 mt-2">Tienes cambios sin guardar.</p>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

