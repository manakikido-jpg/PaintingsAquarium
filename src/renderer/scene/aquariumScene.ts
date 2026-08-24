import { sandProfile, spawnCorals, spawnRocks, type Coral, type Rock } from '../../core/decor'
import { spawnBubbles, spawnRays, stepBubble, type Bubble } from '../../core/scenery'
import { drawBubbles, drawLightRays, drawVignette, drawWater } from '../drawScenery'
import { drawCorals, drawRocks, drawSand, FAR_STYLE, MID_STYLE, NEAR_STYLE } from '../drawDecor'
import { createCausticsLayer } from '../drawCaustics'
import { bakeLayer, type BakedLayer } from '../bake'
import type { Tank } from '../../core/swim'
import { placeParts } from '../../core/parts'
import { drawParts, loadParts, type PartImages } from '../drawParts'
import { DECOR_PARTS } from '../parts'
import type { Scene } from './types'

/*
 * 水族館の世界。
 *
 * **2026-08-18 に作り直した。**
 * それまでは海藻・扇・管・イソギンチャク・貝・沈没船と種類を足し続けていたが、
 * 細くて尖った形が並ぶ「変なシルエット」になり、**参考にした見え方から遠ざかった**。
 *
 * 狙っているのは**デフォルメされた POP な海**で、実物の海ではない。
 * 参考画像にあるのは、**明るい一色で塗られた大きくて丸い石**が並び、
 * その間に太い枝サンゴが少しあるだけ。**細かいものは何も無い。**
 *
 * だから、ここでは次の2つしか置かない。
 *   - 大きな石（橙・紅桃・青緑・黄・青・黄緑）
 *   - 太い枝サンゴを少しだけ
 *
 * 種類を増やしたくなったら、**まず参考画像にそれがあるかを見ること。**
 */

const RAY_COUNT = 9
const BACK_BUBBLE_COUNT = 22
const FRONT_BUBBLE_COUNT = 6

/**
 * 敷くパーツの数。
 * パーツ画像（`assets/decor/`）がある場合はこちらを使う。
 * 設定の「飾りの多さ」はこちらにも掛ける（掛け忘れると、画像を置いた途端に
 * 会場でつまみが効かなくなる）。
 */
const PART_COUNT = 9

/** 大きな石。これが背景の主役。パーツ画像が無いときの代わり。 */
const ROCK_COUNT = 13
/** 枝サンゴ。石の間に少しだけ。多いと尖った形が増えて元に戻る。 */
const CORAL_COUNT = 5

const ROCK_HEIGHT = 1.5
const CORAL_HEIGHT = 1.7

/** 水族館。絵は水中を自由に泳ぐので、奥行きの列は持たない。 */
export function createAquariumScene(tank: Tank, decorDensity = 1): Scene {
  const many = (base: number): number => Math.max(1, Math.round(base * decorDensity))
  const rays = spawnRays(20260812, RAY_COUNT, tank)
  const sand = sandProfile(4471, tank)

  /*
   * 石は画面の端から端まで並べる。片側へ寄せる構図も試したが、
   * 参考画像の石は横一列に広がっていて、寄せると別物になった。
   */
  const allRocks = spawnRocks(8823, many(ROCK_COUNT), tank, undefined, {
    heightScale: ROCK_HEIGHT,
  })
  const allCorals = spawnCorals(3271, many(CORAL_COUNT), tank, undefined, {
    heightScale: CORAL_HEIGHT,
  })

  /*
   * パーツ画像があればそれを敷き、無ければ図形で描く。
   *
   * 図形で描く方式は残しておく。**画像が1枚も無い状態でも背景が出る**必要がある
   *（`assets/decor/` を空にしたまま配ってしまったときに、真っ青な画面になると
   * 不具合に見える）。
   */
  const useParts = DECOR_PARTS.length > 0
  let partImages: PartImages = { images: [], ready: false }
  const parts = useParts
    ? placeParts(7717, many(PART_COUNT), DECOR_PARTS.length, tank, {
        groundAt: (x) => {
          const at = Math.min(sand.length - 1, Math.max(0, Math.round((x / tank.width) * (sand.length - 1))))
          return sand[at]
        },
      })
    : []
  /*
   * 画像は非同期で届く。届いたら**焼き直す**（下の `staticStrength = -1`）。
   * 1回焼いて終わりにすると、起動直後に間に合わなかった画像が
   * **二度と背景に出てこない**。
   */
  if (useParts) partImages = loadParts(DECOR_PARTS, () => {
    staticStrength = -1
  })

  const pick = <T extends { depth: number }>(items: readonly T[], from: number, to: number): T[] =>
    items.filter((item) => item.depth >= from && item.depth < to)

  const farRocks: Rock[] = pick(allRocks, 0, 0.38)
  const midRocks: Rock[] = pick(allRocks, 0.38, 0.78)
  const nearRocks: Rock[] = pick(allRocks, 0.78, 1.01)
  const farCorals: Coral[] = pick(allCorals, 0, 0.5)
  const nearCorals: Coral[] = pick(allCorals, 0.5, 1.01)

  /*
   * 奥と中はぼかして1枚へ焼く。`filter: blur()` を毎フレーム掛けると
   * 大画面で重いので、起動時に1回だけ掛ける（R-012）。
   *
   * **パーツ画像を使うときは作らない。** 使わない層でも実寸の面を2枚持つので、
   * 1920×1080 で 16MB を無駄に抱えることになる。
   */
  const farLayer: BakedLayer | null = useParts
    ? null
    : bakeLayer(
        tank,
        (context) => {
          drawCorals(context, farCorals, sand, tank, 1, FAR_STYLE)
          drawRocks(context, farRocks, sand, tank, 1, FAR_STYLE)
        },
        { blur: Math.max(3, tank.width * 0.0032), resolution: 1 },
      )

  const midLayer: BakedLayer | null = useParts
    ? null
    : bakeLayer(
        tank,
        (context) => {
          drawRocks(context, midRocks, sand, tank, 1, MID_STYLE)
        },
        { blur: Math.max(1.5, tank.width * 0.002), resolution: 1 },
      )

  let backBubbles: Bubble[] = spawnBubbles(1207, BACK_BUBBLE_COUNT, tank, {
    maxAlpha: 0.14,
    minSpeed: 8,
    maxSpeed: 26,
  })
  let frontBubbles: Bubble[] = spawnBubbles(9931, FRONT_BUBBLE_COUNT, tank, {
    minRadius: 5,
    maxRadius: 13,
    minSpeed: 18,
    maxSpeed: 44,
    maxAlpha: 0.1,
  })

  /*
   * 揺らぎ模様は2枚。細かいほうは弱くしてある。
   * デフォルメした絵なので、水面の模様まで細かく描き込むと写実に寄ってしまう。
   */
  const causticsFar = createCausticsLayer(tank, {
    resolution: 640,
    scale: 15,
    speed: 0.1,
    sharpness: 8,
    topBias: 0.88,
    intensity: 0.2,
    tint: [178, 236, 255],
  })
  const causticsNear = createCausticsLayer(tank, {
    resolution: 520,
    scale: 29,
    speed: 0.16,
    sharpness: 13,
    topBias: 0.94,
    intensity: 0.07,
    tint: [220, 250, 255],
  })

  let lastElapsed = 0

  /*
   * 動かないものは1枚に焼いてから貼る。
   *
   * 水・砂・パーツ・周辺の暗がりは**1フレームも変わらない**のに、
   * 毎フレーム描き直していた。実測（絵24枚・1920×1080・GPU無しの開発環境）で
   * この層だけで**約13ms**、全体の3分の1を使っていた。
   *
   * 2枚に分けるのは、**間に動くものが挟まる**から。
   * 水 → 揺らぎ模様と光の筋（動く）→ 砂と飾り、の順で重なっている。
   * 1枚にまとめると、揺らぎ模様が海底の岩の上にも乗ってしまう。
   *
   * 焼き直すのは「背景の強さ」が変わったときだけ（設定のつまみ・R-023）。
   * 強さを掛けたあとの絵をそのまま焼くので、**見た目は1画素も変わらない**。
   * 強さを別に掛ける（薄く焼いて貼るときに濃さで調整する）やり方は採らない。
   * 重なった物どうしで濃さの掛かり方が変わり、色がずれる。
   */
  let staticStrength = -1
  let waterLayer: BakedLayer | null = null
  let floorLayer: BakedLayer | null = null

  const paintFloor = (context: CanvasRenderingContext2D, strength: number): void => {
    drawSand(context, sand, tank, strength)
    if (useParts) {
      drawParts(context, parts, partImages, tank, strength)
    } else {
      farLayer?.draw(context, tank, strength)
      midLayer?.draw(context, tank, strength)
      drawCorals(context, nearCorals, sand, tank, strength, NEAR_STYLE)
      drawRocks(context, nearRocks, sand, tank, strength, NEAR_STYLE)
    }
    drawVignette(context, tank, strength)
  }

  const bakeStatic = (strength: number): void => {
    waterLayer = bakeLayer(tank, (context) => drawWater(context, tank, strength))
    floorLayer = bakeLayer(tank, (context) => paintFloor(context, strength))
    staticStrength = strength
  }

  return {
    motion: 'float',
    lanes: [],

    drawBehind(context, elapsed, strength) {
      const dt = Math.min(0.05, Math.max(0, elapsed - lastElapsed))
      lastElapsed = elapsed
      backBubbles = backBubbles.map((bubble) => stepBubble(bubble, dt, tank))
      frontBubbles = frontBubbles.map((bubble) => stepBubble(bubble, dt, tank))

      /*
       * パーツ画像が届くまでは焼かない。
       * 焼いてしまうと、その時点で読めていた画像だけの背景が固定される。
       */
      const canBake = !useParts || partImages.ready
      if (canBake && strength !== staticStrength) bakeStatic(strength)

      if (canBake) waterLayer?.draw(context, tank, 1)
      else drawWater(context, tank, strength)

      causticsFar.draw(context, elapsed, strength)
      causticsNear.draw(context, elapsed * 1.13, strength)
      // 上から差し込む光。デフォルメした絵では、光は説明ではなく飾りなので強めに出す
      drawLightRays(context, rays, elapsed, tank, strength)

      if (canBake) floorLayer?.draw(context, tank, 1)
      else paintFloor(context, strength)

      drawBubbles(context, backBubbles, strength)
    },

    drawLane() {
      // 列を持たないテーマなので何もしない
    },

    drawFront(context, _elapsed, strength) {
      drawBubbles(context, frontBubbles, strength)
    },
  }
}
