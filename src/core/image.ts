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

/**
 * 長辺が `maxSide` に収まるまで縮める。
 *
 * しきい値を選ぶための下見に使う。しきい値は明るさの比較なので、
 * 縮めても選ばれる値はほとんど変わらない。一方で費用は面積に比例するので、
 * 900x1200 のまま何通りも試すと 1 枚に何秒も掛かる。
 */
export function downscale(image: RgbaImage, maxSide: number): RgbaImage {
  const longest = Math.max(image.width, image.height)
  if (longest <= maxSide) return image
  const scale = maxSide / longest
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const data = new Uint8ClampedArray(width * height * 4)

  for (let y = 0; y < height; y++) {
    const fromY = Math.min(image.height - 1, Math.floor((y / height) * image.height))
    for (let x = 0; x < width; x++) {
      const fromX = Math.min(image.width - 1, Math.floor((x / width) * image.width))
      const from = (fromY * image.width + fromX) * 4
      const to = (y * width + x) * 4
      data[to] = image.data[from]
      data[to + 1] = image.data[from + 1]
      data[to + 2] = image.data[from + 2]
      data[to + 3] = image.data[from + 3]
    }
  }
  return { width, height, data: data as RgbaBytes }
}
