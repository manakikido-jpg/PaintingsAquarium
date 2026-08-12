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

// ---------------------------------------------------------------- 岩

export interface Rock {
  readonly x: number
  readonly halfWidth: number
  readonly height: number
  /** 0〜1。大きいほど手前（濃く描く） */
  readonly depth: number
  readonly seed: number
}

export function spawnRocks(seed: number, count: number, tank: Tank): Rock[] {
  const random = pseudoRandom(seed)
  const rocks: Rock[] = []

  for (let index = 0; index < count; index++) {
    // 等間隔の枠の中でずらす。完全な乱数だと固まって置かれ、
    // 岩場ではなく「1つの大きな塊」に見える。
    const slot = (index + 0.5) / count
    rocks.push({
      x: tank.width * (slot + (random() - 0.5) * 0.7 / count),
      halfWidth: tank.width * (0.035 + random() * 0.075),
      height: tank.height * (0.03 + random() * 0.075),
      depth: random(),
      seed: Math.floor(random() * 100000) + 1,
    })
  }

  return rocks
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
export function spawnSeaweed(seed: number, clusters: number, tank: Tank): Seaweed[] {
  const random = pseudoRandom(seed)
  const weeds: Seaweed[] = []

  for (let index = 0; index < clusters; index++) {
    const slot = (index + 0.5) / clusters
    const depth = random()
    const rootX = tank.width * (slot + (random() - 0.5) * 0.8 / clusters)
    const rootHeight = tank.height * (0.11 + depth * 0.2)
    const spread = tank.width * 0.012
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
