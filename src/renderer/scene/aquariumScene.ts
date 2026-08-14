import {
  sandProfile,
  shipwreckSpan,
  spawnRocks,
  spawnSeaweed,
  spawnShells,
  spawnShipwreck,
} from '../../core/decor'
import { spawnBubbles, spawnRays, stepBubble, type Bubble } from '../../core/scenery'
import { drawBubbles, drawLightRays, drawVignette, drawWater } from '../drawScenery'
import { drawRocks, drawSand, drawSeaweed, drawShells, drawShipwreck } from '../drawDecor'
import { createCausticsLayer } from '../drawCaustics'
import type { Tank } from '../../core/swim'
import type { Scene } from './types'

const RAY_COUNT = 7
// 手前の泡は絵に重なるので少なく、奥は多めに。奥行きを出すため。
const BACK_BUBBLE_COUNT = 26
const FRONT_BUBBLE_COUNT = 8
const ROCK_COUNT = 6
const SHELL_COUNT = 5
// 「株」の数。1 株から数枚の葉が生える。
const SEAWEED_COUNT = 8

/** 水族館。絵は水中を自由に泳ぐので、奥行きの列は持たない。 */
export function createAquariumScene(tank: Tank): Scene {
  const rays = spawnRays(20260812, RAY_COUNT, tank)
  const sand = sandProfile(4471, tank)
  const wreck = spawnShipwreck(tank)
  // 沈没船の前には生やさない。重ねると輪郭が消えて塊になる（R-006）。
  const wreckSpan = shipwreckSpan(wreck, tank)
  const rocks = spawnRocks(8823, ROCK_COUNT, tank, wreckSpan)
  const seaweed = spawnSeaweed(5507, SEAWEED_COUNT, tank, wreckSpan)
  const shells = spawnShells(6619, SHELL_COUNT, tank)

  let backBubbles: Bubble[] = spawnBubbles(1207, BACK_BUBBLE_COUNT, tank, { maxAlpha: 0.14, minSpeed: 8, maxSpeed: 26 })
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
   */
  const causticsFar = createCausticsLayer(tank, {
    resolution: 480,
    // 大きくゆっくりの層。細かくしすぎると画面がざわつき、絵より模様に目が行く。
    scale: 16,
    speed: 0.22,
    sharpness: 9,
    topBias: 0.4,
    intensity: 0.36,
    tint: [116, 200, 238],
  })
  const causticsNear = createCausticsLayer(tank, {
    resolution: 420,
    // 細かく速い層。薄く重ねて奥行きを出すだけで、単体では目立たせない。
    scale: 31,
    speed: 0.38,
    sharpness: 14,
    topBias: 0.65,
    intensity: 0.2,
    tint: [170, 240, 255],
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
      drawShipwreck(context, wreck, sand, tank, strength)
      drawShells(context, shells, sand, tank, strength)
      drawSeaweed(context, seaweed, sand, tank, elapsed, strength)
      drawRocks(context, rocks, sand, tank, strength)
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
