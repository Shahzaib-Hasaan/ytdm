import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { Job } from '../../shared/types'

export interface JobStore {
  backend: 'sqlite' | 'json'
  upsertJob(job: Job): void
  deleteJob(id: string): void
  getJobs(): Job[]
  getKv(key: string): string | null
  setKv(key: string, value: string): void
}

/**
 * Primary: node:sqlite (ships inside Electron's Node, zero native-rebuild treadmill).
 * Fallback: atomic JSON file — keeps the app alive if the pinned Electron's Node
 * doesn't expose node:sqlite. DAO shape stays identical either way (locked decision).
 */
export function createStore(): JobStore {
  const dir = app.getPath('userData')
  fs.mkdirSync(dir, { recursive: true })
  try {
    return createSqliteStore(path.join(dir, 'downloads.db'))
  } catch (e) {
    console.warn('node:sqlite unavailable, falling back to JSON store:', e)
    return createJsonStore(path.join(dir, 'downloads.json'))
  }
}

function createSqliteStore(file: string): JobStore {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode=WAL;')
  db.exec(`CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    state TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  );`)
  db.exec('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);')

  const upsert = db.prepare(
    'INSERT INTO jobs (id, data, state, createdAt) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET data=excluded.data, state=excluded.state'
  )
  const del = db.prepare('DELETE FROM jobs WHERE id = ?')
  const all = db.prepare('SELECT data FROM jobs ORDER BY createdAt ASC')
  const kvGet = db.prepare('SELECT v FROM kv WHERE k = ?')
  const kvSet = db.prepare(
    'INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v'
  )

  return {
    backend: 'sqlite',
    upsertJob(job) {
      upsert.run(job.id, JSON.stringify(job), job.state, job.createdAt)
    },
    deleteJob(id) {
      del.run(id)
    },
    getJobs() {
      return (all.all() as { data: string }[]).map((r) => JSON.parse(r.data) as Job)
    },
    getKv(key) {
      const row = kvGet.get(key) as { v: string } | undefined
      return row?.v ?? null
    },
    setKv(key, value) {
      kvSet.run(key, value)
    }
  }
}

function createJsonStore(file: string): JobStore {
  let data: { jobs: Record<string, Job>; kv: Record<string, string> } = { jobs: {}, kv: {} }
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    /* fresh store */
  }
  let timer: NodeJS.Timeout | null = null
  const save = (): void => {
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      const tmp = file + '.tmp'
      fs.writeFileSync(tmp, JSON.stringify(data))
      fs.renameSync(tmp, file)
    }, 300)
  }
  return {
    backend: 'json',
    upsertJob(job) {
      data.jobs[job.id] = job
      save()
    },
    deleteJob(id) {
      delete data.jobs[id]
      save()
    },
    getJobs() {
      return Object.values(data.jobs).sort((a, b) => a.createdAt - b.createdAt)
    },
    getKv(key) {
      return data.kv[key] ?? null
    },
    setKv(key, value) {
      data.kv[key] = value
      save()
    }
  }
}
