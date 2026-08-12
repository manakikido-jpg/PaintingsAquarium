/**
 * `ImageData` の `data` は ArrayBuffer 由来に限定されている。
 * SharedArrayBuffer も許す既定の型のままだと画面側へ渡せないため、明示する。
 */
export type RgbaBytes = Uint8ClampedArray<ArrayBuffer>

/**
 * 画像の最小表現。
 *
 * DOM の `ImageData` と構造的に互換なので、画面側はそのまま渡せる。
 * ブラウザ API に依存しない形にしてあるのは、切り抜き判定を Node 上の
 * 単体テストで固定するため（CLAUDE.md「判定ロジックは純粋関数に切り出す」）。
 */
export interface RgbaImage {
  readonly width: number
  readonly height: number
  /** RGBA が 1 画素 4 バイトで並ぶ。長さは width * height * 4 */
  readonly data: RgbaBytes
}

export function createImage(width: number, height: number): RgbaImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) }
}

export function cloneImage(image: RgbaImage): RgbaImage {
  return {
    width: image.width,
    height: image.height,
    data: new Uint8ClampedArray(image.data),
  }
}

/** HSV の V（明度）。0〜1。紙の白さの判定に使う。 */
export function value(r: number, g: number, b: number): number {
  return Math.max(r, g, b) / 255
}

/**
 * HSV の S（鮮やかさ）。0〜1。
 *
 * 明度だけで判定すると「明るい黄色のクレヨン」まで紙として消える。
 * 色がついている画素は明るくても残したいので、鮮やかさを併用する。
 */
export function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b)
  if (max === 0) return 0
  const min = Math.min(r, g, b)
  return (max - min) / max
}
