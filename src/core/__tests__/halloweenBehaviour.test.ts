import { describe, expect, it } from 'vitest'
import { placeCreature, spawnCreature, stepCreatures, type Creature } from '../motion'
import {
  HALLOWEEN_BACK_RATIO,
  HALLOWEEN_LANES,
  HALLOWEEN_MIN_SCALE,
  makeLanes,
  type Lane,
} from '../walk'
import type { Tank } from '../swim'
import { SPECIES, SPECIES_IDS, rigForSpecies, speciesIsStiff, type SpeciesId } from '../templates'

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

describe('ハロウィン: 3種のただよいが、それぞれ違う道になる', () => {
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

describe('ハロウィン: かぼちゃは浮かない', () => {
  /*
   * **「かぼちゃは浮かないでほしい」（本人・2026-10-15）。**
   *
   * それまでは画面の 46%〜78% の帯でふわふわ上下させていた。
   * 地面に下ろして、転がるように動かす。
   */
  const ground = (seed: number, seconds: number): { ys: number[]; xs: number[] } => {
    let creatures = [spawn('kabocha', seed)]
    const ys: number[] = []
    const xs: number[] = []
    for (let step = 0; step < seconds * FPS; step++) {
      creatures = stepCreatures(creatures, DT, TANK)
      const place = placeCreature(creatures[0], LANES)
      ys.push(place.y + place.height / 2)
      xs.push(place.x)
    }
    return { ys, xs }
  }

  it('歩く絵として生まれる', () => {
    for (let seed = 0; seed < 40; seed++) {
      expect(spawn('kabocha', seed).kind, `seed=${seed}`).toBe('walk')
    }
  })

  it('ジャンプしても地面の帯に戻り、地下へ潜らない（90秒）', () => {
    const line = LANES[0].groundY
    for (let seed = 0; seed < 12; seed++) {
      const { ys } = ground(seed, 90)
      /*
       * 地面の線ちょうどには揃わない（`groundOffset`・わざと散らしてある）。
       * ジャンプの頂点は絵の高さの半分。地面のずれも含めて6割まで。
       * 着地時は元の地面へ戻り、地面の帯から空の上半分へ抜けない。
       */
      expect(Math.min(...ys), `seed=${seed}`).toBeGreaterThan(line - 230 * 0.6)
      expect(Math.max(...ys), `seed=${seed}`).toBeLessThan(line + 230 * 0.2)
    }
  })

  it('画面の上半分へは行かない', () => {
    for (let seed = 0; seed < 12; seed++) {
      const { ys } = ground(seed, 90)
      expect(Math.min(...ys), `seed=${seed}`).toBeGreaterThan(TANK.height * 0.5)
    }
  })

  /*
   * **歩く絵の中でいちばん遅い。** フランケン（既定 22〜62px/秒）と
   * 同じ速さで転がすと、足のないかぼちゃが地面を滑って見える。
   */
  it('フランケンより遅く転がる', () => {
    for (let seed = 0; seed < 20; seed++) {
      const kabocha = spawn('kabocha', seed)
      const franken = spawn('franken', seed)
      if (kabocha.kind !== 'walk' || franken.kind !== 'walk') throw new Error('歩いていない')
      expect(Math.abs(kabocha.walker.vx), `seed=${seed}`).toBeLessThan(Math.abs(franken.walker.vx))
    }
  })

  it('1920px の画面で 10〜17px/秒（120〜180秒で横切る速さ）', () => {
    for (let seed = 0; seed < 20; seed++) {
      const kabocha = spawn('kabocha', seed)
      if (kabocha.kind !== 'walk') throw new Error('歩いていない')
      const speed = Math.abs(kabocha.walker.vx)
      expect(speed, `seed=${seed}`).toBeGreaterThanOrEqual(1920 / 180)
      expect(speed, `seed=${seed}`).toBeLessThanOrEqual(1920 / 120)
    }
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

describe('ハロウィン: 魚の動きを当てない', () => {
  /*
   * **「まだ魚みたいにゆらゆらしている」（本人・2026-10-14）。**
   *
   * 種類ごとの道を付けても、2つの「魚の動き」が全部の浮く絵に乗ったままだった。
   * 1つは胴のしなり（`undulate.ts`・描画側）、もう1つが共通の上下のゆらぎ
   *（`spawnFish` の `amplitude`・最大 20px × 1.2〜2.8rad/秒 ＝ 56px/秒）。
   * どちらも「胴をくねらせて水を押す」生き物のための動きで、
   * かぼちゃにも、おばけにも、こうもりにも理由が無い。
   */
  it('5種とも「体が硬い」印が付いている', () => {
    for (const id of SPECIES_IDS.filter((n) => SPECIES[n].theme === 'halloween')) {
      expect(speciesIsStiff(id), id).toBe(true)
    }
  })

  it('水族館と恐竜には付けていない（見え方を変えない）', () => {
    for (const id of SPECIES_IDS.filter((n) => SPECIES[n].theme !== 'halloween')) {
      expect(speciesIsStiff(id), id).toBe(false)
    }
  })

  it('共通の上下のゆらぎが乗らない（描画の Y と道の Y が一致する）', () => {
    // かぼちゃとフランケンは歩く絵なので、そもそもこのゆらぎを持たない
    for (const id of ['koumori', 'majo', 'yurei'] as SpeciesId[]) {
      let creatures = [spawn(id, 3)]
      for (let step = 0; step < 20 * FPS; step++) {
        creatures = stepCreatures(creatures, DT, TANK)
        const creature = creatures[0]
        if (creature.kind !== 'float') throw new Error(`${id} が歩いている`)
        expect(placeCreature(creature, LANES).y, id).toBeCloseTo(creature.fish.y, 6)
      }
    }
  })

  it('水族館の魚には、今までどおりゆらぎが乗る', () => {
    let creatures = [spawnCreature('float', 3, TANK, 420, 410, [], 1, 'fish', 'fish')]
    let swayed = false
    for (let step = 0; step < 20 * FPS; step++) {
      creatures = stepCreatures(creatures, DT, TANK)
      const creature = creatures[0]
      if (creature.kind !== 'float') throw new Error('魚が歩いている')
      if (Math.abs(placeCreature(creature, LANES).y - creature.fish.y) > 1) swayed = true
    }
    expect(swayed).toBe(true)
  })
})

describe('ハロウィン: 種類ごとの見た目の大きさ', () => {
  it('縦長のゆうれいを抑え、横長のフランケンは豆粒にしない', () => {
    const ghost = spawnCreature('float', 1, TANK, 650, 780, LANES, 1, 'unknown', 'yurei')
    const franken = spawnCreature('float', 1, TANK, 880, 590, LANES, 1, 'unknown', 'franken')
    const witch = spawnCreature('float', 1, TANK, 800, 720, LANES, 1, 'unknown', 'majo')
    if (ghost.kind !== 'float' || witch.kind !== 'float' || franken.kind !== 'walk') throw new Error('動きが違う')
    expect(ghost.fish.height).toBeLessThan(witch.fish.height)
    expect(franken.walker.height).toBeGreaterThan(ghost.fish.height * 0.85)
    expect(franken.walker.width).toBeLessThan(TANK.width * 0.15)
  })

  it('水族館の魚の大きさは変えていない', () => {
    const fish = spawnCreature('float', 1, TANK, 420, 410, [], 1, 'fish', 'fish')
    if (fish.kind !== 'float') throw new Error('魚が歩いている')
    // 泳ぐ絵の基準 0.07 × 画面幅 1920 ＝ 134.4px
    expect(Math.max(fish.fish.width, fish.fish.height)).toBeCloseTo(1920 * 0.07, 3)
  })
})

describe('横向きの台紙は、顔の向いているほうへ進む', () => {
  /*
   * **「魔女は顔の向いてる向きに飛んでください」（本人・2026-10-14）。**
   *
   * `rigForSpecies` が `headsRight: mirrored` と書かれていて、
   * 「台紙の頭は必ず左」という前提がコードに埋まっていた。
   * 横向きの台紙10枚のうち9枚は左向きなので長く気づかれず、
   * **右向きに描いてあるまじょだけ**、描画側が逆に反転していた。
   */
  it('台紙の頭の向きと、描画に渡す「頭が右か」が一致する', () => {
    for (const id of SPECIES_IDS.filter((n) => SPECIES[n].swimsSideways)) {
      const headsRight = SPECIES[id].head.x > 0
      expect(rigForSpecies(id, false).headsRight, `${id}（台紙のまま）`).toBe(headsRight)
      // 台紙に合わせて左右を裏返した絵は、頭の側も入れ替わる
      expect(rigForSpecies(id, true).headsRight, `${id}（反転して一致）`).toBe(!headsRight)
    }
  })

  it('まじょだけが右向きの台紙（ここが変わったら上のテストを見直す）', () => {
    const rightward = SPECIES_IDS.filter((n) => SPECIES[n].swimsSideways && SPECIES[n].head.x > 0)
    expect(rightward).toEqual(['majo'])
  })

  /*
   * 水族館・恐竜は全部が左向きの台紙なので、値は前と同じ（`mirrored` と一致）。
   * **R-072 のあと、既存テーマを変えないことは毎回ここで確かめる。**
   */
  it('水族館と恐竜の向きは変わっていない', () => {
    for (const id of SPECIES_IDS.filter((n) => SPECIES[n].theme !== 'halloween')) {
      for (const mirrored of [false, true]) {
        expect(rigForSpecies(id, mirrored).headsRight, `${id}/${mirrored}`).toBe(mirrored)
      }
    }
  })
})

describe('ハロウィン: 地面が混みすぎない', () => {
  /*
   * **かぼちゃを地面に下ろしたら、列1本では足りなくなった。**
   *
   * 歩く種類が1つ（フランケンだけ）のうちは足りていた。2つになると、
   * 会場の設定（同時50枚）で歩く絵が約20体になり、1本の線に並ぶ。
   * 実測（20体・60秒・重なった組の平均）: 1本 18.9／3本 4.5／4本 3.0／5本 3.5。
   * 重なると自分の絵を見つけられない（要件定義 §3 5c）。
   */
  const HALLOWEEN: Lane[] = makeLanes({ width: 1920, height: 1080 }, HALLOWEEN_LANES, {
    backRatio: HALLOWEEN_BACK_RATIO,
    frontRatio: 0.99,
    minScale: HALLOWEEN_MIN_SCALE,
    maxScale: 1,
  })

  /** 60秒動かして、同じ列で重なっていた組の平均を返す。 */
  function crowding(lanes: Lane[], walkers: number): number {
    let creatures = Array.from({ length: walkers }, (_, i) =>
      spawnCreature('float', i * 7 + 1, TANK, 420, 410, lanes, 1, 'unknown',
        i % 2 ? 'kabocha' : 'franken'),
    )
    let sum = 0
    let frames = 0
    for (let step = 0; step < 60 * 30; step++) {
      creatures = stepCreatures(creatures, 1 / 30, TANK)
      const placed = creatures.map((creature) => ({
        ...placeCreature(creature, lanes),
        lane: creature.kind === 'walk' ? creature.walker.lane : 0,
      }))
      for (let a = 0; a < placed.length; a++) {
        for (let b = a + 1; b < placed.length; b++) {
          if (placed[a].lane !== placed[b].lane) continue
          const limit = ((placed[a].width + placed[b].width) / 2) * 0.5
          if (Math.abs(placed[a].x - placed[b].x) < limit) sum++
        }
      }
      frames++
    }
    return sum / frames
  }

  it('会場の設定（歩く絵20体）で、重なった組が平均5組を超えない', () => {
    expect(crowding(HALLOWEEN, 20)).toBeLessThan(5)
  })

  it('列を1本に戻すと、同じ条件でひどく重なる（この列が効いている証拠）', () => {
    const single: Lane[] = [{ groundY: 1080 * 0.99, scale: 1, depth: 1 }]
    expect(crowding(single, 20)).toBeGreaterThan(10)
  })

  it('列は画面の下のほうだけを使う（城と村の上を歩かない）', () => {
    for (const lane of HALLOWEEN) {
      expect(lane.groundY).toBeGreaterThan(1080 * 0.8)
      expect(lane.groundY).toBeLessThanOrEqual(1080 * 0.99)
    }
  })

  it('奥の列ほど小さく、手前ほど大きい', () => {
    for (let i = 1; i < HALLOWEEN.length; i++) {
      expect(HALLOWEEN[i].scale).toBeGreaterThan(HALLOWEEN[i - 1].scale)
      expect(HALLOWEEN[i].groundY).toBeGreaterThan(HALLOWEEN[i - 1].groundY)
    }
  })
})
