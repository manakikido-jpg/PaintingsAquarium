import { describe, expect, it } from 'vitest'
import {
  APPEAR_DURATION_SECONDS,
  appearAlpha,
  appearProgress,
  appearScale,
  isNewlyArrived,
} from '../appear'

describe('appearProgress', () => {
  it('現れ始めは 0、現れきったら 1', () => {
    expect(appearProgress(0)).toBe(0)
    expect(appearProgress(APPEAR_DURATION_SECONDS)).toBe(1)
  })

  it('時間が経つほど必ず進む（戻らない）', () => {
    let previous = -1
    for (let step = 0; step <= 60; step++) {
      const progress = appearProgress((step / 60) * APPEAR_DURATION_SECONDS)
      expect(progress).toBeGreaterThanOrEqual(previous)
      previous = progress
    }
  })

  it('待ち続けても 1 を超えない', () => {
    expect(appearProgress(9999)).toBe(1)
  })

  it('時刻が巻き戻っても 0 未満にならない', () => {
    expect(appearProgress(-5)).toBe(0)
  })

  it('終わりに近づくほど変化が緩やかになる', () => {
    const early = appearProgress(0.2) - appearProgress(0.1)
    const late = appearProgress(1.3) - appearProgress(1.2)
    expect(late).toBeLessThan(early)
  })

  it('長さ 0 を渡したら即座に現れきる（0除算しない）', () => {
    expect(appearProgress(0, 0)).toBe(1)
  })
})

describe('appearAlpha / appearScale', () => {
  it('現れ始めは薄く小さい', () => {
    expect(appearAlpha(0)).toBe(0)
    expect(appearScale(0)).toBeLessThan(1)
  })

  it('現れきったら、ちょうど等倍・不透明になる', () => {
    expect(appearAlpha(1)).toBe(1)
    expect(appearScale(1)).toBe(1)
  })

  it('弾まない（1 倍を超えない）', () => {
    for (let step = 0; step <= 100; step++) {
      expect(appearScale(step / 100)).toBeLessThanOrEqual(1)
    }
  })
})

describe('isNewlyArrived', () => {
  const startedAt = Date.parse('2026-08-12T10:00:00.000Z')

  it('起動後に取り込まれた絵は演出する', () => {
    expect(isNewlyArrived('2026-08-12T10:00:05.000Z', startedAt)).toBe(true)
  })

  it('起動前からある絵は演出しない（起動のたびに全部光らせない）', () => {
    expect(isNewlyArrived('2026-08-11T09:00:00.000Z', startedAt)).toBe(false)
  })

  it('日時が壊れていても落ちず、演出しない扱いにする', () => {
    expect(isNewlyArrived('こわれた日付', startedAt)).toBe(false)
  })
})
