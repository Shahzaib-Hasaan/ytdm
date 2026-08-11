import { contextBridge, ipcRenderer } from 'electron'
import type {
  EngineStatus,
  Job,
  JobAction,
  NewJobInput,
  ProbeResult,
  Settings
} from '../shared/types'

const api = {
  probe: (url: string): Promise<ProbeResult> => ipcRenderer.invoke('probe', url),
  addJobs: (inputs: NewJobInput[]): Promise<Job[]> => ipcRenderer.invoke('jobs:add', inputs),
  listJobs: (): Promise<Job[]> => ipcRenderer.invoke('jobs:list'),
  jobAction: (action: JobAction, id: string): Promise<void> =>
    ipcRenderer.invoke('jobs:action', { action, id }),
  removeJobs: (ids: string[], deleteFiles: boolean): Promise<void> =>
    ipcRenderer.invoke('jobs:remove', { ids, deleteFiles }),
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke('settings:set', patch),
  engineStatus: (): Promise<EngineStatus> => ipcRenderer.invoke('engine:status'),
  appInfo: (): Promise<{ version: string; ytdlpVersion: string | null }> =>
    ipcRenderer.invoke('app:info'),
  openUrl: (url: string): Promise<void> => ipcRenderer.invoke('shell:openUrl', url),
  chooseDir: (): Promise<string | null> => ipcRenderer.invoke('dialog:chooseDir'),
  showInFolder: (p: string): Promise<void> => ipcRenderer.invoke('shell:openPath', p),
  onJobs: (cb: (jobs: Job[]) => void): void => {
    ipcRenderer.on('jobs:changed', (_e, jobs: Job[]) => cb(jobs))
  },
  onEngineStatus: (cb: (s: EngineStatus) => void): void => {
    ipcRenderer.on('engine:status', (_e, s: EngineStatus) => cb(s))
  },
  onClipboardUrl: (cb: (url: string) => void): void => {
    ipcRenderer.on('clipboard:url', (_e, url: string) => cb(url))
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
