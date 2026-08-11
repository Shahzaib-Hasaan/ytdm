import { useEffect, useState } from 'react'
import {
  ArrowDownToLine,
  CheckCheck,
  CheckCircle2,
  Info,
  ListVideo,
  Moon,
  Pause,
  Play,
  Plus,
  Search,
  Settings2,
  Sun,
  XCircle
} from 'lucide-react'
import { filteredJobs, useApp, type FilterTab } from './store'
import AddDialog from './components/AddDialog'
import QueueTable from './components/QueueTable'
import StatusBar from './components/StatusBar'
import SettingsPanel from './components/SettingsPanel'
import RemoveConfirm from './components/RemoveConfirm'
import AboutDialog from './components/AboutDialog'

const YT_RE =
  /https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch|shorts|playlist)[^\s]*|youtu\.be\/[^\s]+)/

const NAV: { key: FilterTab; label: string; icon: React.ComponentType<{ size?: number | string }> }[] = [
  { key: 'all', label: 'All downloads', icon: ListVideo },
  { key: 'downloading', label: 'Downloading', icon: ArrowDownToLine },
  { key: 'completed', label: 'Completed', icon: CheckCircle2 },
  { key: 'failed', label: 'Failed', icon: XCircle }
]

function ToolButton(props: {
  title: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      title={props.title}
      onClick={props.onClick}
      className="rounded-md p-1.5 text-muted hover:bg-raised hover:text-fg"
    >
      {props.children}
    </button>
  )
}

export default function App(): React.JSX.Element {
  const {
    init,
    openAddDialog,
    addDialogOpen,
    engineStatus,
    jobs,
    tab,
    setTab,
    search,
    setSearch,
    theme,
    toggleTheme,
    selectedIds,
    clearSelection,
    askRemove
  } = useApp()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)

  useEffect(() => {
    void init()
  }, [init])

  // Paste anywhere: a YouTube URL on the clipboard opens the add dialog primed.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      const text = e.clipboardData?.getData('text') ?? ''
      const m = text.match(YT_RE)
      if (m) openAddDialog(m[0])
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [openAddDialog])

  const ready = engineStatus?.binReady ?? false
  const counts: Record<FilterTab, number> = {
    all: jobs.length,
    downloading: filteredJobs(jobs, 'downloading', '').length,
    completed: filteredJobs(jobs, 'completed', '').length,
    failed: filteredJobs(jobs, 'failed', '').length
  }

  const bulk = (kind: 'pause' | 'resume' | 'clear'): void => {
    for (const j of jobs) {
      if (kind === 'pause' && (j.state === 'active' || j.state === 'queued'))
        void window.api.jobAction('pause', j.id)
      if (kind === 'resume' && j.state === 'paused') void window.api.jobAction('resume', j.id)
      if (kind === 'clear' && j.state === 'completed') void window.api.jobAction('remove', j.id)
    }
  }

  return (
    <div className="flex h-screen">
      <aside className="flex w-14 shrink-0 flex-col border-r border-line bg-panel md:w-52">
        <div className="flex items-baseline justify-center px-2 pb-4 pt-4 font-display text-[16px] font-semibold tracking-tight md:justify-start md:px-4">
          <span className="text-brand">YT</span>
          <span className="hidden text-fg md:inline">DM</span>
        </div>

        <nav className="flex flex-col gap-0.5 px-2">
          {NAV.map((item) => {
            const Icon = item.icon
            const isActive = tab === item.key
            return (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                title={item.label}
                className={`flex items-center justify-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs font-medium md:justify-start ${
                  isActive ? 'bg-accent/12 text-accent' : 'text-muted hover:bg-raised hover:text-fg'
                }`}
              >
                <Icon size={15} />
                <span className="hidden flex-1 md:inline">{item.label}</span>
                {counts[item.key] > 0 ? (
                  <span
                    className={`hidden font-mono text-[10px] md:inline ${isActive ? 'text-accent' : 'text-faint'}`}
                  >
                    {counts[item.key]}
                  </span>
                ) : null}
              </button>
            )
          })}
        </nav>

        <div className="flex-1" />

        <div className="border-t border-line px-2 py-3 md:px-4">
          <div
            className={`flex items-center justify-center gap-1.5 text-[11px] font-medium md:justify-start ${ready ? 'text-ok' : 'text-warn'}`}
            title={
              engineStatus?.ytdlpVersion
                ? `yt-dlp ${engineStatus.ytdlpVersion}`
                : (engineStatus?.binMessage ?? '')
            }
          >
            <span className={`h-1.5 w-1.5 rounded-full ${ready ? 'bg-ok' : 'animate-pulse bg-warn'}`} />
            <span className="hidden md:inline">
              {ready ? 'Engine ready' : (engineStatus?.binMessage ?? 'starting…')}
            </span>
          </div>
          <div className="mt-2 flex flex-col items-center gap-1 md:flex-row">
            <ToolButton title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleTheme}>
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </ToolButton>
            <ToolButton title="Settings" onClick={() => setSettingsOpen((v) => !v)}>
              <Settings2 size={15} />
            </ToolButton>
            <ToolButton title="About & contact" onClick={() => setAboutOpen(true)}>
              <Info size={15} />
            </ToolButton>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-line bg-panel px-3 py-2">
          <button
            onClick={() => openAddDialog()}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-accent-hi"
          >
            <Plus size={14} strokeWidth={2.5} />
            <span className="hidden sm:inline">Add download</span>
          </button>

          <div className="mx-1 h-5 w-px bg-line" />
          <ToolButton title="Pause all" onClick={() => bulk('pause')}>
            <Pause size={15} />
          </ToolButton>
          <ToolButton title="Resume all" onClick={() => bulk('resume')}>
            <Play size={15} />
          </ToolButton>
          <ToolButton title="Clear completed" onClick={() => bulk('clear')}>
            <CheckCheck size={15} />
          </ToolButton>

          <div className="flex-1" />

          <div className="relative">
            <Search
              size={13}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-faint"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search downloads"
              className="w-28 rounded-md border border-line bg-ink py-1 pl-7 pr-2 text-xs text-fg placeholder-faint outline-none focus:border-accent sm:w-48"
            />
          </div>
        </header>

        {selectedIds.size > 0 ? (
          <div className="flex items-center gap-2 border-b border-line bg-accent/8 px-3 py-1.5 text-xs">
            <span className="font-medium text-fg">{selectedIds.size} selected</span>
            <div className="mx-1 h-4 w-px bg-line" />
            {(
              [
                ['pause', 'Pause'],
                ['resume', 'Resume'],
                ['retry', 'Retry'],
                ['cancel', 'Cancel']
              ] as ['pause' | 'resume' | 'retry' | 'cancel', string][]
            ).map(([action, label]) => (
              <button
                key={action}
                onClick={() => {
                  for (const id of selectedIds) void window.api.jobAction(action, id)
                }}
                className="rounded-md px-2 py-1 text-muted hover:bg-raised hover:text-fg"
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => askRemove([...selectedIds])}
              className="rounded-md px-2 py-1 text-brand hover:bg-brand/10"
            >
              Remove…
            </button>
            <div className="flex-1" />
            <button onClick={clearSelection} className="rounded-md px-2 py-1 text-muted hover:bg-raised hover:text-fg">
              Clear selection
            </button>
          </div>
        ) : null}

        <main className="min-h-0 flex-1 overflow-auto">
          <QueueTable />
        </main>

        <StatusBar />
      </div>

      {addDialogOpen && <AddDialog />}
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}
      <RemoveConfirm />
    </div>
  )
}
