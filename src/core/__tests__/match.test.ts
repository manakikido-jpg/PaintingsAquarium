import { describe, expect, it } from 'vitest'
import { createImage, type RgbaImage } from '../image'
import {
  MATCH_THRESHOLD,
  matchTemplates,
  mirrorSilhouette,
  overlap,
  silhouette,
  turnSilhouette,
} from '../match'

function box(width: number, height: number, fromX: number, fromY: number, toX: number, toY: number): RgbaImage {
  const image = createImage(width, height)
  for (let y = fromY; y < toY; y++) {
    for (let x = fromX; x < toX; x++) image.data[(y * width + x) * 4 + 3] = 255
  }
  return image
}

/** 縦長。イカのように上下に長い形。 */
const tall = box(40, 80, 10, 5, 30, 75)
/** 横長。魚のように左右に長い形。 */
const wide = box(80, 40, 5, 10, 75, 30)

describe('silhouette', () => {
  it('縦横比を保つ。引き伸ばすと縦長と横長が同じ形になってしまう', () => {
    expect(overlap(silhouette(tall), silhouette(wide))).toBeLessThan(0.6)
  })

  it('大きさが違っても、同じ形なら一致する', () => {
    const small = box(20, 40, 5, 3, 15, 37)
    expect(overlap(silhouette(tall), silhouette(small))).toBeGreaterThan(0.85)
  })
})

describe('overlap', () => {
  it('同じ形なら 1', () => {
    expect(overlap(silhouette(tall), silhouette(tall))).toBe(1)
  })

  it('両方とも空なら 0。空白どうしの一致を点数にしない', () => {
    const empty = silhouette(createImage(10, 10))
    expect(overlap(empty, empty)).toBe(0)
  })

  it('升目の大きさが違えば投げる', () => {
    expect(() => overlap(silhouette(tall, 16), silhouette(tall, 32))).toThrow()
  })
})

describe('turnSilhouette / mirrorSilhouette', () => {
  it('4回まわすと元に戻る', () => {
    let shape = silhouette(tall)
    for (let index = 0; index < 4; index++) shape = turnSilhouette(shape, 1)
    expect(overlap(shape, silhouette(tall))).toBe(1)
  })

  it('2回反転すると元に戻る', () => {
    expect(overlap(mirrorSilhouette(mirrorSilhouette(silhouette(tall))), silhouette(tall))).toBe(1)
  })

  it('90度まわすと縦長が横長になる', () => {
    expect(overlap(turnSilhouette(silhouette(tall), 1), silhouette(wide))).toBeGreaterThan(0.85)
  })
})

/** L字。まわしても別の形にならない（回転で他と紛れないための試験用）。 */
function ell(): RgbaImage {
  const image = createImage(60, 60)
  const put = (fromX: number, fromY: number, toX: number, toY: number): void => {
    for (let y = fromY; y < toY; y++) {
      for (let x = fromX; x < toX; x++) image.data[(y * 60 + x) * 4 + 3] = 255
    }
  }
  put(8, 8, 22, 52)
  put(8, 38, 52, 52)
  return image
}

/** 十字。L字とは重ならない。 */
function cross(): RgbaImage {
  const image = createImage(60, 60)
  const put = (fromX: number, fromY: number, toX: number, toY: number): void => {
    for (let y = fromY; y < toY; y++) {
      for (let x = fromX; x < toX; x++) image.data[(y * 60 + x) * 4 + 3] = 255
    }
  }
  put(24, 6, 36, 54)
  put(6, 24, 54, 36)
  return image
}

describe('matchTemplates', () => {
  const templates = [
    { id: 'L字', shape: silhouette(ell()) },
    { id: '十字', shape: silhouette(cross()) },
  ]

  it('台紙が無ければ null', () => {
    expect(matchTemplates(ell(), [])).toBeNull()
  })

  it('同じ形の台紙を選ぶ', () => {
    expect(matchTemplates(ell(), templates)?.id).toBe('L字')
    expect(matchTemplates(cross(), templates)?.id).toBe('十字')
  })

  it('絵が横倒しでも、まわして合わせて同じ台紙にたどり着く', () => {
    // 紙の向きは描いた人が決める（R-019）。台紙方式なら、合った向きが
    // そのまま「正しい向き」になるので、向きを別に推定しなくてよい。
    const turned = createImage(60, 60)
    const source = ell()
    for (let y = 0; y < 60; y++) {
      for (let x = 0; x < 60; x++) {
        turned.data[(x * 60 + (59 - y)) * 4 + 3] = source.data[(y * 60 + x) * 4 + 3]
      }
    }
    const found = matchTemplates(turned, templates)
    expect(found?.id).toBe('L字')
    expect(found?.turns).not.toBe(0)
  })

  it('まわすと重なる台紙どうしは見分けられない。台紙を作るときの制約', () => {
    // 縦長を 90 度まわすと横長そのもの。形だけを見ている以上、区別できない。
    // 台紙を用意するときは、**まわして重なる形を2つ入れない**こと。
    const both = [
      { id: 'たて', shape: silhouette(tall) },
      { id: 'よこ', shape: silhouette(wide) },
    ]
    expect(matchTemplates(tall, both)?.score).toBe(1)
    expect(matchTemplates(wide, both)?.score).toBe(1)
  })

  it('しきい値は本物の台紙で決め直す前提の暫定値', () => {
    // 実物3枚の照合では 自分=1.00 / 別の生き物=0.61〜0.67 だった。
    // ただし傾け・拡大した絵では正解でも 0.63 まで落ちて重なる。
    // **本物の塗り絵で測り直すまで、この値を信用しない。**
    expect(MATCH_THRESHOLD).toBeGreaterThan(0.6)
    expect(MATCH_THRESHOLD).toBeLessThan(1)
  })
})
