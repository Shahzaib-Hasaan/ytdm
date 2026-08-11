/**
 * One-time heads-up before the first subtitle enable — extra caption requests
 * are what YouTube rate-limits hardest. Returns false if the user backs out.
 */
export function warnSubsOnce(): boolean {
  if (localStorage.getItem('ytdm-subs-warned')) return true
  const ok = window.confirm(
    'Heads up: subtitles need extra requests to YouTube. On big playlists this can ' +
      'temporarily rate-limit (or in rare cases flag) your IP address. The app paces and ' +
      'retries automatically, but heavy use is at your own risk.\n\nEnable subtitles?'
  )
  if (ok) localStorage.setItem('ytdm-subs-warned', '1')
  return ok
}

export function formatBytes(n: number): string {
  if (!n || n <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`
}

export function formatSpeed(bps: number): string {
  if (!bps || bps <= 0) return '—'
  return `${formatBytes(bps)}/s`
}

export function formatEta(sec: number): string {
  if (!sec || sec <= 0) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function formatDuration(sec: number | null): string {
  if (sec === null || sec <= 0) return ''
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? h + ':' : ''}${mm}:${String(s).padStart(2, '0')}`
}
