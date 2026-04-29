import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/client'
import toast from 'react-hot-toast'
import { Bot, Building2, Target, Mic2, Users, Calendar, ChevronRight, ChevronLeft, Check } from 'lucide-react'
import clsx from 'clsx'

// ── Tipos ──────────────────────────────────────────────────────────────────

interface AgentConfig {
  agent_name: string
  product: string
  target: string
  value_prop: string
  extra_context: string
  tone: 'informal' | 'professional' | 'formal'
  ideal_industry: string
  ideal_role: string
  ideal_size: 'small' | 'medium' | 'large' | 'any'
  module: string
  meeting_type: 'video' | 'in_person' | 'phone' | 'prospect_chooses'
  onboarding_completed: boolean
}

const INDUSTRIES = [
  'Construcción e Infraestructura',
  'Tecnología y Software',
  'Salud y Medicina',
  'Retail y Comercio',
  'Servicios Profesionales',
  'Manufactura e Industrial',
  'Inmobiliario',
  'Educación',
  'Marketing y Publicidad',
  'Financiero y Seguros',
  'Otra',
]

const MODULES = [
  { value: 'licitador_b', label: 'Licitador B', desc: 'Quiero vender a empresas que ganaron licitaciones' },
  { value: 'prospector', label: 'Prospector', desc: 'Quiero encontrar y contactar nuevos clientes' },
  { value: 'licitador_a', label: 'Licitador A', desc: 'Quiero ganar licitaciones públicas' },
]

// ── Componentes de pasos ──────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={clsx(
            'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all',
            i < current ? 'bg-kap-600 text-white' :
            i === current ? 'bg-kap-100 text-kap-700 ring-2 ring-kap-400' :
            'bg-ink-2 text-ink-4'
          )}>
            {i < current ? <Check size={14} /> : i + 1}
          </div>
          {i < total - 1 && (
            <div className={clsx('h-0.5 w-8 transition-all', i < current ? 'bg-kap-400' : 'bg-ink-3')} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────

export default function OnboardingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<AgentConfig>({
    agent_name: '',
    product: '',
    target: '',
    value_prop: '',
    extra_context: '',
    tone: 'professional',
    ideal_industry: '',
    ideal_role: '',
    ideal_size: 'any',
    module: '',
    meeting_type: 'prospect_chooses',
    onboarding_completed: false,
  })

  const set = (field: keyof AgentConfig, value: any) =>
    setConfig(prev => ({ ...prev, [field]: value }))

  const canNext = () => {
    if (step === 0) return config.agent_name.trim().length > 0
    if (step === 1) return config.product.trim().length > 0 && config.target.trim().length > 0 && config.value_prop.trim().length > 0
    if (step === 2) return config.tone !== undefined
    if (step === 3) return config.ideal_industry.length > 0 && config.ideal_role.trim().length > 0
    if (step === 4) return config.module.length > 0
    return true
  }

  const handleFinish = async () => {
    setSaving(true)
    try {
      await api.put('/tenant/me/agent-config', { ...config, onboarding_completed: true })
      toast.success(`¡${config.agent_name} está listo para trabajar!`)
      // Licitador A → completar perfil IA antes de buscar licitaciones
      if (config.module === 'licitador_a') {
        navigate('/licitaciones/perfil')
      } else {
        navigate('/dashboard')
      }
    } catch {
      toast.error('Error al guardar la configuración')
    } finally {
      setSaving(false)
    }
  }

  const STEPS = [
    // PASO 1 — Nombre
    <div key="step-0" className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 bg-kap-100 rounded-xl flex items-center justify-center">
          <Bot size={20} className="text-kap-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-ink-9">Tu agente de ventas</h2>
          <p className="text-sm text-ink-5">Dale un nombre a tu asistente IA</p>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-ink-7 mb-2">
          ¿Cómo se llama tu agente?
        </label>
        <input
          autoFocus
          value={config.agent_name}
          onChange={e => set('agent_name', e.target.value)}
          placeholder="Ej: Sofía, Carlos, Max..."
          className="input text-lg"
        />
        <p className="text-xs text-ink-4 mt-2">
          Este nombre aparecerá en las conversaciones con tus prospectos.
        </p>
      </div>
      {config.agent_name && (
        <div className="bg-kap-50 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-kap-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
            {config.agent_name[0].toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-kap-900">{config.agent_name}</p>
            <p className="text-xs text-kap-600">Tu agente de ventas · Listo para trabajar</p>
          </div>
        </div>
      )}
    </div>,

    // PASO 2 — Negocio
    <div key="step-1" className="space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
          <Building2 size={20} className="text-blue-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-ink-9">Tu negocio</h2>
          <p className="text-sm text-ink-5">Cuéntale a {config.agent_name || 'tu agente'} qué vendes</p>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-ink-7 mb-1.5">¿Qué vendes? *</label>
        <input value={config.product} onChange={e => set('product', e.target.value)}
          placeholder="Ej: Servicios de instalación eléctrica industrial"
          className="input" />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink-7 mb-1.5">¿A quién le vendes? *</label>
        <input value={config.target} onChange={e => set('target', e.target.value)}
          placeholder="Ej: Gerentes de Operaciones de empresas constructoras"
          className="input" />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink-7 mb-1.5">¿Tu propuesta de valor en una frase? *</label>
        <input value={config.value_prop} onChange={e => set('value_prop', e.target.value)}
          placeholder="Ej: Completamos proyectos eléctricos en la mitad del tiempo"
          className="input" />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink-7 mb-1.5">
          Algo más que {config.agent_name || 'tu agente'} deba saber <span className="text-ink-4 font-normal">(opcional)</span>
        </label>
        <textarea value={config.extra_context} onChange={e => set('extra_context', e.target.value)}
          placeholder="Ej: Solo trabajamos en Santiago. Mínimo 50 UF por proyecto."
          rows={2} className="input resize-none" />
      </div>
    </div>,

    // PASO 3 — Tono
    <div key="step-2" className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
          <Mic2 size={20} className="text-amber-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-ink-9">El tono de {config.agent_name || 'tu agente'}</h2>
          <p className="text-sm text-ink-5">¿Cómo habla con tus prospectos?</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {[
          { value: 'informal', emoji: '😊', label: 'Cercano e informal', desc: 'Tutea al prospecto. Directo, simple y humano.' },
          { value: 'professional', emoji: '💼', label: 'Profesional y directo', desc: 'Educado pero sin rodeos. Equilibrio perfecto.' },
          { value: 'formal', emoji: '🎓', label: 'Formal y técnico', desc: 'Lenguaje corporativo. Para industrias serias.' },
        ].map(opt => (
          <button key={opt.value} onClick={() => set('tone', opt.value)}
            className={clsx(
              'flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all',
              config.tone === opt.value
                ? 'border-kap-300 bg-kap-50'
                : 'border-ink-3 hover:border-ink-3 bg-white'
            )}>
            <span className="text-2xl">{opt.emoji}</span>
            <div>
              <p className={clsx('font-semibold', config.tone === opt.value ? 'text-kap-700' : 'text-ink-9')}>
                {opt.label}
              </p>
              <p className="text-sm text-ink-5">{opt.desc}</p>
            </div>
            {config.tone === opt.value && (
              <Check size={18} className="text-kap-600 ml-auto shrink-0" />
            )}
          </button>
        ))}
      </div>
    </div>,

    // PASO 4 — Cliente ideal
    <div key="step-3" className="space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
          <Target size={20} className="text-emerald-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-ink-9">Tu cliente ideal</h2>
          <p className="text-sm text-ink-5">{config.agent_name || 'Tu agente'} calificará prospectos según esto</p>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-ink-7 mb-2">¿En qué industria están tus mejores clientes? *</label>
        <div className="grid grid-cols-2 gap-2">
          {INDUSTRIES.map(ind => (
            <button key={ind} onClick={() => set('ideal_industry', ind)}
              className={clsx(
                'text-sm text-left px-3 py-2 rounded-lg border transition-all',
                config.ideal_industry === ind
                  ? 'border-kap-300 bg-kap-50 text-kap-700 font-medium'
                  : 'border-ink-3 text-ink-7 hover:border-ink-3'
              )}>
              {ind}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-ink-7 mb-1.5">¿Qué cargo tiene quien decide la compra? *</label>
        <input value={config.ideal_role} onChange={e => set('ideal_role', e.target.value)}
          placeholder="Ej: Gerente de Operaciones, CEO, Dueño..."
          className="input" />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink-7 mb-2">¿Qué tamaño de empresa buscas?</label>
        <div className="flex gap-2">
          {[
            { value: 'small', label: 'Pequeña', sub: '1–10' },
            { value: 'medium', label: 'Mediana', sub: '11–100' },
            { value: 'large', label: 'Grande', sub: '100+' },
            { value: 'any', label: 'Cualquiera', sub: '' },
          ].map(opt => (
            <button key={opt.value} onClick={() => set('ideal_size', opt.value)}
              className={clsx(
                'flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-all',
                config.ideal_size === opt.value
                  ? 'border-kap-300 bg-kap-50 text-kap-700'
                  : 'border-ink-3 text-ink-6 hover:border-ink-3'
              )}>
              {opt.label}
              {opt.sub && <span className="block text-xs font-normal text-ink-4">{opt.sub}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>,

    // PASO 5 — Módulo y reuniones
    <div key="step-4" className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
          <Calendar size={20} className="text-purple-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-ink-9">Módulo y reuniones</h2>
          <p className="text-sm text-ink-5">Casi listo — últimos detalles</p>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-ink-7 mb-2">¿Cuál es tu objetivo principal? *</label>
        <div className="space-y-2">
          {MODULES.map(mod => (
            <button key={mod.value} onClick={() => set('module', mod.value)}
              className={clsx(
                'w-full flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all',
                config.module === mod.value
                  ? 'border-kap-300 bg-kap-50'
                  : 'border-ink-3 hover:border-ink-3'
              )}>
              <div className="flex-1">
                <p className={clsx('font-semibold', config.module === mod.value ? 'text-kap-700' : 'text-ink-9')}>
                  {mod.label}
                </p>
                <p className="text-sm text-ink-5">{mod.desc}</p>
              </div>
              {config.module === mod.value && <Check size={18} className="text-kap-600 shrink-0 mt-0.5" />}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-ink-7 mb-2">¿Cómo prefieres reunirte con clientes?</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: 'video', label: '📹 Videollamada' },
            { value: 'in_person', label: '🤝 Presencial' },
            { value: 'phone', label: '📞 Llamada telefónica' },
            { value: 'prospect_chooses', label: '🙋 El cliente elige' },
          ].map(opt => (
            <button key={opt.value} onClick={() => set('meeting_type', opt.value)}
              className={clsx(
                'py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all',
                config.meeting_type === opt.value
                  ? 'border-kap-300 bg-kap-50 text-kap-700'
                  : 'border-ink-3 text-ink-7 hover:border-ink-3'
              )}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-kap-100 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-kap-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Bot size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-ink-9">Configura tu agente</h1>
          <p className="text-ink-5 mt-1">En 5 pasos tu IA está lista para vender</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <StepIndicator current={step} total={5} />
          {STEPS[step]}
        </div>

        {/* Navegación */}
        <div className="flex items-center justify-between mt-6">
          <button
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
            className="flex items-center gap-2 text-sm text-ink-6 hover:text-ink-9 disabled:opacity-0 transition-colors"
          >
            <ChevronLeft size={16} /> Anterior
          </button>

          <span className="text-xs text-ink-4">{step + 1} de 5</span>

          {step < 4 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canNext()}
              className="flex items-center gap-2 btn-primary disabled:opacity-40"
            >
              Siguiente <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={!canNext() || saving}
              className="flex items-center gap-2 btn-primary disabled:opacity-40"
            >
              {saving ? 'Guardando...' : `¡Activar a ${config.agent_name || 'mi agente'}!`}
              {!saving && <Check size={16} />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
