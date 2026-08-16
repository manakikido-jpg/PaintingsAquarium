import { renderCaustics, type CausticsOptions } from '../core/caustics'
import type { Tank } from '../core/swim'

/**
 * 水面の揺らぎ模様を画面に重ねる層。
 *
 * **画面の実寸では作らない。** 長辺 480px 程度の小さい面に描き、
 * 引き伸ばして重ねる。模様はもともとぼやけているので拡大しても粗が出ず、
 * 4K の大画面でも計算量が変わらない（実測 480×270 で 1 フレーム 1.06ms）。
 *
 * 重ね方は `lighter`（加算）。黒い所は何も足さないので、
 * 明るい筋だけが水に浮かび上がる。
 */
export interface CausticsLayer {
  draw(context: CanvasRenderingContext2D, elapsed: number, strength: number): void
}

export interface CausticsLayerOptions extends CausticsOptions {
  /** 長辺の画素数。大きいほど細かいが重くなる */
  readonly resolution?: number
  /** 模様の色 */
  readonly tint?: readonly [number, number, number]
  /** 全体の濃さ */
  readonly intensity?: number
}

export function createCausticsLayer(
  tank: Tank,
  {
    resolution = 480,
    tint = [150, 232, 255],
    intensity = 0.5,
    ...causticsOptions
  }: CausticsLayerOptions = {},
): CausticsLayer {
  const width = Math.max(1, Math.min(resolution, Math.round(tank.width)))
  const height = Math.max(1, Math.round((width * Math.max(1, tank.height)) / Math.max(1, tank.width)))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const buffer = canvas.getContext('2d')

  const field = new Uint8ClampedArray(width * height)
  const image = buffer?.createImageData(width, height)
  const [tintR, tintG, tintB] = tint

  return {
    draw(context, elapsed, strength) {
      if (!buffer || !image || strength <= 0) return

      renderCaustics(field, width, height, elapsed, causticsOptions)

      const pixels = image.data
      for (let index = 0; index < field.length; index++) {
        const value = field[index] / 255
        const offset = index * 4
        pixels[offset] = tintR * value
        pixels[offset + 1] = tintG * value
        pixels[offset + 2] = tintB * value
        // 加算合成なので、暗い画素は何も足さない。透明度で調整しない。
        pixels[offset + 3] = 255
      }
      buffer.putImageData(image, 0, 0)

      context.save()
      context.globalCompositeOperation = 'lighter'
      context.globalAlpha = intensity * strength
      // 引き伸ばすときにぼかす。切っておくと網目が四角く割れて見える。
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'low'
      context.drawImage(canvas, 0, 0, tank.width, tank.height)
      context.restore()
    },
  }
}
