import { describe, expect, it } from 'vitest'
import { placeCreature, spawnCreature, stepCreatures } from '../motion'
import type { Tank } from '../swim'
import { CROSS_SECONDS } from '../behaviour'
import type { CreatureKind } from '../rig'
import type { SpeciesId } from '../templates'

/**
 * 泳ぐ速さを数字で固定する。
 *
 * 会場からの指摘「カメとタコの速度がおかしい」で分かったこと。
 * 縦の波を「時間の周期」で決めていたため、**縦の速さが横の速さと無関係**になり、
 * タコは縦が横の5倍・ウミガメは3.6倍で飛び跳ねていた。
 * 見た目の話に見えて、実際は数字で捕まえられる。だからここで固定する。
 */

const tank: Tank = { width: 1600, height: 900 }
// ここで測るのは水族館の6種だけ（恐竜は歩くので速さの決め方が別）
const KIND: Partial<Record<SpeciesId, CreatureKind>> = {
  fish: 'fish',
  iruka: 'fish',
  same: 'fish',
  tako: 'tentacled',
  kurage: 'tentacled',
  umigame: 'tentacled',
}

interface Measured {
  readonly across: number
  readonly down: number
  /** 同じ瞬間の「縦 ÷ 横」の最大。道のいちばん急なところ */
  readonly steepest: number
  readonly crossSeconds: number
  readonly swing: number
  readonly fastest: number
  readonly slowest: number
}

/**
 * `skip` は、測り始めるまでに捨てる秒数。
 *
 * **生まれた直後は測らない。** 絵は好きな高さに生まれるが、ゆっくりした上下
 * （`wanderY`）はそのとき目指す深さが決まっているので、遠ければそこまで
 * 上限の速さで移動する。実測で、最初の8秒だけ上下 254px・落ち着いたあとは
 * 51〜121px（画面900）だった。この差は**生まれた場所の問題**であって、
 * 泳ぎ方の問題ではない。
 */
function measure(species: SpeciesId, seconds = 30, seed = 11, skip = 0): Measured {
  let creature = spawnCreature('float', seed, tank, 500, 300, [], 1, KIND[species], species)
  const dt = 1 / 60
  let across = 0
  let down = 0
  let count = 0
  let minY = Infinity
  let maxY = -Infinity
  let fastest = 0
  let slowest = Infinity
  let steepest = 0
  for (let step = 0; step < Math.round((seconds + skip) / dt); step++) {
    creature = stepCreatures([creature], dt, tank)[0]
    if (creature.kind !== 'float') continue
    if (step * dt < skip) continue
    const { vx, vy } = creature.fish
    across += Math.abs(vx)
    down += Math.abs(vy)
    // 横がほとんど止まっている瞬間は、比が意味を持たないので外す
    if (Math.abs(vx) > 1) steepest = Math.max(steepest, Math.abs(vy) / Math.abs(vx))
    count++
    const speed = Math.hypot(vx, vy)
    fastest = Math.max(fastest, speed)
    slowest = Math.min(slowest, speed)
    const place = placeCreature(creature, [])
    minY = Math.min(minY, place.y)
    maxY = Math.max(maxY, place.y)
  }
  const mean = across / count
  return {
    across: mean,
    down: down / count,
    steepest,
    crossSeconds: tank.width / Math.max(1, mean),
    swing: maxY - minY,
    fastest,
    slowest,
  }
}

describe('横切るのにかかる時間', () => {
  it.each(Object.keys(CROSS_SECONDS) as SpeciesId[])('%s は決めた範囲に収まる', (species) => {
    const [fast, slow] = CROSS_SECONDS[species]
    const { crossSeconds } = measure(species)
    // 縦にも動くぶん、横だけの速さは少し遅くなる。2割の余裕を見る
    expect(crossSeconds).toBeGreaterThan(fast * 0.8)
    expect(crossSeconds).toBeLessThan(slow * 1.6)
  })
})

describe('縦と横のつり合い', () => {
  it('タコとウミガメは、縦が横を上回らない（跳ねているように見えてしまう）', () => {
    for (const species of ['tako', 'umigame'] as const) {
      const { across, down } = measure(species)
      expect(down).toBeLessThan(across)
    }
  })

  /*
   * 上下の動きは**2つある**ので、短い窓と長い窓で別々に見る。
   *   - S字の波（速い）… 数秒で1往復。ここが大きいと飛び跳ねて見える（R-035）
   *   - ゆっくりした上下（遅い）… 150秒で1往復。これが無いと、
   *     生まれた高さの帯から出られず、下で生まれた絵が飾りに埋もれる
   */
  /*
   * **「◯秒の間にどれだけ上下したか」では固定できない。**
   * 窓を短くすると波の一部しか入らず（8秒窓で 51px しか動かない回がある）、
   * 長くするとゆっくりした上下が混ざって、波の大きさが分からなくなる。
   * 波の速さそのもの（縦のいちばん速いとき）で見る。
   * R-035 で問題になったのも「縦が横の5倍」という**速さの比**だった。
   */
  it('その瞬間の縦は、横の3倍を超えない（跳ねて見える）', () => {
    /*
     * **「縦の最大 ÷ 横の平均」では測れない。**
     * まる魚とタコは、ひとかきごとに速くなる（`FISH_SPEED` / `TAKO_SPEED`）。
     * 蹴った瞬間は縦も横も一緒に速くなるので、道の形は変わらないのに
     * 「縦の最大」だけが上がる。**同じ瞬間の縦と横**でくらべる。
     * R-035 で問題になったのは「縦が横の5倍」。実測はタコ 2.5・ウミガメ 1.1。
     */
    for (const species of ['tako', 'umigame'] as const) {
      const { steepest } = measure(species, 300)
      expect(steepest).toBeLessThan(3)
      // 波が消えていないことも見る。まっすぐ進むだけになると生き物に見えない
      expect(steepest).toBeGreaterThan(0.5)
    }
  })

  it('長い目で見ると、画面の高さの半分より広く上下する（同じ帯に居続けない）', () => {
    for (const species of ['tako', 'umigame'] as const) {
      const { swing } = measure(species, 300)
      expect(swing).toBeGreaterThan(tank.height * 0.5)
    }
  })

  it('クラゲも、長い目で見れば画面の高さの半分より広く上下する', () => {
    // ふわふわ（9秒で1往復・高さの4.5%）は**その場での揺れ**で、居場所は変わらない。
    // 横切るのに 80〜140 秒かかるので、これだけだと何分も同じ高さに居座る
    expect(measure('kurage', 300).swing).toBeGreaterThan(tank.height * 0.5)
  })

  it('クラゲは、少しだけ横に流れながら、ゆっくり上下する', () => {
    const { across, down } = measure('kurage')
    // 「もう少しだけ横移動を」との指摘で速くした（画面横断 150〜250秒 → 80〜140秒）
    expect(across).toBeGreaterThan(8)
    expect(across).toBeLessThan(25)
    expect(down).toBeLessThan(30)
  })
})

describe('サメの緩急', () => {
  it('速いときと遅いときで、2倍以上の差がつく', () => {
    // 追う相手がいる状態で測る
    let shark = spawnCreature('float', 3, tank, 500, 300, [], 1, 'fish', 'same')
    let prey = spawnCreature('float', 9, tank, 500, 300, [], 1, 'fish', 'fish')
    const dt = 1 / 60
    let fastest = 0
    let slowest = Infinity
    for (let step = 0; step < 60 * 30; step++) {
      const next = stepCreatures([shark, prey], dt, tank)
      shark = next[0]
      prey = next[1]
      if (shark.kind !== 'float') continue
      const speed = Math.hypot(shark.fish.vx, shark.fish.vy)
      fastest = Math.max(fastest, speed)
      slowest = Math.min(slowest, speed)
    }
    expect(fastest / Math.max(1, slowest)).toBeGreaterThan(2)
  })
})
