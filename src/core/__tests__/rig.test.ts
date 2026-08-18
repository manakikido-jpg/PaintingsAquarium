import { describe, expect, it } from 'vitest'
import { createImage, type RgbaImage } from '../image'
import {
  RIG_MIN_CONFIDENCE,
  backIsUp,
  columnSpans,
  estimateRig,
  findTail,
  flareConfidence,
  flipVertical,
  midline,
  orientForSwimming,
  rotateQuarter,
  rigIsUsable,
} from '../rig'

/** 塗りつぶした矩形を置く。 */
function fill(
  image: RgbaImage,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  ink = 0,
): void {
  for (let y = fromY; y < toY; y++) {
    for (let x = fromX; x < toX; x++) {
      const index = (y * image.width + x) * 4
      image.data[index] = ink
      image.data[index + 1] = ink
      image.data[index + 2] = ink
      image.data[index + 3] = 255
    }
  }
}

/**
 * 頭が右の魚。胴（太い）→ くびれ → 尾びれ（広い）。
 * 実物の絵で見えた形をそのまま置いている。
 */
function fishFacingRight(): RgbaImage {
  const image = createImage(120, 60)
  fill(image, 0, 18, 20, 42) // 尾びれ（左端・広い）
  fill(image, 20, 26, 44, 34) // くびれ
  fill(image, 44, 6, 116, 54) // 胴（右が頭）
  return image
}

describe('columnSpans', () => {
  it('空の絵では厚みが 0 になる', () => {
    const spans = columnSpans(createImage(20, 10), 4)
    expect(spans.every((span) => span.height === 0)).toBe(true)
  })

  it('厚みは絵の高さに対する割合で返る', () => {
    const image = createImage(20, 10)
    fill(image, 0, 0, 20, 5)
    const spans = columnSpans(image, 4)
    expect(spans[0].height).toBeCloseTo(0.5)
  })
})

describe('midline', () => {
  it('上下の中点を通る', () => {
    const image = createImage(20, 10)
    fill(image, 0, 2, 20, 8)
    const points = midline(columnSpans(image, 4))
    expect(points).toHaveLength(4)
    for (const point of points) expect(point.y).toBeCloseTo(0.5)
  })

  it('絵の無い区間は点を作らない', () => {
    const image = createImage(20, 10)
    fill(image, 0, 0, 5, 10)
    expect(midline(columnSpans(image, 4)).length).toBeLessThan(4)
  })
})

describe('findTail', () => {
  it('くびれの先が広がっていれば尾びれと判定する', () => {
    // 頭→尾。太い胴 → くびれ → 広がる
    const heights = [0.8, 0.9, 0.9, 0.85, 0.8, 0.6, 0.4, 0.25, 0.5, 0.7, 0.75, 0.6]
    const tail = findTail(heights)
    expect(tail).not.toBeNull()
    expect(tail!.flare).toBeGreaterThan(1.2)
    // くびれは 7 番（0.25）。頭からの割合は真ん中より後ろ
    expect(tail!.from).toBeGreaterThan(0.5)
  })

  it('ただ細くなるだけの形は尾びれと呼ばない', () => {
    const heights = [0.9, 0.85, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.12, 0.06, 0.02]
    expect(findTail(heights)).toBeNull()
  })

  it('区間が少なすぎるときは判定しない', () => {
    expect(findTail([0.5, 0.2, 0.9])).toBeNull()
  })

  it('前半のくびれは拾わない（胸びれを尾と取り違えないため）', () => {
    const heights = [0.5, 0.2, 0.8, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9]
    expect(findTail(heights)).toBeNull()
  })
})

describe('flareConfidence', () => {
  it('広がっていなければ 0、大きく広がれば 1 で頭打ち', () => {
    expect(flareConfidence(1.2)).toBe(0)
    expect(flareConfidence(1.8)).toBe(1)
    expect(flareConfidence(5)).toBe(1)
    expect(flareConfidence(1.5)).toBeCloseTo(0.5)
  })
})

describe('rotateQuarter', () => {
  it('4回まわすと元に戻る', () => {
    const image = fishFacingRight()
    let turned: RgbaImage = image
    for (let index = 0; index < 4; index++) turned = rotateQuarter(turned, 1)
    expect(turned.width).toBe(image.width)
    expect(turned.height).toBe(image.height)
    expect([...turned.data]).toEqual([...image.data])
  })

  it('1回まわすと縦横が入れ替わる', () => {
    const turned = rotateQuarter(fishFacingRight(), 1)
    expect(turned.width).toBe(60)
    expect(turned.height).toBe(120)
  })

  it('左上の画素が右上へ移る（時計回り）', () => {
    const image = createImage(3, 2)
    fill(image, 0, 0, 1, 1, 10)
    const turned = rotateQuarter(image, 1)
    expect(turned.data[(0 * turned.width + turned.width - 1) * 4 + 3]).toBe(255)
  })
})

describe('flipVertical', () => {
  it('2回で元に戻る', () => {
    const image = fishFacingRight()
    expect([...flipVertical(flipVertical(image)).data]).toEqual([...image.data])
  })

  it('上の行が下へ移る', () => {
    const image = createImage(2, 3)
    fill(image, 0, 0, 2, 1)
    const flipped = flipVertical(image)
    expect(flipped.data[3]).toBe(0)
    expect(flipped.data[(2 * 2 + 0) * 4 + 3]).toBe(255)
  })
})

describe('backIsUp', () => {
  it('濃いほうが上なら true', () => {
    const image = createImage(10, 10)
    fill(image, 0, 0, 10, 5, 0) // 上は真っ黒
    fill(image, 0, 5, 10, 10, 220) // 下は薄い
    expect(backIsUp(image)).toBe(true)
    expect(backIsUp(flipVertical(image))).toBe(false)
  })
})

describe('estimateRig', () => {
  it('頭が右の魚で、尾びれと向きを当てる', () => {
    const rig = estimateRig(fishFacingRight())
    expect(rig.tail).not.toBeNull()
    expect(rig.headsRight).toBe(true)
    expect(rig.confidence).toBeGreaterThan(RIG_MIN_CONFIDENCE)
    // 尾の付け根は絵の左寄り
    expect(rig.tail!.pivot.x).toBeLessThan(0.5)
  })

  it('左右を反転しても、向きの判定がついてくる', () => {
    const image = fishFacingRight()
    const mirrored = createImage(image.width, image.height)
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const from = (y * image.width + x) * 4
        const to = (y * image.width + (image.width - 1 - x)) * 4
        for (let k = 0; k < 4; k++) mirrored.data[to + k] = image.data[from + k]
      }
    }
    const rig = estimateRig(mirrored)
    expect(rig.headsRight).toBe(false)
    expect(rig.tail!.pivot.x).toBeGreaterThan(0.5)
  })

  it('尾びれの無い絵（ただの四角）では使わない判定になる', () => {
    const image = createImage(80, 60)
    fill(image, 5, 5, 75, 55)
    const rig = estimateRig(image)
    expect(rigIsUsable(rig)).toBe(false)
  })
})

describe('orientForSwimming', () => {
  it('縦向きに描かれた魚を横向きに直す', () => {
    // 実物の絵がこれだった。頭が上、尾が下
    const upright = rotateQuarter(fishFacingRight(), 3)
    expect(upright.height).toBeGreaterThan(upright.width)

    const oriented = orientForSwimming(upright)
    expect(oriented.image.width).toBeGreaterThan(oriented.image.height)
    expect(oriented.turns).not.toBe(0)
    expect(rigIsUsable(oriented.rig)).toBe(true)
  })

  it('もともと横向きなら回さない', () => {
    const oriented = orientForSwimming(fishFacingRight())
    expect(oriented.turns).toBe(0)
  })

  it('尾びれが見つからない絵は触らない。自信が無いのに回してはいけない', () => {
    const image = createImage(80, 60)
    fill(image, 5, 5, 75, 55)
    const oriented = orientForSwimming(image)
    expect(oriented.turns).toBe(0)
    expect(oriented.flipped).toBe(false)
    expect(oriented.image.width).toBe(80)
  })

  it('上下が逆なら直す', () => {
    const image = fishFacingRight()
    // 上を薄く、下を濃くする＝背中が下
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const index = (y * image.width + x) * 4
        if (image.data[index + 3] === 0) continue
        const ink = y < image.height / 2 ? 210 : 10
        image.data[index] = ink
        image.data[index + 1] = ink
        image.data[index + 2] = ink
      }
    }
    expect(backIsUp(image)).toBe(false)
    expect(orientForSwimming(image).flipped).toBe(true)
  })
})

describe('rigIsUsable', () => {
  it('リグが無い古い絵は使わない', () => {
    expect(rigIsUsable(undefined)).toBe(false)
    expect(rigIsUsable(null)).toBe(false)
  })
})
