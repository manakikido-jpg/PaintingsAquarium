import { makeLanes, type Lane } from '../../core/walk'
import { placeParts, type PlacedPart } from '../../core/parts'
import { ridgeProfile } from '../../core/land'
import { drawParts, loadParts, type PartImages } from '../drawParts'
import { DINO_FINDS, DINO_PLANTS, DINO_ROCKS, DINO_TREES, DINO_VOLCANOES } from '../parts'
import type { Tank } from '../../core/swim'
import type { Scene } from './types'

/*
 * 恐竜の世界。
 *
 * **2026-08-22 に作り直した。**
 * それまでは夕暮れの影絵（黒いシルエット＋紫の空）だった。水族館を POP に
 * 作り直したとき（R-024）と同じ間違いをしていて、**絵より背景が重かった**。
 * 子どもが塗るのは鮮やかな恐竜なので、その手前に暗い草木が並ぶと絵が沈む。
 *
 * いまは水族館と同じ考え方で組み立てている。
 *   - 背景そのものは**静かな1色**（空の青、地面の砂色）
 *   - 色は**パーツ画像**（岩・草・木・火山）だけが持つ
 *   - 絵が歩く帯（画面の中ほど）には、なるべく何も置かない
 *
 * 種類を増やしたくなったら、**まず一覧画像にそれがあるかを見ること。**
 * 図形で描き足すと、また「多角形とグラデーション」に戻る（R-025）。
 */

const LANE_COUNT = 10

/** 奥の地面に並べる岩・台地の数 */
const ROCK_COUNT = 7
/** 岩の間に立てる木の数 */
const TREE_COUNT = 3
/** 手前の草の数 */
const PLANT_COUNT = 8
/**
 * 途中の列に置く草の数（1列あたり）。
 * 地面が広いままだと**砂の板**に見えるので、奥行きの手がかりを少し置く。
 * 小さくすること。大きいと、そこを歩く絵が隠れる。
 */
const MID_PLANT_COUNT = 3
/** 途中の草を置く列。手前すぎると絵の邪魔になり、奥すぎると効かない */
const MID_PLANT_LANES = [3, 6]
/** 足元の小物（卵・化石・骨）の数。多いと拾い物だらけの床になる */
const FIND_COUNT = 3

/** 地面の色。パーツが極彩色なので、地面は彩度を落とした砂色にする */
const GROUND_FAR = '246, 231, 190'
const GROUND_TOP = '236, 214, 164'
const GROUND_BOTTOM = '198, 166, 116'
/** 遠景の丘。空と地面をつなぐだけの役なので、彩度は低め */
const FAR_HILL = '150, 214, 206'
const NEAR_HILL = '116, 191, 150'

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

/** 恐竜。絵は地面の上を歩くので、奥行きの列を持つ。 */
export function createDinosaurScene(tank: Tank, decorDensity = 1): Scene {
  const many = (base: number): number => Math.max(1, Math.round(base * decorDensity))

  const lanes: Lane[] = makeLanes(tank, LANE_COUNT, {
    backRatio: 0.63,
    // 1.0 に近づけすぎると、一番手前の地面が画面の下端に来て、
    // そこに置いた飾りが画面の外に出て見えなくなる。
    frontRatio: 0.9,
    /*
     * 奥の列の縮み。0.42 では**画面の高さの6%**まで小さくなり、
     * 子どもが自分の絵を見つけられなかった（要件定義 §3 5c）。
     * 奥行きは残しつつ、奥でも読める 0.6 にした。
     */
    minScale: 0.6,
    maxScale: 1,
  })

  const horizon = lanes.length > 0 ? lanes[0].groundY : tank.height * 0.63
  const frontGroundY = lanes.length > 0 ? lanes[lanes.length - 1].groundY : tank.height * 0.9

  const farRidge = ridgeProfile(3301, tank, { baseRatio: 0.56, heightRatio: 0.12, peaks: 4.2 })
  const nearRidge = ridgeProfile(9187, tank, { baseRatio: 0.61, heightRatio: 0.08, peaks: 2.8 })

  /*
   * パーツ画像。1枚も無ければ空の配列になり、空と地面だけの背景になる。
   * **真っ白にはならない**ので、配り忘れても壊れて見えることはない。
   */
  const rockImages: PartImages = loadParts(DINO_ROCKS, () => undefined)
  const treeImages: PartImages = loadParts(DINO_TREES, () => undefined)
  const plantImages: PartImages = loadParts(DINO_PLANTS, () => undefined)
  const volcanoImages: PartImages = loadParts(DINO_VOLCANOES, () => undefined)
  const findImages: PartImages = loadParts(DINO_FINDS, () => undefined)

  /*
   * 岩と木は**地平線のすぐ下**に置く。絵が歩くのはその手前なので、
   * ここに置けば絵に重ならない。地面の中ほどに置くと、
   * 歩いている絵の顔が岩に隠れる（水族館で同じことを直した）。
   */
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

  /*
   * 草と小物は一番手前の地面に置く。**絵の足元より下**なので、
   * 絵にかぶらずに奥行きだけが増える。
   */
  const plants: PlacedPart[] = placeParts(7717, many(PLANT_COUNT), DINO_PLANTS.length, tank, {
    baseHeight: 0.1,
    sizeSpread: 0.5,
    groundAt: () => frontGroundY + tank.height * 0.045,
  })
  /*
   * 途中の列の草。**その列の絵より奥**に描くので、列ごとに分けて持つ。
   * まとめて `drawBehind` で描くと、奥の列を歩く絵の前に出てしまう。
   */
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
   * 火山は1つだけ、遠景に置く。
   * 一覧画像の火山には煙も描かれているので、煙を別に描き足さない
   *（描き足すと二重になり、山肌の手前で煙が湧いて見える）。
   */
  const volcano: PlacedPart[] =
    DINO_VOLCANOES.length > 0
      ? [
          {
            index: 0,
            x: tank.width * 0.78,
            groundY: horizon + tank.height * 0.01,
            height: tank.height * 0.3,
            flipped: false,
            depth: 0.1,
          },
        ]
      : []

  const drawSky = (context: CanvasRenderingContext2D, strength: number): void => {
    const sky = context.createLinearGradient(0, 0, 0, horizon)
    sky.addColorStop(0, '#2fa3de')
    sky.addColorStop(0.55, '#7fd0ef')
    sky.addColorStop(1, '#d5f2fb')
    context.fillStyle = sky
    context.fillRect(0, 0, tank.width, horizon + 1)

    // 陽だまり。空が一様なグラデーションのままだと書き割りに見える
    if (strength <= 0) return
    const glow = context.createRadialGradient(
      tank.width * 0.24,
      tank.height * 0.2,
      0,
      tank.width * 0.24,
      tank.height * 0.2,
      tank.width * 0.34,
    )
    glow.addColorStop(0, `rgba(255, 246, 205, ${0.5 * strength})`)
    glow.addColorStop(1, 'rgba(255, 246, 205, 0)')
    context.fillStyle = glow
    context.fillRect(0, 0, tank.width, horizon)
  }

  const drawGround = (context: CanvasRenderingContext2D): void => {
    const ground = context.createLinearGradient(0, horizon, 0, tank.height)
    // 地平線のすぐ下を明るくする。1本のグラデーションだけだと、
    // 地面が**砂色の板**に見えて、奥行きが空との境目でしか出ない。
    ground.addColorStop(0, `rgb(${GROUND_FAR})`)
    ground.addColorStop(0.12, `rgb(${GROUND_TOP})`)
    ground.addColorStop(1, `rgb(${GROUND_BOTTOM})`)
    context.fillStyle = ground
    context.fillRect(0, horizon, tank.width, tank.height - horizon)
  }

  return {
    motion: 'walk',
    lanes,

    drawBehind(context, _elapsed, strength) {
      drawSky(context, strength)
      fillRidge(context, farRidge, tank, `rgb(${FAR_HILL})`, horizon + 1)
      fillRidge(context, nearRidge, tank, `rgb(${NEAR_HILL})`, horizon + 1)
      drawParts(context, volcano, volcanoImages, tank, strength, {
        shadowColour: '120, 92, 52',
        shadowAlpha: 0.18,
        maxWidthRatio: 0.34,
      })
      drawGround(context)

      // 岩と木は地面の上。空気遠近のかわりに、地平線側を薄く霞ませる
      drawParts(context, rocks, rockImages, tank, strength, {
        shadowColour: '120, 92, 52',
        shadowAlpha: 0.22,
        maxWidthRatio: 0.22,
      })
      drawParts(context, trees, treeImages, tank, strength, {
        shadowColour: '120, 92, 52',
        shadowAlpha: 0.22,
        maxWidthRatio: 0.14,
      })
    },

    /** 足元の影。地面に立っていることを示す唯一の手がかり。 */
    drawBeneath(context, place, laneIndex, strength) {
      if (strength <= 0) return
      const lane = lanes[laneIndex]
      if (!lane) return

      const radius = place.width * 0.42
      const feet = place.y + place.height / 2
      const gradient = context.createRadialGradient(place.x, feet, 0, place.x, feet, radius)
      // 地面が明るいので、水中と同じ濃さの影を落とすと**穴**に見える
      gradient.addColorStop(0, `rgba(120, 92, 52, ${0.34 * strength})`)
      gradient.addColorStop(1, 'rgba(120, 92, 52, 0)')

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
     * 地面そのものは `drawBehind` で 1 枚の連続したグラデーションとして描く。
     */
    drawLane(context, index, _elapsed, strength) {
      const plants = midPlants.get(index)
      if (!plants) return
      drawParts(context, plants, plantImages, tank, strength, {
        shadowColour: '120, 92, 52',
        shadowAlpha: 0.18,
        maxWidthRatio: 0.06,
      })
    },

    drawFront(context, _elapsed, strength) {
      if (strength <= 0) return
      /*
       * 手前の草と小物は**絵より前**に描く。
       * 絵の足元（一番手前の列）より下に置いてあるので絵は隠れず、
       * 画面の下端が切れている感じだけが消える。
       */
      drawParts(context, plants, plantImages, tank, strength, {
        shadowColour: '120, 92, 52',
        shadowAlpha: 0.2,
        maxWidthRatio: 0.12,
      })
      drawParts(context, finds, findImages, tank, strength, {
        shadowColour: '120, 92, 52',
        shadowAlpha: 0.2,
        maxWidthRatio: 0.1,
      })

      // 画面の下端を少しだけ沈める。地面が切れている感じが消える
      const fade = context.createLinearGradient(0, tank.height * 0.93, 0, tank.height)
      fade.addColorStop(0, 'rgba(150, 112, 60, 0)')
      fade.addColorStop(1, `rgba(150, 112, 60, ${0.28 * strength})`)
      context.fillStyle = fade
      context.fillRect(0, tank.height * 0.93, tank.width, tank.height * 0.07)
    },
  }
}
