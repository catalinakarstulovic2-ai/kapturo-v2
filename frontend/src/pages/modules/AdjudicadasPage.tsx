import { useState, useEffect } from 'react'
import { Trophy, Search, Kanban } from 'lucide-react'
import api from '../../api/client'

type Pestana = 'adjudicadas' | 'por_adjudicarse'
type Vista = 'buscar' | 'pipeline'

export default function AdjudicadasPage() {
  const [vista, setVista] = useState<Vista>('buscar')
  const [pestana, setPestana] = useState<Pestana>('adjudicadas')
  const [resultados, setResultados] = useState<any[]>([])
  const [pipeline, setPipeline] = useState<any[]>([])
  const [etapas, setEtapas] = useState<any[]>([])
  const [filtros, setFiltros] = useState({ region: '', monto_minimo: 0, keyword: '' })
  const [rutFiltro, setRutFiltro] = useState('')
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (vista === 'pipeline') cargarPipeline()
  }, [vista, rutFiltro])

  async function buscar() {
    setCargando(true)
    try {
      const params = new URLSearchParams({
        pestana,
        ...(filtros.region && { region: filtros.region }),
        ...(filtros.monto_minimo && { monto_minimo: String(filtros.monto_minimo) }),
        ...(filtros.keyword && { keyword: filtros.keyword }),
      })
      const res = await api.get(`/modules/adjudicadas/preview?${params}`)
      setResultados(res.data)
    } finally {
      setCargando(false)
    }
  }

  async function cargarPipeline() {
    const [pipe, etps] = await Promise.all([
      api.get(`/modules/adjudicadas/pipeline${rutFiltro ? `?rut=${rutFiltro}` : ''}`),
      api.get('/modules/adjudicadas/etapas')
    ])
    setPipeline(pipe.data)
    setEtapas(etps.data)
  }

  async function guardar(codigo: string) {
    await api.post(`/modules/adjudicadas/guardar/${codigo}`)
    buscar()
  }

  async function moverEtapa(cardId: string, etapaId: string) {
    await api.patch(`/modules/adjudicadas/cards/${cardId}/etapa`, { etapa_id: etapaId })
    cargarPipeline()
  }

  const formatCLP = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Trophy size={24} className="text-brand-600" />
          <h1 className="text-2xl font-bold text-gray-900">Adjudicadas</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setVista('buscar')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              vista === 'buscar' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Search size={16} /> Buscar
          </button>
          <button
            onClick={() => setVista('pipeline')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              vista === 'pipeline' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Kanban size={16} /> Pipeline
          </button>
        </div>
      </div>

      {/* Vista Buscar */}
      {vista === 'buscar' && (
        <div>
          {/* Pestañas */}
          <div className="flex gap-1 mb-4 border-b border-gray-200">
            {(['adjudicadas', 'por_adjudicarse'] as Pestana[]).map(p => (
              <button
                key={p}
                onClick={() => setPestana(p)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  pestana === p
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {p === 'adjudicadas' ? 'Adjudicadas' : 'Por adjudicarse'}
              </button>
            ))}
          </div>

          {/* Filtros */}
          <div className="flex gap-3 mb-4 flex-wrap">
            <input
              type="text"
              placeholder="Buscar por nombre..."
              value={filtros.keyword}
              onChange={e => setFiltros(f => ({ ...f, keyword: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64"
            />
            <input
              type="number"
              placeholder="Monto mínimo ($)"
              value={filtros.monto_minimo || ''}
              onChange={e => setFiltros(f => ({ ...f, monto_minimo: Number(e.target.value) }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48"
            />
            <button
              onClick={buscar}
              disabled={cargando}
              className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              {cargando ? 'Buscando...' : 'Buscar'}
            </button>
          </div>

          {/* Tabla */}
          {resultados.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">Empresa</th>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">Licitación</th>
                    <th className="text-right px-4 py-3 text-gray-600 font-medium">Monto</th>
                    <th className="text-right px-4 py-3 text-gray-600 font-medium">Póliza 1%</th>
                    <th className="text-right px-4 py-3 text-gray-600 font-medium">Póliza 5%</th>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">Organismo</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {resultados.map(r => (
                    <tr key={r.codigo} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{r.nombre_adjudicado}</div>
                        <div className="text-xs text-gray-500">{r.rut_adjudicado}</div>
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <div className="text-gray-800 truncate">{r.nombre}</div>
                        <div className="text-xs text-gray-500">{r.codigo}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {formatCLP(r.monto_adjudicado)}
                      </td>
                      <td className="px-4 py-3 text-right text-blue-600 font-medium">
                        {formatCLP(r.poliza_seriedad)}
                      </td>
                      <td className="px-4 py-3 text-right text-green-600 font-medium">
                        {formatCLP(r.poliza_cumplimiento)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{r.organismo}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => guardar(r.codigo)}
                          className="bg-brand-50 text-brand-600 border border-brand-200 px-3 py-1 rounded-lg text-xs font-medium hover:bg-brand-100"
                        >
                          + Pipeline
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {resultados.length === 0 && !cargando && (
            <div className="text-center py-16 text-gray-400">
              <Search size={40} className="mx-auto mb-3 opacity-30" />
              <p>Usa los filtros y presiona Buscar para ver resultados.</p>
            </div>
          )}
        </div>
      )}

      {/* Vista Pipeline */}
      {vista === 'pipeline' && (
        <div>
          <input
            type="text"
            placeholder="Filtrar por RUT o nombre de empresa..."
            value={rutFiltro}
            onChange={e => setRutFiltro(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-80 mb-6"
          />

          <div className="space-y-4">
            {pipeline.map(empresa => (
              <div key={empresa.rut} className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-5 py-3 flex items-center gap-4 border-b border-gray-200">
                  <span className="font-semibold text-gray-900">{empresa.nombre}</span>
                  <span className="text-sm text-gray-500">{empresa.rut}</span>
                  <span className="ml-auto text-xs text-gray-400">
                    {empresa.proyectos.length} proyecto{empresa.proyectos.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="divide-y divide-gray-100">
                  {empresa.proyectos.map((p: any) => (
                    <div key={p.card_id} className="px-5 py-3 flex items-center gap-4 hover:bg-gray-50">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">{p.licitacion_nombre}</div>
                        <div className="text-xs text-gray-500 flex gap-4 mt-0.5">
                          <span>Monto: {formatCLP(p.monto_adjudicado)}</span>
                          <span className="text-blue-600">Seriedad: {formatCLP(p.poliza_seriedad)}</span>
                          <span className="text-green-600">Cumplimiento: {formatCLP(p.poliza_cumplimiento)}</span>
                        </div>
                      </div>
                      <select
                        value={p.etapa_id}
                        onChange={e => moverEtapa(p.card_id, e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 bg-white"
                      >
                        {etapas.map((etapa: any) => (
                          <option key={etapa.id} value={etapa.id}>{etapa.name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {pipeline.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <Trophy size={40} className="mx-auto mb-3 opacity-30" />
                <p>No hay empresas en el pipeline aún.</p>
                <p className="text-sm mt-1">Agrega licitaciones desde la vista Buscar.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
