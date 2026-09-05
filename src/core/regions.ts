import { cloneImage, type RgbaImage } from './image'

export interface KeepMainRegionsOptions {
  /** 一番大きい塊に対して、この割合より小さい塊は捨てる（0〜1） */
  minAreaRatio?: number
  /**
   * **離れている塊を捨てる基準の広さ**（一番大きい塊に対する割合）。
   *
   * `minAreaRatio` より大きくても、本体から離れていればここで捨てる。
   * 台紙の題（「お絵かき水族館」）を落とすための規則（R-065）。
   */
  farAreaRatio?: number
  /**
   * 「離れている」とみなす距離（本体の外接矩形の対角に対する割合）。
   *
   * 実測: 題は対角の **10%** 離れていた。
   * 一方、輪郭が切れてちぎれた絵の一部は、本体の箱と**重なっていた**（0%）。
   */
  farGapRatio?: number
  alphaThreshold?: number
}

export interface KeepMainRegionsResult {
  readonly image: RgbaImage
  /** 捨てた塊の数 */
  readonly droppedRegions: number
  /**
   * 残した塊の数。
   *
   * **台紙どおりに取り込めた絵は、必ず 1 つになる**（実測 33/33）。
   * 2 つ以上に割れているのは、輪郭の切れ目から塗りつぶしが入って
   * 中身が食われた状態（R-066）。切り抜き方を選ぶ物差しに使う。
   */
  readonly keptRegions: number
  /**
   * 絵が写真の縁に接していたため、縁に触れる塊を捨てる規則を使えなかった。
   * 紙が画面いっぱいに写っている＝撮り方の問題なので、画面側で警告に使う。
   */
  readonly touchedBorder: boolean
}

/**
 * 絵の本体だけを残し、離れた小さな塊を捨てる。
 *
 * 照明が均一でない写真だと、紙の隅が影で暗くなり「紙ではない」と判定されて
 * 塊として残る。放っておくと外接矩形が絵の何倍にも膨らみ、水槽の中で
 * 絵が極端に小さく表示される（R-003）。
 *
 * 判定は2段構え。
 * 1. 写真の縁に接している塊は捨てる。紙の影は必ず縁から始まるが、
 *    絵は紙の内側に描かれるため。
 * 2. 残った中で一番大きい塊に対して小さすぎる塊も捨てる。ゴミや紙の折り目。
 *
 * 縁に接していない塊が1つも無いときは、1 を諦めて全部を候補に戻す。
 * 絵が紙いっぱいに描かれている場合に、絵ごと消してしまわないため。
 */
export function keepMainRegions(
  source: RgbaImage,
  {
    minAreaRatio = 0.05,
    farAreaRatio = 0.15,
    farGapRatio = 0.05,
    alphaThreshold = 8,
  }: KeepMainRegionsOptions = {},
): KeepMainRegionsResult {
  const { width, height, data } = source
  const result = cloneImage(source)
  const total = width * height
  if (total === 0) return { image: result, droppedRegions: 0, keptRegions: 0, touchedBorder: false }

  const labels = new Int32Array(total).fill(-1)
  const stack = new Int32Array(total)
  const areas: number[] = []
  const touchesBorder: boolean[] = []
  // 塊ごとの外接矩形。本体からどれだけ離れているかを測るのに使う（R-065）
  const boxes: { left: number; top: number; right: number; bottom: number }[] = []

  const isOpaque = (index: number): boolean => data[index * 4 + 3] > alphaThreshold

  for (let start = 0; start < total; start++) {
    if (labels[start] !== -1 || !isOpaque(start)) continue

    const label = areas.length
    areas.push(0)
    touchesBorder.push(false)
    boxes.push({ left: width, top: height, right: -1, bottom: -1 })

    let stackSize = 0
    labels[start] = label
    stack[stackSize++] = start

    while (stackSize > 0) {
      const index = stack[--stackSize]
      const x = index % width
      const y = (index - x) / width
      areas[label]++
      const box = boxes[label]
      if (x < box.left) box.left = x
      if (x > box.right) box.right = x
      if (y < box.top) box.top = y
      if (y > box.bottom) box.bottom = y
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBorder[label] = true

      const push = (neighbour: number): void => {
        if (labels[neighbour] !== -1 || !isOpaque(neighbour)) return
        labels[neighbour] = label
        stack[stackSize++] = neighbour
      }

      if (x > 0) push(index - 1)
      if (x < width - 1) push(index + 1)
      if (y > 0) push(index - width)
      if (y < height - 1) push(index + width)
    }
  }

  if (areas.length === 0) return { image: result, droppedRegions: 0, keptRegions: 0, touchedBorder: false }

  const inner = areas.map((_, label) => label).filter((label) => !touchesBorder[label])
  const touchedBorder = inner.length === 0
  const candidates = touchedBorder ? areas.map((_, label) => label) : inner

  let largestArea = 0
  let main = candidates[0]
  for (const label of candidates) {
    if (areas[label] > largestArea) {
      largestArea = areas[label]
      main = label
    }
  }

  /*
   * **本体から離れた塊を捨てる（R-065）。**
   *
   * 台紙には題（「お絵かき水族館」）が印刷してある。ふつうは文字が
   * ばらばらの小さい塊になるので `minAreaRatio` で落ちるが、
   * 輪郭に切れ目があって塞ぐ幅を広げると（R-057）**文字どうしが繋がって
   * ひとかたまりになり、絵の一部として残る**。
   * そうなると外接矩形が題まで伸びて、台紙との照合が外れる。
   *
   * 実測（まる魚・輪郭に 2mm の切れ目）:
   *
   * | | 広さ（本体比） | 本体の箱と重なるか | 離れ（対角比） |
   * |---|---|---|---|
   * | 題 | 5.7% | **重ならない** | **10%** |
   * | ちぎれた絵の一部（5mm の切れ目） | 30〜36% | 重なる | 0% |
   *
   * **広さだけでは分けられない**（題 5.7% とちぎれた一部 7.4% が並ぶ）。
   * 離れているかどうかを合わせて見る。
   */
  const box = boxes[main]
  const diagonal = Math.hypot(box.right - box.left, box.bottom - box.top)
  const farLimit = diagonal * farGapRatio

  const gapFromMain = (label: number): number => {
    const other = boxes[label]
    const dx = Math.max(box.left - other.right, other.left - box.right, 0)
    const dy = Math.max(box.top - other.bottom, other.top - box.bottom, 0)
    return Math.hypot(dx, dy)
  }

  const keep = new Set(
    candidates.filter((label) => {
      if (areas[label] < largestArea * minAreaRatio) return false
      if (label === main) return true
      if (areas[label] >= largestArea * farAreaRatio) return true
      return gapFromMain(label) <= farLimit
    }),
  )

  for (let index = 0; index < total; index++) {
    const label = labels[index]
    if (label === -1 || keep.has(label)) continue
    result.data[index * 4 + 3] = 0
  }

  return {
    image: result,
    droppedRegions: areas.length - keep.size,
    keptRegions: keep.size,
    touchedBorder,
  }
}
