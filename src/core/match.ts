import type { RgbaImage } from './image'

/**
 * 台紙（塗り絵）との照合。
 *
 * 実運用では**塗り絵の台紙が決まっている**ので、絵の形は事前に分かる。
 * だから「尾びれがどこか」を毎回推定する必要はない。
 * **台紙ごとに正解（リグ）を1回だけ書いておき、どの台紙かだけを見分ければよい。**
 *
 * 見分け方は形の重なり具合。塗った色は人によって全く違うが、
 * **輪郭は台紙で決まっているので必ず一致する**。色を見ないのはそのため。
 *
 * AI を使わないのは、選択肢が数種類しかなく、しかも正解の形が手元にあるため。
 * 未知のものを当てる問題ではなく、**決まったものと照らし合わせる**問題になっている。
 */

/** 形だけを取り出した升目。`true` が絵のある場所。 */
export interface Silhouette {
  readonly size: number
  readonly cells: readonly boolean[]
}

const ALPHA_THRESHOLD = 24

/**
 * 絵を正方形の升目に落とす。
 *
 * 縦横比を保ったまま収めるのは、**縦長のイカと横長の魚を区別するため**。
 * 引き伸ばして正方形にすると、この違いが消えて別の生き物が同じ形になる。
 *
 * `degrees` を渡すと、絵を回してから落とす。**紙は必ず少し斜めに置かれる**ので、
 * 照合のときに何通りか試す（`MATCH_TILTS`）。台紙のほうを回さないのは、
 * 台紙が起動時に作った升目データで、回すと作り直しになるため。
 *
 * **収めるのは「絵のある範囲」で、画像の大きさではない。**
 * 回すと外接矩形が変わるので測り直す必要があるが、それだけでなく、
 * 余白の付いた画像を渡されたときに傾き 0 と傾き 4 度で基準が変わってしまう。
 * 実際、初めは傾き 0 のときだけ画像の大きさで収めていて、
 * **傾けた形が一度も選ばれなかった**（余白のぶん縮尺がずれて、常に負けていた）。
 * 台紙の升目データも「絵のある範囲」で作っている（`tools/make-template-data.py`）。
 */
export function silhouette(image: RgbaImage, size = 48, degrees = 0): Silhouette {
  const radians = (degrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const centreX = image.width / 2
  const centreY = image.height / 2

  // 外接矩形を測るための走査。**1画素ずつ見ない。**
  // 取り込んだ絵は 1000px を超えることがあり、傾きの数だけ全画素を走ると重くなる。
  // 48升に落とすので、間引いても外接矩形はほとんどずれない
  const stride = Math.max(1, Math.floor(Math.max(image.width, image.height) / 256))
  let minU = Infinity
  let maxU = -Infinity
  let minV = Infinity
  let maxV = -Infinity
  for (let y = 0; y < image.height; y += stride) {
    for (let x = 0; x < image.width; x += stride) {
      if (image.data[(y * image.width + x) * 4 + 3] < ALPHA_THRESHOLD) continue
      const dx = x - centreX
      const dy = y - centreY
      const u = dx * cos - dy * sin
      const v = dx * sin + dy * cos
      if (u < minU) minU = u
      if (u > maxU) maxU = u
      if (v < minV) minV = v
      if (v > maxV) maxV = v
    }
  }

  const cells = new Array<boolean>(size * size).fill(false)
  if (minU === Infinity) return { size, cells }

  const longest = Math.max(maxU - minU, maxV - minV)
  const offsetU = minU - (longest - (maxU - minU)) / 2
  const offsetV = minV - (longest - (maxV - minV)) / 2

  for (let row = 0; row < size; row++) {
    const v = offsetV + ((row + 0.5) / size) * longest
    for (let column = 0; column < size; column++) {
      const u = offsetU + ((column + 0.5) / size) * longest
      // 回した座標から元の画素へ戻す（回転の逆）
      const x = Math.floor(centreX + u * cos + v * sin)
      const y = Math.floor(centreY - u * sin + v * cos)
      if (x < 0 || x >= image.width || y < 0 || y >= image.height) continue
      cells[row * size + column] = image.data[(y * image.width + x) * 4 + 3] >= ALPHA_THRESHOLD
    }
  }
  return { size, cells }
}

/**
 * 2つの形がどれだけ重なっているか（0〜1）。
 *
 * 重なった升目 ÷ どちらかに絵がある升目。
 * 「一致した数」だけを数えないのは、**両方とも空白の場所まで一致に数えてしまう**ため。
 * 小さい絵どうしは背景が広く、それだけで高い点数になってしまう。
 */
export function overlap(a: Silhouette, b: Silhouette): number {
  if (a.size !== b.size) throw new Error('升目の大きさが違います')
  let both = 0
  let either = 0
  for (let index = 0; index < a.cells.length; index++) {
    if (a.cells[index] && b.cells[index]) both++
    if (a.cells[index] || b.cells[index]) either++
  }
  return either === 0 ? 0 : both / either
}

/** 90度ずつ回す。 */
export function turnSilhouette(shape: Silhouette, turns: number): Silhouette {
  const step = ((turns % 4) + 4) % 4
  if (step === 0) return shape
  const { size } = shape
  const cells = new Array<boolean>(size * size).fill(false)
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      let toRow: number
      let toColumn: number
      if (step === 1) {
        toRow = column
        toColumn = size - 1 - row
      } else if (step === 2) {
        toRow = size - 1 - row
        toColumn = size - 1 - column
      } else {
        toRow = size - 1 - column
        toColumn = row
      }
      cells[toRow * size + toColumn] = shape.cells[row * size + column]
    }
  }
  return { size, cells }
}

/** 左右を反転する。 */
export function mirrorSilhouette(shape: Silhouette): Silhouette {
  const { size } = shape
  const cells = new Array<boolean>(size * size).fill(false)
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      cells[row * size + (size - 1 - column)] = shape.cells[row * size + column]
    }
  }
  return { size, cells }
}

export interface Template {
  readonly id: string
  readonly shape: Silhouette
}

export interface MatchResult {
  readonly id: string
  /** 重なり具合（0〜1） */
  readonly score: number
  /** 台紙に合わせるために絵を何回まわしたか（時計回り） */
  readonly turns: number
  readonly mirrored: boolean
  /**
   * 何度傾けたときに一番よく重なったか（診断用）。
   *
   * **絵を描くときには使わない。** ここで見ているのは紙の置き方のずれで、
   * 絵そのものの向きではない。これで絵を回すと、まっすぐ置かれた紙まで
   * 数度傾いて泳ぐことになる。
   */
  readonly tilt: number
}

/**
 * 照合のときに試す傾き（度）。
 *
 * **紙はまっすぐ置かれない。** スキャナに載せるときのずれは実測で数度あり、
 * 6 度でクラゲが自分の台紙と 0.45 でしか重ならず、しきい値（0.7）を割っていた。
 * ここを増やすと、細い形（触手・ひれ）の見分けが目に見えて安定する。
 *
 * 実測（6種・8通りのゆがみ、`tools/check-templates.py`）:
 *
 * | 試す傾き | 自分との重なりの最低 | 2位との差の最小 |
 * |---|---|---|
 * | 0 だけ（前） | クラゲ 0.45 | +0.01 |
 * | ±8°・4°刻み | クラゲ 0.72 | **+0.25** |
 * | ±10°・5°刻み | クラゲ 0.72 | +0.24 |
 *
 * **刻みを粗くすると効きが落ちる**（10度まで見ても 5度刻みでは戻らない）。
 * 4度刻みなのはそのため。増やすと照合の回数が比例して増えるが、
 * 照合は1枚につき1回だけなので、体感に影響しない（升目は 48×48）。
 */
export const MATCH_TILTS: readonly number[] = [-8, -4, 0, 4, 8]

/**
 * どの台紙かを見分ける。
 *
 * 紙の向きは描いた人が決めるので（R-019）、**4方向と左右反転の8通り**すべてで
 * 照らし合わせる。一番よく重なった向きが、そのまま「正しい向き」になる。
 * 向きを別に推定しなくてよくなるのが、台紙方式のいちばん大きい利点。
 *
 * さらに、**紙の置き方のずれ**（`MATCH_TILTS`）も試す。90度ずつだけでは、
 * まっすぐ置かれなかった紙で細い形が崩れる。合わせて 8 × 5 = 40 通り。
 */
export function matchTemplates(
  image: RgbaImage,
  templates: readonly Template[],
  size = 48,
): MatchResult | null {
  if (templates.length === 0) return null

  let best: MatchResult | null = null
  // 傾きを一番外に置く。升目に落とす計算は傾きごとに1回で済み、
  // 台紙の数だけ作り直さずにすむ
  for (const tilt of MATCH_TILTS) {
    const shape = silhouette(image, size, tilt)
    for (let turns = 0; turns < 4; turns++) {
      const turned = turnSilhouette(shape, turns)
      for (const mirrored of [false, true]) {
        const candidate = mirrored ? mirrorSilhouette(turned) : turned
        for (const template of templates) {
          const score = overlap(candidate, template.shape)
          if (!best || score > best.score) best = { id: template.id, score, turns, mirrored, tilt }
        }
      }
    }
  }
  return best
}

/**
 * これを下回ったら「どの台紙でもない」とみなす。
 *
 * 台紙どおりに塗られた絵は、輪郭が同じなので高く出る。
 * 台紙を使わずに自由に描かれた絵を、無理にどれかへ当てはめると、
 * 見当違いの場所に尾びれを付けることになる。**当てはめないほうが安全**。
 */
export const MATCH_THRESHOLD = 0.7
