import { describe, expect, it } from 'vitest'
import { rigidArtwork, spawnCreature, placeCreature, needsMotionRebuild } from '../motion'
import { themeOf, type ThemeId } from '../theme'
import { speciesForTheme, type SpeciesId } from '../templates'
import { makeLanes } from '../walk'
import { creatureSize, normalizeSizeScale } from '../size'
import { enqueueWithSnapshot } from '../queue'

const tank = { width: 1920, height: 1080 }
const lanes = makeLanes(tank, 8, { backRatio: 0.64, frontRatio: 0.94, minScale: 0.75, maxScale: 1 })

describe('魚の波打ちと極端な縮小の再発防止', () => {
  it('種類・古い魚用リグに依存せず、水族館以外は魚の変形を使わない', () => {
    for (const theme of ['zoo', 'dinosaur', 'halloween', 'space', 'meadow', 'night'] as const) {
      for (const species of [undefined, 'fish', 'tako', 'zou', 'kirin', 'franken'] as const) {
        expect(rigidArtwork(theme, species)).toBe(true)
      }
    }
    expect(rigidArtwork('aquarium')).toBe(false)
    expect(rigidArtwork('aquarium', 'fish')).toBe(false)
    expect(rigidArtwork('aquarium', 'tako')).toBe(false)
  })

  it('不正な種類や別テーマの種類を持つ保存データでも動物園の標準表示になる', () => {
    for (const raw of [undefined, 'fish', 'tako', 'pteranodon', 'not-a-species', '__proto__']) {
      expect(speciesForTheme(raw, 'zoo')).toBeUndefined()
      for (const kind of ['unknown', 'fish', 'tentacled'] as const) {
        const creature = spawnCreature('walk', 7, tank, 800, 600, lanes, 1, kind,
          raw as SpeciesId | undefined, undefined, 'zoo')
        expect(creature.kind).toBe('walk')
        const place = placeCreature(creature, lanes)
        expect(Math.max(place.width, place.height)).toBeGreaterThan(tank.width * 0.12)
        expect(Math.max(place.width, place.height)).toBeLessThan(tank.width * 0.21)
      }
    }
  })

  it('テーマだけ欠けた動物・恐竜・ハロウィンを水族館へ落とさない', () => {
    expect(themeOf({ species: 'zou' })).toBe('zoo')
    expect(themeOf({ species: 'kirin' })).toBe('zoo')
    expect(themeOf({ species: 'franken' })).toBe('halloween')
    expect(themeOf({ species: 'triceratops' })).toBe('dinosaur')
    expect(themeOf({ species: 'fish' })).toBe('aquarium')
    expect(themeOf({})).toBe('aquarium')
    expect(themeOf({ species: 'not-a-species' })).toBe('aquarium')
    expect(themeOf({ theme: 'zoo', species: 'fish' })).toBe('zoo')
  })

  it('保存・再読み込み・種類消失のあとも動物園の長辺サイズを保つ', () => {
    for (const species of ['zou', 'raion', 'kirin', 'saru', 'panda', 'shimauma', undefined] as const) {
      const original = { theme: 'zoo' as ThemeId, width: 800, height: 600, species }
      const restored = JSON.parse(JSON.stringify(original)) as typeof original
      const spawn = (piece: typeof original) => placeCreature(spawnCreature('walk', 3, tank,
        piece.width, piece.height, lanes, 1, 'fish', piece.species, undefined, themeOf(piece)), lanes)
      expect(spawn(restored)).toEqual(spawn(original))
      const unrecognized = { ...restored, species: undefined }
      expect(spawn(unrecognized).width).toBeGreaterThan(spawn(original).width * 0.7)
      if (species) expect(needsMotionRebuild(restored, unrecognized)).toBe(true)
    }
  })

  it('非数値のサイズ設定は標準に戻し、有限の範囲を保つ', () => {
    for (const value of [undefined, null, 'small', Number.NaN, Infinity, -Infinity]) {
      expect(normalizeSizeScale(value)).toBe(1)
      expect(creatureSize(tank, 0.17, value as number)).toBeCloseTo(tank.width * 0.17)
    }
    expect(normalizeSizeScale(0)).toBe(0.5)
    expect(normalizeSizeScale(999)).toBe(2)
  })
})

describe('取り込み受付時の設定と処理待ち', () => {
  it('待ち時間中にテーマを変えても受付時のテーマで処理する', async () => {
    let release!: () => void
    let queue = new Promise<void>(resolve => { release = resolve })
    let settings = { theme: 'zoo' }
    const saved: string[] = []
    queue = enqueueWithSnapshot(queue, settings, async s => { saved.push(s.theme) }, () => {})
    queue = enqueueWithSnapshot(queue, settings, async s => { saved.push(s.theme) }, () => {})
    settings = { theme: 'aquarium' }
    queue = enqueueWithSnapshot(queue, settings, async s => { saved.push(s.theme) }, () => {})
    release()
    await queue
    expect(saved).toEqual(['zoo', 'zoo', 'aquarium'])
  })

  it('1枚の処理や設定取得が失敗しても次の画像を処理する', async () => {
    const errors: string[] = []
    const saved: string[] = []
    const fail = (error: unknown): void => { errors.push(String(error)) }
    let queue = enqueueWithSnapshot(Promise.resolve(), 'bad', async () => { throw new Error('decode failed') }, fail)
    queue = enqueueWithSnapshot(queue, Promise.reject(new Error('settings failed')), async () => {}, fail)
    queue = enqueueWithSnapshot(queue, 'good', async s => { saved.push(s) }, fail)
    await queue
    expect(errors).toHaveLength(2)
    expect(saved).toEqual(['good'])
  })
})

describe('連続受付の順序と失敗からの継続を繰り返す', () => {
  it('20通り×50件でテーマ変更と設定取得・画像処理の失敗を混ぜても、成功した絵を受付順に処理する', async () => {
    for (let seed = 0; seed < 20; seed++) {
      let release!: () => void
      let queue = new Promise<void>(resolve => { release = resolve })
      const actual: string[] = []
      const expected: string[] = []
      const errors: unknown[] = []
      let failures = 0
      for (let i = 0; i < 50; i++) {
        const theme = (i + seed) % 2 ? 'zoo' : 'aquarium'
        const missingSettings = (i + seed) % 13 === 0
        const failedImage = (i + seed) % 11 === 0
        const context = missingSettings ? Promise.reject(new Error('settings')) : { theme }
        if (missingSettings || failedImage) failures++
        else expected.push(`${i}:${theme}`)
        queue = enqueueWithSnapshot(queue, context, async snapshot => {
          if (failedImage) throw new Error('image')
          actual.push(`${i}:${snapshot.theme}`)
        }, error => { errors.push(error) })
      }
      expect(actual).toEqual([])
      release()
      await queue
      expect(actual).toEqual(expected)
      expect(errors).toHaveLength(failures)
    }
  })
})
