import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Resvg } from '@resvg/resvg-js'

// Native 64px alpha assets are the visual midpoint: compact but smooth.
const size = 64
const style = 'rounded'
const icons = [
  ['media.previous', 1, 'skip_previous-fill'],
  ['media.play-pause', 2, 'play_pause-fill'],
  ['media.next', 3, 'skip_next-fill'],
  ['media.mute', 4, 'volume_off-fill'],
  ['media.unmute', 5, 'volume_up-fill'],
  ['system.display-recovery', 6, 'display_settings-fill'],
  ['media.seek-back-10', 7, 'replay_10-fill'],
  ['media.seek-forward-10', 8, 'forward_10-fill'],
]

function alpha4bpp(rgba) {
  const data = Buffer.alloc((size * size) / 2)
  for (let index = 0; index < size * size; index += 1) {
    const alpha = Math.round(rgba[index * 4 + 3] * 15 / 255)
    if ((index & 1) === 0) data[index >> 1] |= alpha << 4
    else data[index >> 1] |= alpha
  }
  return data.toString('base64')
}

const catalog = []
for (const [name, id, icon] of icons) {
  const source = resolve(`node_modules/@material-symbols/svg-400/${style}/${icon}.svg`)
  const svg = await readFile(source, 'utf8')
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render()
  catalog.push({ name, id, format: 3, width: size, height: size, data: alpha4bpp(png.pixels) })
}

const output = JSON.stringify({ source: `Material Symbols ${style} 400`, assets: catalog }, null, 2) + '\n'
for (const target of process.argv.slice(2)) await writeFile(resolve(target), output)
