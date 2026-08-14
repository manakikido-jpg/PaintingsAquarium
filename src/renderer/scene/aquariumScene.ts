import {
  sandProfile,
  shipwreckSpan,
  spawnRocks,
  spawnSeaweed,
  spawnShells,
  spawnShipwreck,
  type Rock,
  type Seaweed,
} from '../../core/decor'
import { spawnBubbles, spawnRays, stepBubble, type Bubble } from '../../core/scenery'
import { drawBubbles, drawLightRays, drawVignette, drawWater } from '../drawScenery'
import {
  drawRocks,
  drawSand,
  drawSeaweed,
  drawShells,
  drawShipwreck,
  FAR_STYLE,
  MID_STYLE,
  NEAR_STYLE,
} from '../drawDecor'
import { createCausticsLayer } from '../drawCaustics'
import { bakeLayer, type BakedLayer } from '../bake'
import type { Tank } from '../../core/swim'
import type { Scene } from './types'

const RAY_COUNT = 7
// 手前の泡は絵に重なるので少なく、奥は多めに。奥行きを出すため。
const BACK_BUBBLE_COUNT = 26
const FRONT_BUBBLE_COUNT = 8
const ROCK_COUNT = 9
const SHELL_COUNT = 5
// 「株」の数。1 株から数枚の葉が生える。
const SEAWEED_COUNT = 10

/** 水族館。絵は水中を自由に泳ぐので、奥行きの列は持たない。 */
export function createAquariumScene(tank: Tank): Scene {
  const rays = spawnRays(20260812, RAY_COUNT, tank)
  const sand = sandProfile(4471, tank)
  const wreck = spawnShipwreck(tank)
  // 沈没船の前には生やさない。重ねると輪郭が消えて塊になる（R-006）。
  const wreckSpan = shipwreckSpan(wreck, tank)
  const allRocks = spawnRocks(8823, ROCK_COUNT, tank, wreckSpan)
  const allSeaweed = spawnSeaweed(5507, SEAWEED_COUNT, tank, wreckSpan)
  const shells = spawnShells(6619, SHELL_COUNT, tank)

  /*
   * 飾りを奥行きで3つに分ける。
   * 全部を同じ濃さ・同じ鮮明さで描くと、切り絵を並べたように安く見える（R-011）。
   * 奥ほど薄く、水の色に寄せ、強くぼかす。
   */
  const pick = <T extends { depth: number }>(items: readonly T[], from: number, to: number): T[] =>
    items.filter((item) => item.depth >= from && item.depth < to)

  const farRocks: Rock[] = pick(allRocks, 0, 0.4)
  const midRocks: Rock[] = pick(allRocks, 0.4, 0.72)
  const nearRocks: Rock[] = pick(allRocks, 0.72, 1.01)
  const farSeaweed: Seaweed[] = pick(allSeaweed, 0, 0.45)
  const nearSeaweed: Seaweed[] = pick(allSeaweed, 0.45, 1.01)

  /*
   * 遠景と中景は動かないので、起動時に 1 回だけ焼いておく。
   * ぼかしは毎フレーム掛けると大画面で重いが、焼いてしまえば費用はほぼゼロ。
   * 遠くの海藻は揺れを止めて焼いている。遠いものの揺れは見て分からないうえ、
   * 揺らすためだけに毎フレームぼかすのは割に合わない。
   */
  const farLayer: BakedLayer | null = bakeLayer(
    tank,
    (context) => {
      drawShipwreck(context, wreck, sand, tank, 1, FAR_STYLE)
      drawSeaweed(context, farSeaweed, sand, tank, 0, 1, FAR_STYLE)
      drawRocks(context, farRocks, sand, tank, 1, FAR_STYLE)
    },
    // ぼかしすぎると帆柱のような細い物が消える。効き目と消失の境目はここ。
    { blur: Math.max(3, tank.width * 0.0032), resolution: 0.7 },
  )

  const midLayer: BakedLayer | null = bakeLayer(
    tank,
    (context) => {
      drawRocks(context, midRocks, sand, tank, 1, MID_STYLE)
      drawShells(context, shells, sand, tank, 1, MID_STYLE)
    },
    { blur: Math.max(1.5, tank.width * 0.002), resolution: 0.8 },
  )

  let backBubbles: Bubble[] = spawnBubbles(1207, BACK_BUBBLE_COUNT, tank, {
    maxAlpha: 0.14,
    minSpeed: 8,
    maxSpeed: 26,
  })
  let frontBubbles: Bubble[] = spawnBubbles(9931, FRONT_BUBBLE_COUNT, tank, {
    minRadius: 5,
    maxRadius: 13,
    minSpeed: 18,
    maxSpeed: 44,
    maxAlpha: 0.1,
  })

  /*
   * 揺らぎ模様は2枚重ねる。
   * 大きくゆっくりの層（水面の近く）と、細かく速い層（もう少し深いところ）。
   * 1枚だけだと模様の繰り返しが目につき、壁紙のように見える。
   *
   * 最初はもっと速く濃くしていたが、**動きが大げさで、水面ではなく
   * 揺れる幕に見えた**。水は思っているよりゆっくり動く。
   * 深いところほど弱くして、下半分は静かに保つ。
   */
  const causticsFar = createCausticsLayer(tank, {
    resolution: 640,
    scale: 15,
    speed: 0.1,
    sharpness: 8,
    topBias: 0.72,
    intensity: 0.26,
    tint: [112, 194, 232],
  })
  const causticsNear = createCausticsLayer(tank, {
    resolution: 520,
    scale: 29,
    speed: 0.16,
    sharpness: 13,
    topBias: 0.86,
    intensity: 0.12,
    tint: [168, 236, 255],
  })

  let lastElapsed = 0

  return {
    motion: 'float',
    lanes: [],

    drawBehind(context, elapsed, strength) {
      // 泡を進めるのは背景の描画時に 1 回だけ。手前と奥で 2 回進めると倍速になる。
      const dt = Math.min(0.05, Math.max(0, elapsed - lastElapsed))
      lastElapsed = elapsed
      backBubbles = backBubbles.map((bubble) => stepBubble(bubble, dt, tank))
      frontBubbles = frontBubbles.map((bubble) => stepBubble(bubble, dt, tank))

      drawWater(context, tank, strength)
      // 揺らぎ模様は水のすぐ上。装飾より先に敷いて、底の岩や船にも光が乗るようにする。
      causticsFar.draw(context, elapsed, strength)
      causticsNear.draw(context, elapsed * 1.13, strength)
      drawLightRays(context, rays, elapsed, tank, strength)

      drawSand(context, sand, tank, strength)
      farLayer?.draw(context, tank, strength)
      midLayer?.draw(context, tank, strength)
      /*
       * 手前だけは動かす。揺れているものが1つあるだけで、静止画に見えなくなる。
       *
       * ここを `filter: blur()` で柔らかくしようとして**失敗した**（R-012）。
       * 画面の下 1/4 だけの狭い範囲なら安いだろうと思ったが、実測で
       * **13.7fps → 1.8fps**。毎フレームのぼかしは範囲に関係なく使えない。
       * 代わりに、少し大きい同じ形を薄く後ろへ敷いて輪郭をぼかしている
       *（`drawDecor` の halo）。こちらは塗りが1回増えるだけで費用は無視できる。
       */
      drawSeaweed(context, nearSeaweed, sand, tank, elapsed, strength, NEAR_STYLE)
      drawRocks(context, nearRocks, sand, tank, strength, NEAR_STYLE)

      drawVignette(context, tank, strength)
      drawBubbles(context, backBubbles, strength)
    },

    drawLane() {
      // 列を持たないテーマなので何もしない
    },

    /**
     * 絵の後ろに置く淡い光。
     * 背景を深く沈めたぶん、絵の輪郭が闇に溶けやすい。
     * 後ろから薄く照らすと、絵そのものの色を変えずに浮かび上がる。
     */
    drawBeneath(context, place, _laneIndex, strength) {
      const radius = Math.max(place.width, place.height) * 0.85
      const glow = context.createRadialGradient(place.x, place.y, 0, place.x, place.y, radius)
      glow.addColorStop(0, `rgba(126, 214, 255, ${0.16 + 0.06 * strength})`)
      glow.addColorStop(0.55, `rgba(96, 176, 220, ${0.06 + 0.03 * strength})`)
      glow.addColorStop(1, 'rgba(96, 176, 220, 0)')

      context.save()
      context.globalCompositeOperation = 'lighter'
      context.fillStyle = glow
      context.beginPath()
      context.arc(place.x, place.y, radius, 0, Math.PI * 2)
      context.fill()
      context.restore()
    },

    drawFront(context, _elapsed, strength) {
      drawBubbles(context, frontBubbles, strength)
    },
  }
}
