import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { JobAction, NewJobInput, Settings } from '../shared/types'
import type { Engine } from './engine/queue'
import type { BinaryManager } from './engine/binaries'
import { probe } from './engine/ytdlp'

export function registerIpc(engine: Engine, bins: BinaryManager, win: () => BrowserWindow | null): void {
  ipcMain.handle('probe', async (_e, url: string) => probe(url))

  ipcMain.handle('jobs:add', (_e, inputs: NewJobInput[]) => engine.add(inputs))
  ipcMain.handle('jobs:list', () => engine.list())
  ipcMain.handle('jobs:action', (_e, payload: { action: JobAction; id: string }) => {
    engine.action(payload.action, payload.id)
  })
  ipcMain.handle('jobs:remove', (_e, payload: { ids: string[]; deleteFiles: boolean }) => {
    for (const id of payload.ids) engine.remove(id, payload.deleteFiles)
  })

  ipcMain.handle('settings:get', () => engine.settings)
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
    const next = engine.updateSettings(patch)
    if (patch.startWithWindows !== undefined) {
      app.setLoginItemSettings({ openAtLogin: patch.startWithWindows, args: ['--hidden'] })
    }
    return next
  })

  ipcMain.handle('engine:status', () => bins.status)

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    ytdlpVersion: bins.status.ytdlpVersion
  }))

  ipcMain.handle('shell:openUrl', (_e, url: string) => {
    if (/^(https:\/\/|mailto:)/.test(url)) void shell.openExternal(url)
  })

  ipcMain.handle('dialog:chooseDir', async () => {
    const w = win()
    if (!w) return null
    const res = await dialog.showOpenDialog(w, { properties: ['openDirectory'] })
    return res.canceled ? null : res.filePaths[0]
  })

  ipcMain.handle('shell:openPath', async (_e, p: string) => {
    // Robust open: highlight the file if it still exists; fall back to opening
    // the containing folder (file moved/renamed after download).
    const target = path.resolve(p)
    if (fs.existsSync(target)) {
      shell.showItemInFolder(target)
      return true
    }
    const dir = path.dirname(target)
    if (fs.existsSync(dir)) {
      await shell.openPath(dir)
      return true
    }
    return false
  })

  // Job updates stream: batch at 10Hz so 20 concurrent downloads can't flood IPC.
  let dirty = false
  engine.on('changed', () => (dirty = true))
  setInterval(() => {
    if (!dirty) return
    dirty = false
    win()?.webContents.send('jobs:changed', engine.list())
  }, 100)
}
