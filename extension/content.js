// YTDM download button on YouTube pages.
// A floating pill (bottom-right) rather than DOM injection into YouTube's
// player chrome — YouTube rebuilds and renames its internals constantly, and
// a floating control survives every redesign. Icon comes from content.css.
;(function () {
  const api = typeof browser !== 'undefined' ? browser : chrome

  let btn = null
  let labelSpan = null
  let labelTimer = null

  function downloadablePage() {
    const p = location.pathname
    return p === '/watch' || p.startsWith('/shorts/') || p === '/playlist'
  }

  function label() {
    return location.pathname === '/playlist' ? 'Download playlist' : 'Download'
  }

  function ensureButton() {
    if (btn) return btn
    btn = document.createElement('button')
    btn.id = 'ytdm-pill'
    btn.type = 'button'
    labelSpan = document.createElement('span')
    btn.appendChild(labelSpan)
    btn.addEventListener('click', onClick)
    document.documentElement.appendChild(btn)
    return btn
  }

  function setLabel(text, cls) {
    ensureButton()
    labelSpan.textContent = text
    btn.className = cls || ''
    if (labelTimer) clearTimeout(labelTimer)
  }

  function refresh() {
    ensureButton()
    if (downloadablePage()) {
      setLabel(label(), '')
      btn.style.display = 'flex'
    } else {
      btn.style.display = 'none'
    }
  }

  async function onClick() {
    setLabel('Sending…', 'ytdm-busy')
    let res
    try {
      res = await api.runtime.sendMessage({ type: 'ytdm-send', url: location.href })
    } catch {
      res = { ok: false, error: 'app-unreachable' }
    }
    if (res && res.ok) {
      setLabel('Sent to YTDM ✓', 'ytdm-ok')
    } else if (res && res.error === 'app-unreachable') {
      setLabel('Open YTDM first', 'ytdm-err')
    } else {
      setLabel('Failed — try again', 'ytdm-err')
    }
    labelTimer = setTimeout(refresh, 2600)
  }

  // YouTube is a single-page app: real navigations rarely reload the page.
  window.addEventListener('yt-navigate-finish', refresh)
  window.addEventListener('popstate', refresh)
  // Fallback for URL changes that fire neither event.
  let lastHref = location.href
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href
      refresh()
    }
  }, 1000)

  refresh()
})()
