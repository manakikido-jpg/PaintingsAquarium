import { DEFAULT_DINOSAUR_STYLE, type DinosaurStyle, type ThemeId } from '../../core/theme'
import type { Tank } from '../../core/swim'
import type { Scene } from './types'
import { createAquariumScene } from './aquariumScene'
import { createDinosaurScene } from './dinosaurScene'
import { createDinosaurSceneVivid } from './dinosaurSceneVivid'

/**
 * テーマから世界を作る。
 * まだ作っていないテーマ（宇宙・森・夜空）は水族館で代用する。
 * 設定画面では選べないようにしてあるので、通常は起きない。
 */
export function createScene(
  theme: ThemeId,
  tank: Tank,
  decorDensity = 1,
  dinosaurStyle: DinosaurStyle = DEFAULT_DINOSAUR_STYLE,
): Scene {
  switch (theme) {
    case 'dinosaur':
      return dinosaurStyle === 'vivid'
        ? createDinosaurSceneVivid(tank, decorDensity)
        : createDinosaurScene(tank, decorDensity)
    default:
      return createAquariumScene(tank, decorDensity)
  }
}
