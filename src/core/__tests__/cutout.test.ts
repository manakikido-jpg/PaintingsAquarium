import { describe, expect, it } from 'vitest'
import { cutoutPaper, diagnoseCutout, opaqueRatio, DEFAULT_CUTOUT_OPTIONS, diagnoseResult } from '../cutout'
import { createImage } from '../image'
import {
  AGED_PAPER,
  BLACK_LINE,
  BLUE_CRAYON,
  PAPER,
  YELLOW_CRAYON,
  alphaAt,
  imageFromPattern,
} from './helpers'

const palette = {
  '.': PAPER,
  'a': AGED_PAPER,
  '#': BLACK_LINE,
  'y': YELLOW_CRAYON,
  'b': BLUE_CRAYON,
}

describe('cutoutPaper', () => {
  it('外周に繋がった白は透明になる', () => {
    const image = imageFromPattern(
      [
        '.....',
        '.....',
        '..#..',
        '.....',
        '.....',
      ],
      palette,
    )

    const result = cutoutPaper(image)

    expect(alphaAt(result, 0, 0)).toBe(0)
    expect(alphaAt(result, 4, 4)).toBe(0)
    expect(alphaAt(result, 2, 1)).toBe(0)
  })

  it('黒い線は残る', () => {
    const image = imageFromPattern(['...', '.#.', '...'], palette)
    expect(alphaAt(cutoutPaper(image), 1, 1)).toBe(255)
  })

  it('絵で囲まれた内側の白は残る（体の中に穴が開かない）', () => {
    const image = imageFromPattern(
      [
        '.....',
        '.###.',
        '.#.#.',
        '.###.',
        '.....',
      ],
      palette,
    )

    const result = cutoutPaper(image)

    // 囲まれた中心
    expect(alphaAt(result, 2, 2)).toBe(255)
    // 外側
    expect(alphaAt(result, 0, 0)).toBe(0)
  })

  it('明るい黄色のクレヨンは消えない', () => {
    const image = imageFromPattern(['...', '.y.', '...'], palette)
    expect(alphaAt(cutoutPaper(image), 1, 1)).toBe(255)
  })

  it('黄ばんだ紙も紙として消える', () => {
    const image = imageFromPattern(['aaa', 'a#a', 'aaa'], palette)
    const result = cutoutPaper(image)
    expect(alphaAt(result, 0, 0)).toBe(0)
    expect(alphaAt(result, 1, 1)).toBe(255)
  })

  it('色（RGB）は一切変えない', () => {
    const image = imageFromPattern(['...', '.b.', '...'], palette)
    const result = cutoutPaper(image)

    for (let index = 0; index < image.width * image.height; index++) {
      expect(result.data[index * 4]).toBe(image.data[index * 4])
      expect(result.data[index * 4 + 1]).toBe(image.data[index * 4 + 1])
      expect(result.data[index * 4 + 2]).toBe(image.data[index * 4 + 2])
    }
  })

  it('元の画像を書き換えない', () => {
    const image = imageFromPattern(['...', '...', '...'], palette)
    const before = Uint8Array.from(image.data)
    cutoutPaper(image)
    expect(Uint8Array.from(image.data)).toEqual(before)
  })

  it('しきい値を上げると、より暗い画素まで紙として消える', () => {
    const image = imageFromPattern(['aaa', 'a#a', 'aaa'], palette)

    const loose = cutoutPaper(image, { ...DEFAULT_CUTOUT_OPTIONS, paperValue: 0.05, feather: 0 })

    // 黒い線まで紙とみなされて消える
    expect(alphaAt(loose, 1, 1)).toBe(0)
  })

  it('大きさ 0 の画像でも落ちない', () => {
    expect(() => cutoutPaper(createImage(0, 0))).not.toThrow()
  })
})

describe('diagnoseCutout', () => {
  it('全部消えたら、原因と直し方を返す', () => {
    const image = imageFromPattern(['...', '...', '...'], palette)
    const result = diagnoseCutout(cutoutPaper(image))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('nothing-left')
    expect(result.message).toContain('明るさ')
  })

  it('ほとんど消えなかったら、原因と直し方を返す', () => {
    const image = imageFromPattern(['###', '###', '###'], palette)
    const result = diagnoseCutout(cutoutPaper(image))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('nothing-removed')
    expect(result.message).toContain('撮り直')
  })

  it('ちょうどよく消えたら ok', () => {
    const image = imageFromPattern(
      [
        '.....',
        '.###.',
        '.###.',
        '.###.',
        '.....',
      ],
      palette,
    )
    const result = diagnoseCutout(cutoutPaper(image))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.opaqueRatio).toBeCloseTo(9 / 25, 5)
  })
})

describe('opaqueRatio', () => {
  it('全部透明なら 0', () => {
    expect(opaqueRatio(createImage(4, 4))).toBe(0)
  })
})

describe('diagnoseResult', () => {
  it('中身のある絵は通す', () => {
    const image = createImage(20, 20)
    for (let index = 3; index < image.data.length; index += 4) image.data[index] = 255
    expect(diagnoseResult(image).ok).toBe(true)
  })

  it('外接矩形は大きいのに中身がほとんど無いものを止める', () => {
    // 紙の裏写りだけが残った状態。まばらな点しか無い
    const image = createImage(40, 40)
    for (let y = 0; y < 40; y += 8) {
      for (let x = 0; x < 40; x += 8) image.data[(y * 40 + x) * 4 + 3] = 255
    }
    const result = diagnoseResult(image)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      // 「できません」で終わらせず、何をすればよいかまで書く
      expect(result.message).toContain('明るさ')
      expect(result.message).toContain('無地の紙')
    }
  })
})
