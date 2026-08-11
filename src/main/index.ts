import { app, BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { BinaryManager, binDir } from './engine/binaries'
import { startClipboardWatcher } from './engine/clipboard'
import { createStore } from './engine/db'
import { Engine } from './engine/queue'
import { registerIpc } from './ipc'

let mainWindow: BrowserWindow | null = null
let engine: Engine | null = null

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    // If a previous app instance was force-killed, its yt-dlp children survive
    // as orphans that keep downloading the same filenames and can delete a
    // fresh download during their own post-processing cleanup. Reap them.
    const ourYtdlp = path.join(binDir(), 'yt-dlp.exe').replace(/'/g, "''")
    spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Get-CimInstance Win32_Process -Filter "Name='yt-dlp.exe'" | Where-Object { $_.ExecutablePath -eq '${ourYtdlp}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`
      ],
      { windowsHide: true }
    )

    const bins = new BinaryManager((status) => {
      mainWindow?.webContents.send('engine:status', status)
      engine?.tick() // binaries just became ready -> start queued jobs
    })
    const store = createStore()
    engine = new Engine(store, bins)

    mainWindow = new BrowserWindow({
      width: 1200,
      height: 760,
      minWidth: 900,
      minHeight: 560,
      autoHideMenuBar: true,
      backgroundColor: '#0b0f14',
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })

    registerIpc(engine, bins, () => mainWindow)

    startClipboardWatcher(
      () => engine?.settings.clipboardWatch ?? false,
      (url) => mainWindow?.webContents.send('clipboard:url', url)
    )

    if (process.env['ELECTRON_RENDERER_URL']) {
      mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
    }

    mainWindow.on('closed', () => (mainWindow = null))

    // Async: first run downloads yt-dlp/deno/ffmpeg, later runs self-update yt-dlp.
    void bins.ensureAll()
  })

  app.on('before-quit', () => engine?.shutdown())
  app.on('window-all-closed', () => app.quit())
}
