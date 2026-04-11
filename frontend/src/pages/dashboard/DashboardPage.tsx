import { useQuery } from '@tanstack/react-query'
import { Users, TrendingUp, MessageSquare, Star } from 'lucide-react'
import api from '../../api/client'
import { useAuthStore } from '../../store/authStore'

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuthStore()

  const { data: prospectos } = useQuery({
    queryKey: ['prospectos-count'],
    queryFn: () => api.get('/modules/licitaciones/prospectos?por_pagina=1').then(r => r.data),
  })

  const { data: pendientes } = useQuery({
    queryKey: ['mensajes-pendientes'],
    queryFn: () => api.get('/agents/mensajes/pendientes').then(r => r.data),
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Hola, {user?.full_name?.split(' ')[0]}. Aquí está el resumen de hoy.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users}        label="Total prospectos"     value={prospectos?.total ?? '—'} color="bg-brand-500" />
        <StatCard icon={Star}         label="Calificados (≥60)"    value="—"                        color="bg-amber-500" />
        <StatCard icon={MessageSquare}label="Mensajes pendientes"  value={pendientes?.length ?? '—'}color="bg-blue-500"  />
        <StatCard icon={TrendingUp}   label="En pipeline"          value="—"                        color="bg-emerald-500" />
      </div>

      {/* Mensajes pendientes de aprobación */}
      {pendientes?.length > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Mensajes pendientes de aprobación</h2>
          <div className="space-y-3">
            {pendientes.slice(0, 5).map((msg: any) => (
              <div key={msg.id} className="flex items-start justify-between gap-4 p-3 bg-amber-50 rounded-lg border border-amber-100">
                <p className="text-sm text-gray-700 flex-1 line-clamp-2">{msg.body}</p>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => api.post(`/agents/mensajes/${msg.id}/aprobar`)}
                    className="text-xs btn-primary py-1 px-3"
                  >
                    Aprobar
                  </button>
                  <button
                    onClick={() => api.post(`/agents/mensajes/${msg.id}/rechazar`)}
                    className="text-xs btn-secondary py-1 px-3"
                  >
                    Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 mb-2">Primeros pasos</h2>
        <ul className="space-y-2 text-sm text-gray-600">
          <li className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-brand-500 text-white flex items-center justify-center text-xs">1</span> Ve a <strong>Licitaciones</strong> y lanza tu primera búsqueda</li>
          <li className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-brand-500 text-white flex items-center justify-center text-xs">2</span> Revisa tus <strong>Prospectos</strong> calificados</li>
          <li className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-brand-500 text-white flex items-center justify-center text-xs">3</span> Ve al <strong>Pipeline</strong> y mueve los mejores leads</li>
          <li className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-brand-500 text-white flex items-center justify-center text-xs">4</span> Usa <strong>Agentes IA</strong> para redactar mensajes</li>
        </ul>
      </div>
    </div>
  )
}
