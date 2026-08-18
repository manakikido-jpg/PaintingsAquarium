import { describe, expect, it } from 'vitest'
import {
  DEFAULT_UNDULATE,
  beatPhase,
  beatRate,
  stripCount,
  stripOffset,
  stripRatio,
  tailWeight,
  tailAngle,
  TAIL_MAX_ANGLE,
  headRatioToImageX,
} from '../undulate'

describe('stripRatio', () => {
  it('帯の中心で測る（端ではない）', () => {
    expect(stripRatio(0, 4)).toBeCloseTo(0.125)
    expect(stripRatio(3, 4)).toBeCloseTo(0.875)
  })

  it('どの帯も自分の受け持ち範囲の中に収まる', () => {
    for (const strips of [4, 8, 14]) {
      for (let index = 0; index < strips; index++) {
        const ratio = stripRatio(index, strips)
        expect(ratio).toBeGreaterThan(index / strips)
        expect(ratio).toBeLessThan((index + 1) / strips)
      }
    }
  })
})

describe('tailWeight', () => {
  it('頭側は完全に止まる。頭がぶれると溺れて見える', () => {
    expect(tailWeight(0, 0.34)).toBe(0)
    expect(tailWeight(0.2, 0.34)).toBe(0)
    expect(tailWeight(0.34, 0.34)).toBe(0)
  })

  it('尾の端で 1 になる', () => {
    expect(tailWeight(1, 0.34)).toBeCloseTo(1)
  })

  it('尾に向かって単調に増える', () => {
    let previous = -1
    for (let ratio = 0; ratio <= 1.0001; ratio += 0.05) {
      const weight = tailWeight(ratio, 0.34)
      expect(weight).toBeGreaterThanOrEqual(previous)
      previous = weight
    }
  })

  it('体の真ん中では控えめ。直線だと胴体から折れて見えるため', () => {
    // 頭止め 0.34 の真ん中あたり（0.67）は、尾の半分よりはっきり小さい
    expect(tailWeight(0.67, 0.34)).toBeLessThan(0.5 * tailWeight(1, 0.34))
  })
})

describe('stripOffset', () => {
  it('頭側は時刻によらず動かない', () => {
    for (let time = 0; time < 3; time += 0.13) {
      expect(stripOffset(0.1, time, 0)).toBe(0)
    }
  })

  it('振れ幅は設定値を超えない', () => {
    for (let time = 0; time < 5; time += 0.05) {
      for (let ratio = 0; ratio <= 1; ratio += 0.05) {
        expect(Math.abs(stripOffset(ratio, time, 1.2))).toBeLessThanOrEqual(
          DEFAULT_UNDULATE.amplitude + 1e-9,
        )
      }
    }
  })

  it('尾は体の真ん中よりはっきり大きく振れる', () => {
    const swing = (ratio: number): number => {
      let max = 0
      for (let time = 0; time < 2; time += 0.01) {
        max = Math.max(max, Math.abs(stripOffset(ratio, time, 0)))
      }
      return max
    }
    expect(swing(1)).toBeGreaterThan(swing(0.67) * 2)
  })

  it('位相をずらすと同じ時刻でも違う形になる。全部が同じ拍で振れると機械に見える', () => {
    const a = stripOffset(1, 0.3, 0)
    const b = stripOffset(1, 0.3, Math.PI)
    expect(Math.abs(a - b)).toBeGreaterThan(0.05)
  })

  it('速さ 1.1 回/秒なので、1/1.1 秒でひと回りして元に戻る', () => {
    const period = 1 / DEFAULT_UNDULATE.speed
    expect(stripOffset(1, 0.4 + period, 0)).toBeCloseTo(stripOffset(1, 0.4, 0), 6)
  })
})

describe('beatRate / beatPhase', () => {
  it('拍の速さは 0.85〜1.15 倍に収まる', () => {
    for (let seed = -50; seed < 50; seed++) {
      const rate = beatRate(seed)
      expect(rate).toBeGreaterThanOrEqual(0.85)
      expect(rate).toBeLessThanOrEqual(1.15)
    }
  })

  it('隣り合う種でも値がばらける（R-008 と同じ失敗を繰り返さない）', () => {
    const rates = new Set<number>()
    for (let seed = 0; seed < 40; seed++) rates.add(Math.round(beatRate(seed) * 100))
    expect(rates.size).toBeGreaterThan(20)
  })

  it('位相は 0〜2π に収まり、ばらける', () => {
    const buckets = new Set<number>()
    for (let seed = 0; seed < 60; seed++) {
      const phase = beatPhase(seed)
      expect(phase).toBeGreaterThanOrEqual(0)
      expect(phase).toBeLessThanOrEqual(Math.PI * 2)
      buckets.add(Math.floor((phase / (Math.PI * 2)) * 8))
    }
    // 8つの区画のうち、少なくとも6つには入ること
    expect(buckets.size).toBeGreaterThanOrEqual(6)
  })

  it('同じ種なら毎回同じ。起動するたびに泳ぎ方が変わらないため', () => {
    expect(beatRate(1234)).toBe(beatRate(1234))
    expect(beatPhase(1234)).toBe(beatPhase(1234))
  })
})

describe('stripCount', () => {
  it('0 のときは切らない（＝描画命令が今までと同じ1回に戻る）', () => {
    expect(stripCount(0)).toBe(1)
  })

  it('波を折れ線で表せる程度には切り、費用が跳ねる本数までは増やさない', () => {
    // 見た目の合否は画面で決める。ここで固定するのは「桁を間違えていないか」だけ。
    // 具体的な本数をテストに書くと、調整のたびにテストを書き換えることになる。
    expect(stripCount(1)).toBeGreaterThanOrEqual(6)
    expect(stripCount(1)).toBeLessThanOrEqual(20)
  })
})

describe('tailAngle', () => {
  it('しなり 0 なら振れない', () => {
    expect(tailAngle(0.6, 1.2, 0.3, 0)).toBe(0)
  })

  it('最大の振れ角を超えない', () => {
    for (let time = 0; time < 4; time += 0.02) {
      expect(Math.abs(tailAngle(1, time, 0.7, 1))).toBeLessThanOrEqual(TAIL_MAX_ANGLE + 1e-9)
    }
  })

  it('しなりの強さに比例する', () => {
    const full = Math.abs(tailAngle(0.6, 0.4, 0, 1))
    const half = Math.abs(tailAngle(0.6, 0.4, 0, 0.5))
    expect(half).toBeCloseTo(full / 2, 6)
  })

  it('頭側では振れない。付け根が頭に近すぎる絵で顔が回らないため', () => {
    expect(tailAngle(0.1, 0.5, 0, 1)).toBe(0)
  })

  it('胴の波より遅れる。同じ位相だと体と尾が一枚板に見える', () => {
    // 胴のずれが最大になる時刻では、尾の角度はまだ最大になっていない
    let peakTime = 0
    let peak = 0
    for (let time = 0; time < 1; time += 0.005) {
      const shift = Math.abs(stripOffset(1, time, 0))
      if (shift > peak) {
        peak = shift
        peakTime = time
      }
    }
    const angleAtPeak = Math.abs(tailAngle(1, peakTime, 0, 1))
    expect(angleAtPeak).toBeLessThan(TAIL_MAX_ANGLE * 0.35)
  })

  it('胴と同じ周期で戻る', () => {
    const period = 1 / DEFAULT_UNDULATE.speed
    expect(tailAngle(0.7, 0.3 + period, 0.2, 1)).toBeCloseTo(tailAngle(0.7, 0.3, 0.2, 1), 6)
  })
})

describe('headRatioToImageX', () => {
  it('頭が右なら、頭からの割合は右から数える', () => {
    expect(headRatioToImageX(0, true)).toBe(1)
    expect(headRatioToImageX(1, true)).toBe(0)
  })

  it('頭が左ならそのまま', () => {
    expect(headRatioToImageX(0, false)).toBe(0)
    expect(headRatioToImageX(1, false)).toBe(1)
  })
})
