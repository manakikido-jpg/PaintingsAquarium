import { describe, expect, it } from 'vitest'
import { keepMainRegions } from '../regions'
import { cutoutPaper } from '../cutout'
import { createImage } from '../image'
import { BLACK_LINE, PAPER, alphaAt, imageFromPattern } from './helpers'

const palette = { '.': PAPER, '#': BLACK_LINE }

/** 白紙にパターンを描いて、透過まで済ませた画像を作る。 */
function cut(rows: string[]) {
  return cutoutPaper(imageFromPattern(rows, palette))
}

describe('keepMainRegions', () => {
  it('紙の隅に残った影の塊を捨てる（R-003）', () => {
    const image = cut([
      '#.......',
      '........',
      '..####..',
      '..####..',
      '..####..',
      '........',
      '........',
      '........',
    ])

    const { image: kept, droppedRegions } = keepMainRegions(image)

    // 中央の絵は残る
    expect(alphaAt(kept, 3, 3)).toBe(255)
    // 左上隅の影は消える
    expect(alphaAt(kept, 0, 0)).toBe(0)
    expect(droppedRegions).toBe(1)
  })

  it('絵から離れた小さなゴミを捨てる', () => {
    const image = cut([
      '........',
      '.######.',
      '.######.',
      '.######.',
      '.######.',
      '........',
      '......#.',
      '........',
    ])

    const { image: kept } = keepMainRegions(image)

    expect(alphaAt(kept, 2, 2)).toBe(255)
    expect(alphaAt(kept, 6, 6)).toBe(0)
  })

  it('離れていても十分に大きい塊は残す（吹き出しや2匹目）', () => {
    const image = cut([
      '.........',
      '.###.###.',
      '.###.###.',
      '.###.###.',
      '.........',
    ])

    const { image: kept, droppedRegions } = keepMainRegions(image)

    expect(alphaAt(kept, 2, 2)).toBe(255)
    expect(alphaAt(kept, 6, 2)).toBe(255)
    expect(droppedRegions).toBe(0)
  })

  it('絵が紙いっぱいで縁に接していても、絵ごと消さない', () => {
    const image = cut([
      '####',
      '####',
      '####',
      '####',
    ])

    const { image: kept, touchedBorder } = keepMainRegions(image)

    expect(touchedBorder).toBe(true)
    expect(alphaAt(kept, 1, 1)).toBe(255)
  })

  it('全部透明なら何もしない', () => {
    const result = keepMainRegions(createImage(4, 4))
    expect(result.droppedRegions).toBe(0)
    expect(result.touchedBorder).toBe(false)
  })

  it('元の画像を書き換えない', () => {
    const image = cut(['#...', '....', '.##.', '....'])
    const before = Uint8Array.from(image.data)
    keepMainRegions(image)
    expect(Uint8Array.from(image.data)).toEqual(before)
  })

  it('大きさ 0 の画像でも落ちない', () => {
    expect(() => keepMainRegions(createImage(0, 0))).not.toThrow()
  })
})
