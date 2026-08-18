import {
  creatureSize,
  DEFAULT_SIZE_SCALE,
  FISH_SIZE_RATIO,
  WALKER_SIZE_RATIO,
} from './size'
import type { CreatureKind } from './rig'
import { isFishOutside, sendFishOut, facesRight, renderY, separateFish, spawnFish, stepFish, type Fish, type Tank } from './swim'
import {
  isWalkerOutside,
  sendWalkerOut,
  separateWalkers,
  spawnWalker,
  stepWalker,
  walkerY,
  type Lane,
  type Walker,
} from './walk'
import type { MotionKind } from './theme'
import { steer, type Prey } from './behaviour'
import type { SpeciesId } from './templates'

/**
 * テーマごとに違う動きを、画面側から同じ扱いにするための層。
 *
 * ここが無いと `Aquarium.tsx` の描画ループが動きの種類ごとに分岐だらけになり、
 * テーマを足すたびに描画側を触ることになる。
 */

export type Creature =
  | { readonly kind: 'float'; readonly fish: Fish }
  | { readonly kind: 'walk'; readonly walker: Walker }

/** 描画に必要なものだけを取り出した形。 */
export interface Placement {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly facingRight: boolean
  /**
   * 進んでいる向き（ラジアン。0 が右、下が +）。
   * 上から見た絵（ウミガメ）を、進む向きへ回して描くために使う。
   */
  readonly heading: number
}

/** 浮遊系は列を持たないので、常に 0 番の列にいる扱いにする。 */
export function creatureLane(creature: Creature): number {
  return creature.kind === 'walk' ? creature.walker.lane : 0
}

export function spawnCreature(
  motion: MotionKind,
  seed: number,
  tank: Tank,
  imageWidth: number,
  imageHeight: number,
  lanes: readonly Lane[],
  sizeScale = DEFAULT_SIZE_SCALE,
  kind: CreatureKind = 'unknown',
  species?: SpeciesId,
): Creature {
  if (motion === 'walk') {
    return {
      kind: 'walk',
      walker: spawnWalker(seed, tank, lanes, imageWidth, imageHeight, {
        targetSize: creatureSize(tank, WALKER_SIZE_RATIO, sizeScale),
      }),
    }
  }

  // flutter / rise はまだ未実装。浮遊で代用する（テーマ側が ready: false なので選べない）。
  /*
   * タコ・イカ・クラゲは魚のようには進まない。
   * 水を押して進む生き物なので、速さは魚の半分ほどにして漂わせる。
   * 魚と同じ速さで走らせると、足を引きずって滑っているように見える。
   */
  const drifts = kind === 'tentacled'

  /*
   * 魚・イルカ・サメは、画面の端で跳ね返らずに**外へ出てから向きを変える**。
   * 端で跳ね返ると水槽のガラスに当たったように見える（会場からの指摘）。
   * 上から見た生き物（タコ・クラゲ・ウミガメ）は画面内で折り返す。
   */
  const swimsAcross = species === 'fish' || species === 'iruka' || species === 'same'

  return {
    kind: 'float',
    fish: spawnFish(seed, tank, imageWidth, imageHeight, {
      targetSize: creatureSize(tank, FISH_SIZE_RATIO, sizeScale),
      ...(drifts ? { minSpeed: 12, maxSpeed: 38 } : {}),
      species,
      wall: swimsAcross || species === undefined ? 'turnOutside' : 'bounce',
    }),
  }
}

/**
 * 1 フレーム進める。避け合いも含める。
 * 避け合いは種類ごとに仕組みが違うので、まとめて渡してここで振り分ける。
 */
export function stepCreatures(
  creatures: readonly Creature[],
  dtSeconds: number,
  tank: Tank,
): Creature[] {
  const floats: Fish[] = []
  const walkers: Walker[] = []
  for (const creature of creatures) {
    if (creature.kind === 'float') floats.push(creature.fish)
    else walkers.push(creature.walker)
  }

  /*
   * サメが追う相手。魚と、台紙に一致しなかった絵（自由画）を相手にする。
   * サメどうしは追わない。
   */
  const prey: Prey[] = floats
    .filter((fish) => fish.species === 'fish' || fish.species === undefined)
    .map((fish) => ({ x: fish.x, y: fish.y }))

  const steppedFloats = separateFish(floats, dtSeconds)
    .map((fish) => steer(fish, tank, prey))
    .map((fish) => stepFish(fish, dtSeconds, tank))
  const steppedWalkers = separateWalkers(walkers).map((walker) => stepWalker(walker, dtSeconds, tank))

  let floatIndex = 0
  let walkIndex = 0
  return creatures.map((creature) =>
    creature.kind === 'float'
      ? { kind: 'float' as const, fish: steppedFloats[floatIndex++] }
      : { kind: 'walk' as const, walker: steppedWalkers[walkIndex++] },
  )
}

export function placeCreature(creature: Creature, lanes: readonly Lane[]): Placement {
  if (creature.kind === 'walk') {
    const { walker } = creature
    return {
      x: walker.x,
      y: walkerY(walker, lanes),
      width: walker.width,
      height: walker.height,
      facingRight: walker.vx >= 0,
      heading: walker.vx >= 0 ? 0 : Math.PI,
    }
  }

  const { fish } = creature
  return {
    x: fish.x,
    y: renderY(fish),
    width: fish.width,
    height: fish.height,
    facingRight: facesRight(fish),
    heading: Math.atan2(fish.vy, fish.vx),
  }
}

/**
 * 画面の外へ去らせる。
 *
 * 同時に泳ぐ数を超えた絵を、その場で消さずに**泳いで（歩いて）出て行かせる**。
 * 薄くして消す案もあったが、水槽の中の出来事として一番自然なのは
 * 「画面の外へ行った」であって、「その場で透明になった」ではない。
 */
export function sendCreatureOut(creature: Creature, tank: Tank): Creature {
  return creature.kind === 'walk'
    ? { kind: 'walk', walker: sendWalkerOut(creature.walker, tank) }
    : { kind: 'float', fish: sendFishOut(creature.fish, tank) }
}

/** 完全に画面の外へ出たか。ここで初めて取り除く。 */
export function isCreatureOutside(creature: Creature, tank: Tank): boolean {
  return creature.kind === 'walk'
    ? isWalkerOutside(creature.walker, tank)
    : isFishOutside(creature.fish, tank)
}
