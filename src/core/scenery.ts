import type { Tank } from './swim'

/**
 * 水槽の背景（光の筋・泡）の動き。
 *
 * 主役は子どもの絵なので、背景は「見て気持ちがよいが、目を奪わない」ことが条件。
 * ここでは位置と明るさの計算だけを純粋関数で持ち、描き方は画面側に置く。
 * 会場で強すぎたときにスライダーで弱められるよう、明るさは 0〜1 の係数で返す。
 */

/** 決まった種から擬似乱数を作る。会場ごとに背景が変わらないようにするため。 */
function pseudoRandom(seed: number): () => number {
  let state = (seed | 0) || 1
  return () => {
    state = (state * 1664525 + 1013904223) | 0
    return ((state >>> 8) & 0xffffff) / 0x1000000
  }
}

// ---------------------------------------------------------------- 光の筋

export interface LightRay {
  /** 水面（画面上端）での中心 X */
  readonly topX: number
  /** 上端での半幅 */
  readonly halfWidth: number
  /** 下へ向かうときの横ずれ量。斜めに差し込む光を作る */
  readonly tilt: number
  /** 明るさの脈動の位相 */
  readonly phase: number
  readonly phaseSpeed: number
  /** 左右の揺れ幅（ピクセル） */
  readonly swayAmplitude: number
  /** この筋の最大の明るさ（0〜1） */
  readonly strength: number
}

export function spawnRays(seed: number, count: number, tank: Tank): LightRay[] {
  const random = pseudoRandom(seed)
  const rays: LightRay[] = []

  for (let index = 0; index < count; index++) {
    // 等間隔に置いてから少しずらす。完全な乱数だと偏って束になり、
    // 「光の筋」ではなく「明るい塊」に見えてしまう。
    const slot = (index + 0.5) / count
    rays.push({
      topX: tank.width * (slot + (random() - 0.5) * 0.6 / count),
      halfWidth: tank.width * (0.02 + random() * 0.045),
      tilt: tank.width * (0.06 + random() * 0.14) * (random() < 0.5 ? -1 : 1),
      phase: random() * Math.PI * 2,
      phaseSpeed: 0.12 + random() * 0.22,
      swayAmplitude: tank.width * (0.01 + random() * 0.02),
      strength: 0.1 + random() * 0.12,
    })
  }

  return rays
}

export interface RayShape {
  readonly topX: number
  readonly bottomX: number
  readonly halfWidth: number
  /** 0〜1。0 のとき描かない */
  readonly alpha: number
}

/**
 * ある時刻での光の筋の形と明るさ。
 *
 * 明るさは sin をそのまま使わず 0 で下限を切っている。
 * 常時ぼんやり光っているより、たまに強く差してすっと消えるほうが水中らしい。
 */
export function rayAt(ray: LightRay, timeSeconds: number, tank: Tank): RayShape {
  const angle = ray.phase + ray.phaseSpeed * timeSeconds
  const sway = Math.sin(angle * 0.7) * ray.swayAmplitude
  const pulse = Math.max(0, Math.sin(angle))

  return {
    topX: ray.topX + sway,
    bottomX: ray.topX + sway + ray.tilt,
    halfWidth: ray.halfWidth,
    alpha: ray.strength * pulse * (tank.height > 0 ? 1 : 0),
  }
}

// ---------------------------------------------------------------- 泡

export interface Bubble {
  readonly x: number
  readonly y: number
  readonly radius: number
  /** 上昇の速さ（ピクセル/秒）。正の値 */
  readonly speed: number
  readonly wobblePhase: number
  readonly wobbleSpeed: number
  readonly wobbleAmplitude: number
  readonly alpha: number
}

export interface SpawnBubblesOptions {
  readonly minRadius?: number
  readonly maxRadius?: number
  readonly minSpeed?: number
  readonly maxSpeed?: number
  readonly maxAlpha?: number
}

export function spawnBubbles(
  seed: number,
  count: number,
  tank: Tank,
  {
    minRadius = 2,
    maxRadius = 7,
    minSpeed = 12,
    maxSpeed = 40,
    maxAlpha = 0.22,
  }: SpawnBubblesOptions = {},
): Bubble[] {
  const random = pseudoRandom(seed)
  const bubbles: Bubble[] = []

  for (let index = 0; index < count; index++) {
    const size = random()
    bubbles.push({
      x: random() * tank.width,
      // 最初から全体に散らばらせる。下端から一斉に湧くと噴水に見える。
      y: random() * tank.height,
      radius: minRadius + size * (maxRadius - minRadius),
      // 大きい泡ほど速く上がる。水中の見え方に合わせている。
      speed: minSpeed + size * (maxSpeed - minSpeed),
      wobblePhase: random() * Math.PI * 2,
      wobbleSpeed: 0.6 + random() * 1.4,
      wobbleAmplitude: 3 + random() * 9,
      alpha: maxAlpha * (0.4 + random() * 0.6),
    })
  }

  return bubbles
}

/** 描画に使う実際の X。左右のゆらぎを足したもの。 */
export function bubbleX(bubble: Bubble): number {
  return bubble.x + Math.sin(bubble.wobblePhase) * bubble.wobbleAmplitude
}

/**
 * 泡を 1 フレーム分だけ上へ動かす。上端を抜けたら下から出し直す。
 *
 * 出し直すとき X をずらしているのは、同じ列を延々と昇り続けると
 * 「泡の柱」に見えてしまうため。乱数を使わずに散らすため、
 * 黄金角に近い量だけ横へ送っている。
 */
export function stepBubble(bubble: Bubble, dtSeconds: number, tank: Tank): Bubble {
  const dt = Math.max(0, dtSeconds)
  const wobblePhase = bubble.wobblePhase + bubble.wobbleSpeed * dt
  const y = bubble.y - bubble.speed * dt

  if (y + bubble.radius < 0) {
    const width = tank.width > 0 ? tank.width : 1
    return {
      ...bubble,
      x: (bubble.x + width * 0.381966) % width,
      y: tank.height + bubble.radius,
      wobblePhase,
    }
  }

  return { ...bubble, y, wobblePhase }
}
