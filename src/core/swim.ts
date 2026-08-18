import { creatureSize, DEFAULT_SIZE_SCALE, FISH_SIZE_RATIO } from './size'
import { seededRandom } from './random'
import type { SpeciesId } from './templates'
/**
 * 水槽の中を泳ぐ動き。純粋関数にしてあるのは、
 * 「絵が画面の外に出てしまう」類の不具合を目視ではなくテストで止めるため。
 */

export interface Tank {
  readonly width: number
  readonly height: number
}

export interface Fish {
  /** 中心座標。上下のゆらぎは含まない（描画時に足す） */
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly vy: number
  readonly width: number
  readonly height: number
  /** 上下のゆらぎの位相（ラジアン） */
  readonly phase: number
  /** ゆらぎの速さ（ラジアン/秒） */
  readonly phaseSpeed: number
  /** ゆらぎの振れ幅（ピクセル） */
  readonly amplitude: number
  /**
   * 画面の外へ出て行く途中か。
   *
   * 同時に泳ぐ数を超えた絵は、その場で消すのではなく**泳いで画面の外へ去る**。
   * その間は壁で跳ね返らない。跳ね返ると画面から出られない。
   */
  readonly exiting?: boolean

  /* ---- 生き物ごとの動きに使うもの（`behaviour.ts`）---- */

  /** どの台紙の絵か。台紙に一致しなかった絵には入らない */
  readonly species?: SpeciesId
  /** 生まれてからの秒数。跳ねる周期や波の位相に使う */
  readonly age: number
  /**
   * 生き物ごとの動きの位相（ラジアン・**変わらない**）。
   *
   * `phase` は上下のゆらぎ用で毎フレーム進むので、波の位相には使えない。
   * 使うと `phase` の進む速さが波の速さに足し込まれ、**周期が4倍速**になる
   *（実際にそうなり、ウミガメのS字が小刻みな揺れになった）。
   */
  readonly wavePhase: number
  /** 生まれたときの速さ（ピクセル/秒）。速さを変える生き物が基準に使う */
  readonly baseSpeed?: number
  /**
   * 横の壁での振る舞い。
   * `bounce` はその場で跳ね返る。`turnOutside` は**画面の外へ1体ぶん出てから**
   * 向きを変えて戻る（魚に使う。壁で跳ね返ると水槽のガラスに見える）。
   */
  readonly wall?: 'bounce' | 'turnOutside'
  /** 次に何かが起きる時刻（`age` と同じ単位）。イルカの跳ね、サメの速さの切り替え */
  readonly nextEventAt?: number
  /** 跳ね始めたときの高さ（イルカ） */
  readonly jumpFrom?: number
  /** 跳ね終わる時刻（イルカ） */
  readonly jumpUntil?: number
  /** いまの速さの倍率（サメ） */
  readonly speedScale?: number
}

/** 描画に使う実際の Y。ゆらぎを足したもの。 */
export function renderY(fish: Fish): number {
  return fish.y + Math.sin(fish.phase) * fish.amplitude
}

/** 絵の向き。vx が正なら右向き。描画時に左右反転するかの判断に使う。 */
export function facesRight(fish: Fish): boolean {
  return fish.vx >= 0
}

/**
 * 1 フレーム進める。
 *
 * dt を引数に取り、フレーム数で進めていないのは、モニタのリフレッシュレートが
 * 会場によって違う（60Hz / 120Hz）ため。フレーム基準だと速さが変わる。
 *
 * 壁は「跳ね返り」。反転と同時に位置も内側へ戻すのは、跳ね返った直後に
 * まだ壁の外にいると、次のフレームでもう一度反転して壁に貼り付くため。
 */
export function stepFish(fish: Fish, dtSeconds: number, tank: Tank): Fish {
  const dt = Math.max(0, dtSeconds)

  let x = fish.x + fish.vx * dt
  let y = fish.y + fish.vy * dt
  let vx = fish.vx
  let vy = fish.vy

  const age = fish.age + dt

  // 去る途中は壁を無視してそのまま進む。跳ね返ると永遠に出て行けない
  if (fish.exiting) {
    return { ...fish, x, y, age, phase: fish.phase + fish.phaseSpeed * dt }
  }

  const halfWidth = fish.width / 2
  const halfHeight = fish.height / 2
  // ゆらぎのぶんも画面内に収める。これを入れないと、上下端でゆらぎが
  // 画面外にはみ出して絵の頭が切れる。
  const marginY = halfHeight + fish.amplitude

  const minX = Math.min(halfWidth, tank.width / 2)
  const maxX = Math.max(tank.width - halfWidth, tank.width / 2)
  const minY = Math.min(marginY, tank.height / 2)
  const maxY = Math.max(tank.height - marginY, tank.height / 2)

  /*
   * 横の壁。`turnOutside` は画面の外へ**1体ぶん**出てから向きを変える。
   * 会場からの指摘「画面外に出たら反転してまた進むように」に合わせたもの。
   * 端で跳ね返ると、水槽のガラスに当たっているように見える。
   */
  if (fish.wall === 'turnOutside') {
    const outside = fish.width
    if (x < -outside) {
      x = -outside
      vx = Math.abs(vx)
    } else if (x > tank.width + outside) {
      x = tank.width + outside
      vx = -Math.abs(vx)
    }
  } else if (x < minX) {
    x = minX
    vx = Math.abs(vx)
  } else if (x > maxX) {
    x = maxX
    vx = -Math.abs(vx)
  }

  if (y < minY) {
    y = minY
    vy = Math.abs(vy)
  } else if (y > maxY) {
    y = maxY
    vy = -Math.abs(vy)
  }

  return { ...fish, x, y, vx, vy, age, phase: fish.phase + fish.phaseSpeed * dt }
}


export interface SpawnOptions {
  /** どの台紙の絵か。生き物ごとの動きに使う */
  species?: SpeciesId
  /** 横の壁での振る舞い。既定は跳ね返り */
  wall?: 'bounce' | 'turnOutside'
  /**
   * 絵の長辺をこの長さに合わせる（ピクセル）。
   * 既定は画面幅に対する割合で決まる（下記）。
   */
  readonly targetSize?: number
  /** 泳ぐ速さの範囲（ピクセル/秒） */
  readonly minSpeed?: number
  readonly maxSpeed?: number
}

/**
 * 取り込んだ絵を 1 匹として水槽に放つ。
 * seed が同じなら必ず同じ結果になる。
 */
export function spawnFish(
  seed: number,
  tank: Tank,
  imageWidth: number,
  imageHeight: number,
  options: SpawnOptions = {},
): Fish {
  /*
   * 絵の大きさは**画面幅に対する割合**で決める。
   * 以前は 180px 固定にしていたが、それだと同じ 50 匹でも
   * 画面が狭いと埋め尽くされ、広いと点にしか見えない。
   * 実測（1280px 幅・50匹）では 180px 固定が画面を埋め、
   * **自分の絵を探せない**状態になった（R-015）。
   */
  const {
    targetSize = creatureSize(tank, FISH_SIZE_RATIO, DEFAULT_SIZE_SCALE),
    minSpeed = 30,
    maxSpeed = 90,
    species,
    wall,
  } = options
  const random = seededRandom(seed)
  const longestSide = Math.max(imageWidth, imageHeight, 1)
  const scale = targetSize / longestSide
  const width = Math.max(1, imageWidth * scale)
  const height = Math.max(1, imageHeight * scale)

  const speed = minSpeed + random() * (maxSpeed - minSpeed)
  const towardsRight = random() < 0.5
  const amplitude = 6 + random() * 14

  const marginY = height / 2 + amplitude
  const usableHeight = Math.max(0, tank.height - marginY * 2)

  // 横位置も散らす。全部を画面中央から出すと、同じ時間帯に取り込んだ絵どうしが
  // 速度も近いためほぼ重なったまま泳ぎ、2匹が1匹に見える。
  const marginX = Math.min(width / 2, tank.width / 2)
  const usableWidth = Math.max(0, tank.width - marginX * 2)

  return {
    x: marginX + random() * usableWidth,
    y: marginY + random() * usableHeight,
    vx: towardsRight ? speed : -speed,
    /*
     * 縦の速さ。横の 0.55 倍まで持たせる。
     *
     * 以前は 0.3 倍で、実測すると縦 4.3px/秒（横は 56.3px/秒）しか出ていなかった。
     * ほとんど動かないので**最初に決まった高さのまま並びが固定**され、
     * 少ない枚数だと偏りがそのまま残って「真ん中に集まっている」ように見えた。
     * 大きくしすぎると斜めに滑って見える（絵は傾かないため）ので、ここが上限。
     */
    vy: (random() - 0.5) * speed * 0.55,
    width,
    height,
    phase: random() * Math.PI * 2,
    phaseSpeed: 1.2 + random() * 1.6,
    amplitude,
    age: 0,
    wavePhase: random() * Math.PI * 2,
    baseSpeed: speed,
    species,
    wall,
  }
}

export interface SeparateOptions {
  /** この距離まで近づいたら避け始める。絵の大きさに対する倍率 */
  readonly range?: number
  /** 向きを変える強さ */
  readonly strength?: number
}

/** 絵どうしの当たりの目安。横長の絵が多いので長辺で見る。 */
function avoidanceRadius(fish: Fish): number {
  return Math.max(fish.width, fish.height) / 2
}

/**
 * 絵どうしが重ならないよう、近づきすぎた組の向きを変える。
 *
 * 既定値は実測で決めた。50匹を1分泳がせたときの「重なっている組」の平均は
 * 避けない場合 17.82 組、`range=1.3 strength=4` で 1.50 組（92%減）。
 * これ以上強くすると反発しすぎて跳ね返り合い、かえって重なりが増える
 * （`range=1.7 strength=7` で 5.13 組）。
 *
 * これは見た目の調整ではなく、この展示の核心。
 * 絵が重なると、自分の絵を探しに来た子どもが見つけられない（R-005）。
 * 生まれる位置を散らすだけでは、泳ぐうちに合流して同じことが起きる。
 *
 * 速さは変えず**向きだけ**を変えている。押し出す力を速度に足し込むと、
 * 混み合ったときに一部の絵だけが加速して不自然に飛び出すため。
 */
export function separateFish(
  fishes: readonly Fish[],
  dtSeconds: number,
  { range = 1.3, strength = 4 }: SeparateOptions = {},
): Fish[] {
  const dt = Math.max(0, dtSeconds)
  if (fishes.length < 2 || dt === 0) return [...fishes]

  const pushX = new Float64Array(fishes.length)
  const pushY = new Float64Array(fishes.length)

  for (let a = 0; a < fishes.length; a++) {
    for (let b = a + 1; b < fishes.length; b++) {
      const first = fishes[a]
      const second = fishes[b]
      const limit = (avoidanceRadius(first) + avoidanceRadius(second)) * range
      if (limit <= 0) continue

      let dx = second.x - first.x
      let dy = renderY(second) - renderY(first)
      let distance = Math.hypot(dx, dy)

      if (distance >= limit) continue

      if (distance < 1e-6) {
        // 完全に重なった場合。乱数を使うと泳ぎが再現できなくなるので、
        // 並び順から決まる向きへ逃がす。
        dx = a % 2 === 0 ? 1 : -1
        dy = b % 2 === 0 ? 1 : -1
        distance = Math.hypot(dx, dy)
      }

      // 近いほど強く避ける
      const force = (1 - distance / limit) / distance
      pushX[a] -= dx * force
      pushY[a] -= dy * force
      pushX[b] += dx * force
      pushY[b] += dy * force
    }
  }

  return fishes.map((fish, index) => {
    if (pushX[index] === 0 && pushY[index] === 0) return fish

    const speed = Math.hypot(fish.vx, fish.vy)
    if (speed < 1e-6) return fish

    const vx = fish.vx + pushX[index] * strength * speed * dt
    const vy = fish.vy + pushY[index] * strength * speed * dt
    const changed = Math.hypot(vx, vy)
    if (changed < 1e-6) return fish

    // 速さは元のまま。向きだけ変える。
    return { ...fish, vx: (vx / changed) * speed, vy: (vy / changed) * speed }
  })
}

/**
 * 画面の外へ向かわせる。
 *
 * **近いほうの横の端**へ向ける。上下ではなく横に出すのは、
 * 水槽の絵が横に泳ぐ形なので、そのまま進めば自然に見えるため。
 * 速さは少し上げる。ゆっくり去られると、消えかけの絵が長く画面に残る。
 */
export function sendFishOut(fish: Fish, tank: Tank): Fish {
  const speed = Math.max(60, Math.abs(fish.vx) * 1.5)
  const goesLeft = fish.x < tank.width / 2
  return { ...fish, exiting: true, vx: goesLeft ? -speed : speed, vy: fish.vy * 0.3 }
}

/** 絵が完全に画面の外へ出たか。 */
export function isFishOutside(fish: Fish, tank: Tank): boolean {
  const half = fish.width / 2 + fish.amplitude
  return fish.x < -half || fish.x > tank.width + half
}
