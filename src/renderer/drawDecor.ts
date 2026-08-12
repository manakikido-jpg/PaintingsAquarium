import {
  rockOutline,
  seaweedShape,
  type Point,
  type Rock,
  type Seaweed,
} from '../core/decor'
import type { Tank } from '../core/swim'

/**
 * 底の飾りの描き方。
 *
 * 全部**暗いシルエット**で描く。色を付けると子どもの絵と派手さで喧嘩し、
 * 何が主役か分からない画面になる。奥行きは色ではなく「濃さ」で出す。
 * 呼び出し側は必ず**絵より先に**呼ぶこと（手前に置くと絵が隠れる）。
 */

const SILHOUETTE = '2, 26, 38'

/** 砂地の高さの列から、指定 X での高さを線形に求める。 */
export function groundAt(profile: readonly number[], x: number, tank: Tank): number {
  if (profile.length === 0) return tank.height
  if (profile.length === 1) return profile[0]

  const position = (x / Math.max(1, tank.width)) * (profile.length - 1)
  const index = Math.max(0, Math.min(profile.length - 2, Math.floor(position)))
  const fraction = Math.max(0, Math.min(1, position - index))
  return profile[index] * (1 - fraction) + profile[index + 1] * fraction
}

/** 砂地。上端をぼかして水に溶かす。線でくっきり切ると床のタイルに見える。 */
export function drawSand(
  context: CanvasRenderingContext2D,
  profile: readonly number[],
  tank: Tank,
  strength: number,
): void {
  if (strength <= 0 || profile.length === 0) return

  const top = Math.min(...profile)
  const gradient = context.createLinearGradient(0, top, 0, tank.height)
  gradient.addColorStop(0, `rgba(${SILHOUETTE}, ${0.35 * strength})`)
  gradient.addColorStop(0.35, `rgba(${SILHOUETTE}, ${0.7 * strength})`)
  gradient.addColorStop(1, `rgba(${SILHOUETTE}, ${0.92 * strength})`)

  context.fillStyle = gradient
  context.beginPath()
  context.moveTo(0, tank.height)
  for (let index = 0; index < profile.length; index++) {
    const x = (index / Math.max(1, profile.length - 1)) * tank.width
    context.lineTo(x, profile[index])
  }
  context.lineTo(tank.width, tank.height)
  context.closePath()
  context.fill()
}

function fillPolygon(context: CanvasRenderingContext2D, points: readonly Point[]): void {
  if (points.length === 0) return
  context.beginPath()
  context.moveTo(points[0].x, points[0].y)
  for (let index = 1; index < points.length; index++) {
    context.lineTo(points[index].x, points[index].y)
  }
  context.closePath()
  context.fill()
}

export function drawRocks(
  context: CanvasRenderingContext2D,
  rocks: readonly Rock[],
  profile: readonly number[],
  tank: Tank,
  strength: number,
): void {
  if (strength <= 0) return

  // 奥の岩から先に描く。手前の岩が奥に隠れると重なりがおかしく見える。
  for (const rock of [...rocks].sort((a, b) => a.depth - b.depth)) {
    context.fillStyle = `rgba(${SILHOUETTE}, ${(0.45 + rock.depth * 0.45) * strength})`
    // 少し砂に埋める。砂の線にちょうど乗せると置物のように浮いて見える。
    fillPolygon(context, rockOutline(rock, groundAt(profile, rock.x, tank) + rock.height * 0.08))
  }
}

export function drawSeaweed(
  context: CanvasRenderingContext2D,
  weeds: readonly Seaweed[],
  profile: readonly number[],
  tank: Tank,
  timeSeconds: number,
  strength: number,
): void {
  if (strength <= 0) return

  for (const weed of [...weeds].sort((a, b) => a.depth - b.depth)) {
    const nodes = seaweedShape(weed, timeSeconds, groundAt(profile, weed.baseX, tank) + 2)
    if (nodes.length === 0) continue

    context.fillStyle = `rgba(${SILHOUETTE}, ${(0.4 + weed.depth * 0.45) * strength})`

    // 節の列を、左側を上りながら・右側を下りながら 1 つの形にする。
    context.beginPath()
    context.moveTo(nodes[0].x - nodes[0].halfWidth, nodes[0].y)
    for (const node of nodes) context.lineTo(node.x - node.halfWidth, node.y)
    for (let index = nodes.length - 1; index >= 0; index--) {
      context.lineTo(nodes[index].x + nodes[index].halfWidth, nodes[index].y)
    }
    context.closePath()
    context.fill()
  }
}
