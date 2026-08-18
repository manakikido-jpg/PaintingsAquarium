import type { Tank } from './swim'
import { seededRandom } from './random'

/**
 * 水槽の底の飾り（砂地・岩・海藻）の形。
 *
 * すべて**絵より奥**に、**暗いシルエット**として描く前提で作ってある。
 * 手前に置くと子どもの絵が隠れ、色を付けると絵と派手さで喧嘩する。
 * ここは形と揺れの計算だけを持ち、色と描き方は画面側に置く。
 */


// ---------------------------------------------------------------- 砂地

/**
 * 砂地の上面の高さ。左端から右端まで `samples` 点ぶん返す。
 *
 * 乱数を点ごとに振ると砂ではなく「ノコギリ」になるので、
 * 波長の違う 3 本の sin を足して滑らかな起伏にしている。
 */
export function sandProfile(seed: number, tank: Tank, samples = 48): number[] {
  const random = seededRandom(seed)
  const waves = Array.from({ length: 3 }, (_, index) => ({
    length: tank.width / (1.2 + index * 1.9),
    height: tank.height * (0.030 / (index + 1)),
    phase: random() * Math.PI * 2,
  }))

  const base = tank.height * 0.9
  const points: number[] = []

  for (let index = 0; index < samples; index++) {
    const x = samples === 1 ? 0 : (index / (samples - 1)) * tank.width
    let y = base
    for (const wave of waves) {
      y -= Math.sin((x / Math.max(1, wave.length)) * Math.PI * 2 + wave.phase) * wave.height
    }
    points.push(y)
  }

  return points
}

/** 画面上の横方向の範囲。0（左端）〜1（右端）。 */
export interface Span {
  readonly from: number
  readonly to: number
}

/**
 * 0〜1 の位置を、避けたい範囲の外へ写す。
 *
 * 同じ濃さのシルエットどうしが重なると輪郭が消え、**1 つの黒い塊**になる。
 * 沈没船の前に海藻や岩が生えると、船の形が読めなくなるのはそのため（R-006）。
 * 単純に「範囲内なら端へ寄せる」と境目に固まるので、
 * 残った幅に均等に割り直している。
 */
export function placeOutside(t: number, avoid?: Span): number {
  if (!avoid) return t
  const gap = Math.max(0, Math.min(1, avoid.to) - Math.max(0, avoid.from))
  if (gap <= 0 || gap >= 1) return t

  const scaled = Math.min(1, Math.max(0, t)) * (1 - gap)
  return scaled < avoid.from ? scaled : scaled + gap
}

// ---------------------------------------------------------------- 岩

export interface Rock {
  /**
   * 頂点の左右のずれ（-1〜1）。0 なら真ん中。
   *
   * これが無いと**左右対称の半円**になり、石ではなく「ドーム」に見える。
   * 自然の石で左右対称のものは無い。
   */
  readonly skew: number
  readonly x: number
  readonly halfWidth: number
  readonly height: number
  /** 0〜1。大きいほど手前（濃く描く） */
  readonly depth: number
  readonly seed: number
}

/**
 * 飾りの高さの倍率。
 *
 * 参考画像（teamLab のお絵かき水族館）では、飾りが**画面の1/3ほどまで
 * 立ち上がる大きな塊**になっている。低い帯のままだと、賑やかさが出ない。
 *
 * 高くしても**絵は隠れない**。飾りは絵より先に描くので、絵は必ず上に乗る。
 * 隠れないが**見つけにくくはなる**ので、絵が泳ぐ中央は空けたまま
 * （それぞれの `spawn` が画面の下と左右に置くようになっている）。
 */
export interface DecorHeight {
  readonly heightScale?: number
  /** 飾りを寄せる位置（0=左端, 1=右端）。省略すると全体に散らす */
  readonly clusterAt?: number
  /** 寄せの広がり。小さいほど固まる */
  readonly clusterSpread?: number
}

/** 置き場所を決める。寄せ先が指定されていればそちらへ固める。 */
function placeAcross(
  t: number,
  avoid: Span | undefined,
  clusterAt: number | undefined,
  clusterSpread: number,
): number {
  if (clusterAt === undefined) return placeOutside(t, avoid)
  return clusterAcross(t, clusterAt, clusterSpread)
}

export function spawnRocks(
  seed: number,
  count: number,
  tank: Tank,
  avoid?: Span,
  { heightScale = 1, clusterAt, clusterSpread = 0.5 }: DecorHeight = {},
): Rock[] {
  const random = seededRandom(seed)
  const rocks: Rock[] = []

  for (let index = 0; index < count; index++) {
    // 等間隔の枠の中でずらす。完全な乱数だと固まって置かれ、
    // 岩場ではなく「1つの大きな塊」に見える。
    const slot = (index + 0.5) / count + (random() - 0.5) * 0.7 / count
    rocks.push({
      x: tank.width * placeAcross(slot, avoid, clusterAt, clusterSpread),
      // 参考の塊は横に長い大きな石。細く高くすると柱に見える
      // 大きさのばらつきを広く取る。揃っていると並べた置物に見える
      halfWidth: tank.width * (0.035 + random() * random() * 0.16),
      skew: (random() - 0.5) * 1.2,
      height: tank.height * (0.028 + random() * random() * 0.11) * heightScale,
      depth: random(),
      seed: Math.floor(random() * 100000) + 1,
    })
  }

  return rocks
}

/** 沈没船が画面のどこを占めるか。海藻や岩を生やさない範囲として使う。 */
export function shipwreckSpan(wreck: Shipwreck, tank: Tank): Span {
  // 帆柱の傾きぶん、船体より少し広めに空ける。
  const half = (wreck.width / 2 / Math.max(1, tank.width)) * 1.25
  const centre = wreck.x / Math.max(1, tank.width)
  return { from: Math.max(0, centre - half), to: Math.min(1, centre + half) }
}

export interface Point {
  readonly x: number
  readonly y: number
}

/**
 * 岩の輪郭。砂の上に伏せたドーム型。
 *
 * 半径を頂点ごとの乱数でずらすと、隣り合う点が独立に跳ねて
 * 岩ではなく**ノコギリ**になる。角度に対して波長の長い波を 2 本足し、
 * 「なだらかだが左右非対称」な形にしている。
 */
export function rockOutline(rock: Rock, groundY: number, steps = 40): Point[] {
  const random = seededRandom(rock.seed)
  /*
   * **丸くて大きな石**にする。
   *
   * 一度は「房が重なったサンゴ」にしたが、**細かい凹凸を足したせいで
   * 何の形か読めなくなった**（「変なシルエット」と言われた）。
   * 参考にした見え方の塊は、でこぼこしていない**なめらかな石**で、
   * 明るい一色で塗られている。デフォルメされた絵なので、
   * 情報を足すほど遠ざかる。
   *
   * 波は2本だけ、振れ幅も小さく。石だと分かる程度の歪みで止める。
   */
  const lumps = [
    { waves: 2, size: 0.07, phase: random() * Math.PI * 2 },
    { waves: 3, size: 0.045, phase: random() * Math.PI * 2 },
  ]
  const points: Point[] = []

  for (let index = 0; index <= steps; index++) {
    const t = index / steps
    const angle = Math.PI * t
    let radius = 1
    for (const lump of lumps) radius += Math.sin(angle * lump.waves + lump.phase) * lump.size

    /*
     * 頂点を左右へずらす。`t` を歪ませると、片側が急で片側がなだらかになる。
     * 左右対称の半円は石に見えない。
     */
    const skewed = t + rock.skew * Math.sin(Math.PI * t) * 0.22
    const at = Math.PI * Math.min(1, Math.max(0, skewed))

    points.push({
      x: rock.x - Math.cos(angle) * rock.halfWidth * radius,
      y: groundY - Math.sin(at) * rock.height * radius,
    })
  }

  return points
}

// ---------------------------------------------------------------- 海藻

export interface Seaweed {
  readonly baseX: number
  readonly height: number
  /** 根元の半幅 */
  readonly halfWidth: number
  readonly swayPhase: number
  readonly swaySpeed: number
  readonly swayAmplitude: number
  /** 上に行くほど曲がる度合い */
  readonly curl: number
  /**
   * 先端が横へ開く量（ピクセル）。株の中で葉ごとに変える。
   * これが無いと葉が全部まっすぐ上を向き、扇ではなく**棘の束**に見える。
   */
  readonly lean: number
  /** 0〜1。大きいほど手前（濃く描く） */
  readonly depth: number
  readonly segments: number
}

/**
 * 海藻を生やす。`clusters` は株の数で、返るのは葉の数（1 株につき数枚）。
 *
 * 1 株 1 枚にすると、細い線が 1 本立っているだけで**竹串**にしか見えない。
 * 高さと揺れをわずかにずらした葉を束ねると、はじめて海藻の房に見える。
 */
export function spawnSeaweed(
  seed: number,
  clusters: number,
  tank: Tank,
  avoid?: Span,
  { heightScale = 1, clusterAt, clusterSpread = 0.5 }: DecorHeight = {},
): Seaweed[] {
  const random = seededRandom(seed)
  const weeds: Seaweed[] = []

  const spread = tank.width * 0.012
  // 株の中心ではなく**葉の端**で避ける。中心だけで判定すると、
  // 横に広がった葉が範囲へはみ出す。
  const widened: Span | undefined = avoid && {
    from: avoid.from - spread / 2 / Math.max(1, tank.width),
    to: avoid.to + spread / 2 / Math.max(1, tank.width),
  }

  for (let index = 0; index < clusters; index++) {
    const depth = random()
    const slot = (index + 0.5) / clusters + (random() - 0.5) * 0.8 / clusters
    const rootX = tank.width * placeAcross(slot, widened, clusterAt, clusterSpread)
    const rootHeight = tank.height * (0.11 + depth * 0.2) * heightScale
    const blades = 3 + Math.floor(random() * 2)

    for (let blade = 0; blade < blades; blade++) {
      const across = blades === 1 ? 0 : blade / (blades - 1) - 0.5
      weeds.push({
        baseX: rootX + across * spread,
        lean: across * rootHeight * 0.55,
        // 手前の株ほど高く見せて奥行きを出す
        height: rootHeight * (0.7 + random() * 0.55),
        halfWidth: tank.width * (0.005 + random() * 0.006),
        swayPhase: random() * Math.PI * 2,
        // 同じ株の葉は近い速さで揺れる。バラバラだと束に見えない。
        swaySpeed: 0.32 + depth * 0.25 + random() * 0.12,
        swayAmplitude: tank.width * (0.009 + random() * 0.014),
        curl: 1.2 + random() * 1.8,
        depth,
        segments: 12,
      })
    }
  }

  return weeds
}

export interface SeaweedNode extends Point {
  readonly halfWidth: number
}

/**
 * ある時刻での海藻の形。根元から先端へ向かう節の列を返す。
 *
 * 揺れ幅を `t` の 1.7 乗で掛けているのは、根元は動かず先端ほど大きく
 * 揺れるようにするため。全体を同じだけ揺らすと、生えているのではなく
 * 棒が横に平行移動しているように見える。
 */
export function seaweedShape(weed: Seaweed, timeSeconds: number, groundY: number): SeaweedNode[] {
  const nodes: SeaweedNode[] = []

  for (let index = 0; index <= weed.segments; index++) {
    const t = index / weed.segments
    const angle = weed.swayPhase + timeSeconds * weed.swaySpeed + t * weed.curl
    nodes.push({
      x: weed.baseX + weed.lean * t * t + Math.sin(angle) * weed.swayAmplitude * Math.pow(t, 1.7),
      y: groundY - weed.height * t,
      // 先端へ向けて細くする。根元と同じ太さのままだと海藻に見えない。
      halfWidth: weed.halfWidth * (1 - t * t * 0.9),
    })
  }

  return nodes
}

// ---------------------------------------------------------------- 貝殻

/** 扇の筋の数。縁の波打ちの山数と揃えると貝らしく見える。 */
export const SHELL_RIDGES = 7

export interface Shell {
  readonly x: number
  readonly halfWidth: number
  readonly height: number
  /** 傾き（ラジアン）。まっすぐ立っていると作り物に見える */
  readonly tilt: number
  readonly depth: number
  readonly seed: number
}

export function spawnShells(seed: number, count: number, tank: Tank): Shell[] {
  const random = seededRandom(seed)
  const shells: Shell[] = []

  for (let index = 0; index < count; index++) {
    const slot = (index + 0.5) / count
    const size = tank.width * (0.013 + random() * 0.012)
    shells.push({
      x: tank.width * (slot + (random() - 0.5) * 0.8 / count),
      halfWidth: size,
      height: size * (0.85 + random() * 0.3),
      tilt: (random() - 0.5) * 0.7,
      depth: random(),
      seed: Math.floor(random() * 100000) + 1,
    })
  }

  return shells
}

function rotateAround(point: Point, origin: Point, angle: number): Point {
  const sin = Math.sin(angle)
  const cos = Math.cos(angle)
  const dx = point.x - origin.x
  const dy = point.y - origin.y
  return { x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos }
}

/**
 * 帆立貝の形。蝶番を砂に置き、そこから扇形に開く。
 * 縁は波打たせる。きれいな円弧のままだと扇子に見える。
 */
export function shellOutline(shell: Shell, groundY: number, steps = 20): Point[] {
  const hinge: Point = { x: shell.x, y: groundY }
  const points: Point[] = [hinge]
  const span = Math.PI * 0.78

  for (let index = 0; index <= steps; index++) {
    const t = index / steps
    const angle = -Math.PI / 2 - span / 2 + span * t
    // 縁の波打ち。山の数を扇の筋の数と揃えると、貝らしく見える。
    const ripple = 1 + Math.sin(t * Math.PI * SHELL_RIDGES) * 0.05
    points.push(
      rotateAround(
        {
          x: shell.x + Math.cos(angle) * shell.halfWidth * ripple,
          y: groundY + Math.sin(angle) * shell.height * ripple,
        },
        hinge,
        shell.tilt,
      ),
    )
  }

  return points
}

/** 扇の筋。蝶番から縁へ向かう線の組。 */
export function shellRidges(shell: Shell, groundY: number): { from: Point; to: Point }[] {
  const hinge: Point = { x: shell.x, y: groundY }
  const span = Math.PI * 0.78
  const lines: { from: Point; to: Point }[] = []

  for (let index = 1; index < SHELL_RIDGES; index++) {
    const t = index / SHELL_RIDGES
    const angle = -Math.PI / 2 - span / 2 + span * t
    lines.push({
      from: hinge,
      to: rotateAround(
        {
          x: shell.x + Math.cos(angle) * shell.halfWidth * 0.92,
          y: groundY + Math.sin(angle) * shell.height * 0.92,
        },
        hinge,
        shell.tilt,
      ),
    })
  }

  return lines
}

// ---------------------------------------------------------------- 沈没船

export interface Shipwreck {
  readonly x: number
  readonly width: number
  readonly height: number
  /** 傾き（ラジアン）。水平に置くと沈んだ船に見えない */
  readonly tilt: number
  /** 砂にどれだけ埋まっているか（高さに対する割合） */
  readonly buried: number
}

export function spawnShipwreck(tank: Tank, at = 0.72): Shipwreck {
  return {
    x: tank.width * at,
    width: tank.width * 0.24,
    height: tank.height * 0.16,
    tilt: -0.15,
    buried: 0.06,
  }
}

/** 船体の輪郭（単位座標。y は上が負）。 */
const HULL_SHAPE: readonly Point[] = [
  { x: -0.5, y: -0.66 },
  { x: 0.5, y: -0.6 },
  { x: 0.46, y: -0.1 },
  { x: 0.16, y: 0.06 },
  { x: -0.22, y: 0.05 },
  { x: -0.44, y: -0.14 },
]

function placeWreckPoint(wreck: Shipwreck, local: Point, groundY: number): Point {
  const base: Point = { x: wreck.x, y: groundY + wreck.height * wreck.buried }
  return rotateAround(
    { x: base.x + local.x * wreck.width, y: base.y + local.y * wreck.height },
    base,
    wreck.tilt,
  )
}

export function shipwreckHull(wreck: Shipwreck, groundY: number): Point[] {
  return HULL_SHAPE.map((local) => placeWreckPoint(wreck, local, groundY))
}

export interface WreckMast {
  readonly from: Point
  readonly to: Point
  readonly width: number
}

/**
 * 折れた帆柱と横木。
 * まっすぐ 1 本立てると帆船ではなく「棒の刺さった箱」に見えるので、
 * 長さの違う 2 本と横木を組み合わせている。
 */
export function shipwreckMasts(wreck: Shipwreck, groundY: number): WreckMast[] {
  const place = (local: Point): Point => placeWreckPoint(wreck, local, groundY)
  const thick = wreck.width * 0.016

  return [
    // 主帆柱
    { from: place({ x: -0.04, y: -0.52 }), to: place({ x: -0.14, y: -2.2 }), width: thick },
    // 折れた前帆柱
    { from: place({ x: 0.28, y: -0.52 }), to: place({ x: 0.34, y: -1.3 }), width: thick * 0.8 },
    // 横木。これが1本あるだけで帆船に見える。
    { from: place({ x: -0.38, y: -1.6 }), to: place({ x: 0.08, y: -1.66 }), width: thick * 0.7 },
    // 船首から前へ突き出す棒。船首の向きが分かるようになる。
    { from: place({ x: 0.5, y: -0.8 }), to: place({ x: 0.95, y: -1.05 }), width: thick * 0.7 },
  ]
}

// ---------------------------------------------------------------- 枝サンゴ

export interface Coral {
  readonly x: number
  readonly height: number
  /** 幹の根元の太さ（半分） */
  readonly halfWidth: number
  /** 枝が分かれる回数 */
  readonly depthLevels: number
  readonly depth: number
  readonly seed: number
  /** 何番目の色を使うか */
  readonly colour: number
}

export function spawnCorals(
  seed: number,
  count: number,
  tank: Tank,
  avoid?: Span,
  { heightScale = 1, clusterAt, clusterSpread = 0.5 }: DecorHeight = {},
): Coral[] {
  const random = seededRandom(seed)
  const corals: Coral[] = []

  for (let index = 0; index < count; index++) {
    const slot = (index + 0.5) / count + (random() - 0.5) * 0.85 / count
    const depth = random()
    corals.push({
      x: tank.width * placeAcross(slot, avoid, clusterAt, clusterSpread),
      // 海藻より低く抑える。高いと絵の泳ぐ範囲に食い込む。
      height: tank.height * (0.07 + depth * 0.09 + random() * 0.04) * heightScale,
      // 太くする。細いと「棘」に見えて、デフォルメした絵から外れる
      halfWidth: tank.width * (0.009 + random() * 0.007),
      depthLevels: 3 + Math.floor(random() * 2),
      depth,
      seed: Math.floor(random() * 100000) + 1,
      colour: Math.floor(random() * 6),
    })
  }

  return corals
}

export interface CoralBranch {
  readonly from: Point
  readonly to: Point
  readonly width: number
  /** 0（根元）〜1（先端）。先ほど明るく描くために使う */
  readonly level: number
}

/**
 * 枝サンゴの枝。
 *
 * 海藻（葉が上へ伸びるだけ）と違い、**分かれること**が形の要。
 * 分かれない形にすると海藻と見分けがつかず、種類を増やした意味が無くなる。
 * 枝ごとに角度を変え、上へ行くほど短く細くする。
 */
export function coralBranches(coral: Coral, groundY: number): CoralBranch[] {
  const random = seededRandom(coral.seed)
  const branches: CoralBranch[] = []

  const grow = (
    from: Point,
    angle: number,
    length: number,
    width: number,
    level: number,
  ): void => {
    const to: Point = {
      x: from.x + Math.sin(angle) * length,
      y: from.y - Math.cos(angle) * length,
    }
    branches.push({ from, to, width, level: level / coral.depthLevels })

    if (level >= coral.depthLevels) return

    // 2〜3 本に分かれる。毎回2本だと左右対称の作り物に見える。
    const children = random() < 0.45 ? 3 : 2
    for (let index = 0; index < children; index++) {
      const spread = (index / Math.max(1, children - 1) - 0.5) * (0.9 + random() * 0.5)
      grow(to, angle + spread, length * (0.62 + random() * 0.16), width * 0.68, level + 1)
    }
  }

  grow(
    { x: coral.x, y: groundY },
    (random() - 0.5) * 0.3,
    coral.height * 0.42,
    coral.halfWidth * 2,
    1,
  )

  return branches
}

/* ------------------------------------------------------------------
 * 扇サンゴ（ウミウチワ）
 *
 * 参考画像には「枝」と「房」のほかに、**扇のように平たく広がる**サンゴがある。
 * 形の種類が2つしかないと、数を増やしても同じものが並んでいるようにしか
 * 見えない。**賑やかさは数ではなく種類の差から出る。**
 * ------------------------------------------------------------------ */

export interface Fan {
  readonly x: number
  /** 扇の付け根から先端までの長さ */
  readonly height: number
  /** 扇が開く角度（ラジアン） */
  readonly spread: number
  /** 扇全体の傾き（ラジアン）。0 で真上 */
  readonly tilt: number
  /** 骨の本数 */
  readonly ribs: number
  /** 0〜1。大きいほど手前 */
  readonly depth: number
  readonly seed: number
}

export function spawnFans(
  seed: number,
  count: number,
  tank: Tank,
  avoid?: Span,
  { heightScale = 1, clusterAt, clusterSpread = 0.5 }: DecorHeight = {},
): Fan[] {
  const random = seededRandom(seed)
  const fans: Fan[] = []

  for (let index = 0; index < count; index++) {
    const depth = random()
    fans.push({
      x: placeAcross(random(), avoid, clusterAt, clusterSpread) * tank.width,
      height: tank.height * (0.08 + depth * 0.1 + random() * 0.04) * heightScale,
      // 開きすぎると扇ではなく半円の板に見える
      spread: 0.7 + random() * 0.5,
      // 少し傾けると、水の流れに向いているように見える
      tilt: (random() - 0.5) * 0.5,
      ribs: 7 + Math.floor(random() * 6),
      depth,
      seed: Math.floor(random() * 100000),
    })
  }
  return fans
}

/**
 * 扇の骨を1本ずつ返す。
 *
 * 骨は根元から放射状に伸ばし、**先端ほど外へ反らせる**。
 * まっすぐ伸ばすと扇ではなく「串の束」に見える（海藻で同じ失敗をしている）。
 * 中央の骨をいちばん長くするのは、扇の輪郭を丸くするため。
 */
export function fanRibs(fan: Fan, groundY: number, steps = 6): Point[][] {
  const random = seededRandom(fan.seed)
  const base: Point = { x: fan.x, y: groundY }
  const ribs: Point[][] = []

  for (let index = 0; index < fan.ribs; index++) {
    // -1（左端）〜 +1（右端）
    const across = fan.ribs === 1 ? 0 : (index / (fan.ribs - 1)) * 2 - 1
    // 中央が長く、端が短い
    const length = fan.height * (0.62 + 0.38 * Math.cos((across * Math.PI) / 2))
    const angle = fan.tilt + (across * fan.spread) / 2
    const curl = across * (0.25 + random() * 0.2)

    const points: Point[] = []
    for (let step = 0; step <= steps; step++) {
      const t = step / steps
      // 先端ほど外へ反る
      const at = angle + curl * t * t
      points.push({
        x: base.x + Math.sin(at) * length * t,
        y: base.y - Math.cos(at) * length * t,
      })
    }
    ribs.push(points)
  }
  return ribs
}

/** 扇の外周（骨の先端をつないだ線）。塗りに使う。 */
export function fanEdge(fan: Fan, groundY: number): Point[] {
  const ribs = fanRibs(fan, groundY)
  return [ribs[0][0], ...ribs.map((rib) => rib[rib.length - 1])]
}

/**
 * 飾りを片側へ寄せる。
 *
 * 参考画像の構図は**左右対称ではない**。片側に大きな塊があり、
 * 反対側は開けた青で、そこに絵が浮いている。
 * 均一な帯にすると、賑やかでも「壁紙」に見えてしまう。
 *
 * `centre` に寄せ、`spread` で広がりを決める。返す値は 0〜1。
 */
export function clusterAcross(t: number, centre: number, spread: number): number {
  // 0〜1 を -1〜1 に直し、両端ほど薄くなる曲線にする（中央が濃い）
  const signed = t * 2 - 1
  const eased = Math.sign(signed) * Math.pow(Math.abs(signed), 1.7)
  return Math.min(1, Math.max(0, centre + eased * spread))
}

/* ------------------------------------------------------------------
 * 管サンゴ と イソギンチャク
 *
 * 参考画像には、枝・房・扇のほかに
 * **丸い口の管が束になったもの**と、**細い触手が密に生えた塊**がある。
 * 形が増えるほど、同じ数でも「群れ」に見える。
 *
 * どちらも**焼き付ける層にだけ置く**。毎フレームの描画を増やさないため
 *（50匹で 10.5fps しか出ていない）。
 * ------------------------------------------------------------------ */

export interface TubeCoral {
  readonly x: number
  readonly height: number
  readonly halfWidth: number
  /** 管の本数 */
  readonly tubes: number
  readonly depth: number
  readonly seed: number
}

export function spawnTubeCorals(
  seed: number,
  count: number,
  tank: Tank,
  avoid?: Span,
  { heightScale = 1, clusterAt, clusterSpread = 0.5 }: DecorHeight = {},
): TubeCoral[] {
  const random = seededRandom(seed)
  const corals: TubeCoral[] = []
  for (let index = 0; index < count; index++) {
    const depth = random()
    corals.push({
      x: tank.width * placeAcross((index + 0.5) / count, avoid, clusterAt, clusterSpread),
      height: tank.height * (0.05 + depth * 0.06 + random() * 0.03) * heightScale,
      halfWidth: tank.width * (0.012 + random() * 0.016),
      tubes: 3 + Math.floor(random() * 4),
      depth,
      seed: Math.floor(random() * 100000),
    })
  }
  return corals
}

export interface Tube {
  readonly x: number
  readonly halfWidth: number
  readonly top: number
  readonly bottom: number
}

/**
 * 管を1本ずつ返す。
 *
 * 高さを揃えないのは、揃えると**柵**に見えるため。
 * 中央を高く、端を低くして、束として見えるようにする。
 */
export function tubeShapes(coral: TubeCoral, groundY: number): Tube[] {
  const random = seededRandom(coral.seed)
  const tubes: Tube[] = []
  for (let index = 0; index < coral.tubes; index++) {
    const across = coral.tubes === 1 ? 0 : (index / (coral.tubes - 1)) * 2 - 1
    const height = coral.height * (0.55 + 0.45 * Math.cos((across * Math.PI) / 2)) * (0.85 + random() * 0.3)
    tubes.push({
      x: coral.x + across * coral.halfWidth,
      halfWidth: (coral.halfWidth / coral.tubes) * (0.8 + random() * 0.5),
      top: groundY - height,
      bottom: groundY,
    })
  }
  return tubes
}

export interface Anemone {
  readonly x: number
  readonly radius: number
  /** 触手の本数 */
  readonly arms: number
  readonly depth: number
  readonly seed: number
}

export function spawnAnemones(
  seed: number,
  count: number,
  tank: Tank,
  avoid?: Span,
  { heightScale = 1, clusterAt, clusterSpread = 0.5 }: DecorHeight = {},
): Anemone[] {
  const random = seededRandom(seed)
  const anemones: Anemone[] = []
  for (let index = 0; index < count; index++) {
    const depth = random()
    anemones.push({
      x: tank.width * placeAcross((index + 0.5) / count, avoid, clusterAt, clusterSpread),
      radius: tank.height * (0.035 + depth * 0.04 + random() * 0.02) * heightScale,
      arms: 14 + Math.floor(random() * 12),
      depth,
      seed: Math.floor(random() * 100000),
    })
  }
  return anemones
}

/**
 * 触手を1本ずつ返す。
 *
 * 根元から放射状に**上半分だけ**に生やす。全周に生やすと地面へ潜る。
 * 長さを1本ずつ変えるのは、揃えると**ウニ**に見えるため。
 */
export function anemoneArms(anemone: Anemone, groundY: number, steps = 4): Point[][] {
  const random = seededRandom(anemone.seed)
  const arms: Point[][] = []
  for (let index = 0; index < anemone.arms; index++) {
    // -80度 〜 +80度。真横まで倒すと地面に埋まる
    const angle = (index / Math.max(1, anemone.arms - 1) - 0.5) * (Math.PI * 0.89)
    const length = anemone.radius * (0.7 + random() * 0.6)
    const curl = (random() - 0.5) * 0.7

    const points: Point[] = []
    for (let step = 0; step <= steps; step++) {
      const t = step / steps
      /*
       * 反りを足すと 90 度を超えることがあり、そのぶん先端が**地面より下**へ出る。
       * 単体テストが 0.6px の潜り込みを捕まえた。ここで角度を頭打ちにする。
       */
      const limit = Math.PI / 2 - 0.02
      const at = Math.min(limit, Math.max(-limit, angle + curl * t * t))
      points.push({
        x: anemone.x + Math.sin(at) * length * t,
        y: groundY - Math.cos(at) * length * t,
      })
    }
    arms.push(points)
  }
  return arms
}
