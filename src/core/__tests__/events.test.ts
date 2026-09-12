import { describe, expect, it } from 'vitest'
import { dateStamp, eventFolderName, safeName } from '../events'

const 九月十二日 = new Date(2026, 8, 12)

describe('safeName', () => {
  it('Windows がフォルダ名に使えない字を - に替える', () => {
    // 落とすと「イオン久御山店2日目」になり、別のものと見分けが付かなくなる
    expect(safeName('イオン久御山店/2日目')).toBe('イオン久御山店-2日目')
    expect(safeName('イオン:大日*店?')).toBe('イオン-大日-店-')
  })

  it('末尾の点と空白を落とす（Windows が黙って落とすので先に落とす）', () => {
    expect(safeName('イオン大日店. ')).toBe('イオン大日店')
  })

  it('長すぎる名前は切り詰める', () => {
    expect(safeName('あ'.repeat(100))).toHaveLength(40)
  })

  it('記号だけの名前は空になる', () => {
    expect(safeName('///')).toBe('---')
    expect(safeName('   ')).toBe('')
  })
})

describe('eventFolderName', () => {
  const 何も無い = (): boolean => false

  it('日付から始める（並べれば時系列になる）', () => {
    expect(eventFolderName('イオン久御山店', 九月十二日, 何も無い)).toBe('2026-09-12 イオン久御山店')
  })

  it('名前を入れなくても成立する', () => {
    expect(eventFolderName('', 九月十二日, 何も無い)).toBe('2026-09-12')
    expect(eventFolderName('   ', 九月十二日, 何も無い)).toBe('2026-09-12')
  })

  it('同じ日に2回終えても上書きしない', () => {
    const ある = new Set(['2026-09-12 イオン久御山店'])
    expect(eventFolderName('イオン久御山店', 九月十二日, (f) => ある.has(f))).toBe(
      '2026-09-12 イオン久御山店-2',
    )
    ある.add('2026-09-12 イオン久御山店-2')
    expect(eventFolderName('イオン久御山店', 九月十二日, (f) => ある.has(f))).toBe(
      '2026-09-12 イオン久御山店-3',
    )
  })

  it('Windows の予約語を入れられても、日付が前に付くので当たらない', () => {
    expect(eventFolderName('CON', 九月十二日, 何も無い)).toBe('2026-09-12 CON')
  })
})

describe('dateStamp', () => {
  it('1桁の月日を0で埋める（文字の並び順と日付の順を合わせる）', () => {
    expect(dateStamp(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
