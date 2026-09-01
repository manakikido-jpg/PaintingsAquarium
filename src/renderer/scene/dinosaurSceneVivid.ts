import { makeLanes, type Lane } from '../../core/walk'
import { placeParts, type PlacedPart } from '../../core/parts'
import { ridgeProfile } from '../../core/land'
import { bakeLayer, type BakedLayer } from '../bake'
import { drawParts, loadParts, type PartImages } from '../drawParts'
import { DINO_FINDS, DINO_PLANTS, DINO_ROCKS, DINO_TREES, DINO_VOLCANOES } from '../parts'
import type { Tank } from '../../core/swim'
import type { Scene } from './types'

/*
 * 恐竜の世界（派手なほう）。
 *
 * `dinosaurScene.ts`（ふつう）は**そのまま残してある**。設定画面で選ぶ。
 * 会場の照明やモニタで、どちらが良いかは現地で見ないと決められないため。
 *
 * **「派手」を「暗い」と取り違えないこと。**
 * 最初の恐竜テーマは夕暮れの影絵（黒いシルエット＋紫の空）で、
 * **絵より背景が重かった**（R-024 と同じ間違い）。
 * 水族館で分かったのは、POP の正体は明るさではなく
 * **背景の彩度と、飾りの鮮やかさの差**だということ。
 *
 * だからここでも、
 *   - 空も地面も**明るいまま**、彩度だけを上げる
 *   - 絵が歩く帯（画面の中ほど）には**何も足さない**
 *   - 色は主にパーツ画像が持つ。図形で描き足すのは空と丘だけ（R-025）
 *
 * ふつうのほうとの違いは4つ。
 *   1. 空を朝焼けの4色にする（水色 → 金 → 桃）
 *   2. 大きな太陽と、その光を地平線に敷く
 *   3. 遠景の丘を2層から3層に増やし、彩度を上げる
 *   4. 火山の後ろに赤い光を置く（煙は描き足さない。画像に入っているため）
 *
 * **止まっているものは全部1枚に焼く。** 空・丘・太陽・火山・地面・岩・木は
 * 動かないので、毎フレーム描き直す理由が無い。焼けば描画は1回になり、
 * 足した色数のぶんだけ重くなる、ということが起きない。
 */

const LANE_COUNT = 10

/*
 * 飾りの数。ふつうのほうより少しだけ多い。
 * **増やすのは画面の下と地平線だけ。** 絵が歩く帯を増やすと、
 * 賑やかさと引き換えに自分の絵が見つからなくなる（要件定義 §3 5c）。
 */
const ROCK_COUNT = 9
const TREE_COUNT = 4
const PLANT_COUNT = 11
/** 途中の列の草は**増やさない**。ここは絵が歩く帯 */
const MID_PLANT_COUNT = 3
const MID_PLANT_LANES = [3, 6]
const FIND_COUNT = 5

/*
 * 地面。ふつうのほうより彩度を上げ、明るさは落とさない。
 * 暗くすると絵が沈む（R-024）。
 */
const GROUND_FAR = '255, 240, 196'
const GROUND_TOP = '255, 220, 150'
const GROUND_BOTTOM = '226, 160, 84'
/** 遠景の丘。奥から手前へ、紫 → 青緑 → 黄緑 */
const HILL_FAR = '167, 141, 232'
const HILL_MID = '72, 205, 190'
const HILL_NEAR = '124, 206, 110'

/** 影の色。地面が暖色なので、影も暖色側に置かないと汚れて見える */
const SHADOW = '150, 96, 48'

function fillRidge(
  context: CanvasRenderingContext2D,
  profile: readonly number[],
  tank: Tank,
  colour: string,
  bottom: number,
): void {
  context.fillStyle = colour
  context.beginPath()
  context.moveTo(0, bottom)
  for (let index = 0; index < profile.length; index++) {
    context.lineTo((index / Math.max(1, profile.length - 1)) * tank.width, profile[index])
  }
  context.lineTo(tank.width, bottom)
  context.closePath()
  context.fill()
}

export function createDinosaurSceneVivid(tank: Tank, decorDensity = 1): Scene {
  const many = (base: number): number => Math.max(1, Math.round(base * decorDensity))

  const lanes: Lane[] = makeLanes(tank, LANE_COUNT, {
    backRatio: 0.63,
    frontRatio: 0.9,
    // 奥でも自分の絵が読める大きさ。ふつうのほうと同じ値にしてある
    minScale: 0.6,
    maxScale: 1,
  })

  const horizon = lanes.length > 0 ? lanes[0].groundY : tank.height * 0.63
  const frontGroundY = lanes.length > 0 ? lanes[lanes.length - 1].groundY : tank.height * 0.9

  // 丘は3層。奥ほど高く、手前ほど低くして重ねる
  const farRidge = ridgeProfile(2207, tank, { baseRatio: 0.5, heightRatio: 0.15, peaks: 3.1 })
  const midRidge = ridgeProfile(3301, tank, { baseRatio: 0.56, heightRatio: 0.12, peaks: 4.2 })
  const nearRidge = ridgeProfile(9187, tank, { baseRatio: 0.61, heightRatio: 0.08, peaks: 2.8 })

  /*
   * 画像は非同期で届く。届いたら**焼き直す**（`staticStrength = -1`）。
   * 1回焼いて終わりにすると、起動に間に合わなかった画像が二度と出てこない。
   */
  let staticStrength = -1
  const reload = (): void => {
    staticStrength = -1
  }
  const rockImages: PartImages = loadParts(DINO_ROCKS, reload)
  const treeImages: PartImages = loadParts(DINO_TREES, reload)
  const plantImages: PartImages = loadParts(DINO_PLANTS, reload)
  const volcanoImages: PartImages = loadParts(DINO_VOLCANOES, reload)
  const findImages: PartImages = loadParts(DINO_FINDS, reload)

  const backGroundAt = (x: number): number => horizon + tank.height * 0.012 * Math.sin(x * 0.01)
  const rocks: PlacedPart[] = placeParts(8823, many(ROCK_COUNT), DINO_ROCKS.length, tank, {
    baseHeight: 0.2,
    sizeSpread: 0.5,
    groundAt: backGroundAt,
  })
  const trees: PlacedPart[] = placeParts(4133, many(TREE_COUNT), DINO_TREES.length, tank, {
    baseHeight: 0.19,
    sizeSpread: 0.35,
    groundAt: backGroundAt,
  })
  const plants: PlacedPart[] = placeParts(7717, many(PLANT_COUNT), DINO_PLANTS.length, tank, {
    baseHeight: 0.1,
    sizeSpread: 0.5,
    groundAt: () => frontGroundY + tank.height * 0.045,
  })
  const midPlants = new Map<number, PlacedPart[]>(
    MID_PLANT_LANES.filter((index) => index < lanes.length).map((index) => [
      index,
      placeParts(5100 + index * 37, many(MID_PLANT_COUNT), DINO_PLANTS.length, tank, {
        baseHeight: 0.045 + index * 0.004,
        sizeSpread: 0.4,
        groundAt: () => lanes[index].groundY + tank.height * 0.006,
      }),
    ]),
  )
  const finds: PlacedPart[] = placeParts(2609, many(FIND_COUNT), DINO_FINDS.length, tank, {
    baseHeight: 0.055,
    sizeSpread: 0.3,
    groundAt: () => frontGroundY + tank.height * 0.085,
  })

  /*
   * 火山は2つ置く。片方を大きく、もう片方を小さく反対側へ。
   * **煙は描き足さない。** 一覧画像の火山に煙が入っているので、
   * 足すと二重になって山肌の手前で煙が湧いて見える。
   */
  const volcano: PlacedPart[] =
    DINO_VOLCANOES.length > 0
      ? [
          {
            index: Math.min(1, DINO_VOLCANOES.length - 1),
            x: tank.width * 0.17,
            groundY: horizon + tank.height * 0.008,
            // 岩は 0.2 の高さで置いてあり、火山をあとから岩で埋めてしまう。
            // 岩より高くしないと、置いても見えない（実機で確認）
            height: tank.height * 0.26,
            flipped: true,
            depth: 0.05,
          },
          {
            index: 0,
            x: tank.width * 0.78,
            groundY: horizon + tank.height * 0.01,
            height: tank.height * 0.34,
            flipped: false,
            depth: 0.1,
          },
        ]
      : []

  /*
   * 太陽の位置。
   *
   * **地平線のすぐ上に置くと、丘に完全に隠れて光だけになる**（実機で確認）。
   * 丘の一番高いところは画面の 0.35 あたりなので、その上に出す。
   * 横は火山（0.78）の反対側。同じ側に置くと画面の右だけが賑やかになる。
   */
  const sunX = tank.width * 0.28
  const sunY = tank.height * 0.24
  const sunRadius = tank.height * 0.1

  const drawSky = (context: CanvasRenderingContext2D, strength: number): void => {
    /*
     * 朝焼けの空。上から水色 → 金 → 桃。
     * **暗くしない。** 濃い紫や藍に振ると、それだけで背景が絵より重くなる。
     */
    /*
     * 色の切り替わりを**上へ寄せてある**。丘が 0.35 から下を覆うので、
     * 素直に配ると朝焼けの色が丘の裏に入って見えない（実機で確認）。
     */
    const sky = context.createLinearGradient(0, 0, 0, horizon)
    sky.addColorStop(0, '#17bdea')
    sky.addColorStop(0.34, '#8fe4f2')
    sky.addColorStop(0.6, '#ffdf8e')
    sky.addColorStop(0.85, '#ffaebf')
    sky.addColorStop(1, '#ff9db0')
    context.fillStyle = sky
    context.fillRect(0, 0, tank.width, horizon + 1)

    if (strength <= 0) return

    // 太陽。輪郭のはっきりした円と、そのまわりの光
    const halo = context.createRadialGradient(sunX, sunY, sunRadius * 0.6, sunX, sunY, sunRadius * 4)
    halo.addColorStop(0, `rgba(255, 240, 170, ${0.55 * strength})`)
    halo.addColorStop(0.45, `rgba(255, 214, 140, ${0.22 * strength})`)
    halo.addColorStop(1, 'rgba(255, 214, 140, 0)')
    context.fillStyle = halo
    context.fillRect(0, 0, tank.width, horizon + 1)

    context.save()
    context.globalAlpha = strength
    context.fillStyle = '#fff6c8'
    context.beginPath()
    context.arc(sunX, sunY, sunRadius, 0, Math.PI * 2)
    context.fill()
    context.restore()
  }

  const drawVolcanoGlow = (context: CanvasRenderingContext2D, strength: number): void => {
    if (strength <= 0 || volcano.length === 0) return
    /*
     * 噴火の光。**煙ではなく光だけ**を置く。
     * 山の頂の少し上に赤い滲みを敷くと、画像の煙がそこを通るので
     * 噴いているように見える。煙を描き足すより安く、二重にもならない。
     */
    const top = volcano[volcano.length - 1]
    const peakY = top.groundY - top.height * 0.86
    const glow = context.createRadialGradient(top.x, peakY, 0, top.x, peakY, top.height * 0.55)
    glow.addColorStop(0, `rgba(255, 108, 62, ${0.5 * strength})`)
    glow.addColorStop(0.5, `rgba(255, 150, 70, ${0.18 * strength})`)
    glow.addColorStop(1, 'rgba(255, 150, 70, 0)')
    context.fillStyle = glow
    context.fillRect(0, 0, tank.width, horizon + tank.height * 0.1)
  }

  const drawGround = (context: CanvasRenderingContext2D, strength: number): void => {
    const ground = context.createLinearGradient(0, horizon, 0, tank.height)
    ground.addColorStop(0, `rgb(${GROUND_FAR})`)
    ground.addColorStop(0.12, `rgb(${GROUND_TOP})`)
    ground.addColorStop(1, `rgb(${GROUND_BOTTOM})`)
    context.fillStyle = ground
    context.fillRect(0, horizon, tank.width, tank.height - horizon)

    if (strength <= 0) return
    /*
     * 太陽の光を地面に落とす。地平線から手前へ短く伸びる帯。
     * これが無いと、空だけが朝焼けで**地面だけ昼**という食い違いが出る。
     */
    const spill = context.createLinearGradient(0, horizon, 0, horizon + tank.height * 0.16)
    spill.addColorStop(0, `rgba(255, 206, 128, ${0.5 * strength})`)
    spill.addColorStop(1, 'rgba(255, 206, 128, 0)')
    context.fillStyle = spill
    context.fillRect(0, horizon, tank.width, tank.height * 0.16)
  }

  /** 止まっているものを全部1枚に焼く。毎フレームの描画を1回にするため */
  let backdrop: BakedLayer | null = null
  const paintBackdrop = (context: CanvasRenderingContext2D, strength: number): void => {
    drawSky(context, strength)
    fillRidge(context, farRidge, tank, `rgb(${HILL_FAR})`, horizon + 1)
    fillRidge(context, midRidge, tank, `rgb(${HILL_MID})`, horizon + 1)
    fillRidge(context, nearRidge, tank, `rgb(${HILL_NEAR})`, horizon + 1)
    drawVolcanoGlow(context, strength)
    drawParts(context, volcano, volcanoImages, tank, strength, {
      shadowColour: SHADOW,
      shadowAlpha: 0.18,
      maxWidthRatio: 0.34,
    })
    drawGround(context, strength)
    drawParts(context, rocks, rockImages, tank, strength, {
      shadowColour: SHADOW,
      shadowAlpha: 0.22,
      maxWidthRatio: 0.22,
    })
    drawParts(context, trees, treeImages, tank, strength, {
      shadowColour: SHADOW,
      shadowAlpha: 0.22,
      maxWidthRatio: 0.14,
    })
  }

  const ready = (): boolean =>
    rockImages.ready && treeImages.ready && volcanoImages.ready

  return {
    motion: 'walk',
    lanes,

    drawBehind(context, _elapsed, strength) {
      if (ready()) {
        if (strength !== staticStrength) {
          backdrop = bakeLayer(tank, (canvas) => paintBackdrop(canvas, strength))
          staticStrength = strength
        }
        if (backdrop) {
          backdrop.draw(context, tank, 1)
          return
        }
      }
      // 焼けていない間（画像待ち・焼き場が取れなかったとき）はそのまま描く
      paintBackdrop(context, strength)
    },

    drawBeneath(context, place, laneIndex, strength) {
      if (strength <= 0) return
      const lane = lanes[laneIndex]
      if (!lane) return

      const radius = place.width * 0.42
      const feet = place.y + place.height / 2
      const gradient = context.createRadialGradient(place.x, feet, 0, place.x, feet, radius)
      gradient.addColorStop(0, `rgba(${SHADOW}, ${0.34 * strength})`)
      gradient.addColorStop(1, `rgba(${SHADOW}, 0)`)

      context.save()
      context.fillStyle = gradient
      context.beginPath()
      // 真円だと地面に立っているのではなく、球が浮いているように見える
      context.ellipse(place.x, feet, radius, radius * 0.22, 0, 0, Math.PI * 2)
      context.fill()
      context.restore()
    },

    drawLane(context, index, _elapsed, strength) {
      const here = midPlants.get(index)
      if (!here) return
      drawParts(context, here, plantImages, tank, strength, {
        shadowColour: SHADOW,
        shadowAlpha: 0.18,
        maxWidthRatio: 0.06,
      })
    },

    drawFront(context, _elapsed, strength) {
      if (strength <= 0) return
      drawParts(context, plants, plantImages, tank, strength, {
        shadowColour: SHADOW,
        shadowAlpha: 0.2,
        maxWidthRatio: 0.12,
      })
      drawParts(context, finds, findImages, tank, strength, {
        shadowColour: SHADOW,
        shadowAlpha: 0.2,
        maxWidthRatio: 0.1,
      })

      // 画面の下端を少しだけ沈める。地面が切れている感じが消える
      const fade = context.createLinearGradient(0, tank.height * 0.93, 0, tank.height)
      fade.addColorStop(0, `rgba(${SHADOW}, 0)`)
      fade.addColorStop(1, `rgba(${SHADOW}, ${0.3 * strength})`)
      context.fillStyle = fade
      context.fillRect(0, tank.height * 0.93, tank.width, tank.height * 0.07)
    },
  }
}
