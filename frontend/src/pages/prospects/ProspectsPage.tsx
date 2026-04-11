import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../api/client'
import type { Prospect } from '../../types'
import { Star, MapPin, Mail, Phone, Building2 } from 'lucide-react'
import clsx from 'clsx'

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-emerald-100 text-emerald-700' : score >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
  return <span className={`badge ${color}`}>{score.toFixed(0)}</span>
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    new: 'bg-gray-100 text-gray-600',
    qualified: 'bg-blue-100 text-blue-700',
    contacted: 'bg-purple-100 text-purple-700',
    responded: 'bg-green-100 text-green-700',
    converted: 'bg-emerald-100 text-emerald-700',
    disqualified: 'bg-red-100 text-red-600',
  }
  const label: Record<string, string> = {
    new: 'Nuevo', qualified: 'Calificado', contacted: 'Contactado',
    responded: 'Respondió', converted: 'Convertido', disqualified: 'Descartado',
  }
  return <span className={`badge ${map[status] || ''}`}>{label[status] || status}</span>
}

export default function ProspectsPage() {
  const [modulo, setModulo] = useState('')
  const [soloCalificados, setSoloCalificados] = useState(false)
  const [pagina, setPagina] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['prospectos', modulo, soloCalificados, pagina],
    queryFn: () => api.get('/modules/licitaciones/prospectos', {
      params: { modulo: modulo || undefined, solo_calificados: soloCalificados, pagina, por_pagina: 25 }
    }).then(r => r.data),
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Prospectos</h1>
        <span className="text-sm text-gray-500">{data?.total ?? 0} en total</span>
      </div>

      {/* Filtros */}
      <div className="card p-4 flex flex-wrap gap-3">
        <select className="input w-auto" value={modulo} onChange={e => { setModulo(e.target.value); setPagina(1) }}>
          <option value="">Todos los módulos</option>
          <option value="licitador_a">Licitador A</option>
          <option value="licitador_b">Licitador B</option>
          <option value="prospector">Prospector</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={soloCalificados} onChange={e => { setSoloCalificados(e.target.checked); setPagina(1) }} className="rounded" />
          Solo calificados
        </label>
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Cargando prospectos...</div>
        ) : !data?.prospectos?.length ? (
          <div className="p-8 text-center text-gray-400">
            <Star size={32} className="mx-auto mb-2 opacity-30" />
            <p>No hay prospectos aún. Lanza una búsqueda en Licitaciones o Prospector.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Empresa</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Contacto</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Score</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Módulo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.prospectos.map((p: Prospect) => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                        <Building2 size={14} className="text-brand-500" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{p.company_name || '—'}</p>
                        {p.rut && <p className="text-xs text-gray-400">RUT: {p.rut}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-0.5">
                      {p.contact_name && <p className="text-gray-700">{p.contact_name}</p>}
                      {p.email && <p className="text-gray-400 flex items-center gap-1"><Mail size={11} />{p.email}</p>}
                      {p.phone && <p className="text-gray-400 flex items-center gap-1"><Phone size={11} />{p.phone}</p>}
                      {p.city && <p className="text-gray-400 flex items-center gap-1"><MapPin size={11} />{p.city}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <ScoreBadge score={p.score} />
                      {p.score_reason && (
                        <p className="text-xs text-gray-400 max-w-xs line-clamp-2">{p.score_reason}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">{p.source_module || '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginación */}
      {data?.total > 25 && (
        <div className="flex justify-center gap-2">
          <button className="btn-secondary text-sm py-1.5" disabled={pagina === 1} onClick={() => setPagina(p => p - 1)}>Anterior</button>
          <span className="px-4 py-1.5 text-sm text-gray-600">Página {pagina}</span>
          <button className="btn-secondary text-sm py-1.5" disabled={pagina * 25 >= data.total} onClick={() => setPagina(p => p + 1)}>Siguiente</button>
        </div>
      )}
    </div>
  )
}
