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
import type { Tank } from '../../core/swim'
import type { Scene } from './types'

const RAY_COUNT = 7
// 手前の泡は絵に重なるので少なく、奥は多めに。奥行きを出すため。
const BACK_BUBBLE_COUNT = 34
const FRONT_BUBBLE_COUNT = 10
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

  let backBubbles: Bubble[] = spawnBubbles(1207, BACK_BUBBLE_COUNT, tank, { maxAlpha: 0.2 })
  let frontBubbles: Bubble[] = spawnBubbles(9931, FRONT_BUBBLE_COUNT, tank, {
    minRadius: 5,
    maxRadius: 13,
    minSpeed: 26,
    maxSpeed: 62,
    maxAlpha: 0.14,
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

    drawFront(context, _elapsed, strength) {
      drawBubbles(context, frontBubbles, strength)
    },
  }
}
