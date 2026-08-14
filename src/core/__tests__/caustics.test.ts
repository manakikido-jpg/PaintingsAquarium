import { describe, expect, it } from 'vitest'
import { renderCaustics } from '../caustics'

const W = 96
const H = 54

function render(time: number, options = {}): Uint8ClampedArray {
  return renderCaustics(new Uint8ClampedArray(W * H), W, H, time, options)
}

describe('renderCaustics', () => {
  it('同じ時刻なら必ず同じ模様になる', () => {
    expect(Array.from(render(3.5))).toEqual(Array.from(render(3.5)))
  })

  it('時間が進むと模様が変わる（止まって見えない）', () => {
    const before = render(0)
    const after = render(0.5)

    let changed = 0
    for (let index = 0; index < before.length; index++) {
      if (Math.abs(before[index] - after[index]) > 4) changed++
    }
    expect(changed / before.length).toBeGreaterThan(0.3)
  })

  it('0〜255 に収まり、壊れた値が出ない', () => {
    const map = render(7.25)
    for (const value of map) {
      expect(Number.isFinite(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(255)
    }
  })

  it('明るい筋と暗い所の両方がある（のっぺりしない）', () => {
    const map = render(2)
    expect(Math.max(...map)).toBeGreaterThan(180)
    expect(Math.min(...map)).toBeLessThan(20)
  })

  it('筋は細い（画面の大半が明るくならない）', () => {
    const map = render(2)
    const bright = [...map].filter((value) => value > 128).length
    expect(bright / map.length).toBeLessThan(0.25)
  })

  it('水面に近いほうが強い', () => {
    const map = render(2, { topBias: 0.7 })
    const average = (fromRow: number, toRow: number): number => {
      let total = 0
      for (let y = fromRow; y < toRow; y++) {
        for (let x = 0; x < W; x++) total += map[y * W + x]
      }
      return total / ((toRow - fromRow) * W)
    }

    expect(average(0, 10)).toBeGreaterThan(average(H - 10, H) * 1.5)
  })

  it('鋭さを上げると筋が細くなる', () => {
    const countBright = (sharpness: number): number =>
      [...render(2, { sharpness })].filter((value) => value > 128).length

    expect(countBright(12)).toBeLessThan(countBright(4))
  })

  it('大きさ 0 でも落ちない', () => {
    expect(() => renderCaustics(new Uint8ClampedArray(0), 0, 0, 1)).not.toThrow()
  })

  it('1画素でも落ちない', () => {
    expect(() => renderCaustics(new Uint8ClampedArray(1), 1, 1, 1)).not.toThrow()
  })
})
