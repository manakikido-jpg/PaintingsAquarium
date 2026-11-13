import { describe, expect, it } from 'vitest'
import { createImage } from '../image'
import { spawnCreature, placeCreature, stepCreatures } from '../motion'
import { TEMPLATE_BITS, TEMPLATE_GRID } from '../templates.generated'
import { identifySpecies, partsForPiece, templatesForTheme, SPECIES } from '../templates'
import { isThemeId, themeMeta, themeOf } from '../theme'
import { makeZooLanes } from '../walk'
import { zooSizeRatio } from '../size'

const animals = ['zou', 'raion', 'kirin', 'saru', 'panda', 'shimauma'] as const
const tank = { width: 1920, height: 1080 }
const lanes = makeZooLanes(tank)

describe('お絵描き動物園', () => {
  it('奥の芝生まで使いつつ、前の列と絵の大きさの下限を保つ', () => {
    expect(lanes).toHaveLength(10)
    expect(lanes[0].groundY / tank.height).toBeGreaterThan(0.53)
    expect(lanes[0].groundY / tank.height).toBeLessThan(0.60)
    expect(lanes.at(-1)!.groundY / tank.height).toBeCloseTo(0.94)
    expect(Math.min(...lanes.map(lane => lane.scale))).toBe(0.75)
    expect(Math.max(...lanes.map(lane => lane.scale))).toBe(1)
    const occupied = new Set<number>()
    let backCount = 0
    for (let seed = 1; seed <= 300; seed++) {
      const creature = spawnCreature('walk', seed, tank, 1000, 800, lanes, 1, 'unknown', 'panda', undefined, 'zoo')
      if (creature.kind !== 'walk') throw new Error('地面を歩く必要がある')
      occupied.add(creature.walker.lane)
      const foot = placeCreature(creature, lanes)
      if (foot.y + foot.height / 2 < tank.height * 0.64) backCount++
    }
    expect(occupied.size).toBe(lanes.length)
    expect(backCount).toBeGreaterThan(30)
  })

  it('さるの台紙は横長で、地面付近に4本の手足が分かれている', () => {
    const bits = TEMPLATE_BITS.saru
    const cells = [...bits].map((bit, i) => ({ solid: bit === '1', x: i % TEMPLATE_GRID, y: Math.floor(i / TEMPLATE_GRID) }))
      .filter(cell => cell.solid)
    const left = Math.min(...cells.map(cell => cell.x))
    const right = Math.max(...cells.map(cell => cell.x))
    const top = Math.min(...cells.map(cell => cell.y))
    const bottom = Math.max(...cells.map(cell => cell.y))
    expect((right - left + 1) / (bottom - top + 1)).toBeGreaterThan(1.3)
    let maxFeet = 0
    for (let y = top + Math.floor((bottom - top) * 0.85); y < bottom; y++) {
      let feet = 0
      for (let x = 0; x < TEMPLATE_GRID; x++) {
        if (bits[y * TEMPLATE_GRID + x] === '1' && (x === 0 || bits[y * TEMPLATE_GRID + x - 1] !== '1')) feet++
      }
      maxFeet = Math.max(maxFeet, feet)
    }
    expect(maxFeet).toBe(4)
  })

  it('テーマを保存でき、6種だけを照合対象にする', () => {
    expect(isThemeId('zoo')).toBe(true)
    expect(themeOf({ theme: 'zoo' })).toBe('zoo')
    expect(themeMeta('zoo')).toMatchObject({ motion: 'walk', ready: true })
    expect(templatesForTheme('zoo').map(t => t.id).sort()).toEqual([...animals].sort())
  })

  it.each(animals)('%sは他の動物と十分な差で判定できる', (id) => {
    const image = createImage(TEMPLATE_GRID, TEMPLATE_GRID)
    for (let i = 0; i < TEMPLATE_BITS[id].length; i++) {
      image.data[i * 4 + 3] = TEMPLATE_BITS[id][i] === '1' ? 255 : 0
    }
    const found = identifySpecies(image, 'zoo')
    expect(found?.id).toBe(id)
    expect(found!.score - found!.runnerUp).toBeGreaterThan(0.10)
    expect(SPECIES[id].stiff).toBe(true)
  })

  it('ぞうとキリンは移動も足踏みもしっぽの拍もゆっくりにする', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const spawn = (species: typeof animals[number]) => {
        const creature = spawnCreature('walk', seed, tank, 1000, 800, lanes, 1, 'unknown', species, undefined, 'zoo')
        if (creature.kind !== 'walk') throw new Error('地面を歩く必要がある')
        return creature.walker
      }
      const regular = spawn('raion')
      for (const id of ['zou', 'kirin'] as const) {
        const slow = spawn(id)
        expect(Math.abs(slow.vx)).toBeLessThan(Math.abs(regular.vx) * 0.8)
        expect(slow.stepSpeed).toBeCloseTo(regular.stepSpeed * 0.7)
        expect(partsForPiece(id).find(p => p.role === 'tail')!.rate).toBe(0.30)
      }
      expect(spawn('panda').stepSpeed).toBeCloseTo(regular.stepSpeed)
      expect(spawn('saru').stepSpeed).toBeCloseTo(regular.stepSpeed)
      expect(spawn('shimauma').stepSpeed).toBeCloseTo(regular.stepSpeed)
    }
  })

  it('6種と未判定の自由画も地面を歩き、1分後も足元が地面にある', () => {
    let creatures = [...animals, undefined].map((id, seed) => spawnCreature('walk', seed + 1,
      tank, id === 'kirin' ? 650 : 1000, 900, lanes, 1, 'unknown', id, undefined, 'zoo'))
    for (let frame = 0; frame < 1800; frame++) creatures = stepCreatures(creatures, 1 / 30, tank)
    for (const creature of creatures) {
      expect(creature.kind).toBe('walk')
      if (creature.kind !== 'walk') continue
      const place = placeCreature(creature, lanes)
      const ground = lanes[creature.walker.lane].groundY + creature.walker.groundOffset
      expect(place.y + place.height / 2).toBeLessThanOrEqual(ground + 1)
      expect(place.y + place.height / 2).toBeGreaterThan(ground - place.height * 0.1)
    }
    expect(zooSizeRatio()).toBe(zooSizeRatio('panda'))
  })

  it('顔・首を固定し、脚としっぽを別々に動かす', () => {
    for (const id of animals) {
      const parts = partsForPiece(id)
      const tails = parts.filter(p => p.role === 'tail')
      expect(tails).toHaveLength(1)
      const tail = tails[0]
      expect(tail.shearAxis).toBe('x')
      expect(tail.rate).toBeLessThan(1)
      expect(tail.pivot.x).toBe(tail.box.x)
      expect(Math.abs(tail.swing)).toBe(0)
      const fixed = parts.filter(p => !p.shear)
      expect(fixed.length).toBeGreaterThan(0)
      for (const part of fixed) {
        expect(part.swing).toBe(0)
        expect(part.lift ?? 0).toBe(0)
      }
      const legs = parts.filter(p => p.shearAxis === 'y')
      expect(legs.length).toBeGreaterThan(8)
      expect(Math.min(...legs.map(p => p.shear ?? 0))).toBeLessThan(0)
      expect(Math.max(...legs.map(p => p.shear ?? 0))).toBeGreaterThan(0)
    }
  })

  it('分割しても画像全体を一度ずつ描き、隙間や重複を作らない', () => {
    for (const id of animals) {
      const parts = partsForPiece(id)
      expect(parts.reduce((sum, p) => sum + p.box.w * p.box.h, 0)).toBeCloseTo(1)
      for (let y = 0.005; y < 1; y += 0.01) {
        for (let x = 0.005; x < 1; x += 0.01) {
          expect(parts.filter(p => x >= p.box.x && x < p.box.x + p.box.w &&
            y >= p.box.y && y < p.box.y + p.box.h)).toHaveLength(1)
        }
      }
      for (const mirrored of [true, false]) {
        for (let turns = 0; turns < 4; turns++) {
          const tail = partsForPiece(id, turns, mirrored).find(p => p.role === 'tail')!
          expect(tail.rate).toBe(0.30)
          expect(Math.abs(tail.swing)).toBe(0)
          expect(tail.shearAxis).toBe(turns % 2 === 0 ? 'x' : 'y')
        }
      }
    }
  })
})
