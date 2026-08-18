import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SIZE_SCALE,
  FISH_SIZE_RATIO,
  MAX_SIZE_SCALE,
  MIN_SIZE_SCALE,
  WALKER_SIZE_RATIO,
  creatureSize,
} from '../size'
import type { Tank } from '../swim'

const WIDE: Tank = { width: 1920, height: 1080 }
const SMALL: Tank = { width: 800, height: 600 }

describe('creatureSize', () => {
  it('倍率 1 では画面幅の 7%（R-015 の値）', () => {
    expect(creatureSize(WIDE, FISH_SIZE_RATIO, 1)).toBeCloseTo(1920 * 0.07)
  })

  it('倍率にそのまま比例する', () => {
    const base = creatureSize(WIDE, FISH_SIZE_RATIO, 1)
    expect(creatureSize(WIDE, FISH_SIZE_RATIO, 2)).toBeCloseTo(base * 2)
    expect(creatureSize(WIDE, FISH_SIZE_RATIO, 0.5)).toBeCloseTo(base / 2)
  })

  it('画面が広いほど大きくなる。ピクセル固定にしない（R-015）', () => {
    expect(creatureSize(WIDE, FISH_SIZE_RATIO, 1)).toBeGreaterThan(
      creatureSize(SMALL, FISH_SIZE_RATIO, 1),
    )
  })

  it('範囲の外を渡しても、範囲の中に収める', () => {
    expect(creatureSize(WIDE, FISH_SIZE_RATIO, 99)).toBe(
      creatureSize(WIDE, FISH_SIZE_RATIO, MAX_SIZE_SCALE),
    )
    expect(creatureSize(WIDE, FISH_SIZE_RATIO, 0)).toBe(
      creatureSize(WIDE, FISH_SIZE_RATIO, MIN_SIZE_SCALE),
    )
  })

  it('どんな倍率でも画面の短いほうの4割を超えない。泳ぐ余地が無くなるため', () => {
    for (const tank of [WIDE, SMALL, { width: 600, height: 1200 }]) {
      for (let scale = MIN_SIZE_SCALE; scale <= MAX_SIZE_SCALE; scale += 0.1) {
        const size = creatureSize(tank, WALKER_SIZE_RATIO, scale)
        expect(size).toBeLessThanOrEqual(Math.min(tank.width, tank.height) * 0.4 + 1e-9)
      }
    }
  })

  it('縦長の画面でも絵が画面より大きくならない', () => {
    const tall: Tank = { width: 2000, height: 400 }
    expect(creatureSize(tall, FISH_SIZE_RATIO, MAX_SIZE_SCALE)).toBeLessThan(tall.height)
  })

  it('歩く絵は泳ぐ絵より大きい。地面に立つので小さいと寂しく見える', () => {
    expect(WALKER_SIZE_RATIO).toBeGreaterThan(FISH_SIZE_RATIO)
  })

  it('既定は 1 倍。設定を触っていない会場で見え方が変わらない', () => {
    expect(DEFAULT_SIZE_SCALE).toBe(1)
  })
})
