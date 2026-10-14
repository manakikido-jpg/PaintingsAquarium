import { describe, expect, it } from 'vitest'
import { placeCreature, spawnCreature, stepCreatures, type Creature } from '../motion'
import type { Lane } from '../walk'
import type { Tank } from '../swim'
import type { SpeciesId } from '../templates'

/*
 * **ハロウィンの5種は、道の形で性格を分ける。**
 *
 * もともとは5種とも同じ道（生まれたときの速度のまま直進）を、
 * 速さだけ変えて流していた。会場の画面では「同じ動きの絵が5種類」にしか
 * 見えない。ここでは「どう違うか」を数で固定する。
 *
 * 見た目の良し悪しは測れないので、**取り違えたら必ず壊れること**だけを書く。
 * 波長を入れ替える・帯を広げる・分岐を消す、のどれをやってもここが落ちる。
 */

const TANK: Tank = { width: 1920, height: 1080 }
const LANES: Lane[] = [{ groundY: 1080 * 0.95, scale: 1, depth: 1 }]
const FPS = 60
const DT = 1 / FPS

function spawn(species: SpeciesId, seed: number): Creature {
  return spawnCreature('float', seed, TANK, 420, 410, LANES, 1, 'unknown', species)
}

interface Track {
  /** 1 フレームごとの中心 Y */
  readonly ys: number[]
  /** 1 フレームごとの中心 X */
  readonly xs: number[]
}

/**
 * 1匹を `seconds` 秒動かして、通った道を記録する。
 *
 * **描画の Y（`placeCreature`）ではなく、道そのものの Y を見る。**
 * 描画の Y には、どの浮く絵にも共通で乗る細かいゆらぎ（`amplitude`・
 * 最大 20px を 1.2〜2.8rad/秒）が足してある。これは種類に関係なく同じで、
 * 最大 56px/秒 ある。種類ごとの道より大きいので、描画の Y で測ると
 * **どの種類も「同じくらい細かく揺れている」としか出ない**
 *（実際そうなり、ゆるいはずのまじょが、細かいはずのこうもりより
 * 折り返し回数が多く出た: まじょ120回・こうもり43回）。
 */
function run(species: SpeciesId, seed: number, seconds: number): Track {
  let creatures = [spawn(species, seed)]
  const ys: number[] = []
  const xs: number[] = []
  for (let step = 0; step < seconds * FPS; step++) {
    creatures = stepCreatures(creatures, DT, TANK)
    const creature = creatures[0]
    if (creature.kind !== 'float') throw new Error(`${species} が歩いている`)
    ys.push(creature.fish.y)
    xs.push(creature.fish.x)
  }
  return { ys, xs }
}

/**
 * 上下の向きが変わった回数。「道が細かいか、ゆるいか」はこれで測る。
 *
 * 速度ではなく**位置の差**で数えるのは、画面に出ているのが位置だから。
 * ゆっくりした上下（`wanderY`）も混ざるが、どの種類にも同じだけ混ざる。
 */
function turns(ys: readonly number[]): number {
  let count = 0
  let last = 0
  for (let i = 1; i < ys.length; i++) {
    const delta = ys[i] - ys[i - 1]
    if (Math.abs(delta) < 1e-6) continue
    const sign = Math.sign(delta)
    if (last !== 0 && sign !== last) count++
    last = sign
  }
  return count
}

/** 1 秒あたり、上下に動いた量の最大（ピクセル毎秒）。 */
function peakRate(values: readonly number[]): number {
  let peak = 0
  for (let i = 1; i < values.length; i++) peak = Math.max(peak, Math.abs(values[i] - values[i - 1]) * FPS)
  return peak
}

describe('ハロウィン: 4種のただよいが、それぞれ違う道になる', () => {
  /*
   * こうもりの波長は画面幅の 13%、まじょは 120%。**9倍以上違う**。
   * 60秒のあいだに折り返す回数で、その差がそのまま出る。
   */
  it('こうもりは細かく、まじょはゆるい', () => {
    const koumori = turns(run('koumori', 4, 60).ys)
    const majo = turns(run('majo', 4, 60).ys)
    expect(koumori).toBeGreaterThan(majo * 3)
  })

  it('こうもりは上下に忙しく動く（止まった絵にならない）', () => {
    // 波長 13%・横切り 23秒 なら、60秒で 10 回以上は上下するはず
    expect(turns(run('koumori', 9, 60).ys)).toBeGreaterThan(10)
  })

  /*
   * **まじょは縦より横が速い。** 逆になると、ほうきで滑空しているのではなく
   * 上下に跳ねながら進んでいるように見える（R-035 と同じ考え方）。
   */
  it('まじょは、縦の動きが横より遅い', () => {
    const track = run('majo', 2, 60)
    expect(peakRate(track.ys)).toBeLessThan(peakRate(track.xs))
  })
})

describe('ハロウィン: かぼちゃは下のほうでふわふわする', () => {
  /*
   * 帯は 46%〜78%。生まれた場所がその外でも、`wanderY` が中へ引き戻す。
   * 引き戻しには上限があるので（`WANDER_RATE`）、最初の数秒は帯の外に居てよい。
   */
  it('15秒たてば、画面の下半分から出ない', () => {
    for (let seed = 0; seed < 12; seed++) {
      const { ys } = run('kabocha', seed, 90)
      for (const y of ys.slice(15 * FPS)) {
        expect(y, `seed=${seed}`).toBeGreaterThan(TANK.height * 0.4)
        expect(y, `seed=${seed}`).toBeLessThan(TANK.height * 0.9)
      }
    }
  })

  it('地面（95%）には着かない。歩く絵と見分けがつかなくなる', () => {
    for (let seed = 0; seed < 12; seed++) {
      const { ys } = run('kabocha', seed, 90)
      expect(Math.max(...ys)).toBeLessThan(LANES[0].groundY)
    }
  })

  /*
   * **かぼちゃは「横へ進む絵」ではない。** 上下のふわふわのほうが目に入る、
   * が狙いなので、同じ時間での上下の最大の速さが横を上回ること。
   */
  it('横に流れるより、上下にふわふわするほうが目立つ', () => {
    const track = run('kabocha', 5, 60)
    expect(peakRate(track.ys)).toBeGreaterThan(peakRate(track.xs))
  })
})

describe('ハロウィン: ゆうれいは不規則に漂う', () => {
  /*
   * **以前は `steer` に分岐が無く、生まれたときの速度のまま直進していた。**
   * まる魚が R-043 で直したのと同じ形。まずそこを固定する。
   */
  it('上下に動く（直線で流れない）', () => {
    const { ys } = run('yurei', 6, 60)
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(TANK.height * 0.05)
  })

  /*
   * **横より縦のほうが速い。** ゆうれいは横切るのに 110秒かかるので
   *（17px/秒）、上下のゆらぎ（約 36px/秒）のほうが目に入る。それでよい。
   * 見ておきたいのは「暴れて見えないこと」のほうなので、
   * 1秒に画面の高さの 4% を超えないことで止める。
   */
  it('上下の動きが、1秒に画面の高さの4%を超えない', () => {
    for (let seed = 0; seed < 8; seed++) {
      const track = run('yurei', seed, 60)
      expect(peakRate(track.ys), `seed=${seed}`).toBeLessThan(TANK.height * 0.04)
    }
  })

  /*
   * 周期が 7.3 秒と 11.9 秒。割り切れないので、足した波が同じ形に戻るまで
   * 87秒かかる。**会場で見ている間に同じ動きが繰り返されない**ことの代わりに、
   * 「7.3秒後・11.9秒後のどちらにも同じ形が来ない」を見る。
   */
  it('短い周期で同じ動きを繰り返さない', () => {
    const { ys } = run('yurei', 1, 40)
    const sameAfter = (seconds: number): number => {
      const shift = Math.round(seconds * FPS)
      let worst = 0
      for (let i = 0; i + shift < ys.length; i++) worst = Math.max(worst, Math.abs(ys[i + shift] - ys[i]))
      return worst
    }
    expect(sameAfter(7.3)).toBeGreaterThan(5)
    expect(sameAfter(11.9)).toBeGreaterThan(5)
  })
})

describe('ハロウィン: 端での振る舞い', () => {
  /** その種類が、画面の外（体の半分より外）まで出るか。 */
  function leavesScreen(species: SpeciesId, seconds: number): boolean {
    for (let seed = 0; seed < 10; seed++) {
      let creatures = [spawn(species, seed)]
      for (let step = 0; step < seconds * FPS; step++) {
        creatures = stepCreatures(creatures, DT, TANK)
        const place = placeCreature(creatures[0], LANES)
        if (place.x < -place.width / 4 || place.x > TANK.width + place.width / 4) return true
      }
    }
    return false
  }

  /*
   * **夜空を横切る役（こうもり・まじょ）は、見えない壁で跳ね返らない。**
   * 跳ね返ると、空ではなく箱の中に見える（水族館で会場から言われたのと同じ）。
   */
  it('こうもりとまじょは、画面の外へ出てから戻る', () => {
    expect(leavesScreen('koumori', 90)).toBe(true)
    expect(leavesScreen('majo', 90)).toBe(true)
  })

  it('かぼちゃとゆうれいは、画面の中に留まる', () => {
    expect(leavesScreen('kabocha', 180)).toBe(false)
    expect(leavesScreen('yurei', 180)).toBe(false)
  })
})

describe('ハロウィン: フランケンの歩きは変えていない', () => {
  it('歩く絵のまま（`steer` を通らない）', () => {
    for (let seed = 0; seed < 20; seed++) {
      expect(spawn('franken', seed).kind).toBe('walk')
    }
  })
})
