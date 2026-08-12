import http from 'node:http'
import { app } from 'electron'

const PORT = 42897

const YT_URL_RE =
  /^https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch|shorts|playlist)[^\s]*|youtu\.be\/[^\s]+)$/

/**
 * Local bridge for the browser extension: 127.0.0.1 only, and only requests
 * whose Origin is a browser extension are accepted — regular web pages send
 * http(s) origins and are rejected, so a malicious site can't enqueue jobs.
 * Payload is further limited to YouTube URLs. (v2 upgrade path: Chrome native
 * messaging with a forwarder exe, per TECH_STACK.md.)
 */
export function startExtensionBridge(opts: {
  isEnabled: () => boolean
  onUrl: (url: string) => void
}): void {
  const server = http.createServer((req, res) => {
    const origin = req.headers.origin ?? ''
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'content-type')
    res.setHeader('Content-Type', 'application/json')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    if (!/^(moz-extension|chrome-extension|safari-web-extension):\/\//.test(origin)) {
      res.writeHead(403)
      res.end(JSON.stringify({ error: 'extension origins only' }))
      return
    }
    if (!opts.isEnabled()) {
      res.writeHead(503)
      res.end(JSON.stringify({ error: 'bridge disabled in settings' }))
      return
    }

    if (req.method === 'GET' && req.url === '/ping') {
      res.writeHead(200)
      res.end(JSON.stringify({ app: 'ytdm', version: app.getVersion() }))
      return
    }

    if (req.method === 'POST' && req.url === '/add') {
      let body = ''
      req.on('data', (c) => {
        body += c
        if (body.length > 4096) req.destroy()
      })
      req.on('end', () => {
        try {
          const { url } = JSON.parse(body) as { url?: string }
          if (!url || !YT_URL_RE.test(url.trim())) {
            res.writeHead(400)
            res.end(JSON.stringify({ error: 'not a YouTube URL' }))
            return
          }
          opts.onUrl(url.trim())
          res.writeHead(200)
          res.end(JSON.stringify({ ok: true }))
        } catch {
          res.writeHead(400)
          res.end(JSON.stringify({ error: 'bad request' }))
        }
      })
      return
    }

    res.writeHead(404)
    res.end(JSON.stringify({ error: 'not found' }))
  })

  server.on('error', (e) => {
    console.log(`[extbridge] not started: ${(e as Error).message}`)
  })
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[extbridge] listening on 127.0.0.1:${PORT}`)
  })
}
