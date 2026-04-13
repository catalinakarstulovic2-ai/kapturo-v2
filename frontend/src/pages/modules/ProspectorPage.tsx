import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../api/client'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import type { Prospect } from '../../types'
import {
  Search, Map, Globe, Loader2, ChevronDown, ChevronUp,
  Phone, MapPin, ExternalLink, X, Bot, ArrowRight, Bell,
  WifiOff, AlertTriangle, Wifi, RefreshCw, Building2,
  Copy, Clock,
} from 'lucide-react'

type Tab = 'maps' | 'apollo' | 'social'
interface IaState { texto: string; loading: boolean }

function WebBadge({ status }: { status?: string }) {
  if (status === 'sin_web')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700"><WifiOff size={9} /> Sin web</span>
  if (status === 'solo_redes')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700"><AlertTriangle size={9} /> Solo redes</span>
  if (status === 'tiene_web')
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-700"><Wifi size={9} /> Tiene web</span>
  return null
}

function ScoreCircle({ score }: { score: number }) {
  const bg = score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500'
  return <div className={`w-10 h-10 rounded-full ${bg} flex items-center justify-center text-white text-sm font-bold shrink-0`}>{Math.round(score)}</div>
}

export default function ProspectorPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('maps')
  const [mapsForm, setMapsForm] = useState({ query: '', location: '', nicho: '', producto: '', max_results: 40 })
  const [apolloForm, setApolloForm] = useState({ titles: '', locations: '', keywords: '', industry: '', nicho: '', producto: '' })
  const [socialForm, setSocialForm] = useState({ keywords: '', location: '', nicho: '', producto: '' })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [notasEdit, setNotasEdit] = useState<Record<string, string>>({})
  const [savingStatus, setSavingStatus] = useState<Record<string, 'idle' | 'saving' | 'saved'>>({})
  const [alarmaForm, setAlarmaForm] = useState<Record<string, { fecha: string; motivo: string }>>({})
  const [mensajeIA, setMensajeIA] = useState<Record<string, IaState>>({})
  const [pipelineLoading, setPipelineLoading] = useState<Record<string, boolean>>({})
  const [excluidoLoading, setExcluidoLoading] = useState<Record<string, boolean>>({})
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const { data: prospectsData, refetch, isLoading: listLoading } = useQuery({
    queryKey: ['prospector-list'],
    queryFn: () => api.get('/modules/prospector/prospectos', { params: { modulo: 'prospector', por_pagina: 100 } }).then(r => r.data),
  })
  const prospects: Prospect[] = prospectsData?.prospectos ?? []

  const searchMutation = useMutation({
    mutationFn: (payload: any) => api.post('/modules/prospector/maps-directo', payload),
    onSuccess: (res) => {
      const { guardados, duplicados, total_encontrados } = res.data
      toast.success(`${guardados} nuevos prospectos (${duplicados} duplicados de ${total_encontrados} encontrados)`)
      qc.invalidateQueries({ queryKey: ['prospector-list'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Error en busqueda'),
  })

  const apolloMutation = useMutation({
    mutationFn: (payload: any) => api.post('/modules/prospector/apollo', payload),
    onSuccess: (res) => {
      const { guardados = 0, duplicados = 0, total_encontrados = 0 } = res.data
      toast.success(`${guardados} nuevos prospectos Apollo (${duplicados} duplicados de ${total_encontrados} encontrados)`)
      qc.invalidateQueries({ queryKey: ['prospector-list'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Error en busqueda Apollo'),
  })

  const socialMutation = useMutation({
    mutationFn: (payload: any) => api.post('/modules/prospector/social', payload),
    onSuccess: (res) => {
      const { guardados = 0, duplicados = 0, total_encontrados = 0 } = res.data
      toast.success(`${guardados} nuevos prospectos Social (${duplicados} duplicados de ${total_encontrados} encontrados)`)
      qc.invalidateQueries({ queryKey: ['prospector-list'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Error en busqueda Social'),
  })

  const handleSearch = () => {
    if (tab === 'maps') {
      if (!mapsForm.query.trim() || !mapsForm.location.trim()) { toast.error('Ingresa que buscar y en que ciudad'); return }
      searchMutation.mutate({ query: mapsForm.query, location: mapsForm.location, nicho: mapsForm.nicho, producto: mapsForm.producto, max_results: mapsForm.max_results })
    } else if (tab === 'apollo') {
      if (!apolloForm.titles.trim()) { toast.error('Ingresa al menos un cargo a buscar'); return }
      const titlesArr = apolloForm.titles.split(',').map(t => t.trim()).filter(Boolean)
      const locsArr = apolloForm.locations.split(',').map(l => l.trim()).filter(Boolean)
      apolloMutation.mutate({
        titles: titlesArr,
        locations: locsArr.length > 0 ? locsArr : ['Chile'],
        keywords: apolloForm.keywords || undefined,
        industry: apolloForm.industry || undefined,
        nicho: apolloForm.nicho || undefined,
        producto: apolloForm.producto || undefined,
      })
    } else if (tab === 'social') {
      if (!socialForm.keywords.trim()) { toast.error('Ingresa al menos una palabra clave'); return }
      const kwArr = socialForm.keywords.split(',').map(k => k.trim()).filter(Boolean)
      socialMutation.mutate({
        keywords: kwArr,
        location: socialForm.location || undefined,
        nicho: socialForm.nicho || undefined,
        producto: socialForm.producto || undefined,
      })
    }
  }

  const handleNotasChange = useCallback((id: string, text: string) => {
    setNotasEdit(prev => ({ ...prev, [id]: text }))
    setSavingStatus(prev => ({ ...prev, [id]: 'saving' }))
    if (debounceTimers.current[id]) clearTimeout(debounceTimers.current[id])
    debounceTimers.current[id] = setTimeout(() => {
      api.put(`/modules/prospector/prospectos/${id}/notas`, { notas: text })
        .then(() => { setSavingStatus(prev => ({ ...prev, [id]: 'saved' })); qc.invalidateQueries({ queryKey: ['prospector-list'] }) })
        .catch(() => setSavingStatus(prev => ({ ...prev, [id]: 'idle' })))
    }, 1000)
  }, [qc])

  const toggleExpand = (id: string, p: Prospect) => {
    setExpandedId(prev => prev === id ? null : id)
    if (!notasEdit[id]) setNotasEdit(prev => ({ ...prev, [id]: p.notes || '' }))
    if (!alarmaForm[id]) setAlarmaForm(prev => ({ ...prev, [id]: { fecha: p.alarma_fecha?.split('T')[0] ?? '', motivo: p.alarma_motivo ?? '' } }))
  }

  const guardarAlarma = (id: string) => {
    const d = alarmaForm[id]
    if (!d?.fecha) return toast.error('Elige una fecha para la alarma')
    api.put(`/modules/prospector/prospectos/${id}/alarma`, { fecha: d.fecha, motivo: d.motivo })
      .then(() => { toast.success('Alarma guardada'); qc.invalidateQueries({ queryKey: ['prospector-list'] }) })
      .catch(() => toast.error('Error al guardar alarma'))
  }

  const llevarAlPipeline = async (id: string) => {
    setPipelineLoading(prev => ({ ...prev, [id]: true }))
    try { await api.post(`/modules/prospector/prospectos/${id}/pipeline`); toast.success('Prospecto en el pipeline'); qc.invalidateQueries({ queryKey: ['prospector-list'] }) }
    catch (err: any) { toast.error(err.response?.data?.detail || 'Error al llevar al pipeline') }
    finally { setPipelineLoading(prev => ({ ...prev, [id]: false })) }
  }

  const excluir = async (id: string) => {
    setExcluidoLoading(prev => ({ ...prev, [id]: true }))
    try { await api.post(`/modules/prospector/prospectos/${id}/excluir`); toast.success('Prospecto excluido'); qc.invalidateQueries({ queryKey: ['prospector-list'] }) }
    catch { toast.error('Error al excluir') }
    finally { setExcluidoLoading(prev => ({ ...prev, [id]: false })) }
  }

  const generarMensaje = async (id: string) => {
    const activeNicho = tab === 'apollo' ? apolloForm.nicho : tab === 'social' ? socialForm.nicho : mapsForm.nicho
    const activeProducto = tab === 'apollo' ? apolloForm.producto : tab === 'social' ? socialForm.producto : mapsForm.producto
    setMensajeIA(prev => ({ ...prev, [id]: { texto: '', loading: true } }))
    try {
      const res = await api.post(`/modules/prospector/prospectos/${id}/generar-mensaje`, { nicho: activeNicho, producto: activeProducto, notas: notasEdit[id] ?? '' })
      setMensajeIA(prev => ({ ...prev, [id]: { texto: res.data.mensaje, loading: false } }))
    } catch { toast.error('Error al generar mensaje'); setMensajeIA(prev => ({ ...prev, [id]: { texto: '', loading: false } })) }
  }

  const hoy = new Date().toISOString().split('T')[0]
  const alarmasHoy = prospects.filter(p => p.alarma_fecha?.startsWith(hoy))
  const sinWeb = prospects.filter(p => p.web_status === 'sin_web').length
  const soloRedes = prospects.filter(p => p.web_status === 'solo_redes').length
  const enPipeline = prospects.filter(p => p.in_pipeline).length

  return (
    <div className="flex gap-6 min-h-0">
      <aside className="w-72 shrink-0 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Prospector</h1>
          <p className="text-xs text-gray-500 mt-0.5">Encuentra clientes con senales reales de compra</p>
        </div>

        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 text-xs">
          {([{ id: 'maps', label: 'Maps', ok: true }, { id: 'apollo', label: 'Apollo', ok: true }, { id: 'social', label: 'Social', ok: true }] as { id: Tab; label: string; ok: boolean }[]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={clsx('flex-1 py-1.5 rounded font-medium transition-colors', tab === t.id ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700')}>
              {t.label}{!t.ok && <span className="ml-1 text-[9px] text-orange-400">pronto</span>}
            </button>
          ))}
        </div>

        <div className="card p-4 space-y-3">
          {tab === 'maps' && <>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Que buscar</label>
              <input className="input text-sm" placeholder="restaurantes, talleres, boutiques..." value={mapsForm.query} onChange={e => setMapsForm(f => ({ ...f, query: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Ciudad / Zona</label>
              <input className="input text-sm" placeholder="Santiago, Miami, Buenos Aires..." value={mapsForm.location} onChange={e => setMapsForm(f => ({ ...f, location: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tu nicho <span className="text-gray-400 font-normal">(para IA)</span></label>
              <input className="input text-sm" placeholder="agencia web, marketing, real estate..." value={mapsForm.nicho} onChange={e => setMapsForm(f => ({ ...f, nicho: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tu producto/servicio</label>
              <input className="input text-sm" placeholder="diseno web, SEO, automatizacion..." value={mapsForm.producto} onChange={e => setMapsForm(f => ({ ...f, producto: e.target.value }))} />
            </div>
            <div className="bg-blue-50 rounded-lg p-2.5 text-[11px] text-blue-700 leading-relaxed">
              Tip: Los negocios sin web son leads calientes para agencias digitales.
            </div>
          </>}
          {tab === 'apollo' && <>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Cargos a buscar</label>
              <input className="input text-sm" placeholder="CEO, Founder, Gerente General..." value={apolloForm.titles} onChange={e => setApolloForm(f => ({ ...f, titles: e.target.value }))} />
              <p className="text-[10px] text-gray-400 mt-0.5">Separados por coma</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Ubicaciones</label>
              <input className="input text-sm" placeholder="Chile, Argentina, Mexico..." value={apolloForm.locations} onChange={e => setApolloForm(f => ({ ...f, locations: e.target.value }))} />
              <p className="text-[10px] text-gray-400 mt-0.5">Separadas por coma</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Industria</label>
              <input className="input text-sm" placeholder="Tecnologia, Retail, Salud..." value={apolloForm.industry} onChange={e => setApolloForm(f => ({ ...f, industry: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tu nicho <span className="text-gray-400 font-normal">(para IA)</span></label>
              <input className="input text-sm" placeholder="agencia web, marketing, real estate..." value={apolloForm.nicho} onChange={e => setApolloForm(f => ({ ...f, nicho: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tu producto/servicio</label>
              <input className="input text-sm" placeholder="diseno web, SEO, automatizacion..." value={apolloForm.producto} onChange={e => setApolloForm(f => ({ ...f, producto: e.target.value }))} />
            </div>
          </>}
          {tab === 'social' && <>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Palabras clave</label>
              <input className="input text-sm" placeholder="inmobiliaria, real estate, propiedades..." value={socialForm.keywords} onChange={e => setSocialForm(f => ({ ...f, keywords: e.target.value }))} />
              <p className="text-[10px] text-gray-400 mt-0.5">Separadas por coma</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Ubicacion / Pais</label>
              <input className="input text-sm" placeholder="Chile, Miami, LATAM..." value={socialForm.location} onChange={e => setSocialForm(f => ({ ...f, location: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tu nicho <span className="text-gray-400 font-normal">(para IA)</span></label>
              <input className="input text-sm" placeholder="agencia web, marketing, real estate..." value={socialForm.nicho} onChange={e => setSocialForm(f => ({ ...f, nicho: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tu producto/servicio</label>
              <input className="input text-sm" placeholder="diseno web, SEO, automatizacion..." value={socialForm.producto} onChange={e => setSocialForm(f => ({ ...f, producto: e.target.value }))} />
            </div>
            <div className="bg-blue-50 rounded-lg p-2.5 text-[11px] text-blue-700 leading-relaxed">
              Tip: Escanea Facebook Groups, Instagram y TikTok con Apify.
            </div>
          </> }
          <button className="btn-primary w-full flex items-center justify-center gap-2 text-sm py-2.5" onClick={handleSearch} disabled={searchMutation.isPending || apolloMutation.isPending || socialMutation.isPending}>
            {(searchMutation.isPending || apolloMutation.isPending || socialMutation.isPending) ? <><Loader2 size={14} className="animate-spin" /> Buscando...</> : <><Search size={14} /> Lanzar busqueda</>}
          </button>
        </div>

        {prospects.length > 0 && (
          <div className="card p-3">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Resumen</p>
            <div className="grid grid-cols-3 gap-1 text-center">
              <div className="bg-red-50 rounded-lg py-2"><p className="text-lg font-bold text-red-600">{sinWeb}</p><p className="text-[10px] text-red-500">Sin web</p></div>
              <div className="bg-amber-50 rounded-lg py-2"><p className="text-lg font-bold text-amber-600">{soloRedes}</p><p className="text-[10px] text-amber-500">Solo redes</p></div>
              <div className="bg-brand-50 rounded-lg py-2"><p className="text-lg font-bold text-brand-600">{enPipeline}</p><p className="text-[10px] text-brand-500">Pipeline</p></div>
            </div>
          </div>
        )}
      </aside>

      <div className="flex-1 min-w-0 space-y-3">
        {alarmasHoy.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
            <Bell size={15} className="text-amber-600 shrink-0" />
            <p className="text-sm text-amber-800"><strong>Alarmas para hoy ({alarmasHoy.length}):</strong> {alarmasHoy.map(p => p.company_name).join(', ')}</p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-600">
            {listLoading ? 'Cargando...' : <>{prospects.length} prospecto{prospects.length !== 1 ? 's' : ''}{searchMutation.isPending && <span className="ml-2 text-brand-500 inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> buscando...</span>}</>}
          </p>
          <button onClick={() => refetch()} className="text-gray-400 hover:text-gray-600 transition-colors"><RefreshCw size={14} /></button>
        </div>

        {!listLoading && prospects.length === 0 && !searchMutation.isPending && (
          <div className="card p-14 text-center space-y-3">
            <Building2 size={44} className="mx-auto text-gray-200" />
            <p className="font-semibold text-gray-500">Sin prospectos todavia</p>
            <p className="text-sm text-gray-400">Completa el formulario y lanza tu primera busqueda.</p>
          </div>
        )}

        <div className="space-y-2">
          {prospects.map(p => {
            const isExpanded = expandedId === p.id
            const notas = notasEdit[p.id] ?? (p.notes || '')
            const ia = mensajeIA[p.id]
            const saveStatus = savingStatus[p.id]
            const alarma = alarmaForm[p.id] ?? { fecha: p.alarma_fecha?.split('T')[0] ?? '', motivo: p.alarma_motivo ?? '' }
            return (
              <div key={p.id} className={clsx('card overflow-hidden transition-all duration-150', isExpanded && 'ring-1 ring-brand-200')}>
                <div className="p-4 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => toggleExpand(p.id, p)}>
                  <ScoreCircle score={p.score} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="font-semibold text-gray-900 truncate max-w-xs">{p.company_name}</h3>
                      <WebBadge status={p.web_status} />
                      {p.in_pipeline && <span className="text-[10px] px-1.5 py-0.5 bg-brand-100 text-brand-700 rounded-full font-semibold">En pipeline</span>}
                      {p.alarma_fecha && <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-semibold flex items-center gap-0.5"><Clock size={8} /> {p.alarma_fecha.split('T')[0]}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-0.5 text-xs text-gray-500">
                      {p.industry && <span>{p.industry}</span>}
                      {p.city && <span className="flex items-center gap-0.5"><MapPin size={10} />{p.city}</span>}
                      {p.phone && <span className="flex items-center gap-0.5 text-emerald-600 font-medium"><Phone size={10} />{p.phone}</span>}
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp size={16} className="text-gray-400 shrink-0" /> : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
                </div>

                {isExpanded && (
                  <div className="px-4 pb-5 space-y-5 border-t border-gray-100 pt-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      {p.address && <div className="flex items-start gap-1.5 text-gray-600"><MapPin size={13} className="text-gray-400 mt-0.5 shrink-0" /><span className="break-words">{p.address}</span></div>}
                      {p.phone && <div className="flex items-center gap-1.5"><Phone size={13} className="text-gray-400 shrink-0" /><a href={`tel:${p.phone}`} className="text-gray-700 hover:text-brand-500">{p.phone}</a></div>}
                      {p.website && <div className="flex items-center gap-1.5"><Globe size={13} className="text-gray-400 shrink-0" /><a href={p.website.startsWith('http') ? p.website : `https://${p.website}`} target="_blank" rel="noopener noreferrer" className="text-brand-500 hover:underline truncate max-w-[200px]">{p.website.replace(/^https?:\/\//, '')}</a></div>}
                      {p.source_url && <div className="flex items-center gap-1.5"><Map size={13} className="text-gray-400 shrink-0" /><a href={p.source_url} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-brand-500 flex items-center gap-1">Ver en Google Maps <ExternalLink size={10} /></a></div>}
                    </div>

                    {p.score_reason && <p className="text-xs text-gray-400 italic bg-gray-50 rounded-lg px-3 py-1.5">{p.score_reason}</p>}

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-semibold text-gray-700">Notas</label>
                        <span className="text-[11px]">
                          {saveStatus === 'saving' && <span className="text-gray-400 flex items-center gap-1"><Loader2 size={10} className="animate-spin" />guardando...</span>}
                          {saveStatus === 'saved' && <span className="text-emerald-500">guardado</span>}
                        </span>
                      </div>
                      <textarea className="input text-sm resize-none w-full" rows={3} placeholder="Hable con el dueno. Tiene presupuesto para Q3. Prefiere WhatsApp..." value={notas} onChange={e => handleNotasChange(p.id, e.target.value)} />
                      {p.notes_history && p.notes_history.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {p.notes_history.slice(-3).reverse().map((n, i) => (
                            <div key={i} className="text-[11px] text-gray-500 bg-gray-50 rounded-lg px-2.5 py-1.5">
                              <span className="text-gray-400">{new Date(n.created_at).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                              <p className="mt-0.5">{n.text}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-gray-700 mb-1.5">Alarma de seguimiento</p>
                      <div className="flex gap-2">
                        <input type="date" className="input text-sm w-36 shrink-0" value={alarma.fecha} onChange={e => setAlarmaForm(prev => ({ ...prev, [p.id]: { ...alarma, fecha: e.target.value } }))} />
                        <input className="input text-sm flex-1" placeholder="Ej: Llamar para agendar demo..." value={alarma.motivo} onChange={e => setAlarmaForm(prev => ({ ...prev, [p.id]: { ...alarma, motivo: e.target.value } }))} />
                        <button className="btn-secondary text-sm px-3 shrink-0" onClick={() => guardarAlarma(p.id)}>Guardar</button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100">
                      <button className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors', p.in_pipeline ? 'bg-gray-100 text-gray-400 cursor-default' : 'bg-brand-500 text-white hover:bg-brand-600')} onClick={() => !p.in_pipeline && llevarAlPipeline(p.id)} disabled={pipelineLoading[p.id] || !!p.in_pipeline}>
                        {pipelineLoading[p.id] ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
                        {p.in_pipeline ? 'Ya en pipeline' : 'Llevar al pipeline'}
                      </button>
                      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors" onClick={() => generarMensaje(p.id)} disabled={ia?.loading}>
                        {ia?.loading ? <Loader2 size={13} className="animate-spin" /> : <Bot size={13} />}
                        Generar mensaje IA
                      </button>
                      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors ml-auto" onClick={() => excluir(p.id)} disabled={excluidoLoading[p.id]}>
                        {excluidoLoading[p.id] ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                        Excluir
                      </button>
                    </div>

                    {ia?.texto && (
                      <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-purple-700 flex items-center gap-1.5"><Bot size={13} /> Mensaje generado</span>
                          <button className="text-xs text-purple-500 hover:text-purple-700 flex items-center gap-1" onClick={() => { navigator.clipboard.writeText(ia.texto); toast.success('Copiado') }}>
                            <Copy size={11} /> Copiar
                          </button>
                        </div>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{ia.texto}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
