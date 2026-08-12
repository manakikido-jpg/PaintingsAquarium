import { cloneImage, type RgbaImage } from './image'

export interface KeepMainRegionsOptions {
  /** 一番大きい塊に対して、この割合より小さい塊は捨てる（0〜1） */
  minAreaRatio?: number
  alphaThreshold?: number
}

export interface KeepMainRegionsResult {
  readonly image: RgbaImage
  /** 捨てた塊の数 */
  readonly droppedRegions: number
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
  { minAreaRatio = 0.05, alphaThreshold = 8 }: KeepMainRegionsOptions = {},
): KeepMainRegionsResult {
  const { width, height, data } = source
  const result = cloneImage(source)
  const total = width * height
  if (total === 0) return { image: result, droppedRegions: 0, touchedBorder: false }

  const labels = new Int32Array(total).fill(-1)
  const stack = new Int32Array(total)
  const areas: number[] = []
  const touchesBorder: boolean[] = []

  const isOpaque = (index: number): boolean => data[index * 4 + 3] > alphaThreshold

  for (let start = 0; start < total; start++) {
    if (labels[start] !== -1 || !isOpaque(start)) continue

    const label = areas.length
    areas.push(0)
    touchesBorder.push(false)

    let stackSize = 0
    labels[start] = label
    stack[stackSize++] = start

    while (stackSize > 0) {
      const index = stack[--stackSize]
      const x = index % width
      const y = (index - x) / width
      areas[label]++
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

  if (areas.length === 0) return { image: result, droppedRegions: 0, touchedBorder: false }

  const inner = areas.map((_, label) => label).filter((label) => !touchesBorder[label])
  const touchedBorder = inner.length === 0
  const candidates = touchedBorder ? areas.map((_, label) => label) : inner

  let largestArea = 0
  for (const label of candidates) largestArea = Math.max(largestArea, areas[label])

  const keep = new Set(
    candidates.filter((label) => areas[label] >= largestArea * minAreaRatio),
  )

  for (let index = 0; index < total; index++) {
    const label = labels[index]
    if (label === -1 || keep.has(label)) continue
    result.data[index * 4 + 3] = 0
  }

  return { image: result, droppedRegions: areas.length - keep.size, touchedBorder }
}
