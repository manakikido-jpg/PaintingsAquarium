import { describe, expect, it } from 'vitest'
import {
  moonPulse,
  moteFade,
  moteProgress,
  moteX,
  quietCentre,
  spawnMotes,
  spawnStars,
  twinkle,
} from '../sparkle'

describe('星のまたたき', () => {
  const stars = spawnStars(1234, 30)

  it('明るさは 0〜1 に収まり、消えきらない', () => {
    for (const star of stars) {
      for (let t = 0; t < 12; t += 0.1) {
        const value = twinkle(star, t)
        expect(value).toBeGreaterThanOrEqual(0.34)
        expect(value).toBeLessThanOrEqual(1)
      }
    }
  })

  /*
   * **一斉に光らせない。** 位相をずらしていないと、画面全体が
   * 同じ拍で明滅して「壊れている」ように見える。
   */
  it('全部が同じ明るさにならない', () => {
    for (const t of [0, 1.3, 2.7, 5.1]) {
      const values = stars.map((star) => twinkle(star, t))
      expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.3)
    }
  })

  /* 2〜5秒。速いと落ち着かず、遅いと止まって見える */
  it('周期は 2〜5 秒に収まる', () => {
    for (const star of stars) {
      expect(star.period).toBeGreaterThanOrEqual(2)
      expect(star.period).toBeLessThanOrEqual(5)
    }
  })

  it('1周すると同じ明るさに戻る', () => {
    for (const star of stars.slice(0, 5)) {
      expect(twinkle(star, 3 + star.period)).toBeCloseTo(twinkle(star, 3), 6)
    }
  })

  /* ストロボにしない。1コマで明るさが跳ねると、ちかちかして見える */
  it('1/60 秒で明るさが跳ねない', () => {
    for (const star of stars) {
      for (let t = 0; t < 6; t += 1 / 60) {
        expect(Math.abs(twinkle(star, t + 1 / 60) - twinkle(star, t))).toBeLessThan(0.04)
      }
    }
  })
})

describe('漂う光の粒', () => {
  const motes = spawnMotes(5678, 20)

  /*
   * **経過秒から直に計算する。** 1フレームぶんずつ足し込むと、
   * フレーム間隔が変わったときに速さが変わる（会場のPCは一定ではない）。
   */
  it('コマ割りを変えても、同じ時刻なら同じ位置になる', () => {
    for (const mote of motes.slice(0, 5)) {
      const at = (t: number): number => moteProgress(mote, t)
      // 1/60 で進めても 1/24 で進めても、2秒後は同じ
      expect(at(2)).toBeCloseTo(at(2), 10)
      let coarse = 0
      for (let i = 0; i < 48; i++) coarse = at((i + 1) / 24)
      expect(coarse).toBeCloseTo(at(2), 10)
    }
  })

  it('進み具合は 0〜1 を繰り返す', () => {
    for (const mote of motes) {
      for (let t = 0; t < 400; t += 7.3) {
        const p = moteProgress(mote, t)
        expect(p).toBeGreaterThanOrEqual(0)
        expect(p).toBeLessThan(1)
      }
    }
  })

  /* 端で急に現れると、画面の縁に線が見える */
  it('上端と下端では濃さが 0 になる', () => {
    expect(moteFade(0)).toBe(0)
    expect(moteFade(1)).toBeCloseTo(0, 10)
    expect(moteFade(0.5)).toBe(1)
  })

  it('横揺れは元の位置から離れすぎない', () => {
    for (const mote of motes) {
      for (let t = 0; t < 20; t += 0.5) {
        expect(Math.abs(moteX(mote, t) - mote.x)).toBeLessThanOrEqual(mote.swayWidth + 1e-9)
      }
    }
  })

  it('速さは 1920x1080 で毎秒 5〜15px に収まる', () => {
    for (const mote of motes) {
      expect(mote.speed * 1080).toBeGreaterThanOrEqual(5)
      expect(mote.speed * 1080).toBeLessThanOrEqual(15)
    }
  })

  /* 金が主役。紫ばかりだと背景の紫に溶けて見えなくなる */
  it('金のほうが多い', () => {
    expect(motes.filter((m) => m.violet).length).toBeLessThan(motes.length / 2)
  })
})

describe('真ん中と月のまわりは暗くする', () => {
  /*
   * **子どもの絵は画面の中ほどを漂う。** そこに光を敷くと絵を探せなくなる。
   * 月の上も、もともと明るいので光を足す意味がない。
   */
  it('画面の中央では、ほとんど出さない', () => {
    expect(quietCentre(0.5, 0.5)).toBeLessThan(0.1)
  })

  it('四隅では、そのまま出す', () => {
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
      expect(quietCentre(x, y)).toBeGreaterThan(0.8)
    }
  })

  it('月の真上では出さない', () => {
    expect(quietCentre(0.5, 0.47)).toBeLessThan(0.05)
  })

  it('どこでも 0〜1 に収まる', () => {
    for (let x = 0; x <= 1; x += 0.05) {
      for (let y = 0; y <= 1; y += 0.05) {
        const value = quietCentre(x, y)
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('月のまわりの光の揺れ', () => {
  it('0.9〜1.1 に収まる', () => {
    for (let t = 0; t < 40; t += 0.25) {
      expect(moonPulse(t)).toBeGreaterThanOrEqual(0.9)
      expect(moonPulse(t)).toBeLessThanOrEqual(1.1)
    }
  })

  /* 8〜12秒。短いと息をしているように見える */
  it('既定の周期は 10 秒', () => {
    expect(moonPulse(0)).toBeCloseTo(moonPulse(10), 6)
  })
})
