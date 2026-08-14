import { describe, expect, it } from 'vitest'
import { makeLanes, separateWalkers, spawnWalker, stepWalker, walkerY, type Walker } from '../walk'
import type { Tank } from '../swim'

const tank: Tank = { width: 1920, height: 1080 }
const lanes = makeLanes(tank, 8)

describe('makeLanes', () => {
  it('奥から手前へ、地面が下がっていく', () => {
    for (let index = 1; index < lanes.length; index++) {
      expect(lanes[index].groundY).toBeGreaterThan(lanes[index - 1].groundY)
    }
  })

  it('奥ほど小さく描く', () => {
    for (let index = 1; index < lanes.length; index++) {
      expect(lanes[index].scale).toBeGreaterThan(lanes[index - 1].scale)
    }
  })

  it('地面が画面の中に収まる', () => {
    for (const lane of lanes) {
      expect(lane.groundY).toBeGreaterThan(0)
      expect(lane.groundY).toBeLessThanOrEqual(tank.height)
    }
  })

  it('1本でも0本でも落ちない', () => {
    expect(makeLanes(tank, 1)).toHaveLength(1)
    expect(makeLanes(tank, 0)).toEqual([])
  })
})

describe('spawnWalker', () => {
  it('同じ種なら必ず同じ結果になる', () => {
    expect(spawnWalker(5, tank, lanes, 800, 600)).toEqual(spawnWalker(5, tank, lanes, 800, 600))
  })

  it('列に散らばる（全部が同じ列に並ばない）', () => {
    const used = new Set(
      Array.from({ length: 60 }, (_, seed) => spawnWalker(seed, tank, lanes, 800, 600).lane),
    )
    expect(used.size).toBeGreaterThan(2)
  })

  it('奥の列ほど小さく、ゆっくり歩く', () => {
    const byLane = new Map<number, Walker>()
    for (let seed = 0; seed < 400 && byLane.size < lanes.length; seed++) {
      const walker = spawnWalker(seed, tank, lanes, 800, 600)
      if (!byLane.has(walker.lane)) byLane.set(walker.lane, walker)
    }

    const back = byLane.get(0)
    const front = byLane.get(lanes.length - 1)
    expect(back).toBeDefined()
    expect(front).toBeDefined()
    expect(back!.width).toBeLessThan(front!.width)
    expect(Math.abs(back!.vx)).toBeLessThan(Math.abs(front!.vx) * 1.6)
  })

  it('生まれた時点で画面の中にいる', () => {
    for (let seed = 0; seed < 200; seed++) {
      const walker = spawnWalker(seed, tank, lanes, 800, 600)
      expect(walker.x - walker.width / 2).toBeGreaterThanOrEqual(-0.001)
      expect(walker.x + walker.width / 2).toBeLessThanOrEqual(tank.width + 0.001)
    }
  })

  it('列が無くても落ちない', () => {
    expect(() => spawnWalker(1, tank, [], 800, 600)).not.toThrow()
  })
})

describe('stepWalker / walkerY', () => {
  it('横に歩く', () => {
    const walker = spawnWalker(3, tank, lanes, 800, 600)
    expect(stepWalker(walker, 1, tank).x).not.toBe(walker.x)
  })

  it('壁で引き返し、画面の外に出ない', () => {
    let walker = spawnWalker(3, tank, lanes, 800, 600)
    for (let frame = 0; frame < 20000; frame++) {
      walker = stepWalker(walker, 1 / 60, tank)
      expect(walker.x - walker.width / 2).toBeGreaterThanOrEqual(-0.001)
      expect(walker.x + walker.width / 2).toBeLessThanOrEqual(tank.width + 0.001)
    }
  })

  it('足が地面から離れない（少し弾むだけ）', () => {
    let walker = spawnWalker(3, tank, lanes, 800, 600)
    // 列の中の前後のずれ（groundOffset）を含めた、その絵の地面
    const groundY = lanes[walker.lane].groundY + walker.groundOffset

    for (let frame = 0; frame < 600; frame++) {
      walker = stepWalker(walker, 1 / 60, tank)
      const feet = walkerY(walker, lanes) + walker.height / 2
      expect(feet).toBeLessThanOrEqual(groundY + 1e-9)
      expect(groundY - feet).toBeLessThanOrEqual(walker.bounce + 1e-9)
    }
  })

  it('弾む高さは絵の大きさに対してごく小さい（跳ねているように見せない）', () => {
    const walker = spawnWalker(3, tank, lanes, 800, 600)
    expect(walker.bounce).toBeLessThan(walker.height * 0.1)
  })

  it('dt が負でも巻き戻らない', () => {
    const walker = spawnWalker(3, tank, lanes, 800, 600)
    expect(stepWalker(walker, -1, tank).x).toBe(walker.x)
  })
})

describe('separateWalkers', () => {
  const base = spawnWalker(3, tank, lanes, 800, 600)

  it('同じ向きに並走している2匹は、後ろが引き返す', () => {
    const pair: Walker[] = [
      { ...base, x: 900, vx: 40, lane: 2 },
      { ...base, x: 910, vx: 40, lane: 2 },
    ]
    const after = separateWalkers(pair)

    // 右へ進んでいるので、左にいる 900 のほうが後ろ
    expect(after[0].vx).toBeLessThan(0)
    expect(after[1].vx).toBe(40)
  })

  it('向かい合う2匹はそのまま通す（禁止すると渋滞する。R-007）', () => {
    const pair: Walker[] = [
      { ...base, x: 900, vx: 40, lane: 2 },
      { ...base, x: 910, vx: -40, lane: 2 },
    ]
    expect(separateWalkers(pair)).toEqual(pair)
  })

  it('列が違えば干渉しない（奥と手前は重なってよい）', () => {
    const pair: Walker[] = [
      { ...base, x: 900, vx: 40, lane: 1 },
      { ...base, x: 905, vx: 40, lane: 4 },
    ]
    expect(separateWalkers(pair)).toEqual(pair)
  })

  it('離れていれば何もしない', () => {
    const pair: Walker[] = [
      { ...base, x: 100, vx: 40, lane: 2 },
      { ...base, x: 1800, vx: -40, lane: 2 },
    ]
    expect(separateWalkers(pair)).toEqual(pair)
  })

  it('速さは変えない（向きだけ）', () => {
    const pair: Walker[] = [
      { ...base, x: 900, vx: 55, lane: 2 },
      { ...base, x: 905, vx: 30, lane: 2 },
    ]
    const after = separateWalkers(pair)
    expect(Math.abs(after[0].vx)).toBe(55)
    expect(Math.abs(after[1].vx)).toBe(30)
  })

  it('完全に同じ位置でも、決まったほうが引き返す', () => {
    const pair: Walker[] = [
      { ...base, x: 900, vx: 40, lane: 2 },
      { ...base, x: 900, vx: 40, lane: 2 },
    ]
    const after = separateWalkers(pair)
    expect(after[0].vx).toBeLessThan(0)
    expect(after[1].vx).toBe(40)
  })

  /**
   * 測るのは「重なっている数」ではなく「**同じ向きに重なったまま並走している**数」。
   * すれ違いざまの重なりは地上でも自然で、避けるべきものではない（R-007）。
   */
  it('重なったまま並走し続ける時間が、はっきり短くなる', () => {
    const key = (a: number, b: number): string => `${a}-${b}`
    const longestStuck = (avoid: boolean): number => {
      let walkers = Array.from({ length: 50 }, (_, seed) => spawnWalker(seed, tank, lanes, 800, 500))
      const running = new Map<string, number>()
      let worst = 0

      for (let frame = 0; frame < 1800; frame++) {
        if (avoid) walkers = separateWalkers(walkers)
        walkers = walkers.map((walker) => stepWalker(walker, 1 / 60, tank))

        const stuck = new Set<string>()
        for (let a = 0; a < walkers.length; a++) {
          for (let b = a + 1; b < walkers.length; b++) {
            if (walkers[a].lane !== walkers[b].lane) continue
            if (Math.sign(walkers[a].vx) !== Math.sign(walkers[b].vx)) continue
            const limit = ((walkers[a].width + walkers[b].width) / 2) * 0.5
            if (Math.abs(walkers[a].x - walkers[b].x) < limit) stuck.add(key(a, b))
          }
        }

        for (const pair of stuck) {
          const frames = (running.get(pair) ?? 0) + 1
          running.set(pair, frames)
          worst = Math.max(worst, frames)
        }
        for (const pair of [...running.keys()]) {
          if (!stuck.has(pair)) running.delete(pair)
        }
      }

      return worst / 60
    }

    const without = longestStuck(false)
    const withAvoidance = longestStuck(true)

    // 実測（50匹・8列・30秒）: 避けないと **30.00 秒＝最初から最後までずっと**
    // 重なったまま並んで歩く組が出る。避けると最長 2.68 秒まで縮む。
    // 数秒のすれ違いは地上でも自然なので、そこまで消そうとはしない。
    expect(without).toBeGreaterThan(10)
    expect(withAvoidance).toBeLessThan(without * 0.2)
    expect(withAvoidance).toBeLessThan(4)
  })

  it('1匹でも0匹でも落ちない', () => {
    expect(separateWalkers([])).toEqual([])
    expect(separateWalkers([base])).toEqual([base])
  })
})

describe('折り返す位置', () => {
  it('1匹ずつ違う場所で折り返す（端に固まらない）', () => {
    const margins = new Set(
      Array.from({ length: 40 }, (_, seed) => spawnWalker(seed, tank, lanes, 800, 600).turnMargin),
    )
    expect(margins.size).toBeGreaterThan(30)
  })

  it('折り返す位置は画面の中', () => {
    for (let seed = 0; seed < 100; seed++) {
      const walker = spawnWalker(seed, tank, lanes, 800, 600)
      expect(walker.turnMargin).toBeGreaterThanOrEqual(0)
      expect(walker.turnMargin).toBeLessThan(tank.width * 0.2)
    }
  })
})
