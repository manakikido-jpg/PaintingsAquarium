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

  const halfWidth = fish.width / 2
  const halfHeight = fish.height / 2
  // ゆらぎのぶんも画面内に収める。これを入れないと、上下端でゆらぎが
  // 画面外にはみ出して絵の頭が切れる。
  const marginY = halfHeight + fish.amplitude

  const minX = Math.min(halfWidth, tank.width / 2)
  const maxX = Math.max(tank.width - halfWidth, tank.width / 2)
  const minY = Math.min(marginY, tank.height / 2)
  const maxY = Math.max(tank.height - marginY, tank.height / 2)

  if (x < minX) {
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

  return { ...fish, x, y, vx, vy, phase: fish.phase + fish.phaseSpeed * dt }
}

/**
 * 決まった種から擬似乱数を作る。`Math.random` を使わないのは、
 * 泳ぎ方をテストで再現できるようにするため。
 */
function pseudoRandom(seed: number): () => number {
  let state = (seed | 0) || 1
  return () => {
    state = (state * 1664525 + 1013904223) | 0
    return ((state >>> 8) & 0xffffff) / 0x1000000
  }
}

export interface SpawnOptions {
  /** 絵の長辺をこの長さに合わせる（ピクセル） */
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
  { targetSize = 180, minSpeed = 30, maxSpeed = 90 }: SpawnOptions = {},
): Fish {
  const random = pseudoRandom(seed)
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
    vy: (random() - 0.5) * speed * 0.3,
    width,
    height,
    phase: random() * Math.PI * 2,
    phaseSpeed: 1.2 + random() * 1.6,
    amplitude,
  }
}
