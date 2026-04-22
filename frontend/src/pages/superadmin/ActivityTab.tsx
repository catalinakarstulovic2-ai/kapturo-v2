import { useState, useEffect } from 'react'
import api from '../../api/client'
import { ChevronDown, ChevronRight, User, Clock, Activity } from 'lucide-react'

interface UserSummary {
  user_id: string
  user_email: string
  user_name: string
  tenant_name: string | null
  role: string | null
  total_acciones: number
  ultimo_acceso: string | null
  modulos: string[]
}

interface ActivityLog {
  id: string
  action: string
  resource_id: string | null
  resource_name: string | null
  timestamp: string
}

// Módulos con icono y nombre legible
const MODULE_LABELS: Record<string, { label: string; color: string }> = {
  licitaciones:   { label: 'Licitaciones',    color: 'bg-blue-100 text-blue-700' },
  licitador:      { label: 'Licitaciones',    color: 'bg-blue-100 text-blue-700' },
  prospector:     { label: 'Prospector',      color: 'bg-green-100 text-green-700' },
  adjudicadas:    { label: 'Mercado Público', color: 'bg-purple-100 text-purple-700' },
  inmobiliaria:   { label: 'Inmobiliaria',    color: 'bg-orange-100 text-orange-700' },
  kapturo_ventas: { label: 'Kapturo Ventas',  color: 'bg-pink-100 text-pink-700' },
}

const ROLE_LABELS: Record<string, string> = {
  admin:       'Admin',
  user:        'Usuario',
  super_admin: 'Super Admin',
}

// Detalle completo de cada acción
function actionDetail(log: ActivityLog): string {
  const n = log.resource_name ? `"${log.resource_name}"` : ''
  switch (log.action) {
    case 'login':                      return `Inició sesión`
    case 'logout':                     return `Cerró sesión`
    case 'busqueda_normal':            return `Realizó búsqueda${n ? `: ${n}` : ''}`
    case 'busqueda_ia':                return `Búsqueda con IA${n ? `: ${n}` : ''}`
    case 'guardar_licitacion':         return `Guardó licitación${n ? `: ${n}` : ''}`
    case 'analizar_bases':             return `Analizó bases de licitación${n ? `: ${n}` : ''}`
    case 'generar_propuesta_tecnica':  return `Generó propuesta técnica${n ? ` para "${n}"` : ''}`
    case 'generar_oferta_economica':   return `Generó oferta económica${n ? ` para "${n}"` : ''}`
    case 'generar_carta_organismo':    return `Generó carta al organismo${n ? ` para "${n}"` : ''}`
    case 'descargar_txt':              return `Descargó archivo TXT${n ? `: ${n}` : ''}`
    case 'descargar_pdf':              return `Descargó archivo PDF${n ? `: ${n}` : ''}`
    case 'descargar_csv':              return `Descargó archivo CSV${n ? `: ${n}` : ''}`
    case 'cambiar_estado':             return `Cambió estado de prospecto${n ? `: ${n}` : ''}`
    case 'agregar_nota':               return `Agregó nota${n ? ` en: ${n}` : ''}`
    case 'reportar_problema':          return `Reportó un problema${n ? `: ${n}` : ''}`
    case 'perfil_completo':            return `Completó el perfil de la empresa`
    case 'perfil_incompleto':          return `Guardó perfil incompleto`
    case 'ver_licitacion':             return `Vio detalle de licitación${n ? `: ${n}` : ''}`
    case 'ver_prospecto':              return `Abrió prospecto${n ? `: ${n}` : ''}`
    case 'crear_prospecto':            return `Creó nuevo prospecto${n ? `: ${n}` : ''}`
    case 'eliminar_prospecto':         return `Eliminó prospecto${n ? `: ${n}` : ''}`
    case 'enviar_mensaje':             return `Envió mensaje${n ? ` a: ${n}` : ''}`
    case 'agregar_alarma':             return `Programó alarma${n ? ` en: ${n}` : ''}`
    case 'configurar_agente':          return `Configuró agente IA`
    case 'configurar_modulo':          return `Actualizó configuración del módulo${n ? `: ${n}` : ''}`
    default:                           return log.action.replace(/_/g, ' ') + (n ? `: ${n}` : '')
  }
}

function actionIcon(action: string): string {
  const icons: Record<string, string> = {
    login: '🔐', logout: '🚪',
    busqueda_normal: '🔍', busqueda_ia: '🤖',
    guardar_licitacion: '💾', analizar_bases: '📄',
    generar_propuesta_tecnica: '📝', generar_oferta_economica: '💰',
    generar_carta_organismo: '✉️',
    descargar_txt: '⬇️', descargar_pdf: '⬇️', descargar_csv: '⬇️',
    cambiar_estado: '🔄', agregar_nota: '📌',
    reportar_problema: '🐛', perfil_completo: '✅', perfil_incompleto: '⚠️',
    ver_licitacion: '👁️', ver_prospecto: '👤',
    crear_prospecto: '➕', eliminar_prospecto: '🗑️',
    enviar_mensaje: '💬', agregar_alarma: '⏰',
    configurar_agente: '⚙️', configurar_modulo: '🔧',
  }
  return icons[action] ?? '•'
}
  ultimo_acceso: string | null
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
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [userLogs, setUserLogs] = useState<Record<string, ActivityLog[]>>({})
  const [loadingLogs, setLoadingLogs] = useState<string | null>(null)

  useEffect(() => {
    api.get('/admin/activity/users-summary')
      .then(r => setUsers(Array.isArray(r.data) ? r.data : []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false))
  }, [])

  async function toggleUser(userId: string) {
    if (expandedUser === userId) {
      setExpandedUser(null)
      return
    }
    setExpandedUser(userId)
    if (!userLogs[userId]) {
      setLoadingLogs(userId)
      try {
        const r = await api.get(`/admin/activity?user_id=${userId}&limit=200`)
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
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-5 h-5 text-blue-500" />
        <h2 className="text-lg font-semibold text-gray-800">Actividad de usuarios</h2>
        <span className="text-sm text-gray-400 ml-auto">{users.length} usuarios activos</span>
      </div>

      {users.length === 0 && (
        <p className="text-center text-gray-400 py-12">Sin actividad registrada aún.</p>
      )}

      {users.map(u => (
        <div key={u.user_id} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
          {/* Tarjeta del usuario */}
          <button
            onClick={() => toggleUser(u.user_id)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
          >
            {expandedUser === u.user_id
              ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
              : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
            }
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-gray-800 truncate">{u.user_name || u.user_email}</p>
                {u.role && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                    {ROLE_LABELS[u.role] ?? u.role}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <p className="text-xs text-gray-400 truncate">{u.user_email}</p>
                {u.tenant_name && (
                  <span className="text-xs text-gray-400">· {u.tenant_name}</span>
                )}
              </div>
              {/* Módulos activos */}
              {u.modulos && u.modulos.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {u.modulos.map(mod => {
                    const m = MODULE_LABELS[mod]
                    return m ? (
                      <span key={mod} className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.color}`}>
                        {m.label}
                      </span>
                    ) : null
                  })}
                </div>
              )}
            </div>
            <div className="text-right flex-shrink-0 ml-2">
              <p className="text-sm font-bold text-blue-600">{u.total_acciones} acciones</p>
              <p className="text-xs text-gray-400 flex items-center justify-end gap-1 mt-0.5">
                <Clock className="w-3 h-3" />
                {formatDate(u.ultimo_acceso)}
              </p>
            </div>
          </button>

          {/* Historial expandido */}
          {expandedUser === u.user_id && (
            <div className="border-t border-gray-100 bg-gray-50 divide-y divide-gray-100 max-h-80 overflow-y-auto">
              {loadingLogs === u.user_id && (
                <p className="text-sm text-gray-400 px-4 py-3">Cargando historial…</p>
              )}
              {userLogs[u.user_id]?.map(log => (
                <div key={log.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white transition-colors">
                  <span className="text-base flex-shrink-0">{actionIcon(log.action)}</span>
                  <span className="text-sm text-gray-700 flex-1">{actionDetail(log)}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">{formatDate(log.timestamp)}</span>
                </div>
              ))}
              {!loadingLogs && userLogs[u.user_id]?.length === 0 && (
                <p className="text-sm text-gray-400 px-4 py-3">Sin registros.</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}