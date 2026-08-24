import { describe, expect, it } from 'vitest'
import { placeCreature, spawnCreature, stepCreatures } from '../motion'
import type { Tank } from '../swim'
import { CROSS_SECONDS } from '../behaviour'
import type { CreatureKind } from '../rig'
import type { SpeciesId } from '../templates'

/**
 * 泳ぐ速さを数字で固定する。
 *
 * 会場からの指摘「カメとタコの速度がおかしい」で分かったこと。
 * 縦の波を「時間の周期」で決めていたため、**縦の速さが横の速さと無関係**になり、
 * タコは縦が横の5倍・ウミガメは3.6倍で飛び跳ねていた。
 * 見た目の話に見えて、実際は数字で捕まえられる。だからここで固定する。
 */

const tank: Tank = { width: 1600, height: 900 }
// ここで測るのは水族館の6種だけ（恐竜は歩くので速さの決め方が別）
const KIND: Partial<Record<SpeciesId, CreatureKind>> = {
  fish: 'fish',
  iruka: 'fish',
  same: 'fish',
  tako: 'tentacled',
  kurage: 'tentacled',
  umigame: 'tentacled',
}

interface Measured {
  readonly across: number
  readonly down: number
  readonly crossSeconds: number
  readonly swing: number
  readonly fastest: number
  readonly slowest: number
}

function measure(species: SpeciesId, seconds = 30, seed = 11): Measured {
  let creature = spawnCreature('float', seed, tank, 500, 300, [], 1, KIND[species], species)
  const dt = 1 / 60
  let across = 0
  let down = 0
  let count = 0
  let minY = Infinity
  let maxY = -Infinity
  let fastest = 0
  let slowest = Infinity
  for (let step = 0; step < Math.round(seconds / dt); step++) {
    creature = stepCreatures([creature], dt, tank)[0]
    if (creature.kind !== 'float') continue
    const { vx, vy } = creature.fish
    across += Math.abs(vx)
    down += Math.abs(vy)
    count++
    const speed = Math.hypot(vx, vy)
    fastest = Math.max(fastest, speed)
    slowest = Math.min(slowest, speed)
    const place = placeCreature(creature, [])
    minY = Math.min(minY, place.y)
    maxY = Math.max(maxY, place.y)
  }
  const mean = across / count
  return {
    across: mean,
    down: down / count,
    crossSeconds: tank.width / Math.max(1, mean),
    swing: maxY - minY,
    fastest,
    slowest,
  }
}

describe('横切るのにかかる時間', () => {
  it.each(Object.keys(CROSS_SECONDS) as SpeciesId[])('%s は決めた範囲に収まる', (species) => {
    const [fast, slow] = CROSS_SECONDS[species]
    const { crossSeconds } = measure(species)
    // 縦にも動くぶん、横だけの速さは少し遅くなる。2割の余裕を見る
    expect(crossSeconds).toBeGreaterThan(fast * 0.8)
    expect(crossSeconds).toBeLessThan(slow * 1.6)
  })
})

describe('縦と横のつり合い', () => {
  it('タコとウミガメは、縦が横を上回らない（跳ねているように見えてしまう）', () => {
    for (const species of ['tako', 'umigame'] as const) {
      const { across, down } = measure(species)
      expect(down).toBeLessThan(across)
    }
  })

  /*
   * 上下の動きは**2つある**ので、短い窓と長い窓で別々に見る。
   *   - S字の波（速い）… 数秒で1往復。ここが大きいと飛び跳ねて見える（R-035）
   *   - ゆっくりした上下（遅い）… 150秒で1往復。これが無いと、
   *     生まれた高さの帯から出られず、下で生まれた絵が飾りに埋もれる
   */
  it('S字の波（短い間の上下）は、画面の高さの10〜25%に収まる', () => {
    for (const species of ['tako', 'umigame'] as const) {
      const { swing } = measure(species, 8)
      expect(swing).toBeGreaterThan(tank.height * 0.1)
      expect(swing).toBeLessThan(tank.height * 0.25)
    }
  })

  it('長い目で見ると、画面の高さの半分より広く上下する（同じ帯に居続けない）', () => {
    for (const species of ['tako', 'umigame'] as const) {
      const { swing } = measure(species, 300)
      expect(swing).toBeGreaterThan(tank.height * 0.5)
    }
  })

  it('クラゲは、少しだけ横に流れながら、ゆっくり上下する', () => {
    const { across, down } = measure('kurage')
    // 「もう少しだけ横移動を」との指摘で速くした（画面横断 150〜250秒 → 80〜140秒）
    expect(across).toBeGreaterThan(8)
    expect(across).toBeLessThan(25)
    expect(down).toBeLessThan(30)
  })
})

describe('サメの緩急', () => {
  it('速いときと遅いときで、2倍以上の差がつく', () => {
    // 追う相手がいる状態で測る
    let shark = spawnCreature('float', 3, tank, 500, 300, [], 1, 'fish', 'same')
    let prey = spawnCreature('float', 9, tank, 500, 300, [], 1, 'fish', 'fish')
    const dt = 1 / 60
    let fastest = 0
    let slowest = Infinity
    for (let step = 0; step < 60 * 30; step++) {
      const next = stepCreatures([shark, prey], dt, tank)
      shark = next[0]
      prey = next[1]
      if (shark.kind !== 'float') continue
      const speed = Math.hypot(shark.fish.vx, shark.fish.vy)
      fastest = Math.max(fastest, speed)
      slowest = Math.min(slowest, speed)
    }
    expect(fastest / Math.max(1, slowest)).toBeGreaterThan(2)
  })
})
