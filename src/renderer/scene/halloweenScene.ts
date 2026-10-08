import { seededRandom } from '../../core/random'
import { bakeLayer, type BakedLayer } from '../bake'
import { drawVignette } from '../drawScenery'
import type { Tank } from '../../core/swim'
import type { Scene } from './types'

/*
 * ハロウィンの世界。**絵は全部ただよう**ので、奥行きの列は持たない（`float`）。
 *
 * **暗い背景は、このアプリで一度失敗している。**
 * 「高級感＝暗く」と解釈して真っ黒に寄せ、絵が沈んだ（R-011 / R-013）。
 * 見せる先はプロジェクターではなく**モニター**なので、黒は本当に沈む。
 *
 * 逃げ方は4つ。
 *   1. **真っ黒にしない。** 空は藍から紫・桃へ。地平線は橙まで上げる。
 *   2. **明かりの源を1つに決める。** 大きな橙の月。空の明暗も、丘の縁も、
 *      雲の照り返しも、全部この月の位置から作る。
 *   3. **絵の後ろに淡い光を戻す。** 水族館では撤去したが、記録は
 *      「**暗い背景では効いた**が、明るい水では白く濁った」（2026-08-14）。
 *   4. **遠いものほど空の色に溶かす。** 同じ暗さで塗ると切り絵のように平たくなる。
 *
 * **画面の真ん中は空けておく。** 参考画像はお城が画面中央にそびえているが、
 * そのまま作ると**絵が漂う場所と正面衝突する**。お城は地平線へ下ろし、
 * 家と木は左右の端と下だけに置く。主役は子どもの絵のほう。
 *
 * **画像を貼らずに描いている理由。** 貼ると 4K で甘くなり、
 * 飾りの量つまみ（`decorDensity`）も絵の後ろの光も効かなくなる。
 */

/** 夜空。上から下へ。真っ黒にしない。 */
const SKY_TOP = '#241561'
const SKY_MID = '#53268E'
const SKY_LOW = '#8C3A93'
const SKY_HORIZON = '#E07A62'

/** 月。明かりの源はこれ1つ。地平線に近いところに低く置く。 */
const MOON_CORE = '#FFD98A'
const MOON_EDGE = '#FFA93A'
const MOON_WARM = '255, 176, 70'
const MOON_X = 0.5
const MOON_Y = 0.46
const MOON_R = 0.2

/** 雲。月に近い側だけ明るい桃色になる。 */
const CLOUD_DARK = '170, 96, 186'
const CLOUD_LIT = '246, 158, 196'

/** 丘。遠いほど明るく（空に溶ける）、手前ほど沈む。 */
const HILL_FAR = '#7A51B4'
const HILL_MID = '#57368F'
const HILL_NEAR = '#3C2468'
const GROUND = '#2A1750'

/** 建物。シルエットは沈め、窓の灯りだけを暖色で出す。 */
const BUILDING = '#2E1A57'
const BUILDING_LIT = '#3A2268'
const WINDOW = '#FFC94D'
const TREE = '#1C1033'

const STAR_COUNT = 120
const SPARKLE_COUNT = 8
const CLOUD_COUNT = 7
const HOUSE_COUNT = 9
const TREE_COUNT = 4

interface Star {
  readonly x: number
  readonly y: number
  readonly radius: number
  readonly phase: number
  readonly speed: number
}

interface Cloud {
  readonly y: number
  readonly width: number
  readonly height: number
  readonly speed: number
  readonly offset: number
  readonly alpha: number
}

interface Placed {
  readonly x: number
  readonly scale: number
  readonly kind: number
  readonly depth: number
}

function hex(color: string): [number, number, number] {
  return [
    parseInt(color.slice(1, 3), 16),
    parseInt(color.slice(3, 5), 16),
    parseInt(color.slice(5, 7), 16),
  ]
}

/** 2色を混ぜる。遠くのものを空へ溶かすのに使う（遠近は大きさだけでは出ない）。 */
function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hex(a)
  const [br, bg, bb] = hex(b)
  return `rgb(${Math.round(ar + (br - ar) * t)}, ${Math.round(ag + (bg - ag) * t)}, ${
    Math.round(ab + (bb - ab) * t)})`
}

/** なだらかな稜線。正弦波3本の和で、繰り返しに見えないようにする。 */
function ridge(seed: number, tank: Tank, baseY: number, amplitude: number): number[] {
  const random = seededRandom(seed)
  const waves = Array.from({ length: 3 }, (_, index) => ({
    length: tank.width / (0.7 + index * 1.6),
    height: amplitude / (index + 1),
    phase: random() * Math.PI * 2,
  }))
  return Array.from({ length: 72 }, (_, index) => {
    const x = (index / 71) * tank.width
    let y = baseY
    for (const wave of waves) y -= Math.sin((x / wave.length) * Math.PI * 2 + wave.phase) * wave.height
    return y
  })
}

function ridgePath(context: CanvasRenderingContext2D, points: number[], tank: Tank): void {
  context.beginPath()
  context.moveTo(0, tank.height)
  points.forEach((y, index) => context.lineTo((index / (points.length - 1)) * tank.width, y))
  context.lineTo(tank.width, tank.height)
  context.closePath()
}

function ridgeAt(points: number[], tank: Tank, x: number): number {
  const t = Math.min(1, Math.max(0, x / tank.width)) * (points.length - 1)
  const i = Math.min(points.length - 2, Math.floor(t))
  return points[i] + (points[i + 1] - points[i]) * (t - i)
}

/** 稜線の上端を月明かりで縁取る。月のまわりだけ。全幅に引くと電線に見える。 */
function rimLight(context: CanvasRenderingContext2D, points: number[], tank: Tank,
                  width: number, alpha: number): void {
  const moonX = tank.width * MOON_X
  context.save()
  context.lineWidth = width
  context.lineCap = 'round'
  points.forEach((y, index) => {
    if (index === 0) return
    const x0 = ((index - 1) / (points.length - 1)) * tank.width
    const x1 = (index / (points.length - 1)) * tank.width
    const near = 1 - Math.min(1, Math.abs((x0 + x1) / 2 - moonX) / (tank.width * 0.45))
    const lit = near * near * near
    if (lit < 0.02) return
    context.strokeStyle = `rgba(255, 206, 150, ${lit * alpha})`
    context.beginPath()
    context.moveTo(x0, points[index - 1])
    context.lineTo(x1, y)
    context.stroke()
  })
  context.restore()
}

function drawMoon(context: CanvasRenderingContext2D, tank: Tank, strength: number): void {
  const cx = tank.width * MOON_X
  const cy = tank.height * MOON_Y
  const r = Math.min(tank.width, tank.height) * MOON_R

  // まわりの明かり。`filter: blur()` は大画面で重いので使わない（R-012）
  const halo = context.createRadialGradient(cx, cy, r * 0.85, cx, cy, r * 4.2)
  halo.addColorStop(0, `rgba(${MOON_WARM}, ${0.42 * strength})`)
  halo.addColorStop(0.3, `rgba(${MOON_WARM}, ${0.14 * strength})`)
  halo.addColorStop(1, `rgba(${MOON_WARM}, 0)`)
  context.fillStyle = halo
  context.fillRect(0, 0, tank.width, tank.height)

  // 月そのもの。中心を明るく、縁を橙に落とす（平らな円だとシールに見える）
  const body = context.createRadialGradient(cx - r * 0.2, cy - r * 0.25, r * 0.1, cx, cy, r)
  body.addColorStop(0, MOON_CORE)
  body.addColorStop(1, MOON_EDGE)
  context.fillStyle = body
  context.beginPath()
  context.arc(cx, cy, r, 0, Math.PI * 2)
  context.fill()

  context.fillStyle = 'rgba(214, 138, 50, 0.32)'
  for (const [dx, dy, dr] of [[-0.34, -0.2, 0.17], [0.3, 0.06, 0.13], [-0.06, 0.36, 0.1],
                              [0.14, -0.4, 0.08], [-0.46, 0.22, 0.07]]) {
    context.beginPath()
    context.arc(cx + r * dx, cy + r * dy, r * dr, 0, Math.PI * 2)
    context.fill()
  }
}

/**
 * たなびく雲。**縁を出さない。**
 * 横長の楕円に円形のグラデーションを掛けると、上下だけ急に切れて
 * 空に硬い円盤が浮いて見えた（UFO のように見える）。座標系ごと潰して正円で塗る。
 */
function drawCloud(context: CanvasRenderingContext2D, tank: Tank, x: number, y: number,
                   w: number, h: number, alpha: number): void {
  const lit = 1 - Math.min(1, Math.abs(x - tank.width * MOON_X) / (tank.width * 0.55))
  for (let i = 0; i < 2; i++) {
    const cx = x + w * (i - 0.5) * 0.45
    const cy = y + h * (i - 0.5) * 0.5
    const rx = w * (0.62 - i * 0.12)
    const ry = h * (1 - i * 0.15)
    context.save()
    context.translate(cx, cy)
    context.scale(1, ry / rx)
    const g = context.createRadialGradient(0, 0, 0, 0, 0, rx)
    g.addColorStop(0, `rgba(${lit > 0.4 ? CLOUD_LIT : CLOUD_DARK}, ${alpha * (0.5 + lit * 0.8)})`)
    g.addColorStop(0.45, `rgba(${CLOUD_DARK}, ${alpha * 0.4})`)
    g.addColorStop(1, `rgba(${CLOUD_DARK}, 0)`)
    context.fillStyle = g
    context.beginPath()
    context.arc(0, 0, rx, 0, Math.PI * 2)
    context.fill()
    context.restore()
  }
}

/** 窓の灯り。四角を塗るだけだと点に見えるので、外へにじませる。 */
function litWindow(context: CanvasRenderingContext2D, x: number, y: number,
                   w: number, h: number): void {
  const g = context.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, w * 2.6)
  g.addColorStop(0, 'rgba(255, 201, 77, 0.55)')
  g.addColorStop(1, 'rgba(255, 201, 77, 0)')
  context.fillStyle = g
  context.fillRect(x - w * 2.6, y - w * 2.6, w * 5.2 + w, w * 5.2 + h)
  context.fillStyle = WINDOW
  context.fillRect(x, y, w, h)
}

/**
 * お城。**地平線に下ろして、画面の真ん中を空ける。**
 * 参考画像では中央にそびえているが、そこは絵が漂う場所なので譲る。
 */
function drawCastle(context: CanvasRenderingContext2D, x: number, baseY: number,
                    s: number): void {
  const tower = (tx: number, w: number, h: number, roof: number): void => {
    context.fillStyle = BUILDING
    context.fillRect(x + tx - w / 2, baseY - h, w, h)
    context.beginPath()
    context.moveTo(x + tx - w * 0.72, baseY - h)
    context.lineTo(x + tx, baseY - h - roof)
    context.lineTo(x + tx + w * 0.72, baseY - h)
    context.closePath()
    context.fill()
    for (let i = 0; i < Math.max(1, Math.round(h / (s * 0.26))); i++) {
      litWindow(context, x + tx - w * 0.12, baseY - h + s * 0.14 + i * s * 0.26,
                w * 0.24, s * 0.12)
    }
  }
  // 本体
  context.fillStyle = BUILDING_LIT
  context.fillRect(x - s * 0.52, baseY - s * 0.62, s * 1.04, s * 0.62)
  tower(-s * 0.62, s * 0.22, s * 0.74, s * 0.3)
  tower(s * 0.62, s * 0.22, s * 0.74, s * 0.3)
  tower(-s * 0.3, s * 0.2, s * 0.92, s * 0.26)
  tower(s * 0.3, s * 0.2, s * 0.92, s * 0.26)
  tower(0, s * 0.28, s * 1.2, s * 0.4)
  // 月を背負っているので、輪郭のきわだけ明るくする（真っ黒だと板に見える）
  context.strokeStyle = 'rgba(255, 196, 120, 0.5)'
  context.lineWidth = Math.max(1, s * 0.012)
  context.beginPath()
  context.moveTo(x - s * 0.52, baseY - s * 0.62)
  context.lineTo(x + s * 0.52, baseY - s * 0.62)
  context.stroke()

  // 門。中から光がもれる
  const gate = context.createLinearGradient(0, baseY - s * 0.3, 0, baseY)
  gate.addColorStop(0, 'rgba(255, 201, 77, 0.9)')
  gate.addColorStop(1, 'rgba(255, 170, 60, 0.35)')
  context.fillStyle = gate
  context.beginPath()
  context.moveTo(x - s * 0.1, baseY)
  context.lineTo(x - s * 0.1, baseY - s * 0.22)
  context.arc(x, baseY - s * 0.22, s * 0.1, Math.PI, 0)
  context.lineTo(x + s * 0.1, baseY)
  context.closePath()
  context.fill()
}

/** 村の家。窓の灯りが**画面の下の帯**をつくる。 */
function drawHouse(context: CanvasRenderingContext2D, x: number, baseY: number, s: number,
                   depth: number, flip: number): void {
  const body = mix(BUILDING, HILL_FAR, (1 - depth) * 0.7)
  context.fillStyle = body
  context.fillRect(x - s * 0.5, baseY - s * 0.56, s, s * 0.56)
  context.beginPath()
  context.moveTo(x - s * 0.62, baseY - s * 0.54)
  context.lineTo(x + flip * s * 0.06, baseY - s * 0.95)
  context.lineTo(x + s * 0.62, baseY - s * 0.54)
  context.closePath()
  context.fill()
  context.fillRect(x + flip * s * 0.3, baseY - s * 0.92, s * 0.12, s * 0.3)   // 煙突
  litWindow(context, x - s * 0.3, baseY - s * 0.42, s * 0.2, s * 0.2)
  if (depth > 0.4) litWindow(context, x + s * 0.1, baseY - s * 0.42, s * 0.2, s * 0.2)
}

/** 枯れ木。幹1本と、上半分からの又だけ（下から長い枝を出すと交差した棒に見える）。 */
function drawTree(context: CanvasRenderingContext2D, x: number, y: number, s: number,
                  lean: number, color: string): void {
  context.strokeStyle = color
  context.lineCap = 'round'
  context.lineJoin = 'round'
  const topX = x + lean * s * 0.1
  const topY = y - s * 0.58
  context.lineWidth = s * 0.1
  context.beginPath()
  context.moveTo(x, y)
  context.quadraticCurveTo(x + lean * s * 0.03, y - s * 0.3, topX, topY)
  context.stroke()
  for (const [dx, dy] of [[-0.52, -0.4], [0.46, -0.44], [-0.06, -0.52]] as const) {
    const ex = topX + s * dx
    const ey = topY + s * dy
    context.lineWidth = s * 0.055
    context.beginPath()
    context.moveTo(topX, topY)
    context.quadraticCurveTo(topX + s * dx * 0.4, topY + s * dy * 0.8, ex, ey)
    context.stroke()
    for (const t of [-0.5, 0.5]) {
      context.lineWidth = s * 0.03
      context.beginPath()
      context.moveTo(ex, ey)
      context.quadraticCurveTo(ex + s * dx * 0.2, ey - s * 0.08,
                               ex + s * (dx * 0.22 + t * 0.1), ey - s * 0.2)
      context.stroke()
    }
  }
}

/** ハロウィン。絵は夜空をただよう。 */
export function createHalloweenScene(tank: Tank, decorDensity = 1): Scene {
  const many = (base: number): number => Math.max(1, Math.round(base * decorDensity))
  const random = seededRandom(31031)

  const stars: Star[] = Array.from({ length: STAR_COUNT }, () => ({
    x: random() * tank.width,
    y: random() * tank.height * 0.6,
    radius: Math.max(1, random() * tank.height * 0.0026),
    phase: random() * Math.PI * 2,
    speed: 0.5 + random() * 1.1,
  }))
  const sparkles: Star[] = Array.from({ length: SPARKLE_COUNT }, () => ({
    x: random() * tank.width,
    y: random() * tank.height * 0.45,
    radius: tank.height * (0.006 + random() * 0.004),
    phase: random() * Math.PI * 2,
    speed: 0.3 + random() * 0.4,
  }))
  const clouds: Cloud[] = Array.from({ length: CLOUD_COUNT }, (_, index) => ({
    y: tank.height * (0.06 + random() * 0.44),
    width: tank.width * (0.22 + random() * 0.26),
    height: tank.height * (0.018 + random() * 0.024),
    speed: tank.width * (0.003 + random() * 0.004),
    offset: (index / CLOUD_COUNT + random() * 0.12) * tank.width * 1.6,
    alpha: 0.16 + random() * 0.14,
  }))

  const hillFar = ridge(7711, tank, tank.height * 0.66, tank.height * 0.05)
  const hillMid = ridge(4409, tank, tank.height * 0.74, tank.height * 0.042)
  const hillNear = ridge(2240, tank, tank.height * 0.83, tank.height * 0.034)
  const ground = ridge(9182, tank, tank.height * 0.92, tank.height * 0.016)
  const groundY = (x: number): number => ridgeAt(ground, tank, x)

  /*
   * 家は**左右の端に寄せる**。真ん中はお城と、その上を漂う絵のために空ける。
   */
  const houses: Placed[] = Array.from({ length: many(HOUSE_COUNT) }, (_, index) => {
    const r = seededRandom(5512 + index * 97)
    const side = index % 2 === 0 ? -1 : 1
    const t = r()
    return {
      x: tank.width * (0.5 + side * (0.2 + t * 0.32)),
      scale: 0.7 + r() * 0.6,
      kind: r() < 0.5 ? 1 : -1,
      depth: r(),
    }
  })
  const trees: Placed[] = Array.from({ length: many(TREE_COUNT) }, (_, index) => {
    const r = seededRandom(8831 + index * 131)
    const side = index % 2 === 0 ? -1 : 1
    return {
      // 端に寄せる。中央に掛かると絵と重なる
      x: tank.width * (0.5 + side * (0.42 + r() * 0.14)),
      scale: 0.72 + r() * 0.36,
      kind: side,
      depth: 0.9,
    }
  })
  const byDepth = (list: Placed[]): Placed[] => [...list].sort((a, b) => a.depth - b.depth)

  let staticStrength = -1
  let skyLayer: BakedLayer | null = null
  let groundLayer: BakedLayer | null = null

  const paintSky = (context: CanvasRenderingContext2D, strength: number): void => {
    const sky = context.createLinearGradient(0, 0, 0, tank.height * 0.78)
    sky.addColorStop(0, SKY_TOP)
    sky.addColorStop(0.42, SKY_MID)
    sky.addColorStop(0.78, SKY_LOW)
    sky.addColorStop(1, SKY_HORIZON)
    context.fillStyle = sky
    context.fillRect(0, 0, tank.width, tank.height)

    /*
     * **月を中心にした明暗。** 縦のグラデーションだけだと、どの高さも
     * 横一直線に同じ明るさになり、空が壁紙に見える。
     */
    const depth = context.createRadialGradient(
      tank.width * MOON_X, tank.height * MOON_Y, tank.height * 0.05,
      tank.width * MOON_X, tank.height * MOON_Y, Math.hypot(tank.width, tank.height) * 0.78)
    depth.addColorStop(0, 'rgba(20, 10, 48, 0)')
    depth.addColorStop(0.45, `rgba(20, 10, 48, ${0.2 * strength})`)
    depth.addColorStop(1, `rgba(20, 10, 48, ${0.66 * strength})`)
    context.fillStyle = depth
    context.fillRect(0, 0, tank.width, tank.height)

    drawMoon(context, tank, strength)
  }

  const paintGround = (context: CanvasRenderingContext2D, strength: number): void => {
    for (const [points, color, rim] of [
      [hillFar, HILL_FAR, 0.3], [hillMid, HILL_MID, 0.26], [hillNear, HILL_NEAR, 0.22],
    ] as const) {
      ridgePath(context, points, tank)
      context.fillStyle = color
      context.fill()
      rimLight(context, points, tank, Math.max(1.5, tank.height * 0.0025), rim * strength)
    }

    /*
     * お城。**小さく、丘の上に置く。**
     * 参考画像では画面中央にそびえているが、そのまま作ると
     * **絵が漂う場所と正面衝突する**（実機で確認した）。月の手前に収まる大きさまで下げる。
     */
    const castleBase = ridgeAt(hillMid, tank, tank.width * 0.5) + tank.height * 0.015
    drawCastle(context, tank.width * 0.5, castleBase, tank.height * 0.125)

    ridgePath(context, ground, tank)
    context.fillStyle = GROUND
    context.fill()

    // 月の真下の地面を明るく。一様だと下半分がただの暗い帯になる
    const pool = context.createRadialGradient(
      tank.width * MOON_X, tank.height * 0.93, tank.height * 0.02,
      tank.width * MOON_X, tank.height * 0.93, tank.width * 0.45)
    pool.addColorStop(0, `rgba(255, 190, 120, ${0.14 * strength})`)
    pool.addColorStop(1, 'rgba(255, 190, 120, 0)')
    context.save()
    ridgePath(context, ground, tank)
    context.clip()
    context.fillStyle = pool
    context.fillRect(0, 0, tank.width, tank.height)
    context.restore()
    rimLight(context, ground, tank, Math.max(1.5, tank.height * 0.003), 0.26 * strength)

    // お城へ続く道。中央の下だけ明るくして、視線が中央の絵へ上がるようにする
    const path = context.createLinearGradient(0, tank.height, 0, castleBase)
    path.addColorStop(0, `rgba(154, 127, 200, ${0.5 * strength})`)
    path.addColorStop(1, `rgba(154, 127, 200, ${0.08 * strength})`)
    context.fillStyle = path
    context.beginPath()
    context.moveTo(tank.width * 0.42, tank.height)
    context.quadraticCurveTo(tank.width * 0.52, tank.height * 0.95,
                             tank.width * 0.495, groundY(tank.width * 0.5))
    context.lineTo(tank.width * 0.505, groundY(tank.width * 0.5))
    context.quadraticCurveTo(tank.width * 0.56, tank.height * 0.95, tank.width * 0.62, tank.height)
    context.closePath()
    context.fill()

    for (const h of byDepth(houses)) {
      drawHouse(context, h.x, groundY(h.x) - tank.height * 0.01,
                tank.height * 0.088 * h.scale, h.depth, h.kind)
    }
    for (const t of byDepth(trees)) {
      drawTree(context, t.x, groundY(t.x) + tank.height * 0.02,
               tank.height * 0.22 * t.scale, t.kind, TREE)
    }
    drawVignette(context, tank, strength)
  }

  const bakeStatic = (strength: number): void => {
    skyLayer = bakeLayer(tank, (context) => paintSky(context, strength))
    groundLayer = bakeLayer(tank, (context) => paintGround(context, strength))
    staticStrength = strength
  }

  return {
    motion: 'float',
    lanes: [],

    drawBehind(context, elapsed, strength) {
      if (strength !== staticStrength) bakeStatic(strength)
      if (skyLayer) skyLayer.draw(context, tank, 1)
      else paintSky(context, strength)

      // 星はまたたかせるので焼けない。点を塗るだけなので毎フレームでよい
      for (const star of stars) {
        const twinkle = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(elapsed * star.speed + star.phase))
        context.fillStyle = `rgba(255, 244, 210, ${twinkle * 0.8 * strength})`
        context.beginPath()
        context.arc(star.x, star.y, star.radius, 0, Math.PI * 2)
        context.fill()
      }
      // 大きい星は細く短い光芒を付ける。太いと「＋」の記号が並んで見える
      for (const s of sparkles) {
        const t = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(elapsed * s.speed + s.phase))
        context.strokeStyle = `rgba(255, 248, 222, ${t * 0.34 * strength})`
        context.lineWidth = Math.max(1, s.radius * 0.1)
        context.lineCap = 'round'
        context.beginPath()
        context.moveTo(s.x - s.radius * 0.8, s.y)
        context.lineTo(s.x + s.radius * 0.8, s.y)
        context.moveTo(s.x, s.y - s.radius * 0.8)
        context.lineTo(s.x, s.y + s.radius * 0.8)
        context.stroke()
        context.fillStyle = `rgba(255, 250, 230, ${t * 0.85 * strength})`
        context.beginPath()
        context.arc(s.x, s.y, s.radius * 0.17, 0, Math.PI * 2)
        context.fill()
      }

      for (const cloud of clouds) {
        const span = tank.width * 1.6
        const x = ((cloud.offset + elapsed * cloud.speed) % span) - tank.width * 0.3
        drawCloud(context, tank, x, cloud.y, cloud.width, cloud.height, cloud.alpha * strength)
      }

      if (groundLayer) groundLayer.draw(context, tank, 1)
      else paintGround(context, strength)
    },

    drawLane() {
      // 列を持たないテーマなので何もしない
    },

    /*
     * **絵の後ろの淡い光。** 水族館では撤去したが、記録は
     * 「暗い背景では効いたが、明るい水では白く濁った」。ここは暗いほうの条件。
     */
    drawBeneath(context, place, _laneIndex, strength) {
      const r = Math.max(place.width, place.height) * 0.9
      const glow = context.createRadialGradient(place.x, place.y, r * 0.15, place.x, place.y, r)
      glow.addColorStop(0, `rgba(255, 214, 150, ${0.24 * strength})`)
      glow.addColorStop(0.55, `rgba(255, 200, 140, ${0.09 * strength})`)
      glow.addColorStop(1, 'rgba(255, 200, 140, 0)')
      context.fillStyle = glow
      context.fillRect(place.x - r, place.y - r, r * 2, r * 2)
    },

    drawFront(context, elapsed, strength) {
      // 地面に沿って流れる霧。画面の下だけ。中央に掛けると絵が霞む
      const top = tank.height * 0.82
      for (let i = 0; i < 3; i++) {
        const drift = Math.sin(elapsed * (0.05 + i * 0.03) + i * 2.1) * tank.width * 0.06
        const y = top + (tank.height - top) * (i / 3)
        const mist = context.createLinearGradient(0, y, 0, y + tank.height * 0.09)
        mist.addColorStop(0, 'rgba(214, 186, 236, 0)')
        mist.addColorStop(0.5, `rgba(214, 186, 236, ${0.12 * strength})`)
        mist.addColorStop(1, 'rgba(214, 186, 236, 0)')
        context.fillStyle = mist
        context.fillRect(drift - tank.width * 0.1, y, tank.width * 1.2, tank.height * 0.09)
      }
    },
  }
}
