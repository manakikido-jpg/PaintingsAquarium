import { describe, expect, it } from 'vitest'
import { cutoutPaper, diagnoseCutout, opaqueRatio, DEFAULT_CUTOUT_OPTIONS, diagnoseResult, chooseCutoutValue, inkStats } from '../cutout'
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

  /*
   * **明るさのつまみを下げても、線は消えない。**
   *
   * 以前はここで黒い線まで消えていた。明るさだけで判断していたため。
   * いまは「紙の色からどれだけ離れているか」も見るので、
   * 紙と色の違うもの（線・クレヨン）は、つまみを何処に置いても残る。
   * 会場で一番怖いのは**絵が丸ごと消える**ことなので、これでよい（R-018）。
   */
  it('明るさのつまみを下げても、紙と色の違う線は残る', () => {
    const image = imageFromPattern(['aaa', 'a#a', 'aaa'], palette)

    const loose = cutoutPaper(image, { ...DEFAULT_CUTOUT_OPTIONS, paperValue: 0.05, feather: 0 })

    expect(alphaAt(loose, 1, 1)).toBe(255)
  })

  /*
   * **うすい色も残る（会場の指摘）。**
   * 「オレンジで書いた絵も透明になることがある」。
   * 軽く塗ったクレヨンは鮮やかさが紙に近く、しかも枠外へはみ出すと
   * 紙とつながるので、外周からの塗りつぶしに食われていた。
   */
  it('うすいオレンジや肌色が、紙とつながっていても残る', () => {
    const PALE_ORANGE: [number, number, number, number] = [255, 214, 170, 255]
    const SKIN: [number, number, number, number] = [255, 222, 196, 255]
    const image = imageFromPattern(
      [
        '.....',
        '.oo..',
        '.oo..',
        '...ss',
        '...ss',
      ],
      { ...palette, o: PALE_ORANGE, s: SKIN },
    )

    const result = cutoutPaper(image)

    // 紙は消える
    expect(alphaAt(result, 0, 0)).toBe(0)
    // うすい色は、外周とつながっていても残る
    expect(alphaAt(result, 1, 1)).toBe(255)
    expect(alphaAt(result, 2, 2)).toBe(255)
    expect(alphaAt(result, 3, 3)).toBe(255)
    expect(alphaAt(result, 4, 4)).toBe(255)
  })

  /*
   * **輪郭に小さな切れ目があっても、中の白を食わない（R-056）。**
   *
   * 会場から「絵の中の白色は紙の色でも表示してほしい」
   * 「中に塗った絵が表示すらエラーでされない」。
   * 台紙の線が印刷のかすれやスキャンで数画素途切れると、
   * そこから塗りつぶしが中へ入り、塗っていない白い所を食っていた。
   */
  it('輪郭に数画素の切れ目があっても、中の白は残る', () => {
    // 実寸に近い大きさで試す。塞げる切れ目の幅は画像の大きさに比例する
    const side = 600
    const image = createImage(side, side)
    const put = (x: number, y: number, colour: readonly number[]): void => {
      const offset = (y * side + x) * 4
      image.data[offset] = colour[0]
      image.data[offset + 1] = colour[1]
      image.data[offset + 2] = colour[2]
      image.data[offset + 3] = 255
    }
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) put(x, y, PAPER)
    // 四角い輪郭
    for (let t = 120; t < 480; t++) {
      for (let w = 0; w < 3; w++) {
        put(t, 120 + w, BLACK_LINE)
        put(t, 477 + w, BLACK_LINE)
        put(120 + w, t, BLACK_LINE)
        put(477 + w, t, BLACK_LINE)
      }
    }
    // **上の辺に 3px の切れ目**（印刷のかすれ）。塞げる幅は 600px なら 4px まで
    for (let t = 300; t < 303; t++) for (let w = 0; w < 3; w++) put(t, 120 + w, PAPER)

    const result = cutoutPaper(image)

    // 中の白（塗っていない所）は残る
    expect(alphaAt(result, 300, 300)).toBe(255)
    // 外の紙は消える
    expect(alphaAt(result, 5, 5)).toBe(0)
    expect(alphaAt(result, 300, 40)).toBe(0)
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

describe('chooseCutoutValue', () => {
  const good = { fill: 0.5, darkShare: 0.3 }
  const bad = { fill: 0.02, darkShare: 0.02 }

  it('通る値がひと続きなら、その真ん中を採る', () => {
    // 0.48 / 0.52 / 0.56 が通る → 真ん中の 0.52
    const chosen = chooseCutoutValue((value) => (value >= 0.48 && value <= 0.56 ? good : bad))
    expect(chosen?.value).toBeCloseTo(0.52)
  })

  it('端は採らない。紙や照明が少し変わっただけで外れるため', () => {
    const chosen = chooseCutoutValue((value) => (value >= 0.4 && value <= 0.6 ? good : bad))
    expect(chosen?.value).toBeGreaterThan(0.4)
    expect(chosen?.value).toBeLessThan(0.6)
  })

  it('通る帯が2つに割れたら、長いほうを採る', () => {
    const chosen = chooseCutoutValue((value) =>
      value === 0.4 || (value >= 0.6 && value <= 0.72) ? good : bad,
    )
    expect(chosen?.value).toBeGreaterThanOrEqual(0.6)
    expect(chosen?.value).toBeLessThanOrEqual(0.72)
  })

  it('切り抜きが全部失敗したら null。黙って変な値を返さない', () => {
    expect(chooseCutoutValue(() => null)).toBeNull()
  })

  it('濃い画素が無い結果は通さない。紙の裏写りだけが残った状態を弾く', () => {
    expect(chooseCutoutValue(() => ({ fill: 0.9, darkShare: 0.03 }))).toBeNull()
  })
})

describe('inkStats', () => {
  it('透明な絵では 0', () => {
    const stats = inkStats(createImage(10, 10))
    expect(stats.fill).toBe(0)
    expect(stats.darkShare).toBe(0)
  })

  it('濃い画素の割合を、不透明な画素に対して数える', () => {
    const image = createImage(10, 10)
    // 左半分だけ不透明。そのうち上半分が黒、下半分が白
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 5; x++) {
        const index = (y * 10 + x) * 4
        const light = y >= 5 ? 255 : 0
        image.data[index] = light
        image.data[index + 1] = light
        image.data[index + 2] = light
        image.data[index + 3] = 255
      }
    }
    expect(inkStats(image).fill).toBeCloseTo(0.5)
    expect(inkStats(image).darkShare).toBeCloseTo(0.5)
  })
})
