import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../store/authStore'
import { User, Building2, Key, CheckCircle, AlertCircle, Eye, EyeOff, Save, Bot, Tag, RotateCcw, Loader2, FileText, MapPin, Mail, Link, Plus, Trash2, Sparkles, Search, ChevronRight, X } from 'lucide-react'
import api from '../../api/client'

const API_KEY_LABELS: Record<string, string> = {
  apollo_api_key:           'Directorio B2B — API Key',
  apify_api_key:            'Automatización Web — API Key',
  whatsapp_token:           'WhatsApp — Token',
  whatsapp_phone_number_id: 'WhatsApp — Phone Number ID',
  whatsapp_verify_token:    'WhatsApp — Verify Token',
}

const MODULE_LABELS: Record<string, string> = {
  adjudicadas:    'Mercado Público',
  licitaciones:   'Licitaciones',
  licitador:      'Licitaciones',
  inmobiliaria:   'Inmobiliaria',
  prospector:     'Prospector',
  kapturo_ventas: 'Kapturo Ventas',
}

const ROLE_STYLE: Record<string, string> = {
  super_admin: 'bg-purple-100 text-purple-700',
  admin:       'bg-blue-100 text-blue-700',
  member:      'bg-gray-100 text-gray-600',
}
const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  admin:       'Admin',
  member:      'Miembro',
}

const REGION_ORDER = [
  'XV','I','II','III','IV','V','RM','VI','VII','XVI','VIII','IX','XIV','X','XI','XII',
]

const DOC_TIPOS = [
  { value: 'linkedin',      label: 'Perfil LinkedIn',           hint: 'LinkedIn del dueño o equipo directivo' },
  { value: 'presentacion',  label: 'Presentación corporativa',  hint: 'PDF o PPT con quién es la empresa y qué hace' },
  { value: 'catalogo',      label: 'Catálogo de servicios',     hint: 'PDF con lista de productos o servicios ofrecidos' },
  { value: 'certificado',   label: 'Certificado',               hint: 'ISO 9001, OHSAS, patente, resolución sanitaria, etc.' },
  { value: 'propuesta',     label: 'Propuesta anterior',        hint: 'Ejemplo de propuesta o contrato ganado como referencia' },
  { value: 'otro',          label: 'Otro',                      hint: 'Cualquier otro documento útil para postular' },
]

const RUBRO_CATEGORIAS: { label: string; emoji: string; rubros: string[] }[] = [
  { label: 'Construcción & Obras',    emoji: '🏗️', rubros: ['construcción', 'infraestructura', 'obras civiles', 'arquitectura', 'forestal'] },
  { label: 'Tecnología',              emoji: '💻', rubros: ['tecnología', 'informática', 'software', 'telecomunicaciones'] },
  { label: 'Salud',                   emoji: '🏥', rubros: ['salud', 'farmacéutico', 'médico', 'hospitalario', 'laboratorio', 'veterinario'] },
  { label: 'Servicios Generales',     emoji: '🧹', rubros: ['aseo', 'limpieza', 'mantención', 'seguridad', 'residuos'] },
  { label: 'Logística & Transporte',  emoji: '🚛', rubros: ['transporte', 'logística', 'vehículos', 'combustible'] },
  { label: 'Consultoría & Negocios',  emoji: '💼', rubros: ['consultoría', 'jurídico', 'marketing', 'recursos humanos', 'seguros'] },
  { label: 'Educación',               emoji: '📚', rubros: ['educación', 'capacitación', 'deportes'] },
  { label: 'Industria & Producción',  emoji: '⚙️', rubros: ['alimentos', 'agrícola', 'minería', 'energía', 'maquinaria'] },
  { label: 'Equipamiento',            emoji: '🪑', rubros: ['mobiliario', 'vestuario', 'uniformes', 'imprenta'] },
  { label: 'Turismo & Gastronomía',   emoji: '🏨', rubros: ['hotelería'] },
]

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

function RubroCategoria({ cat, seleccionados, onToggle }: {
  cat: { label: string; emoji: string; rubros: string[] }
  seleccionados: string[]
  onToggle: (r: string) => void
}) {
  const activosEnCat = cat.rubros.filter(r => seleccionados.includes(r))
  const [open, setOpen] = useState(true)
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left bg-white active:bg-gray-50">
        <span className="text-sm leading-none">{cat.emoji}</span>
        <span className="flex-1 text-xs font-semibold text-gray-700 uppercase tracking-wide">{cat.label}</span>
        {activosEnCat.length > 0 && (
          <span className="text-[10px] font-bold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded-full">{activosEnCat.length}</span>
        )}
        <ChevronRight size={12} className={`text-gray-300 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="grid grid-cols-3 gap-1 px-3 pb-3 pt-1 bg-gray-50/50">
          {cat.rubros.map(r => {
            const activo = seleccionados.includes(r)
            return (
              <button key={r} onClick={() => onToggle(r)}
                className={`py-2 rounded-lg text-[11px] font-medium border capitalize transition-colors text-center leading-tight ${
                  activo ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 active:bg-gray-50'
                }`}>{r}</button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function BottomSheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode
}) {
  // lock body scroll while open
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      {/* Panel */}
      <div className="relative bg-white rounded-t-2xl w-full max-h-[90dvh] flex flex-col shadow-2xl animate-slide-up">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <h3 className="font-semibold text-gray-900 text-base">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-3">
          {children}
        </div>
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
  const [tab, setTab] = useState<'general' | 'agente' | 'mercado' | 'licitaciones' | 'integraciones'>('general')

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

  // ── Licitaciones profile ────────────────────────────────────────
  const hasLicitModule = !!(user?.modules as any[])?.some((m: any) => m.tipo === 'licitaciones' || m.tipo === 'licitador')

  const [licitForm, setLicitForm] = useState({
    rut_empresa: '',
    razon_social: '',
    inscrito_chile_proveedores: false,
    rubros: [] as string[],
    regiones: [] as string[],
    descripcion: '',
    experiencia_anos: '',
    proyectos_anteriores: '',
    certificaciones: '',
    email_alertas: '',
    frecuencia_alertas: 'diaria',
    documentos: [] as { nombre: string; tipo: string; url: string }[],
  })
  const [licitSaved, setLicitSaved] = useState(false)
  const [newDoc, setNewDoc] = useState({ nombre: '', tipo: 'presentacion', url: '' })
  const [buscarRubro, setBuscarRubro] = useState('')
  const [activeSheet, setActiveSheet] = useState<string | null>(null)
  const openSheet = (k: string) => setActiveSheet(k)
  const closeSheet = () => setActiveSheet(null)

  const { data: licitProfile, isLoading: licitLoading } = useQuery({
    queryKey: ['licitaciones-profile'],
    queryFn: () => api.get('/tenant/me/licitaciones-profile').then(r => r.data),
    enabled: hasLicitModule && isAdmin,
  })

  const { data: licitCatalogos } = useQuery({
    queryKey: ['licitaciones-catalogos'],
    queryFn: () => api.get('/modules/licitaciones/catalogos').then(r => r.data),
    enabled: tab === 'licitaciones',
    staleTime: Infinity,
  })

  useEffect(() => {
    if (licitProfile) {
      setLicitForm({
        rut_empresa: licitProfile.rut_empresa || '',
        razon_social: licitProfile.razon_social || '',
        inscrito_chile_proveedores: licitProfile.inscrito_chile_proveedores || false,
        rubros: licitProfile.rubros || [],
        regiones: licitProfile.regiones || [],
        descripcion: licitProfile.descripcion || '',
        experiencia_anos: licitProfile.experiencia_anos?.toString() || '',
        proyectos_anteriores: licitProfile.proyectos_anteriores || '',
        certificaciones: licitProfile.certificaciones || '',
        email_alertas: licitProfile.email_alertas || '',
        frecuencia_alertas: licitProfile.frecuencia_alertas || 'diaria',
        documentos: licitProfile.documentos || [],
      })
    }
  }, [licitProfile])

  const licitCompleteness = useMemo(() => {
    let score = 0
    if (licitForm.rut_empresa) score += 15
    if (licitForm.rubros.length > 0) score += 20
    if (licitForm.regiones.length > 0) score += 15
    if (licitForm.descripcion) score += 20
    if (licitForm.inscrito_chile_proveedores) score += 10
    if (licitForm.experiencia_anos) score += 10
    if (licitForm.email_alertas) score += 10
    return score
  }, [licitForm])

  const saveLicitMutation = useMutation({
    mutationFn: (data: Record<string, any>) => api.put('/tenant/me/licitaciones-profile', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['licitaciones-profile'] })
      setLicitSaved(true)
      setTimeout(() => setLicitSaved(false), 3000)
    },
  })
  const handleSaveLicit = () => {
    saveLicitMutation.mutate({
      ...licitForm,
      experiencia_anos: licitForm.experiencia_anos ? parseInt(licitForm.experiencia_anos) : null,
    })
  }

  // ── Tabs config ────────────────────────────────────────────────────────
  const userModuleTypes = ((user?.modules as any[]) ?? []).map((m: any) => m.tipo)
  const hasAgentModule = userModuleTypes.some(t => ['adjudicadas','prospector','inmobiliaria'].includes(t))
  const hasAdjudicadas = userModuleTypes.includes('adjudicadas')
  const allTabs = [
    { id: 'general'       as const, label: 'General',         icon: User                                                                              },
    { id: 'agente'        as const, label: 'Agente IA',       icon: Bot,      adminOnly: true, requiresTenant: true, show: hasAgentModule            },
    { id: 'mercado'       as const, label: 'Mercado Público', icon: Tag,      adminOnly: true, requiresTenant: true, show: hasAdjudicadas             },
    { id: 'integraciones' as const, label: 'Integraciones',   icon: Key,      superOnly: true                                                        },
  ]
  const visibleTabs = allTabs.filter(t =>
    (!t.adminOnly || isAdmin) &&
    (!t.superOnly || isSuperAdmin) &&
    (!(t as any).requiresTenant || !!user?.tenant_id) &&
    ((t as any).show === undefined ? true : (t as any).show) &&
    (!(t as any).requiresModule || userModuleTypes.includes((t as any).requiresModule) || ((t as any).requiresModule === 'licitaciones' && userModuleTypes.includes('licitador')))
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
          {/* Tu perfil */}
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2"><User size={15} /> Tu perfil</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Nombre</span>
                <span className="text-sm font-medium text-gray-900">{user?.full_name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Email</span>
                <span className="text-sm font-medium text-gray-900">{user?.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Rol</span>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ROLE_STYLE[user?.role ?? ''] ?? 'bg-gray-100 text-gray-600'}`}>
                  {ROLE_LABEL[user?.role ?? ''] ?? user?.role}
                </span>
              </div>
            </div>
          </div>

          {/* Tu empresa */}
          {isAdmin && (
            <div className="card p-5 space-y-4">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Building2 size={15} /> Tu empresa</h2>
              {isLoading ? <p className="text-sm text-gray-400">Cargando...</p> : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Nombre</span>
                    <span className="text-sm font-medium text-gray-900">{tenantData?.name}</span>
                  </div>
                  {tenantData?.plan && tenantData.plan !== 'Sin plan' && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Plan</span>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-100 text-brand-700 capitalize">{tenantData.plan}</span>
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-sm text-gray-500 shrink-0">Módulos</span>
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      {tenantData?.modulos_activos?.length > 0
                        ? tenantData.modulos_activos.map((m: string) => (
                            <span key={m} className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                              {MODULE_LABELS[m] ?? m}
                            </span>
                          ))
                        : <span className="text-gray-400 text-xs">Ninguno activo</span>
                      }
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Herramientas IA — solo si el usuario tiene módulos de prospección/outreach */}
          {isAdmin && hasAgentModule && (
            <div className="card p-5 space-y-3">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Sparkles size={15} /> Herramientas IA</h2>
              <button
                onClick={() => setTab('agente')}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 hover:border-violet-300 hover:bg-violet-50 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center group-hover:bg-violet-200 transition-colors">
                    <Bot size={16} className="text-violet-600" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-gray-800">Agentes IA</p>
                    <p className="text-xs text-gray-500">Configura y prueba tus agentes de prospección</p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-gray-400 group-hover:text-violet-500 transition-colors" />
              </button>
            </div>
          )}
        </div>
      )}

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
            <div className="flex items-center gap-2 py-6 justify-center">
              <Loader2 size={18} className="text-violet-500 animate-spin" />
              <p className="text-sm text-gray-500">Cargando rubros...</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {(rubrosData?.todos ?? []).map((r: string) => {
                  const activo = rubrosSeleccionados.includes(r)
                  return (
                    <button key={r} onClick={() => {
                      const nuevos = activo
                        ? rubrosSeleccionados.filter(x => x !== r)
                        : [...rubrosSeleccionados, r]
                      if (nuevos.length === 0) { alert('Debes tener al menos 1 rubro habilitado.'); return }
                      setRubrosSeleccionados(nuevos)
                      saveRubrosMutation.mutate({ rubros: nuevos, resetear: false })
                    }}
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
              {saveRubrosMutation.isPending && (
                <p className="text-xs text-violet-500 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Guardando...</p>
              )}
            </>
          )}
            </>
          )}
        </div>
      )}

      {/* ── LICITACIONES ─────────────────────────────────────── */}
      {tab === 'licitaciones' && isAdmin && (
        <div className="space-y-3">
          {licitLoading ? (
            <div className="card p-10 text-center"><Loader2 size={20} className="animate-spin text-gray-400 mx-auto" /></div>
          ) : (
            <>
              {/* Barra de progreso */}
              <div className={`rounded-2xl p-4 border ${
                licitCompleteness >= 80 ? 'bg-emerald-50 border-emerald-100' :
                licitCompleteness >= 40 ? 'bg-amber-50 border-amber-100' :
                'bg-gray-50 border-gray-100'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-gray-800">Perfil de tu empresa</p>
                  <span className={`text-base font-bold tabular-nums ${
                    licitCompleteness >= 80 ? 'text-emerald-600' : licitCompleteness >= 40 ? 'text-amber-500' : 'text-gray-400'
                  }`}>{licitCompleteness}%</span>
                </div>
                <div className="w-full bg-white/70 rounded-full h-1.5 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${
                    licitCompleteness >= 80 ? 'bg-emerald-500' : licitCompleteness >= 40 ? 'bg-amber-400' : 'bg-gray-300'
                  }`} style={{ width: `${licitCompleteness}%` }} />
                </div>
                <p className="text-xs mt-2 text-gray-500">
                  {licitCompleteness >= 80
                    ? '✓ Listo — el sistema ya puede filtrar y generar propuestas para ti'
                    : licitCompleteness >= 40
                    ? 'Faltan descripción y experiencia para mejorar las propuestas de IA'
                    : 'Empieza por seleccionar tus rubros y la región donde operas'}
                </p>
              </div>

              {/* Lista de secciones — cada una abre su bottom sheet */}
              <div className="card divide-y divide-gray-100">

                {/* Datos */}
                <button onClick={() => openSheet('datos')} className="w-full flex items-center gap-3 px-4 py-4 text-left active:bg-gray-50">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                    <Building2 size={16} className="text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">Datos de la empresa</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {licitForm.rut_empresa ? licitForm.rut_empresa : 'RUT, razón social, ChileProveedores'}
                    </p>
                  </div>
                  {(licitForm.rut_empresa || licitForm.inscrito_chile_proveedores) && (
                    <CheckCircle size={15} className="text-emerald-500 shrink-0" />
                  )}
                  <ChevronRight size={16} className="text-gray-300 shrink-0" />
                </button>

                {/* Rubros */}
                <button onClick={() => openSheet('rubros')} className="w-full flex items-center gap-3 px-4 py-4 text-left active:bg-gray-50">
                  <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                    <Tag size={16} className="text-brand-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">Rubros</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {licitForm.rubros.length > 0
                        ? licitForm.rubros.slice(0, 3).join(', ') + (licitForm.rubros.length > 3 ? ` +${licitForm.rubros.length - 3}` : '')
                        : 'Sin seleccionar — importante para el filtro automático'}
                    </p>
                  </div>
                  {licitForm.rubros.length > 0 && (
                    <span className="text-xs font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full shrink-0">{licitForm.rubros.length}</span>
                  )}
                  <ChevronRight size={16} className="text-gray-300 shrink-0" />
                </button>

                {/* Regiones */}
                <button onClick={() => openSheet('regiones')} className="w-full flex items-center gap-3 px-4 py-4 text-left active:bg-gray-50">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                    <MapPin size={16} className="text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">Regiones</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {licitForm.regiones.length > 0
                        ? `${licitForm.regiones.length} región${licitForm.regiones.length > 1 ? 'es' : ''} seleccionada${licitForm.regiones.length > 1 ? 's' : ''}`
                        : '¿Dónde puedes prestar servicios?'}
                    </p>
                  </div>
                  {licitForm.regiones.length > 0 && (
                    <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full shrink-0">{licitForm.regiones.length}</span>
                  )}
                  <ChevronRight size={16} className="text-gray-300 shrink-0" />
                </button>

                {/* Descripción */}
                <button onClick={() => openSheet('descripcion')} className="w-full flex items-center gap-3 px-4 py-4 text-left active:bg-gray-50">
                  <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                    <Sparkles size={16} className="text-purple-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">Descripción y experiencia</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {licitForm.descripcion ? licitForm.descripcion.slice(0, 60) + '...' : 'La IA usa esto para generar propuestas'}
                    </p>
                  </div>
                  {licitForm.descripcion && <CheckCircle size={15} className="text-emerald-500 shrink-0" />}
                  <ChevronRight size={16} className="text-gray-300 shrink-0" />
                </button>

                {/* Documentos */}
                <button onClick={() => openSheet('documentos')} className="w-full flex items-center gap-3 px-4 py-4 text-left active:bg-gray-50">
                  <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                    <FileText size={16} className="text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">Documentos</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {licitForm.documentos.length > 0
                        ? `${licitForm.documentos.length} documento${licitForm.documentos.length > 1 ? 's' : ''} cargado${licitForm.documentos.length > 1 ? 's' : ''}`
                        : 'PDF, LinkedIn, presentación, catálogo...'}
                    </p>
                  </div>
                  {licitForm.documentos.length > 0 && (
                    <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">{licitForm.documentos.length}</span>
                  )}
                  <ChevronRight size={16} className="text-gray-300 shrink-0" />
                </button>

                {/* Alertas */}
                <button onClick={() => openSheet('alertas')} className="w-full flex items-center gap-3 px-4 py-4 text-left active:bg-gray-50">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                    <Mail size={16} className="text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">Alertas por email</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {licitForm.email_alertas ? `${licitForm.email_alertas} · ${licitForm.frecuencia_alertas}` : 'Recibe avisos de nuevas licitaciones'}
                    </p>
                  </div>
                  {licitForm.email_alertas && <CheckCircle size={15} className="text-emerald-500 shrink-0" />}
                  <ChevronRight size={16} className="text-gray-300 shrink-0" />
                </button>
              </div>

              {/* Botón guardar */}
              <div className="pb-2">
                {licitSaved && (
                  <div className="flex items-center justify-center gap-1.5 text-sm text-emerald-600 font-medium mb-3">
                    <CheckCircle size={15} /> Perfil guardado correctamente
                  </div>
                )}
                <button onClick={handleSaveLicit} disabled={saveLicitMutation.isPending}
                  className="btn-primary w-full py-3.5 flex items-center justify-center gap-2 text-sm font-semibold disabled:opacity-40">
                  <Save size={15} />
                  {saveLicitMutation.isPending ? 'Guardando...' : 'Guardar perfil'}
                </button>
              </div>

              {/* ── Bottom Sheets ── */}

              <BottomSheet open={activeSheet === 'datos'} onClose={closeSheet} title="Datos de la empresa">
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">RUT empresa</label>
                    <input className="input text-sm w-full" placeholder="76.123.456-7" value={licitForm.rut_empresa}
                      onChange={e => setLicitForm(f => ({ ...f, rut_empresa: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Razón social</label>
                    <input className="input text-sm w-full" placeholder="Constructora XYZ SpA" value={licitForm.razon_social}
                      onChange={e => setLicitForm(f => ({ ...f, razon_social: e.target.value }))} />
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer py-2.5 px-3 rounded-xl border border-gray-100 active:bg-gray-50">
                    <input type="checkbox" className="rounded w-4 h-4 shrink-0" checked={licitForm.inscrito_chile_proveedores}
                      onChange={e => setLicitForm(f => ({ ...f, inscrito_chile_proveedores: e.target.checked }))} />
                    <div>
                      <p className="text-sm font-medium text-gray-800">Inscrito en ChileProveedores</p>
                      <p className="text-xs text-gray-400">Requisito para postular licitaciones del Estado</p>
                    </div>
                  </label>
                </div>
                <button onClick={closeSheet} className="btn-primary w-full py-3 text-sm font-semibold">Listo</button>
              </BottomSheet>

              <BottomSheet open={activeSheet === 'rubros'} onClose={closeSheet} title="Rubros de tu empresa">
                {/* Chips de seleccionados */}
                {licitForm.rubros.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pb-1">
                    {licitForm.rubros.map(r => (
                      <span key={r} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-brand-600 text-white capitalize">
                        {r}
                        <button onClick={() => setLicitForm(f => ({ ...f, rubros: f.rubros.filter(x => x !== r) }))} className="opacity-80 hover:opacity-100 ml-0.5">✕</button>
                      </span>
                    ))}
                    <button onClick={() => setLicitForm(f => ({ ...f, rubros: [] }))} className="px-2.5 py-1 rounded-full text-xs text-gray-400 border border-gray-200 hover:border-red-200 hover:text-red-400">Limpiar todo</button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 text-center py-1">Selecciona los rubros donde opera tu empresa</p>
                )}

                {/* Búsqueda rápida */}
                <div className="relative">
                  <input className="input text-sm w-full pl-9" placeholder="Buscar rubro..." value={buscarRubro}
                    onChange={e => setBuscarRubro(e.target.value)} />
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  {buscarRubro && (
                    <button onClick={() => setBuscarRubro('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                      <X size={13} />
                    </button>
                  )}
                </div>

                {/* Categorías colapsables */}
                {buscarRubro ? (
                  // Modo búsqueda: lista plana filtrada
                  <div className="grid grid-cols-3 gap-1">
                    {RUBRO_CATEGORIAS.flatMap(c => c.rubros)
                      .filter(r => r.includes(buscarRubro.toLowerCase()))
                      .map(r => {
                        const activo = licitForm.rubros.includes(r)
                        return (
                          <button key={r} onClick={() => setLicitForm(f => ({ ...f, rubros: activo ? f.rubros.filter(x => x !== r) : [...f.rubros, r] }))}
                            className={`py-2 rounded-lg text-[11px] font-medium border capitalize transition-colors text-center leading-tight ${
                              activo ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 active:bg-gray-50'
                            }`}>{r}</button>
                        )
                      })}
                  </div>
                ) : (
                  // Modo normal: categorías
                  <div className="space-y-1.5">
                    {RUBRO_CATEGORIAS.map(cat => (
                      <RubroCategoria
                        key={cat.label}
                        cat={cat}
                        seleccionados={licitForm.rubros}
                        onToggle={r => setLicitForm(f => ({ ...f, rubros: f.rubros.includes(r) ? f.rubros.filter(x => x !== r) : [...f.rubros, r] }))}
                      />
                    ))}
                  </div>
                )}
                <button onClick={closeSheet} className="btn-primary w-full py-3 text-sm font-semibold">Listo</button>
              </BottomSheet>

              <BottomSheet open={activeSheet === 'regiones'} onClose={closeSheet} title="Regiones donde operas">
                <div className="flex gap-2">
                  <button onClick={() => setLicitForm(f => ({ ...f, regiones: licitCatalogos?.regiones.map((r: any) => r.codigo) ?? [] }))}
                    className="flex-1 py-2 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg active:bg-indigo-50">Todas</button>
                  <button onClick={() => setLicitForm(f => ({ ...f, regiones: [] }))}
                    className="flex-1 py-2 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg active:bg-gray-50">Limpiar</button>
                </div>
                {!licitCatalogos ? (
                  <p className="text-xs text-gray-400 flex items-center gap-1 justify-center py-4"><Loader2 size={11} className="animate-spin" /> Cargando...</p>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5">
                    {[...(licitCatalogos?.regiones ?? [])]
                      .sort((a: any, b: any) => REGION_ORDER.indexOf(a.codigo) - REGION_ORDER.indexOf(b.codigo))
                      .map((r: { codigo: string; nombre: string }) => {
                        const activo = licitForm.regiones.includes(r.codigo)
                        return (
                          <button key={r.codigo} onClick={() => setLicitForm(f => ({ ...f, regiones: activo ? f.regiones.filter(x => x !== r.codigo) : [...f.regiones, r.codigo] }))}
                            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium transition-colors text-left ${
                              activo ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-200 active:bg-gray-50'
                            }`}>
                            <span className={`w-3.5 h-3.5 rounded border-2 shrink-0 flex items-center justify-center ${
                              activo ? 'bg-white border-white' : 'border-gray-300'
                            }`}>
                              {activo && <span className="block w-1.5 h-1.5 rounded-sm bg-indigo-600" />}
                            </span>
                            {r.nombre}
                          </button>
                        )
                      })}
                  </div>
                )}
                <button onClick={closeSheet} className="btn-primary w-full py-3 text-sm font-semibold">Listo</button>
              </BottomSheet>

              <BottomSheet open={activeSheet === 'descripcion'} onClose={closeSheet} title="Descripción y experiencia">
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">¿Qué hace tu empresa?</label>
                    <textarea className="input text-sm resize-none w-full" rows={3}
                      placeholder="Ej: Empresa de aseo con 35 colaboradores, trabajamos con edificios y clínicas en Santiago."
                      value={licitForm.descripcion} onChange={e => setLicitForm(f => ({ ...f, descripcion: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Años en el rubro</label>
                    <input className="input text-sm w-full" type="number" min="0" placeholder="Ej: 8"
                      value={licitForm.experiencia_anos} onChange={e => setLicitForm(f => ({ ...f, experiencia_anos: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Certificaciones <span className="text-gray-400 font-normal">— opcional</span></label>
                    <input className="input text-sm w-full" placeholder="ISO 9001, Certificado SEC..."
                      value={licitForm.certificaciones} onChange={e => setLicitForm(f => ({ ...f, certificaciones: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Contratos anteriores <span className="text-gray-400 font-normal">— opcional</span></label>
                    <textarea className="input text-sm resize-none w-full" rows={2}
                      placeholder="Hospital de Rancagua (2023), Municipalidad de Quilpué (2022)"
                      value={licitForm.proyectos_anteriores} onChange={e => setLicitForm(f => ({ ...f, proyectos_anteriores: e.target.value }))} />
                  </div>
                </div>
                <button onClick={closeSheet} className="btn-primary w-full py-3 text-sm font-semibold">Listo</button>
              </BottomSheet>

              <BottomSheet open={activeSheet === 'documentos'} onClose={closeSheet} title="Documentos de referencia">
                {licitForm.documentos.map((doc, i) => (
                  <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-3">
                    <Link size={14} className="text-gray-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{doc.nombre}</p>
                      <p className="text-xs text-gray-400 truncate">{DOC_TIPOS.find(t => t.value === doc.tipo)?.label} · {doc.url}</p>
                    </div>
                    <button onClick={() => setLicitForm(f => ({ ...f, documentos: f.documentos.filter((_, j) => j !== i) }))} className="text-gray-300 hover:text-red-400 p-1">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <div className="border border-dashed border-gray-200 rounded-xl p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Tipo</label>
                    <select className="input text-sm w-full" value={newDoc.tipo} onChange={e => setNewDoc(d => ({ ...d, tipo: e.target.value }))}>
                      {DOC_TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <p className="text-xs text-gray-400 mt-1">{DOC_TIPOS.find(t => t.value === newDoc.tipo)?.hint}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Nombre <span className="text-gray-400 font-normal">— opcional</span></label>
                    <input className="input text-sm w-full" placeholder="Ej: Presentación 2025" value={newDoc.nombre}
                      onChange={e => setNewDoc(d => ({ ...d, nombre: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">URL</label>
                    <input className="input text-sm w-full" placeholder="https://drive.google.com/..." value={newDoc.url}
                      onChange={e => setNewDoc(d => ({ ...d, url: e.target.value }))} />
                  </div>
                  <button onClick={() => {
                    if (!newDoc.url.trim()) return
                    setLicitForm(f => ({ ...f, documentos: [...f.documentos, { ...newDoc, nombre: newDoc.nombre || DOC_TIPOS.find(t => t.value === newDoc.tipo)?.label || newDoc.tipo }] }))
                    setNewDoc(d => ({ ...d, nombre: '', url: '' }))
                  }} disabled={!newDoc.url.trim()}
                    className="w-full py-2.5 text-sm font-medium text-brand-600 border border-brand-200 rounded-xl flex items-center justify-center gap-1.5 active:bg-brand-50 disabled:opacity-40">
                    <Plus size={14} /> Agregar
                  </button>
                </div>
                <button onClick={closeSheet} className="btn-primary w-full py-3 text-sm font-semibold">Listo</button>
              </BottomSheet>

              <BottomSheet open={activeSheet === 'alertas'} onClose={closeSheet} title="Alertas por email">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Email para alertas</label>
                    <input className="input text-sm w-full" type="email" placeholder="tu@empresa.cl"
                      value={licitForm.email_alertas} onChange={e => setLicitForm(f => ({ ...f, email_alertas: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Frecuencia</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[{ v: 'diaria', l: 'Diaria' }, { v: 'semanal', l: 'Semanal' }, { v: 'nunca', l: 'Apagadas' }].map(opt => (
                        <button key={opt.v} onClick={() => setLicitForm(f => ({ ...f, frecuencia_alertas: opt.v }))}
                          className={`py-3 text-sm font-medium rounded-xl border transition-colors ${
                            licitForm.frecuencia_alertas === opt.v
                              ? 'bg-gray-900 text-white border-gray-900'
                              : 'bg-white text-gray-600 border-gray-200 active:bg-gray-50'
                          }`}>{opt.l}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <button onClick={closeSheet} className="btn-primary w-full py-3 text-sm font-semibold">Listo</button>
              </BottomSheet>
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

