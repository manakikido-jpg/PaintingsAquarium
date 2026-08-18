import {
  creatureSize,
  DEFAULT_SIZE_SCALE,
  FISH_SIZE_RATIO,
  WALKER_SIZE_RATIO,
} from './size'
import { facesRight, renderY, separateFish, spawnFish, stepFish, type Fish, type Tank } from './swim'
import { separateWalkers, spawnWalker, stepWalker, walkerY, type Lane, type Walker } from './walk'
import type { MotionKind } from './theme'

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
  return {
    kind: 'float',
    fish: spawnFish(seed, tank, imageWidth, imageHeight, {
      targetSize: creatureSize(tank, FISH_SIZE_RATIO, sizeScale),
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

  const steppedFloats = separateFish(floats, dtSeconds).map((fish) => stepFish(fish, dtSeconds, tank))
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
    }
  }

  const { fish } = creature
  return {
    x: fish.x,
    y: renderY(fish),
    width: fish.width,
    height: fish.height,
    facingRight: facesRight(fish),
  }
}
