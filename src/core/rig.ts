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
  /** 頭が絵の右側にあるか。`headKnown` が false のときは当てにならない */
  readonly headsRight: boolean
  /**
   * 頭がどちら側かを、絵から本当に決められたか。
   *
   * 決められないのに決め打ちすると、**頭を振りながら尾から進む**絵になる
   *（会場で実際にそう見えた・R-030）。分からないときは分からないと言う。
   * 古い絵には入っていないので、読むときは `headIsKnown()` を使う。
   */
  readonly headKnown?: boolean
  /** 推定の確からしさ。低いときは使わない */
  readonly confidence: number
  /** 誰が出したか。AI と比べるために残す */
  readonly source: 'shape' | 'model'
  /**
   * 何の生き物か。動き方を変えるために使う。
   * 古い絵には入っていないので、読むときは既定を `'unknown'` にする。
   */
  readonly kind?: CreatureKind
  /** 足の先が下側か。`kind === 'tentacled'` のときだけ意味がある */
  readonly tipsDown?: boolean
  /**
   * 背びれ・腹びれ。胴から突き出している部分。
   * **台紙が決まればこの推定は要らなくなる**（`docs/やること.md` T-1）。
   */
  readonly fins?: readonly FinGuess[]
}

/** リグを使うかどうかの境目。これ未満なら今まで通りの動きにする。 */
export const RIG_MIN_CONFIDENCE = 0.35

/**
 * 勝ったほうの広がりが、負けたほうの何倍あれば「頭が分かった」とみなすか。
 *
 * 両端とも同じくらい広がっている絵（両端にひれがある・左右対称）は、
 * 形だけでは頭を決められない。僅差で勝ったほうを採ると、半分は外れる。
 * **外れると頭が振れる**ので、僅差なら「分からない」に倒す。
 */
export const HEAD_MARGIN = 1.25

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

  /*
   * 頭を決められたか。**片側だけがはっきり広がっているとき**だけ。
   *
   * 実測（実物3枚）: 魚は 1.77 対 0.00 ではっきり付くが、
   * タコとイカは 0.00 対 0.00 で、それでも従来は「右が頭」を返していた。
   * その決め打ちが、会場での「頭がくねくねする」「尾から進む」の原因だった。
   */
  const strong = Math.max(leftScore, rightScore)
  const weak = Math.min(leftScore, rightScore)
  const headKnown =
    flareConfidence(strong) >= RIG_MIN_CONFIDENCE && (weak === 0 || strong / weak >= HEAD_MARGIN)

  const spineLeftToRight = midline(spans)
  const spine = headsRight ? [...spineLeftToRight].reverse() : spineLeftToRight

  const kind = detectKind(image, guess)

  // 足のある生き物に尾びれの動きを当てない。
  // 足の1本を尾と取り違えて、体の後ろが理由もなくちぎれて揺れる。
  if (!guess || kind === 'tentacled') {
    return {
      spine,
      tail: null,
      headsRight,
      headKnown,
      confidence: 0,
      source: 'shape',
      kind,
      tipsDown: kind === 'tentacled' ? tipsAtBottom(image) : undefined,
    }
  }

  // `from` は頭からの割合。絵の中の x に直す
  const pivotX = headsRight ? 1 - guess.from : guess.from
  const index = Math.min(spans.length - 1, Math.floor(pivotX * spans.length))
  const span = spans[index]

  /*
   * ひれを探す範囲は「胴」だけ。尾びれの側は除く。
   * 頭が右なら、尾は絵の左側にある。
   */
  const bodyFrom = headsRight ? pivotX : 0
  const bodyTo = headsRight ? 1 : pivotX
  const body = { from: bodyFrom, to: bodyTo }
  const fins = [...findFins(spans, 'top', body), ...findFins(spans, 'bottom', body)]

  return {
    spine,
    tail: {
      from: guess.from,
      pivot: { x: pivotX, y: span.height > 0 ? (span.top + span.bottom) / 2 : 0.5 },
    },
    headsRight,
    headKnown,
    confidence: flareConfidence(guess.flare),
    source: 'shape',
    kind,
    fins,
  }
}

/** リグを動きに使ってよいか。 */
export function rigIsUsable(rig: Rig | null | undefined): rig is Rig {
  return !!rig && rig.tail !== null && rig.confidence >= RIG_MIN_CONFIDENCE
}

/**
 * 頭がどちら側かを当てにしてよいか。
 *
 * ここが false の絵は、**しならせない・左右反転もしない**。
 * 頭が分からないまま動かすと、頭を振りながら尾から進むことになる（R-030）。
 *
 * `headKnown` が入っていない古い絵は、尾びれが見つかっていたかどうかで代用する。
 * 尾が見つかっていれば、その反対側が頭だと分かっていたということ。
 */
export function headIsKnown(rig: Rig | null | undefined): boolean {
  if (!rig) return false
  return rig.headKnown ?? rigIsUsable(rig)
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

/* ------------------------------------------------------------------
 * 生き物の種類
 *
 * 魚とタコ・イカでは動き方が違う。
 * 尾びれの無い絵に「尾を振る」動きを当てると、体の後ろが理由もなく
 * ちぎれて揺れる。**何も動かないより悪い。**
 *
 * 見分け方は「足の本数」。タコ・イカ・クラゲは、胴から**細長い足が
 * 何本も**生えている。絵を横一列に走査すると、足の並んでいる高さでは
 * **線が何度も途切れる**。魚の胴は1本に繋がっている。
 * ------------------------------------------------------------------ */

export type CreatureKind = 'fish' | 'tentacled' | 'unknown'

/** 1本の走査線が、絵を何回横切るか。 */
export function runsAlongRow(image: RgbaImage, y: number): number {
  let runs = 0
  let inside = false
  for (let x = 0; x < image.width; x++) {
    const solid = image.data[(y * image.width + x) * 4 + 3] >= ALPHA_THRESHOLD
    if (solid && !inside) runs++
    inside = solid
  }
  return runs
}

export function runsAlongColumn(image: RgbaImage, x: number): number {
  let runs = 0
  let inside = false
  for (let y = 0; y < image.height; y++) {
    const solid = image.data[(y * image.width + x) * 4 + 3] >= ALPHA_THRESHOLD
    if (solid && !inside) runs++
    inside = solid
  }
  return runs
}

/**
 * 足の並びの強さ。1本の走査線が絵を3回以上／4回以上横切った本数を数える。
 *
 * **割合ではなく本数で数える。** 最初は「足のある行の割合」で測っていたが、
 * 頭が大きく足が短いタコ（実物）では 20 行中 4 行しか当たらず、
 * 割合が薄まって魚と誤判定した。足は絵の一部にしか無いのが普通。
 */
export interface TentacleSignal {
  /** 3回以上横切った線の本数 */
  readonly lines3: number
  /** 4回以上横切った線の本数 */
  readonly lines4: number
}

export function tentacleSignal(image: RgbaImage, samples = 40): TentacleSignal {
  const scan = (size: number, runsAt: (index: number) => number): TentacleSignal => {
    let lines3 = 0
    let lines4 = 0
    for (let index = 0; index < samples; index++) {
      const at = Math.min(size - 1, Math.floor(((index + 0.5) * size) / samples))
      const runs = runsAt(at)
      if (runs >= 3) lines3++
      if (runs >= 4) lines4++
    }
    return { lines3, lines4 }
  }
  // 縦と横の両方で測って多いほう。足を下へ垂らした絵と横へ広げた絵の両方があるため
  const rows = scan(image.height, (y) => runsAlongRow(image, y))
  const columns = scan(image.width, (x) => runsAlongColumn(image, x))
  return {
    lines3: Math.max(rows.lines3, columns.lines3),
    lines4: Math.max(rows.lines4, columns.lines4),
  }
}

/**
 * 足のある生き物とみなす境目。**実物3枚で測った値**。
 *
 *   魚 lines3=1  lines4=0
 *   タコ lines3=5  lines4=2
 *   イカ lines3=14 lines4=14
 *
 * どちらか一方でも超えたら足あり、にしている。
 * 足を大きく広げた絵（イカ）と、足が短い絵（タコ）の両方を拾うため。
 * **標本は3枚。** 増えたら測り直すこと。
 */
export const TENTACLE_LINES_3 = 4
export const TENTACLE_LINES_4 = 2

export function hasTentacles(image: RgbaImage): boolean {
  const signal = tentacleSignal(image)
  return signal.lines4 >= TENTACLE_LINES_4 || signal.lines3 >= TENTACLE_LINES_3
}

/**
 * 生き物の種類を決める。
 *
 * 足の判定を先に見るのは、**タコの足の1本が尾びれに見えることがある**ため。
 * くびれと広がりだけで判定すると、タコを魚として扱ってしまう。
 * どちらとも言えない絵（四角・虹）は `unknown` にして、動きを控えめにする。
 */
export function detectKind(image: RgbaImage, tail: TailGuess | null): CreatureKind {
  if (hasTentacles(image)) return 'tentacled'
  if (tail && flareConfidence(tail.flare) >= RIG_MIN_CONFIDENCE) return 'fish'
  return 'unknown'
}

/**
 * 足の先が絵の下側にあるか。
 *
 * タコもイカもクラゲも、普通は**足を下に垂らして**描かれる。
 * ただし紙の向きは描いた人が決めるので（R-019）、上下逆のこともある。
 * 足の並んでいる（線が何度も途切れる）行が、上半分と下半分のどちらに
 * 多いかで決める。波はここへ向かって大きくなる。
 */
export function tipsAtBottom(image: RgbaImage, samples = 40): boolean {
  let top = 0
  let bottom = 0
  for (let index = 0; index < samples; index++) {
    const y = Math.min(image.height - 1, Math.floor(((index + 0.5) * image.height) / samples))
    if (runsAlongRow(image, y) < 3) continue
    if (y < image.height / 2) top++
    else bottom++
  }
  // 同数なら下。垂らして描くほうが普通なので、迷ったらそちらに寄せる
  return bottom >= top
}

/* ------------------------------------------------------------------
 * 背びれ・腹びれ
 *
 * 胴の輪郭から**外へ突き出している部分**を探す。
 * 尾びれは体の後ろ端にあるので幅の変化（くびれ）で見つかるが、
 * 背びれ・腹びれは胴の途中にあるので、上下の縁の出っ張りで見つける。
 *
 * **台紙が決まればこの推定は要らなくなる**（`docs/やること.md` T-1）。
 * それまでの繋ぎとして入れている。
 * ------------------------------------------------------------------ */

export interface FinGuess {
  /** 絵の左端からの割合。ひれの範囲 */
  readonly from: number
  readonly to: number
  /** 上の縁か下の縁か */
  readonly side: 'top' | 'bottom'
  /** 胴の輪郭からどれだけ突き出しているか（絵の高さに対する割合） */
  readonly depth: number
  /** ひれの付け根の高さ（絵の高さに対する割合）。ここを軸に回す */
  readonly base: number
}

/**
 * 並びの中央値。胴の輪郭の目安に使う。
 *
 * 平均ではなく中央値にするのは、**ひれ自身に引っ張られないため**。
 * ひれは幅の狭い出っ張りなので、中央値ならほとんど動かない。
 */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length === 0) return 0
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** ひれとみなす出っ張りの深さ（絵の高さに対する割合）。 */
export const MIN_FIN_DEPTH = 0.05

/**
 * 上または下の縁から、突き出している部分を探す。
 *
 * 幅の広い窓の中央値を「胴の輪郭」とみなし、そこから離れたところをひれとする。
 * 窓を広く取るのは、ひれの幅ぶんだけでは中央値がひれ側に寄ってしまうため。
 */
export function findFins(
  spans: readonly ColumnSpan[],
  side: 'top' | 'bottom',
  /** 胴として見る範囲（絵の左端からの割合）。尾びれの側は除く */
  body: { readonly from: number; readonly to: number } = { from: 0, to: 1 },
  minDepth = MIN_FIN_DEPTH,
): FinGuess[] {
  const count = spans.length
  if (count < 8) return []

  const edge = spans.map((span) => (side === 'top' ? span.top : span.bottom))
  const window = Math.max(5, Math.round(count * 0.45))

  const fins: FinGuess[] = []
  let start = -1
  let deepest = 0
  let baseAtDeepest = side === 'top' ? 0 : 1

  for (let index = 0; index < count; index++) {
    const at = (index + 0.5) / count
    // 尾びれは別に振るので、胴の外は見ない。
    // 見ると尾の上下の羽を「背びれ・腹びれ」として二重に拾う
    if (at < body.from || at > body.to || spans[index].height === 0) {
      if (start >= 0) {
        fins.push({ from: start / count, to: index / count, side, depth: deepest, base: baseAtDeepest })
        start = -1
        deepest = 0
      }
      continue
    }
    const from = Math.max(0, index - Math.floor(window / 2))
    const to = Math.min(count, from + window)
    const nearby: number[] = []
    for (let k = from; k < to; k++) if (spans[k].height > 0) nearby.push(edge[k])
    const bodyEdge = median(nearby)
    // 上の縁は値が小さいほど高い。下の縁はその逆
    const depth = side === 'top' ? bodyEdge - edge[index] : edge[index] - bodyEdge

    if (depth >= minDepth) {
      if (start < 0) start = index
      if (depth > deepest) {
        deepest = depth
        baseAtDeepest = bodyEdge
      }
    } else if (start >= 0) {
      fins.push({ from: start / count, to: index / count, side, depth: deepest, base: baseAtDeepest })
      start = -1
      deepest = 0
    }
  }
  if (start >= 0) {
    fins.push({ from: start / count, to: 1, side, depth: deepest, base: baseAtDeepest })
  }

  // 幅が狭すぎるものは輪郭のギザギザ。広すぎるものは胴そのもの
  return fins.filter((fin) => {
    const width = fin.to - fin.from
    return width >= 0.04 && width <= 0.4
  })
}
