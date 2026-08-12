// Extension icons derived from the app icon.
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

mkdirSync('extension/icons', { recursive: true })
for (const s of [16, 32, 48, 128]) {
  await sharp('build/icon.png').resize(s, s).png().toFile(`extension/icons/${s}.png`)
}
console.log('extension icons written')
