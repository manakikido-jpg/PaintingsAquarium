import type { Fish, Tank } from './swim'

/**
 * 生き物ごとの動き方。
 *
 * **速度（と、跳ねている間の位置）だけを決める純粋関数**にしてある。
 * 実際に位置を進めるのは `stepFish`。分けておくと、
 * 「画面の外へ出ない」「上下に動く」といった性質をテストで固定できる。
 *
 * 種類が分かるのは台紙に一致した絵だけ（`src/core/templates.ts`）。
 * 一致しなかった絵（自由に描いた絵）は今までどおりの泳ぎにする。
 */

/** サメが追う相手（魚の位置）。 */
export interface Prey {
  readonly x: number
  readonly y: number
}

/* ------------------------------------------------------------------ 数値 */

/** タコ: 上下に往復する周期（秒）と、画面の高さに対する振れ幅。 */
export const TAKO_PERIOD = 5.2
export const TAKO_RISE = 0.18

/** クラゲ: ふわふわの周期（秒）と振れ幅。横はほとんど進まない。 */
export const KURAGE_PERIOD = 7.5
export const KURAGE_RISE = 0.07
export const KURAGE_DRIFT = 0.18

/** ウミガメ: S字の周期（秒）と振れ幅。タコより長く、なめらかに。 */
export const UMIGAME_PERIOD = 8.5
export const UMIGAME_SWING = 0.22

/**
 * イルカ: 跳ねる間隔（秒）と、跳ねている時間。
 * 「20〜30秒に1回・大きく跳ねる」で決めた（2026-08-18）。
 */
export const IRUKA_GAP = [20, 30] as const
export const IRUKA_JUMP_SECONDS = 2.4
/** 跳ねたときに届く高さ（画面の高さに対する割合。0 が画面の上端）。 */
export const IRUKA_TOP = 0.08

/**
 * サメ: 速さの倍率と、切り替えの間隔（秒）。
 * 追いつきはしない。**この距離まで近づいたら減速して離れる**。
 * 会場で「食べられた」に見えると、その絵を描いた子が悲しむ（2026-08-18 決定）。
 */
export const SAME_SPEEDS = [0.6, 1.0, 2.2] as const
export const SAME_SWITCH = [1.5, 4.0] as const
export const SAME_KEEP_AWAY = 1.6

/* ------------------------------------------------------------ 補助の関数 */

/** 種ごとに散らばる 0〜1 の値。同じ種でも個体で違う拍にするために使う。 */
export function jitter(seed: number, salt: number): number {
  const mixed = Math.abs(Math.sin((seed + 1) * 12.9898 + salt * 78.233) * 43758.5453)
  return mixed - Math.floor(mixed)
}

/**
 * 跳ねている途中の、基準の高さからの持ち上がり（0〜1）。
 *
 * 放物線。速度を積み上げるのではなく**時間から直に**出しているのは、
 * フレーム落ちしても跳ぶ高さと着水の時刻が変わらないようにするため。
 */
export function jumpLift(progress: number): number {
  if (progress <= 0 || progress >= 1) return 0
  return 4 * progress * (1 - progress)
}

/** いま跳ねている途中か。 */
export function isJumping(fish: Fish): boolean {
  return fish.jumpFrom !== undefined && fish.age < (fish.jumpUntil ?? 0)
}

/* -------------------------------------------------------------- 本体 */

/**
 * 1フレームぶん、その生き物らしい速度に直す。
 *
 * `prey` は「追う相手」の位置（サメだけが使う）。
 * 位置を直接動かすのは、跳ねている間のイルカだけ。
 */
export function steer(fish: Fish, tank: Tank, prey: readonly Prey[] = []): Fish {
  switch (fish.species) {
    case 'tako':
      return wave(fish, tank, TAKO_PERIOD, TAKO_RISE)
    case 'kurage':
      return drift(fish, tank)
    case 'umigame':
      return wave(fish, tank, UMIGAME_PERIOD, UMIGAME_SWING)
    case 'iruka':
      return leap(fish, tank)
    case 'same':
      return chase(fish, prey)
    default:
      return fish
  }
}

/**
 * 上下に波打ちながら横へ進む（タコ・ウミガメ）。
 *
 * 縦の速度を毎フレーム計算し直す。位置を直接書き換えないのは、
 * 壁で止める処理（`stepFish`）をそのまま効かせるため。
 */
function wave(fish: Fish, tank: Tank, period: number, rise: number): Fish {
  const swing = tank.height * rise
  const omega = (Math.PI * 2) / period
  const vy = Math.cos(fish.age * omega + fish.wavePhase) * omega * swing
  return { ...fish, vy }
}

/** ふわふわ漂う（クラゲ）。横はほとんど進まない。 */
function drift(fish: Fish, tank: Tank): Fish {
  const swing = tank.height * KURAGE_RISE
  const omega = (Math.PI * 2) / KURAGE_PERIOD
  const vy = Math.cos(fish.age * omega + fish.wavePhase) * omega * swing
  const vx = Math.sign(fish.vx || 1) * Math.abs(fish.baseSpeed ?? Math.abs(fish.vx)) * KURAGE_DRIFT
  return { ...fish, vx, vy }
}

/**
 * ときどき跳ねる（イルカ）。
 *
 * 跳ねている間だけ、縦の位置を放物線で置き換える。
 * 横はそのまま進むので、弧を描いて跳ぶ。
 */
function leap(fish: Fish, tank: Tank): Fish {
  const nextAt = fish.nextEventAt ?? 0

  if (isJumping(fish)) {
    const started = (fish.jumpUntil ?? 0) - IRUKA_JUMP_SECONDS
    const progress = (fish.age - started) / IRUKA_JUMP_SECONDS
    const from = fish.jumpFrom ?? fish.y
    const top = tank.height * IRUKA_TOP + fish.height / 2
    const y = from - jumpLift(progress) * Math.max(0, from - top)
    // 跳ねている間は縦の速度を持たせない。位置そのものを決めているため
    return { ...fish, y, vy: 0 }
  }

  if (fish.jumpFrom !== undefined) {
    // 着水した直後。次に跳ぶ時刻を決める
    const [low, high] = IRUKA_GAP
    const wait = low + jitter(fish.wavePhase * 1000, fish.age) * (high - low)
    return { ...fish, jumpFrom: undefined, jumpUntil: undefined, nextEventAt: fish.age + wait, vy: 0 }
  }

  if (fish.age >= nextAt) {
    return { ...fish, jumpFrom: fish.y, jumpUntil: fish.age + IRUKA_JUMP_SECONDS, vy: 0 }
  }

  return fish
}

/**
 * 一番近い相手を追う（サメ）。速さは不規則に変わる。
 *
 * **追いつかない。** 近づきすぎたら減速して向きを外す。
 */
function chase(fish: Fish, prey: readonly Prey[]): Fish {
  const base = fish.baseSpeed ?? Math.hypot(fish.vx, fish.vy) ?? 60

  // 速さの切り替え
  let speedScale = fish.speedScale ?? 1
  let nextEventAt = fish.nextEventAt ?? 0
  if (fish.age >= nextEventAt) {
    const pick = Math.floor(jitter(fish.wavePhase * 100, fish.age) * SAME_SPEEDS.length)
    speedScale = SAME_SPEEDS[Math.min(SAME_SPEEDS.length - 1, pick)]
    const [low, high] = SAME_SWITCH
    nextEventAt = fish.age + low + jitter(fish.wavePhase * 50, fish.age + 1) * (high - low)
  }

  let target: Prey | null = null
  let best = Infinity
  for (const one of prey) {
    const distance = Math.hypot(one.x - fish.x, one.y - fish.y)
    if (distance < best) {
      best = distance
      target = one
    }
  }

  if (!target) {
    // 追う相手がいなければ、速さだけ変えて普通に泳ぐ
    const speed = Math.hypot(fish.vx, fish.vy) || base
    const scale = (base * speedScale) / speed
    return { ...fish, vx: fish.vx * scale, vy: fish.vy * scale, speedScale, nextEventAt }
  }

  const keepAway = fish.width * SAME_KEEP_AWAY
  let dx = target.x - fish.x
  let dy = target.y - fish.y
  const distance = Math.hypot(dx, dy) || 1
  if (distance < keepAway) {
    // 近づきすぎた。向きを外して減速する（追いつかせない）
    dx = -dx
    dy = -dy
    speedScale = Math.min(speedScale, SAME_SPEEDS[0])
  }

  /*
   * 向きは少しずつ寄せる。いきなり向けると、大きな絵が
   * その場でくるっと反転して見える（水中の生き物には見えない）。
   */
  const wanted = { x: (dx / distance) * base * speedScale, y: (dy / distance) * base * speedScale * 0.6 }
  const blend = 0.06
  return {
    ...fish,
    vx: fish.vx + (wanted.x - fish.vx) * blend,
    vy: fish.vy + (wanted.y - fish.vy) * blend,
    speedScale,
    nextEventAt,
  }
}
