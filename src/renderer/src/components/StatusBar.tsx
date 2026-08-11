import { ArrowDown, FolderOpen } from 'lucide-react'
import { useApp } from '../store'
import { formatSpeed } from '../util'

export default function StatusBar(): React.JSX.Element {
  const { jobs, settings } = useApp()
  const active = jobs.filter((j) => j.state === 'active')
  const queued = jobs.filter((j) => j.state === 'queued')
  const done = jobs.filter((j) => j.state === 'completed')
  const totalSpeed = active.reduce((sum, j) => sum + j.progress.speedBps, 0)
  const limit = settings?.speedLimitKbps ?? 0

  return (
    <footer className="flex items-center gap-4 border-t border-line bg-panel px-3 py-1.5 text-[11px]">
      <span className="flex items-center gap-1.5 text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-azure" />
        <span className="font-mono">{active.length}</span> downloading
      </span>
      <span className="flex items-center gap-1.5 text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-muted" />
        <span className="font-mono">{queued.length}</span> queued
      </span>
      <span className="flex items-center gap-1.5 text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-ok" />
        <span className="font-mono">{done.length}</span> done
      </span>

      <div className="flex-1" />

      {settings ? (
        <button
          title="Open download folder"
          onClick={() => void window.api.showInFolder(settings.downloadDir)}
          className="hidden max-w-72 items-center gap-1.5 truncate text-faint hover:text-fg md:flex"
        >
          <FolderOpen size={12} />
          <span className="truncate">{settings.downloadDir}</span>
        </button>
      ) : null}

      <span className="flex items-center gap-1 font-mono text-[12px] text-fg">
        <ArrowDown size={12} className={active.length > 0 ? 'text-azure' : 'text-faint'} />
        {formatSpeed(totalSpeed)}
        {limit > 0 ? <span className="text-faint"> / cap {limit} KB/s</span> : null}
      </span>
    </footer>
  )
}
