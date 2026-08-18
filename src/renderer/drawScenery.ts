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
  /*
   * 明るく鮮やかな青。一度は「高級感＝暗く」と解釈して真っ黒に近づけたが、
   * 狙っている見え方（teamLab のお絵かき水族館）は**逆に明るく彩度の高い青**だった。
   *
   * 明るい背景でも絵が負けないのは、**中央を情報の少ない綺麗な青のまま**に保ち、
   * 色数の多い飾りを画面の下に集めているから。
   * ここを濁らせると、絵と背景がどちらも中途半端になる。
   */
  const gradient = context.createLinearGradient(0, 0, 0, tank.height)
  /*
   * 深く濃い青。参考にした見え方（teamLab のお絵かき水族館）は、
   * **水そのものは彩度の高い群青**で、そこに蛍光色の飾りが浮かんでいる。
   *
   * 前は水色に寄せていた（#1ea2e0）。明るいこと自体は悪くないが、
   * 水が薄いと飾りの色との差が付かず、全体がぼんやりする。
   * 「POP」の正体は明るさではなく、**水の濃さと飾りの鮮やかさの差**だった。
   */
  gradient.addColorStop(0, '#2a7bf0')
  gradient.addColorStop(0.3, '#1a56e0')
  gradient.addColorStop(0.66, '#123ec0')
  gradient.addColorStop(1, '#0d2a92')
  context.fillStyle = gradient
  context.fillRect(0, 0, tank.width, tank.height)

  /*
   * 中央上が明るく、四隅へ向かって落ちる放射状の光。
   *
   * 縦のグラデーションだけだと、**どの高さも横一直線に同じ明るさ**になる。
   * 参考にした見え方では、光が一点から差し込んで四隅が沈んでいて、
   * それが「奥行きのある水の中」に見える理由になっていた。
   * 横方向にも明暗を付けると、同じ色でも空間に見える。
   */
  const glow = context.createRadialGradient(
    tank.width * 0.44,
    tank.height * 0.12,
    tank.height * 0.05,
    tank.width * 0.44,
    tank.height * 0.12,
    tank.height * 1.25,
  )
  glow.addColorStop(0, `rgba(120, 200, 255, ${0.3 * strength})`)
  glow.addColorStop(0.45, `rgba(60, 140, 240, ${0.1 * strength})`)
  glow.addColorStop(1, `rgba(4, 16, 70, ${0.4 * strength})`)
  context.fillStyle = glow
  context.fillRect(0, 0, tank.width, tank.height)

  // 水面の明るい帯。画面の上端が「水の中の上のほう」に見えるようにする。
  const surfaceHeight = Math.min(tank.height * 0.22, 260)
  const surface = context.createLinearGradient(0, 0, 0, surfaceHeight)
  surface.addColorStop(0, `rgba(190, 240, 255, ${0.34 * strength})`)
  surface.addColorStop(1, 'rgba(190, 240, 255, 0)')
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
      /*
       * 上から差し込む光。デフォルメした絵では、光は「そこに光源がある説明」
       * ではなく**飾りそのもの**なので、写実より強く、下まで届かせる。
       * 前は 0.85 の高さで完全に消していたが、それだと上端の帯にしか見えなかった。
       */
      down.addColorStop(0, `rgba(196, 240, 255, ${peak * 1.8})`)
      down.addColorStop(0.4, `rgba(186, 236, 255, ${peak * 0.9})`)
      down.addColorStop(0.75, `rgba(186, 236, 255, ${peak * 0.3})`)
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
/*
 * 揺らぎ模様（コースティクス）を入れたぶん、光の筋は弱めてある。
 * 両方を強く出すと、光の情報が多すぎて絵が埋もれる。
 */
const RAY_LAYERS = [
  { widthScale: 2.6, alphaScale: 0.2 },
  { widthScale: 1.4, alphaScale: 0.24 },
  { widthScale: 0.7, alphaScale: 0.26 },
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
  gradient.addColorStop(0, 'rgba(6, 20, 72, 0)')
  gradient.addColorStop(1, `rgba(6, 20, 72, ${0.3 * strength})`)
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
