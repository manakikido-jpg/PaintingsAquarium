import { describe, expect, it } from 'vitest'
import {
  placeOutside,
  rockOutline,
  sandProfile,
  seaweedShape,
  shellOutline,
  shellRidges,
  shipwreckHull,
  shipwreckMasts,
  shipwreckSpan,
  spawnRocks,
  spawnSeaweed,
  spawnShells,
  spawnShipwreck,
} from '../decor'
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
      const index = Math.round(t * weed.segments)
      const still = weed.baseX + weed.lean * (index / weed.segments) ** 2
      let widest = 0
      for (let step = 0; step < 400; step++) {
        const node = seaweedShape(weed, step * 0.05, groundY)[index]
        widest = Math.max(widest, Math.abs(node.x - still))
      }
      return widest
    }

    expect(swayAt(1)).toBeGreaterThan(swayAt(0.5))
    expect(swayAt(0.5)).toBeGreaterThan(swayAt(0.1))
  })

  it('揺れ幅の上限を超えない（開きのぶんを除いて）', () => {
    const weed = spawnSeaweed(11, 8, tank)[0]

    for (let step = 0; step < 600; step++) {
      const nodes = seaweedShape(weed, step * 0.05, groundY)
      nodes.forEach((node, index) => {
        const t = index / weed.segments
        const still = weed.baseX + weed.lean * t * t
        expect(Math.abs(node.x - still)).toBeLessThanOrEqual(weed.swayAmplitude + 1e-9)
      })
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

describe('spawnShells / shellOutline', () => {
  const groundY = 900

  it('同じ種なら必ず同じ結果になる', () => {
    expect(spawnShells(3, 5, tank)).toEqual(spawnShells(3, 5, tank))
  })

  it('蝶番が砂に接し、扇は砂より上に開く', () => {
    for (const shell of spawnShells(3, 5, tank)) {
      const outline = shellOutline(shell, groundY)
      expect(outline[0]).toEqual({ x: shell.x, y: groundY })
      expect(Math.min(...outline.map((point) => point.y))).toBeLessThan(groundY - 1)
    }
  })

  // 割合の上限を直に書くと、見た目を調整するたびに数字だけ書き換わって
  // テストの意味が消える。「岩より小さい」という意図そのものを固定する。
  it('どの貝殻も、一番小さい岩より小さい', () => {
    const smallestRock = Math.min(...spawnRocks(7, 6, tank).map((rock) => rock.halfWidth))

    for (const shell of spawnShells(3, 5, tank)) {
      expect(shell.halfWidth).toBeLessThan(smallestRock)
    }
  })

  it('扇の筋は蝶番から出て、輪郭の内側で終わる', () => {
    const shell = spawnShells(3, 5, tank)[0]
    const reach = Math.max(shell.halfWidth, shell.height)

    for (const ridge of shellRidges(shell, groundY)) {
      expect(ridge.from).toEqual({ x: shell.x, y: groundY })
      expect(Math.hypot(ridge.to.x - shell.x, ridge.to.y - groundY)).toBeLessThan(reach * 1.05)
    }
  })

  it('0 個でも落ちない', () => {
    expect(spawnShells(3, 0, tank)).toEqual([])
  })
})

describe('沈没船', () => {
  const groundY = 900

  it('船体は砂に少し埋まる（置物のように浮かない）', () => {
    const wreck = spawnShipwreck(tank)
    const hull = shipwreckHull(wreck, groundY)

    expect(Math.max(...hull.map((point) => point.y))).toBeGreaterThan(groundY)
    expect(Math.min(...hull.map((point) => point.y))).toBeLessThan(groundY)
  })

  it('傾いている（水平だと沈んだ船に見えない）', () => {
    const wreck = spawnShipwreck(tank)
    const hull = shipwreckHull(wreck, groundY)
    const flat = shipwreckHull({ ...wreck, tilt: 0 }, groundY)

    expect(wreck.tilt).not.toBe(0)
    expect(hull).not.toEqual(flat)
  })

  it('帆柱は甲板から出て、船より上に伸びる', () => {
    const wreck = spawnShipwreck(tank)
    const hull = shipwreckHull(wreck, groundY)
    const deckY = Math.min(...hull.map((point) => point.y))

    for (const mast of shipwreckMasts(wreck, groundY)) {
      expect(mast.width).toBeGreaterThan(0)
      expect(Number.isFinite(mast.from.x)).toBe(true)
    }
    expect(Math.min(...shipwreckMasts(wreck, groundY).map((mast) => mast.to.y))).toBeLessThan(deckY)
  })

  it('絵の泳ぐ範囲を埋めるほど大きくない', () => {
    const wreck = spawnShipwreck(tank)
    expect(wreck.width).toBeLessThan(tank.width * 0.35)
    expect(wreck.height).toBeLessThan(tank.height * 0.2)
  })

  it('同じ水槽なら毎回同じ場所に沈んでいる', () => {
    expect(spawnShipwreck(tank)).toEqual(spawnShipwreck(tank))
  })
})

describe('placeOutside', () => {
  it('避ける範囲を指定しなければ、そのまま', () => {
    expect(placeOutside(0.42)).toBe(0.42)
  })

  it('どの入力も避ける範囲の外に出る', () => {
    const avoid = { from: 0.4, to: 0.7 }
    for (let step = 0; step <= 100; step++) {
      const placed = placeOutside(step / 100, avoid)
      expect(placed >= 0 && placed <= 1).toBe(true)
      expect(placed > avoid.from && placed < avoid.to).toBe(false)
    }
  })

  it('境目に固まらない（残った幅に散らばる）', () => {
    const avoid = { from: 0.4, to: 0.7 }
    const placed = Array.from({ length: 20 }, (_, index) => placeOutside(index / 19, avoid))
    const left = placed.filter((value) => value <= avoid.from)
    const right = placed.filter((value) => value >= avoid.to)

    expect(left.length).toBeGreaterThan(3)
    expect(right.length).toBeGreaterThan(3)
    expect(new Set(placed.map((value) => value.toFixed(4))).size).toBe(placed.length)
  })

  it('順番を入れ替えない', () => {
    const avoid = { from: 0.3, to: 0.5 }
    expect(placeOutside(0.2, avoid)).toBeLessThan(placeOutside(0.8, avoid))
  })
})

describe('沈没船の前を空ける', () => {
  it('海藻も岩も、沈没船の範囲には生えない', () => {
    const wreck = spawnShipwreck(tank)
    const span = shipwreckSpan(wreck, tank)

    for (const weed of spawnSeaweed(5507, 8, tank, span)) {
      const at = weed.baseX / tank.width
      expect(at > span.from && at < span.to).toBe(false)
    }
    for (const rock of spawnRocks(8823, 6, tank, span)) {
      const at = rock.x / tank.width
      expect(at > span.from && at < span.to).toBe(false)
    }
  })

  it('空ける範囲は船体より広い（帆柱の傾きぶん）', () => {
    const wreck = spawnShipwreck(tank)
    const span = shipwreckSpan(wreck, tank)
    expect((span.to - span.from) * tank.width).toBeGreaterThan(wreck.width)
  })
})

describe('葉の開き', () => {
  it('株の中で葉が左右に開く（棘の束にしない）', () => {
    const weeds = spawnSeaweed(11, 1, tank)
    const leans = weeds.map((weed) => weed.lean)

    expect(Math.min(...leans)).toBeLessThan(0)
    expect(Math.max(...leans)).toBeGreaterThan(0)
  })

  it('根元では開かず、先端で開く', () => {
    const weed = spawnSeaweed(11, 1, tank).find((entry) => Math.abs(entry.lean) > 1)!
    const nodes = seaweedShape(weed, 0, 900)

    expect(Math.abs(nodes[0].x - weed.baseX)).toBeLessThan(1)
    expect(Math.abs(nodes[nodes.length - 1].x - weed.baseX)).toBeGreaterThan(1)
  })
})
