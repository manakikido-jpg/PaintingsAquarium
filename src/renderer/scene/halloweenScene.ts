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
 * ハロウィンは夜が必然なので、ここは地雷の上を歩くことになる。逃げ方は3つ。
 *
 *   1. **真っ黒にしない。** 空は濃紺から紫へのグラデーションで、彩度を残す。
 *   2. **明かりの源を1つ置く。** 大きな満月。明暗が付くと、同じ暗さでも空間に見える。
 *   3. **絵の後ろに淡い光を戻す。** 水族館では撤去したが、記録はこう残っている
 *      ——「**暗い背景では効いたが**、明るい水では白く濁って絵の色が浅くなるだけだった」
 *      （2026-08-14）。ここは効いたほうの条件に当たる。
 *
 * 飾りは**画面の下だけ**に集める（水族館・恐竜と同じ）。
 * 中央まで増やすと絵を見つけにくくなる。
 */

/** 夜空（上から下へ）。真っ黒にしない。 */
const SKY_TOP = '#161033'
const SKY_MID = '#2E1A55'
const SKY_LOW = '#56236A'
const SKY_HORIZON = '#7B2E63'

/** 月。明かりの源はこれ1つだけ。 */
const MOON = '#FFF3CE'
const MOON_GLOW = '255, 228, 160'

/** 遠くの丘と地面。空より暗く、しかし黒ではない。 */
const HILL_FAR = '#3A2057'
const HILL_NEAR = '#2A1540'
const GROUND = '#1F1033'
const GROUND_EDGE = '#43215C'

/*
 * 飾りの色。**絵より一段くすませる**（恐竜・水族館と同じ約束）。
 * 子どもの絵のほうが鮮やかでないと、飾りに目が行ってしまう。
 */
const PUMPKIN = '#C9671F'
const PUMPKIN_DARK = '#9A4A14'
const STONE = '#6E6484'
const STONE_DARK = '#4C445F'
const TRUNK = '#241330'

const STAR_COUNT = 90
/*
 * **飾りは絵より小さく、少なく。**
 * 最初は墓石7・かぼちゃ8で作ったが、画面の下が飾りの壁になり、
 * **飾りのかぼちゃと、子どもが描いたかぼちゃが同じ大きさ**になった。
 * 主役は絵のほうなので、数も大きさも落としてある。
 */
const TOMBSTONE_COUNT = 5
const TREE_COUNT = 3
const PUMPKIN_COUNT = 5

interface Star {
  readonly x: number
  readonly y: number
  readonly radius: number
  readonly phase: number
  readonly speed: number
}

interface Placed {
  readonly x: number
  readonly scale: number
  readonly kind: number
}

/** なだらかな稜線。正弦波3本の和で、繰り返しに見えないようにする。 */
function ridge(seed: number, tank: Tank, baseY: number, amplitude: number): number[] {
  const random = seededRandom(seed)
  const waves = Array.from({ length: 3 }, (_, index) => ({
    length: tank.width / (0.8 + index * 1.7),
    height: amplitude / (index + 1),
    phase: random() * Math.PI * 2,
  }))
  return Array.from({ length: 64 }, (_, index) => {
    const x = (index / 63) * tank.width
    let y = baseY
    for (const wave of waves) {
      y -= Math.sin((x / wave.length) * Math.PI * 2 + wave.phase) * wave.height
    }
    return y
  })
}

function fillRidge(
  context: CanvasRenderingContext2D,
  points: number[],
  tank: Tank,
  color: string,
): void {
  context.beginPath()
  context.moveTo(0, tank.height)
  points.forEach((y, index) => context.lineTo((index / (points.length - 1)) * tank.width, y))
  context.lineTo(tank.width, tank.height)
  context.closePath()
  context.fillStyle = color
  context.fill()
}

function ridgeAt(points: number[], tank: Tank, x: number): number {
  const t = Math.min(1, Math.max(0, x / tank.width)) * (points.length - 1)
  const i = Math.min(points.length - 2, Math.floor(t))
  return points[i] + (points[i + 1] - points[i]) * (t - i)
}

function drawMoon(context: CanvasRenderingContext2D, tank: Tank, strength: number): void {
  const cx = tank.width * 0.78
  const cy = tank.height * 0.19
  const r = Math.min(tank.width, tank.height) * 0.11

  // まわりのぼんやりした明かり。`filter: blur()` は大画面で重いので使わない（R-012）
  const halo = context.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 5.5)
  halo.addColorStop(0, `rgba(${MOON_GLOW}, ${0.34 * strength})`)
  halo.addColorStop(0.35, `rgba(${MOON_GLOW}, ${0.10 * strength})`)
  halo.addColorStop(1, `rgba(${MOON_GLOW}, 0)`)
  context.fillStyle = halo
  context.fillRect(0, 0, tank.width, tank.height)

  context.beginPath()
  context.arc(cx, cy, r, 0, Math.PI * 2)
  context.fillStyle = MOON
  context.fill()

  // 月のくぼみ。月だと分かる最低限だけ。描き込むと絵より目立つ
  context.fillStyle = `rgba(214, 196, 150, ${0.55})`
  for (const [dx, dy, dr] of [[-0.30, -0.18, 0.20], [0.26, 0.10, 0.15], [-0.08, 0.34, 0.11]]) {
    context.beginPath()
    context.arc(cx + r * dx, cy + r * dy, r * dr, 0, Math.PI * 2)
    context.fill()
  }
}

function drawTombstone(context: CanvasRenderingContext2D, x: number, y: number, s: number,
                       kind: number): void {
  const w = s * 0.62
  const h = s
  context.fillStyle = STONE
  if (kind === 0) {
    // 上が丸い墓石
    context.beginPath()
    context.moveTo(x - w / 2, y)
    context.lineTo(x - w / 2, y - h * 0.62)
    context.arc(x, y - h * 0.62, w / 2, Math.PI, 0)
    context.lineTo(x + w / 2, y)
    context.closePath()
    context.fill()
    context.fillStyle = STONE_DARK
    context.fillRect(x - w * 0.26, y - h * 0.50, w * 0.52, h * 0.08)
    context.fillRect(x - w * 0.20, y - h * 0.34, w * 0.40, h * 0.07)
  } else {
    // 十字架
    context.fillRect(x - w * 0.16, y - h, w * 0.32, h)
    context.fillRect(x - w * 0.55, y - h * 0.76, w * 1.10, h * 0.24)
  }
}

function drawDeadTree(context: CanvasRenderingContext2D, x: number, y: number, s: number,
                      lean: number): void {
  /*
   * **幹を1本と、上半分からの又だけ。**
   * 最初は幹の下のほうから長い枝を4本伸ばしたが、交差した棒に見えて
   * 木に見えなかった（海藻が「竹串」に見えた R-009 と同じ型）。
   * 枝は**上へ向かって短く又に分かれる**形にする。
   */
  context.strokeStyle = TRUNK
  context.lineCap = 'round'
  context.lineJoin = 'round'

  const topX = x + lean * s * 0.10
  const topY = y - s * 0.58
  context.lineWidth = s * 0.10
  context.beginPath()
  context.moveTo(x, y)
  context.quadraticCurveTo(x + lean * s * 0.03, y - s * 0.3, topX, topY)
  context.stroke()

  // 又。付け根から先へ向かって細くするため、2段に分けて描く
  const forks: [number, number][] = [[-0.52, -0.40], [0.46, -0.44], [-0.06, -0.52]]
  for (const [dx, dy] of forks) {
    const ex = topX + s * dx
    const ey = topY + s * dy
    context.lineWidth = s * 0.055
    context.beginPath()
    context.moveTo(topX, topY)
    context.quadraticCurveTo(topX + s * dx * 0.4, topY + s * dy * 0.8, ex, ey)
    context.stroke()
    // 先の小枝
    for (const t of [-0.5, 0.5]) {
      context.lineWidth = s * 0.03
      context.beginPath()
      context.moveTo(ex, ey)
      context.quadraticCurveTo(ex + s * dx * 0.2, ey - s * 0.08,
                               ex + s * (dx * 0.22 + t * 0.10), ey - s * 0.20)
      context.stroke()
    }
  }
}


function drawPumpkin(context: CanvasRenderingContext2D, x: number, y: number, s: number,
                     lit: boolean): void {
  context.fillStyle = PUMPKIN
  context.beginPath()
  context.ellipse(x, y - s * 0.44, s * 0.58, s * 0.44, 0, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = PUMPKIN_DARK
  for (const dx of [-0.30, 0.30]) {
    context.beginPath()
    context.ellipse(x + s * dx, y - s * 0.44, s * 0.14, s * 0.42, 0, 0, Math.PI * 2)
    context.fill()
  }
  context.fillStyle = TRUNK
  context.fillRect(x - s * 0.06, y - s * 1.02, s * 0.12, s * 0.18)

  // 灯りが入っているものだけ顔を出す。全部に顔を付けると画面の下がうるさい
  if (!lit) return
  context.fillStyle = '#FFD98A'
  context.beginPath()
  context.moveTo(x - s * 0.26, y - s * 0.52)
  context.lineTo(x - s * 0.10, y - s * 0.52)
  context.lineTo(x - s * 0.18, y - s * 0.36)
  context.closePath()
  context.fill()
  context.beginPath()
  context.moveTo(x + s * 0.26, y - s * 0.52)
  context.lineTo(x + s * 0.10, y - s * 0.52)
  context.lineTo(x + s * 0.18, y - s * 0.36)
  context.closePath()
  context.fill()
  context.fillRect(x - s * 0.22, y - s * 0.30, s * 0.44, s * 0.09)
}

/** ハロウィン。絵は夜空をただよう。 */
export function createHalloweenScene(tank: Tank, decorDensity = 1): Scene {
  const many = (base: number): number => Math.max(1, Math.round(base * decorDensity))
  const random = seededRandom(31031)

  const stars: Star[] = Array.from({ length: STAR_COUNT }, () => ({
    x: random() * tank.width,
    y: random() * tank.height * 0.62,
    radius: Math.max(1, random() * tank.height * 0.0028),
    phase: random() * Math.PI * 2,
    speed: 0.5 + random() * 1.1,
  }))

  const hillFar = ridge(7711, tank, tank.height * 0.74, tank.height * 0.055)
  const hillNear = ridge(2240, tank, tank.height * 0.82, tank.height * 0.040)
  const ground = ridge(9182, tank, tank.height * 0.90, tank.height * 0.018)
  const groundY = (x: number): number => ridgeAt(ground, tank, x)

  const place = (count: number, seed: number): Placed[] => {
    const r = seededRandom(seed)
    return Array.from({ length: count }, (_, index) => ({
      x: ((index + 0.5) / count) * tank.width + (r() - 0.5) * (tank.width / count) * 0.7,
      scale: 0.8 + r() * 0.5,
      kind: r() < 0.3 ? 1 : 0,
    }))
  }
  const stones = place(many(TOMBSTONE_COUNT), 5512)
  const trees = place(many(TREE_COUNT), 8831)
  const pumpkins = place(many(PUMPKIN_COUNT), 1177)

  let staticStrength = -1
  let skyLayer: BakedLayer | null = null
  let groundLayer: BakedLayer | null = null

  const paintSky = (context: CanvasRenderingContext2D, strength: number): void => {
    const sky = context.createLinearGradient(0, 0, 0, tank.height)
    sky.addColorStop(0, SKY_TOP)
    sky.addColorStop(0.40, SKY_MID)
    sky.addColorStop(0.74, SKY_LOW)
    sky.addColorStop(1, SKY_HORIZON)
    context.fillStyle = sky
    context.fillRect(0, 0, tank.width, tank.height)
    drawMoon(context, tank, strength)
  }

  const paintGround = (context: CanvasRenderingContext2D, strength: number): void => {
    fillRidge(context, hillFar, tank, HILL_FAR)
    fillRidge(context, hillNear, tank, HILL_NEAR)
    fillRidge(context, ground, tank, GROUND)

    // 地面の上端だけ月明かりで縁取る。無いと地面が1枚の板に見える
    context.strokeStyle = GROUND_EDGE
    context.lineWidth = Math.max(2, tank.height * 0.004)
    context.beginPath()
    ground.forEach((y, index) => {
      const x = (index / (ground.length - 1)) * tank.width
      index === 0 ? context.moveTo(x, y) : context.lineTo(x, y)
    })
    context.stroke()

    for (const t of trees) drawDeadTree(context, t.x, groundY(t.x), tank.height * 0.22 * t.scale,
                                        t.kind === 1 ? -1 : 1)
    for (const s of stones) drawTombstone(context, s.x, groundY(s.x), tank.height * 0.085 * s.scale,
                                          s.kind)
    for (const p of pumpkins) drawPumpkin(context, p.x, groundY(p.x) + tank.height * 0.010,
                                          tank.height * 0.042 * p.scale, p.kind === 1)
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

      /*
       * 星はまたたかせるので焼けない。90個の点を塗るだけなので毎フレームでよい
       *（`filter` も影も使わない。R-012 の教訓）。
       */
      for (const star of stars) {
        const twinkle = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(elapsed * star.speed + star.phase))
        context.fillStyle = `rgba(255, 246, 214, ${twinkle * 0.8 * strength})`
        context.beginPath()
        context.arc(star.x, star.y, star.radius, 0, Math.PI * 2)
        context.fill()
      }

      if (groundLayer) groundLayer.draw(context, tank, 1)
      else paintGround(context, strength)
    },

    drawLane() {
      // 列を持たないテーマなので何もしない
    },

    /*
     * **絵の後ろの淡い光。** 水族館では撤去したが、そのときの記録は
     * 「暗い背景では効いたが、明るい水では白く濁った」。ここは暗いほうの条件。
     * 子どもの絵は濃い色で塗られがちで、夜空に沈む。月明かりを借りて浮かせる。
     */
    drawBeneath(context, place, _laneIndex, strength) {
      const r = Math.max(place.width, place.height) * 0.85
      const glow = context.createRadialGradient(place.x, place.y, r * 0.15, place.x, place.y, r)
      glow.addColorStop(0, `rgba(255, 233, 176, ${0.22 * strength})`)
      glow.addColorStop(0.55, `rgba(255, 220, 160, ${0.08 * strength})`)
      glow.addColorStop(1, 'rgba(255, 220, 160, 0)')
      context.fillStyle = glow
      context.fillRect(place.x - r, place.y - r, r * 2, r * 2)
    },

    drawFront(context, elapsed, strength) {
      /*
       * 地面に沿って流れる霧。**画面の下だけ**に出す。
       * 中央に掛けると絵が霞むので、上端は地面のすぐ上までにする。
       */
      const top = tank.height * 0.80
      for (let i = 0; i < 3; i++) {
        const drift = Math.sin(elapsed * (0.05 + i * 0.03) + i * 2.1) * tank.width * 0.06
        const y = top + (tank.height - top) * (i / 3)
        const mist = context.createLinearGradient(0, y, 0, y + tank.height * 0.10)
        mist.addColorStop(0, 'rgba(206, 186, 230, 0)')
        mist.addColorStop(0.5, `rgba(206, 186, 230, ${0.10 * strength})`)
        mist.addColorStop(1, 'rgba(206, 186, 230, 0)')
        context.fillStyle = mist
        context.fillRect(drift - tank.width * 0.1, y, tank.width * 1.2, tank.height * 0.10)
      }
    },
  }
}
