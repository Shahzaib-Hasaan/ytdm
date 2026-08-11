import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import type { Job, ProbeResult, QualityPreset, Settings } from '../../shared/types'
import { execCapture, ytdlpPath } from './binaries'

interface PresetSpec {
  format?: string
  mergeContainer?: 'mp4' | 'mkv'
  audioFormat?: 'm4a' | 'mp3'
}

const PRESETS: Record<QualityPreset, PresetSpec> = {
  'best-mp4': {
    format: 'bv*[vcodec^=avc1]+ba[ext=m4a]/b[ext=mp4]/b',
    mergeContainer: 'mp4'
  },
  best: { format: 'bv*+ba/b', mergeContainer: 'mkv' },
  '1080p': { format: 'bv*[height<=1080]+ba/b[height<=1080]/b', mergeContainer: 'mkv' },
  '720p': { format: 'bv*[height<=720]+ba/b[height<=720]/b', mergeContainer: 'mkv' },
  'audio-m4a': { audioFormat: 'm4a' },
  'audio-mp3': { audioFormat: 'mp3' }
}

export async function probe(url: string): Promise<ProbeResult> {
  const { code, out, err } = await execCapture(
    ytdlpPath(),
    ['-J', '--flat-playlist', '--no-warnings', url],
    60_000
  )
  if (code !== 0) throw new Error(classifyError(err) ?? `probe failed: ${lastLine(err)}`)
  const info = JSON.parse(out)
  if (info._type === 'playlist') {
    const entries = ((info.entries ?? []) as Record<string, unknown>[])
      .filter((e) => e && e.id)
      .map((e) => ({
        id: String(e.id),
        url: (e.url as string) ?? `https://www.youtube.com/watch?v=${e.id}`,
        title: (e.title as string) ?? String(e.id),
        durationSec: (e.duration as number) ?? null
      }))
    return {
      kind: 'playlist',
      id: String(info.id ?? ''),
      url,
      title: info.title ?? 'Playlist',
      thumbnail: firstThumb(info),
      durationSec: null,
      uploader: info.uploader ?? info.channel ?? null,
      filesizeApprox: null,
      entries
    }
  }
  return {
    kind: 'video',
    id: String(info.id ?? ''),
    url: info.webpage_url ?? url,
    title: info.title ?? url,
    thumbnail: firstThumb(info),
    durationSec: info.duration ?? null,
    uploader: info.uploader ?? info.channel ?? null,
    filesizeApprox: info.filesize_approx ?? null
  }
}

function firstThumb(info: Record<string, unknown>): string | null {
  if (typeof info.thumbnail === 'string') return info.thumbnail
  const list = info.thumbnails as { url?: string }[] | undefined
  return list?.length ? (list[list.length - 1].url ?? null) : null
}

function lastLine(s: string): string {
  const lines = s.trim().split(/\r?\n/).filter(Boolean)
  return lines[lines.length - 1] ?? 'unknown error'
}

/**
 * Split errors into "extractor broken — update yt-dlp and retry" vs genuine
 * per-video failures the user must see. Survival-critical distinction.
 */
export function classifyError(stderr: string): string | null {
  if (/429|Too Many Requests/i.test(stderr)) {
    return 'YouTube rate limit (429) — retrying with a longer pause'
  }
  if (/nsig|n function|signature|SABR|player[- ]?response|Unable to extract/i.test(stderr)) {
    return 'YouTube changed something — updating downloader core, will retry'
  }
  if (/Private video|Video unavailable|members-only|Sign in to confirm your age/i.test(stderr)) {
    return lastLine(stderr)
  }
  if (/HTTP Error 403/.test(stderr)) return 'Access denied by YouTube (403) — will retry'
  return null
}

export interface DownloadHandle {
  kill(): void
}

/**
 * Fetch subtitles only, for a video that already downloaded. Cheap request,
 * runs in the engine's throttled subtitle queue so batches can't 429-storm.
 * Resolves true when subs landed, false when the video simply has none.
 */
export async function fetchSubs(job: Job, settings: Settings): Promise<boolean> {
  const args = [
    job.url,
    '--no-playlist',
    '--skip-download',
    '--write-subs',
    '--write-auto-subs',
    '--convert-subs', 'srt',
    '--sub-langs', settings.subLangs || 'en',
    '--sleep-requests', '1',
    '--sleep-subtitles', '3',
    '--no-warnings',
    '-o', path.join(job.outputDir, '%(title)s [%(id)s].%(ext)s')
  ]
  if (settings.useFirefoxCookies) args.push('--cookies-from-browser', 'firefox')
  const { code, err } = await new Promise<{ code: number | null; err: string }>((resolve) => {
    const child = spawn(ytdlpPath(), args, {
      windowsHide: true,
      env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' }
    })
    let stderr = ''
    child.stderr?.on('data', (d: Buffer) => (stderr = (stderr + d.toString()).slice(-4000)))
    child.on('error', (e) => resolve({ code: null, err: String(e) }))
    child.on('close', (c) => resolve({ code: c, err: stderr }))
  })
  if (code === 0) return true
  throw new Error(classifyError(err) ?? err.trim().split(/\r?\n/).pop() ?? 'subtitle fetch failed')
}

export interface DownloadCallbacks {
  onProgress(p: {
    pct: number
    downloadedBytes: number
    totalBytes: number
    speedBps: number
    etaSec: number
    phase: string
  }): void
  onOutputFile(file: string): void
  onDone(): void
  onError(message: string, retryable: boolean): void
}

export function startDownload(
  job: Job,
  settings: Settings,
  ffmpegLocation: string | null,
  perJobLimitKbps: number,
  cb: DownloadCallbacks
): DownloadHandle {
  const spec = PRESETS[job.preset]
  const args: string[] = [
    job.url,
    '--no-playlist',
    '--newline',
    // --print implies --quiet, which silences ALL progress output; --progress
    // force-restores it. Both flags are load-bearing — remove either and the
    // UI goes blind.
    '--progress',
    // First "download:" is yt-dlp's template-type selector (consumed); the second
    // is a literal prefix so our stdout parser can tell progress JSON from other lines.
    '--progress-template', 'download:download:%(progress)j',
    '--print', 'after_move:ytdm-out:%(filepath)s',
    '--no-simulate',
    '--continue',
    '--no-warnings',
    // Pace metadata/subtitle requests — playlist batches trip YouTube's 429
    // rate limit fast, and a failed subtitle request kills the whole download.
    '--sleep-requests', '0.75',
    '--sleep-subtitles', '3',
    '-N', String(settings.concurrentFragments || 4),
    '-o', path.join(job.outputDir, '%(title)s [%(id)s].%(ext)s')
  ]
  if (spec.format) args.push('-f', spec.format)
  if (spec.mergeContainer) args.push('--merge-output-format', spec.mergeContainer)
  if (spec.audioFormat) args.push('-x', '--audio-format', spec.audioFormat, '--audio-quality', '0')
  if (settings.embedMetadata) args.push('--embed-metadata')
  if (settings.embedThumbnail) args.push('--embed-thumbnail')
  // Subtitles are deliberately NOT fetched here — a subtitle 429 aborts the
  // whole yt-dlp run. They're fetched by a separate throttled pass after the
  // video lands (see fetchSubs). --embed-subs is the exception: it needs the
  // subs at mux time, so it stays in-line and rides on cookies/pacing.
  if (settings.embedSubs) {
    args.push('--embed-subs', '--sub-langs', settings.subLangs || 'en')
  }
  if (settings.useFirefoxCookies) args.push('--cookies-from-browser', 'firefox')
  if (ffmpegLocation) args.push('--ffmpeg-location', ffmpegLocation)
  if (perJobLimitKbps > 0) args.push('--limit-rate', `${perJobLimitKbps}K`)

  console.log(`[ytdlp] spawn job=${job.id.slice(0, 8)} args: ${args.join(' ')}`)
  const child: ChildProcess = spawn(ytdlpPath(), args, {
    windowsHide: true,
    // PYTHONUNBUFFERED: line-flushed stdout — block buffering on a pipe would
    // batch progress into multi-second bursts. PYTHONIOENCODING: without it,
    // Windows console encoding mangles non-ASCII titles (e.g. "→") in printed
    // filepaths, so the stored outputFile never matches the file on disk.
    env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' }
  })
  let stderrTail = ''
  let killed = false
  // YouTube >360p means two separate transfers (DASH video, then audio) plus an
  // ffmpeg merge. Track which stream we're in so the UI can say so instead of
  // looking like the download restarted at a smaller size.
  const isAudioOnly = Boolean(spec.audioFormat)
  let finishedStreams = 0
  // Cumulative accounting across the separate video + audio transfers, so the
  // user sees ONE honest number that only grows — not a "22 MB" video that
  // mysteriously becomes bigger when the audio lands.
  let prevStreamsBytes = 0
  const seedTotal = job.progress.totalBytes || 0 // probe's whole-file estimate

  const handleLine = (line: string): void => {
    if (line.startsWith('download:')) {
      try {
        const p = JSON.parse(line.slice('download:'.length))
        const streamTotal = p.total_bytes ?? p.total_bytes_estimate ?? 0
        const streamDownloaded = p.downloaded_bytes ?? 0
        const grandTotal = Math.max(seedTotal, prevStreamsBytes + streamTotal)
        const grandDownloaded = prevStreamsBytes + streamDownloaded
        if (p.status === 'finished') {
          finishedStreams++
          prevStreamsBytes += streamTotal || streamDownloaded
          // ffmpeg merge/embed work follows the final stream.
          cb.onProgress({
            pct: Math.min(100, grandTotal > 0 ? (grandDownloaded / grandTotal) * 100 : 100),
            downloadedBytes: grandDownloaded,
            totalBytes: grandTotal,
            speedBps: 0,
            etaSec: 0,
            phase: 'processing'
          })
          return
        }
        const phase = isAudioOnly || finishedStreams > 0 ? 'audio' : 'video'
        cb.onProgress({
          pct: grandTotal > 0 ? Math.min(100, (grandDownloaded / grandTotal) * 100) : 0,
          downloadedBytes: grandDownloaded,
          totalBytes: grandTotal,
          speedBps: p.speed ?? 0,
          etaSec: p.eta ?? 0,
          phase
        })
      } catch {
        /* partial/garbled progress line — ignore */
      }
    } else if (line.startsWith('ytdm-out:')) {
      cb.onOutputFile(line.slice('ytdm-out:'.length))
    }
  }

  // Progress normally arrives on stdout, but parse both streams — where yt-dlp
  // sends progress has shifted between quiet-mode combinations before.
  const lineSplitter = (): ((chunk: Buffer) => void) => {
    let buf = ''
    return (chunk: Buffer): void => {
      buf += chunk.toString()
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (line) handleLine(line)
      }
    }
  }
  child.stdout?.on('data', lineSplitter())
  const stderrLines = lineSplitter()
  child.stderr?.on('data', (chunk: Buffer) => {
    // Raw capture for error reporting — a final ERROR line often has no trailing
    // newline and would be lost by line-splitting alone.
    stderrTail = (stderrTail + chunk.toString()).slice(-8000)
    stderrLines(chunk)
  })
  child.on('error', (e) => {
    if (!killed) cb.onError(String(e), false)
  })
  child.on('close', (code) => {
    console.log(
      `[ytdlp] exit job=${job.id.slice(0, 8)} code=${code} stderrTail=${stderrTail.slice(-400)}`
    )
    if (killed) return
    if (code === 0) {
      cb.onDone()
    } else {
      const classified = classifyError(stderrTail)
      const retryable = classified !== null && !/Private|unavailable|members-only|age/i.test(classified)
      cb.onError(classified ?? lastLine(stderrTail), retryable)
    }
  })

  return {
    kill(): void {
      killed = true
      if (child.pid) {
        // yt-dlp spawns ffmpeg children; kill the whole tree on Windows.
        spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true })
      }
    }
  }
}
