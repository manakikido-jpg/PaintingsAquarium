import type { RgbaImage } from './image'
import type { ThemeId } from './theme'
import type { CreatureKind } from './rig'
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

export type SpeciesId =
  | 'fish'
  | 'tako'
  | 'iruka'
  | 'same'
  | 'kurage'
  | 'umigame'
  | 'pteranodon'
  | 'ankylosaurus'
  | 'brontosaurus'
  | 'stegosaurus'
  | 'triceratops'

/** 絵の中の向き。x は右が +、y は**下**が +（画像の座標に合わせる）。 */
export interface Direction {
  readonly x: number
  readonly y: number
}

export interface SpeciesInfo {
  readonly id: SpeciesId
  readonly label: string
  /**
   * どのテーマの台紙か。
   *
   * **照合はテーマの中だけで行う。** 11種をひとつの集まりとして測ったら、
   * まる魚とトリケラトプスが 0.69 で重なった（塗った魚が恐竜として判定されうる）。
   * 外形の重なりしか見ないので、海と陸を混ぜれば必ずこうなる。
   */
  readonly theme: ThemeId
  /**
   * 空を飛ぶか。歩くテーマの中でも、これだけは地面に乗せない。
   * 翼竜が地面を歩いていると、作りかけに見える。
   */
  readonly flies?: boolean
  /** 台紙の中で頭が向いている向き */
  readonly head: Direction
  /**
   * 横を向いて泳ぐ生き物か。
   * 魚・イルカ・サメは横向き。タコ・クラゲ・ウミガメは正面（上から）を向いている。
   */
  readonly swimsSideways: boolean
}

const SEA = 'aquarium' as const
const LAND = 'dinosaur' as const

export const SPECIES: Readonly<Record<SpeciesId, SpeciesInfo>> = {
  fish: { id: 'fish', label: '魚', theme: SEA, head: { x: -1, y: 0 }, swimsSideways: true },
  iruka: { id: 'iruka', label: 'イルカ', theme: SEA, head: { x: -1, y: 0 }, swimsSideways: true },
  same: { id: 'same', label: 'サメ', theme: SEA, head: { x: -1, y: 0 }, swimsSideways: true },
  tako: { id: 'tako', label: 'タコ', theme: SEA, head: { x: 0, y: -1 }, swimsSideways: false },
  kurage: { id: 'kurage', label: 'クラゲ', theme: SEA, head: { x: 0, y: -1 }, swimsSideways: false },
  umigame: { id: 'umigame', label: 'ウミガメ', theme: SEA, head: { x: 0, y: -1 }, swimsSideways: false },
  // 恐竜はどれも横向きで、台紙では頭が左を向いている
  pteranodon: {
    id: 'pteranodon',
    label: 'プテラノドン',
    theme: LAND,
    head: { x: -1, y: 0 },
    swimsSideways: true,
    flies: true,
  },
  ankylosaurus: { id: 'ankylosaurus', label: 'アンキロサウルス', theme: LAND, head: { x: -1, y: 0 }, swimsSideways: true },
  brontosaurus: { id: 'brontosaurus', label: 'ブロントサウルス', theme: LAND, head: { x: -1, y: 0 }, swimsSideways: true },
  stegosaurus: { id: 'stegosaurus', label: 'ステゴサウルス', theme: LAND, head: { x: -1, y: 0 }, swimsSideways: true },
  triceratops: { id: 'triceratops', label: 'トリケラトプス', theme: LAND, head: { x: -1, y: 0 }, swimsSideways: true },
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
  /** 台紙に合わせるために絵を何回まわしたか・反転したか（手足の位置に使う） */
  readonly turns: number
  readonly mirrored: boolean
}

/**
 * どの台紙の絵かを見分ける。一致しなければ null。
 *
 * しきい値は `MATCH_THRESHOLD`（0.7）。実測では、模擬スキャンを取り込んだ
 * あとの絵が自分の台紙と **0.985** で重なり、2位は 0.66 だった。
 * 無理にどれかへ当てはめるより、**当てはめないほうが安全**（`match.ts`）。
 */
export function templatesForTheme(theme?: ThemeId): readonly Template[] {
  if (!theme) return TEMPLATES
  return TEMPLATES.filter((template) => SPECIES[template.id as SpeciesId].theme === theme)
}

export function identifySpecies(image: RgbaImage, theme?: ThemeId): SpeciesMatch | null {
  const best = matchTemplates(image, templatesForTheme(theme), TEMPLATE_GRID)
  if (!best || best.score < MATCH_THRESHOLD) return null

  const id = best.id as SpeciesId
  const head = directionInPiece(id, best.turns, best.mirrored)
  const sideways = SPECIES[id].swimsSideways && Math.abs(head.x) > Math.abs(head.y)
  return {
    id,
    score: best.score,
    head,
    headsRight: sideways ? head.x > 0 : null,
    turns: best.turns,
    mirrored: best.mirrored,
  }
}


/* ------------------------------------------------------------------
 * 手足の動き
 *
 * 絵を**矩形に分けて**、その一部だけを回して描く。
 * `clip()` で手足の形に切り抜く案は使えない（3匹で 0.3fps・R-022）。
 * 分割なので同じ画素を2度描かず、増える描画は1匹あたり数回で済む。
 *
 * 位置は**絵の外接矩形に対する割合**。台紙も取り込んだ絵も、
 * まわりの余白を詰めてあるので（`trim.ts`）、同じ割合で同じ場所を指す。
 * 数字は台紙の輪郭を実測して決めた（甲羅は x 0.20〜0.78・y 0.28〜0.66、
 * タコの頭の下端は y 0.53）。
 * ------------------------------------------------------------------ */

export interface Box {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export interface SpritePart {
  /** 元画像の中の切り出す範囲 */
  readonly box: Box
  /** 回す（伸び縮みさせる）軸。`swing` も `lift` も 0 のときは使わない */
  readonly pivot: { readonly x: number; readonly y: number }
  /** 振れ幅（ラジアン）。0 なら回さない */
  readonly swing: number
  /** 拍のずれ（0〜1）。前足と後ろ足を逆に動かすのに使う */
  readonly beat: number
  /**
   * 伸び縮みの幅（倍率のふり幅）。0 なら伸縮しない。
   *
   * **回すのとは別の動かし方。** 回すと切り目の両側がずれて裂けるが、
   * 伸び縮みは**切り目そのものが動かない**ので、どれだけ動かしても開かない。
   * 軸の線上の画素は動かず、そこから離れるほど大きく動く。
   *
   * プテラノドンの翼はこれで開閉する。翼は胴とつながっていて回せないため。
   */
  readonly lift?: number
  /** 伸び縮みさせる向き。既定は縦（`y`）。紙を回して置いたときに入れ替わる */
  readonly liftAxis?: 'x' | 'y'
}

const KAME_SIDE = 0.19
const KAME_FRONT = 0.23
const KAME_BACK = 0.77

/*
 * タコの足はここで分けない（R-033）。
 *
 * 足を縦4組に切って回したら、**頭のすぐ下に縦の裂け目**が出た。
 * あのあたりは8本の足が1つの塊につながっていて、そこを切って別々に回せば
 * 必ず開く。切る位置を足の隙間に合わせても、隙間があるのは足先だけだった。
 * タコは既存の「横帯＋せん断」（`drifts`）のままにする。
 * 帯は隣と傾きでつながるので、どれだけ動かしても開かない。
 */

/**
 * ウミガメ: 四隅のひれだけを回す。甲羅は切らない。
 * 前足と後ろ足は逆の拍にして、漕いでいるように見せる。
 */
const KAME_PARTS: readonly SpritePart[] = [
  { box: { x: 0, y: 0, w: KAME_SIDE, h: KAME_FRONT }, pivot: { x: KAME_SIDE, y: KAME_FRONT }, swing: 0.13, beat: 0 },
  { box: { x: KAME_SIDE, y: 0, w: 1 - KAME_SIDE * 2, h: KAME_FRONT }, pivot: { x: 0.5, y: 0 }, swing: 0, beat: 0 },
  { box: { x: 1 - KAME_SIDE, y: 0, w: KAME_SIDE, h: KAME_FRONT }, pivot: { x: 1 - KAME_SIDE, y: KAME_FRONT }, swing: 0.13, beat: 0.5 },
  { box: { x: 0, y: KAME_FRONT, w: 1, h: KAME_BACK - KAME_FRONT }, pivot: { x: 0.5, y: 0.5 }, swing: 0, beat: 0 },
  { box: { x: 0, y: KAME_BACK, w: KAME_SIDE, h: 1 - KAME_BACK }, pivot: { x: KAME_SIDE, y: KAME_BACK }, swing: 0.13, beat: 0.5 },
  { box: { x: KAME_SIDE, y: KAME_BACK, w: 1 - KAME_SIDE * 2, h: 1 - KAME_BACK }, pivot: { x: 0.5, y: 1 }, swing: 0, beat: 0 },
  { box: { x: 1 - KAME_SIDE, y: KAME_BACK, w: KAME_SIDE, h: 1 - KAME_BACK }, pivot: { x: 1 - KAME_SIDE, y: KAME_BACK }, swing: 0.13, beat: 0 },
]

/**
 * 四足の恐竜: **前足の組と後ろ足の組**を、逆の拍で前後に振る。
 *
 * 足を4本別々に切らないのは、横から見た絵では手前の足と奥の足が
 * 重なって描かれていて、**切り目が足の真ん中を通る**ため（R-033 と同じ壊れ方）。
 * 2組にまとめれば、切り目は足と足の隙間に落ちる。
 *
 * 足の帯は**腰の線より少し上から**切り出し、**胴より後に描く**。
 * こうすると、回したときに腰にできる楔形の隙間を、足の上端の腹の絵が覆う。
 * 上端は軸のすぐそばなので、回してもほとんど動かない。
 */
const HIP_OVERLAP = 0.06
const LEG_SWING = 0.12

/**
 * 切り目は**足と足の隙間**に置く。
 *
 * 最初は「前足のあたり」で切ったら、切り目が2本目の足の**真ん中**を通り、
 * 振ったときに足が縦に裂けた（実機で確認）。R-033 と同じ壊れ方。
 * いまは台紙の足元を列ごとに数えて、**空いている列の真ん中**を切っている。
 *
 * 足は**胴より先に描く**。あとから胴を重ねれば、腰にできる継ぎ目が隠れる。
 */
function walkerParts(
  hipY: number,
  front: readonly [number, number],
  back: readonly [number, number],
): readonly SpritePart[] {
  const still = (x: number, w: number): SpritePart => ({
    box: { x, y: hipY, w, h: 1 - hipY },
    pivot: { x: x + w / 2, y: hipY },
    swing: 0,
    beat: 0,
  })
  const leg = (range: readonly [number, number], beat: number): SpritePart => ({
    box: { x: range[0], y: hipY - HIP_OVERLAP, w: range[1] - range[0], h: 1 - hipY + HIP_OVERLAP },
    pivot: { x: (range[0] + range[1]) / 2, y: hipY - HIP_OVERLAP },
    swing: LEG_SWING,
    beat,
  })
  const gaps: SpritePart[] = []
  if (front[0] > 0) gaps.push(still(0, front[0]))
  if (back[0] > front[1]) gaps.push(still(front[1], back[0] - front[1]))
  if (back[1] < 1) gaps.push(still(back[1], 1 - back[1]))
  return [
    // 足が先。あとで胴を重ねて腰の継ぎ目を隠す
    leg(front, 0),
    leg(back, 0.5),
    ...gaps,
    // 胴（腰から上）。最後に描く
    { box: { x: 0, y: 0, w: 1, h: hipY }, pivot: { x: 0.5, y: 0 }, swing: 0, beat: 0 },
  ]
}

/**
 * プテラノドン: **翼を開いて、たたむ。**
 *
 * 肩の線で上下に分け、上（翼）だけを縦に伸び縮みさせる。
 * 回さないのは、翼が胴とつながっていて**回すと必ず裂ける**ため（R-037）。
 * 伸び縮みは切り目の上で連続しているので、裂けようがない。
 *
 * 線の位置は台紙を測って決めた。**この高さより上には翼しか無い**
 *（頭の上端は 0.66、翼だけが横切るのは 0.64 まで）。
 * 頭・胴・尾は下側に入るので、伸び縮みしても形が変わらない。
 */
const PTERA_SHOULDER = 0.64
const PTERA_LIFT = 0.22

const PTERA_PARTS: readonly SpritePart[] = [
  // 翼（肩より上）。軸は肩の線
  {
    box: { x: 0, y: 0, w: 1, h: PTERA_SHOULDER },
    pivot: { x: 0.5, y: PTERA_SHOULDER },
    swing: 0,
    beat: 0,
    lift: PTERA_LIFT,
    liftAxis: 'y',
  },
  // 頭と胴（肩より下）。動かさない
  {
    box: { x: 0, y: PTERA_SHOULDER, w: 1, h: 1 - PTERA_SHOULDER },
    pivot: { x: 0.5, y: PTERA_SHOULDER },
    swing: 0,
    beat: 0,
  },
]

export const PARTITION: Partial<Record<SpeciesId, readonly SpritePart[]>> = {
  umigame: KAME_PARTS,
  pteranodon: PTERA_PARTS,
  /*
   * 数字は台紙を**余白を詰めた状態**で測って決めた（取り込んだ絵と同じ状態）。
   * 腹の下端 = 腰の線。前後の切り目は、足元の列を数えて**空いている列**に置いた。
   *   アンキロ  足 0.14〜0.69・隙間 0.41〜0.43
   *   ブロント  足 0.16〜0.64・隙間 0.41〜0.42（0.64 より右は尾）
   *   ステゴ    足 0.15〜0.64・隙間 0.39〜0.41
   *   トリケラ  足 0.24〜0.87・隙間 0.39〜0.41
   */
  ankylosaurus: walkerParts(0.62, [0.13, 0.417], [0.417, 0.7]),
  brontosaurus: walkerParts(0.72, [0.15, 0.415], [0.415, 0.67]),
  stegosaurus: walkerParts(0.72, [0.15, 0.396], [0.396, 0.65]),
  triceratops: walkerParts(0.72, [0.23, 0.399], [0.399, 0.88]),
}

/** 左右反転。 */
function mirrorPart(part: SpritePart): SpritePart {
  return {
    box: { ...part.box, x: 1 - part.box.x - part.box.w },
    pivot: { x: 1 - part.pivot.x, y: part.pivot.y },
    // 鏡に映すと回る向きも逆になる。伸び縮みは向きを持たないのでそのまま
    swing: -part.swing,
    beat: part.beat,
    lift: part.lift,
    liftAxis: part.liftAxis,
  }
}

/** 時計回りの回転を1つ戻す（`turnBack` と同じ向き）。 */
function turnBackPart(part: SpritePart): SpritePart {
  return {
    box: { x: part.box.y, y: 1 - part.box.x - part.box.w, w: part.box.h, h: part.box.w },
    pivot: { x: part.pivot.y, y: 1 - part.pivot.x },
    swing: part.swing,
    beat: part.beat,
    lift: part.lift,
    // 絵を90度まわすと、縦の伸び縮みは横の伸び縮みになる
    liftAxis: part.lift ? ((part.liftAxis ?? 'y') === 'y' ? 'x' : 'y') : part.liftAxis,
  }
}

/**
 * 台紙に書いた分割を、取り込んだ絵の中の位置に直す。
 *
 * `turns` と `mirrored` は `matchTemplates` が返したもの。
 * スキャナならどちらも 0 / false になるが、
 * 紙を回して置いても崩れないようにしておく。
 */
export function partsForPiece(
  id: SpeciesId | undefined,
  turns = 0,
  mirrored = false,
): readonly SpritePart[] {
  if (!id) return []
  const parts = PARTITION[id]
  if (!parts) return []
  return parts.map((part) => {
    let out = mirrored ? mirrorPart(part) : part
    for (let index = 0; index < ((turns % 4) + 4) % 4; index++) out = turnBackPart(out)
    return out
  })
}


/* ------------------------------------------------------------------
 * 台紙ごとの正解（種類・尾びれ・背びれ）
 *
 * **台紙が分かったら、形からの推定はやめる。**
 * 実際、イルカが「足のある生き物」と判定され、尾も背びれも動いていなかった。
 * 数字は台紙の輪郭を実測して決めた（厚みの谷＝尾の付け根、上へ飛び出す区間＝背びれ）。
 * ------------------------------------------------------------------ */

/** その台紙の生き物が、魚のように泳ぐか、足で漂うか。 */
/** その台紙は空を飛ぶか。台紙に一致しなかった絵（`undefined`）は歩く。 */
export function speciesFlies(id?: SpeciesId): boolean {
  return id ? SPECIES[id].flies === true : false
}

export const KIND_OF: Record<SpeciesId, CreatureKind> = {
  fish: 'fish',
  iruka: 'fish',
  same: 'fish',
  tako: 'tentacled',
  kurage: 'tentacled',
  umigame: 'tentacled',
  // 恐竜は胴がまっすぐで、しなるのは尾だけ。魚と同じ扱いでよい
  pteranodon: 'fish',
  ankylosaurus: 'fish',
  brontosaurus: 'fish',
  stegosaurus: 'fish',
  triceratops: 'fish',
}

/**
 * 台紙ごとの尾の位置。
 *
 * **ひれ（背びれ・胸びれ）はここに書かない。** 手で置いた矩形は、
 * 弓なりのイルカでは胴を横切ってしまい、**背びれと腹のあたりが裂けた**（実機で確認）。
 * ひれは絵から実測したもの（`findFins`）だけを使う。あちらは実際の
 * 突き出しを測っているので、体の形に合う。
 */
interface TemplateRig {
  /** 尾の付け根。頭からの割合（台紙は全部、頭が左） */
  readonly tailFrom: number
  /** 付け根の高さ（0〜1） */
  readonly tailY: number
}

const TEMPLATE_RIG: Partial<Record<SpeciesId, TemplateRig>> = {
  // まる魚: 厚みの谷が x=0.78、そこから先がうちわ型の尾。背びれは x=0.36〜0.55
  fish: { tailFrom: 0.78, tailY: 0.55 },
  // サメ: 谷が x=0.80。背びれは大きく x=0.38〜0.53、胸びれは下 x=0.53〜0.62
  same: { tailFrom: 0.8, tailY: 0.55 },
  // イルカ: 弓なりで、尾は右下へ抜ける。背びれは弧の頂点 x=0.62〜0.80
  iruka: { tailFrom: 0.82, tailY: 0.6 },
  /*
   * 恐竜の尾。**胴が細くなるところ**を付け根にしてある（余白を詰めた絵での割合）。
   * ここより後ろだけがしなるので、胴や足は動かない。
   */
  // アンキロ: 尾は右へまっすぐ、先に球。胴の終わりは x=0.70
  ankylosaurus: { tailFrom: 0.72, tailY: 0.5 },
  // ブロント: 尾は右下へ長く抜ける。腰は x=0.62
  brontosaurus: { tailFrom: 0.66, tailY: 0.72 },
  // ステゴ: 尾は右上がりで先に棘。腰は x=0.66
  stegosaurus: { tailFrom: 0.7, tailY: 0.62 },
  // トリケラ: 尾は短く右へ。腰は x=0.82
  triceratops: { tailFrom: 0.84, tailY: 0.62 },
}

export interface SpeciesRig {
  readonly kind: CreatureKind
  readonly headsRight: boolean
  readonly tail: { readonly from: number; readonly pivot: { readonly x: number; readonly y: number } } | null
}

/**
 * 台紙に書いた正解を、取り込んだ絵の中の位置に直す。
 *
 * 台紙はすべて**頭が左**なので、左右反転していなければ
 * 「頭からの割合」がそのまま絵の中の x になる。
 */
export function rigForSpecies(id: SpeciesId, mirrored: boolean): SpeciesRig {
  const kind = KIND_OF[id]
  const rig = TEMPLATE_RIG[id]
  if (!rig) return { kind, headsRight: mirrored, tail: null }

  const pivotX = mirrored ? 1 - rig.tailFrom : rig.tailFrom
  return {
    kind,
    headsRight: mirrored,
    tail: { from: rig.tailFrom, pivot: { x: pivotX, y: rig.tailY } },
  }
}
