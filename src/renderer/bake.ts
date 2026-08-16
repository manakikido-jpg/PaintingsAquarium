import type { Tank } from '../core/swim'

/**
 * 動かない背景要素を、あらかじめ 1 枚の絵に焼き付けておく仕組み。
 *
 * 遠くの物をぼかすと「切り絵」感が消えて一気に本物らしくなるが、
 * `filter: blur()` は毎フレーム掛けると大画面で重い。
 * 岩・砂・貝・沈没船は動かないので、**起動時に 1 回だけ**ぼかして焼き、
 * 以降は焼いた絵を貼るだけにする。毎フレームの費用はほぼゼロになる。
 */
export interface BakedLayer {
  readonly canvas: HTMLCanvasElement
  draw(context: CanvasRenderingContext2D, tank: Tank, alpha: number): void
}

export interface BakeOptions {
  /** ぼかしの強さ（ピクセル）。0 でぼかさない */
  readonly blur?: number
  /**
   * 焼く面の縮小率。ぼかす層は細かさが要らないので小さく焼いてよい。
   * 1 で実寸。
   */
  readonly resolution?: number
}

export function bakeLayer(
  tank: Tank,
  paint: (context: CanvasRenderingContext2D, tank: Tank) => void,
  { blur = 0, resolution = 1 }: BakeOptions = {},
): BakedLayer | null {
  const width = Math.max(1, Math.round(tank.width * resolution))
  const height = Math.max(1, Math.round(tank.height * resolution))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return null

  context.scale(resolution, resolution)
  if (blur > 0) context.filter = `blur(${blur}px)`
  paint(context, tank)
  context.filter = 'none'

  return {
    canvas,
    draw(target, targetTank, alpha) {
      if (alpha <= 0) return
      target.save()
      target.globalAlpha = alpha
      target.imageSmoothingEnabled = true
      target.imageSmoothingQuality = 'low'
      target.drawImage(canvas, 0, 0, targetTank.width, targetTank.height)
      target.restore()
    },
  }
}
