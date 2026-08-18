import type { RgbaImage } from './image'
import { MATCH_THRESHOLD, matchTemplates, type Template } from './match'
import { TEMPLATE_BITS, TEMPLATE_GRID } from './templates.generated'

/**
 * 塗り絵の台紙（6種）と、絵がどの台紙かを見分ける入口。
 *
 * **台紙が決まっていると、推定が要らなくなる。**
 * 頭がどちら側か・尾がどこか・手足がどこかは、台紙ごとに1回書いておけばよい。
 * 形から当てにいくと外れ、外れると頭を振りながら尾から泳ぐ絵になる（R-030）。
 *
 * 台紙に一致しない絵（自由に描いた絵）は今までどおり扱う。
 * 会場では台紙を使うが、そうでない絵が入っても壊れないようにしておく。
 */

export type SpeciesId = 'fish' | 'tako' | 'iruka' | 'same' | 'kurage' | 'umigame'

/** 絵の中の向き。x は右が +、y は**下**が +（画像の座標に合わせる）。 */
export interface Direction {
  readonly x: number
  readonly y: number
}

export interface SpeciesInfo {
  readonly id: SpeciesId
  readonly label: string
  /** 台紙の中で頭が向いている向き */
  readonly head: Direction
  /**
   * 横を向いて泳ぐ生き物か。
   * 魚・イルカ・サメは横向き。タコ・クラゲ・ウミガメは正面（上から）を向いている。
   */
  readonly swimsSideways: boolean
}

export const SPECIES: Readonly<Record<SpeciesId, SpeciesInfo>> = {
  fish: { id: 'fish', label: '魚', head: { x: -1, y: 0 }, swimsSideways: true },
  iruka: { id: 'iruka', label: 'イルカ', head: { x: -1, y: 0 }, swimsSideways: true },
  same: { id: 'same', label: 'サメ', head: { x: -1, y: 0 }, swimsSideways: true },
  tako: { id: 'tako', label: 'タコ', head: { x: 0, y: -1 }, swimsSideways: false },
  kurage: { id: 'kurage', label: 'クラゲ', head: { x: 0, y: -1 }, swimsSideways: false },
  umigame: { id: 'umigame', label: 'ウミガメ', head: { x: 0, y: -1 }, swimsSideways: false },
}

export const SPECIES_IDS = Object.keys(SPECIES) as SpeciesId[]

/** 台紙の形（`tools/make-template-data.py` が作った升目から組み立てる）。 */
export const TEMPLATES: readonly Template[] = SPECIES_IDS.filter((id) => id in TEMPLATE_BITS).map(
  (id) => ({
    id,
    shape: {
      size: TEMPLATE_GRID,
      cells: Array.from(TEMPLATE_BITS[id as keyof typeof TEMPLATE_BITS], (bit) => bit === '1'),
    },
  }),
)

/** 左右反転（画像の座標なので、x だけ反転する）。 */
function mirrorDirection(direction: Direction): Direction {
  return { x: -direction.x, y: direction.y }
}

/**
 * 時計回りの回転を戻す。
 *
 * 照合は「絵を回して台紙に合わせる」向きで動くので
 *（`match.ts`: 台紙 ≒ 反転(回転(絵))）、台紙の中の向きを絵の中の向きへ
 * 持ち帰るときは**逆に回す**。
 */
function turnBack(direction: Direction, turns: number): Direction {
  let out = direction
  for (let index = 0; index < ((turns % 4) + 4) % 4; index++) {
    out = { x: out.y, y: -out.x }
  }
  return out
}

/**
 * 台紙の中の向きを、絵の中の向きに直す。
 * `turns` と `mirrored` は `matchTemplates` が返したもの。
 */
export function directionInPiece(id: SpeciesId, turns: number, mirrored: boolean): Direction {
  const head = SPECIES[id].head
  return turnBack(mirrored ? mirrorDirection(head) : head, turns)
}

export interface SpeciesMatch {
  readonly id: SpeciesId
  /** 重なり具合（0〜1） */
  readonly score: number
  /** 絵の中で頭が向いている向き */
  readonly head: Direction
  /**
   * 頭が絵の右側にあるか。横向きに泳ぐ生き物のときだけ意味がある。
   * 縦向き（タコなど）や、頭が上下を向いているときは null。
   */
  readonly headsRight: boolean | null
}

/**
 * どの台紙の絵かを見分ける。一致しなければ null。
 *
 * しきい値は `MATCH_THRESHOLD`（0.7）。実測では、模擬スキャンを取り込んだ
 * あとの絵が自分の台紙と **0.985** で重なり、2位は 0.66 だった。
 * 無理にどれかへ当てはめるより、**当てはめないほうが安全**（`match.ts`）。
 */
export function identifySpecies(image: RgbaImage): SpeciesMatch | null {
  const best = matchTemplates(image, TEMPLATES, TEMPLATE_GRID)
  if (!best || best.score < MATCH_THRESHOLD) return null

  const id = best.id as SpeciesId
  const head = directionInPiece(id, best.turns, best.mirrored)
  const sideways = SPECIES[id].swimsSideways && Math.abs(head.x) > Math.abs(head.y)
  return { id, score: best.score, head, headsRight: sideways ? head.x > 0 : null }
}
