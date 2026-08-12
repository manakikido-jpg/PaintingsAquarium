import { createImage, type RgbaImage } from './image'

export interface Bounds {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/**
 * 透明でない画素の外接矩形を求める。全部透明なら null。
 */
export function opaqueBounds(image: RgbaImage, alphaThreshold = 8): Bounds | null {
  const { width, height, data } = image
  let left = width
  let top = height
  let right = -1
  let bottom = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] <= alphaThreshold) continue
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }

  if (right < 0) return null
  return { left, top, width: right - left + 1, height: bottom - top + 1 }
}

/**
 * 絵の外周の余白を切り落とす。
 *
 * 余白を残したままだと、描画も当たり判定も余白ぶん無駄になり、
 * 水槽の中で絵どうしが不自然に離れて見える。
 *
 * padding は 0 にしていない。境界をぼかしてある都合で、ぎりぎりで切ると
 * 半透明の 1 列が欠けて輪郭が硬くなるため。
 */
export function trimTransparent(
  image: RgbaImage,
  { alphaThreshold = 8, padding = 2 }: { alphaThreshold?: number; padding?: number } = {},
): { image: RgbaImage; bounds: Bounds } | null {
  const bounds = opaqueBounds(image, alphaThreshold)
  if (bounds === null) return null

  const left = Math.max(0, bounds.left - padding)
  const top = Math.max(0, bounds.top - padding)
  const right = Math.min(image.width - 1, bounds.left + bounds.width - 1 + padding)
  const bottom = Math.min(image.height - 1, bounds.top + bounds.height - 1 + padding)

  const padded: Bounds = {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  }

  const result = createImage(padded.width, padded.height)
  for (let y = 0; y < padded.height; y++) {
    const sourceStart = ((top + y) * image.width + left) * 4
    const targetStart = y * padded.width * 4
    result.data.set(image.data.subarray(sourceStart, sourceStart + padded.width * 4), targetStart)
  }

  return { image: result, bounds: padded }
}
