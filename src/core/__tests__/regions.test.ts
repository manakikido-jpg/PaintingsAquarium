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

describe('本体から離れた塊を捨てる（R-065）', () => {
  /**
   * 絵と、そこから離れた小さな塊（台紙の題）を並べた絵を作る。
   * どちらも画像の縁には触れさせない（縁に触れる塊は別の規則で落ちるため）。
   */
  const withTitle = (gap: number, titleWidth: number) => {
    const image = createImage(260, 80)
    const put = (x: number, y: number): void => {
      image.data[(y * 260 + x) * 4 + 3] = 255
    }
    // 本体: 100x50（左上を (10,10) に置く）
    for (let y = 10; y < 60; y++) for (let x = 10; x < 110; x++) put(x, y)
    // 離れた塊
    const from = 110 + gap
    for (let y = 10; y < 20; y++) for (let x = from; x < from + titleWidth; x++) put(x, y)
    return { image, titleX: from + 1 }
  }

  it('離れた小さい塊は捨てる（台紙の題）', () => {
    // 本体 5000画素に対して 300画素（6%）。対角 111px の 27% 離れている
    const { image, titleX } = withTitle(30, 30)
    const result = keepMainRegions(image)

    expect(result.droppedRegions).toBe(1)
    expect(result.image.data[(12 * 260 + titleX) * 4 + 3]).toBe(0)
    // 本体は残る
    expect(result.image.data[(30 * 260 + 50) * 4 + 3]).toBe(255)
  })

  /*
   * **広さだけでは分けられない。** 実測で、題は 5.7%・
   * ちぎれた絵の一部は 7.4% と並んでいた（R-065）。
   */
  it('同じ広さでも、すぐ隣にある塊は残す（ちぎれた絵の一部）', () => {
    const { image, titleX } = withTitle(2, 30)
    const result = keepMainRegions(image)

    expect(result.droppedRegions).toBe(0)
    expect(result.image.data[(12 * 260 + titleX) * 4 + 3]).toBe(255)
  })

  it('離れていても、大きい塊は残す', () => {
    // 本体の 15% 以上ある塊は、離れていても絵の一部とみなす
    const { image } = withTitle(30, 90)
    expect(keepMainRegions(image).droppedRegions).toBe(0)
  })
})
