import { useState, useEffect } from 'react'
import api from '../../api/client'
import { Bug, User, Globe, Calendar, ImageIcon } from 'lucide-react'

interface BugReport {
  id: number
  user_id: number
  user_email: string
  user_name: string
  tenant_id: number
  descripcion: string
  screenshot_base64: string | null
  screenshot_mime: string | null
  pagina: string | null
  timestamp: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function BugReportsTab() {
  const [reports, setReports] = useState<BugReport[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    api.get('/admin/bug-reports')
      .then(r => {
        const data = r.data
        setReports(Array.isArray(data) ? data : (data?.reports ?? []))
      })
      .catch(() => setReports([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20 text-gray-400">
        Cargando reportes…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Bug className="w-5 h-5 text-red-500" />
        <h2 className="text-lg font-semibold text-gray-800">Reportes de problemas</h2>
        <span className="text-sm text-gray-400 ml-auto">{reports.length} reportes</span>
      </div>

      {reports.length === 0 && (
        <p className="text-center text-gray-400 py-12">Sin reportes de problemas.</p>
      )}

      {reports.map(r => (
        <div key={r.id} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
          <div className="px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User className="w-4 h-4 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-800">{r.user_name || r.user_email}</span>
                  <span className="text-xs text-gray-400">{r.user_email}</span>
                  <span className="ml-auto text-xs text-gray-400 flex items-center gap-1 flex-shrink-0">
                    <Calendar className="w-3 h-3" />
                    {formatDate(r.timestamp)}
                  </span>
                </div>

                {r.pagina && (
                  <p className="text-xs text-blue-500 mt-1 flex items-center gap-1 truncate">
                    <Globe className="w-3 h-3 flex-shrink-0" />
                    {r.pagina}
                  </p>
                )}

                <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{r.descripcion}</p>

                {r.screenshot_base64 && (
                  <button
                    onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                    className="mt-2 text-xs text-blue-500 hover:underline flex items-center gap-1"
                  >
                    <ImageIcon className="w-3 h-3" />
                    {expanded === r.id ? 'Ocultar captura' : 'Ver captura de pantalla'}
                  </button>
                )}
              </div>
            </div>

            {expanded === r.id && r.screenshot_base64 && (
              <div className="mt-3 rounded-lg overflow-hidden border border-gray-200">
                <img
                  src={`data:${r.screenshot_mime ?? 'image/png'};base64,${r.screenshot_base64}`}
                  alt="Captura de pantalla"
                  className="max-w-full h-auto"
                />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
