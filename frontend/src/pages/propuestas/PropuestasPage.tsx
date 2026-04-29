import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import api from '../../api/client'
import toast from 'react-hot-toast'
import {
  Sparkles, FileText, Copy, Download, ChevronRight, ChevronLeft,
  Building2, User, DollarSign, FileCheck, Loader2, CheckCircle2, RotateCcw,
} from 'lucide-react'
import clsx from 'clsx'

type TipoDoc = 'cotizacion' | 'propuesta' | 'carta'

const TIPOS: { id: TipoDoc; label: string; desc: string; emoji: string }[] = [
  { id: 'cotizacion', label: 'Cotización', desc: 'Detalle de precios y condiciones para un servicio específico', emoji: '💰' },
  { id: 'propuesta', label: 'Propuesta Comercial', desc: 'Presentación formal de tu empresa y solución para el cliente', emoji: '📋' },
  { id: 'carta', label: 'Carta de Presentación', desc: 'Carta corta para primer contacto o seguimiento', emoji: '✉️' },
]

interface FormData {
  tipo: TipoDoc | ''
  // Datos del cliente
  empresa_cliente: string
  contacto_nombre: string
  rubro: string
  licitacion_nombre: string
  monto_licitacion: string
  region: string
  // Datos del vendedor
  mi_empresa: string
  mi_nombre: string
  mi_servicio: string
  mi_descripcion: string
}

const INITIAL: FormData = {
  tipo: '',
  empresa_cliente: '',
  contacto_nombre: '',
  rubro: '',
  licitacion_nombre: '',
  monto_licitacion: '',
  region: '',
  mi_empresa: '',
  mi_nombre: '',
  mi_servicio: '',
  mi_descripcion: '',
}

const STEPS = ['Tipo', 'Cliente', 'Tu empresa', 'Generar']

export default function PropuestasPage() {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormData>(INITIAL)
  const [resultado, setResultado] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [pipelineCardId, setPipelineCardId] = useState('')

  // Cargar cards del pipeline para sugerir cliente
  const { data: pipelineData } = useQuery({
    queryKey: ['pipeline-cards-propuestas'],
    queryFn: () => api.get('/modules/adjudicadas/pipeline').then(r => r.data),
  })
  const todasLasCards: any[] = (pipelineData?.etapas ?? []).flatMap((e: any) => e.cards ?? [])

  const generarMutation = useMutation({
    mutationFn: () => api.post('/modules/propuestas/generar', form).then(r => r.data),
    onSuccess: (data) => {
      setResultado(data.texto ?? data.propuesta ?? JSON.stringify(data))
      setStep(4)
    },
    onError: () => toast.error('Error al generar. Intenta de nuevo.'),
  })

  const set = (field: keyof FormData, value: string) =>
    setForm(f => ({ ...f, [field]: value }))

  const puedeAvanzar = () => {
    if (step === 0) return !!form.tipo
    if (step === 1) return !!form.empresa_cliente
    if (step === 2) return !!form.mi_empresa
    return true
  }

  const copiar = () => {
    navigator.clipboard.writeText(resultado)
    setCopiado(true)
    toast.success('Copiado al portapapeles')
    setTimeout(() => setCopiado(false), 2500)
  }

  const reiniciar = () => {
    setForm(INITIAL)
    setResultado('')
    setStep(0)
  }

  // ─── Paso 0: Tipo de documento ────────────────────────────────────────────
  const renderTipo = () => (
    <div className="space-y-3">
      <p className="text-sm text-ink-5 mb-4">¿Qué documento necesitas generar?</p>
      {TIPOS.map(t => (
        <button
          key={t.id}
          onClick={() => set('tipo', t.id)}
          className={clsx(
            'w-full flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all',
            form.tipo === t.id
              ? 'border-kap-300 bg-kap-100'
              : 'border-ink-3 hover:border-kap-300 hover:bg-ink-1'
          )}
        >
          <span className="text-2xl mt-0.5">{t.emoji}</span>
          <div>
            <p className={clsx('font-semibold text-sm', form.tipo === t.id ? 'text-kap-600' : 'text-ink-8')}>
              {t.label}
            </p>
            <p className="text-xs text-ink-5 mt-0.5">{t.desc}</p>
          </div>
          {form.tipo === t.id && <CheckCircle2 size={18} className="ml-auto text-kap-600 shrink-0 mt-0.5" />}
        </button>
      ))}
    </div>
  )

  // ─── Paso 1: Datos del cliente ────────────────────────────────────────────
  const renderCliente = () => (
    <div className="space-y-4">
      {/* Sugerencia desde pipeline */}
      {todasLasCards.length > 0 && (
        <div className="bg-kap-100 border border-kap-300 rounded-xl p-3.5 space-y-2">
          <p className="text-xs font-semibold text-kap-600 flex items-center gap-1.5">
            <Sparkles size={13} /> Cargar desde Pipeline
          </p>
          <p className="text-[11px] text-kap-600">Selecciona una empresa de tu pipeline y pre-llenamos los datos automáticamente.</p>
          <select
            className="input text-xs py-1.5 border-kap-300 focus:ring-kap-300"
            value={pipelineCardId}
            onChange={e => {
              const id = e.target.value
              setPipelineCardId(id)
              if (!id) return
              const card = todasLasCards.find((c: any) => c.card_id === id)
              if (!card) return
              setForm(f => ({
                ...f,
                empresa_cliente: card.empresa || f.empresa_cliente,
                contacto_nombre: card.contact_name || f.contacto_nombre,
                licitacion_nombre: card.licitacion_nombre || card.nombre || f.licitacion_nombre,
                monto_licitacion: card.monto_adjudicado ? String(card.monto_adjudicado) : f.monto_licitacion,
                region: card.region || f.region,
              }))
            }}
          >
            <option value="">— Elegir empresa del pipeline —</option>
            {todasLasCards.map((c: any) => (
              <option key={c.card_id} value={c.card_id}>{c.empresa} {c.rut ? `· ${c.rut}` : ''}</option>
            ))}
          </select>
        </div>
      )}

      <p className="text-sm text-ink-5">Datos de la empresa a quien le envías el documento.</p>
      <div>
        <label className="text-xs font-medium text-ink-6 mb-1 block">Empresa cliente *</label>
        <div className="relative">
          <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
          <input
            className="input pl-9" placeholder="Ej: Municipalidad de Vitacura"
            value={form.empresa_cliente}
            onChange={e => set('empresa_cliente', e.target.value)}
          />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-ink-6 mb-1 block">Nombre de contacto</label>
        <div className="relative">
          <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
          <input
            className="input pl-9" placeholder="Ej: María González"
            value={form.contacto_nombre}
            onChange={e => set('contacto_nombre', e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-ink-6 mb-1 block">Rubro</label>
          <input
            className="input" placeholder="Ej: Construcción"
            value={form.rubro}
            onChange={e => set('rubro', e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-ink-6 mb-1 block">Región</label>
          <input
            className="input" placeholder="Ej: Región Metropolitana"
            value={form.region}
            onChange={e => set('region', e.target.value)}
          />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-ink-6 mb-1 block">Nombre de la licitación / proyecto</label>
        <input
          className="input" placeholder="Ej: Adquisición de equipos informáticos 2026"
          value={form.licitacion_nombre}
          onChange={e => set('licitacion_nombre', e.target.value)}
        />
      </div>
      <div>
        <label className="text-xs font-medium text-ink-6 mb-1 block">Monto adjudicado</label>
        <div className="relative">
          <DollarSign size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
          <input
            className="input pl-9" placeholder="Ej: 5000000"
            value={form.monto_licitacion}
            onChange={e => set('monto_licitacion', e.target.value)}
          />
        </div>
      </div>
    </div>
  )

  // ─── Paso 2: Datos de mi empresa ──────────────────────────────────────────
  const renderMiEmpresa = () => (
    <div className="space-y-4">
      <p className="text-sm text-ink-5 mb-4">Información sobre tu empresa que aparecerá en el documento.</p>
      <div>
        <label className="text-xs font-medium text-ink-6 mb-1 block">Mi empresa *</label>
        <input
          className="input" placeholder="Ej: Seguros y Garantías Chile SpA"
          value={form.mi_empresa}
          onChange={e => set('mi_empresa', e.target.value)}
        />
      </div>
      <div>
        <label className="text-xs font-medium text-ink-6 mb-1 block">Tu nombre</label>
        <input
          className="input" placeholder="Ej: Carlos Pérez"
          value={form.mi_nombre}
          onChange={e => set('mi_nombre', e.target.value)}
        />
      </div>
      <div>
        <label className="text-xs font-medium text-ink-6 mb-1 block">Servicio o producto que ofreces</label>
        <input
          className="input" placeholder="Ej: Pólizas de garantía y seguros de cumplimiento"
          value={form.mi_servicio}
          onChange={e => set('mi_servicio', e.target.value)}
        />
      </div>
      <div>
        <label className="text-xs font-medium text-ink-6 mb-1 block">Descripción breve de tu empresa / propuesta de valor</label>
        <textarea
          className="input resize-none" rows={3}
          placeholder="Ej: Somos especialistas en pólizas de garantía para licitaciones del Estado. Ofrecemos respuesta en 24 horas y los mejores precios del mercado."
          value={form.mi_descripcion}
          onChange={e => set('mi_descripcion', e.target.value)}
        />
      </div>
    </div>
  )

  // ─── Paso 3: Revisar y generar ────────────────────────────────────────────
  const renderResumen = () => {
    const tipoLabel = TIPOS.find(t => t.id === form.tipo)?.label ?? ''
    const items = [
      { label: 'Tipo de documento', value: tipoLabel },
      { label: 'Empresa cliente', value: form.empresa_cliente },
      { label: 'Contacto', value: form.contacto_nombre || '—' },
      { label: 'Licitación', value: form.licitacion_nombre || '—' },
      { label: 'Monto', value: form.monto_licitacion && !isNaN(Number(form.monto_licitacion)) ? `$${Number(form.monto_licitacion).toLocaleString('es-CL')}` : '—' },
      { label: 'Mi empresa', value: form.mi_empresa },
      { label: 'Servicio', value: form.mi_servicio || '—' },
    ]
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-5">Revisa los datos antes de generar.</p>
        <div className="bg-ink-1 rounded-xl border border-ink-3 divide-y divide-ink-2">
          {items.map(i => (
            <div key={i.label} className="flex justify-between items-start px-4 py-2.5 gap-4">
              <span className="text-xs text-ink-5 shrink-0">{i.label}</span>
              <span className="text-xs font-medium text-ink-8 text-right">{i.value}</span>
            </div>
          ))}
        </div>
        <div className="bg-kap-100 border border-kap-300 rounded-xl p-4 flex items-start gap-3">
          <Sparkles size={18} className="text-kap-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-kap-600">IA generará tu documento</p>
            <p className="text-xs text-kap-600 mt-0.5">Se creará un {tipoLabel.toLowerCase()} personalizado basado en los datos ingresados. Podrás editarlo y copiarlo.</p>
          </div>
        </div>
      </div>
    )
  }

  // ─── Resultado ────────────────────────────────────────────────────────────
  const renderResultado = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-emerald-600">
        <CheckCircle2 size={18} />
        <p className="text-sm font-semibold">Documento generado exitosamente</p>
      </div>
      <div className="bg-ink-1 border border-ink-3 rounded-xl p-4">
        <pre className="text-xs text-ink-7 whitespace-pre-wrap font-sans leading-relaxed">{resultado}</pre>
      </div>
      <div className="flex gap-2">
        <button
          onClick={copiar}
          className={clsx(
            'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all',
            copiado
              ? 'bg-emerald-500 text-white'
              : 'bg-kap-100 hover:bg-kap-100 text-white'
          )}
        >
          {copiado ? <><CheckCircle2 size={15} /> Copiado</> : <><Copy size={15} /> Copiar documento</>}
        </button>
        <button
          onClick={reiniciar}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-ink-6 bg-ink-2 hover:bg-ink-3 transition-colors"
        >
          <RotateCcw size={15} /> Nuevo
        </button>
      </div>
    </div>
  )

  const stepContent = [renderTipo, renderCliente, renderMiEmpresa, renderResumen]

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-kap-100 rounded-xl flex items-center justify-center">
          <FileText size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-ink-9">Propuestas Comerciales</h1>
          <p className="text-sm text-ink-5">Genera documentos personalizados con IA para tus clientes</p>
        </div>
      </div>

      {/* Stepper — solo visible en pasos 0-3 */}
      {step < 4 && (
        <div className="flex items-center gap-1 mb-6">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div className={clsx(
                'flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all',
                i < step ? 'bg-kap-100 text-white' :
                i === step ? 'bg-kap-100 text-kap-600 border-2 border-kap-300' :
                'bg-ink-2 text-ink-4'
              )}>
                {i < step ? <CheckCircle2 size={14} /> : i + 1}
              </div>
              <span className={clsx('text-xs font-medium hidden sm:block',
                i === step ? 'text-kap-600' : i < step ? 'text-ink-5' : 'text-ink-4'
              )}>{s}</span>
              {i < STEPS.length - 1 && <div className={clsx('flex-1 h-0.5 mx-1', i < step ? 'bg-kap-100' : 'bg-ink-3')} />}
            </div>
          ))}
        </div>
      )}

      {/* Card principal */}
      <div className="card p-6">
        {step < 4 ? stepContent[step]() : renderResultado()}

        {/* Navegación */}
        {step < 4 && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-ink-2">
            <button
              onClick={() => setStep(s => s - 1)}
              disabled={step === 0}
              className="flex items-center gap-1.5 text-sm text-ink-5 hover:text-ink-8 disabled:opacity-0 transition-colors"
            >
              <ChevronLeft size={16} /> Atrás
            </button>

            {step < 3 ? (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!puedeAvanzar()}
                className="flex items-center gap-1.5 btn-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continuar <ChevronRight size={16} />
              </button>
            ) : (
              <button
                onClick={() => generarMutation.mutate()}
                disabled={generarMutation.isPending}
                className="flex items-center gap-2 btn-primary text-sm"
              >
                {generarMutation.isPending ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Generando con IA…
                  </>
                ) : (
                  <>
                    <Sparkles size={15} />
                    Generar documento
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Info disclaimer */}
      {step < 4 && (
        <p className="text-xs text-ink-4 text-center mt-4">
          El documento se genera con IA. Revisa y ajusta antes de enviarlo al cliente.
        </p>
      )}
    </div>
  )
}
