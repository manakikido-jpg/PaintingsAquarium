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
 * ゆっくりした上下の移動（タコ・ウミガメ）。
 *
 * **S字の波だけでは、生まれた高さから離れられない。**
 * 波は上下 10〜13% の往復なので、画面の下のほうで生まれた絵は
 * そこにい続ける。実測で、24匹を90秒泳がせるとウミガメは
 * **滞在時間の 49% が画面の一番下**（上から5等分の最下段）で、
 * 一番上には 0% だった。下は岩とサンゴが並ぶ帯なので、
 * **自分の絵を探しに来た子どもが見つけられない**（要件定義 §3 5c）。
 *
 * そこで、波とは別に**ゆっくり上下を往復する動き**を足す。
 * 1往復に `WANDER_SECONDS` かけるので、目では「ゆっくり潜って、ゆっくり浮く」
 * ようにしか見えない。速さは横より遅くする（R-035）。
 */
export const WANDER_SECONDS = 150
/** 上下の移動の速さの上限（画面の高さに対する割合・毎秒） */
export const WANDER_RATE = 0.016
/**
 * 目標の深さが振れる幅（画面の中心からの割合）。
 * 0.35 なら、画面の高さの 15%〜85% の間を行き来する。
 */
export const WANDER_BAND = 0.35
/** 目標の深さへ寄っていく速さ（毎秒）。大きいほど急いで合わせにいく。 */
export const WANDER_GAIN = 0.5

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
  return { ...fish, vy: vy + wanderY(fish, tank) }
}

/**
 * ゆっくり上下する速さ。
 *
 * **「上下する速さ」ではなく「目指す深さ」を先に決める。**
 *
 * はじめは速さそのものを余弦で振っていたが、それだと**端に張り付いた**。
 * 上向きの速さが出ている間（最長で周期の半分＝75秒）はずっと天井を押し続け、
 * `stepFish` の跳ね返りはここで毎フレーム上書きされるので効かない
 *（R-040・R-041 と同じ形）。実測で、タコが上端10%に **49秒**居続けた。
 * 端に近いほど力を弱める、も試したが**同じだった**（押さなくなるだけで、
 * 離れる力が無い）。
 *
 * 目指す深さのほうを振ると、これが起きない。
 * 目標は必ず画面の内側（15%〜85%）にあるので、端に着いた時点で
 * **目標は必ず内側にあり、そちらへ引き戻される**。
 * 位相は絵ごとにずらす。揃っていると、全部が同時に潜って同時に浮く。
 */
function wanderY(fish: Fish, tank: Tank): number {
  const turn = (Math.PI * 2) / WANDER_SECONDS
  const target = tank.height * (0.5 + WANDER_BAND * Math.cos(fish.age * turn + fish.wavePhase))
  // 上限を掛ける。生まれた場所が目標から遠いと、初速が跳ね上がって不自然になる
  const limit = tank.height * WANDER_RATE
  return Math.max(-limit, Math.min(limit, (target - fish.y) * WANDER_GAIN))
}

/**
 * ふわふわ漂う（クラゲ）。横はほとんど進まない。
 *
 * ふわふわ（9秒で1往復・画面の高さの 4.5%）は**その場での揺れ**で、
 * 居場所は変わらない。横切るのに 80〜140 秒かかる生き物なので、
 * これだけだと生まれた高さに何分も居座る（実測で下端に 33 秒）。
 * ゆっくりした上下（`wanderY`）を重ねて、画面全体を使わせる。
 */
function drift(fish: Fish, tank: Tank): Fish {
  const swing = tank.height * KURAGE_RISE
  const omega = (Math.PI * 2) / KURAGE_PERIOD
  const vy = Math.cos(fish.age * omega + fish.wavePhase) * omega * swing
  return { ...fish, vy: vy + wanderY(fish, tank) }
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

  /*
   * 跳ねていない間は、ゆっくり上下する。
   *
   * **前は縦の速度を 0 にしていた。** そのため、イルカは生まれた高さのまま
   * 一生泳ぎ、実測で上端10%に **56秒**居続けた個体がいた。
   * しかも跳躍は「いまの高さから画面の上まで」を弧にするので、
   * 上のほうに居るイルカは**跳ねても何も起きない**（持ち上がる余地が無い）。
   * 深いところに居るときほど大きく跳ねるので、上下するほうが跳躍も映える。
   */
  const wander = wanderY(fish, tank)

  if (fish.jumpFrom !== undefined) {
    // 着水した直後。次に跳ぶ時刻を決める
    const [low, high] = IRUKA_GAP
    const wait = low + jitter(fish.wavePhase * 1000, fish.age) * (high - low)
    return { ...fish, jumpFrom: undefined, jumpUntil: undefined, nextEventAt: fish.age + wait, vy: wander }
  }

  if (fish.age >= nextAt) {
    return { ...fish, jumpFrom: fish.y, jumpUntil: fish.age + IRUKA_JUMP_SECONDS, vy: 0 }
  }

  return { ...fish, vy: wander }
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

/* ------------------------------------------------------------------ 飛ぶ動き
 *
 * プテラノドンの翼を動かす。**絵は切らない。**
 *
 * 翼を矩形で切って回す案は使えない。この台紙は**切れない**（`tools/check-cut.py`）。
 * どの横線も絵の幅の 14% 以上を横切る。嘴から翼の先まで1つの塊なので、
 * どこで切っても裂ける（R-037 / R-038）。
 *
 * そこで**全体を縦に縮めて横へ広げる**（squash & stretch）。
 * 横に広がった絵を縦に縮めると、翼が下りたように見える。
 *
 * **これだけでは足りなかった。** 一度は「羽ばたいて見えない」と言われた（R-039）。
 * 原因は縮み方ではなく、**魚のしなりが一緒に掛かっていた**こと。
 * しなりは胴をくねらせる動きなので、飛ぶ絵に掛けると**顔がなびいて**、
 * 翼の動きがその中に埋もれていた。しなりを外したら翼の動きが見えるようになった。
 *
 * 傾きも足してある。滑空している感じが出る。
 */

/** 羽ばたきの速さ（ラジアン/秒）。1周およそ 2.4 秒 */
export const FLAP_SPEED = 2.6
/**
 * 縦の縮み幅。
 * 大きくすると潰れて見え、小さいと止まって見える。
 * 実機で見ながら決めた値。
 */
export const FLAP_SQUASH = 0.1
/**
 * 縦に縮めたぶん横へ広げる割合。
 * 縦だけ縮めると**息をしているように**見える。縮めながら横へ広げると、
 * 翼を打ち下ろして体が伸びたように見える（面積がほぼ変わらない）。
 */
export const FLAP_STRETCH = 0.5
/** 傾きの幅（ラジアン）。羽ばたきの半分の速さでゆっくり傾ける */
export const GLIDE_TILT = 0.06

/** その時刻の縦の倍率（1 が元の高さ）。 */
export function flapSquash(time: number): number {
  return 1 + FLAP_SQUASH * Math.sin(time)
}

/** その時刻の横の倍率。縦と逆に動く。 */
export function flapStretch(time: number): number {
  return 1 - FLAP_SQUASH * FLAP_STRETCH * Math.sin(time)
}

/** その時刻の傾き（ラジアン）。羽ばたきの半分の速さ。 */
export function glideTilt(time: number): number {
  return GLIDE_TILT * Math.sin(time * 0.5)
}
