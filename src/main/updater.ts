import { BrowserWindow, ipcMain } from 'electron'
import electron from 'electron'
import updaterPkg from 'electron-updater'
import type { UpdateStatus } from '../shared/types'

const { autoUpdater } = updaterPkg

let status: UpdateStatus = { state: 'idle', version: null }

/**
 * In-app updates from GitHub Releases (latest.yml + delta downloads).
 * Flow: check on launch and every 4h -> download in background -> renderer
 * shows "Restart to update" -> quitAndInstall.
 */
export function startAutoUpdater(win: () => BrowserWindow | null): void {
  ipcMain.handle('update:status', () => status)
  ipcMain.handle('update:install', () => {
    if (status.state === 'ready') autoUpdater.quitAndInstall()
  })

  if (!electron.app.isPackaged) return // dev builds have no update feed

  const push = (next: UpdateStatus): void => {
    status = next
    win()?.webContents.send('update:status', status)
  }

  autoUpdater.autoDownload = true
  autoUpdater.on('update-available', (info) => push({ state: 'downloading', version: info.version }))
  autoUpdater.on('update-downloaded', (info) => push({ state: 'ready', version: info.version }))
  autoUpdater.on('error', () => push({ state: 'error', version: null }))

  const check = (): void => {
    void autoUpdater.checkForUpdates().catch(() => {})
  }
  check()
  setInterval(check, 4 * 60 * 60 * 1000)
}
