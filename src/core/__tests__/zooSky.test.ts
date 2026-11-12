import { describe, expect, it } from 'vitest'
import { zooBirds, zooClouds } from '../zooSky'

describe('動物園の鳥と雲', () => {
  it('鳥は2〜3羽、空の上だけで羽ばたき、入口の看板や地面へ降りない', () => {
    expect(zooBirds(0)).toHaveLength(3)
    expect(zooBirds(0, 0.4)).toHaveLength(2)
    expect(zooBirds(0, 0)).toHaveLength(0)
    for (let t = 0; t < 3600; t += 2) {
      for (const bird of zooBirds(t)) {
        expect(bird.y + 0.006).toBeLessThan(0.14)
        expect(bird.y).toBeGreaterThan(0.06)
        expect(bird.x).toBeGreaterThanOrEqual(0.33)
        expect(bird.x).toBeLessThanOrEqual(0.81)
        expect(bird.width).toBeLessThanOrEqual(0.015)
        expect(Math.abs(bird.wing)).toBeLessThanOrEqual(1)
      }
    }
    expect(zooBirds(0)[0].wing).not.toBe(zooBirds(0.2)[0].wing)
    expect(zooBirds(0)[0].x).not.toBe(zooBirds(3)[0].x)
  })

  it('薄い雲3枚がゆっくり動き、低い雲は入口の左だけを使う', () => {
    expect(zooClouds(0)).toHaveLength(3)
    for (let t = 0; t < 3600; t += 5) {
      for (const cloud of zooClouds(t)) {
        expect(cloud.alpha).toBeGreaterThanOrEqual(0)
        expect(cloud.alpha).toBeLessThanOrEqual(0.58)
        if (cloud.y > 0.14) expect(cloud.x + cloud.width / 2).toBeLessThan(0.56)
        else expect(cloud.y + 0.065 / 2).toBeLessThan(0.14)
      }
    }
    for (let i = 0; i < 3; i++) {
      const before = zooClouds(0)[i]
      const after = zooClouds(10)[i]
      expect(after.x).toBeGreaterThan(before.x)
      expect(after.x - before.x).toBeLessThan(0.025)
    }
  })

  it('ループで位置が戻る瞬間は鳥も雲も透明で、瞬間移動が見えない', () => {
    for (const sprites of [zooBirds, zooClouds]) {
      for (let t = 0; t < 700; t += 0.1) {
        const before = sprites(t)
        const after = sprites(t + 0.1)
        for (let i = 0; i < before.length; i++) {
          if (Math.abs(after[i].x - before[i].x) < 0.1) continue
          expect(before[i].alpha).toBeLessThan(0.01)
          expect(after[i].alpha).toBeLessThan(0.01)
        }
      }
    }
  })
})
