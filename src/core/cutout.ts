import { cloneImage, saturation, value, type RgbaImage } from './image'

/**
 * 紙の白を透明にする設定。
 *
 * 実物の写真がまだ無く（要件定義 D-1）、照明・紙の黄ばみ・カメラで
 * 最適値が変わるため、既定値は「そこそこ」でしかない。
 * 会期前に運営者が設定画面で 1 回だけ合わせる前提で、調整可能にしてある。
 */
export interface CutoutOptions {
  /** 紙とみなす明るさの下限。これより暗い画素は絵として残す（0〜1） */
  paperValue: number
  /** 紙とみなす鮮やかさの上限。これより鮮やかな画素は明るくても絵として残す（0〜1） */
  paperSaturation: number
  /** 境界をぼかす幅。0 にすると輪郭がギザギザになる（0〜1） */
  feather: number
  /**
   * 明るさのしきい値を写真ごとに自動で選ぶか。
   *
   * 紙も照明も毎回違うので、既定は自動。
   * 手で決めたいときだけ切る（そのとき `paperValue` が使われる）。
   * 古い設定ファイルには入っていないので、未指定は自動とみなす。
   */
  auto?: boolean
}

export const DEFAULT_CUTOUT_OPTIONS: CutoutOptions = {
  // 既定は自動。会場のスタッフにつまみを触らせないため
  auto: true,
  /*
   * 実物の絵1枚（新聞紙に青のマーカー）で測った安全域は 0.50〜0.66 だった。
   * 0.68 以上にすると**絵が丸ごと消え、紙の裏写りだけが残る**（R-018）。
   * 安全域の真ん中を採る。下げすぎると薄い色（黄色のクレヨンなど）まで
   * 紙とみなして消してしまうので、これ以上は下げない。
   *
   * **標本は1枚。** 紙も画材も1種類しか試せていないので、
   * 会場の紙で必ず測り直すこと（`docs/リハーサル手順.md` ③）。
   */
  paperValue: 0.62,
  paperSaturation: 0.18,
  feather: 0.1,
}

/**
 * 紙の色から、どれだけ色が離れていたら「絵」とみなすか（0〜1）。
 *
 * **鮮やかさの上限だけでは、うすい色が消える。**
 * 会場から「オレンジで書いた絵も透明になることがある」と言われて測ったら、
 * 鮮やかさはこうだった（上限は 0.18＋ぼかし 0.1 ＝ 0.28）。
 *
 *     こいオレンジ 0.83 ／ ふつうのオレンジ 0.65 → 残る
 *     うすいオレンジ 0.33                      → 残る
 *     とてもうすいオレンジ 0.18 ／ はだ色 0.23 ／ うすい黄色 0.25 → **消えていた**
 *
 * 軽く塗ったクレヨンはここに入る。しかも塗りつぶしは紙の外周から広がるので、
 * **枠外まではみ出して塗ると、その色が紙とつながって食われる**。
 *
 * そこで「絵ごとに紙の色を実測して、そこからのズレを見る」ようにした。
 * うすいオレンジ (255,214,170) と紙 (252,251,247) は、鮮やかさは近いが
 * **色そのものは遠い**（明るさを揃えて比べると 0.31 離れている）。
 *
 * この判定は**残す方向にしか効かない**（鮮やかさの上限はそのまま残してある）。
 * 消しすぎるより残しすぎるほうが直しやすい。残ったら設定のつまみで下げられるが、
 * 消えた絵は戻らない。
 */
export const PAPER_TINT_TOLERANCE = 0.08

/**
 * その絵の「紙の色」。外周の帯の中央値を採る。
 *
 * **平均ではなく中央値。** 絵が紙の端まで写っていると（`touchedBorder`）、
 * 平均だとその色に引きずられる。中央値なら、外周の半分以上が紙である限り効く。
 */
export function paperColour(image: RgbaImage): readonly [number, number, number] {
  const { width, height, data } = image
  if (width === 0 || height === 0) return [255, 255, 255]

  // 外周の帯。細すぎると影を拾い、太すぎると絵に食い込む
  const band = Math.max(1, Math.round(Math.min(width, height) * 0.02))
  const reds: number[] = []
  const greens: number[] = []
  const blues: number[] = []

  const take = (x: number, y: number): void => {
    const offset = (y * width + x) * 4
    reds.push(data[offset])
    greens.push(data[offset + 1])
    blues.push(data[offset + 2])
  }

  // 1画素ずつは要らない。中央値を出すだけなので間引く
  const step = Math.max(1, Math.floor(Math.max(width, height) / 200))
  for (let x = 0; x < width; x += step) {
    for (let y = 0; y < band && y < height; y++) {
      take(x, y)
      take(x, height - 1 - y)
    }
  }
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < band && x < width; x++) {
      take(x, y)
      take(width - 1 - x, y)
    }
  }

  const middle = (values: number[]): number => {
    if (values.length === 0) return 255
    values.sort((a, b) => a - b)
    return values[Math.floor(values.length / 2)]
  }
  return [middle(reds), middle(greens), middle(blues)]
}

/**
 * 紙の色からの離れ具合（0〜1）。
 *
 * **明るさを揃えてから比べる。** 紙は影で暗くなるが色は変わらない。
 * 揃えずに比べると、影の部分が「別の色」になって紙が残る。
 */
export function tintDistance(
  r: number,
  g: number,
  b: number,
  paper: readonly [number, number, number],
): number {
  const brightest = Math.max(r, g, b)
  if (brightest === 0) return 1
  const scale = Math.max(paper[0], paper[1], paper[2]) / brightest
  return (
    Math.max(
      Math.abs(r * scale - paper[0]),
      Math.abs(g * scale - paper[1]),
      Math.abs(b * scale - paper[2]),
    ) / 255
  )
}

/**
 * 紙の白を透明にする。AI は使わない。明るさと鮮やかさのしきい値だけ。
 * 線の形も色も一切変えない（アルファしか触らない）。
 *
 * 素直に「明るい画素を全部透明にする」実装にはしていない。
 * それだと魚の体の内側の塗り残しや、目の白まで抜けて穴だらけになる。
 * 画像の外周から繋がっている白だけを背景とみなすため、外周から塗りつぶし
 * 探索（flood fill）で到達できた画素だけを消している。
 *
 * 計算量は画素数に比例する。数千万画素の写真をそのまま渡すと重いので、
 * 呼び出し側で長辺 1200px 程度に縮めてから渡すこと。
 */
export function cutoutPaper(
  source: RgbaImage,
  options: CutoutOptions = DEFAULT_CUTOUT_OPTIONS,
): RgbaImage {
  const { width, height, data } = source
  const result = cloneImage(source)
  if (width === 0 || height === 0) return result

  const { paperValue, paperSaturation, feather } = options

  // 探索は緩めのしきい値で行う。厳しいほうだけで探索すると、絵の輪郭の
  // 手前で背景が途切れ、絵のまわりに白い縁が残る。
  const looseValue = paperValue - feather
  const looseSaturation = paperSaturation + feather

  const total = width * height
  const isBackground = new Uint8Array(total)
  // 明示的なスタックで探索する。再帰だと大きい画像でスタックが溢れる。
  const stack = new Int32Array(total)
  let stackSize = 0

  /*
   * その絵の紙の色。**絵ごとに測る。**
   * 紙の黄ばみ・照明・スキャナの色味は毎回違うので、決め打ちの白とは比べない。
   */
  const paper = paperColour(source)

  const looksLikePaper = (index: number): boolean => {
    const offset = index * 4
    const r = data[offset]
    const g = data[offset + 1]
    const b = data[offset + 2]
    if (value(r, g, b) < looseValue) return false
    if (saturation(r, g, b) > looseSaturation) return false
    // **紙と色が違うものは、うすくても絵として残す。**
    // ここが無いと、軽く塗ったオレンジや肌色が紙と一緒に消える
    return tintDistance(r, g, b, paper) <= PAPER_TINT_TOLERANCE
  }

  /*
   * **輪郭の小さな切れ目から中へ漏れないようにする（R-056）。**
   *
   * 塗りつぶしは「紙らしい画素」を辿って広がる。台紙の線が印刷のかすれや
   * スキャンで数画素でも途切れていると、そこから絵の中へ入り込み、
   * **塗っていない白い所（＝紙と同じ色）を中まで食う**。
   * 会場から「絵の中の白色は紙の色でも表示してほしい」。
   *
   * そこで、まず**紙らしい範囲を少し痩せさせてから**辿る。
   * 痩せさせると切れ目が塞がるので、中へ入れない。
   * そのままだと絵のまわりに紙の縁が残るので、**辿り終えてから同じ幅だけ太らせる**
   *（紙らしい画素の上だけ）。開いていた所は元どおり消え、
   * 切れ目から入った分だけが残る。
   */
  const paperLike = new Uint8Array(total)
  for (let index = 0; index < total; index++) {
    if (looksLikePaper(index)) paperLike[index] = 1
  }

  /*
   * 塞げる切れ目の幅は、この 2 倍まで。大きくすると細い隙間の紙が残る。
   *
   * **小さい画像では 0 にする。** 取り込む絵は長辺 1200px 前後で、
   * 4px ほど痩せさせても影響が無い。数十画素の画像で同じことをすると
   * 紙が丸ごと痩せて何も消えなくなる（単体テストの絵がそれ）。
   */
  const seal = Math.floor(Math.min(width, height) * 0.004)

  /** 紙らしい範囲を `steps` 画素ぶん痩せさせる（縦横に分けて数える）。 */
  const shrink = (mask: Uint8Array, steps: number): Uint8Array => {
    let current = mask
    for (let pass = 0; pass < 2; pass++) {
      const next = new Uint8Array(total)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const index = y * width + x
          if (current[index] === 0) continue
          let keep = 1
          for (let step = 1; step <= steps && keep === 1; step++) {
            const a = pass === 0 ? x - step : y - step
            const b = pass === 0 ? x + step : y + step
            const limit = pass === 0 ? width : height
            const before = a < 0 ? -1 : pass === 0 ? y * width + a : a * width + x
            const after = b >= limit ? -1 : pass === 0 ? y * width + b : b * width + x
            // 画像の外は紙とみなす。端の紙まで痩せさせない
            if (before >= 0 && current[before] === 0) keep = 0
            if (after >= 0 && current[after] === 0) keep = 0
          }
          next[index] = keep
        }
      }
      current = next
    }
    return current
  }

  const passable = seal > 0 ? shrink(paperLike, seal) : paperLike

  const push = (index: number): void => {
    if (isBackground[index] === 1) return
    if (passable[index] === 0) return
    isBackground[index] = 1
    stack[stackSize++] = index
  }

  for (let x = 0; x < width; x++) {
    push(x)
    push((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    push(y * width)
    push(y * width + width - 1)
  }

  while (stackSize > 0) {
    const index = stack[--stackSize]
    const x = index % width
    const y = (index - x) / width
    if (x > 0) push(index - 1)
    if (x < width - 1) push(index + 1)
    if (y > 0) push(index - width)
    if (y < height - 1) push(index + width)
  }

  /*
   * 痩せさせたぶんを戻す。**紙らしい画素の上だけ**に広げるので、
   * 絵の中へは入らない（絵は紙らしくないので通れない）。
   */
  for (let step = 0; step < seal && passable !== paperLike; step++) {
    const grown: number[] = []
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x
        if (isBackground[index] === 1 || paperLike[index] === 0) continue
        const touching =
          (x > 0 && isBackground[index - 1] === 1) ||
          (x < width - 1 && isBackground[index + 1] === 1) ||
          (y > 0 && isBackground[index - width] === 1) ||
          (y < height - 1 && isBackground[index + width] === 1)
        if (touching) grown.push(index)
      }
    }
    if (grown.length === 0) break
    for (const index of grown) isBackground[index] = 1
  }

  for (let index = 0; index < total; index++) {
    if (isBackground[index] === 0) continue
    const offset = index * 4
    const r = data[offset]
    const g = data[offset + 1]
    const b = data[offset + 2]

    // 厳しいしきい値をどれだけ外しているかで、境界の濃さを決める。
    // 完全に紙なら 0（透明）、緩い判定ぎりぎりなら 1（不透明）。
    const byValue = feather > 0 ? (paperValue - value(r, g, b)) / feather : 0
    const bySaturation = feather > 0 ? (saturation(r, g, b) - paperSaturation) / feather : 0
    const opacity = Math.min(1, Math.max(0, Math.max(byValue, bySaturation)))

    result.data[offset + 3] = Math.round(source.data[offset + 3] * opacity)
  }

  return result
}

/** 透明でない画素が全体の何割かを返す。0〜1。 */
export function opaqueRatio(image: RgbaImage, alphaThreshold = 8): number {
  const total = image.width * image.height
  if (total === 0) return 0
  let count = 0
  for (let index = 0; index < total; index++) {
    if (image.data[index * 4 + 3] > alphaThreshold) count++
  }
  return count / total
}

export type CutoutDiagnosis =
  | { ok: true; opaqueRatio: number }
  | { ok: false; code: 'nothing-left' | 'nothing-removed'; message: string }

/**
 * 切り抜き結果が使い物になるかを判定する。
 *
 * 失敗を「取り込めませんでした」で終わらせないための関数。
 * 何が原因で、どのつまみをどちらに動かせば通るのかまで文言に含める
 * （CLAUDE.md「エラーは原因と対処まで書く」）。
 */
export function diagnoseCutout(image: RgbaImage): CutoutDiagnosis {
  const ratio = opaqueRatio(image)

  if (ratio < 0.001) {
    return {
      ok: false,
      code: 'nothing-left',
      message:
        '絵が全部消えてしまいました。紙として消す明るさの範囲が広すぎます。' +
        '設定の「紙とみなす明るさ」を上げる（暗い側を残す）か、' +
        '写真が暗すぎないか確認してください。',
    }
  }

  if (ratio > 0.95) {
    return {
      ok: false,
      code: 'nothing-removed',
      message:
        '紙の白がほとんど消えませんでした。写真が暗いか、影が強く出ています。' +
        '設定の「紙とみなす明るさ」を下げるか、紙全体に光が当たるように撮り直してください。',
    }
  }

  return { ok: true, opaqueRatio: ratio }
}

/**
 * 切り抜いたあとの絵が「中身のある絵」になっているか。
 *
 * しきい値が高すぎると、絵そのものが消えて**紙の裏写りや影だけ**が残る。
 * 外接矩形は大きいのに中身がほとんど無い、という形で現れる。
 * `diagnoseCutout` は切り抜き直後を見るのでこれを検出できない。
 * ここを通さないと、**何も言わないまま紙の模様が泳ぐ**。
 */
export const MIN_FILL_RATIO = 0.16

export function diagnoseResult(image: RgbaImage): { ok: true } | { ok: false; message: string } {
  let opaque = 0
  for (let index = 3; index < image.data.length; index += 4) {
    if (image.data[index] > 12) opaque++
  }
  const fill = opaque / (image.width * image.height)
  if (fill >= MIN_FILL_RATIO) return { ok: true }
  return {
    ok: false,
    message:
      `絵がほとんど残らず、紙の模様や影だけが残りました（中身 ${Math.round(fill * 100)}%）。` +
      '設定の「紙とみなす明るさ」を下げてください。' +
      '罫線や印刷のある紙（新聞紙・チラシの裏）を使っていると、この状態になりやすいので、' +
      '無地の紙に描いたものを撮り直すのが確実です。',
  }
}

/* ------------------------------------------------------------------
 * しきい値の自動選び
 *
 * 実物3枚で、うまくいくしきい値の範囲が全部違った。
 *   魚（新聞紙）0.50〜0.66 ／ イカ 0.55〜0.62 ／ タコ 0.40〜0.58
 * 紙も照明も毎回違うので、**1つの固定値でどれにも当てるのは無理**。
 *
 * かといって会場のスタッフに毎回つまみを触らせるのは、
 * このアプリの核（アプリ操作0回）を壊す。だから絵ごとに自動で選ぶ。
 * ------------------------------------------------------------------ */

/** 切り抜いた結果に、絵として意味のある中身が入っているか。 */
export interface InkStats {
  /** 外接矩形に対する不透明な画素の割合 */
  readonly fill: number
  /** 不透明な画素のうち、はっきり濃い（＝線や塗り）ものの割合 */
  readonly darkShare: number
}

export function inkStats(image: RgbaImage): InkStats {
  let opaque = 0
  let dark = 0
  for (let index = 0; index < image.data.length; index += 4) {
    if (image.data[index + 3] <= 12) continue
    opaque++
    const luminance =
      (image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114) /
      255
    if (luminance < 0.5) dark++
  }
  const area = Math.max(1, image.width * image.height)
  return { fill: opaque / area, darkShare: opaque === 0 ? 0 : dark / opaque }
}

/**
 * 濃い画素がこれだけ混じっていれば「絵が残っている」とみなす。
 *
 * 実測: うまくいった切り抜きは 29〜53%、失敗（紙の裏写りだけ）は 0〜6%。
 * 間が広く空いているので、境目はこの辺りならどこでもよい。
 */
export const MIN_DARK_SHARE = 0.12

/** 試すしきい値。0.02 刻みだと 1 枚あたりの回数が増えるだけで結果が変わらない。 */
export const CUTOUT_CANDIDATES: readonly number[] = [
  0.4, 0.44, 0.48, 0.52, 0.56, 0.6, 0.64, 0.68, 0.72, 0.76, 0.8,
]

export interface ChosenCutout {
  /** 選んだしきい値 */
  readonly value: number
  /** 通ったしきい値の並び。会場で調べるときのために残す */
  readonly passed: readonly number[]
}

/**
 * この写真に合うしきい値を選ぶ。
 *
 * **通った値の中で「いちばん長く続いた範囲」の真ん中を採る。**
 * 端を採らないのは、紙や照明が少し変わっただけで外れるため。
 * 実物でも、うまくいく範囲は必ずひと続きの帯になっていた。
 *
 * `judge` に、切り抜き後の後処理（塊の選別・トリミング）を渡す。
 * ここに書かないのは、この関数を `regions` や `trim` から独立させておくため。
 */
export function chooseCutoutValue(
  judge: (paperValue: number) => InkStats | null,
  candidates: readonly number[] = CUTOUT_CANDIDATES,
): ChosenCutout | null {
  const passed: number[] = []
  for (const value of candidates) {
    const stats = judge(value)
    if (stats && stats.darkShare >= MIN_DARK_SHARE) passed.push(value)
  }
  if (passed.length === 0) return null

  // 通った値のうち、隣り合って続いている帯を探す
  let bestFrom = 0
  let bestLength = 0
  let from = 0
  for (let index = 1; index <= passed.length; index++) {
    const broken =
      index === passed.length ||
      candidates.indexOf(passed[index]) !== candidates.indexOf(passed[index - 1]) + 1
    if (!broken) continue
    if (index - from > bestLength) {
      bestLength = index - from
      bestFrom = from
    }
    from = index
  }
  return { value: passed[bestFrom + Math.floor((bestLength - 1) / 2)], passed }
}
