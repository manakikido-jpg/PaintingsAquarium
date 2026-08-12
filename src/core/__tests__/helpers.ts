import { createImage, type RgbaImage } from '../image'

export type Rgba = [number, number, number, number]

/** 1 文字 = 1 画素の絵でテスト画像を組み立てる。目で読める形にするため。 */
export function imageFromPattern(rows: string[], palette: Record<string, Rgba>): RgbaImage {
  const height = rows.length
  const width = height === 0 ? 0 : rows[0].length
  const image = createImage(width, height)

  rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`行 ${y} の長さが ${row.length} で、1 行目の ${width} と違う`)
    }
    for (let x = 0; x < width; x++) {
      const color = palette[row[x]]
      if (!color) throw new Error(`パレットに '${row[x]}' がない`)
      image.data.set(color, (y * width + x) * 4)
    }
  })

  return image
}

export function alphaAt(image: RgbaImage, x: number, y: number): number {
  return image.data[(y * image.width + x) * 4 + 3]
}

export const PAPER: Rgba = [255, 255, 255, 255]
/** 少し黄ばんだ紙。実際の写真ではこちらに寄る。 */
export const AGED_PAPER: Rgba = [246, 242, 228, 255]
export const BLACK_LINE: Rgba = [20, 20, 24, 255]
export const YELLOW_CRAYON: Rgba = [252, 226, 60, 255]
export const BLUE_CRAYON: Rgba = [40, 90, 200, 255]
