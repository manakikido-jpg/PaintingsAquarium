import { describe, expect, it } from 'vitest'
import { floodFromBorder, sealSteps, shrinkMask } from '../flood'

/** '.' = 通れる / '#' = 通れない。目で読める形で組み立てる。 */
function maskFromRows(rows: string[]): { mask: Uint8Array; width: number; height: number } {
  const height = rows.length
  const width = height === 0 ? 0 : rows[0].length
  const mask = new Uint8Array(width * height)
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) mask[y * width + x] = row[x] === '.' ? 1 : 0
  })
  return { mask, width, height }
}

const show = (out: Uint8Array, width: number, height: number): string[] => {
  const rows: string[] = []
  for (let y = 0; y < height; y++) {
    let row = ''
    for (let x = 0; x < width; x++) row += out[y * width + x] === 1 ? 'o' : '.'
    rows.push(row)
  }
  return rows
}

describe('floodFromBorder', () => {
  it('外周から通れる所だけに印を付ける', () => {
    const { mask, width, height } = maskFromRows(['.....', '.###.', '.#.#.', '.###.', '.....'])

    const outside = floodFromBorder(mask, width, height)

    expect(show(outside, width, height)).toEqual([
      'ooooo',
      'o...o',
      'o...o',
      'o...o',
      'ooooo',
    ])
  })

  it('壁に切れ目があると、そこから中まで届く', () => {
    const { mask, width, height } = maskFromRows(['.....', '.###.', '.#..．'.replace('．', '.'), '.###.', '.....'])

    const outside = floodFromBorder(mask, width, height)

    expect(outside[2 * width + 2]).toBe(1)
  })

  /*
   * **これが本題（R-057）。**
   * 切れ目を塞いでから辿れば、中へ入らない。
   * 辿ったあとに戻すので、本当に開いている所は今までどおり外側になる。
   */
  it('塞ぐ幅を与えると、切れ目から入らない', () => {
    const side = 21
    const rows: string[] = []
    for (let y = 0; y < side; y++) {
      let row = ''
      for (let x = 0; x < side; x++) {
        const onEdge = x === 5 || x === 15 || y === 5 || y === 15
        const inBox = x >= 5 && x <= 15 && y >= 5 && y <= 15
        // 上の辺に 1 画素の切れ目
        const gap = y === 5 && x === 10
        row += onEdge && inBox && !gap ? '#' : '.'
      }
      rows.push(row)
    }
    const { mask, width, height } = maskFromRows(rows)

    expect(floodFromBorder(mask, width, height)[10 * width + 10]).toBe(1)
    expect(floodFromBorder(mask, width, height, 1)[10 * width + 10]).toBe(0)
  })

  it('塞いでも、本当に開いている所は外側のまま', () => {
    const { mask, width, height } = maskFromRows([
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
    ])

    const outside = floodFromBorder(mask, width, height, 1)

    for (let index = 0; index < width * height; index++) expect(outside[index]).toBe(1)
  })

  it('大きさ 0 でも落ちない', () => {
    expect(() => floodFromBorder(new Uint8Array(0), 0, 0, 2)).not.toThrow()
  })
})

describe('shrinkMask', () => {
  it('へりが削れる', () => {
    const { mask, width, height } = maskFromRows(['#####', '#...#', '#...#', '#...#', '#####'])

    const thin = shrinkMask(mask, width, height, 1)

    expect(thin[2 * width + 2]).toBe(1)
    expect(thin[1 * width + 1]).toBe(0)
  })
})

describe('sealSteps', () => {
  /*
   * **小さい絵では 0 にする。** 数十画素の絵で痩せさせると全体が消える。
   * 取り込む絵は長辺 1200px 前後なので、そこでだけ効けばよい。
   */
  it('小さい絵では 0 になる', () => {
    expect(sealSteps(5, 5, 0.004)).toBe(0)
  })

  it('実寸の絵では画素数になる', () => {
    expect(sealSteps(1200, 848, 0.004)).toBe(3)
    expect(sealSteps(1200, 848, 0.05)).toBe(42)
  })
})
