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
 * **絵ひとつ分だけを残す（R-069）。照合に渡す形を作るためのもの。**
 *
 * `keepMainRegions` とは役目が違う。あちらは「保存する絵」からゴミを落とす。
 * こちらは `insideOutline` の結果から「台紙の絵はどれか」を選ぶ。
 *
 * **なぜ要るのか**
 *
 * 会場の紙（2026-09-11・プテラノドン）は、絵の中をほとんど塗らずに
 * **紙の余白いっぱいにクレヨンで落書き**してあった。落書きの何本かが
 * 翼の線をまたいでいたので、切り抜いたあとの塊は
 * 「絵＋紙じゅうの落書き」がひとつながりになり、
 * 外接矩形が紙いっぱいに広がって絵が全体の一部に縮んだ。
 * 台紙との重なりは実測で **0.98 → 0.09〜0.44**。種類が付かず、
 * プテラノドンが飛ばずに地面を歩いた（頭の向きも当てずっぽうになる）。
 *
 * **「一番大きい塊」だけでは足りない。**
 *
 * 台紙の絵の内側は、**印刷された線で仕切られている**。プテラノドンなら
 * 胴・左右の翼・翼膜の区画に分かれていて、`insideOutline` はそれぞれを
 * 別の塊として返す。素直に一番大きい塊を採ると、実測で**右の翼だけ**が
 * 残った（重なり 0.403）。
 *
 * そこで**印刷線ぶんだけ太らせてから**数える。線1本を挟んで隣り合う区画は
 * ひとつながりとみなせる。落書きの輪は絵から離れているので、
 * この幅では繋がらない。
 */
export function largestRegion(source: RgbaImage, alphaThreshold = 8): RgbaImage {
  const { width, height, data } = source
  const result = cloneImage(source)
  const total = width * height
  if (total === 0) return result

  const opaque = new Uint8Array(total)
  for (let index = 0; index < total; index++) {
    if (data[index * 4 + 3] > alphaThreshold) opaque[index] = 1
  }

  /*
   * 仕切りの印刷線を跨ぐ幅。
   *
   * 取り込みは長辺 1200px に縮めてある（`processImage` の `MAX_SIDE`）。
   * そこでの台紙の線の太さは実測 **2.0〜4.0px**（恐竜5種・等倍と 0.7 倍）。
   * 両側から太らせるので、半径 3 で 6px ぶんの隙間まで繋がる。
   * 絵が小さく写っているときのために、短辺からも決める。
   */
  const bridge = Math.max(2, Math.min(6, Math.round(Math.min(width, height) * 0.004)))
  const grown = dilate(opaque, width, height, bridge)

  const labels = new Int32Array(total).fill(-1)
  const stack = new Int32Array(total)
  /** 太らせた塊ごとに、**元の**不透明な画素が何枚あるか。太らせた分は数えない */
  const areas: number[] = []

  for (let start = 0; start < total; start++) {
    if (labels[start] !== -1 || grown[start] === 0) continue
    const label = areas.length
    areas.push(0)
    let stackSize = 0
    labels[start] = label
    stack[stackSize++] = start
    while (stackSize > 0) {
      const index = stack[--stackSize]
      const x = index % width
      const y = (index - x) / width
      if (opaque[index] === 1) areas[label]++
      const push = (neighbour: number): void => {
        if (labels[neighbour] !== -1 || grown[neighbour] === 0) return
        labels[neighbour] = label
        stack[stackSize++] = neighbour
      }
      if (x > 0) push(index - 1)
      if (x < width - 1) push(index + 1)
      if (y > 0) push(index - width)
      if (y < height - 1) push(index + width)
    }
  }

  if (areas.length === 0) return result

  let main = 0
  for (let label = 1; label < areas.length; label++) {
    if (areas[label] > areas[main]) main = label
  }

  for (let index = 0; index < total; index++) {
    if (opaque[index] === 0 || labels[index] !== main) result.data[index * 4 + 3] = 0
  }
  return result
}

/**
 * 印を `radius` 画素ぶん太らせる。縦と横に分けて走るので、半径を上げても重くならない。
 *
 * 形は正方形（チェビシェフ距離）。円にする意味は無い。
 * ここで欲しいのは「線1本ぶん跨げるか」だけで、跨げる距離が向きで
 * 1.4 倍ずれても結果は変わらない。
 */
function dilate(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const pass = (input: Uint8Array, along: 'x' | 'y'): Uint8Array => {
    const output = new Uint8Array(input.length)
    const outer = along === 'x' ? height : width
    const inner = along === 'x' ? width : height
    for (let a = 0; a < outer; a++) {
      // 直前に見た印からの距離。一度なぞるだけで前後どちらの印も拾える
      let since = inner
      for (let b = 0; b < inner; b++) {
        const index = along === 'x' ? a * width + b : b * width + a
        since = input[index] === 1 ? 0 : since + 1
        if (since <= radius) output[index] = 1
      }
      since = inner
      for (let b = inner - 1; b >= 0; b--) {
        const index = along === 'x' ? a * width + b : b * width + a
        since = input[index] === 1 ? 0 : since + 1
        if (since <= radius) output[index] = 1
      }
    }
    return output
  }
  return pass(pass(mask, 'x'), 'y')
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

  /*
   * **縁に触れる塊でも、中身が詰まっていれば捨てない（R-067）。**
   *
   * 「縁に触れる塊は捨てる」規則（R-003）は、紙の隅の影のような
   * **小さなゴミ**を落とすためのもの。ところが実物の写真では、
   * カメラの構え方次第で**絵そのもの**が縁にわずかでも触れることがある
   * （紙をぎりぎりまで大きく写す・紙の端まで色を塗る、など）。
   *
   * 絵は台紙の印刷線でひと続きに繋がっているので、縁に1画素でも触れると
   * **絵ぜんぶ**がまとめて「縁のゴミ」として落ちる。残るのは題（印刷文字）
   * のような、縁から離れた小さな塊だけになり、**題が絵として保存されていた**
   * （会場から「色の塗り方によって中が透明になる」）。
   *
   * ただし「一番大きい塊を無条件に残す」だけでは別の実物写真で壊れた。
   * 台紙を黒い台などに置いて撮ると、紙からはみ出た背景が「紙ではない」
   * （＝クレヨンと同じ扱い）と誤判定され、額縁のような形の塊になる。
   * この額縁は面積が絵より大きくなりがちで、縁にも触れる。無条件に残すと
   * 額縁ごと絵として保存され、種類判定の的（絵の輪郭）が崩れて外れやすくなった
   * （実測: 会場データで種類判定が 11/19 → 6/19 に悪化）。
   *
   * 額縁と本物の絵は「外接矩形に対してどれだけ埋まっているか」で見分けられる。
   * 額縁は中が空洞（紙の分だけ穴が空く）なので詰まり方が薄いが、
   * 絵は多少はみ出して塗っても塊自体は密。実測（会場データ）:
   *
   * | | 詰まり方（面積 / 外接矩形） |
   * |---|---|
   * | 額縁（背景の誤判定、5枚） | 13.1%〜21.9% |
   * | 本物の絵（縁に触れた本体） | 45.3%〜70.9% |
   *
   * **詰まり方だけでも足りなかった。** スキャナで紙を2枚重ねて取り込んだ
   * 場合（別の既知の不具合。運用の直し方は別途検討）、2枚目の絵も
   * 密な塊として縁に触れ、詰まり方の検査を通ってしまう。
   * ところがこの場合、**1枚目の絵はすでに縁に触れない塊として
   * 単独で十分な大きさ**を持っている。縁の塊に頼る必要は無い。
   *
   * そこで「内側の塊が既に十分大きいか」も見る。実測（会場データ）:
   *
   * | | 内側の一番大きい塊 ÷ 縁の候補の面積 |
   * |---|---|
   * | 題だけが内側に残る（本来の不具合） | 0.4% |
   * | 2枚重ねで1枚目が内側に残る | 48%〜98% |
   *
   * 内側の塊がすでに縁の候補の 20% 以上あれば「単独で十分」とみなし、
   * 縁の塊には手を出さない。無いか小さすぎるときだけ、縁の塊を候補に加える。
   */
  const SOLID_FILL_RATIO = 0.3
  const SELF_SUFFICIENT_RATIO = 0.2
  let mainBorderLabel = -1
  let mainBorderArea = 0
  for (let label = 0; label < areas.length; label++) {
    if (!touchesBorder[label]) continue
    const box = boxes[label]
    const bboxArea = (box.right - box.left + 1) * (box.bottom - box.top + 1)
    const fillRatio = bboxArea > 0 ? areas[label] / bboxArea : 0
    if (fillRatio < SOLID_FILL_RATIO) continue
    if (areas[label] > mainBorderArea) {
      mainBorderArea = areas[label]
      mainBorderLabel = label
    }
  }

  const inner = areas.map((_, label) => label).filter((label) => !touchesBorder[label])
  let largestInnerArea = 0
  for (const label of inner) {
    if (areas[label] > largestInnerArea) largestInnerArea = areas[label]
  }
  if (mainBorderLabel !== -1 && largestInnerArea >= mainBorderArea * SELF_SUFFICIENT_RATIO) {
    mainBorderLabel = -1
  }

  const candidateSet = new Set(inner)
  if (mainBorderLabel !== -1) candidateSet.add(mainBorderLabel)
  // 縁に触れない塊が1つも無ければ、これまでどおり全部を候補に戻す
  const candidates = inner.length > 0 ? [...candidateSet] : areas.map((_, label) => label)

  let largestArea = 0
  let main = candidates[0]
  for (const label of candidates) {
    if (areas[label] > largestArea) {
      largestArea = areas[label]
      main = label
    }
  }

  /*
   * お知らせの合図は「本体が縁に触れているか」に変える。
   * 以前は「縁に触れない塊が1つも無いか」を見ていたが、
   * それだと本体を残せた今回のような場合に警告が出ない。
   * 本体が縁に触れているなら、次はもう少し余白を空けてほしい、という助言は変わらず要る。
   */
  const touchedBorder = touchesBorder[main]

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
