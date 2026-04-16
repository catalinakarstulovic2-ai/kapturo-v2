import { useEffect, useState } from 'react'
import { Loader2, Search, Sparkles } from 'lucide-react'
import clsx from 'clsx'

interface SearchingPopupProps {
  visible: boolean
  messages?: string[]
  title?: string
}

const DEFAULT_MESSAGES = [
  'Conectando con la base de datos...',
  'Buscando registros relevantes...',
  'Procesando la información...',
  'Casi listo...',
]

export default function SearchingPopup({
  visible,
  messages = DEFAULT_MESSAGES,
  title = 'Buscando información',
}: SearchingPopupProps) {
  const [msgIndex, setMsgIndex] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!visible) {
      setMsgIndex(0)
      setElapsed(0)
      return
    }
    const interval = setInterval(() => {
      setMsgIndex(i => (i + 1) % messages.length)
      setElapsed(e => e + 1)
    }, 2000)
    return () => clearInterval(interval)
  }, [visible, messages])

  if (!visible) return null

  const minutos = Math.ceil((messages.length * 2 - elapsed * 2) / 60) || 1

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center pointer-events-none">
      <div
        className={clsx(
          'pointer-events-auto mx-4 mb-6 sm:mb-0 w-full max-w-sm',
          'bg-white rounded-2xl shadow-2xl border border-gray-200',
          'animate-in slide-in-from-bottom-4 duration-300'
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-100">
          <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center shrink-0">
            <Search size={16} className="text-violet-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{title}</p>
            <p className="text-xs text-gray-400">Esto puede tardar unos momentos</p>
          </div>
          <Loader2 size={16} className="ml-auto text-violet-500 animate-spin shrink-0" />
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-gray-100 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-violet-400 to-violet-600 transition-all duration-[2000ms] ease-linear"
            style={{ width: `${Math.min(((msgIndex + 1) / messages.length) * 100, 95)}%` }}
          />
        </div>

        {/* Mensaje actual */}
        <div className="px-4 py-3">
          <p className="text-xs text-gray-600 font-medium transition-all duration-500">
            {messages[msgIndex]}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            ⏱ Tiempo estimado: menos de {minutos} minuto{minutos !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Dots */}
        <div className="flex gap-1 px-4 pb-4">
          {messages.map((_, i) => (
            <div
              key={i}
              className={clsx(
                'h-1.5 rounded-full transition-all duration-300',
                i === msgIndex ? 'w-4 bg-violet-500' : i < msgIndex ? 'w-1.5 bg-violet-200' : 'w-1.5 bg-gray-200'
              )}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
