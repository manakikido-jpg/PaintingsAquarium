import {
  sandProfile,
  shipwreckSpan,
  spawnRocks,
  spawnSeaweed,
  spawnCorals,
  spawnFans,
  spawnShells,
  spawnShipwreck,
  type Coral,
  type Fan,
  type Rock,
  type Seaweed,
} from '../../core/decor'
import { spawnBubbles, spawnRays, stepBubble, type Bubble } from '../../core/scenery'
import { drawBubbles, drawLightRays, drawVignette, drawWater } from '../drawScenery'
import {
  drawCorals,
  drawFans,
  drawRocks,
  drawSand,
  drawSeaweed,
  drawShells,
  drawShipwreck,
  FAR_STYLE,
  MID_STYLE,
  NEAR_STYLE,
} from '../drawDecor'
import { createCausticsLayer } from '../drawCaustics'
import { bakeLayer, type BakedLayer } from '../bake'
import type { Tank } from '../../core/swim'
import type { Scene } from './types'

const RAY_COUNT = 7
// 手前の泡は絵に重なるので少なく、奥は多めに。奥行きを出すため。
const BACK_BUBBLE_COUNT = 26
const FRONT_BUBBLE_COUNT = 8
/*
 * 飾りの基準の数。実際にはここに「飾りの多さ」の設定を掛ける。
 *
 * 増やすほど賑やかになるが、**画面の中央まで増やしてはいけない**。
 * 絵が泳ぐのは中央で、そこが混むと自分の絵を見つけられなくなる。
 * 増えるぶんは画面の下に積む（それぞれの `spawn` が下に置くようになっている）。
 */
/*
 * 飾りの高さの倍率。参考画像に合わせて、画面の 1/3 ほどまで立ち上げる。
 * 岩は塚なので伸ばしすぎると柱に見える。サンゴをいちばん高くする。
 */
const ROCK_HEIGHT = 2.4
const SEAWEED_HEIGHT = 1.5
const CORAL_HEIGHT = 2.2
const FAN_HEIGHT = 2.0

/*
 * 塊を寄せる位置。参考画像の構図は左右対称ではなく、
 * **片側に大きな塊、反対側は開けた青**で、そこに絵が浮いている。
 * 均一な帯にすると、どれだけ賑やかにしても「壁紙」に見える。
 * 0.62 は少し右寄り。左側を絵の見せ場として空ける。
 */
const CLUSTER_AT = 0.62
const CLUSTER_SPREAD = 0.46

const ROCK_COUNT = 12
const SHELL_COUNT = 6
const CORAL_COUNT = 14
// 扇サンゴ。形の種類が増えるほど、同じ数でも賑やかに見える
const FAN_COUNT = 9
// 「株」の数。1 株から数枚の葉が生える。
const SEAWEED_COUNT = 13

/** 水族館。絵は水中を自由に泳ぐので、奥行きの列は持たない。 */
export function createAquariumScene(tank: Tank, decorDensity = 1): Scene {
  const many = (base: number): number => Math.max(1, Math.round(base * decorDensity))
  const rays = spawnRays(20260812, RAY_COUNT, tank)
  const sand = sandProfile(4471, tank)
  const wreck = spawnShipwreck(tank)
  // 沈没船の前には生やさない。重ねると輪郭が消えて塊になる（R-006）。
  const wreckSpan = shipwreckSpan(wreck, tank)
  const allRocks = spawnRocks(8823, many(ROCK_COUNT), tank, wreckSpan, {
    heightScale: ROCK_HEIGHT,
    clusterAt: CLUSTER_AT,
    clusterSpread: CLUSTER_SPREAD,
  })
  const allSeaweed = spawnSeaweed(5507, many(SEAWEED_COUNT), tank, wreckSpan, {
    heightScale: SEAWEED_HEIGHT,
    clusterAt: CLUSTER_AT,
    clusterSpread: CLUSTER_SPREAD,
  })
  const shells = spawnShells(6619, many(SHELL_COUNT), tank)
  const allCorals = spawnCorals(3271, many(CORAL_COUNT), tank, wreckSpan, {
    heightScale: CORAL_HEIGHT,
    clusterAt: CLUSTER_AT,
    clusterSpread: CLUSTER_SPREAD,
  })
  const allFans = spawnFans(4139, many(FAN_COUNT), tank, wreckSpan, {
    heightScale: FAN_HEIGHT,
    clusterAt: CLUSTER_AT,
    clusterSpread: CLUSTER_SPREAD,
  })

  /*
   * 飾りを奥行きで3つに分ける。
   * 全部を同じ濃さ・同じ鮮明さで描くと、切り絵を並べたように安く見える（R-011）。
   * 奥ほど薄く、水の色に寄せ、強くぼかす。
   */
  const pick = <T extends { depth: number }>(items: readonly T[], from: number, to: number): T[] =>
    items.filter((item) => item.depth >= from && item.depth < to)

  /*
   * 層の境目。中景を厚くしてある。
   * 参考画像の賑やかさは「手前に大きいものが1つある」ではなく、
   * **中くらいのものが何層も重なっている**ことから出ている。
   */
  const farRocks: Rock[] = pick(allRocks, 0, 0.34)
  const midRocks: Rock[] = pick(allRocks, 0.34, 0.88)
  const nearRocks: Rock[] = pick(allRocks, 0.88, 1.01)
  /*
   * 手前の層だけが毎フレーム描かれる。奥と中は起動時に1枚へ焼くので、
   * **数を増やしても費用が増えない**。賑やかさを足すときは焼く側へ寄せる。
   * 手前を 0.76 → 0.88 に絞って 12fps から戻した。
   */
  const farSeaweed: Seaweed[] = pick(allSeaweed, 0, 0.62)
  const nearSeaweed: Seaweed[] = pick(allSeaweed, 0.62, 1.01)
  const farCorals: Coral[] = pick(allCorals, 0, 0.34)
  const midCorals: Coral[] = pick(allCorals, 0.34, 0.88)
  const nearCorals: Coral[] = pick(allCorals, 0.88, 1.01)
  const farFans: Fan[] = pick(allFans, 0, 0.45)
  const nearFans: Fan[] = pick(allFans, 0.45, 1.01)

  /*
   * 遠景と中景は動かないので、起動時に 1 回だけ焼いておく。
   * ぼかしは毎フレーム掛けると大画面で重いが、焼いてしまえば費用はほぼゼロ。
   * 遠くの海藻は揺れを止めて焼いている。遠いものの揺れは見て分からないうえ、
   * 揺らすためだけに毎フレームぼかすのは割に合わない。
   */
  const farLayer: BakedLayer | null = bakeLayer(
    tank,
    (context) => {
      drawShipwreck(context, wreck, sand, tank, 1, FAR_STYLE)
      drawSeaweed(context, farSeaweed, sand, tank, 0, 1, FAR_STYLE)
      drawFans(context, farFans, sand, tank, 1, FAR_STYLE)
      drawCorals(context, farCorals, sand, tank, 1, FAR_STYLE)
      drawRocks(context, farRocks, sand, tank, 1, FAR_STYLE)
    },
    // ぼかしすぎると帆柱のような細い物が消える。効き目と消失の境目はここ。
    { blur: Math.max(3, tank.width * 0.0032), resolution: 1 },
  )

  const midLayer: BakedLayer | null = bakeLayer(
    tank,
    (context) => {
      drawRocks(context, midRocks, sand, tank, 1, MID_STYLE)
      drawFans(context, nearFans, sand, tank, 1, MID_STYLE)
      drawCorals(context, midCorals, sand, tank, 1, MID_STYLE)
      drawShells(context, shells, sand, tank, 1, MID_STYLE)
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
   * 揺らぎ模様は2枚重ねる。
   * 大きくゆっくりの層（水面の近く）と、細かく速い層（もう少し深いところ）。
   * 1枚だけだと模様の繰り返しが目につき、壁紙のように見える。
   *
   * 最初はもっと速く濃くしていたが、**動きが大げさで、水面ではなく
   * 揺れる幕に見えた**。水は思っているよりゆっくり動く。
   * 深いところほど弱くして、下半分は静かに保つ。
   */
  const causticsFar = createCausticsLayer(tank, {
    resolution: 640,
    scale: 15,
    speed: 0.1,
    sharpness: 8,
    // 水面寄りに強く寄せる。画面全体に同じ強さで出すと、中央が騒がしくなり
    // 絵より模様に目が行く。参考にした見え方も、中央は綺麗な青のままだった。
    topBias: 0.88,
    intensity: 0.24,
    tint: [178, 236, 255],
  })
  const causticsNear = createCausticsLayer(tank, {
    resolution: 520,
    scale: 29,
    speed: 0.16,
    sharpness: 13,
    topBias: 0.94,
    intensity: 0.1,
    tint: [220, 250, 255],
  })

  let lastElapsed = 0

  return {
    motion: 'float',
    lanes: [],

    drawBehind(context, elapsed, strength) {
      // 泡を進めるのは背景の描画時に 1 回だけ。手前と奥で 2 回進めると倍速になる。
      const dt = Math.min(0.05, Math.max(0, elapsed - lastElapsed))
      lastElapsed = elapsed
      backBubbles = backBubbles.map((bubble) => stepBubble(bubble, dt, tank))
      frontBubbles = frontBubbles.map((bubble) => stepBubble(bubble, dt, tank))

      drawWater(context, tank, strength)
      // 揺らぎ模様は水のすぐ上。装飾より先に敷いて、底の岩や船にも光が乗るようにする。
      causticsFar.draw(context, elapsed, strength)
      causticsNear.draw(context, elapsed * 1.13, strength)
      drawLightRays(context, rays, elapsed, tank, strength)

      drawSand(context, sand, tank, strength)
      farLayer?.draw(context, tank, strength)
      midLayer?.draw(context, tank, strength)
      /*
       * 手前だけは動かす。揺れているものが1つあるだけで、静止画に見えなくなる。
       *
       * ここを `filter: blur()` で柔らかくしようとして**失敗した**（R-012）。
       * 画面の下 1/4 だけの狭い範囲なら安いだろうと思ったが、実測で
       * **13.7fps → 1.8fps**。毎フレームのぼかしは範囲に関係なく使えない。
       * 代わりに、少し大きい同じ形を薄く後ろへ敷いて輪郭をぼかしている
       *（`drawDecor` の halo）。こちらは塗りが1回増えるだけで費用は無視できる。
       */
      drawSeaweed(context, nearSeaweed, sand, tank, elapsed, strength, NEAR_STYLE)
      // 枝サンゴは動かないので、揺れる海藻のあとに重ねる
      drawCorals(context, nearCorals, sand, tank, strength, NEAR_STYLE)
      drawRocks(context, nearRocks, sand, tank, strength, NEAR_STYLE)

      drawVignette(context, tank, strength)
      drawBubbles(context, backBubbles, strength)
    },

    drawLane() {
      // 列を持たないテーマなので何もしない
    },

    /*
     * 絵の後ろの淡い光は入れていない。
     * 背景が暗かったときは輪郭が闇に溶けるので必要だったが、
     * 明るい水では**白く濁って絵の色が浅くなる**だけだった。
     */

    drawFront(context, _elapsed, strength) {
      drawBubbles(context, frontBubbles, strength)
    },
  }
}
