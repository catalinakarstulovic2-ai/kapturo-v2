import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../api/client'
import { Building2, Users, CreditCard, BarChart2, Plus, CheckCircle, XCircle, ToggleLeft, ToggleRight, ShieldAlert } from 'lucide-react'
import clsx from 'clsx'

type Tab = 'tenants' | 'usuarios' | 'planes' | 'stats'

// ── Helpers ──────────────────────────────────────────────────────────────────

function Badge({ active }: { active: boolean }) {
  return (
    <span className={clsx('badge', active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600')}>
      {active ? 'Activo' : 'Inactivo'}
    </span>
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
          { label: 'Tenants total', value: t?.tenants },
          { label: 'Tenants activos', value: t?.tenants_activos },
          { label: 'Usuarios', value: t?.usuarios },
          { label: 'Prospectos', value: t?.prospectos },
          { label: 'Mensajes', value: t?.mensajes },
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

  const { data: tenantDetalle } = useQuery({
    queryKey: ['admin-tenant', detalle],
    queryFn: () => api.get(`/admin/tenants/${detalle}`).then(r => r.data),
    enabled: !!detalle,
  })

  const crearMutation = useMutation({
    mutationFn: (d: typeof form) => api.post('/admin/tenants', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-tenants'] }); setShowForm(false); setForm({ company_name: '', slug: '' }) },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.put(`/admin/tenants/${id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-tenants'] }),
  })

  if (isLoading) return <p className="text-gray-500 text-sm">Cargando tenants...</p>

  // Vista detalle
  if (detalle && tenantDetalle) {
    return (
      <div className="space-y-5">
        <button onClick={() => setDetalle(null)} className="text-sm text-brand-600 hover:underline">← Volver</button>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{tenantDetalle.name}</h2>
          <Badge active={tenantDetalle.is_active} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="card p-4">
            <h3 className="font-semibold text-gray-700 mb-3 text-sm">Usuarios ({tenantDetalle.usuarios?.length})</h3>
            <div className="space-y-2">
              {tenantDetalle.usuarios?.map((u: any) => (
                <div key={u.id} className="flex justify-between text-sm">
                  <div>
                    <p className="font-medium text-gray-900">{u.full_name}</p>
                    <p className="text-gray-500 text-xs">{u.email}</p>
                  </div>
                  <span className="badge bg-gray-100 text-gray-600 capitalize">{u.role}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card p-4">
            <h3 className="font-semibold text-gray-700 mb-3 text-sm">Módulos activos</h3>
            <div className="space-y-2">
              {tenantDetalle.modulos?.length === 0 && <p className="text-xs text-gray-400">Sin módulos asignados</p>}
              {tenantDetalle.modulos?.map((m: any) => (
                <div key={m.id} className="flex justify-between text-sm">
                  <span className="text-gray-700 capitalize">{m.module}</span>
                  <Badge active={m.is_active} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="card p-4 text-sm">
          <p className="text-gray-500">Plan: <span className="font-semibold text-gray-900">{tenantDetalle.plan?.name ?? 'Sin plan'}</span></p>
          <p className="text-gray-500 mt-1">Creado: <span className="font-medium text-gray-700">{new Date(tenantDetalle.created_at).toLocaleDateString('es-CL')}</span></p>
          <p className="text-gray-500 mt-1">Slug: <code className="bg-gray-100 px-1 rounded text-xs">{tenantDetalle.slug}</code></p>
        </div>
      </div>
    )
  }

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
            className="input"
            placeholder="Nombre de la empresa"
            value={form.company_name}
            onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
          />
          <input
            className="input"
            placeholder="Slug (opcional, se genera automático)"
            value={form.slug}
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
                <td className="px-4 py-3 text-center text-gray-500 text-xs">{t.modulos_activos?.join(', ') || '—'}</td>
                <td className="px-4 py-3 text-center"><Badge active={t.is_active} /></td>
                <td className="px-4 py-3 flex items-center gap-2 justify-end">
                  <button
                    title={t.is_active ? 'Desactivar' : 'Activar'}
                    onClick={() => toggleMutation.mutate({ id: t.id, is_active: !t.is_active })}
                    className="text-gray-400 hover:text-gray-700"
                  >
                    {t.is_active ? <ToggleRight size={18} className="text-emerald-500" /> : <ToggleLeft size={18} />}
                  </button>
                  <button
                    onClick={() => setDetalle(t.id)}
                    className="text-xs text-brand-600 hover:underline"
                  >
                    Ver
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

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get('/admin/users').then(r => r.data),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.put(`/admin/users/${id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  if (isLoading) return <p className="text-gray-500 text-sm">Cargando usuarios...</p>

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{data?.total} usuarios en total</p>
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
                  <span className={clsx('badge capitalize', u.role === 'super_admin' ? 'bg-purple-100 text-purple-700' : u.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600')}>
                    {u.role}
                  </span>
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
                    {u.is_active ? <ToggleRight size={18} className="text-emerald-500" /> : <ToggleLeft size={18} />}
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
  const { data, isLoading } = useQuery({
    queryKey: ['admin-plans'],
    queryFn: () => api.get('/admin/plans').then(r => r.data),
  })

  if (isLoading) return <p className="text-gray-500 text-sm">Cargando planes...</p>

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {data?.planes?.map((p: any) => (
        <div key={p.id} className="card p-5 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-900 capitalize">{p.name}</h3>
            <span className="text-lg font-bold text-brand-600">${p.price_usd}<span className="text-xs text-gray-400 font-normal">/mes</span></span>
          </div>
          <div className="space-y-1 text-sm text-gray-600">
            <div className="flex justify-between"><span>Prospectos</span><span className="font-medium text-gray-900">{p.max_prospects.toLocaleString()}</span></div>
            <div className="flex justify-between"><span>Mensajes/mes</span><span className="font-medium text-gray-900">{p.max_messages_per_month.toLocaleString()}</span></div>
            <div className="flex justify-between"><span>Usuarios</span><span className="font-medium text-gray-900">{p.max_users}</span></div>
          </div>
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-400">{p.num_tenants} cliente{p.num_tenants !== 1 ? 's' : ''} en este plan</p>
          </div>
        </div>
      ))}
      {(!data?.planes || data.planes.length === 0) && (
        <div className="col-span-3 card p-8 text-center text-gray-500 text-sm">
          No hay planes creados. Créalos desde la API.
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

const tabs: { id: Tab; label: string; icon: any }[] = [
  { id: 'stats',    label: 'Resumen',  icon: BarChart2  },
  { id: 'tenants',  label: 'Tenants',  icon: Building2  },
  { id: 'usuarios', label: 'Usuarios', icon: Users      },
  { id: 'planes',   label: 'Planes',   icon: CreditCard },
]

export default function SuperAdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('stats')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-purple-600 rounded-lg flex items-center justify-center">
          <ShieldAlert size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Super Admin</h1>
          <p className="text-sm text-gray-500">Panel de control global de Kapturo</p>
        </div>
      </div>

      {/* Tabs */}
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
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* Contenido del tab */}
      <div>
        {activeTab === 'stats'    && <StatsTab />}
        {activeTab === 'tenants'  && <TenantsTab />}
        {activeTab === 'usuarios' && <UsuariosTab />}
        {activeTab === 'planes'   && <PlanesTab />}
      </div>
    </div>
  )
}
