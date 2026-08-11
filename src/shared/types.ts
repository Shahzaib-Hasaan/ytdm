export type JobState =
  | 'queued'
  | 'active'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'canceled'

export type QualityPreset =
  | 'best-mp4'
  | 'best'
  | '1080p'
  | '720p'
  | 'audio-m4a'
  | 'audio-mp3'

export interface JobProgress {
  pct: number
  downloadedBytes: number
  totalBytes: number
  speedBps: number
  etaSec: number
  /** Which stream is transferring: 'video' | 'audio' | 'processing' (ffmpeg merge/embed) | '' */
  phase: string
}

export interface Job {
  id: string
  url: string
  videoId: string | null
  title: string
  thumbnail: string | null
  durationSec: number | null
  uploader: string | null
  preset: QualityPreset
  writeSubs: boolean
  outputDir: string
  outputFile: string | null
  state: JobState
  progress: JobProgress
  /** Subtitle side-channel: '' none wanted, 'pending', 'done', 'failed' */
  subsState?: string
  error: string | null
  retries: number
  createdAt: number
  completedAt: number | null
}

export interface ProbeEntry {
  id: string
  url: string
  title: string
  durationSec: number | null
}

export interface ProbeResult {
  kind: 'video' | 'playlist'
  id: string
  url: string
  title: string
  thumbnail: string | null
  durationSec: number | null
  uploader: string | null
  filesizeApprox: number | null
  entries?: ProbeEntry[]
}

export interface NewJobInput {
  url: string
  videoId: string | null
  title: string
  thumbnail: string | null
  durationSec: number | null
  uploader: string | null
  filesizeApprox: number | null
  preset: QualityPreset
  /** Playlist name — downloads go into a subfolder with this name */
  playlistTitle: string | null
  /** Per-download subtitle override; falls back to the global setting */
  writeSubs?: boolean
}

export interface Settings {
  downloadDir: string
  maxConcurrent: number
  /** 0 = unlimited, otherwise KiB/s shared across active jobs */
  speedLimitKbps: number
  clipboardWatch: boolean
  concurrentFragments: number
  embedThumbnail: boolean
  embedMetadata: boolean
  embedSubs: boolean
  /** Save subtitle files (.srt/.vtt) next to the video */
  writeSubs: boolean
  /** yt-dlp --sub-langs selector, e.g. "en", "en.*,ur", "all" */
  subLangs: string
  /** Send Firefox's YouTube cookies with requests — fewer rate limits, unlocks age-restricted */
  useFirefoxCookies: boolean
  /** Closing the window hides to the system tray instead of quitting */
  closeToTray: boolean
}

export interface UpdateStatus {
  state: 'idle' | 'available' | 'downloading' | 'ready' | 'error'
  version: string | null
}

export interface EngineStatus {
  binReady: boolean
  downloadingBins: boolean
  binMessage: string
  ytdlpVersion: string | null
  ffmpegFound: boolean
  denoFound: boolean
}

export type JobAction = 'pause' | 'resume' | 'cancel' | 'remove' | 'retry'
