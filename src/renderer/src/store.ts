import { create } from 'zustand'
import type { EngineStatus, Job, Settings, UpdateStatus } from '../../shared/types'

export type FilterTab = 'all' | 'downloading' | 'completed' | 'failed'
export type Theme = 'dark' | 'light'

const HISTORY_LEN = 40

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  localStorage.setItem('ytdm-theme', theme)
}

interface AppState {
  jobs: Job[]
  /** Rolling speed samples per active job — feeds the row sparklines. */
  speedHistory: Record<string, number[]>
  settings: Settings | null
  engineStatus: EngineStatus | null
  updateStatus: UpdateStatus | null
  addDialogOpen: boolean
  prefillUrl: string
  tab: FilterTab
  search: string
  theme: Theme
  selectedIds: Set<string>
  /** ids pending the remove-confirm dialog; null = dialog closed */
  removeTarget: string[] | null
  setTab(tab: FilterTab): void
  setSearch(q: string): void
  toggleTheme(): void
  toggleSelect(id: string): void
  setSelection(ids: string[]): void
  clearSelection(): void
  askRemove(ids: string[]): void
  closeRemove(): void
  openAddDialog(url?: string): void
  closeAddDialog(): void
  init(): Promise<void>
}

export const useApp = create<AppState>((set, get) => ({
  jobs: [],
  speedHistory: {},
  settings: null,
  engineStatus: null,
  updateStatus: null,
  addDialogOpen: false,
  prefillUrl: '',
  tab: 'all',
  search: '',
  theme: (localStorage.getItem('ytdm-theme') as Theme) ?? 'dark',
  selectedIds: new Set<string>(),
  removeTarget: null,

  setTab(tab) {
    set({ tab, selectedIds: new Set() })
  },
  toggleSelect(id) {
    const next = new Set(get().selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    set({ selectedIds: next })
  },
  setSelection(ids) {
    set({ selectedIds: new Set(ids) })
  },
  clearSelection() {
    set({ selectedIds: new Set() })
  },
  askRemove(ids) {
    set({ removeTarget: ids })
  },
  closeRemove() {
    set({ removeTarget: null })
  },
  toggleTheme() {
    const theme: Theme = get().theme === 'dark' ? 'light' : 'dark'
    applyTheme(theme)
    set({ theme })
  },
  setSearch(search) {
    set({ search })
  },
  openAddDialog(url = '') {
    set({ addDialogOpen: true, prefillUrl: url })
  },
  closeAddDialog() {
    set({ addDialogOpen: false, prefillUrl: '' })
  },

  async init() {
    applyTheme(get().theme)
    window.api.onJobs((jobs) => {
      const history = { ...get().speedHistory }
      const liveIds = new Set<string>()
      for (const j of jobs) {
        liveIds.add(j.id)
        if (j.state === 'active') {
          const samples = history[j.id] ? [...history[j.id]] : []
          samples.push(j.progress.speedBps)
          if (samples.length > HISTORY_LEN) samples.shift()
          history[j.id] = samples
        }
      }
      for (const id of Object.keys(history)) {
        if (!liveIds.has(id)) delete history[id]
      }
      // Removed jobs must not linger in the selection.
      const sel = new Set([...get().selectedIds].filter((id) => liveIds.has(id)))
      set({ jobs, speedHistory: history, selectedIds: sel })
    })
    window.api.onEngineStatus((engineStatus) => set({ engineStatus }))
    window.api.onUpdateStatus((updateStatus) => set({ updateStatus }))
    window.api.onClipboardUrl((url) => {
      if (!get().addDialogOpen) get().openAddDialog(url)
    })
    const [jobs, settings, engineStatus] = await Promise.all([
      window.api.listJobs(),
      window.api.getSettings(),
      window.api.engineStatus()
    ])
    set({ jobs, settings, engineStatus })
  }
}))

export function filteredJobs(jobs: Job[], tab: FilterTab, search: string): Job[] {
  let out = jobs
  if (tab === 'downloading') {
    out = out.filter((j) => j.state === 'active' || j.state === 'queued' || j.state === 'paused')
  } else if (tab === 'completed') {
    out = out.filter((j) => j.state === 'completed')
  } else if (tab === 'failed') {
    out = out.filter((j) => j.state === 'failed' || j.state === 'canceled')
  }
  const q = search.trim().toLowerCase()
  if (q) {
    out = out.filter(
      (j) => j.title.toLowerCase().includes(q) || (j.uploader ?? '').toLowerCase().includes(q)
    )
  }
  return out
}
