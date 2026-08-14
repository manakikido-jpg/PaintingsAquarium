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

  /** 絵より奥のすべて（空・水・光・遠景） */
  drawBehind(context: CanvasRenderingContext2D, elapsed: number, strength: number): void
  /** `index` 番の列の地面。列が無いテーマでは呼ばれない */
  drawLane(context: CanvasRenderingContext2D, index: number, elapsed: number, strength: number): void
  /**
   * 絵1枚を描く直前に呼ばれる。地面に立つテーマで足元の影を落とすため。
   * 影が要らないテーマは持たなくてよい。
   */
  drawShadow?(
    context: CanvasRenderingContext2D,
    place: Placement,
    laneIndex: number,
    strength: number,
  ): void
  /** 絵より手前のすべて（手前の泡・霧） */
  drawFront(context: CanvasRenderingContext2D, elapsed: number, strength: number): void
}

export type SceneFactory = (tank: Tank) => Scene
