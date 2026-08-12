import { describe, expect, it } from 'vitest'
import { rockOutline, sandProfile, seaweedShape, spawnRocks, spawnSeaweed } from '../decor'
import type { Tank } from '../swim'

const tank: Tank = { width: 1920, height: 1080 }

describe('sandProfile', () => {
  it('同じ種なら必ず同じ結果になる', () => {
    expect(sandProfile(4, tank)).toEqual(sandProfile(4, tank))
  })

  it('画面の下のほうに収まる（絵の泳ぐ範囲を埋めない）', () => {
    for (const y of sandProfile(4, tank)) {
      expect(y).toBeGreaterThan(tank.height * 0.75)
      expect(y).toBeLessThan(tank.height)
    }
  })

  it('隣り合う点が滑らかに繋がる（ノコギリにならない）', () => {
    const points = sandProfile(4, tank, 48)

    for (let index = 1; index < points.length; index++) {
      expect(Math.abs(points[index] - points[index - 1])).toBeLessThan(tank.height * 0.02)
    }
  })

  it('平らではなく起伏がある', () => {
    const points = sandProfile(4, tank)
    expect(Math.max(...points) - Math.min(...points)).toBeGreaterThan(tank.height * 0.01)
  })

  it('点が1つでも落ちない', () => {
    expect(sandProfile(4, tank, 1)).toHaveLength(1)
  })
})

describe('spawnRocks', () => {
  it('同じ種なら必ず同じ結果になる', () => {
    expect(spawnRocks(7, 5, tank)).toEqual(spawnRocks(7, 5, tank))
  })

  it('画面の横幅の中に散らばる（1か所に固まらない）', () => {
    const rocks = spawnRocks(7, 5, tank)
    const sorted = rocks.map((rock) => rock.x).sort((a, b) => a - b)

    for (const rock of rocks) {
      expect(rock.x).toBeGreaterThan(0)
      expect(rock.x).toBeLessThan(tank.width)
    }
    for (let index = 1; index < sorted.length; index++) {
      expect(sorted[index] - sorted[index - 1]).toBeGreaterThan(tank.width * 0.05)
    }
  })

  it('0 個でも落ちない', () => {
    expect(spawnRocks(7, 0, tank)).toEqual([])
  })
})

describe('rockOutline', () => {
  it('砂の高さより上に盛り上がる', () => {
    const rock = spawnRocks(7, 5, tank)[0]
    const groundY = 900
    const outline = rockOutline(rock, groundY)

    expect(outline.every((point) => point.y <= groundY + 1e-9)).toBe(true)
    expect(Math.min(...outline.map((point) => point.y))).toBeLessThan(groundY - 1)
  })

  it('両端は砂の高さに接する（浮かない）', () => {
    const rock = spawnRocks(7, 5, tank)[0]
    const outline = rockOutline(rock, 900)

    expect(outline[0].y).toBeCloseTo(900, 6)
    expect(outline[outline.length - 1].y).toBeCloseTo(900, 6)
  })

  it('同じ岩なら毎回同じ形になる（フレームごとに形が変わらない）', () => {
    const rock = spawnRocks(7, 5, tank)[0]
    expect(rockOutline(rock, 900)).toEqual(rockOutline(rock, 900))
  })
})

describe('spawnSeaweed', () => {
  it('同じ種なら必ず同じ結果になる', () => {
    expect(spawnSeaweed(11, 8, tank)).toEqual(spawnSeaweed(11, 8, tank))
  })

  it('絵の泳ぐ範囲を埋めるほど高くならない', () => {
    for (const weed of spawnSeaweed(11, 8, tank)) {
      expect(weed.height).toBeLessThan(tank.height * 0.45)
    }
  })
})

describe('seaweedShape', () => {
  const groundY = 900

  it('根元は動かない', () => {
    const weed = spawnSeaweed(11, 8, tank)[0]

    const atStart = seaweedShape(weed, 0, groundY)[0]
    const later = seaweedShape(weed, 37.5, groundY)[0]

    expect(later.x).toBeCloseTo(atStart.x, 9)
    expect(later.y).toBeCloseTo(groundY, 9)
  })

  it('先端ほど大きく揺れる', () => {
    const weed = spawnSeaweed(11, 8, tank)[0]
    const swayAt = (t: number): number => {
      let widest = 0
      for (let step = 0; step < 400; step++) {
        const nodes = seaweedShape(weed, step * 0.05, groundY)
        const node = nodes[Math.round(t * weed.segments)]
        widest = Math.max(widest, Math.abs(node.x - weed.baseX))
      }
      return widest
    }

    expect(swayAt(1)).toBeGreaterThan(swayAt(0.5))
    expect(swayAt(0.5)).toBeGreaterThan(swayAt(0.1))
  })

  it('揺れ幅の上限を超えない', () => {
    const weed = spawnSeaweed(11, 8, tank)[0]

    for (let step = 0; step < 600; step++) {
      for (const node of seaweedShape(weed, step * 0.05, groundY)) {
        expect(Math.abs(node.x - weed.baseX)).toBeLessThanOrEqual(weed.swayAmplitude + 1e-9)
      }
    }
  })

  it('先端へ向かって細くなる', () => {
    const weed = spawnSeaweed(11, 8, tank)[0]
    const nodes = seaweedShape(weed, 3, groundY)

    for (let index = 1; index < nodes.length; index++) {
      expect(nodes[index].halfWidth).toBeLessThan(nodes[index - 1].halfWidth)
    }
    expect(nodes[nodes.length - 1].halfWidth).toBeGreaterThan(0)
  })

  it('根元から先端まで高さが上がっていく', () => {
    const weed = spawnSeaweed(11, 8, tank)[0]
    const nodes = seaweedShape(weed, 3, groundY)

    for (let index = 1; index < nodes.length; index++) {
      expect(nodes[index].y).toBeLessThan(nodes[index - 1].y)
    }
  })
})

describe('海藻の束', () => {
  it('1 株につき複数の葉が近い位置に生える（竹串1本にしない）', () => {
    const weeds = spawnSeaweed(11, 4, tank)

    expect(weeds.length).toBeGreaterThanOrEqual(12)

    // 各葉について、ごく近くに別の葉がある
    for (const weed of weeds) {
      const neighbours = weeds.filter(
        (other) => other !== weed && Math.abs(other.baseX - weed.baseX) < tank.width * 0.02,
      )
      expect(neighbours.length).toBeGreaterThan(0)
    }
  })

  it('同じ株の葉は高さが揃いすぎない', () => {
    const heights = spawnSeaweed(11, 1, tank).map((weed) => weed.height)
    expect(new Set(heights).size).toBe(heights.length)
  })
})

describe('岩の輪郭のなめらかさ', () => {
  it('隣り合う点が跳ねない（ノコギリにならない）', () => {
    for (const rock of spawnRocks(7, 6, tank)) {
      const outline = rockOutline(rock, 900)
      for (let index = 1; index < outline.length; index++) {
        const step = Math.hypot(
          outline[index].x - outline[index - 1].x,
          outline[index].y - outline[index - 1].y,
        )
        expect(step).toBeLessThan(rock.halfWidth * 0.5)
      }
    }
  })
})
