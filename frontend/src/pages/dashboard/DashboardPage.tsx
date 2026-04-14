import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Users, TrendingUp, Bell, Star, ArrowRight,
  MapPin, Globe, Phone, Mail,
  CheckCircle2, AlertCircle, Zap, Search, Bot, FileSearch, Rocket,
  Building2, CreditCard, ShieldAlert,
} from 'lucide-react'
import api from '../../api/client'
import { useAuthStore } from '../../store/authStore'
import clsx from 'clsx'

function StatCard({
  icon: Icon, label, value, sub, color, onClick,
}: {
  icon: any; label: string; value: string | number; sub?: string; color: string; onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'card p-5 flex items-center gap-4',
        onClick && 'cursor-pointer hover:shadow-md hover:border-brand-200 transition-all duration-150'
      )}
    >
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function ScoreDot({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-400'
  return <span className={`inline-block w-2 h-2 rounded-full ${color} shrink-0`} />
}

function WebTag({ status }: { status?: string }) {
  if (!status) return null
  const map: Record<string, { label: string; cls: string }> = {
    tiene_web:  { label: 'Web',     cls: 'bg-emerald-50 text-emerald-700' },
    solo_redes: { label: 'Redes',   cls: 'bg-blue-50 text-blue-700' },
    sin_web:    { label: 'Sin web', cls: 'bg-gray-100 text-gray-500' },
  }
  const t = map[status]
  if (!t) return null
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.cls}`}>{t.label}</span>
}

// ── Dashboard Super Admin — métricas globales de la plataforma ─────────────────
function SuperAdminDashboard({
  primerNombre, saludo, hoy,
}: { primerNombre: string; saludo: string; hoy: string }) {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api.get('/admin/stats').then(r => r.data),
    refetchInterval: 60_000,
  })
  const t = data?.totales

  return (
    <div className="space-y-6 pb-8">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{saludo}, {primerNombre} 👋</h1>
          <p className="text-gray-500 mt-0.5 capitalize">{hoy}</p>
        </div>
        <button
          onClick={() => navigate('/superadmin')}
          className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl bg-purple-600 text-white hover:bg-purple-700 transition-colors"
        >
          <ShieldAlert size={15} />
          Panel Admin
        </button>
      </div>

      {/* Stats globales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Building2}  label="Tenants activos" value={isLoading ? '—' : (t?.tenants_activos ?? 0)} sub={`de ${t?.tenants ?? 0} totales`} color="bg-purple-500" onClick={() => navigate('/superadmin')} />
        <StatCard icon={Users}      label="Usuarios"        value={isLoading ? '—' : (t?.usuarios ?? 0)}        sub="en la plataforma"                  color="bg-brand-500"   onClick={() => navigate('/superadmin')} />
        <StatCard icon={TrendingUp} label="Prospectos"      value={isLoading ? '—' : (t?.prospectos ?? 0)}      sub="total acumulado"                  color="bg-emerald-500" />
        <StatCard icon={Bell}       label="Mensajes"        value={isLoading ? '—' : (t?.mensajes ?? 0)}        sub="enviados total"                   color="bg-amber-500"   />
      </div>

      {/* Actividad por tenant */}
      {(data?.prospectos_por_tenant?.length ?? 0) > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Users size={15} className="text-purple-500" />
            Actividad por cliente (top 10)
          </h2>
          <div className="space-y-2.5">
            {data.prospectos_por_tenant.map((row: any) => {
              const max = data.prospectos_por_tenant[0]?.prospectos || 1
              const pct = Math.round((row.prospectos / max) * 100)
              return (
                <div key={row.tenant} className="flex items-center gap-3">
                  <p className="text-sm text-gray-700 w-44 truncate shrink-0">{row.tenant}</p>
                  <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div className="h-2 rounded-full bg-purple-400 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-bold text-gray-700 w-10 text-right">{row.prospectos}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Tenants',  desc: 'Crea empresas, asigna módulos y planes.', icon: Building2,  color: 'bg-purple-50 hover:bg-purple-100 border-purple-100 hover:border-purple-300', iconColor: 'text-purple-600', textColor: 'text-purple-700' },
          { label: 'Usuarios', desc: 'Crea usuarios, cambia roles y accesos.',    icon: Users,      color: 'bg-brand-50 hover:bg-brand-100 border-brand-100 hover:border-brand-300',   iconColor: 'text-brand-600',  textColor: 'text-brand-700' },
          { label: 'Planes',   desc: 'Define planes, límites y precios.',          icon: CreditCard, color: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-100 hover:border-emerald-300', iconColor: 'text-emerald-600', textColor: 'text-emerald-700' },
        ].map(a => (
          <button
            key={a.label}
            onClick={() => navigate('/superadmin')}
            className={`card p-5 flex flex-col gap-3 text-left transition-all hover:shadow-md ${a.color}`}
          >
            <a.icon size={20} className={a.iconColor} />
            <div>
              <p className={`font-semibold text-sm ${a.textColor}`}>{a.label}</p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{a.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const { data: stats, isPending } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get('/dashboard/stats').then(r => r.data),
    refetchInterval: 60_000,
  })

  const primerNombre = user?.full_name?.split(' ')[0] ?? 'ahí'
  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'
  const hoy = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
  const isSuperAdmin = user?.role === 'super_admin'
  const isAdmin = user?.role === 'admin' || isSuperAdmin
  const userModuleTypes: string[] = isSuperAdmin
    ? ['licitador', 'prospector']
    : (user?.modules ?? []).map(m => m.tipo)
  const tieneProspector = userModuleTypes.includes('prospector')
  const tieneLicitador  = userModuleTypes.includes('licitador')

  // Super admin ve su propio dashboard global, no el del tenant
  if (isSuperAdmin) {
    return <SuperAdminDashboard primerNombre={primerNombre} saludo={saludo} hoy={hoy} />
  }

  return (
    <div className="space-y-6 pb-8">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{saludo}, {primerNombre} 👋</h1>
          <p className="text-gray-500 mt-0.5 capitalize">{hoy}</p>
        </div>
        {tieneProspector && (
          <button
            onClick={() => navigate('/prospeccion')}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl bg-brand-600 text-white hover:bg-brand-700 transition-colors"
          >
            <Search size={15} />
            Buscar prospectos
          </button>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users}     label="Total prospectos"    value={isPending ? '—' : (stats?.total_prospectos ?? 0)} sub={isPending ? '' : `+${stats?.esta_semana ?? 0} esta semana`} color="bg-brand-500"   onClick={() => navigate('/prospectos')} />
        <StatCard icon={Star}      label="Calificados ≥60"     value={isPending ? '—' : (stats?.calificados ?? 0)}      sub="Score alto"                                                 color="bg-amber-500"  onClick={() => navigate('/prospectos')} />
        <StatCard icon={TrendingUp}label="En pipeline"         value={isPending ? '—' : (stats?.en_pipeline ?? 0)}      sub="Leads activos"                                              color="bg-emerald-500" onClick={() => navigate('/pipeline')} />
        <StatCard icon={Bell}      label="Alarmas pendientes"  value={isPending ? '—' : (stats?.alarmas_pendientes ?? 0)} sub={stats?.alarmas_pendientes > 0 ? '¡Revisar hoy!' : 'Al día'} color={stats?.alarmas_pendientes > 0 ? 'bg-red-500' : 'bg-gray-400'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Pipeline por etapa */}
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Pipeline CRM</h2>
            <button onClick={() => navigate('/pipeline')} className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1">
              Ver completo <ArrowRight size={12} />
            </button>
          </div>

          {isPending ? (
            <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          ) : !stats?.pipeline_por_etapa?.length ? (
            <div className="flex flex-col items-center justify-center h-32 gap-3 text-center">
              <p className="text-sm text-gray-400">El pipeline no tiene etapas.</p>
              <button onClick={() => navigate('/pipeline')} className="text-xs btn-primary py-1.5 px-4">Inicializar pipeline</button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {stats.pipeline_por_etapa.filter((e: any) => !e.is_lost).map((etapa: any) => {
                const maxCount = Math.max(...stats.pipeline_por_etapa.map((e: any) => e.count), 1)
                const pct = (etapa.count / maxCount) * 100
                return (
                  <div key={etapa.id} className="flex items-center gap-3">
                    <div className="w-28 shrink-0">
                      <p className="text-xs text-gray-600 font-medium truncate">{etapa.name}</p>
                    </div>
                    <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: etapa.color }} />
                    </div>
                    <span className={clsx('text-xs font-bold w-6 text-right', etapa.count > 0 ? 'text-gray-800' : 'text-gray-300')}>
                      {etapa.count}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {stats?.pipeline_por_etapa?.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100 flex gap-6">
              {stats.pipeline_por_etapa.filter((e: any) => e.is_won || e.is_lost).map((e: any) => (
                <div key={e.id} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: e.color }} />
                  <span className="text-xs text-gray-500">{e.name}: <strong>{e.count}</strong></span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Alarmas */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Bell size={15} className="text-brand-500" />
              Alarmas
            </h2>
            {stats?.alarmas_pendientes > 0 && (
              <span className="text-xs bg-red-100 text-red-600 font-bold px-2 py-0.5 rounded-full">{stats.alarmas_pendientes}</span>
            )}
          </div>

          {isPending ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          ) : !stats?.alarmas_lista?.length ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-center">
              <CheckCircle2 size={28} className="text-emerald-400" />
              <p className="text-sm text-gray-400">Sin alarmas pendientes</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {stats.alarmas_lista.map((a: any) => (
                <div key={a.id} className={clsx('p-3 rounded-xl border text-sm', a.vencida ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100')}>
                  <div className="flex items-start gap-2">
                    {a.vencida ? <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" /> : <Bell size={14} className="text-amber-500 mt-0.5 shrink-0" />}
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{a.company_name}</p>
                      {a.alarma_motivo && <p className="text-xs text-gray-500 truncate">{a.alarma_motivo}</p>}
                      <p className={clsx('text-xs font-medium mt-0.5', a.vencida ? 'text-red-600' : 'text-amber-600')}>
                        {a.alarma_fecha ? new Date(a.alarma_fecha).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) : ''}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              <button onClick={() => navigate('/prospectos')} className="w-full text-xs text-brand-600 hover:text-brand-700 text-center pt-1">
                Ver todos →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Top prospectos */}
      {(isPending || stats?.top_prospectos?.length > 0) && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Zap size={15} className="text-amber-500" />
              Mejores prospectos sin pipeline
            </h2>
            <button onClick={() => navigate('/prospectos')} className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1">
              Ver todos <ArrowRight size={12} />
            </button>
          </div>
          {isPending ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {stats.top_prospectos.map((p: any) => (
                <div key={p.id} onClick={() => navigate('/prospectos')} className="p-4 rounded-xl border border-gray-100 hover:border-brand-200 hover:shadow-sm transition-all cursor-pointer">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{p.company_name}</p>
                    <div className="flex items-center gap-1 shrink-0">
                      <ScoreDot score={p.score} />
                      <span className="text-xs font-bold text-gray-600">{Math.round(p.score)}</span>
                    </div>
                  </div>
                  {p.contact_name && <p className="text-xs text-gray-500 truncate mb-2">{p.contact_name}</p>}
                  <div className="flex items-center gap-2 flex-wrap">
                    {p.city && <span className="flex items-center gap-1 text-xs text-gray-400"><MapPin size={10} />{p.city}</span>}
                    <WebTag status={p.web_status} />
                    {p.phone && <Phone size={10} className="text-gray-400" />}
                    {p.email && <Mail size={10} className="text-gray-400" />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Primeros pasos — solo cuando no hay prospectos */}
      {!isPending && (stats?.total_prospectos ?? 0) === 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Rocket size={17} className="text-brand-500" />
            <h2 className="font-semibold text-gray-900">Primeros pasos</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {tieneLicitador && (
              <div className="card p-5 flex flex-col gap-3 border-brand-100 hover:border-brand-300 hover:shadow-md transition-all">
                <div className="w-11 h-11 rounded-2xl bg-brand-50 flex items-center justify-center">
                  <FileSearch size={20} className="text-brand-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Buscar licitaciones</p>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">Encuentra licitaciones públicas en Mercado Público, guarda prospectos y enriquece sus datos de contacto automáticamente.</p>
                </div>
                <button onClick={() => navigate('/licitaciones')} className="mt-auto flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700">
                  Ir a Licitaciones <ArrowRight size={13} />
                </button>
              </div>
            )}

            {tieneProspector && (
              <div className="card p-5 flex flex-col gap-3 border-emerald-100 hover:border-emerald-300 hover:shadow-md transition-all">
                <div className="w-11 h-11 rounded-2xl bg-emerald-50 flex items-center justify-center">
                  <Search size={20} className="text-emerald-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Buscar prospectos</p>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">Encuentra empresas por rubro, ciudad o perfil. Importa prospectos desde Google Maps y Apollo y cárgalos al CRM.</p>
                </div>
                <button onClick={() => navigate('/prospeccion')} className="mt-auto flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700">
                  Ir a Prospección <ArrowRight size={13} />
                </button>
              </div>
            )}

            {isAdmin && (
            <div className="card p-5 flex flex-col gap-3 border-amber-100 hover:border-amber-300 hover:shadow-md transition-all">
              <div className="w-11 h-11 rounded-2xl bg-amber-50 flex items-center justify-center">
                <Bot size={20} className="text-amber-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">Configurar tu agente</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">Personaliza el agente de ventas con el nombre, tono y contexto de tu empresa para que responda como parte de tu equipo.</p>
              </div>
              <button onClick={() => navigate('/agentes')} className="mt-auto flex items-center gap-1.5 text-xs font-semibold text-amber-600 hover:text-amber-700">
                Ir a Agentes <ArrowRight size={13} />
              </button>
            </div>
            )}
          </div>
        </div>
      )}

      {/* Módulos */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          tieneLicitador && {
            label: 'Licitaciones',
            desc: 'Busca y sigue licitaciones públicas de Mercado Público.',
            icon: FileSearch,
            path: '/licitaciones',
            color: 'text-brand-600 bg-brand-50 hover:bg-brand-100',
            iconColor: 'text-brand-600',
          },
          tieneProspector && {
            label: 'Prospección',
            desc: 'Encuentra empresas por rubro o ciudad e impórtalas al CRM.',
            icon: MapPin,
            path: '/prospeccion',
            color: 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100',
            iconColor: 'text-emerald-600',
          },
          {
            label: 'Pipeline',
            desc: 'Gestiona tus leads por etapas y cierra más negocios.',
            icon: TrendingUp,
            path: '/pipeline',
            color: 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100',
            iconColor: 'text-indigo-600',
          },
          {
            label: 'Conversaciones',
            desc: 'Responde mensajes de WhatsApp con apoyo del agente IA.',
            icon: Globe,
            path: '/conversaciones',
            color: 'text-amber-600 bg-amber-50 hover:bg-amber-100',
            iconColor: 'text-amber-600',
          },
        ].filter(Boolean).map((a: any) => (
          <button key={a.path} onClick={() => navigate(a.path)} className={`flex flex-col items-start gap-2 p-4 rounded-2xl text-left transition-colors ${a.color}`}>
            <a.icon size={18} className={a.iconColor} />
            <p className="text-sm font-semibold">{a.label}</p>
            <p className="text-xs opacity-70 leading-relaxed">{a.desc}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
