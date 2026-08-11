import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { BinaryManager, binDir } from './engine/binaries'
import { startClipboardWatcher } from './engine/clipboard'
import { createStore } from './engine/db'
import { Engine } from './engine/queue'
import { registerIpc } from './ipc'
import { startAutoUpdater } from './updater'

let mainWindow: BrowserWindow | null = null
let engine: Engine | null = null
let tray: Tray | null = null
let quitting = false

function iconPath(): string {
  // Packaged: extraResources puts it next to the app; dev: repo build folder.
  const packaged = path.join(process.resourcesPath, 'icon.png')
  if (app.isPackaged && fs.existsSync(packaged)) return packaged
  return path.join(app.getAppPath(), 'build', 'icon.png')
}

function showWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

/** IDM-style tray click: hidden -> show, visible -> tuck back into the tray. */
function toggleWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
    mainWindow.hide()
  } else {
    showWindow()
  }
}

function createTray(): void {
  const image = nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 })
  tray = new Tray(image)
  tray.setToolTip('YTDM — download manager')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open YTDM', click: showWindow },
      { type: 'separator' },
      { label: 'Pause all downloads', click: () => engine?.pauseAll() },
      { label: 'Resume all downloads', click: () => engine?.resumeAll() },
      { type: 'separator' },
      {
        label: 'Exit',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('click', toggleWindow)
  tray.on('double-click', showWindow)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', showWindow)

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
      minWidth: 640,
      minHeight: 480,
      autoHideMenuBar: true,
      icon: iconPath(),
      backgroundColor: '#0b0f14',
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })

    registerIpc(engine, bins, () => mainWindow)
    createTray()
    startAutoUpdater(() => mainWindow)

    startClipboardWatcher(
      () => engine?.settings.clipboardWatch ?? false,
      (url) => mainWindow?.webContents.send('clipboard:url', url)
    )

    if (process.env['ELECTRON_RENDERER_URL']) {
      mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
    }

    // Proper Windows-app behavior: closing the window keeps downloads running
    // in the tray (opt-out in Settings); Exit lives in the tray menu.
    mainWindow.on('close', (e) => {
      if (!quitting && (engine?.settings.closeToTray ?? true)) {
        e.preventDefault()
        mainWindow?.hide()
      }
    })
    mainWindow.on('closed', () => (mainWindow = null))
  })

  app.on('before-quit', () => {
    quitting = true
    engine?.shutdown()
  })
  app.on('window-all-closed', () => {
    if (quitting) app.quit()
  })
}
