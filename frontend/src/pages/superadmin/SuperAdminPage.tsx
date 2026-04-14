import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../api/client'
import {
  Building2, Users, CreditCard, BarChart2, Plus, ToggleLeft, ToggleRight,
  ShieldAlert, Pencil, Trash2, UserPlus, Package, X, ChevronLeft, Save,
  Eye, Loader2, DollarSign,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuthStore } from '../../store/authStore'

const MODULES = ['licitaciones', 'inmobiliaria', 'kapturo_ventas'] as const
const ROLES   = ['admin', 'member'] as const

type Tab = 'tenants' | 'usuarios' | 'planes' | 'stats'

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
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-900 text-base">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
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
  if (isLoading) return <p className="text-gray-500 text-sm">Cargando métricas...</p>
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
            <p className="text-2xl font-bold text-gray-900">{s.value ?? '—'}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="card p-5">
        <h3 className="font-semibold text-gray-900 mb-3">Prospectos por tenant (top 10)</h3>
        <div className="space-y-2">
          {data?.prospectos_por_tenant?.map((row: any) => (
            <div key={row.tenant} className="flex justify-between items-center text-sm">
              <span className="text-gray-700">{row.tenant}</span>
              <span className="font-semibold text-brand-600">{row.prospectos}</span>
            </div>
          ))}
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

  const verComo = async (userId: string) => {
    setImpersonateLoading(p => ({ ...p, [userId]: true }))
    try {
      const res = await api.post(`/admin/impersonate/${userId}`)
      startImpersonation(res.data.access_token, res.data.user)
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
  })
  const toggleModuloMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.put(`/admin/tenants/${tenantId}/modules/${id}`, null, { params: { is_active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-tenant', tenantId] }),
  })
  const eliminarTenantMutation = useMutation({
    mutationFn: () => api.delete(`/admin/tenants/${tenantId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
      onBack()
    },
  })

  if (isLoading) return <p className="text-gray-500 text-sm">Cargando...</p>
  if (!t) return null

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-700">
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
              <h2 className="text-lg font-bold text-gray-900">{t.name}</h2>
              <button
                onClick={() => { setNuevoNombre(t.name); setEditNombre(true) }}
                className="text-gray-400 hover:text-gray-600"
              >
                <Pencil size={14} />
              </button>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-0.5">
            <code className="bg-gray-100 px-1 rounded">{t.slug}</code>
            {' · Creado '}{new Date(t.created_at).toLocaleDateString('es-CL')}
          </p>
        </div>
        <Badge active={t.is_active} />
      </div>

      <div className="card p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Plan actual</p>
          <p className="font-semibold text-gray-900 capitalize mt-0.5">
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
            <h3 className="font-semibold text-gray-700 text-sm">Usuarios ({t.usuarios?.length})</h3>
            <button
              className="text-brand-600 hover:text-brand-700 flex items-center gap-1 text-xs font-medium"
              onClick={() => setShowCrearUser(true)}
            >
              <UserPlus size={13} /> Crear usuario
            </button>
          </div>
          <div className="space-y-2">
            {t.usuarios?.length === 0 && <p className="text-xs text-gray-400">Sin usuarios</p>}
            {t.usuarios?.map((u: any) => (
              <div key={u.id} className="flex justify-between items-center text-sm">
                <div>
                  <p className="font-medium text-gray-900 leading-tight">{u.full_name}</p>
                  <p className="text-gray-400 text-xs">{u.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="badge bg-gray-100 text-gray-600 capitalize text-xs">{u.role}</span>
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
                    className="text-gray-400 hover:text-gray-700"
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
            <h3 className="font-semibold text-gray-700 text-sm">Módulos</h3>
            <button
              className="text-brand-600 hover:text-brand-700 flex items-center gap-1 text-xs font-medium"
              onClick={() => setShowModulo(true)}
            >
              <Package size={13} /> Activar módulo
            </button>
          </div>
          <div className="space-y-2">
            {t.modulos?.length === 0 && <p className="text-xs text-gray-400">Sin módulos asignados</p>}
            {t.modulos?.map((m: any) => (
              <div key={m.id} className="flex justify-between items-center text-sm">
                <span className="text-gray-700 capitalize">{m.module.replace('_', ' ')}</span>
                <button
                  title={m.is_active ? 'Desactivar' : 'Activar'}
                  onClick={() => toggleModuloMutation.mutate({ id: m.id, is_active: !m.is_active })}
                  className="text-gray-400 hover:text-gray-700"
                >
                  {m.is_active
                    ? <ToggleRight size={16} className="text-emerald-500" />
                    : <ToggleLeft size={16} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {t.apis?.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-700 text-sm flex items-center gap-1.5">
              <DollarSign size={14} className="text-emerald-500" /> APIs activas
            </h3>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              ~${t.costo_estimado_usd}/mes
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="text-left pb-2 font-medium">API</th>
                  <th className="text-left pb-2 font-medium">Uso</th>
                  <th className="text-right pb-2 font-medium">Costo/mes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {t.apis.map((a: any) => (
                  <tr key={a.api} className="py-1">
                    <td className="py-1.5 font-medium text-gray-700">{a.api}</td>
                    <td className="py-1.5 text-gray-500">{a.uso}</td>
                    <td className="py-1.5 text-right font-semibold text-gray-800">
                      {a.costo_usd === 0 ? <span className="text-emerald-600">Gratis</span> : `$${a.costo_usd}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {t.total_prospectos != null && (
            <p className="text-xs text-gray-400 mt-2">
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
              {MODULES.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
            </select>
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

function TenantsTab() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ company_name: '', slug: '' })
  const [detalle, setDetalle] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => api.get('/admin/tenants').then(r => r.data),
  })
  const crearMutation = useMutation({
    mutationFn: (d: typeof form) => api.post('/admin/tenants', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
      setShowForm(false)
      setForm({ company_name: '', slug: '' })
    },
  })
  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.put(`/admin/tenants/${id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-tenants'] }),
  })

  if (isLoading) return <p className="text-gray-500 text-sm">Cargando tenants...</p>
  if (detalle) return <TenantDetalle tenantId={detalle} onBack={() => setDetalle(null)} />

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">{data?.total} tenants en total</p>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={14} /> Nuevo tenant
        </button>
      </div>

      {showForm && (
        <div className="card p-4 space-y-3">
          <h3 className="font-semibold text-gray-900 text-sm">Crear tenant</h3>
          <input
            className="input" placeholder="Nombre de la empresa" value={form.company_name}
            onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
          />
          <input
            className="input" placeholder="Slug (opcional, se genera automático)" value={form.slug}
            onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
          />
          <div className="flex gap-2">
            <button
              className="btn-primary text-sm"
              onClick={() => crearMutation.mutate(form)}
              disabled={!form.company_name || crearMutation.isPending}
            >
              {crearMutation.isPending ? 'Creando...' : 'Crear'}
            </button>
            <button className="btn-ghost text-sm" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Empresa</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Plan</th>
              <th className="text-center px-4 py-3 text-gray-500 font-medium">Usuarios</th>
              <th className="text-center px-4 py-3 text-gray-500 font-medium">Prospectos</th>
              <th className="text-center px-4 py-3 text-gray-500 font-medium">Módulos</th>
              <th className="text-center px-4 py-3 text-gray-500 font-medium">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data?.tenants?.map((t: any) => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{t.name}</p>
                  <p className="text-xs text-gray-400">{t.slug}</p>
                </td>
                <td className="px-4 py-3 text-gray-600 capitalize">{t.plan ?? '—'}</td>
                <td className="px-4 py-3 text-center text-gray-700">{t.num_usuarios}</td>
                <td className="px-4 py-3 text-center text-gray-700">{t.num_prospectos}</td>
                <td className="px-4 py-3 text-center text-gray-500 text-xs">
                  {t.modulos_activos?.join(', ') || '—'}
                </td>
                <td className="px-4 py-3 text-center"><Badge active={t.is_active} /></td>
                <td className="px-4 py-3 flex items-center gap-2 justify-end">
                  <button
                    title={t.is_active ? 'Desactivar' : 'Activar'}
                    onClick={() => toggleMutation.mutate({ id: t.id, is_active: !t.is_active })}
                    className="text-gray-400 hover:text-gray-700"
                  >
                    {t.is_active
                      ? <ToggleRight size={18} className="text-emerald-500" />
                      : <ToggleLeft size={18} />}
                  </button>
                  <button
                    onClick={() => setDetalle(t.id)}
                    className="text-xs text-brand-600 hover:underline flex items-center gap-1"
                  >
                    <Pencil size={13} /> Gestionar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Tab: Usuarios ─────────────────────────────────────────────────────────────

function UsuariosTab() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ email: '', full_name: '', password: '', role: 'admin', tenant_id: '' })

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

  if (isLoading) return <p className="text-gray-500 text-sm">Cargando usuarios...</p>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">{data?.total} usuarios en total</p>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2 text-sm">
          <UserPlus size={14} /> Nuevo usuario
        </button>
      </div>

      {showForm && (
        <div className="card p-4 space-y-3">
          <h3 className="font-semibold text-gray-900 text-sm">Crear usuario</h3>
          <input
            className="input" placeholder="Nombre completo" value={form.full_name}
            onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
          />
          <input
            className="input" placeholder="Email" type="email" value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          />
          <input
            className="input" placeholder="Contraseña" type="password" value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
          />
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

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Usuario</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Empresa</th>
              <th className="text-center px-4 py-3 text-gray-500 font-medium">Rol</th>
              <th className="text-center px-4 py-3 text-gray-500 font-medium">Último login</th>
              <th className="text-center px-4 py-3 text-gray-500 font-medium">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data?.usuarios?.map((u: any) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{u.full_name}</p>
                  <p className="text-xs text-gray-400">{u.email}</p>
                </td>
                <td className="px-4 py-3 text-gray-600">{u.tenant_name ?? '—'}</td>
                <td className="px-4 py-3 text-center">
                  {u.role === 'super_admin' ? (
                    <span className="badge bg-purple-100 text-purple-700 capitalize">{u.role}</span>
                  ) : (
                    <select
                      className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                      value={u.role}
                      onChange={e => cambiarRolMutation.mutate({ id: u.id, role: e.target.value })}
                    >
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  )}
                </td>
                <td className="px-4 py-3 text-center text-gray-500 text-xs">
                  {u.last_login ? new Date(u.last_login).toLocaleDateString('es-CL') : 'Nunca'}
                </td>
                <td className="px-4 py-3 text-center"><Badge active={u.is_active} /></td>
                <td className="px-4 py-3 text-right">
                  <button
                    title={u.is_active ? 'Desactivar' : 'Activar'}
                    onClick={() => toggleMutation.mutate({ id: u.id, is_active: !u.is_active })}
                    className="text-gray-400 hover:text-gray-700"
                  >
                    {u.is_active
                      ? <ToggleRight size={18} className="text-emerald-500" />
                      : <ToggleLeft size={18} />}
                  </button>
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

  if (isLoading) return <p className="text-gray-500 text-sm">Cargando planes...</p>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">{data?.planes?.length ?? 0} planes</p>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={14} /> Nuevo plan
        </button>
      </div>

      {showForm && (
        <div className="card p-4 space-y-3">
          <h3 className="font-semibold text-gray-900 text-sm">Crear plan</h3>
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
                <p className="font-bold text-gray-900 capitalize">{p.name}</p>
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
                  <h3 className="font-bold text-gray-900 capitalize">{p.name}</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-brand-600">
                      ${p.price_usd}
                      <span className="text-xs text-gray-400 font-normal">/mes</span>
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
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Pencil size={13} />
                    </button>
                  </div>
                </div>
                <div className="space-y-1 text-sm text-gray-600">
                  <div className="flex justify-between">
                    <span>Prospectos</span>
                    <span className="font-medium text-gray-900">{p.max_prospects.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Mensajes/mes</span>
                    <span className="font-medium text-gray-900">{p.max_messages_per_month.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Usuarios</span>
                    <span className="font-medium text-gray-900">{p.max_users}</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-400">
                    {p.num_tenants} cliente{p.num_tenants !== 1 ? 's' : ''} en este plan
                  </p>
                </div>
              </>
            )}
          </div>
        ))}
        {(!data?.planes || data.planes.length === 0) && (
          <div className="col-span-3 card p-8 text-center text-gray-500 text-sm">
            No hay planes. Crea uno con el boton de arriba.
          </div>
        )}
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

type TabDef = { id: Tab; label: string; icon: any }
const tabs: TabDef[] = [
  { id: 'stats',    label: 'Resumen',  icon: BarChart2  },
  { id: 'tenants',  label: 'Tenants',  icon: Building2  },
  { id: 'usuarios', label: 'Usuarios', icon: Users      },
  { id: 'planes',   label: 'Planes',   icon: CreditCard },
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
          <h1 className="text-2xl font-bold text-gray-900">Super Admin</h1>
          <p className="text-sm text-gray-500">Panel de control global de Kapturo</p>
        </div>
      </div>
      <div className="flex border-b border-gray-200 gap-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              activeTab === id
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            )}
          >
            <Icon size={15} />{label}
          </button>
        ))}
      </div>
      <div>
        {activeTab === 'stats'    && <StatsTab />}
        {activeTab === 'tenants'  && <TenantsTab />}
        {activeTab === 'usuarios' && <UsuariosTab />}
        {activeTab === 'planes'   && <PlanesTab />}
      </div>
    </div>
  )
}
