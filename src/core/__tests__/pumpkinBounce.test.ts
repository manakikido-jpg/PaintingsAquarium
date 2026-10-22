import { describe, expect, it } from 'vitest'
import { spawnCreature } from '../motion'
import { spawnWalker, walkerY } from '../walk'
import { creatureSize, halloweenSizeRatio } from '../size'
import { walkSpeedRange } from '../behaviour'

const tank = { width: 1920, height: 1080 }
const lanes = [{ groundY: 1000, scale: 1, depth: 1 }]

describe('かぼちゃは跳ねる高さだけ1.5倍', () => {
  it('同じseedで、大きさ・位置・速度・テンポを変えず跳ねる高さを増す', () => {
    for (let seed = 0; seed < 20; seed++) {
      const before = spawnWalker(seed, tank, lanes, 600, 500, {
        targetSize: creatureSize(tank, halloweenSizeRatio('kabocha'), 1),
        ...walkSpeedRange(tank.width, 'kabocha')!,
      })
      const creature = spawnCreature('float', seed, tank, 600, 500, lanes, 1, 'unknown', 'kabocha')
      if (creature.kind !== 'walk') throw new Error('かぼちゃが地面にいない')
      const after = creature.walker
      expect(after).toEqual({ ...before, bounce: before.bounce * 1.5 })
      const ground = lanes[0].groundY + before.groundOffset
      for (const phase of [0, Math.PI / 4, Math.PI / 2, Math.PI]) {
        const beforeFeet = walkerY({ ...before, stepPhase: phase }, lanes) + before.height / 2
        const afterFeet = walkerY({ ...after, stepPhase: phase }, lanes) + after.height / 2
        expect(ground - afterFeet).toBeCloseTo((ground - beforeFeet) * 1.5)
        expect(afterFeet).toBeLessThanOrEqual(ground + 1e-8)
      }
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
