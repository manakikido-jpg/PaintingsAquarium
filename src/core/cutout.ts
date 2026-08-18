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
}

export const DEFAULT_CUTOUT_OPTIONS: CutoutOptions = {
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

  const looksLikePaper = (index: number): boolean => {
    const offset = index * 4
    const r = data[offset]
    const g = data[offset + 1]
    const b = data[offset + 2]
    return value(r, g, b) >= looseValue && saturation(r, g, b) <= looseSaturation
  }

  const push = (index: number): void => {
    if (isBackground[index] === 1) return
    if (!looksLikePaper(index)) return
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
