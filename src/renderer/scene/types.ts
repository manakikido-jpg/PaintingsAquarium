import type { Lane } from '../../core/walk'
import type { MotionKind } from '../../core/theme'
import type { Tank } from '../../core/swim'
import type { Placement } from '../../core/motion'

/**
 * テーマ1つぶんの「世界」。
 *
 * 描画ループ（`Aquarium.tsx`）はテーマの中身を知らない。
 * ここに揃えておかないと、テーマを足すたびに描画ループへ分岐が増える。
 */
export interface Scene {
  readonly motion: MotionKind
  /**
   * 奥行きの列。空なら単層（絵は全部まとめて描く）。
   * 列がある場合、描画ループは「奥の地面 → その列の絵 → 次の地面 → …」の順に呼ぶ。
   * こうしないと、手前の地面が奥の絵の上に描かれて足が埋まる。
   */
  readonly lanes: Lane[]
  /**
   * 列ごとに地面を描かないテーマ（背景が1枚の絵・ハロウィン）。
   *
   * `true` なら、描画ループは**列で分けずに、足元の低い順（奥から手前）**に
   * 絵を描く。`drawLane` は呼ばない。
   *
   * **これが無いと、列を増やしたとたんに重なり順が崩れる。**
   * 列で分けて描く順番は「0番の列 → 1番の列 → …」で、
   * ただよう絵は全部 0番の列にいる扱いなので（`creatureLane`）、
   * **空のおばけが、手前の地面にいる絵より先に描かれる**。
   * 地面を描き分けるテーマ（恐竜）はこの順番が要るが、
   * 背景が1枚の絵なら足元の高さで並べるほうが素直で、正しい。
   */
  readonly drawsFlat?: boolean

  /** 絵より奥のすべて（空・水・光・遠景） */
  drawBehind(context: CanvasRenderingContext2D, elapsed: number, strength: number): void
  /** `index` 番の列の地面。列が無いテーマでは呼ばれない */
  drawLane(context: CanvasRenderingContext2D, index: number, elapsed: number, strength: number): void
  /**
   * 絵1枚を描く直前に、その絵の位置で呼ばれる。
   * 陸なら足元の影、水中なら絵の後ろの光。要らないテーマは持たなくてよい。
   */
  drawBeneath?(
    context: CanvasRenderingContext2D,
    place: Placement,
    laneIndex: number,
    strength: number,
  ): void
  /** 絵より手前のすべて（手前の泡・霧） */
  drawFront(context: CanvasRenderingContext2D, elapsed: number, strength: number): void
}

export type SceneFactory = (tank: Tank) => Scene
