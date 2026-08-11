import { useEffect, useRef, useState } from 'react'
import { ClipboardPaste, Loader2 } from 'lucide-react'
import type { NewJobInput, ProbeResult, QualityPreset } from '../../../shared/types'
import { useApp } from '../store'
import { formatBytes, formatDuration, warnSubsOnce } from '../util'

const PRESETS: { value: QualityPreset; label: string; hint: string }[] = [
  { value: 'best-mp4', label: 'Best MP4', hint: 'plays everywhere' },
  { value: 'best', label: 'Best quality', hint: 'any codec, MKV' },
  { value: '1080p', label: '1080p', hint: 'full HD cap' },
  { value: '720p', label: '720p', hint: 'smaller file' },
  { value: 'audio-m4a', label: 'Audio · M4A', hint: 'original audio' },
  { value: 'audio-mp3', label: 'Audio · MP3', hint: 'max compatibility' }
]

export default function AddDialog(): React.JSX.Element {
  const { prefillUrl, closeAddDialog } = useApp()
  const [url, setUrl] = useState(prefillUrl)
  const [probing, setProbing] = useState(false)
  const [probeError, setProbeError] = useState<string | null>(null)
  const [result, setResult] = useState<ProbeResult | null>(null)
  const [preset, setPreset] = useState<QualityPreset>('best-mp4')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [subs, setSubs] = useState<boolean>(useApp.getState().settings?.writeSubs ?? false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    if (prefillUrl) void runProbe(prefillUrl)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeAddDialog()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function runProbe(u: string): Promise<void> {
    if (!u.trim()) return
    setProbing(true)
    setProbeError(null)
    setResult(null)
    try {
      const r = await window.api.probe(u.trim())
      setResult(r)
      if (r.kind === 'playlist' && r.entries) setSelected(new Set(r.entries.map((e) => e.id)))
    } catch (e) {
      setProbeError(
        (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
      )
    } finally {
      setProbing(false)
    }
  }

  async function pasteFromClipboard(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setUrl(text)
        void runProbe(text)
      }
    } catch {
      /* clipboard permission denied — user can Ctrl+V into the field */
    }
  }

  async function download(): Promise<void> {
    if (!result || submitting) return
    setSubmitting(true)
    let inputs: NewJobInput[]
    if (result.kind === 'video') {
      inputs = [
        {
          url: result.url,
          videoId: result.id || null,
          title: result.title,
          thumbnail: result.thumbnail,
          durationSec: result.durationSec,
          uploader: result.uploader,
          filesizeApprox: result.filesizeApprox,
          preset,
          playlistTitle: null,
          writeSubs: subs
        }
      ]
    } else {
      inputs = (result.entries ?? [])
        .filter((e) => selected.has(e.id))
        .map((e) => ({
          url: e.url,
          videoId: e.id,
          title: e.title,
          thumbnail: null,
          durationSec: e.durationSec,
          uploader: result.uploader,
          filesizeApprox: null,
          preset,
          playlistTitle: result.title,
          writeSubs: subs
        }))
    }
    if (inputs.length === 0) return
    await window.api.addJobs(inputs)
    closeAddDialog()
  }

  const entries = result?.kind === 'playlist' ? (result.entries ?? []) : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={closeAddDialog}>
      <div
        className="flex max-h-full w-[600px] max-w-full flex-col rounded-xl border border-line bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-line px-4 py-3 font-display text-[14px] font-semibold text-fg">
          Add download
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void runProbe(url)}
              placeholder="youtube.com/watch?v=…  ·  playlist links work too"
              className="flex-1 rounded-md border border-line bg-ink px-3 py-2 text-[13px] text-fg placeholder-faint outline-none focus:border-azure"
            />
            <button
              title="Paste from clipboard"
              onClick={() => void pasteFromClipboard()}
              className="rounded-md border border-line px-2.5 text-muted hover:bg-raised hover:text-fg"
            >
              <ClipboardPaste size={15} />
            </button>
            <button
              onClick={() => void runProbe(url)}
              disabled={probing || !url.trim()}
              className="flex w-20 items-center justify-center rounded-md bg-raised px-3 py-2 text-xs font-semibold text-fg hover:bg-line disabled:opacity-40"
            >
              {probing ? <Loader2 size={14} className="animate-spin" /> : 'Check'}
            </button>
          </div>

          {probeError ? (
            <div className="rounded-md border border-brand/30 bg-brand/10 px-3 py-2 text-xs text-brand">
              {probeError}
            </div>
          ) : null}

          {result ? (
            result.kind === 'video' ? (
              <div className="flex gap-3 rounded-lg border border-line bg-ink p-3" data-kind="video-preview">
                {result.thumbnail ? (
                  <img src={result.thumbnail} alt="" className="h-[68px] w-[120px] rounded-md object-cover ring-1 ring-line" />
                ) : null}
                <div className="min-w-0 self-center">
                  <div className="line-clamp-2 text-[13px] font-medium leading-5 text-fg">
                    {result.title}
                  </div>
                  <div className="mt-1 text-[11px] text-muted">
                    {result.uploader ?? ''}
                    {result.durationSec ? ` · ${formatDuration(result.durationSec)}` : ''}
                    {result.filesizeApprox ? ` · ~${formatBytes(result.filesizeApprox)}` : ''}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-line bg-ink">
                <div className="flex items-center justify-between border-b border-line px-3 py-2">
                  <div className="min-w-0 truncate text-xs font-medium text-fg">
                    {result.title}
                    <span className="ml-1.5 font-mono text-[11px] text-faint">
                      {selected.size}/{entries.length}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-3 text-[11px]">
                    <button className="text-azure hover:underline" onClick={() => setSelected(new Set(entries.map((e) => e.id)))}>
                      Select all
                    </button>
                    <button className="text-azure hover:underline" onClick={() => setSelected(new Set())}>
                      None
                    </button>
                  </div>
                </div>
                <div className="max-h-48 overflow-auto">
                  {entries.map((e, i) => (
                    <label
                      key={e.id}
                      className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-panel"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(e.id)}
                        onChange={(ev) => {
                          const next = new Set(selected)
                          if (ev.target.checked) next.add(e.id)
                          else next.delete(e.id)
                          setSelected(next)
                        }}
                        className="accent-[var(--t-accent)]"
                      />
                      <span className="w-6 shrink-0 text-right font-mono text-[10px] text-faint">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-fg" title={e.title}>
                        {e.title}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-faint">
                        {formatDuration(e.durationSec)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )
          ) : null}

          <div className="flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-fg">
              <input
                type="checkbox"
                checked={subs}
                onChange={(e) => {
                  const on = e.target.checked
                  if (on && !warnSubsOnce()) return
                  setSubs(on)
                }}
                className="accent-[var(--t-accent)]"
              />
              Download subtitles (.srt)
            </label>
            {result?.kind === 'playlist' ? (
              <span className="text-[11px] text-faint">
                Saves into folder “{result.title.slice(0, 40)}”
              </span>
            ) : null}
          </div>

          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">
              Quality
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPreset(p.value)}
                  className={`rounded-md border px-2.5 py-1.5 text-left ${
                    preset === p.value
                      ? 'border-accent/60 bg-accent/10'
                      : 'border-line bg-ink hover:border-faint'
                  }`}
                >
                  <div className={`text-xs font-medium ${preset === p.value ? 'text-fg' : 'text-muted'}`}>
                    {p.label}
                  </div>
                  <div className="text-[10px] text-faint">{p.hint}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-line px-4 py-3">
          <button
            onClick={closeAddDialog}
            className="rounded-md border border-line px-3.5 py-1.5 text-xs font-medium text-muted hover:bg-raised hover:text-fg"
          >
            Cancel
          </button>
          <button
            onClick={() => void download()}
            disabled={!result || submitting || (result.kind === 'playlist' && selected.size === 0)}
            className="rounded-md bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent-hi disabled:opacity-40"
          >
            {result?.kind === 'playlist' ? `Download ${selected.size} videos` : 'Download'}
          </button>
        </div>
      </div>
    </div>
  )
}
