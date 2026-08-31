import { describe, expect, it } from 'vitest'
import { loopingDrift, renderCaustics } from '../caustics'

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

/*
 * **焼いたコマを繰り返すには、1周してぴったり元へ戻らないといけない**（F-348）。
 *
 * 波はふつう互いに割り切れない周期にしてあるので（同じ模様が二度出てこない）、
 * そのままでは焼いたコマの終わりと始まりがつながらず、継ぎ目で飛ぶ。
 */
describe('1周して元に戻る（焼くために要る）', () => {
  const field = (seconds: number, options: Parameters<typeof renderCaustics>[4]) => {
    const out = new Uint8ClampedArray(64 * 36)
    renderCaustics(out, 64, 36, seconds, options)
    return out
  }

  it('1周ぴったりで、同じ模様に戻る', () => {
    for (const speed of [0.1, 0.16, 0.35]) {
      const options = { speed, loopSeconds: 180 }
      expect(field(180, options)).toEqual(field(0, options))
      expect(field(360, options)).toEqual(field(0, options))
    }
  })

  it('1周の途中では、ちゃんと別の模様になっている', () => {
    // ここが同じになると「止まって見える」。実際に 60秒 で1周させたとき、
    // 波の速さが全部同じ値に丸められて半周で符号が反転するだけになり、
    // **30秒で同じ絵に戻った**（`drawCaustics.ts` の `loopSeconds`）
    const options = { speed: 0.1, loopSeconds: 180 }
    const start = field(0, options)
    let biggest = 0
    for (const at of [30, 60, 90, 120, 150]) {
      const later = field(at, options)
      let diff = 0
      for (let index = 0; index < start.length; index++) {
        diff = Math.max(diff, Math.abs(start[index] - later[index]))
      }
      biggest = Math.max(biggest, diff)
      expect(diff).toBeGreaterThan(30)
    }
    expect(biggest).toBeGreaterThan(200)
  })

  it('1周を決めなければ、今までどおり二度と同じにならない', () => {
    const options = { speed: 0.1 }
    expect(field(180, options)).not.toEqual(field(0, options))
  })
})

describe('loopingDrift', () => {
  it('1周のあいだに整数回まわる値へ丸める', () => {
    const speed = 0.1
    const loop = 180
    for (const drift of [1.0, -0.83, 1.27, -1.09, 0.71, -1.51]) {
      const turns = (loopingDrift(drift, speed, loop) * loop * speed) / (Math.PI * 2)
      expect(Math.abs(turns - Math.round(turns))).toBeLessThan(1e-9)
    }
  })

  it('丸めても、向きと大きさはだいたい保つ', () => {
    for (const drift of [1.0, -0.83, 1.27, -1.09, 0.71, -1.51]) {
      const looped = loopingDrift(drift, 0.1, 180)
      expect(Math.sign(looped)).toBe(Math.sign(drift))
      expect(Math.abs(looped - drift) / Math.abs(drift)).toBeLessThan(0.2)
    }
  })

  it('1周を決めなければ、何もしない', () => {
    expect(loopingDrift(0.83, 0.1, 0)).toBe(0.83)
  })

  it('1回転も入らないほど短くても、止まらせない', () => {
    // 0 に丸めると、その波だけ動かなくなる
    const looped = loopingDrift(0.1, 0.01, 5)
    expect(looped).not.toBe(0)
    expect(Math.sign(looped)).toBe(1)
  })
})
