import { useRef, useEffect, useState, useCallback } from 'react'
import { X, Minus, ChevronUp, Trash2, GripVertical, Plus, Check, User, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useNotesStore } from '../../store/notesStore'
import api from '../../api/client'

export default function FloatingNotes() {
  const { open, minimized, tasks, setOpen, setMinimized, addTask, toggleTask, deleteTask, clearDone } = useNotesStore()
  const navigate = useNavigate()

  // Drag
  const dragOffset = useRef({ dx: 0, dy: 0 })
  const dragging   = useRef(false)
  const panelRef   = useRef<HTMLDivElement>(null)
  const posRef     = useRef({ x: window.innerWidth - 360, y: 72 })

  // Input nueva tarea
  const [input, setInput]           = useState('')
  const [mention, setMention]       = useState('')   // texto después del @
  const [showMention, setShowMention] = useState(false)
  const [linked, setLinked]         = useState<{ id: string; name: string } | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Prospectos para autocomplete
  const { data: prospectos } = useQuery({
    queryKey: ['prospectos-mention'],
    queryFn: () => api.get('/modules/prospector/prospectos', { params: { por_pagina: 200 } }).then(r => r.data.prospectos),
    enabled: showMention,
    staleTime: 60_000,
  })

  const suggestions = showMention && mention.length >= 1
    ? (prospectos ?? []).filter((p: any) =>
        p.company_name?.toLowerCase().includes(mention.toLowerCase())
      ).slice(0, 5)
    : []

  const handleInput = useCallback((val: string) => {
    setInput(val)
    const atIdx = val.lastIndexOf('@')
    if (atIdx !== -1) {
      const after = val.slice(atIdx + 1)
      if (!after.includes(' ') || after.length < 20) {
        setMention(after)
        setShowMention(true)
        return
      }
    }
    setShowMention(false)
    setMention('')
  }, [])

  const selectProspect = (p: any) => {
    setLinked({ id: p.id, name: p.company_name })
    // Reemplazar @texto con @NombreEmpresa en el input
    const atIdx = input.lastIndexOf('@')
    setInput(input.slice(0, atIdx) + '')
    setShowMention(false)
    setMention('')
    inputRef.current?.focus()
  }

  const submit = () => {
    const text = input.trim()
    if (!text) return
    addTask(text, linked?.id, linked?.name)
    setInput('')
    setLinked(null)
    setShowMention(false)
  }

  // Drag handlers
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const rect = panelRef.current!.getBoundingClientRect()
    dragOffset.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    dragging.current = true
    const move = (ev: MouseEvent) => {
      if (!dragging.current || !panelRef.current) return
      const nx = Math.max(0, Math.min(window.innerWidth  - 340, ev.clientX - dragOffset.current.dx))
      const ny = Math.max(0, Math.min(window.innerHeight - 48,  ev.clientY - dragOffset.current.dy))
      panelRef.current.style.left = nx + 'px'
      panelRef.current.style.top  = ny + 'px'
      posRef.current = { x: nx, y: ny }
    }
    const up = () => { dragging.current = false; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  useEffect(() => {
    if (open && !minimized) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open, minimized])

  if (!open) return null

  const pending = tasks.filter(t => !t.done).length
  const done    = tasks.filter(t => t.done).length

  return (
    <div
      ref={panelRef}
      className="fixed z-50 bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
      style={{ left: posRef.current.x, top: posRef.current.y, width: minimized ? 220 : 340 }}
    >
      {/* Header */}
      <div
        onMouseDown={onMouseDown}
        className="flex items-center gap-2 px-3 py-2.5 bg-amber-400 cursor-grab active:cursor-grabbing select-none"
      >
        <GripVertical size={13} className="text-amber-700 shrink-0" />
        <span className="flex-1 text-sm font-bold text-amber-900">📋 Mis tareas</span>
        {!minimized && pending > 0 && (
          <span className="text-[10px] bg-amber-600 text-white font-bold px-1.5 py-0.5 rounded-full">{pending}</span>
        )}
        <button onMouseDown={e => e.stopPropagation()} onClick={() => setMinimized(!minimized)}
          className="p-1 rounded hover:bg-amber-500 text-amber-800 transition-colors">
          {minimized ? <ChevronUp size={13} /> : <Minus size={13} />}
        </button>
        <button onMouseDown={e => e.stopPropagation()} onClick={() => setOpen(false)}
          className="p-1 rounded hover:bg-amber-500 text-amber-800 transition-colors">
          <X size={13} />
        </button>
      </div>

      {!minimized && (
        <>
          {/* Input nueva tarea */}
          <div className="p-3 border-b border-gray-100 relative">
            {/* Prospect vinculado */}
            {linked && (
              <div className="flex items-center gap-1.5 mb-2">
                <span className="flex items-center gap-1 text-xs bg-brand-50 text-brand-700 border border-brand-200 px-2 py-0.5 rounded-full font-medium">
                  <User size={9} /> {linked.name}
                </span>
                <button onClick={() => setLinked(null)} className="text-gray-400 hover:text-gray-600">
                  <X size={11} />
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => handleInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
                placeholder="Nueva tarea… usa @ para vincular"
                rows={3}
                className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-brand-400 placeholder-gray-300 resize-none"
              />
              <button
                onClick={submit}
                disabled={!input.trim()}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-amber-400 hover:bg-amber-500 text-white disabled:opacity-40 transition-colors shrink-0 mt-0.5"
              >
                <Plus size={15} />
              </button>
            </div>

            {/* Autocomplete @mención */}
            {showMention && suggestions.length > 0 && (
              <div className="absolute left-3 right-3 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                {suggestions.map((p: any) => (
                  <button
                    key={p.id}
                    onMouseDown={e => { e.preventDefault(); selectProspect(p) }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-brand-50 text-left transition-colors"
                  >
                    <div className="w-6 h-6 rounded-lg bg-brand-100 flex items-center justify-center shrink-0">
                      <User size={11} className="text-brand-600" />
                    </div>
                    <span className="text-sm text-gray-800 truncate">{p.company_name}</span>
                    {p.contact_name && <span className="text-xs text-gray-400 truncate">{p.contact_name}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Lista de tareas */}
          <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
            {tasks.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8 px-4">
                Sin tareas. Escribe algo y pulsa Enter.<br />
                <span className="text-gray-300">Usa @ para vincular a un prospecto.</span>
              </p>
            ) : (
              <div className="divide-y divide-gray-50">
                {tasks.map(task => (
                  <div key={task.id} className={`flex items-start gap-2.5 px-3 py-2.5 group transition-colors ${task.done ? 'bg-gray-50/50' : 'hover:bg-amber-50/30'}`}>
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleTask(task.id)}
                      className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                        task.done ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-amber-400'
                      }`}
                    >
                      {task.done && <Check size={9} className="text-white" strokeWidth={3} />}
                    </button>

                    {/* Texto + prospect */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${task.done ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                        {task.text}
                      </p>
                      {task.prospectName && (
                        <button
                          onClick={() => navigate('/prospectos')}
                          className="flex items-center gap-1 mt-1 text-[10px] text-brand-600 bg-brand-50 border border-brand-100 rounded-full px-1.5 py-0.5 hover:bg-brand-100 transition-colors font-medium"
                        >
                          <User size={8} /> {task.prospectName} <ArrowRight size={8} />
                        </button>
                      )}
                    </div>

                    {/* Borrar */}
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 transition-all shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {done > 0 && (
            <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between">
              <span className="text-[11px] text-gray-400">{done} completada{done !== 1 ? 's' : ''}</span>
              <button onClick={clearDone} className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-600 transition-colors">
                <Trash2 size={10} /> Limpiar
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
