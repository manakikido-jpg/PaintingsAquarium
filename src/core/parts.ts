import { seededRandom } from './random'
import type { Tank } from './swim'

/**
 * 背景に敷くパーツ（画像）の置き方。
 *
 * 図形とグラデーションで描く方式は見た目の上限が低く、
 * どれだけ塗りを作り込んでも「多角形とグラデーション」に見えた（R-025）。
 * 絵として作られた画像を貼るほうが、見た目も速度も良い
 *（1個につき `drawImage` 1回で済む）。
 *
 * **同じ画像が何度も出るので、置き方で違いを作る。**
 * 大きさ・左右反転・奥行き・重なり順を散らさないと、
 * 同じものが並んだ壁紙になる。
 */

export interface PlacedPart {
  /** 何番目のパーツ画像か */
  readonly index: number
  /** 中心の横位置（ピクセル） */
  readonly x: number
  /** 地面に接する高さ（ピクセル） */
  readonly groundY: number
  /**
   * 描く高さ（ピクセル）。幅は画像の縦横比から決める。
   *
   * **幅ではなく高さを基準にする。** 幅を基準にすると、細長いパーツ
   *（海藻など）が縦に伸びて画面を突き抜ける。実際にそうなった。
   * 高さを基準にすれば、どんな縦横比でも画面に収まる。
   */
  readonly height: number
  /** 左右反転するか */
  readonly flipped: boolean
  /** 0〜1。大きいほど手前。濃さと重なり順に使う */
  readonly depth: number
}

export interface PlaceOptions {
  /** 画面の高さに対する基準の大きさ */
  readonly baseHeight?: number
  /** 大きさのばらつき（基準に対する倍率の幅） */
  readonly sizeSpread?: number
  /** 地面の高さを返す関数 */
  readonly groundAt: (x: number) => number
}

/**
 * パーツを画面の下に並べる。
 *
 * 横位置は等間隔の枠を作り、その中で散らす。完全な乱数だと
 * **固まる場所と空く場所ができる**（少ない数ほど目立つ）。
 * 枠を作ってから散らすと、散らばりと不規則さの両方が出る。
 */
export function placeParts(
  seed: number,
  count: number,
  partCount: number,
  tank: Tank,
  options: PlaceOptions,
): PlacedPart[] {
  if (count <= 0 || partCount <= 0) return []
  const random = seededRandom(seed)
  const { baseHeight = 0.17, sizeSpread = 0.55, groundAt } = options
  const placed: PlacedPart[] = []

  for (let index = 0; index < count; index++) {
    const slot = (index + 0.5) / count
    const x = tank.width * Math.min(1, Math.max(0, slot + (random() - 0.5) * (0.9 / count)))
    const depth = random()
    /*
     * 奥のものほど小さく。奥行きは濃さだけでなく**大きさ**でも出す。
     * 濃さだけで表すと、同じ大きさのものが薄く並ぶだけになる（R-009 / R-011）。
     */
    const scale = (0.55 + depth * 0.45) * (1 - sizeSpread / 2 + random() * sizeSpread)

    placed.push({
      index: Math.floor(random() * partCount),
      x,
      groundY: groundAt(x),
      height: tank.height * baseHeight * scale,
      flipped: random() < 0.5,
      depth,
    })
  }

  // 奥から手前の順に描く。手前のものが奥に隠れると重なりがおかしく見える
  return placed.sort((a, b) => a.depth - b.depth)
}

/** その奥行きでの濃さ（空気遠近）。奥ほど薄く、水の色に溶ける。 */
export function partAlpha(depth: number): number {
  return 0.62 + depth * 0.38
}

/** その奥行きで水の色へ寄せる割合。 */
export function partFade(depth: number): number {
  return 0.45 * (1 - depth)
}
