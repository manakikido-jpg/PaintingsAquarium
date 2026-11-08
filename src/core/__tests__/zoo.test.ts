import { describe, expect, it } from 'vitest'
import { createImage } from '../image'
import { spawnCreature, placeCreature, stepCreatures } from '../motion'
import { TEMPLATE_BITS, TEMPLATE_GRID } from '../templates.generated'
import { identifySpecies, partsForPiece, templatesForTheme, SPECIES } from '../templates'
import { isThemeId, themeMeta, themeOf } from '../theme'
import { makeLanes } from '../walk'
import { zooSizeRatio } from '../size'

const animals = ['zou', 'raion', 'kirin', 'saru', 'panda', 'shimauma'] as const
const tank = { width: 1920, height: 1080 }
const lanes = makeLanes(tank, 8, { backRatio: 0.64, frontRatio: 0.94, minScale: 0.75, maxScale: 1 })

describe('お絵描き動物園', () => {
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

  it('頭と首は変形せず、足だけを逆向きに振る', () => {
    for (const id of animals) {
      const parts = partsForPiece(id)
      const body = parts[parts.length - 1]
      expect(body.box.y).toBe(0)
      expect(body.swing).toBe(0)
      expect(body.shear ?? 0).toBe(0)
      expect(body.lift ?? 0).toBe(0)
      const legs = parts.slice(0, -1)
      expect(legs.length).toBeGreaterThan(8)
      expect(Math.min(...legs.map(p => p.shear ?? 0))).toBeLessThan(0)
      expect(Math.max(...legs.map(p => p.shear ?? 0))).toBeGreaterThan(0)
      for (const leg of legs) expect(leg.box.y).toBe(body.box.h)
    }
  })
})
