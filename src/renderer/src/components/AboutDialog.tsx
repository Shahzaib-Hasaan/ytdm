import { useEffect, useState } from 'react'
import { ExternalLink, Mail } from 'lucide-react'

const CONTACT_EMAIL = 'adilwaqas255@gmail.com'
// Set once the GitHub repo is public — button hides while empty.
const GITHUB_URL = ''

export default function AboutDialog(props: { onClose: () => void }): React.JSX.Element {
  const [info, setInfo] = useState<{ version: string; ytdlpVersion: string | null } | null>(null)

  useEffect(() => {
    void window.api.appInfo().then(setInfo)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') props.onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={props.onClose}>
      <div
        className="flex max-h-full w-[400px] max-w-full flex-col rounded-xl border border-line bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center gap-2 px-6 pb-4 pt-6">
          <svg width="56" height="56" viewBox="0 0 256 256" aria-hidden>
            <rect width="256" height="256" rx="56" fill="#12151A" />
            <path
              d="M110 54 h36 a8 8 0 0 1 8 8 v58 h28 a8 8 0 0 1 6 13.3 l-54 62 a8 8 0 0 1 -12.2 0 l-54 -62 a8 8 0 0 1 6 -13.3 h28 v-58 a8 8 0 0 1 8 -8 z"
              fill="#E5484D"
            />
            <rect x="58" y="204" width="140" height="18" rx="9" fill="#E8ECF1" />
          </svg>
          <div className="font-display text-[18px] font-semibold tracking-tight">
            <span className="text-brand">YT</span>
            <span className="text-fg">DM</span>
          </div>
          <div className="text-center text-xs text-muted">
            Download manager for YouTube — queue, playlists, subtitles.
          </div>
          <div className="font-mono text-[11px] text-faint">
            v{info?.version ?? '…'}
            {info?.ytdlpVersion ? ` · engine ${info.ytdlpVersion}` : ''}
          </div>
        </div>

        <div className="space-y-2 border-t border-line px-6 py-4 text-xs">
          <div className="text-muted">
            Built by <span className="font-medium text-fg">Adil Waqas</span>. Something broken,
            or an idea? Reach out — feedback shapes what gets built next.
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => void window.api.openUrl(`mailto:${CONTACT_EMAIL}`)}
              className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-medium text-fg hover:bg-raised"
            >
              <Mail size={13} /> {CONTACT_EMAIL}
            </button>
            {GITHUB_URL ? (
              <button
                onClick={() => void window.api.openUrl(GITHUB_URL)}
                className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-medium text-fg hover:bg-raised"
              >
                <ExternalLink size={13} /> GitHub
              </button>
            ) : null}
          </div>
        </div>

        <div className="border-t border-line px-6 py-3 text-[10px] leading-4 text-faint">
          Download only content you have the right to save. Downloading may violate YouTube's
          Terms of Service; you are responsible for how you use this tool.
        </div>
      </div>
    </div>
  )
}
