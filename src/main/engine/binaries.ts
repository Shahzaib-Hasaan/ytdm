import { app } from 'electron'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { EngineStatus } from '../../shared/types'

// Nightly channel: YouTube breaks extraction constantly; stable lags fixes by days/weeks.
const YTDLP_URL =
  'https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp.exe'
// Mandatory JS runtime for nsig challenge solving since yt-dlp 2025.11.12.
// Placed next to yt-dlp.exe -> auto-discovered.
const DENO_URL =
  'https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip'
// LGPL build on purpose: remuxing does no encoding, avoids GPL + patent-pool exposure.
const FFMPEG_URL =
  'https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-lgpl.zip'

export function binDir(): string {
  return path.join(app.getPath('userData'), 'bin')
}

export function ytdlpPath(): string {
  return path.join(binDir(), 'yt-dlp.exe')
}

export function denoPath(): string {
  return path.join(binDir(), 'deno.exe')
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export function execCapture(
  cmd: string,
  args: string[],
  timeoutMs = 30_000
): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true })
    let out = ''
    let err = ''
    const timer = setTimeout(() => child.kill(), timeoutMs)
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ code: null, out, err: String(e) })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, out, err })
    })
  })
}

async function whereInPath(name: string): Promise<string | null> {
  const { code, out } = await execCapture('where', [name], 5000)
  if (code === 0 && out.trim()) return out.trim().split(/\r?\n/)[0]
  return null
}

async function downloadTo(url: string, dest: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`GET ${url} -> HTTP ${res.status}`)
  await fs.mkdir(path.dirname(dest), { recursive: true })
  const tmp = dest + '.tmp'
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(tmp))
  await fs.rm(dest, { force: true })
  await fs.rename(tmp, dest)
}

/** Windows 10+ ships bsdtar, which extracts zip archives — no extra dependency. */
async function extractZip(zipFile: string, destDir: string): Promise<void> {
  await fs.mkdir(destDir, { recursive: true })
  const { code, err } = await execCapture('tar', ['-xf', zipFile, '-C', destDir], 120_000)
  if (code !== 0) throw new Error(`unzip failed: ${err}`)
}

async function findFile(root: string, name: string): Promise<string | null> {
  const entries = await fs.readdir(root, { withFileTypes: true, recursive: true })
  for (const e of entries) {
    if (e.isFile() && e.name.toLowerCase() === name) {
      return path.join(e.parentPath ?? (e as never as { path: string }).path, e.name)
    }
  }
  return null
}

export class BinaryManager {
  status: EngineStatus = {
    binReady: false,
    downloadingBins: false,
    binMessage: 'checking…',
    ytdlpVersion: null,
    ffmpegFound: false,
    denoFound: false
  }

  /** Directory (or exe) handed to yt-dlp via --ffmpeg-location. */
  ffmpegLocation: string | null = null

  private onChange: (s: EngineStatus) => void

  constructor(onChange: (s: EngineStatus) => void) {
    this.onChange = onChange
  }

  private emit(patch: Partial<EngineStatus>): void {
    this.status = { ...this.status, ...patch }
    this.onChange(this.status)
  }

  async ensureAll(): Promise<void> {
    this.emit({ downloadingBins: true, binMessage: 'checking components…' })
    try {
      await this.ensureYtdlp()
      await this.ensureDeno()
      await this.ensureFfmpeg()
      const ready = this.status.ytdlpVersion !== null && this.status.ffmpegFound
      this.emit({
        binReady: ready,
        downloadingBins: false,
        binMessage: ready ? 'ready' : 'component setup incomplete'
      })
    } catch (e) {
      this.emit({
        binReady: this.status.ytdlpVersion !== null,
        downloadingBins: false,
        binMessage: `setup error: ${(e as Error).message}`
      })
    }
  }

  private async ensureYtdlp(): Promise<void> {
    if (!(await exists(ytdlpPath()))) {
      this.emit({ binMessage: 'downloading yt-dlp (nightly)…' })
      await downloadTo(YTDLP_URL, ytdlpPath())
    } else {
      // TODO v1.1: app-owned SHA2-256SUMS-verified updater with atomic swap + rollback
      // (locked in TECH_STACK.md). yt-dlp's own -U is good enough for the dev skeleton.
      this.emit({ binMessage: 'updating yt-dlp…' })
      await execCapture(ytdlpPath(), ['-U', '--update-to', 'nightly@latest'], 120_000)
    }
    const { code, out } = await execCapture(ytdlpPath(), ['--version'], 15_000)
    if (code === 0) this.emit({ ytdlpVersion: out.trim() })
    else throw new Error('yt-dlp not runnable')
  }

  private async ensureDeno(): Promise<void> {
    if (await exists(denoPath())) {
      this.emit({ denoFound: true })
      return
    }
    const inPath = await whereInPath('deno')
    if (inPath) {
      // PATH copy works, but colocating guarantees yt-dlp discovery.
      this.emit({ denoFound: true })
      return
    }
    try {
      this.emit({ binMessage: 'downloading Deno runtime…' })
      const zip = path.join(binDir(), 'deno.zip')
      await downloadTo(DENO_URL, zip)
      await extractZip(zip, binDir())
      await fs.rm(zip, { force: true })
      this.emit({ denoFound: await exists(denoPath()) })
    } catch {
      // Non-fatal: yt-dlp still works with reduced format availability.
      this.emit({ denoFound: false, binMessage: 'Deno unavailable (reduced formats)' })
    }
  }

  private async ensureFfmpeg(): Promise<void> {
    const local = path.join(binDir(), 'ffmpeg.exe')
    if (await exists(local)) {
      this.ffmpegLocation = binDir()
      this.emit({ ffmpegFound: true })
      return
    }
    const inPath = await whereInPath('ffmpeg')
    if (inPath) {
      this.ffmpegLocation = path.dirname(inPath)
      this.emit({ ffmpegFound: true })
      return
    }
    this.emit({ binMessage: 'downloading ffmpeg (LGPL)…' })
    const zip = path.join(binDir(), 'ffmpeg.zip')
    const extractDir = path.join(binDir(), 'ffmpeg-extract')
    await downloadTo(FFMPEG_URL, zip)
    await extractZip(zip, extractDir)
    for (const name of ['ffmpeg.exe', 'ffprobe.exe']) {
      const found = await findFile(extractDir, name)
      if (found) await fs.copyFile(found, path.join(binDir(), name))
    }
    await fs.rm(zip, { force: true })
    await fs.rm(extractDir, { recursive: true, force: true })
    if (await exists(local)) {
      this.ffmpegLocation = binDir()
      this.emit({ ffmpegFound: true })
    } else {
      throw new Error('ffmpeg download failed')
    }
  }
}
