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
 * 呼び出し側は必ず**絵より先に**呼ぶこと（手前に置くと絵が隠れる）。
 *
 * 色の決め方には経緯がある。
 *
 * まず全部を同じ暗い色で描いていたが、画面の下は水の色自体が暗いため、
 * **暗いシルエットが背景と同化して沈没船が消えた**（R-006）。
 * 砂を明るい敷物にし、その上に乗る物を暗い影絵にして直した。
 *
 * それでも**輪郭が硬く、全部が同じ濃さで、切り絵を並べたように安く見えた**（R-011）。
 * いまは次の3つで奥行きを作っている。
 *
 * 1. 遠い物ほど**薄く、水の色に寄せる**（空気遠近。水中では特に強く効く）
 * 2. 遠い物ほど**ぼかす**（`bake.ts` で焼き付けるので毎フレームの費用はかからない）
 * 3. 上面に**光の縁**を入れる。水面から光が来ていることが分かり、
 *    ただの黒い塗りが「立体の影」に変わる
 */

/** 1つの奥行きの層の見え方。 */
export interface DecorStyle {
  /** 本体の色 `r, g, b` */
  readonly body: string
  /** 上側の色 `r, g, b`。本体より少し明るく、水の色寄りにする */
  readonly lit: string
  /** 上面の光の縁の色（`rgba(...)` を丸ごと） */
  readonly rim: string
  /** 縁の太さ（ピクセル） */
  readonly rimWidth: number
  /** 本体の濃さ 0〜1 */
  readonly alpha: number
  /**
   * 輪郭のまわりに敷く薄い影の広がり（本体の大きさに対する倍率）。
   * 0 で無し。`filter: blur()` の代わりに輪郭の硬さを取るためのもの。
   */
  readonly halo: number
}

/** 手前（濃くはっきり）。 */
export const NEAR_STYLE: DecorStyle = {
  body: '0, 9, 15',
  lit: '36, 84, 110',
  rim: 'rgba(126, 206, 240, 0.5)',
  rimWidth: 1.8,
  alpha: 0.96,
  halo: 0.055,
}

/** 中景。 */
export const MID_STYLE: DecorStyle = {
  body: '6, 28, 42',
  lit: '34, 78, 102',
  rim: 'rgba(126, 206, 240, 0.32)',
  rimWidth: 1.5,
  alpha: 0.86,
  halo: 0.04,
}

/** 遠景（薄く、水の色に近い）。 */
export const FAR_STYLE: DecorStyle = {
  body: '22, 62, 86',
  lit: '46, 96, 124',
  rim: 'rgba(140, 212, 244, 0.18)',
  rimWidth: 1.2,
  alpha: 0.88,
  // 遠景は焼き付けるときに本物のぼかしを掛けるので、こちらは要らない
  halo: 0,
}

const SAND = '104, 142, 160'

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

function tracePolygon(context: CanvasRenderingContext2D, points: readonly Point[]): void {
  if (points.length === 0) return
  context.beginPath()
  context.moveTo(points[0].x, points[0].y)
  for (let index = 1; index < points.length; index++) {
    context.lineTo(points[index].x, points[index].y)
  }
  context.closePath()
}

/**
 * 影絵を1つ描く。
 *
 * 塗りは**単色にしない**。上から下へのグラデーションにしてある。
 * 単色で塗ると、どれだけ形を作り込んでも**紙を切り抜いて貼ったよう**にしか
 * 見えない（R-011）。上側だけわずかに水の色を混ぜると、
 * 水面から光が回り込んでいるように見え、同じ形が立体になる。
 *
 * さらに、塗る前に少し上へずらした同じ形を薄い色で塗っている。
 * はみ出したぶんが上面の縁として残る。
 * 全周に輪郭線を引く方法だと、下側まで光ってかえって作り物に見える。
 */
function paintSilhouette(
  context: CanvasRenderingContext2D,
  points: readonly Point[],
  style: DecorStyle,
  strength: number,
  shade = 1,
): void {
  if (points.length === 0) return

  let top = points[0].y
  let bottom = points[0].y
  for (const point of points) {
    if (point.y < top) top = point.y
    if (point.y > bottom) bottom = point.y
  }

  /*
   * 輪郭の外側に、同じ形をひと回り大きくして薄く敷く。
   * 縁がすっぱり切れているのが「切り絵っぽさ」の正体なので、
   * 外へ向かって少し滲ませるだけで印象が変わる。
   * 本物のぼかしのほうが綺麗だが、毎フレームでは使えない（R-012）。
   */
  if (style.halo > 0) {
    let left = points[0].x
    let right = points[0].x
    for (const point of points) {
      if (point.x < left) left = point.x
      if (point.x > right) right = point.x
    }
    const centreX = (left + right) / 2
    const grow = 1 + style.halo

    context.save()
    context.translate(centreX, bottom)
    context.scale(grow, grow)
    context.translate(-centreX, -bottom)
    context.fillStyle = `rgba(${style.body}, ${style.alpha * shade * strength * 0.3})`
    tracePolygon(context, points)
    context.fill()
    context.restore()
  }

  context.save()
  context.fillStyle = style.rim
  context.translate(0, -style.rimWidth)
  tracePolygon(context, points)
  context.fill()
  context.restore()

  const alpha = style.alpha * shade * strength
  if (bottom - top < 1) {
    context.fillStyle = `rgba(${style.body}, ${alpha})`
  } else {
    const shading = context.createLinearGradient(0, top, 0, bottom)
    shading.addColorStop(0, `rgba(${style.lit}, ${alpha})`)
    shading.addColorStop(0.55, `rgba(${style.body}, ${alpha})`)
    shading.addColorStop(1, `rgba(${style.body}, ${alpha})`)
    context.fillStyle = shading
  }

  tracePolygon(context, points)
  context.fill()
}

export function drawRocks(
  context: CanvasRenderingContext2D,
  rocks: readonly Rock[],
  profile: readonly number[],
  tank: Tank,
  strength: number,
  style: DecorStyle = NEAR_STYLE,
): void {
  if (strength <= 0) return

  // 奥の岩から先に描く。手前の岩が奥に隠れると重なりがおかしく見える。
  for (const rock of [...rocks].sort((a, b) => a.depth - b.depth)) {
    // 少し砂に埋める。砂の線にちょうど乗せると置物のように浮いて見える。
    const outline = rockOutline(rock, groundAt(profile, rock.x, tank) + rock.height * 0.08)
    paintSilhouette(context, outline, style, strength, 0.85 + rock.depth * 0.15)
  }
}

export function drawSeaweed(
  context: CanvasRenderingContext2D,
  weeds: readonly Seaweed[],
  profile: readonly number[],
  tank: Tank,
  timeSeconds: number,
  strength: number,
  style: DecorStyle = NEAR_STYLE,
): void {
  if (strength <= 0) return

  for (const weed of [...weeds].sort((a, b) => a.depth - b.depth)) {
    const nodes = seaweedShape(weed, timeSeconds, groundAt(profile, weed.baseX, tank) + 2)
    if (nodes.length === 0) continue

    // 節の列を、左側を上りながら・右側を下りながら 1 つの形にする。
    const points: Point[] = []
    for (const node of nodes) points.push({ x: node.x - node.halfWidth, y: node.y })
    for (let index = nodes.length - 1; index >= 0; index--) {
      points.push({ x: nodes[index].x + nodes[index].halfWidth, y: nodes[index].y })
    }

    paintSilhouette(context, points, style, strength, 0.82 + weed.depth * 0.18)
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
  style: DecorStyle = FAR_STYLE,
): void {
  if (strength <= 0) return

  const groundY = groundAt(profile, wreck.x, tank)
  context.save()
  context.lineCap = 'round'
  context.strokeStyle = `rgba(${style.body}, ${style.alpha * strength})`

  for (const mast of shipwreckMasts(wreck, groundY)) {
    context.lineWidth = mast.width
    context.beginPath()
    context.moveTo(mast.from.x, mast.from.y)
    context.lineTo(mast.to.x, mast.to.y)
    context.stroke()
  }

  paintSilhouette(context, shipwreckHull(wreck, groundY), style, strength)
  context.restore()
}

/** 貝殻。扇の筋は塗りを削る形で入れて、彫りが入っているように見せる。 */
export function drawShells(
  context: CanvasRenderingContext2D,
  shells: readonly Shell[],
  profile: readonly number[],
  tank: Tank,
  strength: number,
  style: DecorStyle = MID_STYLE,
): void {
  if (strength <= 0) return

  context.save()
  for (const shell of [...shells].sort((a, b) => a.depth - b.depth)) {
    const groundY = groundAt(profile, shell.x, tank)
    paintSilhouette(
      context,
      shellOutline(shell, groundY),
      style,
      strength,
      0.85 + shell.depth * 0.15,
    )

    // 筋は塗りを削る形で入れる。線を上から足すと、貝の外へはみ出て見える。
    context.save()
    context.globalCompositeOperation = 'destination-out'
    context.strokeStyle = `rgba(0, 0, 0, ${0.3 * strength})`
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
