import { describe, expect, it } from 'vitest'
import { insideOutline, OUTLINE_DARKNESS } from '../outline'
import { BLACK_LINE, PAPER, alphaAt, imageFromPattern } from './helpers'

// 軽く塗ったクレヨン（紙と鮮やかさが近い）と、こい色のクレヨン
const PALE: [number, number, number, number] = [255, 232, 210, 255]
const DEEP: [number, number, number, number] = [245, 152, 42, 255]
const palette = { '.': PAPER, '#': BLACK_LINE, 'o': PALE, 'x': DEEP }

describe('insideOutline', () => {
  it('線に囲まれた中だけを残す', () => {
    const image = imageFromPattern(
      [
        '.....',
        '.###.',
        '.#o#.',
        '.###.',
        '.....',
      ],
      palette,
    )

    const result = insideOutline(image)

    expect(alphaAt(result, 2, 2)).toBe(255) // 囲まれた中
    expect(alphaAt(result, 1, 1)).toBe(255) // 線そのもの
    expect(alphaAt(result, 0, 0)).toBe(0) // 外
  })

  /*
   * **これが本題（R-055）。**
   * 枠の外に塗った色は、線を越えられないので形から落ちる。
   * ここが効かないと、はみ出して塗った紙で台紙の見分けが外れる。
   */
  it('線の外に塗った色は、こい色でも形に入らない', () => {
    const image = imageFromPattern(
      [
        'xx...',
        'x###.',
        'x#o#.',
        'x###.',
        'xx...',
      ],
      palette,
    )

    const result = insideOutline(image)

    // 左のはみ出しは落ちる
    expect(alphaAt(result, 0, 0)).toBe(0)
    expect(alphaAt(result, 0, 2)).toBe(0)
    // 中は残る
    expect(alphaAt(result, 2, 2)).toBe(255)
  })

  it('線が途切れていると中まで抜ける（囲めていないので当然）', () => {
    const image = imageFromPattern(
      [
        '.....',
        '.###.',
        '.#o..',
        '.###.',
        '.....',
      ],
      palette,
    )

    expect(alphaAt(insideOutline(image), 2, 2)).toBe(0)
  })

  /*
   * 線とクレヨンの明るさは大きく離れている。
   * 台紙の線は 0.11、一番こいオレンジでも 0.96。
   */
  it('しきい値が、線とクレヨンのあいだにある', () => {
    const brightest = (colour: readonly number[]): number =>
      Math.max(colour[0], colour[1], colour[2]) / 255
    expect(brightest(BLACK_LINE)).toBeLessThan(OUTLINE_DARKNESS)
    expect(brightest(DEEP)).toBeGreaterThan(OUTLINE_DARKNESS)
    expect(brightest(PALE)).toBeGreaterThan(OUTLINE_DARKNESS)
  })

  it('色（RGB）は変えない。触るのは透明度だけ', () => {
    const image = imageFromPattern(['.x.', 'x#x', '.x.'], palette)
    const result = insideOutline(image)
    for (let index = 0; index < image.width * image.height; index++) {
      for (let channel = 0; channel < 3; channel++) {
        expect(result.data[index * 4 + channel]).toBe(image.data[index * 4 + channel])
      }
    }
  })

  it('大きさ 0 の画像でも落ちない', () => {
    expect(() => insideOutline({ width: 0, height: 0, data: new Uint8ClampedArray(0) })).not.toThrow()
  })
})
