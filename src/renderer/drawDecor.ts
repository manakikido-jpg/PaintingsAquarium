import {
  rockOutline,
  seaweedShape,
  shellOutline,
  shellRidges,
  shipwreckHull,
  shipwreckMasts,
  type Point,
  type Rock,
  type Seaweed,
  type Shell,
  type Shipwreck,
} from '../core/decor'
import type { Tank } from '../core/swim'

/**
 * 底の飾りの描き方。
 *
 * 全部**暗いシルエット**で描く。色を付けると子どもの絵と派手さで喧嘩し、
 * 何が主役か分からない画面になる。奥行きは色ではなく「濃さ」で出す。
 * 呼び出し側は必ず**絵より先に**呼ぶこと（手前に置くと絵が隠れる）。
 */

/*
 * 色の決め方。ここを外すと飾りが「見えない」ので、理由を残しておく。
 *
 * 最初は砂も岩も船も同じ暗い色で描いていたが、画面の下は水の色自体が暗いため、
 * **暗いシルエットが背景と同化して船体が完全に消えた**（R-006）。
 *
 * 本物の水槽と同じ関係にする。砂は**上から光が当たって明るい**。
 * その上に乗る岩・海藻・貝・沈没船は、砂を背にした**暗い影絵**になる。
 * 暗い物を見せたいなら、その背後を明るくするしかない。
 */
const SAND = '104, 142, 160'
const SILHOUETTE = '0, 8, 14'
const ON_SAND_MIN_ALPHA = 0.72

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
  // 上端は水に溶かし、下へ行くほど明るくする。手前ほど光が届いている見立て。
  gradient.addColorStop(0, `rgba(${SAND}, ${0.05 * strength})`)
  gradient.addColorStop(0.4, `rgba(${SAND}, ${0.16 * strength})`)
  gradient.addColorStop(1, `rgba(${SAND}, ${0.32 * strength})`)

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
    context.fillStyle = `rgba(${SILHOUETTE}, ${(ON_SAND_MIN_ALPHA + rock.depth * 0.22) * strength})`
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

    context.fillStyle = `rgba(${SILHOUETTE}, ${(ON_SAND_MIN_ALPHA + weed.depth * 0.22) * strength})`

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

/**
 * 沈没船。一番奥に、薄く置く。
 * 濃く描くと画面の主役になってしまい、子どもの絵が背景に見える。
 */
export function drawShipwreck(
  context: CanvasRenderingContext2D,
  wreck: Shipwreck,
  profile: readonly number[],
  tank: Tank,
  strength: number,
): void {
  if (strength <= 0) return

  const groundY = groundAt(profile, wreck.x, tank)
  context.save()
  // 手前の岩や海藻より薄くする。同じ濃さだと重なった部分の輪郭が消え、
  // 船と海藻がひと続きの黒い塊になる（R-006）。
  context.fillStyle = `rgba(${SILHOUETTE}, ${0.62 * strength})`
  context.strokeStyle = `rgba(${SILHOUETTE}, ${0.62 * strength})`
  context.lineCap = 'round'

  for (const mast of shipwreckMasts(wreck, groundY)) {
    context.lineWidth = mast.width
    context.beginPath()
    context.moveTo(mast.from.x, mast.from.y)
    context.lineTo(mast.to.x, mast.to.y)
    context.stroke()
  }

  fillPolygon(context, shipwreckHull(wreck, groundY))
  context.restore()
}

/** 貝殻。扇の筋は水の色で描いて、彫りが入っているように見せる。 */
export function drawShells(
  context: CanvasRenderingContext2D,
  shells: readonly Shell[],
  profile: readonly number[],
  tank: Tank,
  strength: number,
): void {
  if (strength <= 0) return

  context.save()
  for (const shell of [...shells].sort((a, b) => a.depth - b.depth)) {
    const groundY = groundAt(profile, shell.x, tank)

    context.fillStyle = `rgba(${SILHOUETTE}, ${(ON_SAND_MIN_ALPHA + shell.depth * 0.22) * strength})`
    fillPolygon(context, shellOutline(shell, groundY))

    // 筋は塗りを削る形で入れる。線を上から足すと、貝の外へはみ出て見える。
    context.save()
    context.globalCompositeOperation = 'destination-out'
    context.strokeStyle = `rgba(0, 0, 0, ${0.35 * strength})`
    context.lineWidth = Math.max(0.7, shell.halfWidth * 0.05)
    for (const ridge of shellRidges(shell, groundY)) {
      context.beginPath()
      context.moveTo(ridge.from.x, ridge.from.y)
      context.lineTo(ridge.to.x, ridge.to.y)
      context.stroke()
    }
    context.restore()
  }
  context.restore()
}
