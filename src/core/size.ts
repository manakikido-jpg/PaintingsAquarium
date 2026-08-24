import type { Tank } from './swim'

/**
 * 絵の大きさ。
 *
 * 画面幅に対する割合で決める。ピクセルで固定すると、
 * 会場の大画面では豆粒に、手元の画面では画面を埋め尽くす（R-015）。
 */

/** 泳ぐ絵の基準（画面幅に対する割合）。 */
export const FISH_SIZE_RATIO = 0.07
/**
 * 歩く絵の基準。
 *
 * 泳ぐ絵（0.07）より大きい。歩く絵は**地面の列に乗る**ので奥ほど縮み、
 * さらに恐竜テーマの背景は大きな岩と木が並ぶ。同じ 0.07 にすると、
 * 子どもの絵が背景の草と同じ大きさになって主役に見えない。
 *
 * 0.085 から上げた（本人の指摘）。実際に並べて見くらべ、
 * 背景の木と同じくらいに見える 0.12 にした。
 * 飛ぶ絵（プテラノドン）にもこちらを使う（`motion.ts`）。
 */
export const WALKER_SIZE_RATIO = 0.12

/** 設定で変えられる倍率の範囲。 */
export const MIN_SIZE_SCALE = 0.5
export const MAX_SIZE_SCALE = 2
export const DEFAULT_SIZE_SCALE = 1

/**
 * 絵の長辺の目安を出す。
 *
 * 上限を掛けているのは、**倍率を上げきったときに絵が画面からはみ出さない**ため。
 * 泳ぐ範囲は画面の内側に収める作りなので、絵が画面より大きいと
 * 泳ぐ場所が無くなって画面の真ん中で止まってしまう。
 */
export function creatureSize(tank: Tank, ratio: number, scale: number): number {
  const clamped = Math.min(MAX_SIZE_SCALE, Math.max(MIN_SIZE_SCALE, scale))
  const wanted = tank.width * ratio * clamped
  // 画面の短いほうの 4 割まで。これ以上は泳ぐ余地が無くなる
  return Math.min(wanted, Math.min(tank.width, tank.height) * 0.4)
}
