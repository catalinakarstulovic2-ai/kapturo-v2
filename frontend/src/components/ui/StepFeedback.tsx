import { useState } from 'react'
import { X, ThumbsUp, ThumbsDown, Frown, AlertCircle, ChevronRight, MessageSquare } from 'lucide-react'
import clsx from 'clsx'
import api from '../../api/client'

export type FeedbackPaso =
  | 'perfil'
  | 'busqueda'
  | 'guardar_licitacion'
  | 'analisis'
  | 'documentos'

interface Props {
  paso: FeedbackPaso
  titulo: string        // "¿Cómo fue completar tu Perfil IA?"
  onDone?: () => void   // callback cuando termina (omite o envía)
}

const OPCIONES = [
  { key: 'facil',        label: 'Fácil 😊',           color: 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
  { key: 'confuso',      label: 'Me enredé 😵',        color: 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100' },
  { key: 'muchos_pasos', label: 'Muchos pasos 😓',     color: 'border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100' },
  { key: 'dificil',      label: 'Difícil 😤',          color: 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100' },
]

export default function StepFeedback({ paso, titulo, onDone }: Props) {
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const [comentario, setComentario] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [mostrarComentario, setMostrarComentario] = useState(false)

  const enviar = async (reaccion: string) => {
    setSeleccion(reaccion)
    setEnviado(true)
    try {
      await api.post('/feedback/step', {
        paso,
        reaccion,
        comentario: comentario.trim() || undefined,
        pagina: window.location.pathname,
      })
    } catch { /* silencioso */ }
    setTimeout(() => onDone?.(), 1200)
  }

  const omitir = () => {
    try { api.post('/feedback/step', { paso, reaccion: 'omitido', pagina: window.location.pathname }) } catch {}
    onDone?.()
  }

  if (enviado) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-3">
        <ThumbsUp size={16} className="text-emerald-500 shrink-0" />
        <p className="text-sm font-medium text-emerald-700">¡Gracias! Tu feedback nos ayuda a mejorar.</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-kap-100 bg-white shadow-sm px-4 py-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquare size={14} className="text-kap-500 shrink-0" />
          <p className="text-sm font-semibold text-ink-8">{titulo}</p>
        </div>
        <button onClick={omitir} className="text-ink-4 hover:text-ink-5 shrink-0">
          <X size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {OPCIONES.map(op => (
          <button
            key={op.key}
            onClick={() => {
              if (op.key === 'facil') enviar(op.key)
              else {
                setSeleccion(op.key)
                setMostrarComentario(true)
              }
            }}
            className={clsx(
              'text-xs font-medium px-3 py-2 rounded-xl border transition-all',
              seleccion === op.key ? op.color + ' ring-2 ring-offset-1 ring-kap-300' : op.color
            )}
          >
            {op.label}
          </button>
        ))}
      </div>

      {mostrarComentario && seleccion && (
        <div className="space-y-2">
          <textarea
            autoFocus
            value={comentario}
            onChange={e => setComentario(e.target.value)}
            placeholder="Opcional: cuéntanos qué fue lo más difícil…"
            rows={2}
            className="w-full text-xs rounded-xl border border-ink-3 px-3 py-2 text-ink-7 placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-kap-300 resize-none"
          />
          <button
            onClick={() => enviar(seleccion)}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-kap-600 text-white text-xs font-semibold hover:bg-kap-700 transition-colors"
          >
            Enviar <ChevronRight size={12} />
          </button>
        </div>
      )}

      <button onClick={omitir} className="w-full text-[11px] text-ink-4 hover:text-ink-6 text-center transition-colors">
        Omitir
      </button>
    </div>
  )
}
