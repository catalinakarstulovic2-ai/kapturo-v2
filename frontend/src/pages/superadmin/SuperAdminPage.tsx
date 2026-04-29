import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../api/client'
import toast from 'react-hot-toast'
import {
  Building2, Users, CreditCard, BarChart2, Plus, ToggleLeft, ToggleRight,
  ShieldAlert, Pencil, Trash2, UserPlus, Package, X, ChevronLeft, Save,
  Eye, EyeOff, Loader2, DollarSign, SlidersHorizontal, RotateCcw, ChevronDown, Search,
  Activity, Bug, Mail, Send,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuthStore } from '../../store/authStore'
import ActivityTab from './ActivityTab'
import BugReportsTab from './BugReportsTab'

const MODULES = ['adjudicadas', 'licitaciones', 'prospector', 'inmobiliaria'] as const

// Categorías de rubros para Mercado Público
const RUBROS_CATEGORIAS: Record<string, string[]> = {
  '🏥 Salud': ['salud', 'farmacéutico', 'médico', 'laboratorio', 'hospitalario', 'veterinario'],
  '🏗️ Construcción': ['construcción', 'infraestructura', 'obras civiles', 'arquitectura'],
  '💻 Tecnología': ['tecnología', 'informática', 'software', 'telecomunicaciones'],
  '📚 Educación': ['educación', 'capacitación', 'deportes'],
  '🚛 Logística': ['transporte', 'logística', 'vehículos'],
  '🧹 Mantención': ['mantención', 'aseo', 'limpieza', 'residuos'],
  '🏭 Industria': ['maquinaria', 'minería', 'agrícola', 'forestal', 'energía', 'combustible'],
  '💼 Servicios': ['consultoría', 'jurídico', 'recursos humanos', 'seguros', 'marketing'],
  '🍽️ Suministros': ['alimentos', 'vestuario', 'uniformes', 'mobiliario', 'hotelería', 'imprenta'],
  '🔒 Seguridad': ['seguridad'],
}
const MODULE_LABELS: Record<string, string> = {
  licitaciones: 'Licitaciones',
  prospector:   'Prospección B2B',
  inmobiliaria: 'Inmobiliaria',
  adjudicadas:  'Mercado Público',
}
const ROLES   = ['admin', 'member'] as const

type Tab = 'tenants' | 'usuarios' | 'planes' | 'stats' | 'actividad' | 'reportes' | 'email'

function Badge({ active }: { active: boolean }) {
  return (
    <span className={clsx('badge', active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600')}>
      {active ? 'Activo' : 'Inactivo'}
    </span>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-ink-9 text-base">{title}</h3>
          <button onClick={onClose} className="text-ink-4 hover:text-ink-6"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Tab: Stats ────────────────────────────────────────────────────────────────

function StatsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api.get('/admin/stats').then(r => r.data),
  })
  if (isLoading) return <p className="text-ink-5 text-sm">Cargando métricas...</p>
  const t = data?.totales
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Tenants total',   value: t?.tenants },
          { label: 'Tenants activos', value: t?.tenants_activos },
          { label: 'Usuarios',        value: t?.usuarios },
          { label: 'Prospectos',      value: t?.prospectos },
          { label: 'Mensajes',        value: t?.mensajes },
        ].map(s => (
          <div key={s.label} className="card p-4 text-center">
            <p className="text-2xl font-bold text-ink-9">{s.value ?? '—'}</p>
            <p className="text-xs text-ink-5 mt-1">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="card p-5">
        <h3 className="font-semibold text-ink-9 mb-3">Prospectos por tenant (top 10)</h3>
        <div className="space-y-2">
          {data?.prospectos_por_tenant?.map((row: any) => (
            <div key={row.tenant} className="flex justify-between items-center text-sm">
              <span className="text-ink-7">{row.tenant}</span>
              <span className="font-semibold text-kap-600">{row.prospectos}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Modal niche_config ────────────────────────────────────────────────────────

function NicheConfigModal({ tenantId, modulo, onClose }: { tenantId: string; modulo: any; onClose: () => void }) {
  const [json, setJson] = useState(JSON.stringify(modulo.niche_config || {}, null, 2))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const guardar = async () => {
    try {
      JSON.parse(json)
    } catch {
      setError('JSON inválido — revisa la sintaxis')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/v1/admin/tenants/${tenantId}/modules/${modulo.id}/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${JSON.parse(localStorage.getItem('kapturo-auth-v2') || '{}')?.state?.token || ''}`,
        },
        body: json,
      })
      if (!res.ok) {
        const detail = await res.text()
        throw new Error(`${res.status}: ${detail}`)
      }
      onClose()
    } catch (e: any) {
      setError(`Error al guardar: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-ink-8">Configuración — {modulo.module}</h3>
          <button onClick={onClose} className="text-ink-4 hover:text-ink-6"><X size={18} /></button>
        </div>
        <p className="text-xs text-ink-5">Edita el JSON de configuración para este módulo. Usa <code className="bg-ink-2 px-1 rounded">ubicacion</code>, <code className="bg-ink-2 px-1 rounded">queries</code>, <code className="bg-ink-2 px-1 rounded">producto</code>, <code className="bg-ink-2 px-1 rounded">nicho</code>.</p>
        <textarea
          value={json}
          onChange={e => { setJson(e.target.value); setError('') }}
          rows={12}
          className="w-full font-mono text-xs border border-ink-3 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-kap-500 resize-none"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-ink-6 hover:text-ink-8">Cancelar</button>
          <button onClick={guardar} disabled={saving} className="px-4 py-2 text-sm bg-kap-600 text-white rounded-lg hover:bg-kap-700 disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Vista detalle de un tenant ────────────────────────────────────────────────

function TenantDetalle({ tenantId, onBack }: { tenantId: string; onBack: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { startImpersonation } = useAuthStore()
  const [editNombre, setEditNombre] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [showCrearUser, setShowCrearUser] = useState(false)
  const [showModulo, setShowModulo] = useState(false)
  const [showPlan, setShowPlan] = useState(false)
  const [userForm, setUserForm] = useState({ email: '', full_name: '', password: '', role: 'admin' })
  const [selectedModulo, setSelectedModulo] = useState<string>(MODULES[0])
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [impersonateLoading, setImpersonateLoading] = useState<Record<string, boolean>>({})
  const [showRubros, setShowRubros] = useState(false)
  const [rubrosSeleccionados, setRubrosSeleccionados] = useState<string[]>([])
  const [nicheModalModulo, setNicheModalModulo] = useState<any>(null)
  const [categoriaAbierta, setCategoriaAbierta] = useState<string | null>(null)
  const [buscarRubro, setBuscarRubro] = useState('')

  const { data: rubrosData, isLoading: rubrosLoading } = useQuery({
    queryKey: ['admin-rubros', tenantId],
    queryFn: () => api.get(`/admin/tenants/${tenantId}/adjudicadas-rubros`).then(r => r.data),
    enabled: showRubros,
  })
  const saveRubrosMutation = useMutation({
    mutationFn: (rubros: string[]) => api.put(`/admin/tenants/${tenantId}/adjudicadas-rubros`, { rubros }),
    onSuccess: (_, rubros) => {
      qc.invalidateQueries({ queryKey: ['admin-rubros', tenantId] })
      toast.success(`${rubros.length} rubros guardados correctamente`)
      setShowRubros(false)
    },
    onError: (err: any) => alert(`Error: ${err?.response?.data?.detail ?? err?.message}`),
  })

  const verComo = async (userId: string) => {
    setImpersonateLoading(p => ({ ...p, [userId]: true }))
    try {
      const res = await api.post(`/admin/impersonate/${userId}`)
      await startImpersonation(res.data.access_token, res.data.user)
      navigate('/dashboard')
    } catch {
      alert('Error al impersonar usuario')
    } finally {
      setImpersonateLoading(p => ({ ...p, [userId]: false }))
    }
  }

  const { data: t, isLoading } = useQuery({
    queryKey: ['admin-tenant', tenantId],
    queryFn: () => api.get(`/admin/tenants/${tenantId}`).then(r => r.data),
  })
  const { data: planesData } = useQuery({
    queryKey: ['admin-plans'],
    queryFn: () => api.get('/admin/plans').then(r => r.data),
  })

  // Sincronizar rubrosSeleccionados cuando cargan
  useEffect(() => {
    if (rubrosData?.habilitados) setRubrosSeleccionados(rubrosData.habilitados)
  }, [rubrosData])

  const renombrarMutation = useMutation({
    mutationFn: (name: string) => api.put(`/admin/tenants/${tenantId}`, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenant', tenantId] })
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
      setEditNombre(false)
    },
  })
  const asignarPlanMutation = useMutation({
    mutationFn: (plan_id: string) => api.put(`/admin/tenants/${tenantId}`, { plan_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenant', tenantId] })
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
      setShowPlan(false)
    },
  })
  const crearUserMutation = useMutation({
    mutationFn: (d: typeof userForm) => api.post('/admin/users', { ...d, tenant_id: tenantId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenant', tenantId] })
      setShowCrearUser(false)
      setUserForm({ email: '', full_name: '', password: '', role: 'admin' })
    },
  })
  const toggleUserMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.put(`/admin/users/${id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-tenant', tenantId] }),
  })
  const asignarModuloMutation = useMutation({
    mutationFn: (module: string) => api.post(`/admin/tenants/${tenantId}/modules`, { module }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenant', tenantId] })
      setShowModulo(false)
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail
      const msg = !detail ? (err?.message ?? 'Error desconocido')
        : typeof detail === 'string' ? detail
        : JSON.stringify(detail)
      alert(`Error al activar módulo:\n${msg}`)
    },
  })
  const toggleModuloMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.put(`/admin/tenants/${tenantId}/modules/${id}`, null, { params: { is_active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-tenant', tenantId] }),
    onError: (err: any) => {
      const detail = err?.response?.data?.detail
      const msg = !detail ? (err?.message ?? 'Error desconocido')
        : typeof detail === 'string' ? detail
        : JSON.stringify(detail)
      alert(`Error al cambiar estado del módulo:\n${msg}`)
    },
  })
  const eliminarTenantMutation = useMutation({
    mutationFn: () => api.delete(`/admin/tenants/${tenantId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
      onBack()
    },
  })

  if (isLoading) return <p className="text-ink-5 text-sm">Cargando...</p>
  if (!t) return null

  return (
    <div className="space-y-5">
      {nicheModalModulo && (
        <NicheConfigModal
          tenantId={tenantId}
          modulo={nicheModalModulo}
          onClose={() => setNicheModalModulo(null)}
        />
      )}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-ink-4 hover:text-ink-7">
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1">
          {editNombre ? (
            <div className="flex items-center gap-2">
              <input
                className="input text-lg font-bold py-1"
                value={nuevoNombre}
                onChange={e => setNuevoNombre(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && renombrarMutation.mutate(nuevoNombre)}
              />
              <button
                className="btn-primary text-sm flex items-center gap-1"
                onClick={() => renombrarMutation.mutate(nuevoNombre)}
              >
                <Save size={13} /> Guardar
              </button>
              <button className="btn-ghost text-sm" onClick={() => setEditNombre(false)}>
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-ink-9">{t.name}</h2>
              <button
                onClick={() => { setNuevoNombre(t.name); setEditNombre(true) }}
                className="text-ink-4 hover:text-ink-6"
              >
                <Pencil size={14} />
              </button>
            </div>
          )}
          <p className="text-xs text-ink-4 mt-0.5">
            <code className="bg-ink-2 px-1 rounded">{t.slug}</code>
            {' · Creado '}{new Date(t.created_at).toLocaleDateString('es-CL')}
          </p>
        </div>
        <Badge active={t.is_active} />
      </div>

      <div className="card p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-ink-4 uppercase tracking-wide font-medium">Plan actual</p>
          <p className="font-semibold text-ink-9 capitalize mt-0.5">
            {t.plan?.name ?? 'Sin plan'}
            {t.plan ? ` — $${t.plan.price_usd}/mes` : ''}
          </p>
        </div>
        <button
          className="btn-primary text-sm flex items-center gap-1.5"
          onClick={() => { setSelectedPlanId(t.plan?.id ?? ''); setShowPlan(true) }}
        >
          <CreditCard size={14} /> Cambiar plan
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-ink-7 text-sm">Usuarios ({t.usuarios?.length})</h3>
            <button
              className="text-kap-600 hover:text-kap-700 flex items-center gap-1 text-xs font-medium"
              onClick={() => setShowCrearUser(true)}
            >
              <UserPlus size={13} /> Crear usuario
            </button>
          </div>
          <div className="space-y-2">
            {t.usuarios?.length === 0 && <p className="text-xs text-ink-4">Sin usuarios</p>}
            {t.usuarios?.map((u: any) => (
              <div key={u.id} className="flex justify-between items-center text-sm">
                <div>
                  <p className="font-medium text-ink-9 leading-tight">{u.full_name}</p>
                  <p className="text-ink-4 text-xs">{u.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="badge bg-ink-2 text-ink-6 capitalize text-xs">{u.role}</span>
                  {u.role === 'admin' && (
                    <button
                      title="Ver como este usuario"
                      onClick={() => verComo(u.id)}
                      disabled={impersonateLoading[u.id]}
                      className="text-purple-500 hover:text-purple-700 disabled:opacity-50"
                    >
                      {impersonateLoading[u.id]
                        ? <Loader2 size={15} className="animate-spin" />
                        : <Eye size={15} />}
                    </button>
                  )}
                  <button
                    title={u.is_active ? 'Desactivar' : 'Activar'}
                    onClick={() => toggleUserMutation.mutate({ id: u.id, is_active: !u.is_active })}
                    className="text-ink-4 hover:text-ink-7"
                  >
                    {u.is_active
                      ? <ToggleRight size={16} className="text-emerald-500" />
                      : <ToggleLeft size={16} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-ink-7 text-sm">Módulos</h3>
            <div className="flex items-center gap-2">
              {t.modulos?.some((m: any) => m.module === 'adjudicadas' && m.is_active) && (
                <button
                  className="text-kap-600 hover:text-kap-600 flex items-center gap-1 text-xs font-medium"
                  onClick={() => { setRubrosSeleccionados([]); setShowRubros(true) }}
                >
                  <SlidersHorizontal size={13} /> Rubros
                </button>
              )}
              <button
                className="text-kap-600 hover:text-kap-700 flex items-center gap-1 text-xs font-medium"
                onClick={() => setShowModulo(true)}
              >
                <Package size={13} /> Activar módulo
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {t.modulos?.length === 0 && <p className="text-xs text-ink-4">Sin módulos asignados</p>}
            {t.modulos?.map((m: any) => (
              <div key={m.id} className="flex justify-between items-center text-sm">
                <span className="text-ink-7">{MODULE_LABELS[m.module] ?? m.module.replace('_', ' ')}</span>
                <div className="flex items-center gap-2">
                  <button
                    title="Editar configuración"
                    onClick={() => setNicheModalModulo(m)}
                    className="text-ink-4 hover:text-kap-600 text-xs">
                    ⚙
                  </button>
                  <button
                    title={m.is_active ? 'Desactivar' : 'Activar'}
                    onClick={() => toggleModuloMutation.mutate({ id: m.id, is_active: !m.is_active })}
                    className="text-ink-4 hover:text-ink-7"
                  >
                    {m.is_active
                      ? <ToggleRight size={16} className="text-emerald-500" />
                      : <ToggleLeft size={16} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {t.apis?.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-ink-7 text-sm flex items-center gap-1.5">
              <DollarSign size={14} className="text-emerald-500" /> APIs activas
            </h3>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              ~${t.costo_estimado_usd}/mes
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-ink-4 uppercase tracking-wide border-b border-ink-2">
                  <th className="text-left pb-2 font-medium">API</th>
                  <th className="text-left pb-2 font-medium">Uso</th>
                  <th className="text-right pb-2 font-medium">Costo/mes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-2">
                {t.apis.map((a: any) => (
                  <tr key={a.api} className="py-1">
                    <td className="py-1.5 font-medium text-ink-7">{a.api}</td>
                    <td className="py-1.5 text-ink-5">{a.uso}</td>
                    <td className="py-1.5 text-right font-semibold text-ink-8">
                      {a.costo_usd === 0 ? <span className="text-emerald-600">Gratis</span> : `$${a.costo_usd}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {t.total_prospectos != null && (
            <p className="text-xs text-ink-4 mt-2">
              Basado en {t.total_prospectos} prospectos actuales
            </p>
          )}
        </div>
      )}

      <div className="border border-red-200 rounded-xl p-4 bg-red-50">
        <p className="text-sm font-medium text-red-700 mb-2">Zona peligrosa</p>
        <button
          className="text-sm text-red-600 hover:text-red-800 flex items-center gap-1.5 font-medium"
          onClick={() => {
            if (window.confirm(`¿Eliminar "${t.name}" y TODOS sus datos? Esto es irreversible.`)) {
              eliminarTenantMutation.mutate()
            }
          }}
        >
          <Trash2 size={14} /> Eliminar tenant permanentemente
        </button>
      </div>

      {showRubros && (
        <Modal title={`Rubros habilitados — ${t.name}`} onClose={() => setShowRubros(false)}>
          {rubrosLoading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Loader2 size={24} className="text-kap-600 animate-spin" />
              <p className="text-sm text-ink-5">Cargando rubros...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Buscador */}
              <input
                type="text"
                placeholder="Buscar rubro..."
                value={buscarRubro}
                onChange={e => { setBuscarRubro(e.target.value); setCategoriaAbierta(null) }}
                className="input text-sm py-2"
              />

              {/* Header acciones rápidas */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-ink-5">{rubrosSeleccionados.length} de {rubrosData?.todos?.length ?? 0} seleccionados</p>
                <div className="flex gap-3">
                  <button className="text-xs text-kap-600 font-medium" onClick={() => setRubrosSeleccionados(rubrosData?.todos ?? [])}>Seleccionar todos</button>
                  <span className="text-ink-4">|</span>
                  <button className="text-xs text-ink-4" onClick={() => setRubrosSeleccionados([])}>Limpiar</button>
                </div>
              </div>

              {/* Accordion de categorías / resultados búsqueda */}
              <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
                {buscarRubro.trim() ? (
                  // Vista búsqueda: lista plana filtrada
                  <div className="border border-ink-3 rounded-xl overflow-hidden">
                    {(rubrosData?.todos ?? [])
                      .filter((r: string) => r.toLowerCase().includes(buscarRubro.toLowerCase()))
                      .map((r: string) => {
                        const activo = rubrosSeleccionados.includes(r)
                        return (
                          <button
                            key={r}
                            onClick={() => setRubrosSeleccionados(prev =>
                              prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]
                            )}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-left active:bg-kap-100 border-b border-ink-2 last:border-0"
                          >
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${activo ? 'bg-kap-600 border-kap-600' : 'bg-ink-0 border-ink-3'}`}>
                              {activo && <svg width="8" height="6" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                            </div>
                            <span className={`text-xs capitalize ${activo ? 'text-ink-9 font-medium' : 'text-ink-6'}`}>{r}</span>
                          </button>
                        )
                      })}
                  </div>
                ) : (Object.entries(RUBROS_CATEGORIAS).map(([categoria, rubrosDeCategoria]) => {
                  const disponibles = rubrosDeCategoria.filter(r => (rubrosData?.todos ?? []).includes(r))
                  if (disponibles.length === 0) return null
                  const activosEnCategoria = disponibles.filter(r => rubrosSeleccionados.includes(r)).length
                  const abierta = categoriaAbierta === categoria
                  const todosSeleccionados = activosEnCategoria === disponibles.length
                  return (
                    <div key={categoria} className="border border-ink-3 rounded-xl overflow-hidden">
                      {/* Cabecera del acordeón */}
                      <div className="flex items-center px-3 py-2.5 bg-white active:bg-ink-1">
                        <button className="flex-1 flex items-center gap-2 text-left" onClick={() => setCategoriaAbierta(abierta ? null : categoria)}>
                          <span className="text-sm font-medium text-ink-8">{categoria}</span>
                          {activosEnCategoria > 0 && (
                            <span className="bg-kap-100 text-kap-600 text-xs font-semibold px-2 py-0.5 rounded-full">{activosEnCategoria}</span>
                          )}
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            className="text-xs text-kap-600 hover:text-kap-600 font-medium whitespace-nowrap"
                            onClick={() => { if (todosSeleccionados) { setRubrosSeleccionados(prev => prev.filter(r => !disponibles.includes(r))) } else { setRubrosSeleccionados(prev => Array.from(new Set([...prev, ...disponibles]))) } }}
                          >
                            {todosSeleccionados ? 'Desmarcar' : 'Seleccionar todos'}
                          </button>
                          <span className="text-xs text-ink-4">{activosEnCategoria}/{disponibles.length}</span>
                          <ChevronDown size={16} className={`text-ink-4 transition-transform cursor-pointer ${abierta ? 'rotate-180' : ''}`} onClick={() => setCategoriaAbierta(abierta ? null : categoria)} />
                        </div>
                      </div>

                      {/* Checklist desplegable */}
                      {abierta && (
                        <div className="border-t border-ink-2 bg-ink-1">
                          <div className="px-3 py-1.5 border-b border-ink-2 flex justify-between items-center">
                            <span className="text-xs text-ink-4">Categoría</span>
                            <button
                              className="text-xs text-kap-600 font-medium"
                              onClick={() => {
                                if (todosSeleccionados) {
                                  setRubrosSeleccionados(prev => prev.filter(r => !disponibles.includes(r)))
                                } else {
                                  setRubrosSeleccionados(prev => Array.from(new Set([...prev, ...disponibles])))
                                }
                              }}
                            >
                              {todosSeleccionados ? 'Desmarcar todos' : 'Marcar todos'}
                            </button>
                          </div>
                          <div className="grid grid-cols-2">
                            {disponibles.map(r => {
                              const activo = rubrosSeleccionados.includes(r)
                              return (
                                <button
                                  key={r}
                                  onClick={() => setRubrosSeleccionados(prev =>
                                    prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]
                                  )}
                                  className="flex items-center gap-2 px-3 py-2 text-left active:bg-kap-100 border-b border-r border-ink-2"
                                >
                                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                                    activo ? 'bg-kap-600 border-kap-600' : 'bg-ink-0 border-ink-3'
                                  }`}>
                                    {activo && <svg width="8" height="6" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                  </div>
                                  <span className={`text-xs capitalize truncate ${activo ? 'text-ink-9 font-medium' : 'text-ink-6'}`}>{r}</span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                }))}
              </div>

              {/* Footer sticky */}
              <div className="flex gap-2 pt-2 border-t border-ink-2">
                <button className="btn-ghost text-sm flex-1" onClick={() => setShowRubros(false)}>Cancelar</button>
                <button
                  className="btn-primary text-sm flex-1 flex items-center justify-center gap-1.5 disabled:opacity-40"
                  onClick={() => {
                    if (rubrosSeleccionados.length === 0) { alert('Debes seleccionar al menos 1 rubro.'); return }
                    saveRubrosMutation.mutate(rubrosSeleccionados)
                  }}
                  disabled={saveRubrosMutation.isPending}
                >
                  <Save size={13} />
                  {saveRubrosMutation.isPending ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {showCrearUser && (
        <Modal title={`Crear usuario en ${t.name}`} onClose={() => setShowCrearUser(false)}>
          <div className="space-y-3">
            <input
              className="input" placeholder="Nombre completo" value={userForm.full_name}
              onChange={e => setUserForm(f => ({ ...f, full_name: e.target.value }))}
            />
            <input
              className="input" placeholder="Email" type="email" value={userForm.email}
              onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))}
            />
            <input
              className="input" placeholder="Contraseña" type="password" value={userForm.password}
              onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))}
            />
            <select
              className="input" value={userForm.role}
              onChange={e => setUserForm(f => ({ ...f, role: e.target.value }))}
            >
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            {crearUserMutation.isError && <p className="text-xs text-red-600">Error al crear usuario</p>}
            <div className="flex gap-2 pt-1">
              <button
                className="btn-primary text-sm flex-1"
                onClick={() => crearUserMutation.mutate(userForm)}
                disabled={!userForm.email || !userForm.full_name || !userForm.password || crearUserMutation.isPending}
              >
                {crearUserMutation.isPending ? 'Creando...' : 'Crear usuario'}
              </button>
              <button className="btn-ghost text-sm" onClick={() => setShowCrearUser(false)}>Cancelar</button>
            </div>
          </div>
        </Modal>
      )}

      {showModulo && (
        <Modal title="Activar módulo" onClose={() => setShowModulo(false)}>
          <div className="space-y-3">
            <select
              className="input" value={selectedModulo}
              onChange={e => setSelectedModulo(e.target.value)}
            >
              {MODULES.map(m => <option key={m} value={m}>{MODULE_LABELS[m] ?? m}</option>)}
            </select>
            <p className="text-xs text-ink-4">
              Si el módulo ya existe, se reactivará automáticamente.
            </p>
            {asignarModuloMutation.isError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                Error al activar módulo. Intenta de nuevo.
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                className="btn-primary text-sm flex-1"
                onClick={() => asignarModuloMutation.mutate(selectedModulo)}
                disabled={asignarModuloMutation.isPending}
              >
                {asignarModuloMutation.isPending ? 'Activando...' : 'Activar módulo'}
              </button>
              <button className="btn-ghost text-sm" onClick={() => setShowModulo(false)}>Cancelar</button>
            </div>
          </div>
        </Modal>
      )}

      {showPlan && (
        <Modal title="Asignar plan" onClose={() => setShowPlan(false)}>
          <div className="space-y-3">
            <select
              className="input" value={selectedPlanId}
              onChange={e => setSelectedPlanId(e.target.value)}
            >
              <option value="">Sin plan</option>
              {planesData?.planes?.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name} — ${p.price_usd}/mes</option>
              ))}
            </select>
            {(!planesData?.planes || planesData.planes.length === 0) && (
              <p className="text-xs text-amber-600">No hay planes. Créalos en la pestaña Planes.</p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                className="btn-primary text-sm flex-1"
                onClick={() => asignarPlanMutation.mutate(selectedPlanId)}
                disabled={asignarPlanMutation.isPending}
              >
                {asignarPlanMutation.isPending ? 'Guardando...' : 'Guardar plan'}
              </button>
              <button className="btn-ghost text-sm" onClick={() => setShowPlan(false)}>Cancelar</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Tab: Tenants ──────────────────────────────────────────────────────────────

const MODULE_ICONS: Record<string, string> = {
  adjudicadas:  '🏆',
  licitaciones: '📄',
  prospector:   '🔍',
  inmobiliaria: '🏠',
  licitador:    '📋',
  kapturo_ventas: '💼',
}

function TenantCard({ t, onDelete, isExpanded, onToggle }: { t: any; onDelete: () => void; isExpanded: boolean; onToggle: () => void }) {
  const { startImpersonation } = useAuthStore()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const expanded = isExpanded
  const setExpanded = (_v: boolean | ((prev: boolean) => boolean)) => onToggle()
  const [loadingUser, setLoadingUser] = useState<string | null>(null)

  // Edición nombre
  const [editNombre, setEditNombre] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState(t.name)

  // Modales internos
  const [showCrearUser, setShowCrearUser] = useState(false)
  const [showModulo, setShowModulo] = useState(false)
  const [showPlan, setShowPlan] = useState(false)
  const [nicheModalModulo, setNicheModalModulo] = useState<any>(null)
  const [userForm, setUserForm] = useState({ email: '', full_name: '', password: '', role: 'admin' })
  const [selectedModulo, setSelectedModulo] = useState<string>(MODULES[0])
  const [selectedPlanId, setSelectedPlanId] = useState('')

  // Rubros inline
  const [showRubros, setShowRubros] = useState(false)
  const [rubrosSeleccionados, setRubrosSeleccionados] = useState<string[]>([])
  const [buscarRubro, setBuscarRubro] = useState('')
  const [categoriaAbierta, setCategoriaAbierta] = useState<string | null>(null)

  // Fetch detalle cuando se expande
  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['admin-tenant', t.id],
    queryFn: () => api.get(`/admin/tenants/${t.id}`).then(r => r.data),
    enabled: expanded,
  })
  const { data: planesData } = useQuery({
    queryKey: ['admin-plans'],
    queryFn: () => api.get('/admin/plans').then(r => r.data),
    enabled: expanded && showPlan,
  })
  const { data: rubrosData, isLoading: rubrosLoading } = useQuery({
    queryKey: ['admin-rubros', t.id],
    queryFn: () => api.get(`/admin/tenants/${t.id}/adjudicadas-rubros`).then(r => r.data),
    enabled: expanded && (t.modulos_activos ?? []).includes('adjudicadas'),
  })

  useEffect(() => {
    if (rubrosData?.habilitados) setRubrosSeleccionados(rubrosData.habilitados)
  }, [rubrosData])

  const modulosActivos: string[] = t.modulos_activos ?? []
  const admins = (detail?.usuarios ?? t.usuarios ?? []).filter((u: any) => u.role === 'admin' && u.is_active)

  // ── Mutations ──
  const toggleTenantMutation = useMutation({
    mutationFn: (is_active: boolean) => api.put(`/admin/tenants/${t.id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-tenants'] }),
  })
  const renombrarMutation = useMutation({
    mutationFn: (name: string) => api.put(`/admin/tenants/${t.id}`, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenant', t.id] })
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
      setEditNombre(false)
    },
  })
  const asignarPlanMutation = useMutation({
    mutationFn: (plan_id: string) => api.put(`/admin/tenants/${t.id}`, { plan_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenant', t.id] })
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
      setShowPlan(false)
    },
  })
  const crearUserMutation = useMutation({
    mutationFn: (d: typeof userForm) => api.post('/admin/users', { ...d, tenant_id: t.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenant', t.id] })
      setShowCrearUser(false)
      setUserForm({ email: '', full_name: '', password: '', role: 'admin' })
    },
  })
  const toggleUserMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.put(`/admin/users/${id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-tenant', t.id] }),
  })
  const asignarModuloMutation = useMutation({
    mutationFn: (module: string) => api.post(`/admin/tenants/${t.id}/modules`, { module }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenant', t.id] })
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
      setShowModulo(false)
    },
    onError: (err: any) => {
      const detail2 = err?.response?.data?.detail
      const msg = !detail2 ? (err?.message ?? 'Error desconocido')
        : typeof detail2 === 'string' ? detail2 : JSON.stringify(detail2)
      alert(`Error al activar módulo:\n${msg}`)
    },
  })
  const toggleModuloMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.put(`/admin/tenants/${t.id}/modules/${id}`, null, { params: { is_active } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenant', t.id] })
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
    },
  })
  const saveRubrosMutation = useMutation({
    mutationFn: (rubros: string[]) => api.put(`/admin/tenants/${t.id}/adjudicadas-rubros`, { rubros }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-rubros', t.id] })
      setShowRubros(false)
    },
    onError: (err: any) => alert(`Error: ${err?.response?.data?.detail ?? err?.message}`),
  })

  const verComo = async (userId: string, destino = '/dashboard') => {
    setLoadingUser(userId)
    try {
      const res = await api.post(`/admin/impersonate/${userId}`)
      await startImpersonation(res.data.access_token, res.data.user)
      navigate(destino)
    } catch { alert('Error al acceder como usuario') }
    finally { setLoadingUser(null) }
  }

  return (
    <div className={`card border-l-4 transition-all ${t.is_active ? 'border-l-emerald-400' : 'border-l-ink-3'} ${expanded ? 'col-span-1 lg:col-span-2' : ''}`}>
      {nicheModalModulo && (
        <NicheConfigModal
          tenantId={t.id}
          modulo={nicheModalModulo}
          onClose={() => setNicheModalModulo(null)}
        />
      )}
      {/* ── Header siempre visible (clickeable para expandir) ── */}
      <div
        className="p-4 flex items-start justify-between cursor-pointer select-none hover:bg-ink-1/50 rounded-t-xl transition-colors"
        onClick={() => onToggle()}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-ink-9 text-base truncate">{t.name}</h3>
            <Badge active={t.is_active} />
          </div>
          <p className="text-xs text-ink-4 mt-0.5">{t.slug} · {t.num_prospectos} prospectos{t.num_rubros != null ? ` · ${t.num_rubros} rubros MP` : ''}</p>
          {/* módulos como badges compactos */}
          {modulosActivos.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {modulosActivos.map((m: string) => (
                <span key={m} className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-kap-100 text-kap-600 text-xs rounded-full border border-kap-300">
                  {MODULE_ICONS[m] ?? '📦'} {MODULE_LABELS[m] ?? m}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 ml-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <button
            title={t.is_active ? 'Desactivar' : 'Activar'}
            onClick={() => toggleTenantMutation.mutate(!t.is_active)}
            className="p-1 text-ink-4 hover:text-ink-6"
          >
            {t.is_active ? <ToggleRight size={20} className="text-emerald-500" /> : <ToggleLeft size={20} />}
          </button>
          <button onClick={onDelete} className="p-1 text-ink-4 hover:text-red-500">
            <Trash2 size={15} />
          </button>
          <ChevronDown size={16} className={`text-ink-4 transition-transform ml-1 ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* ── Panel expandido ── */}
      {expanded && (
        <div className="border-t border-ink-2 px-4 py-3 space-y-3 bg-ink-1/50">
          {loadingDetail && !detail ? (
            <div className="flex items-center gap-2 text-xs text-ink-4 py-2">
              <Loader2 size={14} className="animate-spin" /> Cargando...
            </div>
          ) : (
            <>
              {/* ── Fila: nombre + plan ── */}
              <div className="flex items-center gap-3 flex-wrap">
                {editNombre ? (
                  <>
                    <input className="input text-xs py-1 flex-1 min-w-0" value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} onKeyDown={e => e.key === 'Enter' && renombrarMutation.mutate(nuevoNombre)} autoFocus />
                    <button className="btn-primary text-xs px-2 py-1" onClick={() => renombrarMutation.mutate(nuevoNombre)}>{renombrarMutation.isPending ? '...' : 'Guardar'}</button>
                    <button className="btn-ghost text-xs py-1" onClick={() => setEditNombre(false)}>Cancelar</button>
                  </>
                ) : (
                  <button onClick={() => { setNuevoNombre(detail?.name ?? t.name); setEditNombre(true) }} className="flex items-center gap-1 text-xs text-ink-5 hover:text-ink-8">
                    <Pencil size={11} /> Renombrar
                  </button>
                )}
                <span className="text-xs text-ink-4 ml-auto">
                  Plan: <strong className="text-ink-7">{detail?.plan?.name ?? 'Sin plan'}</strong>
                </span>
                <button className="text-xs text-kap-600 hover:underline" onClick={() => { setSelectedPlanId(detail?.plan?.id ?? ''); setShowPlan(true) }}>
                  Cambiar plan
                </button>
              </div>

              {/* ── Grid: usuarios + módulos ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

                {/* Usuarios */}
                <div className="bg-white rounded-xl border border-ink-3 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-ink-6">👤 Usuarios ({detail?.usuarios?.length ?? 0})</p>
                    <button onClick={() => setShowCrearUser(v => !v)} className="text-xs text-kap-600 hover:underline flex items-center gap-0.5">
                      <UserPlus size={11} /> Crear
                    </button>
                  </div>
                  {showCrearUser && (
                    <div className="space-y-1.5 p-2.5 bg-ink-1 rounded-lg border border-ink-3">
                      <input className="input text-xs py-1" placeholder="Nombre" value={userForm.full_name} onChange={e => setUserForm(f => ({ ...f, full_name: e.target.value }))} />
                      <input className="input text-xs py-1" placeholder="Email" type="email" value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} />
                      <input className="input text-xs py-1" placeholder="Contraseña" type="password" value={userForm.password} onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))} />
                      <select className="input text-xs py-1" value={userForm.role} onChange={e => setUserForm(f => ({ ...f, role: e.target.value }))}>
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <div className="flex gap-1.5">
                        <button className="btn-primary text-xs py-1 px-2 flex-1" onClick={() => crearUserMutation.mutate(userForm)} disabled={!userForm.email || !userForm.full_name || !userForm.password || crearUserMutation.isPending}>
                          {crearUserMutation.isPending ? '...' : 'Crear'}
                        </button>
                        <button className="btn-ghost text-xs py-1" onClick={() => setShowCrearUser(false)}>Cancelar</button>
                      </div>
                    </div>
                  )}
                  <div className="divide-y divide-ink-2">
                    {!detail?.usuarios?.length && <p className="text-xs text-ink-4 italic py-1">Sin usuarios</p>}
                    {detail?.usuarios?.map((u: any) => (
                      <div key={u.id} className="flex items-center gap-2 py-1.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-ink-8 truncate">{u.full_name}</p>
                          <p className="text-xs text-ink-4 truncate">{u.email}</p>
                        </div>
                        <span className="text-xs text-ink-4 capitalize">{u.role}</span>
                        {u.role === 'admin' && (
                          <button onClick={() => verComo(u.id)} disabled={loadingUser === u.id} className="text-purple-400 hover:text-purple-600 disabled:opacity-40">
                            {loadingUser === u.id ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
                          </button>
                        )}
                        <button onClick={() => toggleUserMutation.mutate({ id: u.id, is_active: !u.is_active })} className="text-ink-4 hover:text-ink-6">
                          {u.is_active ? <ToggleRight size={15} className="text-emerald-500" /> : <ToggleLeft size={15} />}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Módulos */}
                <div className="bg-white rounded-xl border border-ink-3 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-ink-6">📦 Módulos ({detail?.modulos?.length ?? 0})</p>
                    <button onClick={() => setShowModulo(v => !v)} className="text-xs text-kap-600 hover:underline flex items-center gap-0.5">
                      <Package size={11} /> Activar
                    </button>
                  </div>
                  {showModulo && (
                    <div className="space-y-1.5 p-2.5 bg-ink-1 rounded-lg border border-ink-3">
                      <select className="input text-xs py-1" value={selectedModulo} onChange={e => setSelectedModulo(e.target.value)}>
                        {MODULES.map(m => <option key={m} value={m}>{MODULE_LABELS[m] ?? m}</option>)}
                      </select>
                      <div className="flex gap-1.5">
                        <button className="btn-primary text-xs py-1 px-2 flex-1" onClick={() => asignarModuloMutation.mutate(selectedModulo)} disabled={asignarModuloMutation.isPending}>
                          {asignarModuloMutation.isPending ? '...' : 'Activar'}
                        </button>
                        <button className="btn-ghost text-xs py-1" onClick={() => setShowModulo(false)}>Cancelar</button>
                      </div>
                    </div>
                  )}
                  <div className="divide-y divide-ink-2">
                    {!detail?.modulos?.length && <p className="text-xs text-ink-4 italic py-1">Sin módulos</p>}
                    {detail?.modulos?.map((m: any) => (
                      <div key={m.id} className="py-2 space-y-2">
                        <div className="flex items-center gap-2">
                          <span>{MODULE_ICONS[m.module] ?? '📦'}</span>
                          <span className="text-xs flex-1 text-ink-7 font-medium">{MODULE_LABELS[m.module] ?? m.module}</span>
                          <button
                            title="Editar configuración"
                            onClick={() => setNicheModalModulo(m)}
                            className="text-ink-4 hover:text-kap-600 text-xs">
                            ⚙
                          </button>
                          <button onClick={() => toggleModuloMutation.mutate({ id: m.id, is_active: !m.is_active })} className="text-ink-4 hover:text-ink-6">
                            {m.is_active ? <ToggleRight size={15} className="text-emerald-500" /> : <ToggleLeft size={15} />}
                          </button>
                        </div>

                        {/* ── Rubros seleccionables inline ── */}
                        {m.module === 'adjudicadas' && m.is_active && (
                          <div className="space-y-2 bg-kap-100/50 border border-kap-300 rounded-xl p-3">
                            <div>
                              <p className="text-xs font-semibold text-kap-600 uppercase tracking-wide">Rubros habilitados</p>
                              <p className="text-[10px] text-ink-4 mt-0.5">Activa/desactiva los rubros que verá este tenant en Mercado Público.</p>
                            </div>
                            {rubrosLoading ? (
                              <p className="text-xs text-ink-4 italic">cargando...</p>
                            ) : (
                              <>
                                {/* Buscador + acciones rápidas */}
                                <div className="flex items-center gap-2">
                                  <div className="relative flex-1">
                                    <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-4" />
                                    <input
                                      type="text"
                                      placeholder="Buscar rubro..."
                                      value={buscarRubro}
                                      onChange={e => setBuscarRubro(e.target.value)}
                                      className="w-full text-xs pl-6 pr-2 py-1.5 rounded-lg border border-ink-3 bg-white outline-none focus:border-kap-300"
                                    />
                                  </div>
                                  <button
                                    className="text-xs text-kap-600 font-medium px-2 py-1 rounded-lg hover:bg-kap-100 whitespace-nowrap"
                                    onClick={() => setRubrosSeleccionados(rubrosData?.todos ?? [])}
                                  >Todos</button>
                                  <button
                                    className="text-xs text-ink-4 px-2 py-1 rounded-lg hover:bg-ink-2 whitespace-nowrap"
                                    onClick={() => setRubrosSeleccionados([])}
                                  >Ninguno</button>
                                </div>
                                {/* Grid de chips */}
                                <div className="grid grid-cols-2 gap-1 max-h-48 overflow-y-auto">
                                  {(rubrosData?.todos ?? [])
                                    .filter((r: string) => !buscarRubro || r.toLowerCase().includes(buscarRubro.toLowerCase()))
                                    .sort((a: string, b: string) => a.localeCompare(b))
                                    .map((r: string) => {
                                      const activo = rubrosSeleccionados.includes(r)
                                      return (
                                        <button
                                          key={r}
                                          onClick={() => setRubrosSeleccionados(prev =>
                                            prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]
                                          )}
                                          className={`flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-lg border text-left transition-colors ${
                                            activo
                                              ? 'bg-kap-100 text-white border-kap-300 font-medium'
                                              : 'bg-white text-ink-5 border-ink-3 hover:border-kap-300 hover:text-kap-600'
                                          }`}
                                        >
                                          <span className={`w-3 h-3 rounded-full border flex-shrink-0 flex items-center justify-center ${activo ? 'bg-white border-white' : 'border-ink-3'}`}>
                                            {activo && <span className="block w-1.5 h-1.5 rounded-full bg-kap-100" />}
                                          </span>
                                          <span className="capitalize truncate">{r}</span>
                                        </button>
                                      )
                                    })}
                                </div>
                                <div className="flex items-center gap-2 pt-2 border-t border-ink-2">
                                  <span className="text-xs text-ink-4">{rubrosSeleccionados.length} seleccionados</span>
                                  {JSON.stringify([...rubrosSeleccionados].sort()) !== JSON.stringify([...(rubrosData?.habilitados ?? [])].sort()) && (
                                    <button className="text-xs text-ink-4 hover:text-ink-6" onClick={() => setRubrosSeleccionados(rubrosData?.habilitados ?? [])}>
                                      Descartar
                                    </button>
                                  )}
                                  <button
                                    className="ml-auto btn-primary text-xs py-1 px-3 flex items-center gap-1 disabled:opacity-40"
                                    onClick={() => { if (!rubrosSeleccionados.length) { alert('Selecciona al menos 1 rubro'); return }; saveRubrosMutation.mutate(rubrosSeleccionados) }}
                                    disabled={saveRubrosMutation.isPending}
                                  >
                                    <Save size={11} /> {saveRubrosMutation.isPending ? 'Guardando...' : 'Guardar rubros'}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Acceso directo ── */}
              {admins.length > 0 && (
                <div className="flex items-center gap-3 flex-wrap pt-1">
                  <span className="text-xs text-ink-4 font-medium">Entrar como:</span>
                  {admins.map((u: any) => (
                    <div key={u.id} className="flex items-center gap-1">
                      <span className="text-xs text-ink-6 mr-1">{u.full_name}</span>
                      {modulosActivos.includes('adjudicadas') && (
                        <button onClick={() => verComo(u.id, '/adjudicadas')} disabled={loadingUser === u.id} title="Mercado Público" className="px-2 py-1 text-xs bg-kap-100 text-kap-600 hover:bg-kap-100 rounded-lg disabled:opacity-50">🏆</button>
                      )}
                      {modulosActivos.includes('licitaciones') && (
                        <button onClick={() => verComo(u.id, '/licitaciones')} disabled={loadingUser === u.id} title="Licitaciones" className="px-2 py-1 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg disabled:opacity-50">📄</button>
                      )}
                      {modulosActivos.includes('prospector') && (
                        <button onClick={() => verComo(u.id, '/prospeccion')} disabled={loadingUser === u.id} title="Prospección" className="px-2 py-1 text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg disabled:opacity-50">🔍</button>
                      )}
                      <button onClick={() => verComo(u.id, '/dashboard')} disabled={loadingUser === u.id} className="flex items-center gap-1 px-2 py-1 text-xs bg-ink-2 text-ink-6 hover:bg-ink-2 rounded-lg disabled:opacity-50">
                        {loadingUser === u.id ? <Loader2 size={11} className="animate-spin" /> : <><Eye size={11} /> Dashboard</>}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Modales secundarios (plan, rubros) */}
              {showRubros && (
                <Modal title={`Rubros — ${t.name}`} onClose={() => setShowRubros(false)}>
                  {rubrosLoading ? (
                    <div className="flex items-center gap-2 text-sm text-ink-4 py-6 justify-center"><Loader2 size={16} className="animate-spin" /> Cargando...</div>
                  ) : (
                    <div className="space-y-3">
                      <input type="text" placeholder="Buscar rubro..." value={buscarRubro} onChange={e => { setBuscarRubro(e.target.value); setCategoriaAbierta(null) }} className="input text-sm py-2" />
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-ink-5">{rubrosSeleccionados.length} de {rubrosData?.todos?.length ?? 0} seleccionados</p>
                        <div className="flex gap-3">
                          <button className="text-xs text-kap-600 font-medium" onClick={() => setRubrosSeleccionados(rubrosData?.todos ?? [])}>Todos</button>
                          <button className="text-xs text-ink-4" onClick={() => setRubrosSeleccionados([])}>Limpiar</button>
                        </div>
                      </div>
                      <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
                        {buscarRubro.trim() ? (
                          <div className="border border-ink-3 rounded-xl overflow-hidden">
                            {(rubrosData?.todos ?? []).filter((r: string) => r.toLowerCase().includes(buscarRubro.toLowerCase())).map((r: string) => {
                              const activo = rubrosSeleccionados.includes(r)
                              return (
                                <button key={r} onClick={() => setRubrosSeleccionados(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])}
                                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left border-b border-ink-2 last:border-0 hover:bg-kap-100">
                                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${activo ? 'bg-kap-600 border-kap-600' : 'bg-ink-0 border-ink-3'}`}>
                                    {activo && <svg width="8" height="6" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                  </div>
                                  <span className={`text-xs capitalize ${activo ? 'font-medium text-ink-9' : 'text-ink-6'}`}>{r}</span>
                                </button>
                              )
                            })}
                          </div>
                        ) : Object.entries(RUBROS_CATEGORIAS).map(([categoria, rubrosDeCategoria]) => {
                          const disponibles = rubrosDeCategoria.filter(r => (rubrosData?.todos ?? []).includes(r))
                          if (disponibles.length === 0) return null
                          const activosEnCategoria = disponibles.filter(r => rubrosSeleccionados.includes(r)).length
                          const abierta = categoriaAbierta === categoria
                          return (
                            <div key={categoria} className="border border-ink-3 rounded-xl overflow-hidden">
                              <div className="flex items-center px-3 py-2.5 bg-white hover:bg-ink-1">
                                <button className="flex-1 flex items-center gap-2 text-left" onClick={() => setCategoriaAbierta(abierta ? null : categoria)}>
                                  <span className="text-sm font-medium text-ink-8">{categoria}</span>
                                  {activosEnCategoria > 0 && <span className="bg-kap-100 text-kap-600 text-xs font-semibold px-2 py-0.5 rounded-full">{activosEnCategoria}</span>}
                                </button>
                                <div className="flex items-center gap-2">
                                  <button className="text-xs text-kap-600 hover:text-kap-600 font-medium whitespace-nowrap"
                                    onClick={e => { e.stopPropagation(); const todosSelec = disponibles.every(r => rubrosSeleccionados.includes(r)); setRubrosSeleccionados(prev => todosSelec ? prev.filter(r => !disponibles.includes(r)) : Array.from(new Set([...prev, ...disponibles]))) }}>
                                    {disponibles.every(r => rubrosSeleccionados.includes(r)) ? 'Desmarcar' : 'Seleccionar todos'}
                                  </button>
                                  <span className="text-xs text-ink-4">{activosEnCategoria}/{disponibles.length}</span>
                                  <ChevronDown size={14} className={`text-ink-4 transition-transform cursor-pointer ${abierta ? 'rotate-180' : ''}`} onClick={() => setCategoriaAbierta(abierta ? null : categoria)} />
                                </div>
                              </div>
                              {abierta && (
                                <div className="border-t border-ink-2 grid grid-cols-2 bg-ink-1">
                                  {disponibles.map(r => {
                                    const activo = rubrosSeleccionados.includes(r)
                                    return (
                                      <button key={r} onClick={() => setRubrosSeleccionados(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])}
                                        className="flex items-center gap-2 px-3 py-2 text-left hover:bg-kap-100 border-b border-r border-ink-2">
                                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${activo ? 'bg-kap-600 border-kap-600' : 'bg-ink-0 border-ink-3'}`}>
                                          {activo && <svg width="8" height="6" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                        </div>
                                        <span className={`text-xs capitalize truncate ${activo ? 'font-medium text-ink-9' : 'text-ink-6'}`}>{r}</span>
                                      </button>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      <div className="flex gap-2 pt-2 border-t border-ink-2">
                        <button className="btn-ghost text-sm flex-1" onClick={() => setShowRubros(false)}>Cancelar</button>
                        <button className="btn-primary text-sm flex-1 flex items-center justify-center gap-1.5 disabled:opacity-40"
                          onClick={() => { if (!rubrosSeleccionados.length) { alert('Selecciona al menos 1 rubro'); return }; saveRubrosMutation.mutate(rubrosSeleccionados) }}
                          disabled={saveRubrosMutation.isPending}>
                          <Save size={13} /> {saveRubrosMutation.isPending ? 'Guardando...' : 'Guardar rubros'}
                        </button>
                      </div>
                    </div>
                  )}
                </Modal>
              )}
              {showPlan && (
                <Modal title="Asignar plan" onClose={() => setShowPlan(false)}>
                  <div className="space-y-3">
                    <select className="input" value={selectedPlanId} onChange={e => setSelectedPlanId(e.target.value)}>
                      <option value="">Sin plan</option>
                      {planesData?.planes?.map((p: any) => (
                        <option key={p.id} value={p.id}>{p.name} — ${p.price_usd}/mes</option>
                      ))}
                    </select>
                    <div className="flex gap-2 pt-1">
                      <button className="btn-primary text-sm flex-1" onClick={() => asignarPlanMutation.mutate(selectedPlanId)} disabled={asignarPlanMutation.isPending}>
                        {asignarPlanMutation.isPending ? 'Guardando...' : 'Guardar plan'}
                      </button>
                      <button className="btn-ghost text-sm" onClick={() => setShowPlan(false)}>Cancelar</button>
                    </div>
                  </div>
                </Modal>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function TenantsTab() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ company_name: '', slug: '' })
  const [selectedModules, setSelectedModules] = useState<string[]>([])
  const [confirmDelete, setConfirmDelete] = useState<any>(null)
  const [expandedTenantId, setExpandedTenantId] = useState<string | null>(null)

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/tenants/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
      setConfirmDelete(null)
    },
  })

  const { data, isLoading } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => api.get('/admin/tenants').then(r => r.data),
  })
  const crearMutation = useMutation({
    mutationFn: (d: typeof form) => api.post('/admin/tenants', { ...d, modules: selectedModules }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
      setShowForm(false)
      setForm({ company_name: '', slug: '' })
      setSelectedModules([])
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail
      const msg = typeof detail === 'string' ? detail : (err?.message ?? 'Error al crear tenant')
      alert(`Error: ${msg}`)
    },
  })

  if (isLoading) return <p className="text-ink-5 text-sm">Cargando tenants...</p>

  return (
    <div className="space-y-4">
      {confirmDelete && (
        <Modal title="Eliminar tenant" onClose={() => setConfirmDelete(null)}>
          <p className="text-sm text-ink-6">
            ¿Eliminar <strong>{confirmDelete.name}</strong> y todos sus datos? Esto es <strong className="text-red-600">irreversible</strong>.
          </p>
          <div className="flex gap-2 pt-2">
            <button
              className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2"
              onClick={() => deleteMutation.mutate(confirmDelete.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <><Loader2 size={14} className="animate-spin" /> Eliminando...</> : <><Trash2 size={14} /> Eliminar</>}
            </button>
            <button className="btn-ghost text-sm flex-1" onClick={() => setConfirmDelete(null)}>Cancelar</button>
          </div>
          {deleteMutation.isError && <p className="text-xs text-red-600">Error al eliminar.</p>}
        </Modal>
      )}

      <div className="flex justify-between items-center">
        <p className="text-sm text-ink-5">{data?.total ?? 0} tenants en total</p>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={14} /> Nuevo tenant
        </button>
      </div>

      {showForm && (
        <div className="card p-4 space-y-3">
          <h3 className="font-semibold text-ink-9 text-sm">Crear tenant</h3>
          <input
            className="input" placeholder="Nombre de la empresa" value={form.company_name}
            onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
          />
          <input
            className="input" placeholder="Slug (opcional, se genera automático)" value={form.slug}
            onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
          />
          <div>
            <p className="text-xs font-medium text-ink-6 mb-1.5">Módulos a activar</p>
            <div className="flex flex-wrap gap-2">
              {MODULES.map(m => (
                <label key={m} className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-ink-7">
                  <input
                    type="checkbox"
                    checked={selectedModules.includes(m)}
                    onChange={e => setSelectedModules(prev =>
                      e.target.checked ? [...prev, m] : prev.filter(x => x !== m)
                    )}
                  />
                  {MODULE_LABELS[m] ?? m}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary text-sm" onClick={() => crearMutation.mutate(form)} disabled={!form.company_name || crearMutation.isPending}>
              {crearMutation.isPending ? 'Creando...' : 'Crear'}
            </button>
            <button className="btn-ghost text-sm" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data?.tenants?.map((t: any) => (
          <TenantCard
            key={t.id}
            t={t}
            onDelete={() => setConfirmDelete(t)}
            isExpanded={expandedTenantId === t.id}
            onToggle={() => setExpandedTenantId(prev => prev === t.id ? null : t.id)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Tab: Usuarios ─────────────────────────────────────────────────────────────

function UsuariosTab() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ email: '', full_name: '', password: '', role: 'admin', tenant_id: '' })
  const [editUser, setEditUser] = useState<any>(null)
  const [editForm, setEditForm] = useState({ full_name: '', email: '', password: '', role: 'admin' })
  const [showEditPass, setShowEditPass] = useState(false)
  const [showCreatePass, setShowCreatePass] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get('/admin/users').then(r => r.data),
  })
  const { data: tenantsData } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => api.get('/admin/tenants').then(r => r.data),
  })
  const crearMutation = useMutation({
    mutationFn: (d: typeof form) => api.post('/admin/users', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      setShowForm(false)
      setForm({ email: '', full_name: '', password: '', role: 'admin', tenant_id: '' })
    },
  })
  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.put(`/admin/users/${id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })
  const cambiarRolMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      api.put(`/admin/users/${id}`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })
  const editarMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/admin/users/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      setEditUser(null)
    },
    onError: (err: any) => alert(err?.response?.data?.detail ?? 'Error al guardar'),
  })

  if (isLoading) return <p className="text-ink-5 text-sm">Cargando usuarios...</p>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-ink-5">{data?.total} usuarios en total</p>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2 text-sm">
          <UserPlus size={14} /> Nuevo usuario
        </button>
      </div>

      {showForm && (
        <div className="card p-4 space-y-3">
          <h3 className="font-semibold text-ink-9 text-sm">Crear usuario</h3>
          <input
            className="input" placeholder="Nombre completo" value={form.full_name}
            onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
          />
          <input
            className="input" placeholder="Email" type="email" value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          />
          <div className="relative">
            <input
              className="input pr-10" placeholder="Contraseña" type={showCreatePass ? 'text' : 'password'} value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            />
            <button type="button" onClick={() => setShowCreatePass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink-6">
              {showCreatePass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <select
            className="input" value={form.role}
            onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
          >
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select
            className="input" value={form.tenant_id}
            onChange={e => setForm(f => ({ ...f, tenant_id: e.target.value }))}
          >
            <option value="">— Seleccionar empresa —</option>
            {tenantsData?.tenants?.map((t: any) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {crearMutation.isError && <p className="text-xs text-red-600">Error al crear usuario</p>}
          <div className="flex gap-2">
            <button
              className="btn-primary text-sm"
              onClick={() => crearMutation.mutate(form)}
              disabled={!form.email || !form.full_name || !form.password || !form.tenant_id || crearMutation.isPending}
            >
              {crearMutation.isPending ? 'Creando...' : 'Crear usuario'}
            </button>
            <button className="btn-ghost text-sm" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {editUser && (
        <Modal title={`Editar — ${editUser.full_name}`} onClose={() => setEditUser(null)}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-ink-5 mb-1 block">Nombre completo</label>
              <input className="input" value={editForm.full_name} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-ink-5 mb-1 block">Email</label>
              <input className="input" type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-ink-5 mb-1 block">Nueva contraseña <span className="text-ink-4">(dejar vacío para no cambiar)</span></label>
              <div className="relative">
                <input className="input pr-10" type={showEditPass ? 'text' : 'password'} placeholder="••••••••" value={editForm.password} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} />
                <button type="button" onClick={() => setShowEditPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink-6">
                  {showEditPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-ink-5 mb-1 block">Rol</label>
              <select className="input" value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                className="btn-primary text-sm flex-1"
                onClick={() => {
                  const payload: any = { full_name: editForm.full_name, email: editForm.email, role: editForm.role }
                  if (editForm.password) payload.password = editForm.password
                  editarMutation.mutate({ id: editUser.id, data: payload })
                }}
                disabled={editarMutation.isPending}
              >
                {editarMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button className="btn-ghost text-sm" onClick={() => setEditUser(null)}>Cancelar</button>
            </div>
          </div>
        </Modal>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-1 border-b border-ink-3">
            <tr>
              <th className="text-left px-4 py-3 text-ink-5 font-medium">Usuario</th>
              <th className="text-left px-4 py-3 text-ink-5 font-medium">Empresa</th>
              <th className="text-center px-4 py-3 text-ink-5 font-medium">Rol</th>
              <th className="text-center px-4 py-3 text-ink-5 font-medium">Último login</th>
              <th className="text-center px-4 py-3 text-ink-5 font-medium">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-2">
            {data?.usuarios?.map((u: any) => (
              <tr key={u.id} className="hover:bg-ink-1">
                <td className="px-4 py-3">
                  <p className="font-medium text-ink-9">{u.full_name}</p>
                  <p className="text-xs text-ink-4">{u.email}</p>
                </td>
                <td className="px-4 py-3 text-ink-6">{u.tenant_name ?? '—'}</td>
                <td className="px-4 py-3 text-center">
                  {u.role === 'super_admin' ? (
                    <span className="badge bg-purple-100 text-purple-700 capitalize">{u.role}</span>
                  ) : (
                    <select
                      className="text-xs border border-ink-3 rounded px-2 py-1 bg-white"
                      value={u.role}
                      onChange={e => cambiarRolMutation.mutate({ id: u.id, role: e.target.value })}
                    >
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  )}
                </td>
                <td className="px-4 py-3 text-center text-ink-5 text-xs">
                  {u.last_login ? new Date(u.last_login).toLocaleDateString('es-CL') : 'Nunca'}
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    title={u.is_active ? 'Desactivar usuario' : 'Activar usuario'}
                    onClick={() => toggleMutation.mutate({ id: u.id, is_active: !u.is_active })}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all hover:opacity-80"
                    style={{
                      background: u.is_active ? '#d1fae5' : '#fee2e2',
                      color: u.is_active ? '#065f46' : '#991b1b',
                    }}
                  >
                    {u.is_active
                      ? <><ToggleRight size={13} className="text-emerald-500" /> Activo</>
                      : <><ToggleLeft size={13} className="text-red-400" /> Inactivo</>}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {u.role !== 'super_admin' && (
                      <button
                        title="Editar usuario"
                        onClick={() => { setEditUser(u); setEditForm({ full_name: u.full_name, email: u.email, password: '', role: u.role }); setShowEditPass(false) }}
                        className="text-ink-4 hover:text-kap-600"
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                    <button
                      title={u.is_active ? 'Desactivar' : 'Activar'}
                      onClick={() => toggleMutation.mutate({ id: u.id, is_active: !u.is_active })}
                      className="text-ink-4 hover:text-ink-7"
                    >
                      {u.is_active
                        ? <ToggleRight size={18} className="text-emerald-500" />
                        : <ToggleLeft size={18} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Tab: Planes ───────────────────────────────────────────────────────────────

function PlanesTab() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: 'starter', max_prospects: 500, max_messages_per_month: 1000, max_users: 3, price_usd: 0,
  })
  const [editForm, setEditForm] = useState({
    max_prospects: 0, max_messages_per_month: 0, max_users: 0, price_usd: 0,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['admin-plans'],
    queryFn: () => api.get('/admin/plans').then(r => r.data),
  })
  const crearMutation = useMutation({
    mutationFn: (d: typeof form) => api.post('/admin/plans', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-plans'] }); setShowForm(false) },
  })
  const editarMutation = useMutation({
    mutationFn: ({ id, d }: { id: string; d: typeof editForm }) => api.put(`/admin/plans/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-plans'] }); setEditId(null) },
  })

  if (isLoading) return <p className="text-ink-5 text-sm">Cargando planes...</p>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-ink-5">{data?.planes?.length ?? 0} planes</p>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={14} /> Nuevo plan
        </button>
      </div>

      {showForm && (
        <div className="card p-4 space-y-3">
          <h3 className="font-semibold text-ink-9 text-sm">Crear plan</h3>
          <select
            className="input" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          >
            <option value="starter">Starter</option>
            <option value="growth">Growth</option>
            <option value="enterprise">Enterprise</option>
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input className="input" type="number" placeholder="Max prospectos" value={form.max_prospects}
              onChange={e => setForm(f => ({ ...f, max_prospects: +e.target.value }))} />
            <input className="input" type="number" placeholder="Max mensajes/mes" value={form.max_messages_per_month}
              onChange={e => setForm(f => ({ ...f, max_messages_per_month: +e.target.value }))} />
            <input className="input" type="number" placeholder="Max usuarios" value={form.max_users}
              onChange={e => setForm(f => ({ ...f, max_users: +e.target.value }))} />
            <input className="input" type="number" placeholder="Precio USD/mes" value={form.price_usd}
              onChange={e => setForm(f => ({ ...f, price_usd: +e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <button className="btn-primary text-sm" onClick={() => crearMutation.mutate(form)} disabled={crearMutation.isPending}>
              {crearMutation.isPending ? 'Creando...' : 'Crear plan'}
            </button>
            <button className="btn-ghost text-sm" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {data?.planes?.map((p: any) => (
          <div key={p.id} className="card p-5 space-y-3">
            {editId === p.id ? (
              <div className="space-y-2">
                <p className="font-bold text-ink-9 capitalize">{p.name}</p>
                <div className="grid grid-cols-2 gap-2">
                  <input className="input text-sm" type="number" placeholder="Prospectos" defaultValue={p.max_prospects}
                    onChange={e => setEditForm(f => ({ ...f, max_prospects: +e.target.value }))} />
                  <input className="input text-sm" type="number" placeholder="Mensajes/mes" defaultValue={p.max_messages_per_month}
                    onChange={e => setEditForm(f => ({ ...f, max_messages_per_month: +e.target.value }))} />
                  <input className="input text-sm" type="number" placeholder="Usuarios" defaultValue={p.max_users}
                    onChange={e => setEditForm(f => ({ ...f, max_users: +e.target.value }))} />
                  <input className="input text-sm" type="number" placeholder="Precio USD" defaultValue={p.price_usd}
                    onChange={e => setEditForm(f => ({ ...f, price_usd: +e.target.value }))} />
                </div>
                <div className="flex gap-2 pt-1">
                  <button className="btn-primary text-xs"
                    onClick={() => editarMutation.mutate({ id: p.id, d: editForm })}
                    disabled={editarMutation.isPending}>
                    Guardar
                  </button>
                  <button className="btn-ghost text-xs" onClick={() => setEditId(null)}>Cancelar</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-ink-9 capitalize">{p.name}</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-kap-600">
                      ${p.price_usd}
                      <span className="text-xs text-ink-4 font-normal">/mes</span>
                    </span>
                    <button
                      onClick={() => {
                        setEditId(p.id)
                        setEditForm({
                          max_prospects: p.max_prospects,
                          max_messages_per_month: p.max_messages_per_month,
                          max_users: p.max_users,
                          price_usd: p.price_usd,
                        })
                      }}
                      className="text-ink-4 hover:text-ink-6"
                    >
                      <Pencil size={13} />
                    </button>
                  </div>
                </div>
                <div className="space-y-1 text-sm text-ink-6">
                  <div className="flex justify-between">
                    <span>Prospectos</span>
                    <span className="font-medium text-ink-9">{p.max_prospects.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Mensajes/mes</span>
                    <span className="font-medium text-ink-9">{p.max_messages_per_month.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Usuarios</span>
                    <span className="font-medium text-ink-9">{p.max_users}</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-ink-2">
                  <p className="text-xs text-ink-4">
                    {p.num_tenants} cliente{p.num_tenants !== 1 ? 's' : ''} en este plan
                  </p>
                </div>
              </>
            )}
          </div>
        ))}
        {(!data?.planes || data.planes.length === 0) && (
          <div className="col-span-3 card p-8 text-center text-ink-5 text-sm">
            No hay planes. Crea uno con el boton de arriba.
          </div>
        )}
      </div>
    </div>
  )
}

// ── Test de Email ─────────────────────────────────────────────────────────────

function TestEmailTab() {
  const [to, setTo] = useState('')
  const [tipo, setTipo] = useState<'basico' | 'licitaciones' | 'alarma'>('basico')
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; resend_id?: string; error?: string } | null>(null)

  const enviar = async () => {
    if (!to.trim()) { toast.error('Ingresa un email destino'); return }
    setLoading(true)
    setResultado(null)
    try {
      const res = await api.post('/admin/test-email', { to: to.trim(), tipo })
      setResultado({ ok: true, resend_id: res.data.resend_id })
      toast.success('Email enviado correctamente ✅')
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? err?.message ?? 'Error desconocido'
      setResultado({ ok: false, error: msg })
      toast.error('Error al enviar email')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg space-y-5">
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Mail size={18} className="text-kap-500" />
          <h3 className="font-semibold text-ink-9">Prueba de email</h3>
        </div>
        <p className="text-sm text-ink-5">
          Envía un email de prueba para verificar que <strong>Resend</strong> está configurado correctamente
          y los emails salen desde <code className="bg-ink-2 px-1.5 py-0.5 rounded text-xs">alertas@kapturo.cl</code>.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-ink-6 mb-1 block">Email destino</label>
            <input
              type="email"
              className="input"
              placeholder="tu@email.com"
              value={to}
              onChange={e => setTo(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && enviar()}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-ink-6 mb-1 block">Tipo de email</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'basico', label: '✅ Básico', desc: 'Email simple de confirmación' },
                { id: 'licitaciones', label: '⚡ Licitaciones', desc: 'Alerta diaria con tabla' },
                { id: 'alarma', label: '🔔 Alarma', desc: 'Notificación de prospecto' },
              ] as const).map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setTipo(opt.id)}
                  className={clsx(
                    'p-3 rounded-xl border-2 text-left transition-all',
                    tipo === opt.id
                      ? 'border-kap-500 bg-kap-50'
                      : 'border-ink-3 hover:border-ink-3'
                  )}
                >
                  <p className="text-xs font-semibold text-ink-8">{opt.label}</p>
                  <p className="text-[10px] text-ink-4 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={enviar}
            disabled={loading || !to.trim()}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading
              ? <><Loader2 size={15} className="animate-spin" /> Enviando...</>
              : <><Send size={15} /> Enviar email de prueba</>
            }
          </button>
        </div>

        {resultado && (
          <div className={clsx(
            'rounded-xl p-4 text-sm',
            resultado.ok ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'
          )}>
            {resultado.ok ? (
              <div className="space-y-1">
                <p className="font-semibold text-emerald-700">✅ Email enviado correctamente</p>
                <p className="text-emerald-600 text-xs">Revisa la bandeja de entrada de <strong>{to}</strong></p>
                {resultado.resend_id && (
                  <p className="text-emerald-500 text-xs font-mono">ID Resend: {resultado.resend_id}</p>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <p className="font-semibold text-red-700">❌ Error al enviar</p>
                <p className="text-red-600 text-xs">{resultado.error}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card p-4 space-y-2">
        <p className="text-xs font-semibold text-ink-6 uppercase tracking-wide">Configuración actual</p>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-ink-5">Remitente</span>
            <code className="text-xs bg-ink-2 px-2 py-0.5 rounded">alertas@kapturo.cl</code>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-5">Proveedor</span>
            <span className="text-ink-7 font-medium">Resend</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-5">Dominio</span>
            <span className="text-emerald-600 font-medium">✅ kapturo.cl (verificado)</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

type TabDef = { id: Tab; label: string; icon: any }
const tabs: TabDef[] = [
  { id: 'stats',     label: 'Resumen',   icon: BarChart2  },
  { id: 'tenants',   label: 'Tenants',   icon: Building2  },
  { id: 'usuarios',  label: 'Usuarios',  icon: Users      },
  { id: 'planes',    label: 'Planes',    icon: CreditCard },
  { id: 'actividad', label: 'Actividad', icon: Activity   },
  { id: 'reportes',  label: 'Reportes',  icon: Bug        },
  { id: 'email',     label: 'Email',     icon: Mail       },
]

export default function SuperAdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('stats')
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-purple-600 rounded-lg flex items-center justify-center">
          <ShieldAlert size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-ink-9">Super Admin</h1>
          <p className="text-sm text-ink-5">Panel de control global de Kapturo</p>
        </div>
      </div>
      <div className="flex border-b border-ink-3 gap-1 flex-wrap">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              activeTab === id
                ? 'border-kap-300 text-kap-600'
                : 'border-transparent text-ink-5 hover:text-ink-9'
            )}
          >
            <Icon size={15} />{label}
          </button>
        ))}
      </div>
      <div>
        {activeTab === 'stats'     && <StatsTab />}
        {activeTab === 'tenants'   && <TenantsTab />}
        {activeTab === 'usuarios'  && <UsuariosTab />}
        {activeTab === 'planes'    && <PlanesTab />}
        {activeTab === 'actividad' && <ActivityTab />}
        {activeTab === 'reportes'  && <BugReportsTab />}
        {activeTab === 'email'     && <TestEmailTab />}
      </div>
    </div>
  )
}
