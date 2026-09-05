import { describe, expect, it } from 'vitest'
import { createImage, type RgbaImage } from '../image'
import {
  RIG_MIN_CONFIDENCE,
  backIsUp,
  columnSpans,
  estimateRig,
  findTail,
  flareConfidence,
  flipHorizontal,
  flipVertical,
  midline,
  orientForSwimming,
  rotateQuarter,
  rigIsUsable,
  headIsKnown,
  headsRightOf,
  type Rig,
  HEAD_MARGIN,
  runsAlongColumn,
  runsAlongRow,
  tentacleSignal,
  hasTentacles,
  tipsAtBottom,
  TENTACLE_LINES_3,
  TENTACLE_LINES_4,
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

  /*
   * ひれは探さない（R-050）。
   *
   * 探して箱ごと回していたのをやめた。回すには胴の帯から
   * **ひれの側を除いて**描く必要があり、ひれの下に何も無くなる。
   * ずれた分がそのまま背景の色になり、実機で背びれの付け根に青い筋が出た。
   * いまはひれも胴の帯の一部として描く。
   */
  it('リグはひれを持たない', () => {
    const rig = estimateRig(fishFacingRight()) as unknown as Record<string, unknown>
    expect('fins' in rig).toBe(false)
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

describe('flipHorizontal', () => {
  it('2回で元に戻る', () => {
    const image = fishFacingRight()
    expect([...flipHorizontal(flipHorizontal(image)).data]).toEqual([...image.data])
  })

  it('左の列が右へ移る', () => {
    const image = createImage(3, 2)
    fill(image, 0, 0, 1, 2)
    const flipped = flipHorizontal(image)
    expect(flipped.data[3]).toBe(0)
    expect(flipped.data[2 * 4 + 3]).toBe(255)
  })

  /*
   * **上下をひっくり返すのは、左右をひっくり返して 180 度回すのと同じ。**
   * 向き直し（`orientForSwimming`）が上下を返すと、絵の左右が入れ替わる。
   * それが「同じイルカが右を向いたり左を向いたりする」の正体だった（R-058）。
   */
  it('上下反転は、左右反転と 180 度回転を合わせたものと同じ', () => {
    const image = fishFacingRight()
    expect([...flipVertical(image).data]).toEqual([
      ...rotateQuarter(flipHorizontal(image), 2).data,
    ])
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

/*
 * **頭の向きは、尾があるかどうかとは無関係**（R-046）。
 *
 * `rigIsUsable` は「尾を付け根で回してよいか」を見る関数で、`tail !== null` を要求する。
 * ここから頭の向きを取ると、尾を持たない絵（イルカ）で既定値（右）に落ちる。
 * 絵の反転はべつの経路で正しい向きを見ていたので、2つが食い違い、
 * **止めるべき頭が最大に振れた**（実測で絵の高さの ±11%）。
 */
describe('頭の向きは尾と無関係（R-046）', () => {
  // イルカと同じ形のリグ。尾は持たないが、頭の向きは分かっている
  const noTail: Rig = {
    spine: [
      { x: 0.1, y: 0.5 },
      { x: 0.9, y: 0.5 },
    ],
    tail: null,
    headsRight: false,
    headKnown: true,
    confidence: 1,
    source: 'shape',
    kind: 'fish',
  }

  it('尾が無くても、頭の向きはそのまま答える', () => {
    expect(rigIsUsable(noTail)).toBe(false)
    expect(headIsKnown(noTail)).toBe(true)
    expect(headsRightOf(noTail)).toBe(false)
  })

  it('リグが無い絵は、右向きとみなす（今までどおり）', () => {
    expect(headsRightOf(null)).toBe(true)
    expect(headsRightOf(undefined)).toBe(true)
  })
})

describe('頭が分かったかどうか（R-030）', () => {
  it('片側だけ広がる魚は、頭が分かったことにする', () => {
    const rig = estimateRig(fishFacingRight())
    expect(rig.headKnown).toBe(true)
    expect(headIsKnown(rig)).toBe(true)
  })

  it('ただの四角では、頭が分からないと答える', () => {
    const image = createImage(80, 60)
    fill(image, 5, 5, 75, 55)
    const rig = estimateRig(image)
    // ここが true になると、右端を頭と決め打ちして頭が振れる
    expect(rig.headKnown).toBe(false)
    expect(headIsKnown(rig)).toBe(false)
  })

  it('両端が同じように広がる形（蝶ネクタイ）でも、頭が分からないと答える', () => {
    const image = createImage(120, 60)
    fill(image, 0, 12, 24, 48) // 左のひれ
    fill(image, 24, 26, 44, 34) // 左のくびれ
    fill(image, 44, 20, 76, 40) // 胴
    fill(image, 76, 26, 96, 34) // 右のくびれ
    fill(image, 96, 12, 120, 48) // 右のひれ
    const rig = estimateRig(image)
    expect(rig.headKnown).toBe(false)
  })

  it('僅差では頭が分かったことにしない', () => {
    // 両側の広がりが HEAD_MARGIN 倍未満なら「分からない」に倒す
    expect(HEAD_MARGIN).toBeGreaterThan(1)
  })

  it('古い絵（headKnown が無い）は、尾びれが見つかっていたかで代用する', () => {
    const withTail = { ...estimateRig(fishFacingRight()) } as Record<string, unknown>
    delete withTail.headKnown
    expect(headIsKnown(withTail as never)).toBe(true)

    const square = createImage(80, 60)
    fill(square, 5, 5, 75, 55)
    const withoutTail = { ...estimateRig(square) } as Record<string, unknown>
    delete withoutTail.headKnown
    expect(headIsKnown(withoutTail as never)).toBe(false)
  })

  it('リグそのものが無い絵は、頭が分からない扱い', () => {
    expect(headIsKnown(null)).toBe(false)
    expect(headIsKnown(undefined)).toBe(false)
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

/** タコ。丸い胴から、細い足が何本も下へ垂れている。 */
function octopus(): RgbaImage {
  const image = createImage(90, 110)
  // 胴（丸い塊）
  for (let y = 6; y < 48; y++) {
    const half = Math.round(Math.sqrt(Math.max(0, 1 - ((y - 27) / 21) ** 2)) * 32)
    fill(image, 45 - half, y, 45 + half, y + 1)
  }
  // 足 6 本。下へ垂らす
  for (let leg = 0; leg < 6; leg++) {
    const x = 12 + leg * 13
    for (let y = 46; y < 106; y++) {
      const wobble = Math.round(Math.sin((y - 46) / 9 + leg) * 3)
      fill(image, x + wobble, y, x + wobble + 5, y + 1)
    }
  }
  return image
}

describe('runsAlongRow / runsAlongColumn', () => {
  it('何も無い行は 0', () => {
    expect(runsAlongRow(createImage(10, 10), 5)).toBe(0)
  })

  it('離れた塊の数を数える', () => {
    const image = createImage(20, 4)
    fill(image, 1, 0, 4, 4)
    fill(image, 8, 0, 11, 4)
    fill(image, 15, 0, 18, 4)
    expect(runsAlongRow(image, 2)).toBe(3)
    expect(runsAlongColumn(image, 2)).toBe(1)
  })
})

describe('tentacleSignal / detectKind', () => {
  it('魚には足の並びが出ない', () => {
    expect(hasTentacles(fishFacingRight())).toBe(false)
  })

  it('タコには足の並びが出る', () => {
    expect(hasTentacles(octopus())).toBe(true)
  })

  it('割合ではなく本数で数える。足が短い絵でも埋もれないため', () => {
    // 実物のタコは 20 行中 4 行しか足に当たらず、割合では魚と誤判定した
    const signal = tentacleSignal(octopus())
    expect(signal.lines3).toBeGreaterThanOrEqual(TENTACLE_LINES_3)
    expect(signal.lines4).toBeGreaterThanOrEqual(TENTACLE_LINES_4)
  })

  it('魚は fish、タコは tentacled、ただの四角は unknown', () => {
    const square = createImage(60, 60)
    fill(square, 5, 5, 55, 55)
    expect(estimateRig(fishFacingRight()).kind).toBe('fish')
    expect(estimateRig(octopus()).kind).toBe('tentacled')
    expect(estimateRig(square).kind).toBe('unknown')
  })

  it('タコには尾びれを付けない。足の1本を尾と取り違えると体がちぎれて揺れる', () => {
    const rig = estimateRig(octopus())
    expect(rig.tail).toBeNull()
    expect(rigIsUsable(rig)).toBe(false)
  })

  it('タコの向きは変えない。足を垂らした絵を横倒しにしない', () => {
    const oriented = orientForSwimming(octopus())
    expect(oriented.turns).toBe(0)
    expect(oriented.flipped).toBe(false)
  })
})

describe('tipsAtBottom', () => {
  it('足を下へ垂らした絵では true', () => {
    expect(tipsAtBottom(octopus())).toBe(true)
  })

  it('上下をひっくり返すと false', () => {
    expect(tipsAtBottom(flipVertical(octopus()))).toBe(false)
  })

  it('足が見つからない絵では、垂らして描くほうが普通なので true に倒す', () => {
    const square = createImage(40, 40)
    fill(square, 5, 5, 35, 35)
    expect(tipsAtBottom(square)).toBe(true)
  })
})

