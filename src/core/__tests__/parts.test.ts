import { describe, expect, it } from 'vitest'
import { partAlpha, placeParts } from '../parts'
import type { Tank } from '../swim'

const tank: Tank = { width: 1600, height: 900 }
const options = { groundAt: () => 800 }

describe('placeParts', () => {
  it('頼んだ数だけ置く', () => {
    expect(placeParts(1, 12, 20, tank, options)).toHaveLength(12)
  })

  it('パーツが無ければ何も置かない', () => {
    expect(placeParts(1, 12, 0, tank, options)).toHaveLength(0)
  })

  it('画面の外へはみ出さない', () => {
    for (const part of placeParts(2, 30, 20, tank, options)) {
      expect(part.x).toBeGreaterThanOrEqual(0)
      expect(part.x).toBeLessThanOrEqual(tank.width)
    }
  })

  it('横に散らばる。固まると空く場所ができる', () => {
    const xs = placeParts(3, 24, 20, tank, options).map((one) => one.x)
    const bins = new Array(6).fill(0)
    for (const x of xs) bins[Math.min(5, Math.floor((x / tank.width) * 6))]++
    // どの区画にも必ず1つは入る
    expect(bins.every((count) => count > 0)).toBe(true)
  })

  it('どのパーツを使うかが散らばる。同じ画像ばかりだと壁紙に見える', () => {
    const used = new Set(placeParts(4, 30, 8, tank, options).map((one) => one.index))
    expect(used.size).toBeGreaterThan(4)
  })

  it('左右反転が半々くらい混ざる', () => {
    const parts = placeParts(5, 40, 8, tank, options)
    const flipped = parts.filter((one) => one.flipped).length
    expect(flipped).toBeGreaterThan(8)
    expect(flipped).toBeLessThan(32)
  })

  it('奥から手前の順に並ぶ', () => {
    const parts = placeParts(6, 20, 8, tank, options)
    for (let index = 1; index < parts.length; index++) {
      expect(parts[index].depth).toBeGreaterThanOrEqual(parts[index - 1].depth)
    }
  })

  it('奥のものほど小さい。奥行きは濃さだけで表さない', () => {
    const parts = placeParts(7, 60, 8, tank, options)
    const far = parts.filter((one) => one.depth < 0.3)
    const near = parts.filter((one) => one.depth > 0.7)
    const mean = (list: readonly { height: number }[]): number =>
      list.reduce((sum, one) => sum + one.height, 0) / Math.max(1, list.length)
    expect(mean(near)).toBeGreaterThan(mean(far))
  })

  it('高さを基準にする。幅を基準にすると細長いパーツが画面を突き抜ける', () => {
    for (const part of placeParts(11, 40, 8, tank, options)) {
      // どんなに大きくても画面の高さの半分は超えない
      expect(part.height).toBeLessThan(tank.height * 0.5)
      expect(part.height).toBeGreaterThan(0)
    }
  })

  it('地面の高さをそのまま使う', () => {
    const parts = placeParts(8, 10, 8, tank, { groundAt: (x) => 700 + x * 0.05 })
    for (const part of parts) expect(part.groundY).toBeCloseTo(700 + part.x * 0.05)
  })

  it('同じ種を渡せば同じ配置になる。起動のたびに変わらない', () => {
    expect(placeParts(9, 15, 8, tank, options)).toEqual(placeParts(9, 15, 8, tank, options))
  })
})

describe('partAlpha', () => {
  it('奥ほど薄く、水の色に寄る', () => {
    expect(partAlpha(0)).toBeLessThan(partAlpha(1))
  })

  it('手前は水の色に寄せない', () => {
    expect(partAlpha(1)).toBeCloseTo(1)
  })
})

describe('パーツの選び方', () => {
  const tank = { width: 1600, height: 900 }
  const options = { groundAt: () => 800 }

  it('種類数の倍だけ置くと、全種類がちょうど2回ずつ出る', () => {
    // 返り値は奥行き順に並べ替えられるので、出た回数で数える
    const parts = placeParts(31, 12, 6, tank, options)
    const times = new Map<number, number>()
    for (const part of parts) times.set(part.index, (times.get(part.index) ?? 0) + 1)
    expect([...times.keys()].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5])
    expect([...times.values()]).toEqual([2, 2, 2, 2, 2, 2])
  })

  it('種類数より少ないときも同じ種類が重複しない', () => {
    const parts = placeParts(77, 5, 20, tank, options)
    const used = new Set(parts.map((part) => part.index))
    expect(used.size).toBe(5)
  })
})
