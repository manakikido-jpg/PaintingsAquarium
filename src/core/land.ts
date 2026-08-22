/*
 * 2026-08-22 追記: 恐竜テーマをパーツ画像で作り直したので、
 * いま使っているのは `ridgeProfile`（遠景の丘）だけ。
 * 火山・倒木は画像に置き換わった（`assets/decor/dinosaur/`）。
 * 図形で描く方式に戻すときのために残してある。
 */
import type { Point, Span } from './decor'
import { placeOutside } from './decor'
import type { Tank } from './swim'
import { seededRandom } from './random'

/**
 * 陸の風景（恐竜テーマ）の形。
 * 水中側と同じく、形の計算だけを持ち、色と描き方は画面側に置く。
 */


// ---------------------------------------------------------------- 遠景の山

/**
 * 山並みの稜線。左端から右端まで `samples` 点ぶん返す。
 *
 * 砂地（`sandProfile`）と同じく波を足して作るが、山は**尖っていないと山に見えない**。
 * sin をそのまま使うと丸い丘になるので、絶対値を取って谷を折り返し、
 * 尖った峰を作っている。
 */
export function ridgeProfile(
  seed: number,
  tank: Tank,
  {
    samples = 64,
    baseRatio = 0.62,
    heightRatio = 0.12,
    peaks = 3.5,
  }: { samples?: number; baseRatio?: number; heightRatio?: number; peaks?: number } = {},
): number[] {
  const random = seededRandom(seed)
  const waves = [
    { count: peaks, size: 1, phase: random() * Math.PI * 2 },
    { count: peaks * 2.3, size: 0.42, phase: random() * Math.PI * 2 },
    { count: peaks * 5.1, size: 0.16, phase: random() * Math.PI * 2 },
  ]

  const base = tank.height * baseRatio
  const amplitude = tank.height * heightRatio
  const points: number[] = []

  for (let index = 0; index < samples; index++) {
    const t = samples === 1 ? 0 : index / (samples - 1)
    let height = 0
    for (const wave of waves) {
      height += Math.abs(Math.sin(t * Math.PI * wave.count + wave.phase)) * wave.size
    }
    points.push(base - (height / 1.58) * amplitude)
  }

  return points
}

// ---------------------------------------------------------------- 火山

export interface Volcano {
  readonly x: number
  readonly halfWidth: number
  readonly height: number
  /** 火口の幅（半幅に対する割合） */
  readonly craterRatio: number
}

export function spawnVolcano(tank: Tank, at = 0.24): Volcano {
  return {
    x: tank.width * at,
    halfWidth: tank.width * 0.16,
    height: tank.height * 0.3,
    craterRatio: 0.22,
  }
}

/** 火山の輪郭。頂上は平らに切れていて、そこが火口。 */
export function volcanoOutline(volcano: Volcano, baseY: number): Point[] {
  const craterHalf = volcano.halfWidth * volcano.craterRatio
  const top = baseY - volcano.height

  return [
    { x: volcano.x - volcano.halfWidth, y: baseY },
    // 裾は緩く、頂上に近づくほど急にする。直線1本だと三角錐の置物に見える。
    { x: volcano.x - volcano.halfWidth * 0.52, y: baseY - volcano.height * 0.55 },
    { x: volcano.x - craterHalf, y: top },
    { x: volcano.x + craterHalf * 0.7, y: top + volcano.height * 0.03 },
    { x: volcano.x + volcano.halfWidth * 0.58, y: baseY - volcano.height * 0.5 },
    { x: volcano.x + volcano.halfWidth, y: baseY },
  ]
}

export interface SmokePuff {
  readonly x: number
  readonly y: number
  readonly radius: number
  /** 0〜1 */
  readonly alpha: number
}

/**
 * 火口から上がる煙。
 *
 * 上がるほど大きく薄くなる。粒ごとに寿命をずらして、
 * 「一斉に湧いて一斉に消える」のを避けている。
 */
export function smokePuffs(
  volcano: Volcano,
  timeSeconds: number,
  count = 7,
  { rise = 0.9, drift = 0.35, lifeSeconds = 9 }: { rise?: number; drift?: number; lifeSeconds?: number } = {},
): SmokePuff[] {
  const top = volcano.height
  const puffs: SmokePuff[] = []

  for (let index = 0; index < count; index++) {
    const offset = (index / count) * lifeSeconds
    const age = ((timeSeconds + offset) % lifeSeconds) / lifeSeconds

    puffs.push({
      x: volcano.x + Math.sin(age * 3 + index) * volcano.halfWidth * drift * age,
      y: -top * rise * age,
      radius: volcano.halfWidth * (0.1 + age * 0.42),
      // 出はじめと消えぎわを薄くする。急に現れると煙に見えない。
      alpha: Math.sin(age * Math.PI) * 0.5,
    })
  }

  return puffs
}

// ---------------------------------------------------------------- 倒木

export interface FallenLog {
  readonly x: number
  readonly width: number
  readonly thickness: number
  readonly tilt: number
  readonly seed: number
}

export function spawnLogs(seed: number, count: number, tank: Tank, avoid?: Span): FallenLog[] {
  const random = seededRandom(seed)
  const logs: FallenLog[] = []

  for (let index = 0; index < count; index++) {
    const slot = (index + 0.5) / count + (random() - 0.5) * 0.7 / count
    logs.push({
      x: tank.width * placeOutside(slot, avoid),
      width: tank.width * (0.07 + random() * 0.07),
      thickness: tank.height * (0.012 + random() * 0.012),
      tilt: (random() - 0.5) * 0.34,
      seed: Math.floor(random() * 100000) + 1,
    })
  }

  return logs
}

function rotateAround(point: Point, origin: Point, angle: number): Point {
  const sin = Math.sin(angle)
  const cos = Math.cos(angle)
  const dx = point.x - origin.x
  const dy = point.y - origin.y
  return { x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos }
}

/**
 * 倒木の輪郭。まっすぐな長方形にすると角材にしか見えないので、
 * 上面を少し波打たせ、両端の太さも変えている。
 */
export function logOutline(log: FallenLog, groundY: number, steps = 12): Point[] {
  const random = seededRandom(log.seed)
  const bumps = Array.from({ length: steps + 1 }, () => 0.85 + random() * 0.3)
  const pivot: Point = { x: log.x, y: groundY }
  const top: Point[] = []
  const bottom: Point[] = []

  for (let index = 0; index <= steps; index++) {
    const t = index / steps
    const x = log.x - log.width / 2 + log.width * t
    // 両端を細くする。同じ太さのままだと切りっぱなしの角材に見える。
    const taper = 0.6 + 0.4 * Math.sin(t * Math.PI)
    const half = (log.thickness / 2) * taper * bumps[index]
    top.push(rotateAround({ x, y: groundY - half }, pivot, log.tilt))
    bottom.push(rotateAround({ x, y: groundY + half * 0.4 }, pivot, log.tilt))
  }

  return [...top, ...bottom.reverse()]
}

export interface LogBranch {
  readonly from: Point
  readonly to: Point
  readonly width: number
}

/** 折れた枝。2 本あるだけで「角材」から「倒木」になる。 */
export function logBranches(log: FallenLog, groundY: number): LogBranch[] {
  const pivot: Point = { x: log.x, y: groundY }
  const place = (dx: number, dy: number): Point =>
    rotateAround({ x: log.x + log.width * dx, y: groundY + log.thickness * dy }, pivot, log.tilt)

  return [
    { from: place(-0.18, -0.3), to: place(-0.3, -2.1), width: log.thickness * 0.22 },
    { from: place(0.22, -0.3), to: place(0.38, -1.4), width: log.thickness * 0.18 },
  ]
}
