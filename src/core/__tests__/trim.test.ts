import { describe, expect, it } from 'vitest'
import { opaqueBounds, trimTransparent } from '../trim'
import { createImage } from '../image'
import { BLACK_LINE, PAPER, imageFromPattern } from './helpers'
import { cutoutPaper } from '../cutout'

const palette = { '.': PAPER, '#': BLACK_LINE }

describe('opaqueBounds', () => {
  it('全部透明なら null', () => {
    expect(opaqueBounds(createImage(4, 4))).toBeNull()
  })

  it('不透明な画素の外接矩形を返す', () => {
    const image = cutoutPaper(
      imageFromPattern(
        [
          '.....',
          '.....',
          '..##.',
          '..##.',
          '.....',
        ],
        palette,
      ),
    )

    expect(opaqueBounds(image)).toEqual({ left: 2, top: 2, width: 2, height: 2 })
  })
})

describe('trimTransparent', () => {
  it('余白を切り落とす', () => {
    const image = cutoutPaper(
      imageFromPattern(
        [
          '.......',
          '.......',
          '...#...',
          '.......',
          '.......',
        ],
        palette,
      ),
    )

    const trimmed = trimTransparent(image, { padding: 0 })

    expect(trimmed).not.toBeNull()
    expect(trimmed!.image.width).toBe(1)
    expect(trimmed!.image.height).toBe(1)
    expect(trimmed!.bounds).toEqual({ left: 3, top: 2, width: 1, height: 1 })
  })

  it('padding のぶん外側を残す', () => {
    const image = cutoutPaper(
      imageFromPattern(
        [
          '.....',
          '.....',
          '..#..',
          '.....',
          '.....',
        ],
        palette,
      ),
    )

    const trimmed = trimTransparent(image, { padding: 1 })
    expect(trimmed!.image.width).toBe(3)
    expect(trimmed!.image.height).toBe(3)
  })

  it('padding が画像からはみ出しても、画像の中に収める', () => {
    const image = cutoutPaper(imageFromPattern(['###', '###', '###'], palette))

    const trimmed = trimTransparent(image, { padding: 10 })
    expect(trimmed!.bounds).toEqual({ left: 0, top: 0, width: 3, height: 3 })
  })

  it('全部透明なら null（呼び出し側がエラー文言を出せるように）', () => {
    expect(trimTransparent(createImage(4, 4))).toBeNull()
  })

  it('切り出した中身が元の画素と一致する', () => {
    const image = cutoutPaper(
      imageFromPattern(
        [
          '.....',
          '..#..',
          '.....',
        ],
        palette,
      ),
    )

    const trimmed = trimTransparent(image, { padding: 0 })!
    expect(Array.from(trimmed.image.data)).toEqual([20, 20, 24, 255])
  })
})
