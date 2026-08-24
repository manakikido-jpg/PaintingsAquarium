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

/**
 * 種類ごとの「画面を横切るのにかける秒数」。速さはここから決める。
 *
 * ピクセル毎秒で書かないのは、画面の大きさが会場ごとに違うため。
 * **横切る時間**なら、どの画面でも同じ速さに見える。
 */
export const CROSS_SECONDS: Record<string, readonly [number, number]> = {
  fish: [20, 30],
  iruka: [16, 24],
  same: [20, 30],
  umigame: [40, 55],
  tako: [50, 70],
  // ほとんど流されるだけ。横切るのに3分以上かかる
  kurage: [80, 140],
  // 空を滑るので、地面の恐竜より速い
  pteranodon: [14, 22],
}

/** その種類の速さ（ピクセル毎秒）。 */
export function speedRange(
  tankWidth: number,
  species?: string,
): { minSpeed: number; maxSpeed: number } | null {
  const cross = species ? CROSS_SECONDS[species] : undefined
  if (!cross) return null
  return { minSpeed: tankWidth / cross[1], maxSpeed: tankWidth / cross[0] }
}

/** サメが追う相手（魚の位置）。 */
export interface Prey {
  readonly x: number
  readonly y: number
}

/* ------------------------------------------------------------------ 数値 */

/**
 * タコ・ウミガメの波。**時間ではなく「横に進んだ距離」で決める**。
 *
 * 周期（秒）で決めていたときは、縦の速さが横の速さと無関係になり、
 * **タコは縦が横の5倍・ウミガメは3.6倍**で飛び跳ねていた（実測）。
 * 距離で決めれば、速さが変わっても道の形は変わらない。
 *
 * `amplitude` は画面の高さに対する山の高さ、`wavelength` は画面の幅に対する
 * 山ひとつぶんの長さ。傾きは `2π×amplitude×高さ ÷ (wavelength×幅)` で決まる。
 */
export const TAKO_WAVE = { amplitude: 0.13, wavelength: 0.35 } as const
export const UMIGAME_WAVE = { amplitude: 0.1, wavelength: 0.5 } as const

/**
 * クラゲ: ふわふわの周期（秒）と振れ幅。
 * こちらは横にほとんど進まないので、時間で決めるほうが自然。
 */
export const KURAGE_PERIOD = 9
export const KURAGE_RISE = 0.045

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
/**
 * 速さの選び方を、追う相手までの距離で変える。
 *
 * 完全な乱数だと「たまたま速い／遅い」だけで、**追いかけているように見えない**。
 * 遠くに見つけたら突進し、近づいたら緩める。これで動きに理由がつく。
 * 境目は絵の幅の何倍か。
 */
export const SAME_DASH_FROM = 3
export const SAME_DASH_SPEEDS = [1.0, 2.2, 2.2] as const
export const SAME_NEAR_SPEEDS = [0.6, 1.0] as const
export const SAME_SWITCH = [1.5, 4.0] as const
/**
 * これより近づいたら追うのをやめる（絵の幅に対する倍率）。
 *
 * 1.6 にしていたときは、**近づいた瞬間に逃げては戻るを繰り返して
 * その場で往復していた**（実測: 30秒間、距離が縮まらない）。
 * 追いかけているように見せるには、**ぶつかる直前まで詰めてよい**。
 */
export const SAME_KEEP_AWAY = 0.7
/** すれ違ったあと、追わずに直進する秒数。すぐ追い直すと粘着して見える。 */
export const SAME_PASS_SECONDS = 3

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
      return wave(fish, tank, TAKO_WAVE)
    case 'kurage':
      return drift(fish, tank)
    case 'umigame':
      return wave(fish, tank, UMIGAME_WAVE)
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
 * **縦の速さを、横の速さに掛けて出す。** こうすると「道の形」が決まり、
 * 速い個体も遅い個体も同じ形の波を描く。
 * 位置を直接書き換えないのは、壁で止める処理（`stepFish`）を効かせるため。
 */
function wave(fish: Fish, tank: Tank, shape: { amplitude: number; wavelength: number }): Fish {
  const height = tank.height * shape.amplitude
  const length = Math.max(1, tank.width * shape.wavelength)
  const k = (Math.PI * 2) / length
  const vy = height * k * fish.vx * Math.cos(k * fish.x + fish.wavePhase)
  return { ...fish, vy }
}

/** ふわふわ漂う（クラゲ）。横はほとんど進まない。 */
function drift(fish: Fish, tank: Tank): Fish {
  const swing = tank.height * KURAGE_RISE
  const omega = (Math.PI * 2) / KURAGE_PERIOD
  const vy = Math.cos(fish.age * omega + fish.wavePhase) * omega * swing
  return { ...fish, vy }
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

  // 一番近い相手を先に決める。速さの選び方が距離で変わるため
  let target: Prey | null = null
  let best = Infinity
  for (const one of prey) {
    const distance = Math.hypot(one.x - fish.x, one.y - fish.y)
    if (distance < best) {
      best = distance
      target = one
    }
  }
  const chasing = target !== null && fish.age >= (fish.ignoreUntil ?? 0)

  // 速さの切り替え
  let speedScale = fish.speedScale ?? 1
  let nextEventAt = fish.nextEventAt ?? 0
  if (fish.age >= nextEventAt) {
    const far = chasing && best > fish.width * SAME_DASH_FROM
    const choices = !chasing ? SAME_SPEEDS : far ? SAME_DASH_SPEEDS : SAME_NEAR_SPEEDS
    const pick = Math.floor(jitter(fish.wavePhase * 100, fish.age) * choices.length)
    speedScale = choices[Math.min(choices.length - 1, pick)]
    const [low, high] = SAME_SWITCH
    nextEventAt = fish.age + low + jitter(fish.wavePhase * 50, fish.age + 1) * (high - low)
  }

  /** 追わずに、いまの向きのまま進む。 */
  const straight = (extra: Partial<Fish> = {}): Fish => {
    const speed = Math.hypot(fish.vx, fish.vy) || base
    const scale = (base * speedScale) / speed
    return { ...fish, vx: fish.vx * scale, vy: fish.vy * scale, speedScale, nextEventAt, ...extra }
  }

  // すれ違った直後は追わない。すぐ追い直すと、1匹に張り付いて見える
  if (!chasing || !target) return straight()

  const dx = target.x - fish.x
  const dy = target.y - fish.y
  const distance = Math.hypot(dx, dy) || 1

  /*
   * ぶつかる手前まで来たら、追うのをやめて数秒そのまま通り過ぎる。
   * **追いつかせない**（会場で「食べられた」に見えると、描いた子が悲しむ）。
   * 向きを反転させて逃がすと、近づいては戻るを繰り返してその場で往復した。
   */
  if (distance < fish.width * SAME_KEEP_AWAY) {
    /*
     * ここで減速させない。突っ込んだ勢いのまま通り過ぎるほうが速く見える。
     * 減速を混ぜたら、速い時間が全体の3%しか無くなった（実測）。
     */
    return straight({ ignoreUntil: fish.age + SAME_PASS_SECONDS })
  }

  /*
   * 向きは少しずつ寄せる。いきなり向けると、大きな絵が
   * その場でくるっと反転して見える（水中の生き物には見えない）。
   */
  const blend = 0.12
  const wanted = {
    x: (dx / distance) * base * speedScale,
    y: (dy / distance) * base * speedScale * 0.8,
  }
  return {
    ...fish,
    vx: fish.vx + (wanted.x - fish.vx) * blend,
    vy: fish.vy + (wanted.y - fish.vy) * blend,
    speedScale,
    nextEventAt,
  }
}

/* ------------------------------------------------------------------ 滑空
 *
 * プテラノドンは**滑空**する。羽ばたきは付けていない。
 *
 * 試したこと（どちらも失敗。R-037 / R-038 / R-039）:
 *   1. 翼を矩形で切って回す → **この台紙は切れない**。
 *      測ると、どの横線も絵の幅の 14% 以上を横切る（`tools/check-cut.py`）。
 *      嘴から翼の先まで1つの塊としてつながっているため。
 *   2. 絵を切らずに全体を縦へ縮める（squash & stretch）→ **頭も嘴も縮む**ので、
 *      「翼が動いた」ではなく「絵が潰れた」に見えた。
 *
 * いま入れているのは**傾けるだけ**。絵の形を変えないので、どこも歪まない。
 * 本物の羽ばたきは、翼を切り分けられる台紙が来てから作る。
 */

/** 傾きの速さ（ラジアン/秒）。ゆっくり左右に傾いて滑空して見せる */
export const GLIDE_SPEED = 1.3
/** 傾きの幅（ラジアン）。大きいと落ちているように見える */
export const GLIDE_TILT = 0.07

/** その時刻の傾き（ラジアン）。 */
export function glideTilt(time: number): number {
  return GLIDE_TILT * Math.sin(time)
}
