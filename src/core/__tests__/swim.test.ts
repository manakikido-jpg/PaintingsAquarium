import { describe, expect, it } from 'vitest'
import {
  facesRight,
  renderY,
  separateFish,
  spawnFish,
  stepFish,
  type Fish,
  type Tank,
  sendFishOut,
  isFishOutside,
} from '../swim'

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
    age: 0,
    wavePhase: 0,
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

describe('separateFish', () => {
  it('重なった2匹が離れていく', () => {
    let fishes = [
      fishAt({ x: 900, y: 540, vx: 60, vy: 0 }),
      fishAt({ x: 910, y: 545, vx: -60, vy: 0 }),
    ]
    const distanceOf = (list: Fish[]): number =>
      Math.hypot(list[0].x - list[1].x, renderY(list[0]) - renderY(list[1]))

    const before = distanceOf(fishes)
    for (let frame = 0; frame < 120; frame++) {
      fishes = separateFish(fishes, 1 / 60).map((fish) => stepFish(fish, 1 / 60, tank))
    }

    expect(distanceOf(fishes)).toBeGreaterThan(before)
  })

  it('完全に同じ位置でも離れる（0除算しない）', () => {
    let fishes = [fishAt({ x: 900, y: 540 }), fishAt({ x: 900, y: 540 })]

    for (let frame = 0; frame < 120; frame++) {
      fishes = separateFish(fishes, 1 / 60).map((fish) => stepFish(fish, 1 / 60, tank))
    }

    for (const fish of fishes) {
      expect(Number.isFinite(fish.x)).toBe(true)
      expect(Number.isFinite(fish.y)).toBe(true)
    }
    expect(Math.hypot(fishes[0].x - fishes[1].x, fishes[0].y - fishes[1].y)).toBeGreaterThan(1)
  })

  it('離れている2匹には何もしない', () => {
    const fishes = [fishAt({ x: 100 }), fishAt({ x: 1800 })]
    expect(separateFish(fishes, 1 / 60)).toEqual(fishes)
  })

  it('速さを変えない（一部だけ加速しない）', () => {
    const fishes = [fishAt({ x: 900, vx: 60, vy: 10 }), fishAt({ x: 915, vx: -40, vy: -5 })]
    const after = separateFish(fishes, 1 / 60)

    for (let index = 0; index < fishes.length; index++) {
      expect(Math.hypot(after[index].vx, after[index].vy)).toBeCloseTo(
        Math.hypot(fishes[index].vx, fishes[index].vy),
        6,
      )
    }
  })

  it('同じ入力なら必ず同じ結果になる', () => {
    const fishes = [fishAt({ x: 900 }), fishAt({ x: 915 })]
    expect(separateFish(fishes, 1 / 60)).toEqual(separateFish(fishes, 1 / 60))
  })

  it('1匹でも0匹でも落ちない', () => {
    expect(separateFish([], 1 / 60)).toEqual([])
    expect(separateFish([fishAt()], 1 / 60)).toHaveLength(1)
  })

  /**
   * 定数を1つ選ぶだけの緩いテストにしないため、**避けない場合と比べる**。
   * 瞬間の最悪値ではなく平均で見るのは、すれ違いざまに一瞬重なるのは
   * 水槽として自然で、避けるべきなのは「重なったまま並走する」ほうだから。
   */
  it('避けない場合より、重なっている時間がはっきり短くなる', () => {
    const deepOverlaps = (list: Fish[]): number => {
      let count = 0
      for (let a = 0; a < list.length; a++) {
        for (let b = a + 1; b < list.length; b++) {
          const limit =
            ((Math.max(list[a].width, list[a].height) + Math.max(list[b].width, list[b].height)) /
              2) *
            0.5
          if (Math.hypot(list[a].x - list[b].x, renderY(list[a]) - renderY(list[b])) < limit) {
            count++
          }
        }
      }
      return count
    }

    const averageOverlap = (avoid: boolean): number => {
      let fishes = Array.from({ length: 50 }, (_, seed) => spawnFish(seed, tank, 800, 500))
      let total = 0
      for (let frame = 0; frame < 1800; frame++) {
        if (avoid) fishes = separateFish(fishes, 1 / 60)
        fishes = fishes.map((fish) => stepFish(fish, 1 / 60, tank))
        total += deepOverlaps(fishes)
      }
      return total / 1800
    }

    const without = averageOverlap(false)
    const withAvoidance = averageOverlap(true)

    expect(withAvoidance).toBeLessThan(without * 0.3)
    expect(withAvoidance).toBeLessThan(3)
  })
})

describe('絵の大きさ', () => {
  /**
   * 画面幅に対する割合で決めていることを固定する（R-015）。
   * 固定ピクセルにすると、狭い画面では埋め尽くし、広い画面では点になる。
   */
  it('画面が広いほど絵も大きくなり、画面に対する割合は変わらない', () => {
    const narrow = spawnFish(1, { width: 1280, height: 720 }, 800, 600)
    const wide = spawnFish(1, { width: 3840, height: 2160 }, 800, 600)

    expect(wide.width).toBeGreaterThan(narrow.width)
    expect(wide.width / 3840).toBeCloseTo(narrow.width / 1280, 6)
  })

  it('50匹並べても画面を埋め尽くさない', () => {
    const tank = { width: 1920, height: 1080 }
    const area = Array.from({ length: 50 }, (_, seed) => spawnFish(seed, tank, 800, 600)).reduce(
      (total, fish) => total + fish.width * fish.height,
      0,
    )

    // 隙間より絵のほうが多くなる境目が「画面の半分」。
    // 実測: 画面幅の 9% だと 54%（埋まる）、7% だと 33%（探せる）。
    expect(area).toBeLessThan(tank.width * tank.height * 0.5)
  })
})

describe('sendFishOut / isFishOutside', () => {
  const tank: Tank = { width: 1000, height: 600 }

  it('近いほうの端へ向かう', () => {
    const left = spawnFish(1, tank, 200, 100)
    expect(sendFishOut({ ...left, x: 100 }, tank).vx).toBeLessThan(0)
    expect(sendFishOut({ ...left, x: 900 }, tank).vx).toBeGreaterThan(0)
  })

  it('去る途中は壁で跳ね返らない。跳ね返ると画面から出られない', () => {
    let fish = sendFishOut({ ...spawnFish(2, tank, 200, 100), x: 60 }, tank)
    for (let step = 0; step < 200; step++) fish = stepFish(fish, 1 / 60, tank)
    expect(isFishOutside(fish, tank)).toBe(true)
  })

  it('どこから出発しても、十分な時間で必ず画面の外へ出る', () => {
    for (let seed = 0; seed < 25; seed++) {
      let fish = sendFishOut(spawnFish(seed, tank, 300, 200), tank)
      for (let step = 0; step < 60 * 20 && !isFishOutside(fish, tank); step++) {
        fish = stepFish(fish, 1 / 60, tank)
      }
      expect(isFishOutside(fish, tank)).toBe(true)
    }
  })

  it('去ると決める前は、これまで通り画面の中に留まる', () => {
    let fish = spawnFish(7, tank, 200, 100)
    for (let step = 0; step < 60 * 30; step++) fish = stepFish(fish, 1 / 60, tank)
    expect(isFishOutside(fish, tank)).toBe(false)
  })

  it('速すぎず遅すぎない速さにする。ゆっくり去られると長く画面に残る', () => {
    const slow = { ...spawnFish(3, tank, 200, 100), vx: 5 }
    expect(Math.abs(sendFishOut(slow, tank).vx)).toBeGreaterThanOrEqual(60)
  })
})
