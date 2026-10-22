import { describe, expect, it } from 'vitest'
import { spawnCreature } from '../motion'
import { spawnWalker, stepWalker, walkerY } from '../walk'
import { creatureSize, halloweenSizeRatio } from '../size'
import { walkSpeedRange } from '../behaviour'

const tank = { width: 1920, height: 1080 }
const lanes = [{ groundY: 1000, scale: 1, depth: 1 }]

describe('かぼちゃは高さの半分までジャンプして着地する', () => {
  it('大きさ・出現位置・基礎速度を保ち、ゆっくり離陸・着地する', () => {
    for (let seed = 0; seed < 20; seed++) {
      const before = spawnWalker(seed, tank, lanes, 600, 500, {
        targetSize: creatureSize(tank, halloweenSizeRatio('kabocha'), 1),
        ...walkSpeedRange(tank.width, 'kabocha')!,
      })
      const creature = spawnCreature('float', seed, tank, 600, 500, lanes, 1, 'unknown', 'kabocha')
      if (creature.kind !== 'walk') throw new Error('かぼちゃが地面にいない')
      const after = creature.walker
      expect(after).toEqual({ ...before, jump: true, bounce: before.height * 0.5, stepSpeed: Math.PI / 2.4 })
      const ground = lanes[0].groundY + before.groundOffset
      for (const fraction of [0, 0.325, 0.65, 0.8, 1]) {
        const feet = walkerY({ ...after, stepPhase: fraction * Math.PI }, lanes) + after.height / 2
        expect(feet).toBeLessThanOrEqual(ground + 1e-8)
        if (fraction === 0.325) expect(ground - feet).toBeCloseTo(after.height * 0.5)
        else expect(feet).toBeCloseTo(ground)
      }
    }
  })

  it('左右どちらでも斜め上へ進み、1回で体幅の8割ほど横へ飛ぶ', () => {
    const spawned = spawnCreature('float', 7, tank, 600, 500, lanes, 1, 'unknown', 'kabocha')
    if (spawned.kind !== 'walk') throw new Error('ジャンプの基点がない')
    for (const direction of [-1, 1]) {
      const start = { ...spawned.walker, x: 900, vx: direction * 12, stepPhase: 0, turnMargin: 0 }
      const apex = stepWalker(start, 2.4 * 0.325, tank)
      expect((apex.x - start.x) * direction).toBeGreaterThan(start.width * 0.4)
      expect(walkerY(start, lanes) - walkerY(apex, lanes)).toBeCloseTo(start.height * 0.5)
      const landed = stepWalker(start, 2.4 * 0.65, tank)
      expect((landed.x - start.x - start.vx * 2.4 * 0.65) * direction).toBeCloseTo(start.width * 0.8)
      expect(walkerY(landed, lanes)).toBeCloseTo(walkerY(start, lanes))
      const resting = stepWalker(landed, 2.4 * 0.35, tank)
      expect(resting.x - landed.x).toBeCloseTo(landed.vx * 2.4 * 0.35)
      expect(walkerY(resting, lanes)).toBeCloseTo(walkerY(start, lanes))
      let fine = start
      for (let n = 0; n < 144; n++) fine = stepWalker(fine, 1 / 60, tank)
      expect(fine.x).toBeCloseTo(stepWalker(start, 2.4, tank).x)
    }
  })

  it('フランケンの歩行の弾みは増やさない', () => {
    const before = spawnWalker(7, tank, lanes, 800, 600, {
      targetSize: creatureSize(tank, halloweenSizeRatio('franken'), 1),
    })
    const creature = spawnCreature('float', 7, tank, 800, 600, lanes, 1, 'unknown', 'franken')
    expect(creature.kind).toBe('walk')
    if (creature.kind === 'walk') expect(creature.walker).toEqual(before)
  })
})
