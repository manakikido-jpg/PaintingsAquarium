import { describe, expect, it } from 'vitest'
import { placeCreature, spawnCreature, stepCreatures, type Creature } from '../motion'
import { SPECIES_IDS, SPECIES, speciesWalks, type SpeciesId } from '../templates'
import type { Lane } from '../walk'
import type { Tank } from '../swim'

/*
 * **ハロウィンは、地面を歩く2種（かぼちゃ・フランケン）と
 * 夜空を飛ぶ3種（こうもり・まじょ・ゆうれい）が同じ画面に並ぶ。**
 *
 * 歩く絵と浮く絵を混ぜるのは、恐竜で事故になった型そのもの（R-072）。
 * 見分けを1つ間違えると「おばけが地面を歩く」「かぼちゃが空に浮く」になる。
 * **混ぜると決めた以上、どちらも起きないことをここで固定する。**
 *
 * かぼちゃは、ふわふわ浮かせていたのを地面に下ろした（本人の指示・2026-10-15）。
 * いちばん似ているのは**ゆうれい**（重なり 0.72）で、そこを取り違えると
 * 「おばけが地面を転がる」になる。似た相手が浮く側にいるのが怖いところ。
 */

const TANK: Tank = { width: 1920, height: 1080 }
/** ハロウィンの世界が持つ列は1本だけ（`halloweenScene.ts`） */
const LANES: Lane[] = [{ groundY: 1080 * 0.95, scale: 1, depth: 1 }]
const NIGHT = SPECIES_IDS.filter((id) => SPECIES[id].theme === 'halloween')

function spawn(species: SpeciesId, lanes: readonly Lane[] = LANES, seed = 7): Creature {
  // ハロウィンのテーマの動きは float。種類の印だけで歩くかどうかが決まる
  return spawnCreature('float', seed, TANK, 420, 410, lanes, 1, 'unknown', species)
}

/** 地面を歩く2種 */
const WALKERS: SpeciesId[] = ['kabocha', 'franken']
/** 夜空を飛ぶ3種 */
const FLOATERS = NIGHT.filter((id) => !WALKERS.includes(id))

describe('ハロウィン: 地面を歩くのはかぼちゃとフランケンだけ', () => {
  it('台紙は5種で、歩く印が付いているのは2種だけ', () => {
    expect(NIGHT).toHaveLength(5)
    expect(NIGHT.filter((id) => speciesWalks(id)).sort()).toEqual([...WALKERS].sort())
  })

  it('かぼちゃとフランケンは歩く', () => {
    for (const id of WALKERS) {
      for (let seed = 0; seed < 40; seed++) {
        expect(spawn(id, LANES, seed).kind, id).toBe('walk')
      }
    }
  })

  it('ほかの3種は、地面の列があっても歩かない', () => {
    for (const id of FLOATERS) {
      for (let seed = 0; seed < 40; seed++) {
        expect(spawn(id, LANES, seed).kind, id).toBe('float')
      }
    }
  })

  /*
   * **列が無いテーマでは歩かせない。** 地面の高さが決まらないので、
   * 足が宙に浮くか画面の外へ沈む。種類の印だけを見て歩かせてはいけない。
   */
  it('地面の列が無ければ、どちらもただよう', () => {
    for (const id of WALKERS) expect(spawn(id, []).kind, id).toBe('float')
  })
})

describe('ハロウィン: 歩く2種が空に浮かない', () => {
  it('ジャンプを含めても地面を基準に動き、空へ上がり続けない（60秒）', () => {
    let creatures = WALKERS.flatMap((id) =>
      Array.from({ length: 8 }, (_, i) => spawn(id, LANES, i)),
    )
    const ground = LANES[0].groundY
    for (let step = 0; step < 60 * 30; step++) {
      creatures = stepCreatures(creatures, 1 / 30, TANK)
      for (const creature of creatures) {
        const place = placeCreature(creature, LANES)
        const feet = place.y + place.height / 2
        /*
         * 地面の線ちょうどには揃わない。わざと散らしてある（`groundOffset`）。
         * 同じ高さに並ぶと、すれ違うときに「ぶつかっている」ようにしか見えないため。
         * かぼちゃはジャンプするので、各個体の実際の跳躍高さを上限にする。
         * **見たいのは「空へ上がっていかないこと」。**
         */
        if (creature.kind !== 'walk') throw new Error('地面の絵が浮遊している')
        const home = ground + creature.walker.groundOffset
        expect(feet).toBeGreaterThanOrEqual(home - creature.walker.bounce - 1e-8)
        expect(feet).toBeLessThanOrEqual(home + 1e-8)
      }
    }
  })

  it('画面の上半分へは行かない', () => {
    let creatures = WALKERS.map((id) => spawn(id, LANES, 3))
    for (let step = 0; step < 60 * 30; step++) {
      creatures = stepCreatures(creatures, 1 / 30, TANK)
      for (const creature of creatures) {
        expect(placeCreature(creature, LANES).y).toBeGreaterThan(TANK.height * 0.5)
      }
    }
  })
})

describe('ハロウィン: ほかの3種が地面を歩かない', () => {
  it('ただよう3種は、画面の上のほうにも出る', () => {
    for (const id of FLOATERS) {
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
