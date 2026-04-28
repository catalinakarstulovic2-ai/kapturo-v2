import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Building2, MapPin, Calendar, DollarSign,
  Sparkles, Loader2, CheckCircle, XCircle, AlertTriangle,
  FileSignature, FileText, ChevronDown, Copy, Check,
  RotateCcw, ExternalLink,
} from 'lucide-react'
import api from '../../api/client'
import toast from 'react-hot-toast'
import clsx from 'clsx'

// ── Tipos ──────────────────────────────────────────────────────────────────────
interface ProspectoLicit {
  id: string
  licitacion_nombre?: string
  licitacion_codigo?: string
  licitacion_organismo?: string
  licitacion_monto?: number
  licitacion_fecha_cierre?: string
  licitacion_region?: string
  licitacion_categoria?: string
  company_name?: string
  score?: number
  score_reason?: string
  postulacion_estado?: string
  notes?: string
  documentos_ia?: Array<{ tipo: string; label?: string; texto: string; created_at: string }>
}

interface AnalisisResult {
  score: number
  nivel: 'alto' | 'medio' | 'bajo'
  resumen: string
  alertas?: string[]
  requisitos?: { item: string; cumple: boolean | null; observacion?: string }[]
  documentos_analizados?: string[]
}

const DOCS = [
  { tipo: 'propuesta_tecnica',  label: 'Propuesta técnica',       desc: 'Documento principal de postulación' },
  { tipo: 'carta_presentacion', label: 'Carta de presentación',   desc: 'Introducción formal a la licitación' },
  { tipo: 'ficha_tecnica',      label: 'Ficha técnica',           desc: 'Resumen ejecutivo de capacidades' },
]

function formatMonto(n?: number) {
  if (!n) return null
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString('es-CL')}`
}

function diasParaCierre(fecha?: string): { label: string; color: string } | null {
  if (!fecha) return null
  const dias = Math.ceil((new Date(fecha).getTime() - Date.now()) / 86_400_000)
  if (dias <= 0)  return { label: 'Cerró hoy',   color: 'pill-bad' }
  if (dias === 1) return { label: '1 día',        color: 'pill-bad' }
  if (dias <= 3)  return { label: `${dias} días`, color: 'pill-warn' }
  if (dias <= 7)  return { label: `${dias} días`, color: 'pill-warn' }
  return              { label: `${dias} días`, color: 'pill-neutral' }
}

function ScoreDisplay({ score, nivel }: { score: number; nivel: string }) {
  const config = {
    alto:  { label: '✅ Sí, postula',       bg: 'bg-ok-light border-ok-border',    text: 'text-ok',   badge: 'bg-emerald-200 text-emerald-800' },
    medio: { label: '⚠️ Puedes intentarlo', bg: 'bg-warn-light border-warn-border', text: 'text-warn', badge: 'bg-amber-200 text-amber-800' },
    bajo:  { label: '❌ Difícil de ganar',  bg: 'bg-bad-light border-bad-border',   text: 'text-bad',  badge: 'bg-red-200 text-red-800' },
  }[nivel] ?? { label: 'Analizado', bg: 'bg-ink-2 border-ink-3', text: 'text-ink-7', badge: 'bg-ink-3 text-ink-7' }

  return (
    <div className={clsx('rounded-2xl border-2 p-5 text-center', config.bg)}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-ink-4 mb-1">¿Conviene postular?</p>
      <p className={clsx('text-2xl font-black mb-2', config.text)}>{config.label}</p>
      <span className={clsx('inline-block text-xs font-bold px-3 py-1 rounded-full', config.badge)}>
        {score}/100 pts compatibilidad
      </span>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────
export default function LicitacionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  // Endpoint individual — no carga toda la lista
  const { data: prospect, isLoading } = useQuery<ProspectoLicit>({
    queryKey: ['licitacion-detalle', id],
    queryFn: () => api.get(`/modules/licitaciones/prospectos/${id}`).then(r => r.data),
    staleTime: 30_000,
    enabled: !!id,
  })

  const [analisisData, setAnalisisData]   = useState<AnalisisResult | null>(null)
  const [analizando, setAnalizando]       = useState(false)
  const [analisisSeg, setAnalisisSeg]     = useState(0)
  const [generandoTipo, setGenerandoTipo] = useState<string | null>(null)
  const [docResultado, setDocResultado]   = useState<{ tipo: string; texto: string } | null>(null)
  const [copiado, setCopiado]             = useState(false)

  useEffect(() => {
    if (!analizando) { setAnalisisSeg(0); return }
    const t = setInterval(() => setAnalisisSeg(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [analizando])

  const analizar = async () => {
    if (!id) return
    setAnalizando(true)
    setAnalisisData(null)
    try {
      const { data: { job_id } } = await api.post(`/modules/licitaciones/analizar/${id}/start`)
      let intentos = 0
      while (intentos < 60) {
        await new Promise(r => setTimeout(r, 2000))
        const { data: job } = await api.get(`/modules/licitaciones/analizar/job/${job_id}`)
        if (job.status === 'done') {
          setAnalisisData(job.result)
          qc.invalidateQueries({ queryKey: ['licitacion-detalle', id] })
          qc.invalidateQueries({ queryKey: ['licitaciones-postulaciones'] })
          toast.success('Análisis completado')
          break
        }
        if (job.status === 'error') { toast.error('Error en el análisis'); break }
        intentos++
      }
    } catch {
      toast.error('Error al analizar. Intenta de nuevo.')
    } finally {
      setAnalizando(false)
    }
  }

  const generarDoc = async (tipo: string) => {
    if (!id) return
    setGenerandoTipo(tipo)
    setDocResultado(null)
    try {
      const { data } = await api.post(`/modules/licitaciones/propuesta/${id}`, { tipo_documento: tipo })
      const texto = data.propuesta ?? data.texto ?? ''
      setDocResultado({ tipo, texto })
      qc.invalidateQueries({ queryKey: ['licitacion-detalle', id] })
      qc.invalidateQueries({ queryKey: ['licitaciones-postulaciones'] })
      toast.success('Documento generado')
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Error al generar')
    } finally {
      setGenerandoTipo(null)
    }
  }

  const copiar = (texto: string) => {
    navigator.clipboard.writeText(texto)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-ink-4">
      <Loader2 size={22} className="animate-spin mr-2" /> Cargando…
    </div>
  )

  if (!prospect) return (
    <div className="max-w-2xl mx-auto pt-16 text-center">
      <p className="text-ink-5 mb-4">Licitación no encontrada.</p>
      <button onClick={() => navigate('/licitaciones?tab=postulaciones')} className="btn-outline btn-sm">
        ← Volver a Mis postulaciones
      </button>
    </div>
  )

  const nombre     = prospect.licitacion_nombre || prospect.company_name || 'Sin nombre'
  const cierre     = diasParaCierre(prospect.licitacion_fecha_cierre)
  const monto      = formatMonto(prospect.licitacion_monto)
  const tieneScore = prospect.score != null && prospect.score > 0
  const nivelActual = analisisData?.nivel ??
    (prospect.score && prospect.score >= 70 ? 'alto' : prospect.score && prospect.score >= 45 ? 'medio' : 'bajo')
  const bloqueadoDocs = !tieneScore && !analisisData
  const docsGuardados = prospect.documentos_ia ?? []

  return (
    <div className="max-w-3xl mx-auto pb-16 px-4 pt-4 space-y-6">

      {/* Back */}
      <button
        onClick={() => navigate('/licitaciones?tab=postulaciones')}
        className="flex items-center gap-1.5 text-sm text-ink-5 hover:text-ink-8 transition-colors"
      >
        <ArrowLeft size={15} /> Mis postulaciones
      </button>

      {/* ── Header ── */}
      <div className="card p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-base font-bold text-ink-9 leading-snug flex-1">{nombre}</h1>
          <div className="flex items-center gap-2 shrink-0">
            {cierre && <span className={cierre.color}>{cierre.label}</span>}
            {prospect.licitacion_codigo && (
              <a
                href={`https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=${prospect.licitacion_codigo}`}
                target="_blank" rel="noopener noreferrer"
                className="text-ink-4 hover:text-kap-600"
                title="Ver en Mercado Público"
              >
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-5">
          {prospect.licitacion_organismo && (
            <span className="flex items-center gap-1"><Building2 size={11} /> {prospect.licitacion_organismo}</span>
          )}
          {prospect.licitacion_region && (
            <span className="flex items-center gap-1"><MapPin size={11} /> {prospect.licitacion_region}</span>
          )}
          {monto && (
            <span className="flex items-center gap-1 data-monto"><DollarSign size={11} /> {monto}</span>
          )}
          {prospect.licitacion_fecha_cierre && (
            <span className="flex items-center gap-1">
              <Calendar size={11} /> {new Date(prospect.licitacion_fecha_cierre).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
          {prospect.licitacion_codigo && (
            <span className="data-id">{prospect.licitacion_codigo}</span>
          )}
        </div>
      </div>

      {/* ── Análisis IA ─── */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink-9 flex items-center gap-2">
            <Sparkles size={14} className="text-kap-500" /> Análisis IA
          </h2>
          {tieneScore && !analizando && (
            <button onClick={analizar} className="flex items-center gap-1 text-xs text-ink-4 hover:text-ink-7 transition-colors">
              <RotateCcw size={11} /> Re-analizar
            </button>
          )}
        </div>

        {analizando && (
          <div className="rounded-2xl border border-kap-300 bg-kap-50 p-6 text-center space-y-3">
            <Loader2 size={24} className="animate-spin text-kap-500 mx-auto" />
            <p className="text-sm font-semibold text-kap-700">
              {analisisSeg < 15 ? 'Descargando bases técnicas…' :
               analisisSeg < 30 ? 'Claude analizando requisitos…' :
               analisisSeg < 50 ? 'Evaluando compatibilidad con tu perfil…' :
               'Finalizando análisis…'}
            </p>
            <p className="text-xs text-kap-500">{analisisSeg}s · Puede tomar hasta 60 segundos</p>
          </div>
        )}

        {!analizando && analisisData && (
          <div className="space-y-3">
            <ScoreDisplay score={analisisData.score} nivel={analisisData.nivel} />
            <p className="text-sm text-ink-6 leading-relaxed">{analisisData.resumen}</p>

            {analisisData.documentos_analizados?.length ? (
              <p className="text-[11px] text-ink-4 flex items-center gap-1">
                <FileText size={10} /> Basado en: {analisisData.documentos_analizados.join(' · ')}
              </p>
            ) : (
              <p className="text-[11px] text-amber-500 flex items-center gap-1">
                <AlertTriangle size={10} /> Sin bases técnicas — análisis basado en rubro y descripción
              </p>
            )}

            {(analisisData.alertas?.length ?? 0) > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-ink-7">Considera esto al postular:</p>
                {(analisisData.alertas ?? []).map((a, i) => (
                  <div key={i} className="flex items-start gap-2 bg-warn-light border border-warn-border rounded-lg px-3 py-2">
                    <span className="text-warn shrink-0 mt-0.5">•</span>
                    <p className="text-xs text-ink-7">{a}</p>
                  </div>
                ))}
              </div>
            )}

            {(analisisData.requisitos?.length ?? 0) > 0 && (
              <details className="group">
                <summary className="text-xs text-ink-4 cursor-pointer hover:text-ink-6 list-none flex items-center gap-1 select-none">
                  <ChevronDown size={12} className="group-open:rotate-180 transition-transform" />
                  Ver detalle de requisitos ({analisisData.requisitos!.length})
                </summary>
                <div className="mt-2 space-y-1.5 pl-1">
                  {(analisisData.requisitos ?? []).map((req, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      {req.cumple === true  ? <CheckCircle  size={12} className="text-ok   shrink-0 mt-0.5" />
                      : req.cumple === false ? <XCircle     size={12} className="text-bad  shrink-0 mt-0.5" />
                      : <AlertTriangle size={12} className="text-warn shrink-0 mt-0.5" />}
                      <div>
                        <span className={clsx('font-medium',
                          req.cumple === true ? 'text-ink-7' : req.cumple === false ? 'text-bad' : 'text-warn'
                        )}>{req.item}</span>
                        {req.observacion && <span className="text-ink-4 ml-1">— {req.observacion}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {/* Score previo guardado */}
        {!analizando && !analisisData && tieneScore && (
          <div className="space-y-3">
            <ScoreDisplay score={prospect.score!} nivel={nivelActual} />
            {prospect.score_reason && (
              <p className="text-sm text-ink-6 leading-relaxed">{prospect.score_reason}</p>
            )}
            <p className="text-[11px] text-ink-4">Análisis previo. Haz clic en "Re-analizar" para actualizar.</p>
          </div>
        )}

        {/* Sin análisis aún */}
        {!analizando && !analisisData && !tieneScore && (
          <div className="rounded-xl border border-ink-3 bg-ink-1 p-5 text-center space-y-3">
            <p className="text-sm text-ink-6">Claude aún no analizó esta licitación.</p>
            <p className="text-xs text-ink-4">El análisis descarga las bases técnicas reales y evalúa qué tan bien califica tu empresa (30–60 seg).</p>
            <button onClick={analizar} className="btn-kap mx-auto flex items-center gap-2">
              <Sparkles size={14} /> Analizar con IA
            </button>
          </div>
        )}
      </div>

      {/* ── Generar documentos ─── */}
      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-bold text-ink-9 flex items-center gap-2">
          <FileSignature size={14} className="text-kap-500" /> Generar documentos
        </h2>

        {bloqueadoDocs && (
          <p className="text-xs text-ink-4 bg-ink-2 rounded-xl px-4 py-3">
            Primero analiza la licitación con IA — así los documentos usarán los requisitos reales de las bases técnicas.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {DOCS.map(doc => {
            const yaGenerado = docsGuardados.some(d => d.tipo === doc.tipo)
            const esteGenerando = generandoTipo === doc.tipo
            const disabled = bloqueadoDocs || !!generandoTipo
            return (
              <button
                key={doc.tipo}
                onClick={() => !disabled && generarDoc(doc.tipo)}
                disabled={disabled}
                className={clsx(
                  'flex flex-col items-start gap-1.5 p-4 rounded-xl border text-left transition-all',
                  disabled
                    ? 'bg-ink-1 border-ink-2 opacity-50 cursor-not-allowed'
                    : yaGenerado
                      ? 'bg-ok-light border-ok-border hover:shadow-sm cursor-pointer'
                      : 'bg-ink-0 border-ink-3 hover:border-kap-300 hover:shadow-sm cursor-pointer'
                )}
              >
                {esteGenerando
                  ? <Loader2 size={16} className="animate-spin text-kap-500" />
                  : yaGenerado
                    ? <CheckCircle size={16} className="text-ok" />
                    : <FileText size={16} className="text-ink-4" />
                }
                <span className="text-xs font-semibold text-ink-8">{doc.label}</span>
                <span className="text-[10px] text-ink-4 leading-tight">{doc.desc}</span>
                {yaGenerado && !esteGenerando && (
                  <span className="text-[10px] text-ok font-medium">Generado ✓ · Regenerar</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Documento recién generado ─── */}
      {docResultado && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-ink-9">
              {DOCS.find(d => d.tipo === docResultado.tipo)?.label ?? 'Documento generado'}
            </h2>
            <button
              onClick={() => copiar(docResultado.texto)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-ink-3 hover:bg-ink-2 text-ink-6 transition-colors"
            >
              {copiado ? <><Check size={12} className="text-ok" /> Copiado</> : <><Copy size={12} /> Copiar</>}
            </button>
          </div>
          <div className="bg-ink-1 rounded-xl border border-ink-3 p-4 text-xs text-ink-8 whitespace-pre-wrap leading-relaxed max-h-[28rem] overflow-y-auto font-mono">
            {docResultado.texto}
          </div>
        </div>
      )}

      {/* ── Documentos generados anteriormente ─── */}
      {docsGuardados.length > 0 && (
        <div className="card p-5 space-y-3">
          <h2 className="text-sm font-bold text-ink-9">Documentos guardados</h2>
          <div className="space-y-2">
            {docsGuardados.map((doc, i) => {
              const meta = DOCS.find(d => d.tipo === doc.tipo)
              const esActivo = docResultado?.tipo === doc.tipo
              return (
                <div key={i} className={clsx(
                  'flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors',
                  esActivo ? 'border-kap-300 bg-kap-50' : 'border-ink-2 bg-ink-1 hover:border-ink-3'
                )}>
                  <div className="flex items-center gap-2">
                    <FileText size={13} className={esActivo ? 'text-kap-500' : 'text-ink-4'} />
                    <span className="text-xs font-medium text-ink-7">{meta?.label ?? doc.tipo}</span>
                    {doc.created_at && (
                      <span className="text-[10px] text-ink-4">
                        {new Date(doc.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setDocResultado({ tipo: doc.tipo, texto: doc.texto })}
                    className="text-xs text-kap-600 hover:text-kap-800 font-medium transition-colors"
                  >
                    {esActivo ? 'Mostrando' : 'Ver'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

    </div>
  )
}
