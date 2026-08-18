import { describe, expect, it } from 'vitest'
import { createImage, type RgbaImage } from '../image'
import { rotateQuarter } from '../rig'
import {
  SPECIES,
  SPECIES_IDS,
  TEMPLATES,
  directionInPiece,
  identifySpecies,
  partsForPiece,
  type SpeciesId,
} from '../templates'
import { TEMPLATE_BITS, TEMPLATE_GRID } from '../templates.generated'

/** 台紙の升目から、その形の絵を作る（1升 = 4画素）。 */
function pieceOf(id: SpeciesId, scale = 4): RgbaImage {
  const bits = TEMPLATE_BITS[id as keyof typeof TEMPLATE_BITS]
  const size = TEMPLATE_GRID * scale
  const image = createImage(size, size)
  for (let row = 0; row < TEMPLATE_GRID; row++) {
    for (let column = 0; column < TEMPLATE_GRID; column++) {
      if (bits[row * TEMPLATE_GRID + column] !== '1') continue
      for (let y = row * scale; y < (row + 1) * scale; y++) {
        for (let x = column * scale; x < (column + 1) * scale; x++) {
          image.data[(y * size + x) * 4 + 3] = 255
        }
      }
    }
  }
  return image
}

function mirrored(image: RgbaImage): RgbaImage {
  const out = createImage(image.width, image.height)
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const from = (y * image.width + x) * 4
      const to = (y * image.width + (image.width - 1 - x)) * 4
      for (let k = 0; k < 4; k++) out.data[to + k] = image.data[from + k]
    }
  }
  return out
}

/** 時計回りに90度回す。 */
function turned(image: RgbaImage): RgbaImage {
  const out = createImage(image.height, image.width)
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const from = (y * image.width + x) * 4
      const to = (x * out.width + (out.width - 1 - y)) * 4
      for (let k = 0; k < 4; k++) out.data[to + k] = image.data[from + k]
    }
  }
  return out
}

describe('台紙のデータ', () => {
  it('6種そろっている', () => {
    expect(TEMPLATES).toHaveLength(6)
    expect(SPECIES_IDS.sort()).toEqual(['fish', 'iruka', 'kurage', 'same', 'tako', 'umigame'])
  })

  it('升目の数が合っている', () => {
    for (const template of TEMPLATES) {
      expect(template.shape.cells).toHaveLength(TEMPLATE_GRID * TEMPLATE_GRID)
      // 空でも真っ黒でもない
      const filled = template.shape.cells.filter(Boolean).length
      expect(filled).toBeGreaterThan(TEMPLATE_GRID * 2)
      expect(filled).toBeLessThan(TEMPLATE_GRID * TEMPLATE_GRID * 0.9)
    }
  })
})

describe('identifySpecies', () => {
  it('台紙そのものは、その台紙として見分けられる', () => {
    for (const id of SPECIES_IDS) {
      const found = identifySpecies(pieceOf(id))
      expect(found?.id).toBe(id)
      expect(found?.score).toBeGreaterThan(0.9)
    }
  })

  it('左右反転しても、回しても、同じ台紙として見分けられる', () => {
    for (const id of SPECIES_IDS) {
      expect(identifySpecies(mirrored(pieceOf(id)))?.id).toBe(id)
      expect(identifySpecies(turned(pieceOf(id)))?.id).toBe(id)
      expect(identifySpecies(turned(turned(pieceOf(id))))?.id).toBe(id)
    }
  })

  it('台紙に無い形（ただの四角）は、どれにも当てはめない', () => {
    const square = createImage(80, 80)
    for (let y = 10; y < 70; y++) {
      for (let x = 10; x < 70; x++) square.data[(y * 80 + x) * 4 + 3] = 255
    }
    expect(identifySpecies(square)).toBeNull()
  })
})

describe('頭の向き', () => {
  it('台紙のままなら、台紙に書いた向きがそのまま返る', () => {
    for (const id of SPECIES_IDS) {
      expect(directionInPiece(id, 0, false)).toEqual(SPECIES[id].head)
    }
  })

  it('左右反転すると、横向きの生き物は頭が右になる', () => {
    // 台紙の魚は左を向いている
    expect(SPECIES.fish.head).toEqual({ x: -1, y: 0 })
    const found = identifySpecies(mirrored(pieceOf('fish')))
    expect(found?.headsRight).toBe(true)
    expect(found?.head.x).toBeGreaterThan(0)
  })

  it('反転していない魚は、頭が左のまま', () => {
    const found = identifySpecies(pieceOf('fish'))
    expect(found?.headsRight).toBe(false)
  })

  it('90度回すと、頭の向きも90度ついてくる', () => {
    // 左を向いた魚を時計回りに90度回すと、頭は上を向く
    const found = identifySpecies(turned(pieceOf('fish')))
    expect(found?.head.y).toBeLessThan(0)
    expect(Math.abs(found?.head.x ?? 1)).toBeLessThan(0.001)
    // 上下を向いているときは「右か左か」は答えない
    expect(found?.headsRight).toBeNull()
  })

  it('上を向いている生き物（タコ）では、左右の答えを返さない', () => {
    expect(identifySpecies(pieceOf('tako'))?.headsRight).toBeNull()
  })
})

describe('手足の分割', () => {
  /** 分割が絵を隙間なく、重なりなく覆っているか。 */
  function covers(parts: readonly { box: { x: number; y: number; w: number; h: number } }[]): {
    area: number
    overlap: number
  } {
    let area = 0
    let overlap = 0
    for (let index = 0; index < parts.length; index++) {
      const a = parts[index].box
      area += a.w * a.h
      for (let other = index + 1; other < parts.length; other++) {
        const b = parts[other].box
        const wide = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
        const tall = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
        if (wide > 0.0001 && tall > 0.0001) overlap += wide * tall
      }
    }
    return { area, overlap }
  }

  it('ウミガメは、絵を隙間なく重なりなく分けている', () => {
    for (const id of ['umigame'] as const) {
      const { area, overlap } = covers(partsForPiece(id))
      // 面積の合計が絵ぜんぶ（1）で、重なりが無い＝同じ画素を2度描かない
      expect(area).toBeCloseTo(1, 5)
      expect(overlap).toBeCloseTo(0, 5)
    }
  })

  it('回しても反転しても、隙間なく重なりなくのまま', () => {
    for (const id of ['umigame'] as const) {
      for (const turns of [0, 1, 2, 3]) {
        for (const mirrored of [false, true]) {
          const { area, overlap } = covers(partsForPiece(id, turns, mirrored))
          expect(area).toBeCloseTo(1, 5)
          expect(overlap).toBeCloseTo(0, 5)
        }
      }
    }
  })

  it('全部が絵の中に収まっている', () => {
    for (const id of ['umigame'] as const) {
      for (const turns of [0, 1, 2, 3]) {
        for (const part of partsForPiece(id, turns, true)) {
          expect(part.box.x).toBeGreaterThanOrEqual(-0.0001)
          expect(part.box.y).toBeGreaterThanOrEqual(-0.0001)
          expect(part.box.x + part.box.w).toBeLessThanOrEqual(1.0001)
          expect(part.box.y + part.box.h).toBeLessThanOrEqual(1.0001)
        }
      }
    }
  })

  it('ウミガメはひれが4枚だけ動く', () => {
    expect(partsForPiece('umigame').filter((part) => part.swing !== 0)).toHaveLength(4)
  })

  it('タコは分割しない（回すと足の付け根が裂ける・R-033）', () => {
    expect(partsForPiece('tako')).toEqual([])
  })

  it('ウミガメの前足と後ろ足は逆の拍で動く', () => {
    const moving = partsForPiece('umigame').filter((part) => part.swing !== 0)
    const beats = new Set(moving.map((part) => part.beat))
    expect(beats).toEqual(new Set([0, 0.5]))
  })

  it('分割を持たない生き物では空を返す', () => {
    expect(partsForPiece('fish')).toEqual([])
    expect(partsForPiece(undefined)).toEqual([])
  })
})

describe('台紙の向きへ起こす（R-034）', () => {
  it('回した絵は、同じ回数だけ回し戻せば台紙の向きに戻る', () => {
    for (const id of SPECIES_IDS) {
      for (const turns of [1, 2, 3]) {
        let image = pieceOf(id)
        for (let index = 0; index < turns; index++) image = turned(image)

        const found = identifySpecies(image)
        expect(found?.id).toBe(id)

        // 照合が言うとおりに回すと、もう回す必要が無くなる
        const straightened = rotateQuarter(image, found!.turns)
        const after = identifySpecies(straightened)
        expect(after?.turns).toBe(0)
      }
    }
  })

  it('上下逆さまの絵（180度＋左右反転）も、起こすと上下が戻る', () => {
    // サメが実際にこの形で保存されていた
    const upsideDown = mirrored(turned(turned(pieceOf('same'))))
    const found = identifySpecies(upsideDown)
    expect(found?.turns).toBe(2)

    const straightened = rotateQuarter(upsideDown, found!.turns)
    const after = identifySpecies(straightened)
    expect(after?.turns).toBe(0)
    // 起こしたあとは左右の違いだけが残る
    expect(after?.mirrored).toBe(true)
    expect(after?.headsRight).toBe(true)
  })
})
