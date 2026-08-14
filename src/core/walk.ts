import type { Tank } from './swim'
import { seededRandom } from './random'

/**
 * 地面の上を歩く動き（恐竜テーマ）。
 *
 * 泳ぐ動き（`swim.ts`）をそのまま使うと、恐竜が空中を漂って作りかけに見える。
 * かといって地面を1本にすると、**50匹が横一列に詰まって重なる**。
 * 泳ぐ側の避け合い（F-308）は上下に逃がすことで効いているので、
 * 地面に貼り付いた瞬間に効かなくなるため。
 *
 * そこで奥行きのある列（レーン）を数本持ち、絵をどれかに割り振る。
 * 奥の列ほど小さく、画面の上のほうに置く。
 */

export interface Lane {
  /** この列の地面の高さ */
  readonly groundY: number
  /** この列に置く絵の大きさの倍率。奥ほど小さい */
  readonly scale: number
  /** 0（一番奥）〜1（一番手前） */
  readonly depth: number
}

export interface MakeLanesOptions {
  /** 一番奥の地面の位置（画面の高さに対する割合） */
  readonly backRatio?: number
  /** 一番手前の地面の位置 */
  readonly frontRatio?: number
  readonly minScale?: number
  readonly maxScale?: number
}

export function makeLanes(
  tank: Tank,
  count: number,
  { backRatio = 0.6, frontRatio = 0.97, minScale = 0.5, maxScale = 1 }: MakeLanesOptions = {},
): Lane[] {
  if (count <= 0) return []
  if (count === 1) {
    return [{ groundY: tank.height * frontRatio, scale: maxScale, depth: 1 }]
  }

  return Array.from({ length: count }, (_, index) => {
    const depth = index / (count - 1)
    return {
      groundY: tank.height * (backRatio + (frontRatio - backRatio) * depth),
      scale: minScale + (maxScale - minScale) * depth,
      depth,
    }
  })
}

export interface Walker {
  readonly x: number
  readonly vx: number
  /** 何番目の列にいるか */
  readonly lane: number
  readonly width: number
  readonly height: number
  /** 歩く上下の弾みの位相 */
  readonly stepPhase: number
  readonly stepSpeed: number
  /** 弾む高さ（ピクセル） */
  readonly bounce: number
  /**
   * 壁の手前どれだけで折り返すか（ピクセル）。
   * 全員が画面の端ちょうどで折り返すと、端に何匹も集まって固まる。
   */
  readonly turnMargin: number
  /**
   * 列の中での前後のずれ（ピクセル）。
   * これが無いと、同じ列の絵が完全に同じ高さに並び、
   * すれ違うときに「ぶつかっている」ようにしか見えない。
   */
  readonly groundOffset: number
}


export interface SpawnWalkerOptions {
  readonly targetSize?: number
  readonly minSpeed?: number
  readonly maxSpeed?: number
}

export function spawnWalker(
  seed: number,
  tank: Tank,
  lanes: readonly Lane[],
  imageWidth: number,
  imageHeight: number,
  { targetSize = 200, minSpeed = 22, maxSpeed = 62 }: SpawnWalkerOptions = {},
): Walker {
  const random = seededRandom(seed)
  const laneIndex = lanes.length === 0 ? 0 : Math.min(lanes.length - 1, Math.floor(random() * lanes.length))
  const lane = lanes[laneIndex]
  const scale = lane ? lane.scale : 1
  const spacing =
    lanes.length > 1 ? Math.abs(lanes[1].groundY - lanes[0].groundY) : tank.height * 0.05

  const longestSide = Math.max(imageWidth, imageHeight, 1)
  const size = (targetSize * scale) / longestSide
  const width = Math.max(1, imageWidth * size)
  const height = Math.max(1, imageHeight * size)

  // 奥の列ほどゆっくりに見せる。同じ速さだと遠近が壊れる。
  const speed = (minSpeed + random() * (maxSpeed - minSpeed)) * scale
  const marginX = Math.min(width / 2, tank.width / 2)

  return {
    x: marginX + random() * Math.max(0, tank.width - marginX * 2),
    vx: random() < 0.5 ? speed : -speed,
    lane: laneIndex,
    width,
    height,
    stepPhase: random() * Math.PI * 2,
    stepSpeed: 3 + random() * 2.5,
    bounce: height * (0.02 + random() * 0.03),
    turnMargin: random() * tank.width * 0.14,
    groundOffset: (random() - 0.5) * spacing * 0.5,
  }
}

export function stepWalker(walker: Walker, dtSeconds: number, tank: Tank): Walker {
  const dt = Math.max(0, dtSeconds)
  let x = walker.x + walker.vx * dt
  let vx = walker.vx

  const halfWidth = walker.width / 2
  // 端ちょうどではなく、1匹ずつ違う手前で折り返す。
  const edge = halfWidth + walker.turnMargin
  const minX = Math.min(edge, tank.width / 2)
  const maxX = Math.max(tank.width - edge, tank.width / 2)

  if (x < minX) {
    x = minX
    vx = Math.abs(vx)
  } else if (x > maxX) {
    x = maxX
    vx = -Math.abs(vx)
  }

  return { ...walker, x, vx, stepPhase: walker.stepPhase + walker.stepSpeed * dt }
}

/** 描画に使う Y（中心）。足が地面につき、歩くたびに少し弾む。 */
export function walkerY(walker: Walker, lanes: readonly Lane[]): number {
  const lane = lanes[walker.lane] ?? lanes[lanes.length - 1]
  const groundY = (lane ? lane.groundY : 0) + walker.groundOffset
  return groundY - walker.height / 2 - Math.abs(Math.sin(walker.stepPhase)) * walker.bounce
}

/**
 * 同じ列で**同じ向きに並走している**組の、後ろの1匹を引き返させる。
 *
 * 最初は「近づいたら互いに反対を向く」ようにしたが、**逆効果だった**。
 * 1 列に入れる数には限りがあり（画面幅 ÷ 絵の幅）、すれ違いを禁止すると
 * 渋滞して重なりが増える。実測で 77.5 組 → 132.8 組に悪化した（R-007）。
 *
 * 本当に困るのは「すれ違い」ではなく「並走」。
 * 向かい合う 2 匹は放っておいても離れるが、同じ向き・近い速さの 2 匹は
 * 重なったまま永久に離れない。それだけを崩す。
 *
 * 引き返させると向きが逆になるので、次のフレームでは条件に当たらない。
 * 毎フレーム反転してぶるぶる震える、ということが起きない。
 */
export function separateWalkers(
  walkers: readonly Walker[],
  { range = 0.9 }: { range?: number } = {},
): Walker[] {
  if (walkers.length < 2) return [...walkers]
  const next = [...walkers]

  for (let a = 0; a < next.length; a++) {
    for (let b = a + 1; b < next.length; b++) {
      if (next[a].lane !== next[b].lane) continue
      if (Math.sign(next[a].vx) !== Math.sign(next[b].vx)) continue

      const limit = ((next[a].width + next[b].width) / 2) * range
      const gap = next[b].x - next[a].x
      if (Math.abs(gap) >= limit) continue

      // 進む向きから見て後ろにいるほうが引き返す。
      // 完全に重なったときは並び順で決める（乱数を使うと再現できなくなる）。
      const bIsRight = gap === 0 ? b > a : gap > 0
      const goingRight = next[a].vx >= 0
      const behind = goingRight ? (bIsRight ? a : b) : bIsRight ? b : a

      next[behind] = { ...next[behind], vx: -next[behind].vx }
    }
  }

  return next
}
