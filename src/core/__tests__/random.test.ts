import { describe, expect, it } from 'vitest'
import { seededRandom } from '../random'

describe('seededRandom', () => {
  it('同じ種なら必ず同じ並びになる', () => {
    const a = seededRandom(42)
    const b = seededRandom(42)
    for (let index = 0; index < 50; index++) expect(a()).toBe(b())
  })

  it('0 以上 1 未満に収まる', () => {
    const random = seededRandom(7)
    for (let index = 0; index < 5000; index++) {
      const value = random()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  /**
   * これが本題。素直な線形合同法では、種を 1 ずつ変えても
   * **最初の 1 回の出目がほとんど動かない**（R-008）。
   * 「種ごとに 1 回だけ引く」使い方（列を選ぶ、向きを決める）で必ず壊れる。
   */
  it('近い種でも、最初の1回の出目が散らばる', () => {
    const first = Array.from({ length: 60 }, (_, seed) => seededRandom(seed)())
    const buckets = new Set(first.map((value) => Math.floor(value * 8)))

    expect(buckets.size).toBe(8)
    expect(Math.max(...first) - Math.min(...first)).toBeGreaterThan(0.9)
  })

  it('種が 0 でも動く', () => {
    expect(Number.isFinite(seededRandom(0)())).toBe(true)
  })

  it('偏りが大きくない（8等分してどこも極端に空かない）', () => {
    const random = seededRandom(123)
    const counts = new Array(8).fill(0)
    for (let index = 0; index < 8000; index++) counts[Math.floor(random() * 8)]++

    for (const count of counts) {
      expect(count).toBeGreaterThan(800)
      expect(count).toBeLessThan(1200)
    }
  })
})
