import { expect, it } from 'vitest'
import { frameTiming, exitExpired } from '../frameTiming'
import { appearProgress, appearScale } from '../appear'

it('移動は最大50msずつに抑え、演出用の時刻は実時間のまま進める', () => {
  expect(frameTiming(1000, 1016)).toEqual({ deltaSeconds: 0.016, wallSeconds: 1.016 })
  expect(frameTiming(1000, 22000)).toEqual({ deltaSeconds: 0.05, wallSeconds: 22 })
  expect(frameTiming(1000, 999).deltaSeconds).toBe(0)
})

it('低FPSや復帰直後でも、登場から1.4秒経てば標準サイズになる', () => {
  for (const frames of [1, 2, 6, 30, 84]) {
    const bornAt = 1000
    let previous = bornAt
    for (let frame = 1; frame <= frames; frame++) {
      const now = bornAt + 1500 * frame / frames
      const clock = frameTiming(previous, now)
      previous = now
      if (frame === frames) expect(appearScale(appearProgress(clock.wallSeconds - bornAt / 1000))).toBe(1)
    }
  }
})

it('1フレームしか進まなくても、退出開始から20秒で保険の締切になる', () => {
  const clock = frameTiming(1000, 22000)
  expect(clock.deltaSeconds).toBe(0.05)
  expect(exitExpired(clock.wallSeconds - 1)).toBe(true)
  expect(exitExpired(19.999)).toBe(false)
  expect(exitExpired(20)).toBe(true)
})
