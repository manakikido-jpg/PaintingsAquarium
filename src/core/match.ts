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
 */
export function silhouette(image: RgbaImage, size = 48): Silhouette {
  const cells = new Array<boolean>(size * size).fill(false)
  const longest = Math.max(image.width, image.height)
  const offsetX = (longest - image.width) / 2
  const offsetY = (longest - image.height) / 2

  for (let row = 0; row < size; row++) {
    const y = Math.floor(((row + 0.5) / size) * longest - offsetY)
    if (y < 0 || y >= image.height) continue
    for (let column = 0; column < size; column++) {
      const x = Math.floor(((column + 0.5) / size) * longest - offsetX)
      if (x < 0 || x >= image.width) continue
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
}

/**
 * どの台紙かを見分ける。
 *
 * 紙の向きは描いた人が決めるので（R-019）、**4方向と左右反転の8通り**すべてで
 * 照らし合わせる。一番よく重なった向きが、そのまま「正しい向き」になる。
 * 向きを別に推定しなくてよくなるのが、台紙方式のいちばん大きい利点。
 */
export function matchTemplates(
  image: RgbaImage,
  templates: readonly Template[],
  size = 48,
): MatchResult | null {
  if (templates.length === 0) return null
  const shape = silhouette(image, size)

  let best: MatchResult | null = null
  for (const template of templates) {
    for (let turns = 0; turns < 4; turns++) {
      const turned = turnSilhouette(shape, turns)
      for (const mirrored of [false, true]) {
        const candidate = mirrored ? mirrorSilhouette(turned) : turned
        const score = overlap(candidate, template.shape)
        if (!best || score > best.score) best = { id: template.id, score, turns, mirrored }
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
