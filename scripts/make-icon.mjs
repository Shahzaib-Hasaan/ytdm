// Generates build/icon.ico (and build/icon.png) from an inline SVG.
// Design: graphite rounded square, red download arrow, light catch tray —
// the app's brand colors (--t-ink / --t-brand / --t-fg).
import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { mkdirSync, writeFileSync } from 'node:fs'

const svg = `
<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1B222B"/>
      <stop offset="1" stop-color="#0F1216"/>
    </linearGradient>
    <linearGradient id="arrow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F2555A"/>
      <stop offset="1" stop-color="#D93843"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="56" fill="url(#bg)"/>
  <rect x="2" y="2" width="252" height="252" rx="54" fill="none" stroke="#2A323E" stroke-width="3"/>
  <path d="M110 54 h36 a8 8 0 0 1 8 8 v58 h28 a8 8 0 0 1 6 13.3 l-54 62 a8 8 0 0 1 -12.2 0 l-54 -62 a8 8 0 0 1 6 -13.3 h28 v-58 a8 8 0 0 1 8 -8 z" fill="url(#arrow)"/>
  <rect x="58" y="204" width="140" height="18" rx="9" fill="#E8ECF1"/>
</svg>`

mkdirSync('build', { recursive: true })
const master = await sharp(Buffer.from(svg)).png().toBuffer()
writeFileSync('build/icon.png', await sharp(master).resize(512, 512).png().toBuffer())

const sizes = [256, 128, 64, 48, 32, 16]
const pngs = []
for (const s of sizes) {
  pngs.push(await sharp(master).resize(s, s).png().toBuffer())
}
writeFileSync('build/icon.ico', await pngToIco(pngs))
console.log('build/icon.ico + build/icon.png written')
