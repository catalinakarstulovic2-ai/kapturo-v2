import { useState, useRef, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import api from '../../api/client'
import toast from 'react-hot-toast'
import { MessageSquareWarning, X, Paperclip, Loader2, Send } from 'lucide-react'

interface Props {
  externalOpen?: boolean
  onClose?: () => void
}

export default function BugReportButton({ externalOpen, onClose }: Props) {
  const [open, setOpen] = useState(false)
  const [descripcion, setDescripcion] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (externalOpen) setOpen(true)
  }, [externalOpen])

  const handleClose = () => {
    setOpen(false)
    onClose?.()
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const form = new FormData()
      form.append('descripcion', descripcion)
      form.append('pagina', window.location.href)
      if (file) form.append('screenshot', file)
      return api.post('/bug-reports', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: () => {
      toast.success('Reporte enviado. ¡Gracias!')
      handleClose()
      setDescripcion('')
      setFile(null)
    },
    onError: () => {
      toast.error('Error al enviar el reporte')
    },
  })

  return (
    <>
      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <MessageSquareWarning size={16} className="text-red-500" />
                Reportar problema
              </h3>
              <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <textarea
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Describe el problema que encontraste..."
              rows={4}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-400"
            />

            {/* Adjuntar imagen */}
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-purple-600 transition-colors"
              >
                <Paperclip size={13} />
                {file ? file.name : 'Adjuntar captura (opcional)'}
              </button>
              {file && (
                <button onClick={() => setFile(null)} className="text-xs text-red-400 hover:text-red-600">
                  Quitar
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => setFile(e.target.files?.[0] || null)}
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                Cancelar
              </button>
              <button
                onClick={() => mutation.mutate()}
                disabled={!descripcion.trim() || mutation.isPending}
                className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm rounded-xl transition-colors"
              >
                {mutation.isPending
                  ? <><Loader2 size={14} className="animate-spin" /> Enviando...</>
                  : <><Send size={14} /> Enviar reporte</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
