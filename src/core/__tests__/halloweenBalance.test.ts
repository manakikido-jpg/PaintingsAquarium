import { describe, expect, it } from 'vitest'
import { needsMotionRebuild, placeCreature, spawnCreature, stepCreatures } from '../motion'
import { makeLanes, HALLOWEEN_LANES, HALLOWEEN_MIN_SCALE, HALLOWEEN_BACK_RATIO } from '../walk'

const tank = { width: 1920, height: 1080 }
const lanes = makeLanes(tank, HALLOWEEN_LANES, {
  backRatio: HALLOWEEN_BACK_RATIO, frontRatio: 0.99, minScale: HALLOWEEN_MIN_SCALE,
})

describe('作り直した種類を、表示中の動きにも反映する', () => {
  it('種類なしで漂っていた絵がフランケンになったら地面へ移す', () => {
    const before = { width: 880, height: 590 }
    const after = { ...before, species: 'franken' as const }
    expect(needsMotionRebuild(before, after)).toBe(true)
    const creature = spawnCreature('float', 7, tank, after.width, after.height,
      lanes, 1, 'unknown', after.species, lanes[0].groundY)
    expect(creature.kind).toBe('walk')
    expect(placeCreature(creature, lanes).y).toBeGreaterThan(tank.height * 0.7)
  })

  it('向きだけを直すときは位置と歩行をリセットしない', () => {
    const image = { species: 'franken' as const, width: 880, height: 590 }
    expect(needsMotionRebuild(image, { ...image })).toBe(false)
    expect(needsMotionRebuild(image, { ...image, height: 650 })).toBe(true)
    expect(needsMotionRebuild(image, { ...image, species: 'yurei' })).toBe(true)
  })
})

describe('地面に空の絵を重ねない', () => {
  it('魔女・こうもり・ゆうれいは60秒後も地面の帯に降りない', () => {
    for (const species of ['majo', 'koumori', 'yurei'] as const) {
      let creatures = Array.from({ length: 5 }, (_, seed) => spawnCreature('float', seed + 1,
        tank, 700, 600, lanes, 1, 'unknown', species, lanes[0].groundY))
      for (let frame = 0; frame < 60 * 30; frame++) {
        creatures = stepCreatures(creatures, 1 / 30, tank, lanes[0].groundY)
        for (const creature of creatures) {
          const place = placeCreature(creature, lanes)
          expect(place.y + place.height / 2, species).toBeLessThanOrEqual(lanes[0].groundY + 1)
        }
      }
    }
  })
})
