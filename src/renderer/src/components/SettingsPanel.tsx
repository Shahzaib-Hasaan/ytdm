import { useEffect, useState } from 'react'
import type { Settings } from '../../../shared/types'
import { useApp } from '../store'
import { warnSubsOnce } from '../util'

function Row(props: { label: string; hint?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <div>
        <div className="text-xs text-fg">{props.label}</div>
        {props.hint ? <div className="text-[10px] text-faint">{props.hint}</div> : null}
      </div>
      {props.children}
    </div>
  )
}

const selectCls =
  'rounded-md border border-line bg-ink px-2 py-1 text-xs text-fg outline-none focus:border-azure'

export default function SettingsPanel(props: { onClose: () => void }): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(useApp.getState().settings)

  useEffect(() => {
    if (!settings) void window.api.getSettings().then(setSettings)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') props.onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!settings) return <></>

  const update = (patch: Partial<Settings>): void => {
    const next = { ...settings, ...patch }
    setSettings(next)
    void window.api.setSettings(patch).then((s) => useApp.setState({ settings: s }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={props.onClose}>
      <div
        className="flex max-h-full w-[480px] max-w-full flex-col rounded-xl border border-line bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-line px-4 py-3 font-display text-[14px] font-semibold text-fg">
          Settings
        </div>

        <div className="min-h-0 flex-1 divide-y divide-line/50 overflow-y-auto py-1">
          <Row label="Download folder">
            <div className="flex min-w-0 items-center gap-2">
              <div className="max-w-52 truncate rounded-md border border-line bg-ink px-2 py-1 text-[11px] text-muted">
                {settings.downloadDir}
              </div>
              <button
                onClick={() => void window.api.chooseDir().then((dir) => dir && update({ downloadDir: dir }))}
                className="rounded-md border border-line px-2.5 py-1 text-xs text-muted hover:bg-raised hover:text-fg"
              >
                Browse
              </button>
            </div>
          </Row>

          <Row label="Parallel downloads" hint="2–3 is safe; more risks YouTube rate limits">
            <select
              value={settings.maxConcurrent}
              onChange={(e) => update({ maxConcurrent: Number(e.target.value) })}
              className={selectCls}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Row>

          <Row label="Global speed limit" hint="KB/s, shared across downloads · 0 = unlimited">
            <input
              type="number"
              min={0}
              value={settings.speedLimitKbps}
              onChange={(e) => update({ speedLimitKbps: Math.max(0, Number(e.target.value) || 0) })}
              className="w-24 rounded-md border border-line bg-ink px-2 py-1 text-right font-mono text-xs text-fg outline-none focus:border-azure"
            />
          </Row>

          <Row label="Connections per download" hint="parallel fragments — the speed boost">
            <select
              value={settings.concurrentFragments}
              onChange={(e) => update({ concurrentFragments: Number(e.target.value) })}
              className={selectCls}
            >
              {[1, 2, 4, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Row>

          {(
            [
              ['clipboardWatch', 'Watch clipboard', 'copied YouTube links open the add dialog'],
              ['embedThumbnail', 'Embed thumbnail', 'cover art inside the file'],
              ['embedMetadata', 'Embed metadata', 'title, channel, date'],
              ['embedSubs', 'Embed subtitles', 'burned into the file container'],
              ['writeSubs', 'Save subtitle files', '.srt fetched after the video, rate-limit safe'],
              [
                'useFirefoxCookies',
                'Use Firefox cookies',
                'fewer rate limits, unlocks age-restricted · small account-flag risk'
              ]
            ] as [keyof Settings, string, string][]
          ).map(([key, label, hint]) => (
            <Row key={key} label={label} hint={hint}>
              <input
                type="checkbox"
                checked={Boolean(settings[key])}
                onChange={(e) => {
                  const on = e.target.checked
                  if (on && (key === 'writeSubs' || key === 'embedSubs') && !warnSubsOnce()) return
                  update({ [key]: on } as Partial<Settings>)
                }}
                className="h-4 w-4 accent-[var(--t-accent)]"
              />
            </Row>
          ))}

          {settings.embedSubs || settings.writeSubs ? (
            <Row label="Subtitle languages" hint={'e.g. "en" · "en,ur" · "all" — auto-captions included'}>
              <input
                value={settings.subLangs}
                onChange={(e) => update({ subLangs: e.target.value })}
                className="w-32 rounded-md border border-line bg-ink px-2 py-1 font-mono text-xs text-fg outline-none focus:border-accent"
              />
            </Row>
          ) : null}
        </div>

        <div className="flex shrink-0 justify-end border-t border-line px-4 py-3">
          <button
            onClick={props.onClose}
            className="rounded-md bg-raised px-4 py-1.5 text-xs font-semibold text-fg hover:bg-line"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
