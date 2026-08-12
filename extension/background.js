// Relay between content scripts / popup and the YTDM desktop app's local
// bridge. Content scripts run with the page's origin and cannot reach
// 127.0.0.1 themselves — the worker has the host permission.
const BRIDGE = 'http://127.0.0.1:42897'

const api = typeof browser !== 'undefined' ? browser : chrome

async function sendToApp(url) {
  try {
    const res = await fetch(`${BRIDGE}/add`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url })
    })
    if (res.ok) return { ok: true }
    const body = await res.json().catch(() => ({}))
    return { ok: false, error: body.error || `HTTP ${res.status}` }
  } catch {
    return { ok: false, error: 'app-unreachable' }
  }
}

async function ping() {
  try {
    const res = await fetch(`${BRIDGE}/ping`)
    if (!res.ok) return { ok: false }
    return { ok: true, ...(await res.json()) }
  } catch {
    return { ok: false }
  }
}

api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'ytdm-send') {
    sendToApp(msg.url).then(sendResponse)
    return true // async response
  }
  if (msg && msg.type === 'ytdm-ping') {
    ping().then(sendResponse)
    return true
  }
  return false
})
