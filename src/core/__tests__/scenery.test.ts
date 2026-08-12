import { describe, expect, it } from 'vitest'
import { bubbleX, rayAt, spawnBubbles, spawnRays, stepBubble } from '../scenery'
import type { Tank } from '../swim'

const tank: Tank = { width: 1920, height: 1080 }

describe('spawnRays', () => {
  it('同じ種なら必ず同じ結果になる', () => {
    expect(spawnRays(3, 6, tank)).toEqual(spawnRays(3, 6, tank))
  })

  it('光の筋が画面内に散らばる（束にならない）', () => {
    const rays = spawnRays(3, 6, tank)
    const sorted = [...rays].map((ray) => ray.topX).sort((a, b) => a - b)

    expect(rays).toHaveLength(6)
    for (const ray of rays) {
      expect(ray.topX).toBeGreaterThan(0)
      expect(ray.topX).toBeLessThan(tank.width)
    }
    // 隣り合う筋が重ならない程度には離れている
    for (let index = 1; index < sorted.length; index++) {
      expect(sorted[index] - sorted[index - 1]).toBeGreaterThan(tank.width * 0.05)
    }
  })

  it('0 本でも落ちない', () => {
    expect(spawnRays(1, 0, tank)).toEqual([])
  })
})

describe('rayAt', () => {
  it('明るさは 0 以上、その筋の最大値以下に収まる', () => {
    const ray = spawnRays(9, 5, tank)[0]

    for (let step = 0; step < 2000; step++) {
      const shape = rayAt(ray, step * 0.05, tank)
      expect(shape.alpha).toBeGreaterThanOrEqual(0)
      expect(shape.alpha).toBeLessThanOrEqual(ray.strength)
    }
  })

  it('消えている時間がある（常時光りっぱなしにしない）', () => {
    const ray = spawnRays(9, 5, tank)[0]
    const samples = Array.from({ length: 500 }, (_, step) => rayAt(ray, step * 0.05, tank).alpha)

    expect(Math.min(...samples)).toBeLessThan(0.001)
    expect(Math.max(...samples)).toBeGreaterThan(0)
  })

  it('位置が有限の値になる', () => {
    const ray = spawnRays(9, 5, tank)[0]
    const shape = rayAt(ray, 12.34, tank)
    expect(Number.isFinite(shape.topX)).toBe(true)
    expect(Number.isFinite(shape.bottomX)).toBe(true)
  })

  it('高さ 0 の水槽では光らない', () => {
    const ray = spawnRays(9, 5, tank)[0]
    expect(rayAt(ray, 1, { width: 100, height: 0 }).alpha).toBe(0)
  })
})

describe('spawnBubbles', () => {
  it('同じ種なら必ず同じ結果になる', () => {
    expect(spawnBubbles(5, 20, tank)).toEqual(spawnBubbles(5, 20, tank))
  })

  it('最初から画面全体に散らばっている（下端から一斉に湧かない）', () => {
    const bubbles = spawnBubbles(5, 60, tank)
    const inUpperHalf = bubbles.filter((bubble) => bubble.y < tank.height / 2).length

    expect(inUpperHalf).toBeGreaterThan(10)
    expect(inUpperHalf).toBeLessThan(50)
  })

  it('大きい泡ほど速く上がる', () => {
    const bubbles = spawnBubbles(5, 40, tank)
    const sorted = [...bubbles].sort((a, b) => a.radius - b.radius)

    for (let index = 1; index < sorted.length; index++) {
      expect(sorted[index].speed).toBeGreaterThanOrEqual(sorted[index - 1].speed - 1e-9)
    }
  })

  it('薄さの上限を超えない（絵より目立たせない）', () => {
    for (const bubble of spawnBubbles(5, 60, tank, { maxAlpha: 0.2 })) {
      expect(bubble.alpha).toBeLessThanOrEqual(0.2)
      expect(bubble.alpha).toBeGreaterThan(0)
    }
  })
})

describe('stepBubble', () => {
  it('上へ上がる', () => {
    const bubble = spawnBubbles(1, 1, tank)[0]
    expect(stepBubble(bubble, 1, tank).y).toBeLessThan(bubble.y)
  })

  it('上端を抜けたら下から出し直す', () => {
    const bubble = { ...spawnBubbles(1, 1, tank)[0], y: 1, speed: 500 }
    const next = stepBubble(bubble, 1, tank)

    expect(next.y).toBeGreaterThan(tank.height)
  })

  it('出し直すとき横にずらす（泡の柱にしない）', () => {
    const bubble = { ...spawnBubbles(1, 1, tank)[0], y: 1, speed: 500 }
    const next = stepBubble(bubble, 1, tank)

    expect(next.x).not.toBeCloseTo(bubble.x, 3)
    expect(next.x).toBeGreaterThanOrEqual(0)
    expect(next.x).toBeLessThan(tank.width)
  })

  it('長く回しても画面の横幅から出ない', () => {
    let bubble = spawnBubbles(2, 1, tank)[0]

    for (let frame = 0; frame < 20000; frame++) {
      bubble = stepBubble(bubble, 1 / 30, tank)
      expect(bubble.x).toBeGreaterThanOrEqual(0)
      expect(bubble.x).toBeLessThan(tank.width)
      expect(Number.isFinite(bubbleX(bubble))).toBe(true)
    }
  })

  it('dt が負でも巻き戻らない', () => {
    const bubble = spawnBubbles(1, 1, tank)[0]
    expect(stepBubble(bubble, -1, tank).y).toBe(bubble.y)
  })

  it('幅 0 の水槽でも落ちない（0 除算しない）', () => {
    const bubble = { ...spawnBubbles(1, 1, tank)[0], y: 1, speed: 500 }
    expect(() => stepBubble(bubble, 1, { width: 0, height: 0 })).not.toThrow()
    expect(Number.isFinite(stepBubble(bubble, 1, { width: 0, height: 0 }).x)).toBe(true)
  })
})
