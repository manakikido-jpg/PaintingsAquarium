import { saturation, value, type RgbaImage } from './image'
import { insideOutline } from './outline'

type Colour = readonly [number, number, number]

export interface PaperColourMap {
  readonly cols: number
  readonly rows: number
  readonly colours: readonly Colour[]
}

/**
 * スキャナの色むらを紙の色から測る。輪郭の内側は標本から外すので、
 * 薄く塗った胴を紙の色として学習しない。中央値で細いはみ出し線も避ける。
 * 暗い影を消す下限とは別に持ち、暗い線まで紙として消さない（R-093）。
 */
export function localPaperColours(
  image: RgbaImage, fallback: Colour, protectedShape: RgbaImage = insideOutline(image),
): PaperColourMap {
  const cols = 6
  const rows = 4
  const buckets: number[][][] = Array.from({ length: cols * rows }, () => [[], [], []])
  const safeFallback: Colour = value(...fallback) >= 0.65 && saturation(...fallback) <= 0.2
    ? fallback : [255, 255, 255]
  for (let y = 0; y < image.height; y += 2) {
    for (let x = 0; x < image.width; x += 2) {
      const at = (y * image.width + x) * 4
      if (image.data[at + 3] < 128 || protectedShape.data[at + 3] > 0) continue
      const r = image.data[at], g = image.data[at + 1], b = image.data[at + 2]
      if (value(r, g, b) < 0.65 || saturation(r, g, b) > 0.2) continue
      const col = Math.min(cols - 1, Math.floor(x / image.width * cols))
      const row = Math.min(rows - 1, Math.floor(y / image.height * rows))
      const bucket = buckets[row * cols + col]
      // 明るさの勾配に中央値が引かれないよう、色味だけを比べる。
      const scale = 255 / Math.max(r, g, b)
      bucket[0].push(r * scale)
      bucket[1].push(g * scale)
      bucket[2].push(b * scale)
    }
  }
  const measured = buckets.map((bucket): Colour | null => {
    if (bucket[0].length < 12) return null
    const medians = bucket.map((channel) => {
      channel.sort((a, b) => a - b)
      return channel[Math.floor(channel.length / 2)]
    })
    return [medians[0], medians[1], medians[2]]
  })
  const colours = measured.map((colour, index): Colour => {
    if (colour) return colour
    // 透明な余白や動物の胴で測れない区画は、隣の紙を使う。黒い線へ寄せない。
    let nearest = safeFallback
    let distance = Infinity
    for (let other = 0; other < measured.length; other++) {
      const candidate = measured[other]
      if (!candidate) continue
      const d = (index % cols - other % cols) ** 2 +
        (Math.floor(index / cols) - Math.floor(other / cols)) ** 2
      if (d < distance) { nearest = candidate; distance = d }
    }
    return nearest
  })
  return { cols, rows, colours }
}

/** 区画の境で紙が格子状に残らないよう、隣の区画と連続的に補間する。 */
export function paperColourAt(
  map: PaperColourMap, x: number, y: number, width: number, height: number,
): Colour {
  const gx = Math.max(0, Math.min(map.cols - 1, (x + 0.5) / width * map.cols - 0.5))
  const gy = Math.max(0, Math.min(map.rows - 1, (y + 0.5) / height * map.rows - 0.5))
  const left = Math.floor(gx), top = Math.floor(gy)
  const right = Math.min(map.cols - 1, left + 1), bottom = Math.min(map.rows - 1, top + 1)
  const dx = gx - left, dy = gy - top
  const a = map.colours[top * map.cols + left], b = map.colours[top * map.cols + right]
  const c = map.colours[bottom * map.cols + left], d = map.colours[bottom * map.cols + right]
  const channel = (i: number): number =>
    (a[i] * (1 - dx) + b[i] * dx) * (1 - dy) + (c[i] * (1 - dx) + d[i] * dx) * dy
  return [channel(0), channel(1), channel(2)]
}
