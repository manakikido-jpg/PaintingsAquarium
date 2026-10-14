import { describe, expect, it } from 'vitest'
import { placeCreature, spawnCreature, stepCreatures, type Creature } from '../motion'
import { SPECIES_IDS, SPECIES, speciesWalks, type SpeciesId } from '../templates'
import type { Lane } from '../walk'
import type { Tank } from '../swim'

/*
 * **ハロウィンは「全部ただよう」テーマの中で、フランケンだけ地面を歩く。**
 *
 * 歩く絵と浮く絵を混ぜるのは、恐竜で事故になった型そのもの（R-072）。
 * 見分けを1つ間違えると「おばけが地面を歩く」「フランケンが空に浮く」になる。
 * **混ぜると決めた以上、どちらも起きないことをここで固定する。**
 */

const TANK: Tank = { width: 1920, height: 1080 }
/** ハロウィンの世界が持つ列は1本だけ（`halloweenScene.ts`） */
const LANES: Lane[] = [{ groundY: 1080 * 0.95, scale: 1, depth: 1 }]
const NIGHT = SPECIES_IDS.filter((id) => SPECIES[id].theme === 'halloween')

function spawn(species: SpeciesId, lanes: readonly Lane[] = LANES, seed = 7): Creature {
  // ハロウィンのテーマの動きは float。種類の印だけで歩くかどうかが決まる
  return spawnCreature('float', seed, TANK, 420, 410, lanes, 1, 'unknown', species)
}

describe('ハロウィン: フランケンだけ地面を歩く', () => {
  it('台紙は5種で、歩く印が付いているのはフランケンだけ', () => {
    expect(NIGHT).toHaveLength(5)
    expect(NIGHT.filter((id) => speciesWalks(id))).toEqual(['franken'])
  })

  it('フランケンは歩く', () => {
    for (let seed = 0; seed < 40; seed++) {
      expect(spawn('franken', LANES, seed).kind).toBe('walk')
    }
  })

  it('ほかの4種は、地面の列があっても歩かない', () => {
    for (const id of NIGHT.filter((n) => n !== 'franken')) {
      for (let seed = 0; seed < 40; seed++) {
        expect(spawn(id, LANES, seed).kind).toBe('float')
      }
    }
  })

  /*
   * **列が無いテーマでは歩かせない。** 地面の高さが決まらないので、
   * 足が宙に浮くか画面の外へ沈む。種類の印だけを見て歩かせてはいけない。
   */
  it('地面の列が無ければ、フランケンもただよう', () => {
    expect(spawn('franken', []).kind).toBe('float')
  })
})

describe('ハロウィン: フランケンが空に浮かない', () => {
  it('足が地面から離れない（60秒ぶん動かしても）', () => {
    let creatures = Array.from({ length: 8 }, (_, i) => spawn('franken', LANES, i))
    const ground = LANES[0].groundY
    for (let step = 0; step < 60 * 30; step++) {
      creatures = stepCreatures(creatures, 1 / 30, TANK)
      for (const creature of creatures) {
        const place = placeCreature(creature, LANES)
        const feet = place.y + place.height / 2
        /*
         * 地面の線ちょうどには揃わない。わざと散らしてある（`groundOffset`）。
         * 同じ高さに並ぶと、すれ違うときに「ぶつかっている」ようにしか見えないため。
         * 歩くたびの弾みも乗るので、絵の高さの 2 割ぶんを許す。
         * **見たいのは「空へ上がっていかないこと」。**
         */
        expect(feet).toBeGreaterThan(ground - place.height * 0.2)
        expect(feet).toBeLessThan(ground + place.height * 0.2)
      }
    }
  })

  it('画面の上半分へは行かない', () => {
    let creatures = [spawn('franken', LANES, 3)]
    for (let step = 0; step < 60 * 30; step++) {
      creatures = stepCreatures(creatures, 1 / 30, TANK)
      expect(placeCreature(creatures[0], LANES).y).toBeGreaterThan(TANK.height * 0.5)
    }
  })
})

describe('ハロウィン: ほかの4種が地面を歩かない', () => {
  it('ただよう4種は、画面の上のほうにも出る', () => {
    for (const id of NIGHT.filter((n) => n !== 'franken')) {
      let creatures = Array.from({ length: 12 }, (_, i) => spawn(id, LANES, i * 13 + 1))
      let reachedUpper = false
      for (let step = 0; step < 60 * 20; step++) {
        creatures = stepCreatures(creatures, 1 / 30, TANK)
        for (const creature of creatures) {
          expect(creature.kind).toBe('float')
          if (placeCreature(creature, LANES).y < TANK.height * 0.5) reachedUpper = true
        }
      }
      expect(reachedUpper, `${id} が画面の上半分に出てこない`).toBe(true)
    }
  })
})

describe('恐竜テーマは変わっていない', () => {
  const LAND_LANES: Lane[] = [
    { groundY: 700, scale: 0.8, depth: 0 },
    { groundY: 850, scale: 0.9, depth: 0.5 },
    { groundY: 1000, scale: 1, depth: 1 },
  ]
  const walk = (species: SpeciesId): Creature =>
    spawnCreature('walk', 11, TANK, 420, 410, LAND_LANES, 1, 'fish', species, 700)

  it('四足は歩き、プテラノドンだけ飛ぶ', () => {
    for (const id of ['ankylosaurus', 'brontosaurus', 'stegosaurus', 'triceratops'] as const) {
      expect(walk(id).kind).toBe('walk')
    }
    expect(walk('pteranodon').kind).toBe('float')
  })

  it('水族館の6種はどれも歩かない', () => {
    for (const id of SPECIES_IDS.filter((n) => SPECIES[n].theme === 'aquarium')) {
      expect(speciesWalks(id)).toBe(false)
      expect(spawnCreature('float', 5, TANK, 400, 300, LANES, 1, 'fish', id).kind).toBe('float')
    }
  })
})
