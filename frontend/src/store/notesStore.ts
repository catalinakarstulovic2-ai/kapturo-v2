import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Task {
  id: string
  text: string
  done: boolean
  prospectId?: string
  prospectName?: string
  createdAt: string
}

interface NotesState {
  open: boolean
  minimized: boolean
  tasks: Task[]
  setOpen: (v: boolean) => void
  setMinimized: (v: boolean) => void
  addTask: (text: string, prospectId?: string, prospectName?: string) => void
  toggleTask: (id: string) => void
  deleteTask: (id: string) => void
  clearDone: () => void
}

export const useNotesStore = create<NotesState>()(
  persist(
    (set) => ({
      open: false,
      minimized: false,
      tasks: [],
      setOpen:      (open)      => set({ open }),
      setMinimized: (minimized) => set({ minimized }),
      addTask: (text, prospectId, prospectName) =>
        set(s => ({
          tasks: [
            { id: Date.now().toString(), text, done: false, prospectId, prospectName, createdAt: new Date().toISOString() },
            ...s.tasks,
          ]
        })),
      toggleTask: (id) =>
        set(s => ({ tasks: s.tasks.map(t => t.id === id ? { ...t, done: !t.done } : t) })),
      deleteTask: (id) =>
        set(s => ({ tasks: s.tasks.filter(t => t.id !== id) })),
      clearDone: () =>
        set(s => ({ tasks: s.tasks.filter(t => !t.done) })),
    }),
    {
      name: 'kapturo-notas',
      partialize: (s) => ({ tasks: s.tasks }),
    }
  )
)
