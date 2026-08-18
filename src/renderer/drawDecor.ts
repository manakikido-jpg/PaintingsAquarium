import {
  coralBranches,
  rockOutline,
  seaweedShape,
  shellOutline,
  shellRidges,
  shipwreckHull,
  shipwreckMasts,
  type Coral,
  type Point,
  type Rock,
  type Seaweed,
  type Shell,
  type Shipwreck,
  fanEdge,
  fanRibs,
  type Fan,
  tubeShapes,
  anemoneArms,
  type TubeCoral,
  type Anemone,
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

export type Rgb = readonly [number, number, number]

/**
 * サンゴの色。
 *
 * 最初は全部を黒い影絵にしていたが、狙っている見え方は**色鮮やかなサンゴ**だった。
 * ただし子どもの絵と彩度で殴り合うと、どちらも死ぬ。
 * ここは**絵より一段くすませた色**にしてあり、置き場所も画面の下に限っている。
 * 絵が泳ぐ中央は、情報の少ない綺麗な青のまま残すこと。
 */
/**
 * サンゴの塊（房の集まり）の色。
 *
 * 参考画像では、大きな塊は**生成り・淡い桃・淡い杏**で、枝サンゴの原色とは
 * 役割が違う。ここまで原色にすると下が騒がしくなり、絵が埋もれる。
 * 塊は面積が大きいので、彩度を落として明るさで見せる。
 */
export const HEAD_COLOURS: readonly Rgb[] = [
  [255, 250, 238], // 生成り
  [255, 232, 236], // 淡桃
  [255, 240, 220], // 淡杏
  [240, 246, 255], // 淡藍
]

export const CORAL_COLOURS: readonly Rgb[] = [
  [255, 56, 148], // 濃桃
  [255, 112, 64], // 朱
  [255, 214, 64], // 山吹
  [72, 244, 196], // 碧
  [255, 250, 232], // 生成り
  [178, 96, 255], // 菫
]

/** その層で色をどれだけ水に溶かすか、という設定。 */
export interface DecorStyle {
  /** 上面の光の縁の色（`rgba(...)` を丸ごと） */
  readonly rim: string
  /** 縁の太さ（ピクセル） */
  readonly rimWidth: number
  /** 濃さ 0〜1 */
  readonly alpha: number
  /**
   * 輪郭のまわりに敷く薄い影の広がり（本体の大きさに対する倍率）。
   * 0 で無し。`filter: blur()` の代わりに輪郭の硬さを取るためのもの。
   */
  readonly halo: number
  /** 水の色へ寄せる割合 0〜1。遠いほど大きい（空気遠近） */
  readonly fade: number
  /** 寄せる先の水の色 */
  readonly water: Rgb
}

/** その層の水の色。奥ほど明るい青に溶ける。 */
const NEAR_WATER: Rgb = [18, 62, 192]
const MID_WATER: Rgb = [26, 86, 224]
const FAR_WATER: Rgb = [42, 123, 240]

/** 手前（色がはっきり出る）。 */
export const NEAR_STYLE: DecorStyle = {
  rim: 'rgba(255, 255, 255, 0.62)',
  rimWidth: 1.8,
  alpha: 0.97,
  // 飾りを光らせる。参考にした見え方では、飾り自体が発光している
  halo: 0.085,
  // 水へ溶かす割合を下げて、色を濃く残す
  fade: 0.08,
  water: NEAR_WATER,
}

/** 中景。 */
export const MID_STYLE: DecorStyle = {
  rim: 'rgba(240, 252, 255, 0.4)',
  rimWidth: 1.5,
  alpha: 0.93,
  halo: 0.065,
  fade: 0.26,
  water: MID_WATER,
}

/** 遠景（ほとんど水に溶ける）。 */
export const FAR_STYLE: DecorStyle = {
  rim: 'rgba(226, 246, 255, 0.24)',
  rimWidth: 1.2,
  alpha: 0.88,
  // 遠景は焼き付けるときに本物のぼかしを掛けるので、こちらは要らない
  halo: 0,
  fade: 0.5,
  water: FAR_WATER,
}

/** 2色を混ぜる。`t` が 1 で b になる。 */
function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.min(1, Math.max(0, t))
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ]
}

function rgb(colour: Rgb): string {
  return `${colour[0]}, ${colour[1]}, ${colour[2]}`
}

/** その層で実際に使う色。空気遠近のぶんだけ水に溶かす。 */
function coralColour(index: number, style: DecorStyle): Rgb {
  return mix(CORAL_COLOURS[index % CORAL_COLOURS.length], style.water, style.fade)
}

/*
 * 海底の色。**白ではなく青い面**にする。
 * 白く敷くと霧が溜まったように見え、面として立たない。
 * 参考にした見え方でも、海底は青い面で、その上に白い光が乗っていた。
 */
const SAND = '138, 190, 246'

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

  /*
   * 海底を「面」として見せる。
   *
   * これまでは砂を**ぼんやりした明るみ**として敷いていただけで、
   * 水と海底の境目が無かった。参考にした見え方では、海底がはっきりした
   * 面として手前に横たわり、その上に光が乗っている。
   * **境目の線が1本あるかどうかで、奥行きの見え方が変わる。**
   */
  const groundPath = (): void => {
    context.beginPath()
    context.moveTo(0, tank.height)
    for (let index = 0; index < profile.length; index++) {
      const x = (index / Math.max(1, profile.length - 1)) * tank.width
      context.lineTo(x, profile[index])
    }
    context.lineTo(tank.width, tank.height)
    context.closePath()
  }

  const gradient = context.createLinearGradient(0, top, 0, tank.height)
  gradient.addColorStop(0, `rgba(${SAND}, ${0.34 * strength})`)
  gradient.addColorStop(0.35, `rgba(${SAND}, ${0.6 * strength})`)
  gradient.addColorStop(1, `rgba(${SAND}, ${0.86 * strength})`)

  context.fillStyle = gradient
  groundPath()
  context.fill()

  // 境目の光。海底の縁に当たっている光を1本入れると、面として立ち上がる
  context.save()
  context.beginPath()
  for (let index = 0; index < profile.length; index++) {
    const x = (index / Math.max(1, profile.length - 1)) * tank.width
    if (index === 0) context.moveTo(x, profile[index])
    else context.lineTo(x, profile[index])
  }
  context.strokeStyle = `rgba(236, 250, 255, ${0.5 * strength})`
  context.lineWidth = Math.max(1.5, tank.height * 0.0035)
  context.stroke()
  context.restore()
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
  colour: Rgb,
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
    context.fillStyle = `rgba(${rgb(colour)}, ${style.alpha * shade * strength * 0.3})`
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
  // 上は光が当たって明るく、下は水に沈んで暗い。単色だと切り絵に見える（R-011）。
  const lit = mix(colour, [255, 255, 255], 0.3)
  const deep = mix(colour, style.water, 0.55)

  if (bottom - top < 1) {
    context.fillStyle = `rgba(${rgb(colour)}, ${alpha})`
  } else {
    const shading = context.createLinearGradient(0, top, 0, bottom)
    shading.addColorStop(0, `rgba(${rgb(lit)}, ${alpha})`)
    shading.addColorStop(0.5, `rgba(${rgb(colour)}, ${alpha})`)
    shading.addColorStop(1, `rgba(${rgb(deep)}, ${alpha})`)
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
  const sorted = [...rocks].sort((a, b) => a.depth - b.depth)
  sorted.forEach((rock, index) => {
    // 少し砂に埋める。砂の線にちょうど乗せると置物のように浮いて見える。
    const outline = rockOutline(rock, groundAt(profile, rock.x, tank) + rock.height * 0.08)
    /*
     * 塊は発光して見せる。参考画像では、白い塊が水の中でいちばん光っている。
     * 房の集まりは面積が大きいので、halo を強めると
     * 「後ろから照らされた珊瑚」に見える。
     */
    const colour = mix(
      HEAD_COLOURS[Math.floor(rock.seed) % HEAD_COLOURS.length],
      style.water,
      style.fade * 0.55,
    )
    /*
     * 光らせすぎると輪郭が溶けて**雲**に見える。
     * 一度 2.1倍＋0.03 まで上げて失敗した。形が読める範囲に戻す。
     */
    const glowing: DecorStyle = { ...style, halo: style.halo * 1.15 }
    paintSilhouette(context, outline, glowing, strength, colour, 0.92 + rock.depth * 0.08)
    void index
  })
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

  const sorted = [...weeds].sort((a, b) => a.depth - b.depth)
  sorted.forEach((weed, order) => {
    const nodes = seaweedShape(weed, timeSeconds, groundAt(profile, weed.baseX, tank) + 2)
    if (nodes.length === 0) return

    // 節の列を、左側を上りながら・右側を下りながら 1 つの形にする。
    const points: Point[] = []
    for (const node of nodes) points.push({ x: node.x - node.halfWidth, y: node.y })
    for (let index = nodes.length - 1; index >= 0; index--) {
      points.push({ x: nodes[index].x + nodes[index].halfWidth, y: nodes[index].y })
    }

    // 同じ株の葉は同じ色にする。1枚ずつ色が違うと、束ではなく寄せ集めに見える。
    const cluster = Math.floor(order / 3)
    paintSilhouette(context, points, style, strength, coralColour(cluster, style), 0.85 + weed.depth * 0.15)
  })
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
  const hullColour = mix([94, 122, 140], style.water, style.fade)
  context.strokeStyle = `rgba(${rgb(hullColour)}, ${style.alpha * strength})`

  for (const mast of shipwreckMasts(wreck, groundY)) {
    context.lineWidth = mast.width
    context.beginPath()
    context.moveTo(mast.from.x, mast.from.y)
    context.lineTo(mast.to.x, mast.to.y)
    context.stroke()
  }

  paintSilhouette(context, shipwreckHull(wreck, groundY), style, strength, hullColour)
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
  const sorted = [...shells].sort((a, b) => a.depth - b.depth)
  sorted.forEach((shell, order) => {
    const groundY = groundAt(profile, shell.x, tank)
    paintSilhouette(
      context,
      shellOutline(shell, groundY),
      style,
      strength,
      coralColour(order + 2, style),
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
  })
  context.restore()
}

/**
 * 枝サンゴ。
 *
 * 枝を線で描き、先端ほど明るくしている。
 * 全部同じ色で塗ると枝の重なりが潰れて、ただの塊に見える。
 */
export function drawCorals(
  context: CanvasRenderingContext2D,
  corals: readonly Coral[],
  profile: readonly number[],
  tank: Tank,
  strength: number,
  style: DecorStyle = NEAR_STYLE,
): void {
  if (strength <= 0) return

  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'

  for (const coral of [...corals].sort((a, b) => a.depth - b.depth)) {
    const groundY = groundAt(profile, coral.x, tank)
    const base = coralColour(coral.colour, style)
    const alpha = style.alpha * (0.82 + coral.depth * 0.18) * strength

    for (const branch of coralBranches(coral, groundY)) {
      // 先端へ向かって白を混ぜる。日の当たる先のほうが明るいサンゴの見え方に合う。
      const colour = mix(base, [255, 255, 255], branch.level * 0.35)
      context.strokeStyle = `rgba(${rgb(colour)}, ${alpha})`
      context.lineWidth = Math.max(1, branch.width)
      context.beginPath()
      context.moveTo(branch.from.x, branch.from.y)
      context.lineTo(branch.to.x, branch.to.y)
      context.stroke()
    }
  }

  context.restore()
}

/**
 * 扇サンゴを描く。
 *
 * 骨を1本ずつ線で描き、その内側に薄い塗りを敷く。
 * 塗りだけだと平たい板に、線だけだと透けすぎて存在感が出ない。
 * **線と塗りの両方**でようやく「網目の扇」に見える。
 */
export function drawFans(
  context: CanvasRenderingContext2D,
  fans: readonly Fan[],
  profile: readonly number[],
  tank: Tank,
  strength: number,
  style: DecorStyle = MID_STYLE,
): void {
  if (strength <= 0) return

  const sorted = [...fans].sort((a, b) => a.depth - b.depth)
  for (const fan of sorted) {
    const groundY = groundAt(profile, fan.x, tank)
    const colour = coralColour(fan.seed, style)
    const alpha = style.alpha * strength * (0.62 + fan.depth * 0.3)

    // 内側の薄い塗り
    const edge = fanEdge(fan, groundY)
    context.beginPath()
    context.moveTo(edge[0].x, edge[0].y)
    for (const point of edge.slice(1)) context.lineTo(point.x, point.y)
    context.closePath()
    context.fillStyle = `rgba(${rgb(colour)}, ${alpha * 0.3})`
    context.fill()

    // 骨
    context.lineCap = 'round'
    context.strokeStyle = `rgba(${rgb(colour)}, ${alpha})`
    context.lineWidth = Math.max(1.2, fan.height * 0.028)
    for (const rib of fanRibs(fan, groundY)) {
      context.beginPath()
      context.moveTo(rib[0].x, rib[0].y)
      for (const point of rib.slice(1)) context.lineTo(point.x, point.y)
      context.stroke()
    }
  }
}

/**
 * 管サンゴを描く。丸い口が並んだ束。
 * 口を明るい輪で描くのは、参考にした見え方でここが光って見えていたため。
 */
export function drawTubeCorals(
  context: CanvasRenderingContext2D,
  corals: readonly TubeCoral[],
  profile: readonly number[],
  tank: Tank,
  strength: number,
  style: DecorStyle = MID_STYLE,
): void {
  if (strength <= 0) return

  const sorted = [...corals].sort((a, b) => a.depth - b.depth)
  for (const coral of sorted) {
    const groundY = groundAt(profile, coral.x, tank)
    const colour = coralColour(coral.seed, style)
    const alpha = style.alpha * strength * (0.7 + coral.depth * 0.25)

    for (const tube of tubeShapes(coral, groundY)) {
      // 管の胴
      context.fillStyle = `rgba(${rgb(colour)}, ${alpha})`
      context.beginPath()
      context.moveTo(tube.x - tube.halfWidth, tube.bottom)
      context.lineTo(tube.x - tube.halfWidth, tube.top + tube.halfWidth)
      context.quadraticCurveTo(tube.x, tube.top - tube.halfWidth * 0.4, tube.x + tube.halfWidth, tube.top + tube.halfWidth)
      context.lineTo(tube.x + tube.halfWidth, tube.bottom)
      context.closePath()
      context.fill()

      // 口の光
      context.strokeStyle = style.rim
      context.lineWidth = Math.max(1, tube.halfWidth * 0.5)
      context.beginPath()
      context.ellipse(tube.x, tube.top + tube.halfWidth * 0.4, tube.halfWidth * 0.72, tube.halfWidth * 0.34, 0, 0, Math.PI * 2)
      context.stroke()
    }
  }
}

/**
 * イソギンチャクを描く。
 * 触手は線、根元は塗り。線だけだと浮いて見え、塗りだけだと饅頭に見える。
 */
export function drawAnemones(
  context: CanvasRenderingContext2D,
  anemones: readonly Anemone[],
  profile: readonly number[],
  tank: Tank,
  strength: number,
  style: DecorStyle = MID_STYLE,
): void {
  if (strength <= 0) return

  const sorted = [...anemones].sort((a, b) => a.depth - b.depth)
  for (const anemone of sorted) {
    const groundY = groundAt(profile, anemone.x, tank)
    const colour = coralColour(anemone.seed, style)
    const alpha = style.alpha * strength * (0.62 + anemone.depth * 0.3)

    // 根元の塊
    context.fillStyle = `rgba(${rgb(colour)}, ${alpha * 0.85})`
    context.beginPath()
    context.ellipse(anemone.x, groundY, anemone.radius * 0.42, anemone.radius * 0.3, 0, Math.PI, Math.PI * 2)
    context.fill()

    context.lineCap = 'round'
    context.strokeStyle = `rgba(${rgb(colour)}, ${alpha})`
    context.lineWidth = Math.max(1.1, anemone.radius * 0.055)
    for (const arm of anemoneArms(anemone, groundY)) {
      context.beginPath()
      context.moveTo(arm[0].x, arm[0].y)
      for (const point of arm.slice(1)) context.lineTo(point.x, point.y)
      context.stroke()
    }
  }
}
