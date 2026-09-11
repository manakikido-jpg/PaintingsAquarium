import { describe, expect, it } from 'vitest'
import { keepMainRegions, largestRegion } from '../regions'
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

describe('縁に触れる塊を額縁や2枚重ねと区別する（R-067）', () => {
  const put = (image: ReturnType<typeof createImage>, x: number, y: number): void => {
    image.data[(y * image.width + x) * 4 + 3] = 255
  }

  it('縁を囲む額縁状の塊（詰まり方が薄い）は無視し、内側の絵を残す', () => {
    // 20x20 の外周1画素ぶんだけを塗った「額縁」（詰まり方 19%）＋中央に密な絵（8x8）
    const image = createImage(20, 20)
    for (let x = 0; x < 20; x++) {
      put(image, x, 0)
      put(image, x, 19)
    }
    for (let y = 0; y < 20; y++) {
      put(image, 0, y)
      put(image, 19, y)
    }
    for (let y = 6; y < 14; y++) for (let x = 6; x < 14; x++) put(image, x, y)

    const { image: kept, touchedBorder } = keepMainRegions(image)

    // 額縁は縁にしか触れておらず、実際に消える
    expect(touchedBorder).toBe(false)
    expect(alphaAt(kept, 0, 0)).toBe(0)
    // 中央の絵は残る
    expect(alphaAt(kept, 8, 8)).toBe(255)
  })

  it('内側の絵がすでに十分大きければ、縁に触れる密な塊（2枚重ねのもう1枚）は取り込まない', () => {
    // 内側: 8x8（非border）。縁: 10x10 の密な塊が右端に接する（間に1画素の隙間を空けて別の塊にする）
    // 内側 64 ÷ 縁 100 = 64% あり、単独で十分（自己完結）とみなす
    const image = createImage(22, 20)
    for (let y = 2; y < 10; y++) for (let x = 2; x < 10; x++) put(image, x, y)
    for (let y = 5; y < 15; y++) for (let x = 12; x < 22; x++) put(image, x, y)

    const { image: kept, touchedBorder } = keepMainRegions(image)

    expect(touchedBorder).toBe(false)
    // 内側の絵は残る
    expect(alphaAt(kept, 5, 5)).toBe(255)
    // 縁に触れる、もう1枚ぶんの塊は残らない
    expect(alphaAt(kept, 17, 10)).toBe(0)
  })

  it('内側に小さな断片しか無ければ、縁に触れる密な本体を残す（本来の不具合）', () => {
    // 内側: 2x2（題の断片くらい小さい）。縁: 10x10 の密な本体
    const image = createImage(20, 20)
    for (let y = 2; y < 4; y++) for (let x = 2; x < 4; x++) put(image, x, y)
    for (let y = 5; y < 15; y++) for (let x = 10; x < 20; x++) put(image, x, y)

    const { image: kept, touchedBorder } = keepMainRegions(image)

    expect(touchedBorder).toBe(true)
    expect(alphaAt(kept, 15, 10)).toBe(255)
  })
})

describe('largestRegion — 落書きの中から絵ひとつ分を選ぶ（R-069）', () => {
  const put = (image: ReturnType<typeof createImage>, x: number, y: number): void => {
    image.data[(y * image.width + x) * 4 + 3] = 255
  }
  const fill = (
    image: ReturnType<typeof createImage>,
    x0: number, y0: number, x1: number, y1: number,
  ): void => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(image, x, y)
  }

  it('印刷線で仕切られた区画は、ひとつながりの絵として扱う', () => {
    // 台紙の絵の内側は線で仕切られている（プテラノドンなら胴と左右の翼）。
    // 素直に「一番大きい塊」を採ると、実測で**右の翼だけ**が残った
    const image = createImage(30, 20)
    fill(image, 2, 2, 10, 18)    // 胴（8x16 = 128）
    fill(image, 11, 2, 17, 18)   // 線1本ぶん空けた隣の区画（6x16 = 96）
    fill(image, 24, 14, 28, 18)  // 離れた落書きの輪の内側（4x4 = 16）

    const kept = largestRegion(image)

    expect(alphaAt(kept, 5, 10)).toBe(255)
    expect(alphaAt(kept, 14, 10)).toBe(255)
    expect(alphaAt(kept, 26, 16)).toBe(0)
  })

  it('太らせた分は絵に足さない（仕切りの隙間は透明のまま）', () => {
    const image = createImage(30, 20)
    fill(image, 2, 2, 10, 18)
    fill(image, 11, 2, 17, 18)

    const kept = largestRegion(image)

    // x=10 は元から透明。繋げるために太らせただけで、絵にはしない
    expect(alphaAt(kept, 10, 10)).toBe(0)
  })

  it('離れた大きな落書きは、絵より広くても選ばない側になる', () => {
    const image = createImage(40, 24)
    fill(image, 2, 2, 14, 22)    // 絵（12x20 = 240）
    fill(image, 24, 2, 34, 22)   // 離れた落書きの塊（10x20 = 200）

    const kept = largestRegion(image)

    expect(alphaAt(kept, 7, 12)).toBe(255)
    expect(alphaAt(kept, 29, 12)).toBe(0)
  })

  it('何も写っていない絵を渡しても壊れない', () => {
    expect(() => largestRegion(createImage(8, 8))).not.toThrow()
    expect(() => largestRegion(createImage(0, 0))).not.toThrow()
  })
})
