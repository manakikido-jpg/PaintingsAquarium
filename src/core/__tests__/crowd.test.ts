import { describe, expect, it } from 'vitest'
import { placeCreature, spawnCreature, stepCreatures, type Creature } from '../motion'
import type { Tank } from '../swim'
import type { SpeciesId } from '../templates'

/*
 * **混み合ったときに絵が重なったままにならないこと。**
 *
 * 単体（`separateFish` だけ）の試験は通っていたのに、実機では
 * ウミガメ2匹が7秒間くっついたまま泳いでいた。
 * タコ・ウミガメ・クラゲの動きが**縦の速度を上書きする**ので、
 * 避けた結果が毎フレーム捨てられていたため。
 * 単体ではなく、**動きを通したあとの重なり**で測る。
 */

const tank: Tank = { width: 1920, height: 1080 }
const SPECIES: readonly (readonly [SpeciesId, 'fish' | 'tentacled'])[] = [
  ['fish', 'fish'],
  ['iruka', 'fish'],
  ['same', 'fish'],
  ['tako', 'tentacled'],
  ['kurage', 'tentacled'],
  ['umigame', 'tentacled'],
]

/** 6種を4匹ずつ、24匹。会場で実際に測ったときと同じ数 */
function crowd(): Creature[] {
  const out: Creature[] = []
  let seed = 1
  for (let copy = 0; copy < 4; copy++) {
    for (const [species, kind] of SPECIES) {
      out.push(spawnCreature('float', seed++ * 977, tank, 520, 390, [], 1, kind, species))
    }
  }
  return out
}

/** 体が触れ合っている組の数 */
function touching(list: readonly Creature[]): number {
  const fish = list.flatMap((creature) => (creature.kind === 'float' ? [creature.fish] : []))
  let pairs = 0
  for (let a = 0; a < fish.length; a++) {
    for (let b = a + 1; b < fish.length; b++) {
      const limit =
        (Math.max(fish[a].width, fish[a].height) + Math.max(fish[b].width, fish[b].height)) / 2
      if (Math.hypot(fish[a].x - fish[b].x, fish[a].y - fish[b].y) < limit * 0.75) pairs++
    }
  }
  return pairs
}

describe('24匹が重なったままにならない', () => {
  it('60秒泳がせても、触れ合っている組はごくわずか', () => {
    let list = crowd()
    const samples: number[] = []
    for (let step = 0; step < 30 * 60; step++) {
      list = stepCreatures(list, 1 / 30, tank)
      if (step % 15 === 0) samples.push(touching(list))
    }
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length
    // 直す前は平均 3.32 組・最大 9 組だった。直したあとは 0.17 組
    expect(mean, `平均 ${mean.toFixed(2)} 組`).toBeLessThan(1)
  })

  it('同じ種類どうしがくっついたままにならない', () => {
    let list = crowd()
    for (let step = 0; step < 30 * 60; step++) list = stepCreatures(list, 1 / 30, tank)
    const fish = list.flatMap((creature) => (creature.kind === 'float' ? [creature.fish] : []))
    for (const [species] of SPECIES) {
      const same = fish.filter((one) => one.species === species)
      const size = Math.max(same[0].width, same[0].height)
      for (let a = 0; a < same.length; a++) {
        for (let b = a + 1; b < same.length; b++) {
          const gap = Math.hypot(same[a].x - same[b].x, same[a].y - same[b].y)
          // 直す前はウミガメが 21px（体は134px）まで近づいたままだった
          expect(gap, `${species}: ${gap.toFixed(0)}px`).toBeGreaterThan(size * 0.75)
        }
      }
    }
  })
})

/*
 * **上下の端に張り付かないこと。**
 *
 * `stepFish` は上下の壁で速度を跳ね返すが、生き物ごとの動き（`behaviour.ts`）が
 * 縦の速度を毎フレーム上書きするので、その跳ね返りは捨てられる（R-043）。
 * 実測で、イルカが上端10%に **56秒**・タコが **49秒**居続けていた。
 * 天井をこすり続ける絵は「止まっている」ようにしか見えない。
 *
 * これも単体では捕まらない。**24匹を長く泳がせて測る。**
 */
describe('端に張り付かない', () => {
  /*
   * 「端の帯に居た時間」だけでは測れない。ウミガメは横切るのに 40〜55 秒かかるので、
   * 天井の近くを**横切っている**だけでも長く居たことになる。
   * 見て困るのは「止まって見える」ことなので、
   * **端の帯に居て、かつ横にも進んでいない**時間で測る。
   */
  it('どの絵も、端の帯で止まったままにならない', () => {
    let creatures = crowd()
    const dt = 1 / 30
    const stay = new Array(creatures.length).fill(0)
    const from = new Array(creatures.length).fill(0)
    const longest = new Array(creatures.length).fill(0)
    for (let step = 0; step < 300 / dt; step++) {
      creatures = stepCreatures(creatures, dt, tank)
      creatures.forEach((creature, index) => {
        const { x, y } = placeCreature(creature, [])
        const edge = y < tank.height * 0.1 || y > tank.height * 0.9
        if (!edge) {
          stay[index] = 0
          return
        }
        if (stay[index] === 0) from[index] = x
        // 端でも横へ進んでいるなら、止まってはいない
        if (Math.abs(x - from[index]) > tank.width * 0.25) {
          stay[index] = 0
          return
        }
        stay[index] += dt
        longest[index] = Math.max(longest[index], stay[index])
      })
    }
    // 実測: 直す前は最長 64秒（ウミガメ）。直したあとは 27秒（同）／タコ24・サメ23・まる魚22
    expect(Math.max(...longest)).toBeLessThan(35)
  })

  it('どの種類も、画面の上・中・下をひととおり使う', () => {
    // 生まれた高さに居続けると、下の帯の絵は飾りと重なって見つけにくい
    let creatures = crowd()
    const dt = 1 / 30
    const bands = creatures.map(() => [0, 0, 0])
    for (let step = 0; step < 300 / dt; step++) {
      creatures = stepCreatures(creatures, dt, tank)
      creatures.forEach((creature, index) => {
        const { y } = placeCreature(creature, [])
        bands[index][Math.min(2, Math.max(0, Math.floor((y / tank.height) * 3)))]++
      })
    }
    for (const band of bands) {
      const total = band[0] + band[1] + band[2]
      // どの帯にも 5% 以上は居ること（3等分なので、均せば 33%）
      for (const part of band) expect(part / total).toBeGreaterThan(0.05)
    }
  })
})
