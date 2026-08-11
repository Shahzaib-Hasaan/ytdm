import {
  FolderOpen,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  X
} from 'lucide-react'
import type { Job, JobState } from '../../../shared/types'
import { filteredJobs, useApp } from '../store'
import { formatBytes, formatEta, formatSpeed } from '../util'
import Sparkline from './Sparkline'

const CHIP: Record<JobState, { label: string; cls: string; dot: string }> = {
  queued: { label: 'Queued', cls: 'text-muted bg-raised', dot: 'bg-muted' },
  active: { label: 'Downloading', cls: 'text-azure bg-azure/10', dot: 'bg-azure' },
  paused: { label: 'Paused', cls: 'text-warn bg-warn/10', dot: 'bg-warn' },
  completed: { label: 'Done', cls: 'text-ok bg-ok/10', dot: 'bg-ok' },
  failed: { label: 'Failed', cls: 'text-brand bg-brand/10', dot: 'bg-brand' },
  canceled: { label: 'Canceled', cls: 'text-faint bg-raised', dot: 'bg-faint' }
}

function RowActions({ job }: { job: Job }): React.JSX.Element {
  const askRemove = useApp((s) => s.askRemove)
  const act = (a: Parameters<typeof window.api.jobAction>[0]): void => {
    void window.api.jobAction(a, job.id)
  }
  const Btn = (p: { title: string; onClick: () => void; danger?: boolean; children: React.ReactNode }): React.JSX.Element => (
    <button
      title={p.title}
      onClick={p.onClick}
      className={`rounded-md p-1 ${p.danger ? 'text-muted hover:bg-brand/15 hover:text-brand' : 'text-muted hover:bg-raised hover:text-fg'}`}
    >
      {p.children}
    </button>
  )
  return (
    <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
      {(job.state === 'active' || job.state === 'queued') && (
        <Btn title="Pause" onClick={() => act('pause')}>
          <Pause size={14} />
        </Btn>
      )}
      {job.state === 'paused' && (
        <Btn title="Resume" onClick={() => act('resume')}>
          <Play size={14} />
        </Btn>
      )}
      {(job.state === 'failed' || job.state === 'canceled') && (
        <Btn title="Retry" onClick={() => act('retry')}>
          <RotateCcw size={14} />
        </Btn>
      )}
      {job.state === 'completed' && job.outputFile && (
        <Btn title="Show in folder" onClick={() => void window.api.showInFolder(job.outputFile!)}>
          <FolderOpen size={14} />
        </Btn>
      )}
      {(job.state === 'active' || job.state === 'queued' || job.state === 'paused') && (
        <Btn title="Cancel" danger onClick={() => act('cancel')}>
          <X size={14} />
        </Btn>
      )}
      <Btn title="Remove…" danger onClick={() => askRemove([job.id])}>
        <Trash2 size={14} />
      </Btn>
    </div>
  )
}

function EmptyState(): React.JSX.Element {
  const { openAddDialog, tab } = useApp()
  if (tab !== 'all') {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-faint">
        Nothing here yet.
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <div className="font-display text-[15px] font-semibold text-fg">Queue is empty</div>
      <div className="max-w-xs text-center text-xs leading-5 text-muted">
        Copy a YouTube link anywhere and it's picked up automatically — or press{' '}
        <kbd className="rounded border border-line bg-raised px-1 py-0.5 font-mono text-[10px]">Ctrl+V</kbd>{' '}
        here, or
      </div>
      <button
        onClick={() => openAddDialog()}
        className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hi"
      >
        <Plus size={14} strokeWidth={2.5} /> Add a download
      </button>
    </div>
  )
}

export default function QueueTable(): React.JSX.Element {
  const { jobs, tab, search, speedHistory, selectedIds, toggleSelect, setSelection, clearSelection } =
    useApp()
  const rows = filteredJobs(jobs, tab, search)

  if (rows.length === 0) return <EmptyState />

  const allSelected = rows.length > 0 && rows.every((j) => selectedIds.has(j.id))
  const anySelected = selectedIds.size > 0

  return (
    <div>
      <div className="sticky top-0 z-10 grid grid-cols-[24px_minmax(0,1fr)_150px_104px_96px] lg:grid-cols-[24px_minmax(0,1fr)_90px_170px_100px_64px_110px_110px] items-center gap-x-3 border-b border-line bg-panel px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">
        <input
          type="checkbox"
          title="Select all"
          checked={allSelected}
          onChange={(e) => (e.target.checked ? setSelection(rows.map((j) => j.id)) : clearSelection())}
          className="h-3.5 w-3.5 accent-[var(--t-accent)]"
        />
        <div>Video</div>
        <div className="hidden text-right lg:block">Size</div>
        <div>Progress</div>
        <div className="hidden lg:block">Speed</div>
        <div className="hidden text-right lg:block">ETA</div>
        <div>Status</div>
        <div />
      </div>

      <div className="divide-y divide-line/50">
        {rows.map((job) => {
          const chip = CHIP[job.state]
          const pct = job.state === 'completed' ? 100 : job.progress.pct
          return (
            <div
              key={job.id}
              onDoubleClick={() => job.outputFile && void window.api.showInFolder(job.outputFile)}
              className={`group grid grid-cols-[24px_minmax(0,1fr)_150px_104px_96px] lg:grid-cols-[24px_minmax(0,1fr)_90px_170px_100px_64px_110px_110px] items-center gap-x-3 px-3 py-2 hover:bg-panel ${
                selectedIds.has(job.id) ? 'bg-accent/5' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(job.id)}
                onChange={() => toggleSelect(job.id)}
                className={`h-3.5 w-3.5 accent-[var(--t-accent)] ${
                  anySelected || selectedIds.has(job.id)
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100'
                }`}
              />
              <div className="flex min-w-0 items-center gap-2.5">
                {job.thumbnail ? (
                  <img
                    src={job.thumbnail}
                    alt=""
                    loading="lazy"
                    className="h-9 w-16 shrink-0 rounded object-cover ring-1 ring-line"
                  />
                ) : (
                  <div className="h-9 w-16 shrink-0 rounded bg-raised ring-1 ring-line" />
                )}
                <div className="min-w-0">
                  <div className="truncate text-[13px] text-fg" title={job.title}>
                    {job.title}
                  </div>
                  <div className="truncate text-[11px] text-faint">
                    {job.uploader ?? ''}
                    {job.subsState === 'pending' ? <span> · subs: fetching…</span> : null}
                    {job.subsState === 'failed' ? (
                      <span className="text-warn"> · subs failed (video OK)</span>
                    ) : null}
                    {job.error && job.state !== 'completed' ? (
                      <span className="text-brand"> · {job.error}</span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="hidden text-right font-mono text-[11px] text-muted lg:block">
                {formatBytes(job.progress.totalBytes || job.progress.downloadedBytes)}
              </div>

              <div className="flex items-center gap-2">
                <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-raised">
                  <div
                    className={`h-full rounded-full transition-[width] duration-300 ${
                      job.state === 'completed'
                        ? 'bg-ok'
                        : job.state === 'failed'
                          ? 'bg-brand'
                          : job.state === 'paused'
                            ? 'bg-warn'
                            : 'bg-azure'
                    } ${job.state === 'active' && job.progress.phase === 'processing' ? 'animate-pulse' : ''}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {job.state === 'active' && job.progress.phase ? (
                  <span className="w-20 shrink-0 text-right font-mono text-[10px] text-muted">
                    {job.progress.phase === 'processing'
                      ? 'processing…'
                      : `${job.progress.phase} ${pct.toFixed(0)}%`}
                  </span>
                ) : (
                  <span className="w-20 shrink-0 text-right font-mono text-[11px] text-muted">
                    {pct.toFixed(pct >= 100 ? 0 : 1)}%
                  </span>
                )}
              </div>

              <div className="hidden items-center gap-1.5 lg:flex">
                {job.state === 'active' ? (
                  <>
                    <Sparkline samples={speedHistory[job.id] ?? []} />
                    <span className="font-mono text-[11px] text-fg">
                      {formatSpeed(job.progress.speedBps)}
                    </span>
                  </>
                ) : (
                  <span className="font-mono text-[11px] text-faint">—</span>
                )}
              </div>

              <div className="hidden text-right font-mono text-[11px] text-muted lg:block">
                {job.state === 'active' ? formatEta(job.progress.etaSec) : '—'}
              </div>

              <div>
                <span
                  title={job.error ?? ''}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${chip.cls}`}
                >
                  <span className={`h-1 w-1 rounded-full ${chip.dot}`} />
                  {chip.label}
                  {job.retries > 0 && job.state === 'queued' ? ` ·${job.retries}` : ''}
                </span>
              </div>

              <RowActions job={job} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
