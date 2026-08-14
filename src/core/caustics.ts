/**
 * 水面の揺らぎ模様（コースティクス）。
 *
 * 水槽らしさを一番決めるのはこれ。光の筋よりも効く。
 *
 * **速さが命なので、作りが素直ではない。理由を残しておく。**
 * 画素ごとに sin を数回呼ぶと、320×180 でも 1 フレームに数百万回の三角関数になり、
 * 会場の PC ではコマ落ちする。
 *
 * ここでは加法定理を使って三角関数を消している。
 * どんな向きの波も `sin(a·x + b·y + p)` の形で書け、これは
 * `sin(a·x+p)·cos(b·y) + cos(a·x+p)·sin(b·y)` に分解できる。
 * つまり**列ごとに 2 個・行ごとに 2 個**の値を先に用意しておけば、
 * 画素ごとの計算は掛け算と足し算だけになる。
 * 仕上げの累乗も 256 段の表を引くだけ。
 *
 * 実測: 480×270 で 1 フレーム 1.1ms（60fps の予算 16.7ms）。
 */

export interface CausticsOptions {
  /** 模様の細かさ。大きいほど細かい網目になる */
  readonly scale?: number
  /** 動く速さ */
  readonly speed?: number
  /** 線の鋭さ。大きいほど細く鋭い筋になる */
  readonly sharpness?: number
  /** 上（水面側）をどれだけ強くするか。0 で一様 */
  readonly topBias?: number
}

/**
 * 重ねる波。向きと周期を**互いに割り切れない値**にしてある。
 *
 * 最初は「横・縦・斜め45度・斜め135度」の 4 枚で作ったが、
 * きれいな格子が並ぶだけで、水面ではなく**壁紙**に見えた。
 * 波長が整数比だと模様が短い周期で繰り返すため。
 * 向きも周期も半端な値にすると、繰り返しの周期が画面より長くなり、
 * 同じ模様が二度出てこない。
 */
const WAVES = [
  { dx: 1.0, dy: 0.37, frequency: 1.0, drift: 1.0, weight: 1.0 },
  { dx: -0.42, dy: 0.91, frequency: 1.31, drift: -0.83, weight: 0.92 },
  { dx: 0.77, dy: -0.64, frequency: 1.73, drift: 1.27, weight: 0.78 },
  { dx: 0.19, dy: 0.98, frequency: 2.11, drift: -1.09, weight: 0.63 },
  { dx: -0.88, dy: -0.47, frequency: 2.57, drift: 0.71, weight: 0.5 },
  { dx: 0.64, dy: 0.77, frequency: 3.19, drift: -1.51, weight: 0.38 },
] as const

const TOTAL_WEIGHT = WAVES.reduce((sum, wave) => sum + wave.weight, 0)

const CURVE_STEPS = 256
const curveCache = new Map<number, Uint8Array>()

/**
 * `(1 - |v|) ^ sharpness` の表。
 * 画素ごとに `Math.pow` を呼ぶと、それだけでフレーム予算を使い切る。
 */
function sharpenCurve(sharpness: number): Uint8Array {
  const cached = curveCache.get(sharpness)
  if (cached) return cached

  const table = new Uint8Array(CURVE_STEPS)
  for (let index = 0; index < CURVE_STEPS; index++) {
    const distance = index / (CURVE_STEPS - 1)
    table[index] = Math.round(Math.pow(1 - distance, sharpness) * 255)
  }
  curveCache.set(sharpness, table)
  return table
}

/**
 * 揺らぎ模様の明るさを `target` に書き込む。1 画素 1 バイト（0〜255）。
 *
 * 画面の実寸で作る必要はない。細かく作っても拡大すればぼやけるだけなので、
 * 呼び出し側は長辺 480px 程度の小さい面に描いて引き伸ばすこと。
 */
export function renderCaustics(
  target: Uint8ClampedArray,
  width: number,
  height: number,
  timeSeconds: number,
  { scale = 26, speed = 0.35, sharpness = 12, topBias = 0.55 }: CausticsOptions = {},
): Uint8ClampedArray {
  if (width <= 0 || height <= 0) return target

  const table = sharpenCurve(sharpness)
  const t = timeSeconds * speed
  const waveCount = WAVES.length

  // 列ごと・行ごとの値。波の枚数ぶんまとめて 1 本の配列に詰める。
  const columnSin = new Float32Array(width * waveCount)
  const columnCos = new Float32Array(width * waveCount)
  const rowSin = new Float32Array(height * waveCount)
  const rowCos = new Float32Array(height * waveCount)
  const rowWeight = new Float32Array(height)

  for (let index = 0; index < waveCount; index++) {
    const wave = WAVES[index]
    const kx = scale * wave.frequency * wave.dx
    const ky = scale * wave.frequency * wave.dy
    const phase = t * wave.drift

    for (let x = 0; x < width; x++) {
      const nx = width === 1 ? 0 : x / (width - 1)
      const angle = nx * kx + phase
      columnSin[x * waveCount + index] = Math.sin(angle)
      columnCos[x * waveCount + index] = Math.cos(angle)
    }

    for (let y = 0; y < height; y++) {
      const ny = height === 1 ? 0 : y / (height - 1)
      const angle = ny * ky
      rowSin[y * waveCount + index] = Math.sin(angle)
      rowCos[y * waveCount + index] = Math.cos(angle)
    }
  }

  for (let y = 0; y < height; y++) {
    const ny = height === 1 ? 0 : y / (height - 1)
    // 水面に近いほど強い。深いところまで同じ強さだと、
    // 水槽ではなく「模様の壁紙」に見える。
    rowWeight[y] = 1 - topBias * ny
  }

  const scaleToIndex = CURVE_STEPS - 1

  for (let y = 0; y < height; y++) {
    const base = y * width
    const rowBase = y * waveCount
    const weight = rowWeight[y]

    for (let x = 0; x < width; x++) {
      const columnBase = x * waveCount
      let sum = 0

      for (let index = 0; index < waveCount; index++) {
        const wave = WAVES[index]
        // sin(kx·nx + ky·ny + phase) を掛け算に分解したもの
        sum +=
          wave.weight *
          (columnSin[columnBase + index] * rowCos[rowBase + index] +
            columnCos[columnBase + index] * rowSin[rowBase + index])
      }

      const value = sum / TOTAL_WEIGHT
      const distance = value < 0 ? -value : value
      const position = distance >= 1 ? scaleToIndex : (distance * scaleToIndex) | 0

      target[base + x] = table[position] * weight
    }
  }

  return target
}
