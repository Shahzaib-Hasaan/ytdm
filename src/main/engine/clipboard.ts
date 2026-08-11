import { clipboard } from 'electron'

const YT_URL_RE =
  /https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?[^\s]*v=[\w-]{11}[^\s]*|shorts\/[\w-]{11}[^\s]*|playlist\?[^\s]*list=[\w-]+[^\s]*)|youtu\.be\/[\w-]{11}[^\s]*)/

/**
 * Windows has no clipboard-change event; polling is the standard pattern
 * (IDM does the same). 750ms keeps CPU cost negligible.
 */
export function startClipboardWatcher(
  isEnabled: () => boolean,
  onUrl: (url: string) => void
): () => void {
  let lastText = clipboard.readText()
  const seen = new Set<string>()
  const timer = setInterval(() => {
    if (!isEnabled()) return
    let text: string
    try {
      text = clipboard.readText()
    } catch {
      return
    }
    if (text === lastText) return
    lastText = text
    const match = text.match(YT_URL_RE)
    if (!match) return
    const url = match[0]
    if (seen.has(url)) return
    seen.add(url)
    if (seen.size > 50) seen.delete(seen.values().next().value as string)
    onUrl(url)
  }, 750)
  return () => clearInterval(timer)
}
