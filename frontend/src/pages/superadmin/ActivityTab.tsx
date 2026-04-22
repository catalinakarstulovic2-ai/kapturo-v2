import { useState, useEffect } from 'react'
import api from '../../api/client'
import { ChevronDown, ChevronRight, User, Clock, Activity } from 'lucide-react'

interface UserSummary {
  user_id: number
  user_email: string
  user_name: string
  tenant_id: number
  total_acciones: number
  ultimo_acceso: string
}

interface ActivityLog {
  id: number
  action: string
  resource_id: string | null
  resource_name: string | null
  timestamp: string
}

const ACTION_LABELS: Record<string, string> = {
  login: '🔐 Inicio de sesión',
  busqueda_normal: '🔍 Búsqueda',
  busqueda_ia: '🤖 Búsqueda IA',
  guardar_licitacion: '💾 Guardó licitación',
  analizar_bases: '📄 Analizó bases',
  generar_propuesta_tecnica: '📝 Propuesta técnica',
  generar_oferta_economica: '💰 Oferta económica',
  generar_carta_organismo: '✉️ Carta organismo',
  descargar_txt: '⬇️ Descargó TXT',
  descargar_pdf: '⬇️ Descargó PDF',
  descargar_csv: '⬇️ Descargó CSV',
  cambiar_estado: '🔄 Cambió estado',
  agregar_nota: '📌 Agregó nota',
  reportar_problema: '🐛 Reportó problema',
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function ActivityTab() {
  const [users, setUsers] = useState<UserSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedUser, setExpandedUser] = useState<number | null>(null)
  const [userLogs, setUserLogs] = useState<Record<number, ActivityLog[]>>({})
  const [loadingLogs, setLoadingLogs] = useState<number | null>(null)

  useEffect(() => {
    api.get('/admin/activity/users-summary')
      .then(r => setUsers(Array.isArray(r.data) ? r.data : []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false))
  }, [])

  async function toggleUser(userId: number) {
    if (expandedUser === userId) {
      setExpandedUser(null)
      return
    }
    setExpandedUser(userId)
    if (!userLogs[userId]) {
      setLoadingLogs(userId)
      try {
        const r = await api.get(`/admin/activity?user_id=${userId}&limit=100`)
        const logs = Array.isArray(r.data) ? r.data : (r.data?.logs ?? [])
        setUserLogs(prev => ({ ...prev, [userId]: logs }))
      } catch {
        // ignore
      } finally {
        setLoadingLogs(null)
      }
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20 text-gray-400">
        Cargando actividad…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-5 h-5 text-blue-500" />
        <h2 className="text-lg font-semibold text-gray-800">Actividad de usuarios</h2>
        <span className="text-sm text-gray-400 ml-auto">{users.length} usuarios activos</span>
      </div>

      {users.length === 0 && (
        <p className="text-center text-gray-400 py-12">Sin actividad registrada aún.</p>
      )}

      {users.map(u => (
        <div key={u.user_id} className="border border-gray-200 rounded-xl overflow-hidden">
          <button
            onClick={() => toggleUser(u.user_id)}
            className="w-full flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 transition-colors text-left"
          >
            {expandedUser === u.user_id
              ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
              : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
            }
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800 truncate">{u.user_name || u.user_email}</p>
              <p className="text-xs text-gray-400 truncate">{u.user_email}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-semibold text-blue-600">{u.total_acciones} acciones</p>
              <p className="text-xs text-gray-400 flex items-center justify-end gap-1">
                <Clock className="w-3 h-3" />
                {formatDate(u.ultimo_acceso)}
              </p>
            </div>
          </button>

          {expandedUser === u.user_id && (
            <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-1 max-h-64 overflow-y-auto">
              {loadingLogs === u.user_id && (
                <p className="text-sm text-gray-400">Cargando historial…</p>
              )}
              {userLogs[u.user_id]?.map(log => (
                <div key={log.id} className="flex items-center gap-3 text-sm py-1">
                  <span className="text-gray-600">{ACTION_LABELS[log.action] ?? log.action}</span>
                  {log.resource_name && (
                    <span className="text-gray-400 truncate max-w-xs">— {log.resource_name}</span>
                  )}
                  <span className="ml-auto text-gray-400 text-xs flex-shrink-0">{formatDate(log.timestamp)}</span>
                </div>
              ))}
              {userLogs[u.user_id]?.length === 0 && (
                <p className="text-sm text-gray-400">Sin registros.</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
