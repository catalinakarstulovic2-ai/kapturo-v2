import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import api from '../../api/client'
import toast from 'react-hot-toast'
import ReactMarkdown from 'react-markdown'
import { jsPDF } from 'jspdf'
import {
  Sparkles, FileText, Copy, Download, ChevronRight, ChevronLeft,
  Building2, CheckCircle2, RotateCcw, Loader2, FileSignature,
  ClipboardList, DollarSign, Mail, BookOpen,
} from 'lucide-react'
import clsx from 'clsx'

// ── Tipos de documento para licitaciones ─────────────────────────────────────

type TipoDoc = 'propuesta_tecnica' | 'oferta_economica' | 'carta_organismo' | 'carta_seguimiento'

const TIPOS: { id: TipoDoc; label: string; desc: string; icon: React.ElementType; color: string }[] = [
  {
    id: 'propuesta_tecnica',
    label: 'Propuesta Técnica',
    desc: 'Describe metodología, experiencia y capacidad técnica para cumplir las bases',
    icon: ClipboardList,
    color: 'violet',
  },
  {
    id: 'oferta_economica',
    label: 'Oferta Económica',
    desc: 'Detalle de precios, condiciones comerciales y tabla de costos para la licitación',
    icon: DollarSign,
    color: 'emerald',
  },
  {
    id: 'carta_organismo',
    label: 'Carta al Organismo',
    desc: 'Carta formal de presentación o consulta dirigida al organismo licitante',
    icon: Mail,
    color: 'blue',
  },
  {
    id: 'carta_seguimiento',
    label: 'Carta de Seguimiento',
    desc: 'Seguimiento post-postulación para reforzar tu oferta ante el evaluador',
    icon: BookOpen,
    color: 'amber',
  },
]

const COLOR_MAP: Record<string, string> = {
  violet: 'border-violet-500 bg-violet-50',
  emerald: 'border-emerald-500 bg-emerald-50',
  blue: 'border-blue-500 bg-blue-50',
  amber: 'border-amber-500 bg-amber-50',
}
const COLOR_TEXT: Record<string, string> = {
  violet: 'text-violet-700',
  emerald: 'text-emerald-700',
  blue: 'text-blue-700',
  amber: 'text-amber-700',
}
const COLOR_ICON: Record<string, string> = {
  violet: 'text-violet-500',
  emerald: 'text-emerald-500',
  blue: 'text-blue-500',
  amber: 'text-amber-500',
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface PostulacionItem {
  id: string
  licitacion_nombre?: string
  licitacion_organismo?: string
  licitacion_codigo?: string
  licitacion_monto?: number
  postulacion_estado?: string
}

const STEPS = ['Documento', 'Licitación', 'Detalles', 'Generar']

export default function LicitacionPropuestaPage() {
  const [step, setStep] = useState(0)
  const [tipo, setTipo] = useState<TipoDoc | ''>('')
  const [selectedPostulacion, setSelectedPostulacion] = useState<PostulacionItem | null>(null)
  const [instrucciones, setInstrucciones] = useState('')
  const [resultado, setResultado] = useState('')
  const [copiado, setCopiado] = useState(false)

  // Cargar postulaciones guardadas
  const { data: postulacionesData, isLoading: loadingPostulaciones } = useQuery({
    queryKey: ['licit-postulaciones-propuesta'],
    queryFn: () =>
      api.get('/modules/licitaciones/prospectos').then(r => r.data),
  })
  const postulaciones: PostulacionItem[] = postulacionesData?.items ?? []

  // Generar con IA usando el prospect_id
  const generarMutation = useMutation({
    mutationFn: () => {
      if (!selectedPostulacion) throw new Error('Sin licitación seleccionada')
      return api
        .post(`/modules/licitaciones/propuesta/${selectedPostulacion.id}`, {
          instrucciones_extra: buildInstrucciones(),
        })
        .then(r => r.data)
    },
    onSuccess: (data) => {
      setResultado(data.propuesta ?? data.texto ?? JSON.stringify(data))
      setStep(4)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Error al generar. Intenta de nuevo.'),
  })

  const buildInstrucciones = () => {
    const tipoLabel = TIPOS.find(t => t.id === tipo)?.label ?? tipo
    let base = `Tipo de documento: ${tipoLabel}.`
    if (instrucciones.trim()) base += `\nInstrucciones adicionales: ${instrucciones}`
    return base
  }

  const puedeAvanzar = () => {
    if (step === 0) return !!tipo
    if (step === 1) return !!selectedPostulacion
    return true
  }

  const copiar = () => {
    navigator.clipboard.writeText(resultado)
    setCopiado(true)
    toast.success('Copiado al portapapeles')
    setTimeout(() => setCopiado(false), 2500)
  }

  const descargar = () => {
    const nombre = selectedPostulacion?.licitacion_nombre ?? 'licitacion'
    const tipoLabel = TIPOS.find(t => t.id === tipo)?.label ?? tipo
    const titulo = `${tipoLabel} — ${nombre.slice(0, 60)}`
    const nombreArchivo = `${tipoLabel.replace(/\s+/g, '_')}_${nombre.slice(0, 40).replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
    const fecha = new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })

    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const marginX = 20
    const pageWidth = doc.internal.pageSize.getWidth()
    const maxWidth = pageWidth - marginX * 2
    let y = 20

    const checkPage = (needed = 8) => {
      if (y + needed > doc.internal.pageSize.getHeight() - 15) {
        doc.addPage()
        y = 20
      }
    }

    // Cabecera
    doc.setFillColor(79, 70, 229)
    doc.rect(0, 0, pageWidth, 14, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('KAPTURO', marginX, 9.5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(`Generado el ${fecha}`, pageWidth - marginX, 9.5, { align: 'right' })
    y = 22

    // Título
    doc.setTextColor(30, 27, 75)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    const tituloLines = doc.splitTextToSize(titulo, maxWidth)
    doc.text(tituloLines, marginX, y)
    y += tituloLines.length * 7 + 4

    // Línea separadora
    doc.setDrawColor(199, 210, 254)
    doc.line(marginX, y, pageWidth - marginX, y)
    y += 6

    // Contenido — procesar línea por línea
    const lines = resultado.split('\n')
    for (const raw of lines) {
      const line = raw.trim()
      if (!line) { y += 3; continue }

      checkPage(10)

      if (line.startsWith('## ') || line.startsWith('# ')) {
        y += 2
        doc.setFontSize(12)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(49, 46, 129)
        const text = line.replace(/^#+\s+/, '')
        const wrapped = doc.splitTextToSize(text, maxWidth)
        doc.text(wrapped, marginX, y)
        y += wrapped.length * 6 + 3
        doc.setDrawColor(224, 231, 255)
        doc.line(marginX, y, pageWidth - marginX, y)
        y += 4
      } else if (line.startsWith('### ')) {
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(55, 65, 81)
        const text = line.replace(/^###\s+/, '')
        const wrapped = doc.splitTextToSize(text, maxWidth)
        doc.text(wrapped, marginX, y)
        y += wrapped.length * 5.5 + 2
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        doc.setFontSize(9.5)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(30, 30, 30)
        const text = line.replace(/^[-*]\s+/, '').replace(/\*\*(.+?)\*\*/g, '$1')
        const wrapped = doc.splitTextToSize(`• ${text}`, maxWidth - 4)
        checkPage(wrapped.length * 5)
        doc.text(wrapped, marginX + 3, y)
        y += wrapped.length * 5 + 1
      } else {
        doc.setFontSize(9.5)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(30, 30, 30)
        const text = line.replace(/\*\*(.+?)\*\*/g, '$1')
        const wrapped = doc.splitTextToSize(text, maxWidth)
        checkPage(wrapped.length * 5)
        doc.text(wrapped, marginX, y)
        y += wrapped.length * 5 + 1.5
      }
    }

    doc.save(nombreArchivo)
  }

  const reiniciar = () => {
    setTipo('')
    setSelectedPostulacion(null)
    setInstrucciones('')
    setResultado('')
    setStep(0)
  }

  // ─── Paso 0: Tipo de documento ──────────────────────────────────────────
  const renderTipo = () => (
    <div className="space-y-3">
      <p className="text-sm text-gray-500 mb-4">¿Qué documento necesitas generar para esta licitación?</p>
      {TIPOS.map(t => {
        const Icon = t.icon
        const selected = tipo === t.id
        return (
          <button
            key={t.id}
            onClick={() => setTipo(t.id)}
            className={clsx(
              'w-full flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all',
              selected ? COLOR_MAP[t.color] : 'border-gray-200 hover:border-violet-200 hover:bg-gray-50'
            )}
          >
            <div className={clsx('mt-0.5 shrink-0', selected ? COLOR_ICON[t.color] : 'text-gray-400')}>
              <Icon size={22} />
            </div>
            <div className="flex-1">
              <p className={clsx('font-semibold text-sm', selected ? COLOR_TEXT[t.color] : 'text-gray-800')}>
                {t.label}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{t.desc}</p>
            </div>
            {selected && <CheckCircle2 size={18} className={clsx('ml-auto shrink-0 mt-0.5', COLOR_ICON[t.color])} />}
          </button>
        )
      })}
    </div>
  )

  // ─── Paso 1: Seleccionar postulación ───────────────────────────────────
  const renderLicitacion = () => (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Selecciona la licitación para la que quieres generar el documento.</p>

      {loadingPostulaciones ? (
        <div className="flex items-center justify-center py-10 text-gray-400">
          <Loader2 size={20} className="animate-spin mr-2" /> Cargando postulaciones…
        </div>
      ) : postulaciones.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
          No tienes licitaciones guardadas aún. Ve a <strong>Licitaciones</strong> y guarda alguna primero.
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {postulaciones.map(p => {
            const selected = selectedPostulacion?.id === p.id
            return (
              <button
                key={p.id}
                onClick={() => setSelectedPostulacion(p)}
                className={clsx(
                  'w-full text-left p-3.5 rounded-xl border-2 transition-all',
                  selected ? 'border-violet-500 bg-violet-50' : 'border-gray-200 hover:border-violet-200 hover:bg-gray-50'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={clsx('shrink-0 mt-0.5', selected ? 'text-violet-500' : 'text-gray-400')}>
                    <FileText size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={clsx('text-xs font-semibold truncate', selected ? 'text-violet-800' : 'text-gray-800')}>
                      {p.licitacion_nombre ?? p.licitacion_codigo ?? p.id}
                    </p>
                    {p.licitacion_organismo && (
                      <p className="text-[11px] text-gray-500 mt-0.5 truncate">{p.licitacion_organismo}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      {p.licitacion_codigo && (
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                          {p.licitacion_codigo}
                        </span>
                      )}
                      {p.licitacion_monto && (
                        <span className="text-[10px] font-semibold text-gray-600">
                          {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(p.licitacion_monto)}
                        </span>
                      )}
                      {p.postulacion_estado && (
                        <span className="text-[10px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded capitalize">
                          {p.postulacion_estado.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                  </div>
                  {selected && <CheckCircle2 size={16} className="text-violet-500 shrink-0 mt-0.5" />}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )

  // ─── Paso 2: Instrucciones adicionales ─────────────────────────────────
  const renderDetalles = () => (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Puedes agregar instrucciones específicas para personalizar el documento (opcional).</p>
      <div>
        <label className="text-xs font-medium text-gray-600 mb-1 block">Instrucciones adicionales</label>
        <textarea
          className="input resize-none"
          rows={4}
          placeholder={`Ej: Enfatizar experiencia en proyectos similares, incluir referencias de clientes del sector público, precio competitivo máximo $3.000.000...`}
          value={instrucciones}
          onChange={e => setInstrucciones(e.target.value)}
        />
        <p className="text-[11px] text-gray-400 mt-1.5">
          La IA usará las bases reales de la licitación + el perfil de tu empresa automáticamente.
        </p>
      </div>

      {/* Preview de lo seleccionado */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
        <p className="text-xs font-semibold text-gray-600">Resumen</p>
        <div className="space-y-1.5">
          {[
            { label: 'Documento', value: TIPOS.find(t => t.id === tipo)?.label ?? '' },
            { label: 'Licitación', value: selectedPostulacion?.licitacion_nombre ?? selectedPostulacion?.id ?? '' },
            { label: 'Organismo', value: selectedPostulacion?.licitacion_organismo ?? '—' },
            { label: 'Código', value: selectedPostulacion?.licitacion_codigo ?? '—' },
          ].map(item => (
            <div key={item.label} className="flex gap-2 text-xs">
              <span className="text-gray-400 w-24 shrink-0">{item.label}</span>
              <span className="text-gray-700 font-medium truncate">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  // ─── Paso 3: Confirmar ─────────────────────────────────────────────────
  const renderConfirmar = () => {
    const tipoInfo = TIPOS.find(t => t.id === tipo)
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-500">Todo listo. La IA generará el documento con:</p>
        <div className="space-y-2">
          {[
            { icon: ClipboardList, text: 'Bases técnicas descargadas de Mercado Público' },
            { icon: Building2, text: 'Perfil de tu empresa configurado en Kapturo' },
            { icon: FileSignature, text: `Tipo: ${tipoInfo?.label ?? tipo}` },
          ].map(item => (
            <div key={item.text} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
              <item.icon size={15} className="text-violet-500 shrink-0" />
              <p className="text-xs text-gray-700">{item.text}</p>
            </div>
          ))}
        </div>
        <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 flex items-start gap-3">
          <Sparkles size={18} className="text-violet-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-violet-800">Generación puede tomar 20–40 segundos</p>
            <p className="text-xs text-violet-600 mt-0.5">Claude Sonnet analiza las bases reales y redacta el documento adaptado a la licitación.</p>
          </div>
        </div>
      </div>
    )
  }

  // ─── Resultado ──────────────────────────────────────────────────────────
  const renderResultado = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-emerald-600">
        <CheckCircle2 size={18} />
        <p className="text-sm font-semibold">Documento generado exitosamente</p>
      </div>
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 max-h-[400px] overflow-y-auto">
        <div className="prose prose-sm max-w-none text-gray-700 text-xs leading-relaxed">
          <ReactMarkdown>{resultado}</ReactMarkdown>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={copiar}
          className={clsx(
            'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all',
            copiado ? 'bg-emerald-500 text-white' : 'bg-violet-600 hover:bg-violet-700 text-white'
          )}
        >
          {copiado ? <><CheckCircle2 size={15} /> Copiado</> : <><Copy size={15} /> Copiar</>}
        </button>
        <button
          onClick={descargar}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          <Download size={15} /> PDF
        </button>
        <button
          onClick={reiniciar}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          <RotateCcw size={15} /> Nuevo
        </button>
      </div>
    </div>
  )

  const stepContent = [renderTipo, renderLicitacion, renderDetalles, renderConfirmar]

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center">
          <FileSignature size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Propuestas para Licitaciones</h1>
          <p className="text-sm text-gray-500">Genera documentos con IA basados en las bases reales</p>
        </div>
      </div>

      {/* Stepper */}
      {step < 4 && (
        <div className="flex items-center gap-1 mb-6">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div className={clsx(
                'flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all',
                i < step ? 'bg-violet-600 text-white' :
                i === step ? 'bg-violet-100 text-violet-700 border-2 border-violet-400' :
                'bg-gray-100 text-gray-400'
              )}>
                {i < step ? <CheckCircle2 size={14} /> : i + 1}
              </div>
              <span className={clsx('text-xs font-medium hidden sm:block',
                i === step ? 'text-violet-700' : i < step ? 'text-gray-500' : 'text-gray-300'
              )}>{s}</span>
              {i < STEPS.length - 1 && (
                <div className={clsx('flex-1 h-0.5 mx-1', i < step ? 'bg-violet-300' : 'bg-gray-200')} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Card principal */}
      <div className="card p-6">
        {step < 4 ? stepContent[step]() : renderResultado()}

        {/* Navegación */}
        {step < 4 && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
            <button
              onClick={() => setStep(s => s - 1)}
              disabled={step === 0}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 disabled:opacity-0 transition-colors"
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

      {step < 4 && (
        <p className="text-xs text-gray-400 text-center mt-4">
          El documento se genera con IA usando las bases reales de la licitación. Revisa antes de enviar.
        </p>
      )}
    </div>
  )
}
