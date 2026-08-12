import type { Tank } from './swim'

/**
 * 水槽の底の飾り（砂地・岩・海藻）の形。
 *
 * すべて**絵より奥**に、**暗いシルエット**として描く前提で作ってある。
 * 手前に置くと子どもの絵が隠れ、色を付けると絵と派手さで喧嘩する。
 * ここは形と揺れの計算だけを持ち、色と描き方は画面側に置く。
 */

function pseudoRandom(seed: number): () => number {
  let state = (seed | 0) || 1
  return () => {
    state = (state * 1664525 + 1013904223) | 0
    return ((state >>> 8) & 0xffffff) / 0x1000000
  }
}

// ---------------------------------------------------------------- 砂地

/**
 * 砂地の上面の高さ。左端から右端まで `samples` 点ぶん返す。
 *
 * 乱数を点ごとに振ると砂ではなく「ノコギリ」になるので、
 * 波長の違う 3 本の sin を足して滑らかな起伏にしている。
 */
export function sandProfile(seed: number, tank: Tank, samples = 48): number[] {
  const random = pseudoRandom(seed)
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
  readonly x: number
  readonly halfWidth: number
  readonly height: number
  /** 0〜1。大きいほど手前（濃く描く） */
  readonly depth: number
  readonly seed: number
}

export function spawnRocks(seed: number, count: number, tank: Tank, avoid?: Span): Rock[] {
  const random = pseudoRandom(seed)
  const rocks: Rock[] = []

  for (let index = 0; index < count; index++) {
    // 等間隔の枠の中でずらす。完全な乱数だと固まって置かれ、
    // 岩場ではなく「1つの大きな塊」に見える。
    const slot = (index + 0.5) / count + (random() - 0.5) * 0.7 / count
    rocks.push({
      x: tank.width * placeOutside(slot, avoid),
      halfWidth: tank.width * (0.035 + random() * 0.075),
      height: tank.height * (0.03 + random() * 0.075),
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
export function rockOutline(rock: Rock, groundY: number, steps = 24): Point[] {
  const random = pseudoRandom(rock.seed)
  const lumps = [
    { waves: 2, size: 0.07, phase: random() * Math.PI * 2 },
    { waves: 3, size: 0.05, phase: random() * Math.PI * 2 },
  ]
  const points: Point[] = []

  for (let index = 0; index <= steps; index++) {
    const angle = Math.PI * (index / steps)
    let radius = 1
    for (const lump of lumps) radius += Math.sin(angle * lump.waves + lump.phase) * lump.size

    points.push({
      x: rock.x - Math.cos(angle) * rock.halfWidth * radius,
      // 両端は必ず砂の高さに接するよう、sin をそのまま高さに掛ける
      y: groundY - Math.sin(angle) * rock.height * radius,
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
): Seaweed[] {
  const random = pseudoRandom(seed)
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
    const rootX = tank.width * placeOutside(slot, widened)
    const rootHeight = tank.height * (0.11 + depth * 0.2)
    const blades = 3 + Math.floor(random() * 2)

    for (let blade = 0; blade < blades; blade++) {
      weeds.push({
        baseX: rootX + (blade / Math.max(1, blades - 1) - 0.5) * spread,
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
      x: weed.baseX + Math.sin(angle) * weed.swayAmplitude * Math.pow(t, 1.7),
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
  const random = pseudoRandom(seed)
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
