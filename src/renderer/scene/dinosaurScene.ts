import { spawnRocks, spawnSeaweed, type Rock, type Seaweed } from '../../core/decor'
import {
  logBranches,
  logOutline,
  ridgeProfile,
  smokePuffs,
  spawnLogs,
  spawnVolcano,
  volcanoOutline,
  type FallenLog,
} from '../../core/land'
import { makeLanes, type Lane } from '../../core/walk'
import { seaweedShape } from '../../core/decor'
import type { Tank } from '../../core/swim'
import type { Scene } from './types'

/*
 * 色。水中と同じ考え方で決めている（R-006）。
 * 空を明るく、手前に来るほど濃い影絵にする。奥行きは色ではなく濃さで出す。
 * 前の列ほど濃くしないと、絵の足元がどの地面に乗っているのか分からなくなる。
 */
const FAR_RIDGE = '86, 96, 132'
const NEAR_RIDGE = '54, 60, 88'
const SILHOUETTE = '14, 15, 24'

const LANE_COUNT = 10
const ROCK_COUNT = 7
const FERN_COUNT = 7
const LOG_COUNT = 3

function fillPolygon(
  context: CanvasRenderingContext2D,
  points: readonly { x: number; y: number }[],
): void {
  if (points.length === 0) return
  context.beginPath()
  context.moveTo(points[0].x, points[0].y)
  for (let index = 1; index < points.length; index++) {
    context.lineTo(points[index].x, points[index].y)
  }
  context.closePath()
  context.fill()
}

function fillRidge(
  context: CanvasRenderingContext2D,
  profile: readonly number[],
  tank: Tank,
  colour: string,
): void {
  context.fillStyle = colour
  context.beginPath()
  context.moveTo(0, tank.height)
  for (let index = 0; index < profile.length; index++) {
    context.lineTo((index / Math.max(1, profile.length - 1)) * tank.width, profile[index])
  }
  context.lineTo(tank.width, tank.height)
  context.closePath()
  context.fill()
}

/** 恐竜。絵は地面の上を歩くので、奥行きの列を持つ。 */
export function createDinosaurScene(tank: Tank): Scene {
  const lanes: Lane[] = makeLanes(tank, LANE_COUNT, {
    backRatio: 0.63,
    // 1.0 に近づけすぎると、一番手前の地面が画面の下端に来て、
    // そこに置いた飾り（倒木・岩・シダ）が画面の外に出て見えなくなる。
    frontRatio: 0.9,
    minScale: 0.42,
    maxScale: 1,
  })

  const farRidge = ridgeProfile(3301, tank, { baseRatio: 0.56, heightRatio: 0.14, peaks: 4.2 })
  const nearRidge = ridgeProfile(9187, tank, { baseRatio: 0.64, heightRatio: 0.1, peaks: 2.8 })
  const volcano = spawnVolcano(tank, 0.22)
  const volcanoBaseY = tank.height * 0.62

  // 手前の列に置く飾り。シダは海藻の形をそのまま使い、揺れをゆっくりにしている
  // （空気は水より重くないので、大きく揺れると水中に見える）。
  const ferns: Seaweed[] = spawnSeaweed(7717, FERN_COUNT, tank).map((weed) => ({
    ...weed,
    // 海藻の細長い形のままだと、陸では「黒い棘」にしか見えない。
    // 低く太くして、葉の茂みに寄せる。
    // 背を低く抑える。手前の草が高いと、奥の列を歩く絵が隠れてしまう。
    // 「装飾は絵を隠さない」を陸でも守る。
    height: weed.height * 0.38,
    halfWidth: weed.halfWidth * 2.2,
    // 陸のシダは水中の海藻より大きく開く。まっすぐ上を向いた葉の束は棘に見える。
    lean: weed.lean * 2.2,
    swaySpeed: weed.swaySpeed * 0.35,
    swayAmplitude: weed.swayAmplitude * 0.4,
  }))
  const rocks: Rock[] = spawnRocks(4133, ROCK_COUNT, tank)
  const logs: FallenLog[] = spawnLogs(2609, LOG_COUNT, tank)

  const drawSky = (context: CanvasRenderingContext2D, strength: number): void => {
    const sky = context.createLinearGradient(0, 0, 0, tank.height * 0.7)
    sky.addColorStop(0, '#2a2140')
    sky.addColorStop(0.45, '#6b4a5c')
    sky.addColorStop(0.78, '#c07a5a')
    sky.addColorStop(1, '#e0a06d')
    context.fillStyle = sky
    context.fillRect(0, 0, tank.width, tank.height)

    // 陽の当たる帯。空が単なるグラデーションのままだと書き割りに見える。
    const glow = context.createRadialGradient(
      tank.width * 0.72,
      tank.height * 0.6,
      0,
      tank.width * 0.72,
      tank.height * 0.6,
      tank.width * 0.45,
    )
    glow.addColorStop(0, `rgba(255, 214, 150, ${0.35 * strength})`)
    glow.addColorStop(1, 'rgba(255, 214, 150, 0)')
    context.fillStyle = glow
    context.fillRect(0, 0, tank.width, tank.height)
  }

  const drawVolcano = (
    context: CanvasRenderingContext2D,
    elapsed: number,
    strength: number,
  ): void => {
    context.save()
    // 煙は山より先に描く。山の上に描くと、山肌の手前で煙が湧いて見える。
    for (const puff of smokePuffs(volcano, elapsed)) {
      const alpha = puff.alpha * strength
      if (alpha <= 0.002) continue
      const y = volcanoBaseY - volcano.height + puff.y
      const gradient = context.createRadialGradient(puff.x, y, 0, puff.x, y, puff.radius)
      gradient.addColorStop(0, `rgba(72, 62, 78, ${alpha})`)
      gradient.addColorStop(1, 'rgba(72, 62, 78, 0)')
      context.fillStyle = gradient
      context.beginPath()
      context.arc(puff.x, y, puff.radius, 0, Math.PI * 2)
      context.fill()
    }

    context.fillStyle = `rgb(${NEAR_RIDGE})`
    fillPolygon(context, volcanoOutline(volcano, volcanoBaseY))

    // 火口の火。これが無いと、ただの尖った山にしか見えない。
    const craterY = volcanoBaseY - volcano.height
    const craterHalf = volcano.halfWidth * volcano.craterRatio
    const fire = context.createRadialGradient(volcano.x, craterY, 0, volcano.x, craterY, craterHalf * 2.2)
    fire.addColorStop(0, `rgba(255, 150, 70, ${0.75 * strength})`)
    fire.addColorStop(0.45, `rgba(226, 88, 46, ${0.35 * strength})`)
    fire.addColorStop(1, 'rgba(226, 88, 46, 0)')
    context.fillStyle = fire
    context.beginPath()
    context.arc(volcano.x, craterY, craterHalf * 2.2, 0, Math.PI * 2)
    context.fill()
    context.restore()
  }

  /** 霧の層。遠景と手前を切り離して、奥行きを一段深くする。 */
  const drawHaze = (
    context: CanvasRenderingContext2D,
    elapsed: number,
    strength: number,
  ): void => {
    if (strength <= 0) return
    for (let layer = 0; layer < 3; layer++) {
      const y = tank.height * (0.6 + layer * 0.06)
      const height = tank.height * 0.05
      const drift = Math.sin(elapsed * 0.07 + layer) * tank.width * 0.02
      const gradient = context.createLinearGradient(0, y - height, 0, y + height)
      gradient.addColorStop(0, 'rgba(224, 190, 172, 0)')
      gradient.addColorStop(0.5, `rgba(224, 190, 172, ${(0.16 - layer * 0.03) * strength})`)
      gradient.addColorStop(1, 'rgba(224, 190, 172, 0)')
      context.fillStyle = gradient
      context.fillRect(drift - tank.width * 0.05, y - height, tank.width * 1.1, height * 2)
    }
  }

  return {
    motion: 'walk',
    lanes,

    drawBehind(context, elapsed, strength) {
      drawSky(context, strength)
      fillRidge(context, farRidge, tank, `rgb(${FAR_RIDGE})`)
      drawVolcano(context, elapsed, strength)
      fillRidge(context, nearRidge, tank, `rgb(${NEAR_RIDGE})`)
      drawHaze(context, elapsed, strength)

      // 地面は 1 枚。奥は霞んで明るく、手前ほど暗い（空気遠近）。
      const top = lanes.length > 0 ? lanes[0].groundY : tank.height * 0.7
      const ground = context.createLinearGradient(0, top, 0, tank.height)
      ground.addColorStop(0, 'rgb(84, 80, 108)')
      ground.addColorStop(0.35, 'rgb(58, 55, 78)')
      ground.addColorStop(1, 'rgb(26, 25, 38)')
      context.fillStyle = ground
      context.fillRect(0, top, tank.width, tank.height - top)
    },

    /** 足元の影。地面に立っていることを示す唯一の手がかり。 */
    drawBeneath(context, place, laneIndex, strength) {
      if (strength <= 0) return
      const lane = lanes[laneIndex]
      if (!lane) return

      const radius = place.width * 0.42
      const feet = place.y + place.height / 2
      const gradient = context.createRadialGradient(place.x, feet, 0, place.x, feet, radius)
      gradient.addColorStop(0, `rgba(10, 9, 16, ${0.45 * strength})`)
      gradient.addColorStop(1, 'rgba(10, 9, 16, 0)')

      context.save()
      context.fillStyle = gradient
      context.beginPath()
      // 真円だと地面に立っているのではなく、球が浮いているように見える。
      context.ellipse(place.x, feet, radius, radius * 0.22, 0, 0, Math.PI * 2)
      context.fill()
      context.restore()
    },

    /**
     * 列ごとの描き足し。
     *
     * 最初は列ごとに地面を塗り分けていたが、**横縞模様**になった。
     * 10 列ぶんの境目が明るい線として並び、地面ではなく畝に見える（R-009）。
     * 地面そのものは `drawBehind` で 1 枚の連続したグラデーションとして描き、
     * ここでは奥行きを「絵の大きさ」と「足元の影」で見せる。
     */
    drawLane(context, index, elapsed, strength) {
      const lane = lanes[index]
      if (!lane) return

      // 一番手前の地面にだけ飾りを置く。奥の列に置くと、そこを歩く絵に
      // かぶさって足元が読めなくなる。
      if (index !== lanes.length - 1) return
      const groundY = lane.groundY

      context.fillStyle = `rgba(${SILHOUETTE}, ${0.85 * strength})`
      for (const log of logs) {
        fillPolygon(context, logOutline(log, groundY + tank.height * 0.004))
        context.lineCap = 'round'
        context.strokeStyle = `rgba(${SILHOUETTE}, ${0.85 * strength})`
        for (const branch of logBranches(log, groundY + tank.height * 0.004)) {
          context.lineWidth = branch.width
          context.beginPath()
          context.moveTo(branch.from.x, branch.from.y)
          context.lineTo(branch.to.x, branch.to.y)
          context.stroke()
        }
      }

      for (const rock of rocks) {
        context.fillStyle = `rgba(${SILHOUETTE}, ${(0.7 + rock.depth * 0.25) * strength})`
        const points: { x: number; y: number }[] = []
        const steps = 20
        for (let step = 0; step <= steps; step++) {
          const angle = Math.PI * (step / steps)
          const radius = 1 + Math.sin(angle * 2 + rock.seed) * 0.07
          points.push({
            x: rock.x - Math.cos(angle) * rock.halfWidth * radius,
            y: groundY + tank.height * 0.0042 - Math.sin(angle) * rock.height * 0.7 * radius,
          })
        }
        fillPolygon(context, points)
      }

      for (const fern of ferns) {
        context.fillStyle = `rgba(${SILHOUETTE}, ${(0.72 + fern.depth * 0.22) * strength})`
        const nodes = seaweedShape(fern, elapsed, groundY + tank.height * 0.0045)
        if (nodes.length === 0) continue
        context.beginPath()
        context.moveTo(nodes[0].x - nodes[0].halfWidth, nodes[0].y)
        for (const node of nodes) context.lineTo(node.x - node.halfWidth, node.y)
        for (let step = nodes.length - 1; step >= 0; step--) {
          context.lineTo(nodes[step].x + nodes[step].halfWidth, nodes[step].y)
        }
        context.closePath()
        context.fill()
      }
    },

    drawFront(context, _elapsed, strength) {
      if (strength <= 0) return
      // 画面の下を少し沈めて、手前の地面が切れている感じを消す。
      const fade = context.createLinearGradient(0, tank.height * 0.9, 0, tank.height)
      fade.addColorStop(0, 'rgba(10, 10, 18, 0)')
      fade.addColorStop(1, `rgba(10, 10, 18, ${0.45 * strength})`)
      context.fillStyle = fade
      context.fillRect(0, tank.height * 0.9, tank.width, tank.height * 0.1)
    },
  }
}
