import { describe, expect, it } from 'vitest'
import { facesRight, renderY, spawnFish, stepFish, type Fish, type Tank } from '../swim'

const tank: Tank = { width: 1920, height: 1080 }

function fishAt(overrides: Partial<Fish> = {}): Fish {
  return {
    x: 960,
    y: 540,
    vx: 60,
    vy: 10,
    width: 200,
    height: 120,
    phase: 0,
    phaseSpeed: 1.5,
    amplitude: 10,
    ...overrides,
  }
}

describe('stepFish', () => {
  it('速度のぶんだけ進む', () => {
    const next = stepFish(fishAt({ vy: 0 }), 0.5, tank)
    expect(next.x).toBeCloseTo(990, 6)
    expect(next.y).toBeCloseTo(540, 6)
  })

  it('左の壁で跳ね返り、壁の外に残らない', () => {
    const next = stepFish(fishAt({ x: 105, vx: -60 }), 1, tank)
    expect(next.vx).toBeGreaterThan(0)
    expect(next.x).toBe(100)
  })

  it('右の壁で跳ね返る', () => {
    const next = stepFish(fishAt({ x: 1810, vx: 60 }), 1, tank)
    expect(next.vx).toBeLessThan(0)
    expect(next.x).toBe(1820)
  })

  it('長く泳がせても画面の外に出ない（ゆらぎを含めて）', () => {
    let fish = spawnFish(12345, tank, 800, 600)

    for (let frame = 0; frame < 20000; frame++) {
      fish = stepFish(fish, 1 / 60, tank)

      expect(fish.x - fish.width / 2).toBeGreaterThanOrEqual(-0.001)
      expect(fish.x + fish.width / 2).toBeLessThanOrEqual(tank.width + 0.001)
      expect(renderY(fish) - fish.height / 2).toBeGreaterThanOrEqual(-0.001)
      expect(renderY(fish) + fish.height / 2).toBeLessThanOrEqual(tank.height + 0.001)
    }
  })

  it('壁に貼り付かない（跳ね返った次のフレームで壁から離れる）', () => {
    const bounced = stepFish(fishAt({ x: 0, vx: -60 }), 1, tank)
    const after = stepFish(bounced, 1, tank)
    expect(after.x).toBeGreaterThan(bounced.x)
  })

  it('絵が水槽より大きくても落ちない', () => {
    const huge = fishAt({ width: 5000, height: 5000 })
    expect(() => stepFish(huge, 1, tank)).not.toThrow()
    expect(Number.isFinite(stepFish(huge, 1, tank).x)).toBe(true)
  })

  it('dt が負でも巻き戻らない', () => {
    const next = stepFish(fishAt(), -1, tank)
    expect(next.x).toBe(960)
  })

  it('揺れの位相が進む', () => {
    expect(stepFish(fishAt({ phase: 0, phaseSpeed: 2 }), 0.5, tank).phase).toBeCloseTo(1, 6)
  })
})

describe('facesRight', () => {
  it('右に進んでいれば右向き', () => {
    expect(facesRight(fishAt({ vx: 5 }))).toBe(true)
    expect(facesRight(fishAt({ vx: -5 }))).toBe(false)
  })
})

describe('spawnFish', () => {
  it('同じ種なら必ず同じ結果になる', () => {
    expect(spawnFish(7, tank, 400, 300)).toEqual(spawnFish(7, tank, 400, 300))
  })

  it('種が違えば違う結果になる', () => {
    expect(spawnFish(7, tank, 400, 300)).not.toEqual(spawnFish(8, tank, 400, 300))
  })

  it('絵の縦横比を保ったまま、長辺を targetSize に合わせる', () => {
    const fish = spawnFish(1, tank, 400, 300, { targetSize: 200 })
    expect(fish.width).toBeCloseTo(200, 6)
    expect(fish.height).toBeCloseTo(150, 6)
  })

  it('生まれた時点で画面の中にいる', () => {
    for (let seed = 0; seed < 200; seed++) {
      const fish = spawnFish(seed, tank, 800, 600)
      expect(renderY(fish) - fish.height / 2).toBeGreaterThanOrEqual(-0.001)
      expect(renderY(fish) + fish.height / 2).toBeLessThanOrEqual(tank.height + 0.001)
    }
  })

  it('大きさ 0 の画像でも落ちない', () => {
    expect(() => spawnFish(1, tank, 0, 0)).not.toThrow()
  })
})

describe('spawnFish の横位置', () => {
  it('生まれた時点で横方向も画面の中にいる', () => {
    for (let seed = 0; seed < 200; seed++) {
      const fish = spawnFish(seed, tank, 800, 600)
      expect(fish.x - fish.width / 2).toBeGreaterThanOrEqual(-0.001)
      expect(fish.x + fish.width / 2).toBeLessThanOrEqual(tank.width + 0.001)
    }
  })

  it('生まれる横位置が散らばる（全部が画面中央から出ない）', () => {
    const xs = Array.from({ length: 40 }, (_, seed) => spawnFish(seed, tank, 800, 600).x)
    const centre = tank.width / 2
    const atCentre = xs.filter((x) => Math.abs(x - centre) < 1).length

    expect(atCentre).toBeLessThan(3)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(tank.width * 0.4)
  })
})
