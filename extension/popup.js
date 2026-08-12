const api = typeof browser !== 'undefined' ? browser : chrome

const dot = document.getElementById('dot')
const status = document.getElementById('status')
const send = document.getElementById('send')
const hint = document.getElementById('hint')

const YT_RE = /^https?:\/\/(www\.|m\.|music\.)?(youtube\.com\/(watch|shorts|playlist)|youtu\.be\/)/

async function init() {
  const ping = await api.runtime.sendMessage({ type: 'ytdm-ping' })
  if (ping && ping.ok) {
    dot.className = 'dot ok'
    status.textContent = `YTDM v${ping.version} running`
  } else {
    dot.className = 'dot err'
    status.textContent = 'YTDM app not running'
    hint.textContent = 'Start the YTDM desktop app, then try again. No app yet? '
    const a = document.createElement('a')
    a.href = 'https://github.com/Shahzaib-Hasaan/ytdm/releases/latest'
    a.target = '_blank'
    a.textContent = 'Download it.'
    hint.appendChild(a)
    return
  }

  const [tab] = await api.tabs.query({ active: true, currentWindow: true })
  if (tab && tab.url && YT_RE.test(tab.url)) {
    send.disabled = false
    send.addEventListener('click', async () => {
      send.disabled = true
      send.textContent = 'Sending…'
      const res = await api.runtime.sendMessage({ type: 'ytdm-send', url: tab.url })
      send.textContent = res && res.ok ? 'Sent ✓' : 'Failed'
    })
  } else {
    hint.textContent = 'Open a YouTube video or playlist tab to send it.'
  }
}

void init()
