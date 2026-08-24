import { describe, expect, it } from 'vitest'
import { spawnFish, stepFish, type Fish, type Tank } from '../swim'
import {
  FLAP_SQUASH,
  GLIDE_TILT,
  IRUKA_GAP,
  IRUKA_JUMP_SECONDS,
  IRUKA_TOP,
  flapSquash,
  flapStretch,
  glideTilt,
  isJumping,
  jumpLift,
  steer,
  type Prey,
} from '../behaviour'
import { spawnCreature, stepCreatures } from '../motion'
import type { CreatureKind } from '../rig'
import { speciesFlies, type SpeciesId } from '../templates'

const tank: Tank = { width: 1600, height: 900 }

function creature(species: SpeciesId | undefined, overrides: Partial<Fish> = {}): Fish {
  return spawnFish(7, tank, 200, 120, { species, wall: species === 'fish' ? 'turnOutside' : 'bounce' }) &&
    {
      ...spawnFish(7, tank, 200, 120, { species }),
      x: 800,
      y: 450,
      vx: 60,
      vy: 0,
      width: 160,
      height: 100,
      age: 0,
      baseSpeed: 60,
      ...overrides,
    }
}

/** 何秒か動かして、通った場所を返す。 */
function run(fish: Fish, seconds: number, prey: readonly Prey[] = [], dt = 1 / 60): Fish[] {
  const path: Fish[] = []
  let current = fish
  for (let step = 0; step < Math.round(seconds / dt); step++) {
    current = stepFish(steer(current, tank, prey), dt, tank)
    path.push(current)
  }
  return path
}

describe('魚', () => {
  it('画面の外へ出てから向きを変えて戻ってくる', () => {
    const fish = creature('fish', { x: tank.width - 100, vx: 200, wall: 'turnOutside' })
    const path = run(fish, 20)
    // 画面の外まで出る
    expect(Math.max(...path.map((one) => one.x))).toBeGreaterThan(tank.width)
    // そのあと向きを変えて、画面の中に戻ってくる
    const turned = path.findIndex((one) => one.vx < 0)
    expect(turned).toBeGreaterThan(0)
    expect(path.slice(turned).some((one) => one.x < tank.width * 0.5)).toBe(true)
  })

  it('端で跳ね返る設定なら、画面の中に留まる', () => {
    const fish = creature('fish', { x: tank.width - 100, vx: 200, wall: 'bounce' })
    const path = run(fish, 20)
    expect(Math.max(...path.map((one) => one.x))).toBeLessThanOrEqual(tank.width)
  })
})

describe('タコ', () => {
  it('上下に上がり下がりしながら、横へ進む', () => {
    const path = run(creature('tako', { vy: 0 }), 12)
    const ys = path.map((one) => one.y)
    const rise = Math.max(...ys) - Math.min(...ys)
    // 画面の高さの1割以上、上下する
    expect(rise).toBeGreaterThan(tank.height * 0.1)
    // 横にも進んでいる
    expect(Math.abs(path[path.length - 1].x - 800)).toBeGreaterThan(100)
  })
})

describe('クラゲ', () => {
  it('ふわふわ上下する', () => {
    // 速さは取り込み時に種類から決まる（`CROSS_SECONDS`）ので、ここでは上下だけ見る
    const jelly = run(creature('kurage', { vx: 12, vy: 0 }), 12)
    const ys = jelly.map((one) => one.y)
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(10)
  })
})

describe('ウミガメ', () => {
  it('横へ進みながら、上下が入れ替わる（S字）', () => {
    const path = run(creature('umigame', { vy: 0 }), 20)
    const ys = path.map((one) => one.y)
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(tank.height * 0.15)
    // 上下の向きが2回以上入れ替わる＝S字になっている
    let flips = 0
    for (let index = 1; index < path.length; index++) {
      if (Math.sign(path[index].vy) !== Math.sign(path[index - 1].vy)) flips++
    }
    expect(flips).toBeGreaterThanOrEqual(2)
  })
})

describe('イルカ', () => {
  it('跳ねる高さは、上がって下りる山の形', () => {
    expect(jumpLift(0)).toBe(0)
    expect(jumpLift(1)).toBe(0)
    expect(jumpLift(0.5)).toBeCloseTo(1)
    expect(jumpLift(0.25)).toBeLessThan(jumpLift(0.5))
  })

  it('決めた時刻が来たら跳ね、画面の上のほうまで届く', () => {
    const dolphin = creature('iruka', { y: 700, nextEventAt: 1 })
    const path = run(dolphin, IRUKA_GAP[0])
    const highest = Math.min(...path.map((one) => one.y))
    expect(highest).toBeLessThan(tank.height * (IRUKA_TOP + 0.12))
    // 跳ね終わったら元の高さのあたりに戻る
    expect(path[path.length - 1].y).toBeGreaterThan(tank.height * 0.3)
  })

  it('跳ねている間だけ「跳んでいる」と答える', () => {
    const dolphin = creature('iruka', { y: 700, nextEventAt: 0 })
    const started = steer(dolphin, tank)
    expect(isJumping(started)).toBe(true)
    expect(isJumping({ ...started, age: started.age + IRUKA_JUMP_SECONDS + 0.1 })).toBe(false)
  })

  it('跳ねる間隔は 20〜30 秒', () => {
    expect(IRUKA_GAP[0]).toBe(20)
    expect(IRUKA_GAP[1]).toBe(30)
  })
})

describe('サメ', () => {
  it('魚のほうへ向きを寄せる', () => {
    const shark = creature('same', { x: 200, y: 450, vx: 60, vy: 0 })
    const target: Prey[] = [{ x: 1400, y: 800 }]
    const path = run(shark, 6, target)
    // 下（相手のいる側）へ向かっている
    expect(path[path.length - 1].y).toBeGreaterThan(450)
  })

  it('近づきすぎたら離れる（追いつかない）', () => {
    const shark = creature('same', { x: 800, y: 450, vx: 60, vy: 0 })
    const target: Prey[] = [{ x: 820, y: 450 }]
    const path = run(shark, 4, target)
    const distances = path.map((one) => Math.hypot(one.x - 820, one.y - 450))
    // 重ならない。最初より離れている
    expect(distances[distances.length - 1]).toBeGreaterThan(distances[0])
    expect(distances[distances.length - 1]).toBeGreaterThan(shark.width * 0.5)
  })

  it('速さが変わる', () => {
    const shark = creature('same', { x: 800, y: 450, vx: 60, vy: 0 })
    const path = run(shark, 12, [{ x: 1500, y: 450 }])
    const speeds = path.map((one) => Math.hypot(one.vx, one.vy))
    expect(Math.max(...speeds) / Math.max(1, Math.min(...speeds))).toBeGreaterThan(1.5)
  })

  it('追う相手がいなくても止まらない', () => {
    const shark = creature('same', { x: 800, y: 450, vx: 60, vy: 0 })
    const path = run(shark, 6, [])
    expect(Math.abs(path[path.length - 1].x - 800)).toBeGreaterThan(50)
  })
})

describe('台紙に一致しなかった絵', () => {
  it('今までどおりの泳ぎ（速度をいじらない）', () => {
    const free = creature(undefined, { vx: 60, vy: 20 })
    const next = steer(free, tank)
    expect(next.vx).toBe(free.vx)
    expect(next.vy).toBe(free.vy)
  })
})

describe('飛ぶ絵の羽ばたき', () => {
  it('縮み幅は決めた範囲に収まる', () => {
    let low = 1
    let high = 1
    for (let step = 0; step < 200; step++) {
      const value = flapSquash((step / 200) * Math.PI * 4)
      low = Math.min(low, value)
      high = Math.max(high, value)
    }
    expect(low).toBeCloseTo(1 - FLAP_SQUASH, 3)
    expect(high).toBeCloseTo(1 + FLAP_SQUASH, 3)
  })

  /*
   * 縦に縮んだときは横へ広がること。縦だけ動かすと**息をしている**ように見える。
   */
  it('縦と横が逆に動く', () => {
    for (const time of [0.4, 1.2, 2.9, 4.7]) {
      const vertical = flapSquash(time) - 1
      const horizontal = flapStretch(time) - 1
      expect(Math.sign(vertical)).toBe(-Math.sign(horizontal))
      expect(Math.abs(horizontal)).toBeLessThan(Math.abs(vertical))
    }
  })

  /*
   * 倍率が 0 以下になると絵が反転して、裏向きのプテラノドンが飛ぶ。
   */
  it('倍率が 0 以下にならない', () => {
    for (let step = 0; step < 200; step++) {
      expect(flapSquash(step * 0.37)).toBeGreaterThan(0.5)
      expect(flapStretch(step * 0.37)).toBeGreaterThan(0.5)
    }
  })

  it('傾きは羽ばたきより遅く、幅も小さい', () => {
    expect(GLIDE_TILT).toBeLessThan(0.1)
    // 半分の速さ（周期が倍）。羽ばたきと同じ速さだと、はためきに見える
    expect(glideTilt(Math.PI)).toBeCloseTo(GLIDE_TILT, 5)
    expect(flapSquash(Math.PI)).toBeCloseTo(1, 5)
  })
})

describe('飛ぶ絵は空から降りてこない', () => {
  it('プテラノドンだけが飛ぶ', () => {
    expect(speciesFlies('pteranodon')).toBe(true)
    for (const id of ['ankylosaurus', 'brontosaurus', 'stegosaurus', 'triceratops', 'fish'] as const) {
      expect(speciesFlies(id)).toBe(false)
    }
    // 台紙に一致しなかった絵は歩く
    expect(speciesFlies(undefined)).toBe(false)
  })

  it('長く飛ばしても地平線より下へ行かない', () => {
    const tank = { width: 1600, height: 900 }
    const sky = 900 * 0.63
    let creature = spawnCreature('walk', 4242, tank, 300, 160, [], 1, 'fish', 'pteranodon', sky)
    expect(creature.kind).toBe('float')
    for (let step = 0; step < 4000; step++) {
      creature = stepCreatures([creature], 1 / 30, tank, sky)[0]
      if (creature.kind !== 'float') throw new Error('飛ぶ絵が歩きに変わった')
      // 絵の中心が空の中に収まっている
      expect(creature.fish.y).toBeLessThanOrEqual(sky)
      expect(creature.fish.y).toBeGreaterThanOrEqual(0)
    }
  })
})

/*
 * **避け合いは、種類ごとの動きを通したあとでも効いていること。**
 *
 * ここを単体（`separateFish` だけ）で試していたので、
 * 実機でウミガメ2匹がくっついたまま泳いでいるのに気づけなかった。
 * タコ・ウミガメ・クラゲの動きは縦の速度を上書きするため、
 * 避けた結果が毎フレーム捨てられていた。
 */
describe('重なった絵が離れる（動きを通したあとで）', () => {
  const tank: Tank = { width: 1600, height: 900 }

  const overlapped = (species: SpeciesId, kind: CreatureKind) => {
    const one = spawnCreature('float', 11, tank, 300, 200, [], 1, kind, species)
    const two = spawnCreature('float', 12, tank, 300, 200, [], 1, kind, species)
    if (one.kind !== 'float' || two.kind !== 'float') throw new Error('浮遊で作れなかった')
    // ほぼ同じ場所に重ねて置く
    const middle = { x: tank.width / 2, y: tank.height / 2 }
    return [
      { kind: 'float' as const, fish: { ...one.fish, ...middle } },
      { kind: 'float' as const, fish: { ...two.fish, x: middle.x + 6, y: middle.y + 4 } },
    ]
  }

  const apart = (list: ReturnType<typeof overlapped>): number => {
    const [a, b] = list
    if (a.kind !== 'float' || b.kind !== 'float') return 0
    return Math.hypot(a.fish.x - b.fish.x, a.fish.y - b.fish.y)
  }

  for (const [species, kind] of [
    ['umigame', 'tentacled'],
    ['tako', 'tentacled'],
    ['kurage', 'tentacled'],
    ['fish', 'fish'],
  ] as const) {
    it(`${species} は重なったままにならない`, () => {
      let list = overlapped(species, kind)
      const started = apart(list)
      for (let step = 0; step < 20 * 30; step++) {
        list = stepCreatures(list, 1 / 30, tank) as typeof list
      }
      const ended = apart(list)
      // 体の大きさぶんは離れていること
      const size = list[0].kind === 'float' ? Math.max(list[0].fish.width, list[0].fish.height) : 0
      expect(ended, `${species}: ${started.toFixed(0)}px → ${ended.toFixed(0)}px`).toBeGreaterThan(size)
    })
  }
})
