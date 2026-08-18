import type { RgbaImage } from './image'

/**
 * 絵の「骨格」（リグ）を求める。
 *
 * これは **AI に置き換える前提の土台**（`docs/設計-AI.md`）。
 * AI を入れても出力の形（`Rig`）は変えないので、描画側は触らずに済む。
 * いまは形の性質だけで推定していて、AI を入れる価値があるかどうかは
 * **この推定と当たり具合を比べて決める**。比較対象が無いと、
 * 200MB のモデルを積む価値があったのか誰も判断できない。
 *
 * 推定の中身は「魚は尾の手前がくびれ、その先でひれが広がる」という1点。
 * 尾柄（びへい）と呼ばれる形で、魚の絵にはほぼ必ず出る。
 */

/** 絵の中の位置。左上を (0,0)、右下を (1,1) とした割合。 */
export interface RigPoint {
  readonly x: number
  readonly y: number
}

export interface Rig {
  /** 体の芯。頭から尾の順に並ぶ */
  readonly spine: readonly RigPoint[]
  /** 尾びれ。無い絵（四角・虹など）では null */
  readonly tail: {
    /** 振れるときの回転の中心＝尾の付け根 */
    readonly pivot: RigPoint
    /** 頭からの割合。ここから先が尾びれ */
    readonly from: number
  } | null
  /** 頭が絵の右側にあるか */
  readonly headsRight: boolean
  /** 推定の確からしさ。低いときは使わない */
  readonly confidence: number
  /** 誰が出したか。AI と比べるために残す */
  readonly source: 'shape' | 'model'
}

/** リグを使うかどうかの境目。これ未満なら今まで通りの動きにする。 */
export const RIG_MIN_CONFIDENCE = 0.35

/** 縦の並び。絵を横に区切って、その区間に絵が写っている範囲を測ったもの。 */
export interface ColumnSpan {
  /** 上端（0〜1）。何も無ければ 0 */
  readonly top: number
  /** 下端（0〜1）。何も無ければ 0 */
  readonly bottom: number
  /** 縦の厚み（0〜1） */
  readonly height: number
}

const ALPHA_THRESHOLD = 24

/**
 * 絵を縦に `columns` 本へ区切り、それぞれの厚みを測る。
 *
 * 画素を1本ずつ見ないのは、絵の輪郭のギザギザをそのまま拾うと
 * くびれの判定が雑音に埋もれるため。区間でまとめると滑らかになる。
 */
export function columnSpans(image: RgbaImage, columns: number): ColumnSpan[] {
  const spans: ColumnSpan[] = []
  for (let index = 0; index < columns; index++) {
    const fromX = Math.floor((index * image.width) / columns)
    const toX = Math.max(fromX + 1, Math.floor(((index + 1) * image.width) / columns))
    let top = image.height
    let bottom = -1
    for (let x = fromX; x < toX && x < image.width; x++) {
      for (let y = 0; y < image.height; y++) {
        if (image.data[(y * image.width + x) * 4 + 3] < ALPHA_THRESHOLD) continue
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
    }
    if (bottom < 0) {
      spans.push({ top: 0, bottom: 0, height: 0 })
    } else {
      spans.push({
        top: top / image.height,
        bottom: (bottom + 1) / image.height,
        height: (bottom + 1 - top) / image.height,
      })
    }
  }
  return spans
}

/** 体の芯。区間ごとの上下の中点をつなぐ。 */
export function midline(spans: readonly ColumnSpan[]): RigPoint[] {
  const points: RigPoint[] = []
  for (let index = 0; index < spans.length; index++) {
    const span = spans[index]
    if (span.height === 0) continue
    points.push({
      x: (index + 0.5) / spans.length,
      y: (span.top + span.bottom) / 2,
    })
  }
  return points
}

export interface TailGuess {
  /** 頭からの割合。ここから先が尾びれ */
  readonly from: number
  /** くびれの先がどれだけ広がるか。1 なら広がっていない */
  readonly flare: number
}

/**
 * 頭から尾へ並べた厚みの列から、尾の付け根（くびれ）を探す。
 *
 * 後ろ寄りだけを見るのは、胸びれのくびれを尾と取り違えないため。
 * 端そのものを除くのは、輪郭の先端は必ず細くなるので、
 * そこを最小値として拾ってしまうと必ず「尾は絵の端」になるため。
 */
export function findTail(heights: readonly number[]): TailGuess | null {
  const count = heights.length
  if (count < 6) return null

  const from = Math.max(1, Math.floor(count * 0.5))
  const to = Math.max(from + 1, Math.floor(count * 0.88))

  let waist = -1
  for (let index = from; index < to; index++) {
    if (heights[index] === 0) continue
    if (waist < 0 || heights[index] < heights[waist]) waist = index
  }
  if (waist < 0 || heights[waist] <= 0) return null

  let after = 0
  for (let index = waist + 1; index < count; index++) after = Math.max(after, heights[index])
  if (after <= 0) return null

  const flare = after / heights[waist]
  // 広がっていなければ、ただ細くなっているだけ。尾びれとは呼べない
  if (flare < 1.2) return null

  return { from: (waist + 0.5) / count, flare }
}

/** 広がりの強さを 0〜1 の確からしさに直す。 */
export function flareConfidence(flare: number): number {
  // 1.2 で 0、1.8 で 1。それ以上は頭打ち
  return Math.min(1, Math.max(0, (flare - 1.2) / 0.6))
}

/**
 * 絵からリグを推定する。
 *
 * **どちら向きかも同時に決める。** 左右それぞれを「頭」と仮定して尾を探し、
 * くびれと広がりがはっきり出たほうを採る。
 * 進む向きを頭と決め打ちしていたのを、絵そのものから決められるようになる。
 */
export function estimateRig(image: RgbaImage, columns = 24): Rig {
  const spans = columnSpans(image, columns)
  const heights = spans.map((span) => span.height)

  const headRight = findTail([...heights])
  const headLeft = findTail([...heights].reverse())

  const rightScore = headRight?.flare ?? 0
  const leftScore = headLeft?.flare ?? 0
  // 頭が右にある＝左へ向かって尾を探す、が `headLeft` 側
  const headsRight = leftScore >= rightScore
  const guess = headsRight ? headLeft : headRight

  const spineLeftToRight = midline(spans)
  const spine = headsRight ? [...spineLeftToRight].reverse() : spineLeftToRight

  if (!guess) {
    return { spine, tail: null, headsRight, confidence: 0, source: 'shape' }
  }

  // `from` は頭からの割合。絵の中の x に直す
  const pivotX = headsRight ? 1 - guess.from : guess.from
  const index = Math.min(spans.length - 1, Math.floor(pivotX * spans.length))
  const span = spans[index]

  return {
    spine,
    tail: {
      from: guess.from,
      pivot: { x: pivotX, y: span.height > 0 ? (span.top + span.bottom) / 2 : 0.5 },
    },
    headsRight,
    confidence: flareConfidence(guess.flare),
    source: 'shape',
  }
}

/** リグを動きに使ってよいか。 */
export function rigIsUsable(rig: Rig | null | undefined): rig is Rig {
  return !!rig && rig.tail !== null && rig.confidence >= RIG_MIN_CONFIDENCE
}

/* ------------------------------------------------------------------
 * 向き直し
 *
 * 実物の絵は**縦向きに描かれていた**（頭が上、尾が下）。
 * 水槽では横に泳ぐので、そのまま出すと頭を上に向けたまま横へ滑る。
 * 子どもは紙の向きなど気にせず描くので、これは例外ではなく既定だと考える。
 * ------------------------------------------------------------------ */

/** 90度ずつ回す。`turns` は時計回りの回数。 */
export function rotateQuarter(image: RgbaImage, turns: number): RgbaImage {
  const step = ((turns % 4) + 4) % 4
  if (step === 0) return image
  const swapped = step % 2 === 1
  const width = swapped ? image.height : image.width
  const height = swapped ? image.width : image.height
  const data = new Uint8ClampedArray(width * height * 4)

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      let toX: number
      let toY: number
      if (step === 1) {
        toX = image.height - 1 - y
        toY = x
      } else if (step === 2) {
        toX = image.width - 1 - x
        toY = image.height - 1 - y
      } else {
        toX = y
        toY = image.width - 1 - x
      }
      const from = (y * image.width + x) * 4
      const to = (toY * width + toX) * 4
      data[to] = image.data[from]
      data[to + 1] = image.data[from + 1]
      data[to + 2] = image.data[from + 2]
      data[to + 3] = image.data[from + 3]
    }
  }
  return { width, height, data: data as RgbaImage['data'] }
}

/** 上下をひっくり返す。左右は反転しない（描画側が進む向きで反転するため）。 */
export function flipVertical(image: RgbaImage): RgbaImage {
  const data = new Uint8ClampedArray(image.data.length)
  const rowBytes = image.width * 4
  for (let y = 0; y < image.height; y++) {
    const from = y * rowBytes
    const to = (image.height - 1 - y) * rowBytes
    data.set(image.data.subarray(from, from + rowBytes), to)
  }
  return { width: image.width, height: image.height, data: data as RgbaImage['data'] }
}

/**
 * 絵の上半分と下半分、どちらが濃いか。
 *
 * 魚は背中が濃く腹が明るい（実物もそうだった）。
 * 90度回しと270度回しは、どちらも横向きになるので尾びれの判定では区別できない。
 * 上下の濃さの差だけが手掛かりになる。
 */
export function backIsUp(image: RgbaImage): boolean {
  let top = 0
  let bottom = 0
  let topCount = 0
  let bottomCount = 0
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const index = (y * image.width + x) * 4
      if (image.data[index + 3] < ALPHA_THRESHOLD) continue
      const ink =
        1 -
        (image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114) /
          255
      if (y < image.height / 2) {
        top += ink
        topCount++
      } else {
        bottom += ink
        bottomCount++
      }
    }
  }
  if (topCount === 0 || bottomCount === 0) return true
  return top / topCount >= bottom / bottomCount
}

export interface Oriented {
  readonly image: RgbaImage
  readonly rig: Rig
  /** 何度回したか（時計回り） */
  readonly turns: number
  readonly flipped: boolean
}

/**
 * 泳がせるのに都合のよい向きへ直す。
 *
 * 4方向すべてで尾びれを探し、**一番はっきり尾びれが出た向き**を採る。
 * 確からしさが足りなければ**何もしない**。
 * 自信が無いのに回すと、正しく描かれた絵まで横倒しにしてしまう。
 */
export function orientForSwimming(image: RgbaImage): Oriented {
  let best: { turns: number; rig: Rig; image: RgbaImage } | null = null
  for (let turns = 0; turns < 4; turns++) {
    const turned = rotateQuarter(image, turns)
    const rig = estimateRig(turned)
    if (!best || rig.confidence > best.rig.confidence) best = { turns, rig, image: turned }
  }
  if (!best) return { image, rig: estimateRig(image), turns: 0, flipped: false }

  if (best.rig.confidence < RIG_MIN_CONFIDENCE) {
    // 自信が無い。触らずに返す
    const rig = estimateRig(image)
    return { image, rig, turns: 0, flipped: false }
  }

  if (backIsUp(best.image)) {
    return { image: best.image, rig: best.rig, turns: best.turns, flipped: false }
  }

  // 上下が逆。ひっくり返してから、その向きで測り直す
  const flipped = flipVertical(best.image)
  return { image: flipped, rig: estimateRig(flipped), turns: best.turns, flipped: true }
}
