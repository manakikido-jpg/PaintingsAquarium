import { bubbleX, rayAt, type Bubble, type LightRay } from '../core/scenery'
import type { Tank } from '../core/swim'

/**
 * 背景の描き方。動きの計算は `core/scenery.ts` にあり、ここは描くだけ。
 *
 * 全体を通しての方針は「主役は子どもの絵」。
 * 背景の要素はすべて低い不透明度で、彩度も抑えてある。
 * `strength` は会場で弱められるようにするための倍率（0 で背景は無地になる）。
 */

/** 水の深さのグラデーション。上ほど明るく、下ほど濃い。 */
export function drawWater(
  context: CanvasRenderingContext2D,
  tank: Tank,
  strength: number,
): void {
  const gradient = context.createLinearGradient(0, 0, 0, tank.height)
  gradient.addColorStop(0, '#0d6f92')
  gradient.addColorStop(0.35, '#0a4a6b')
  gradient.addColorStop(0.72, '#062f47')
  gradient.addColorStop(1, '#02121d')
  context.fillStyle = gradient
  context.fillRect(0, 0, tank.width, tank.height)

  // 水面の明るい帯。画面の上端が「水の中の上のほう」に見えるようにする。
  const surfaceHeight = Math.min(tank.height * 0.18, 220)
  const surface = context.createLinearGradient(0, 0, 0, surfaceHeight)
  surface.addColorStop(0, `rgba(190, 244, 255, ${0.28 * strength})`)
  surface.addColorStop(1, 'rgba(190, 244, 255, 0)')
  context.fillStyle = surface
  context.fillRect(0, 0, tank.width, surfaceHeight)
}

/**
 * 水面から差し込む光の筋。
 *
 * 1本ずつ台形に塗り、合成方法を `lighter` にして重なりを明るくしている。
 * ぼかしフィルタ（`filter: blur()`）は見た目は良いが、フレームごとに掛けると
 * 大画面で重くなるため使わない。縁を透明にしたグラデーションで代用する。
 */
export function drawLightRays(
  context: CanvasRenderingContext2D,
  rays: readonly LightRay[],
  timeSeconds: number,
  tank: Tank,
  strength: number,
): void {
  if (strength <= 0) return

  context.save()
  context.globalCompositeOperation = 'lighter'

  for (const ray of rays) {
    const shape = rayAt(ray, timeSeconds, tank)
    const alpha = shape.alpha * strength
    if (alpha < 0.003) continue

    // 幅の違う3枚を重ねて、輪郭のない光にする。
    // 1枚だけだと縁がはっきり出て「光の筋」ではなく「白い棒」に見える。
    // blur フィルタなら1枚で済むが、大画面で毎フレーム掛けると重い。
    for (const layer of RAY_LAYERS) {
      // 縦は上が明るく、下へ向かって完全に消える。
      // 画面全体を暗く塗って光を沈める方法だと、水の色まで潰れて下半分が死ぬ。
      const down = context.createLinearGradient(0, 0, 0, tank.height)
      const peak = alpha * layer.alphaScale
      down.addColorStop(0, `rgba(186, 236, 255, ${peak})`)
      down.addColorStop(0.45, `rgba(186, 236, 255, ${peak * 0.34})`)
      down.addColorStop(0.85, 'rgba(186, 236, 255, 0)')
      down.addColorStop(1, 'rgba(186, 236, 255, 0)')

      const top = shape.halfWidth * layer.widthScale
      const bottom = top * 2.1

      context.fillStyle = down
      context.beginPath()
      context.moveTo(shape.topX - top, 0)
      context.lineTo(shape.topX + top, 0)
      context.lineTo(shape.bottomX + bottom, tank.height)
      context.lineTo(shape.bottomX - bottom, tank.height)
      context.closePath()
      context.fill()
    }
  }

  context.restore()
}

/** 光の筋を柔らかく見せるための重ね方。外側ほど広く薄い。 */
const RAY_LAYERS = [
  { widthScale: 2.4, alphaScale: 0.26 },
  { widthScale: 1.35, alphaScale: 0.32 },
  { widthScale: 0.7, alphaScale: 0.34 },
] as const

/**
 * 周辺減光。四隅を沈めて、中央の絵に目が行くようにする。
 * 絵を描く前に掛ける。あとから掛けると端を泳ぐ絵まで暗くなって見えづらい。
 */
export function drawVignette(
  context: CanvasRenderingContext2D,
  tank: Tank,
  strength: number,
): void {
  if (strength <= 0) return

  const radius = Math.hypot(tank.width, tank.height) / 2
  const gradient = context.createRadialGradient(
    tank.width / 2,
    tank.height / 2,
    radius * 0.35,
    tank.width / 2,
    tank.height / 2,
    radius,
  )
  gradient.addColorStop(0, 'rgba(1, 12, 20, 0)')
  gradient.addColorStop(1, `rgba(1, 12, 20, ${0.4 * strength})`)
  context.fillStyle = gradient
  context.fillRect(0, 0, tank.width, tank.height)
}

/** 泡。輪郭を薄く光らせると、ただの丸ではなく泡に見える。 */
export function drawBubbles(
  context: CanvasRenderingContext2D,
  bubbles: readonly Bubble[],
  strength: number,
): void {
  if (strength <= 0) return

  context.save()
  for (const bubble of bubbles) {
    const alpha = bubble.alpha * strength
    const x = bubbleX(bubble)

    context.beginPath()
    context.arc(x, bubble.y, bubble.radius, 0, Math.PI * 2)
    context.fillStyle = `rgba(214, 245, 255, ${alpha * 0.45})`
    context.fill()

    context.lineWidth = Math.max(0.6, bubble.radius * 0.18)
    context.strokeStyle = `rgba(230, 250, 255, ${alpha})`
    context.stroke()
  }
  context.restore()
}
