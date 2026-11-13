import { describe, expect, it } from 'vitest'
import { cutoutPaper, DEFAULT_CUTOUT_OPTIONS, paperColour } from '../cutout'
import { createImage, type RgbaImage } from '../image'
import { localPaperColours } from '../paperColourMap'
import { alphaAt } from './helpers'

function scannedPaper(): RgbaImage {
  const image = createImage(240, 160)
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const t = Math.exp(-(((x - 120) / 70) ** 2 + ((y - 95) / 55) ** 2) * 2)
      const from = [250, 249, 226], to = [232, 217, 246]
      image.data.set(from.map((v, c) => v * (1 - t) + to[c] * t).concat(255), (y * image.width + x) * 4)
    }
  }
  // 真ん中に閉じた黒い輪郭。内部の白は紙と同じRGBでも消してはいけない。
  for (let y = 60; y <= 120; y++) for (let x = 95; x <= 145; x++) {
    if (x <= 97 || x >= 143 || y <= 62 || y >= 118) {
      image.data.set([20, 20, 24, 255], (y * image.width + x) * 4)
    }
  }
  return image
}

describe('紙の局所色による白抜き（R-093）', () => {
  it('従来は成功扱いで残っていた、薄紫の紙も取り除く', () => {
    const source = scannedPaper()
    const options = { ...DEFAULT_CUTOUT_OPTIONS, paperValue: 0.6, paperSaturation: 0.29 }
    expect(alphaAt(cutoutPaper(source, options), 150, 95)).toBe(255)
    const fixed = cutoutPaper(source, {
      ...options, paperColours: localPaperColours(source, paperColour(source)),
    })
    expect(alphaAt(fixed, 150, 95)).toBe(0)
    expect(alphaAt(fixed, 80, 95)).toBe(0)
    expect(alphaAt(fixed, 120, 90)).toBe(255)
    expect(alphaAt(fixed, 96, 90)).toBe(255)
  })

  it('はみ出した薄い色と黒い線は残し、RGBと元画像も変えない', () => {
    const source = scannedPaper()
    const colours = [[255, 214, 170, 255], [255, 222, 196, 255], [202, 222, 255, 255]]
    for (let y = 0; y < colours.length; y++) for (let x = 0; x < 20; x++) {
      source.data.set(colours[y], ((15 + y) * source.width + x) * 4)
    }
    const before = source.data.slice()
    const fixed = cutoutPaper(source, {
      ...DEFAULT_CUTOUT_OPTIONS, paperColours: localPaperColours(source, paperColour(source)),
    })
    for (let y = 0; y < colours.length; y++) expect(alphaAt(fixed, 8, 15 + y)).toBe(255)
    const rgb = fixed.data.slice()
    for (let i = 3; i < rgb.length; i += 4) rgb[i] = before[i]
    expect(rgb).toEqual(before)
    expect(source.data).toEqual(before)
  })

  it('透明なWebPの黒い余白を紙色に混ぜず、残った紙へ探索できる', () => {
    const source = scannedPaper()
    for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
      if (x < 50 || x > 190 || y < 35 || y > 140) {
        source.data.set([0, 0, 0, 0], (y * source.width + x) * 4)
      }
    }
    expect(paperColour(source)).toEqual([255, 255, 255])
    const fixed = cutoutPaper(source, {
      ...DEFAULT_CUTOUT_OPTIONS, paperColours: localPaperColours(source, paperColour(source)),
    })
    expect(alphaAt(fixed, 165, 95)).toBe(0)
    expect(alphaAt(fixed, 120, 90)).toBe(255)
    expect(alphaAt(fixed, 0, 0)).toBe(0)
  })

  it('空画像、線だけ、紙のない透明画像も扱える', () => {
    for (const image of [createImage(0, 0), createImage(20, 20)]) {
      const fixed = cutoutPaper(image, {
        ...DEFAULT_CUTOUT_OPTIONS, paperColours: localPaperColours(image, [0, 0, 0]),
      })
      expect(fixed.data).toEqual(image.data)
    }
  })
})
