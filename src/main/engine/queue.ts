import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { app, shell } from 'electron'
import type { Job, JobAction, NewJobInput, Settings } from '../../shared/types'
import type { JobStore } from './db'
import { fetchSubs, startDownload, type DownloadHandle } from './ytdlp'
import type { BinaryManager } from './binaries'

/** Windows-safe folder name from a playlist title. */
function sanitizeFolder(name: string): string {
  return name
    .replace(/[<>:"\/\|?*]/g, '-')
    .replace(/\.+$/, '')
    .trim()
    .slice(0, 120)
}

const DEFAULT_SETTINGS = (): Settings => ({
  downloadDir: app.getPath('downloads'),
  maxConcurrent: 2, // conservative: rapid parallel extraction trips YouTube bot checks
  speedLimitKbps: 0,
  clipboardWatch: true,
  concurrentFragments: 4,
  embedThumbnail: true,
  embedMetadata: true,
  embedSubs: false,
  writeSubs: false,
  subLangs: 'en',
  useFirefoxCookies: false,
  closeToTray: true
})

export class Engine extends EventEmitter {
  private jobs = new Map<string, Job>()
  private handles = new Map<string, DownloadHandle>()
  private retryTimers = new Map<string, NodeJS.Timeout>()
  private store: JobStore
  private bins: BinaryManager
  settings: Settings

  constructor(store: JobStore, bins: BinaryManager) {
    super()
    this.store = store
    this.bins = bins
    this.settings = { ...DEFAULT_SETTINGS(), ...JSON.parse(store.getKv('settings') ?? '{}') }
    for (const job of store.getJobs()) {
      // Crash recovery: anything mid-flight when we died goes back in the queue.
      if (job.state === 'active') job.state = 'queued'
      if (job.uploader === undefined) job.uploader = null // rows from older schema
      if (!job.thumbnail && job.videoId) {
        job.thumbnail = `https://i.ytimg.com/vi/${job.videoId}/mqdefault.jpg`
      }
      this.jobs.set(job.id, job)
      store.upsertJob(job)
      // Backfill file path + size for completed rows from before path capture
      // and size reporting were reliable.
      if (job.state === 'completed' && (!job.outputFile || job.progress.totalBytes === 0)) {
        void this.backfillOutput(job)
      }
      // Resume interrupted subtitle side-fetches.
      if (job.subsState === 'pending') this.enqueueSubs(job.id)
    }
  }

  // --- Subtitle side-queue -------------------------------------------------
  // Subtitles are fetched AFTER the video, one at a time with spacing, so a
  // playlist batch can't 429-storm YouTube's caption endpoint — and when it
  // still does, only the subtitle retries wait, never the videos.
  private subsQueue: string[] = []
  private subsBusy = false
  private subsRetries = new Map<string, number>()

  private enqueueSubs(id: string): void {
    if (!this.subsQueue.includes(id)) this.subsQueue.push(id)
    this.processSubs()
  }

  private processSubs(): void {
    if (this.subsBusy) return
    const id = this.subsQueue.shift()
    if (!id) return
    const job = this.jobs.get(id)
    if (!job) {
      this.processSubs()
      return
    }
    this.subsBusy = true
    fetchSubs(job, this.settings)
      .then(() => {
        this.subsRetries.delete(id)
        this.patch(job, { subsState: 'done' })
      })
      .catch((e: Error) => {
        const tries = (this.subsRetries.get(id) ?? 0) + 1
        this.subsRetries.set(id, tries)
        if (/429|rate limit/i.test(e.message) && tries <= 4) {
          // Re-queue with an escalating cool-down; captions endpoint recovers.
          setTimeout(() => this.enqueueSubs(id), 60_000 * 2 ** (tries - 1))
        } else {
          this.subsRetries.delete(id)
          this.patch(job, { subsState: 'failed' })
        }
      })
      .finally(() => {
        // Fixed spacing between subtitle requests regardless of outcome.
        setTimeout(() => {
          this.subsBusy = false
          this.processSubs()
        }, 5000)
      })
  }

  /** Find the job's file on disk by its [videoId] filename tag, then stat it. */
  private async backfillOutput(job: Job): Promise<void> {
    try {
      if (!job.outputFile) {
        if (!job.videoId) return
        const media = ['.mp4', '.mkv', '.webm', '.m4a', '.mp3', '.opus']
        const names = await fs.readdir(job.outputDir)
        const match = names.find(
          (n) => n.includes(`[${job.videoId}]`) && media.includes(path.extname(n).toLowerCase())
        )
        if (!match) return
        job.outputFile = path.join(job.outputDir, match)
      }
      await this.statIntoProgress(job)
    } catch {
      /* folder gone — nothing to backfill */
    }
  }

  private async statIntoProgress(job: Job): Promise<void> {
    try {
      const st = await fs.stat(job.outputFile!)
      job.progress = { ...job.progress, pct: 100, downloadedBytes: st.size, totalBytes: st.size }
      this.store.upsertJob(job)
      this.emitChanged()
    } catch (e) {
      console.log(`[queue] stat failed for "${job.outputFile}": ${(e as Error).message}`)
    }
  }

  list(): Job[] {
    return [...this.jobs.values()].sort((a, b) => a.createdAt - b.createdAt)
  }

  updateSettings(patch: Partial<Settings>): Settings {
    this.settings = { ...this.settings, ...patch }
    this.store.setKv('settings', JSON.stringify(this.settings))
    this.tick()
    return this.settings
  }

  add(inputs: NewJobInput[]): Job[] {
    console.log(`[queue] add called with ${inputs.length} input(s)`)
    const added: Job[] = []
    for (const input of inputs) {
      // Dedup: skip if a live job for the same video+preset already exists.
      const dup = [...this.jobs.values()].some(
        (j) =>
          j.videoId !== null &&
          j.videoId === input.videoId &&
          j.preset === input.preset &&
          j.state !== 'failed' &&
          j.state !== 'canceled'
      )
      if (dup) continue
      const job: Job = {
        id: randomUUID(),
        url: input.url,
        videoId: input.videoId,
        title: input.title,
        // Flat playlist probes carry no thumbnail — derive from the video id.
        thumbnail:
          input.thumbnail ??
          (input.videoId ? `https://i.ytimg.com/vi/${input.videoId}/mqdefault.jpg` : null),
        durationSec: input.durationSec,
        uploader: input.uploader,
        preset: input.preset,
        writeSubs: input.writeSubs ?? this.settings.writeSubs,
        // Playlists land in their own subfolder — no clutter in Downloads.
        outputDir: input.playlistTitle
          ? path.join(this.settings.downloadDir, sanitizeFolder(input.playlistTitle))
          : this.settings.downloadDir,
        outputFile: null,
        state: 'queued',
        // Seed size with the probe's estimate so the row shows one immediately.
        progress: {
          pct: 0,
          downloadedBytes: 0,
          totalBytes: input.filesizeApprox ?? 0,
          speedBps: 0,
          etaSec: 0,
          phase: ''
        },
        error: null,
        retries: 0,
        createdAt: Date.now(),
        completedAt: null
      }
      this.jobs.set(job.id, job)
      this.store.upsertJob(job)
      added.push(job)
    }
    this.tick()
    this.emitChanged()
    return added
  }

  action(action: JobAction, id: string): void {
    const job = this.jobs.get(id)
    if (!job) return
    switch (action) {
      case 'pause':
        if (job.state === 'active') {
          this.handles.get(id)?.kill()
          this.handles.delete(id)
          this.patch(job, { state: 'paused' })
        } else if (job.state === 'queued') {
          this.patch(job, { state: 'paused' })
        }
        break
      case 'resume':
        if (job.state === 'paused' || job.state === 'failed') {
          // yt-dlp --continue picks the .part file back up.
          this.patch(job, { state: 'queued', error: null })
        }
        break
      case 'retry':
        if (job.state === 'failed' || job.state === 'canceled') {
          this.patch(job, { state: 'queued', error: null, retries: 0 })
        }
        break
      case 'cancel':
        this.handles.get(id)?.kill()
        this.handles.delete(id)
        this.clearRetry(id)
        this.patch(job, { state: 'canceled' })
        break
      case 'remove':
        this.remove(id, false)
        break
    }
    this.tick()
  }

  pauseAll(): void {
    for (const j of this.jobs.values()) {
      if (j.state === 'active' || j.state === 'queued') this.action('pause', j.id)
    }
  }

  resumeAll(): void {
    for (const j of this.jobs.values()) {
      if (j.state === 'paused') this.action('resume', j.id)
    }
  }

  remove(id: string, deleteFile: boolean): void {
    const job = this.jobs.get(id)
    if (!job) return
    this.handles.get(id)?.kill()
    this.handles.delete(id)
    this.clearRetry(id)
    if (deleteFile && job.outputFile) {
      // Recycle Bin, not permanent delete — recoverable if mis-clicked.
      void shell.trashItem(job.outputFile).catch(() => {})
    }
    this.jobs.delete(id)
    this.store.deleteJob(id)
    this.emitChanged()
    this.tick()
  }

  private clearRetry(id: string): void {
    const t = this.retryTimers.get(id)
    if (t) clearTimeout(t)
    this.retryTimers.delete(id)
  }

  private patch(job: Job, patch: Partial<Job>): void {
    Object.assign(job, patch)
    this.store.upsertJob(job)
    this.emitChanged()
  }

  /** Promote queued jobs into free slots. */
  tick(): void {
    if (!this.bins.status.binReady) return
    const active = [...this.jobs.values()].filter((j) => j.state === 'active')
    const free = Math.max(0, this.settings.maxConcurrent - active.length)
    if (free === 0) return
    const queued = this.list().filter((j) => j.state === 'queued')
    for (const job of queued.slice(0, free)) this.start(job)
  }

  private start(job: Job): void {
    this.patch(job, { state: 'active', error: null })
    // Naive global cap: split the budget across the slots (locked MVP behavior;
    // live-reallocation arrives with the aria2 generic leg).
    const perJobLimit =
      this.settings.speedLimitKbps > 0
        ? Math.max(64, Math.floor(this.settings.speedLimitKbps / this.settings.maxConcurrent))
        : 0
    const handle = startDownload(job, this.settings, this.bins.ffmpegLocation, perJobLimit, {
      onProgress: (p) => {
        job.progress = p
        this.emitChanged() // batched at the IPC layer, safe to fire freely
      },
      onOutputFile: (file) => this.patch(job, { outputFile: file }),
      onDone: () => {
        this.handles.delete(job.id)
        const wantSubs = job.writeSubs ?? this.settings.writeSubs
        this.patch(job, {
          state: 'completed',
          completedAt: Date.now(),
          subsState: wantSubs ? 'pending' : '',
          progress: { ...job.progress, pct: 100, speedBps: 0, etaSec: 0, phase: '' }
        })
        // Authoritative final size from disk (estimates and DASH totals drift).
        if (job.outputFile) void this.statIntoProgress(job)
        if (wantSubs) this.enqueueSubs(job.id)
        this.tick()
      },
      onError: (message, retryable) => {
        this.handles.delete(job.id)
        if (retryable && job.retries < 3) {
          // 429s need a real cool-down, not seconds.
          const base = /429/.test(message) ? 45_000 : 5000
          const delay = base * 2 ** job.retries
          this.patch(job, { state: 'queued', retries: job.retries + 1, error: message })
          const t = setTimeout(() => {
            this.retryTimers.delete(job.id)
            this.tick()
          }, delay)
          this.retryTimers.set(job.id, t)
        } else {
          this.patch(job, { state: 'failed', error: message })
        }
        this.tick()
      }
    })
    this.handles.set(job.id, handle)
  }

  shutdown(): void {
    for (const [id, handle] of this.handles) {
      handle.kill()
      const job = this.jobs.get(id)
      if (job && job.state === 'active') {
        job.state = 'queued' // resume on next boot via --continue
        this.store.upsertJob(job)
      }
    }
    this.handles.clear()
  }

  private emitChanged(): void {
    this.emit('changed')
  }
}
