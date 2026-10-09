/**
 * 背景の星のまたたきと、漂う光の粒。
 *
 * **ここには位置と明るさの計算だけを置く。** 描画は `halloweenScene.ts`。
 * 画面に埋めると「どこを見ればいいか」が分からなくなるので、
 * **どこを暗くするか**（`quietCentre`）もここで決める。
 *
 * **経過秒から直に計算する。** 1フレームぶんずつ足し込むやり方は採らない。
 * フレーム間隔が変わると速さが変わるし、長く動かすと誤差がたまる。
 * 毎フレーム乱数で置き直すのも駄目で、点滅しているように見える。
 */

import { seededRandom } from './random'

export interface Star {
  /** 画面に対する割合（0〜1） */
  readonly x: number
  readonly y: number
  /** 画面の高さに対する半径 */
  readonly radius: number
  /** またたきの位相（秒）。全部が一斉に光らないようにずらす */
  readonly phase: number
  /** またたきの周期（秒） */
  readonly period: number
}

export interface Mote {
  /** 横の基準位置（0〜1）。ここを中心に左右へ揺れる */
  readonly x: number
  /** 上り始める高さのずれ（0〜1）。粒ごとにばらす */
  readonly offset: number
  /** 1秒で上る距離（画面の高さに対する割合） */
  readonly speed: number
  /** 横揺れの幅（画面の幅に対する割合）と周期（秒） */
  readonly swayWidth: number
  readonly swayPeriod: number
  readonly radius: number
  /** 0 なら金、1 なら淡い紫 */
  readonly violet: boolean
}

/** またたきの一番暗いところ。0 にすると消えたり点いたりに見える。 */
const TWINKLE_FLOOR = 0.35

/**
 * 星の明るさ（0〜1）。
 * **正弦波を使う。** 四角い波や乱数だと、ちかちかした点滅になる。
 */
export function twinkle(star: Star, elapsed: number): number {
  const wave = 0.5 + 0.5 * Math.sin(((elapsed + star.phase) / star.period) * Math.PI * 2)
  return TWINKLE_FLOOR + (1 - TWINKLE_FLOOR) * wave
}

/**
 * 月のまわりの光の揺れ（0.9〜1.1）。
 * **月そのものは動かさない。** 大きさや位置を変えると、絵が貼り替わったように見える。
 */
export function moonPulse(elapsed: number, period = 10): number {
  return 1 + 0.1 * Math.sin((elapsed / period) * Math.PI * 2)
}

/** 光の粒が、下から上へ進んだ割合（0〜1）。上まで行ったら下から出直す。 */
export function moteProgress(mote: Mote, elapsed: number): number {
  const raw = mote.offset + elapsed * mote.speed
  return raw - Math.floor(raw)
}

/**
 * 光の粒の濃さ（0〜1）。**端では必ず 0 にする。**
 * 出入りで急に現れたり消えたりすると、画面の縁に線が見える。
 */
export function moteFade(progress: number): number {
  if (progress < 0.15) return progress / 0.15
  if (progress > 0.85) return (1 - progress) / 0.15
  return 1
}

/** 光の粒の横位置（0〜1）。ゆっくり左右へ揺れる。 */
export function moteX(mote: Mote, elapsed: number): number {
  return mote.x + mote.swayWidth * Math.sin(((elapsed + mote.offset * 10) / mote.swayPeriod) * Math.PI * 2)
}

/**
 * **画面の真ん中と月のまわりを暗くするための重み（0〜1）。**
 *
 * 0 が「ここには出さない」、1 が「そのまま出してよい」。
 * 子どもの絵は画面の中ほどを漂うので、そこに光を敷くと**絵を探せなくなる**。
 * 月の上も、もともと明るいので光を足す意味がない。
 */
export function quietCentre(x: number, y: number, moonX = 0.5, moonY = 0.47): number {
  // 画面中央からの距離（0〜1 に正規化。縦横の比をそろえるため y は 0.75 倍）
  const dx = (x - 0.5) / 0.5
  const dy = ((y - 0.5) / 0.5) * 0.75
  const fromCentre = Math.min(1, Math.hypot(dx, dy))
  // 月のまわり。近いほど 0 に落とす
  const toMoon = Math.hypot(x - moonX, (y - moonY) * 0.75) / 0.26
  const awayFromMoon = Math.min(1, toMoon)
  return Math.min(1, fromCentre * fromCentre) * awayFromMoon
}

export function spawnStars(seed: number, count: number): Star[] {
  const random = seededRandom(seed)
  return Array.from({ length: count }, () => ({
    x: random(),
    // 星は空にだけ。地面の上に星があると紙に貼ったように見える
    y: random() * 0.6,
    radius: 0.0016 + random() * 0.0024,
    phase: random() * 5,
    // 2〜5秒。速いと落ち着かず、遅いと止まって見える
    period: 2 + random() * 3,
  }))
}

export function spawnMotes(seed: number, count: number): Mote[] {
  const random = seededRandom(seed)
  return Array.from({ length: count }, () => ({
    x: random(),
    offset: random(),
    // 1920x1080 で毎秒 5〜15px 相当
    speed: (5 + random() * 10) / 1080,
    swayWidth: 0.01 + random() * 0.025,
    swayPeriod: 4 + random() * 5,
    radius: 0.0022 + random() * 0.004,
    // 金が主役。淡い紫は少しだけ混ぜる
    violet: random() < 0.25,
  }))
}
