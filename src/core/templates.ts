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

/**
 * **紙を消しただけの形を信じてよい点数**（`MATCH_THRESHOLD` より厳しい）。
 *
 * この形には「こどもが枠の外に塗ったもの」がそのまま入っている。
 * そこそこ合っている程度で採ると、**別の生き物に化ける**。
 * 実測で、黒いクレヨンで 8% はみ出したまる魚が **0.752 でタコと判定された**。
 *
 * 一方、この形が要る場面（輪郭に切れ目がある紙）では **0.967** 出ている。
 * 間を取って 0.85。救うものは救ったまま、誤判定だけ落とせる。
 */
export const RAW_SHAPE_THRESHOLD = 0.85

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
  /**
   * **傾け（せん断）の幅。0 なら傾けない。**
   *
   * 軸の線の上は動かず、そこから離れるほど**横へ**ずれる。
   * 足を前後に振るのに使う。回すのと違って切り目の両側がずれないので裂けない。
   *
   * 値は「軸から箱の端までの距離に対する、ずれの割合」。
   */
  readonly shear?: number
  /** 傾ける向き。既定は「縦に離れるほど横へずれる」（＝足の振り） */
  readonly shearAxis?: 'x' | 'y'
}

/*
 * タコの足はここで分けない（R-033）。
 *
 * 足を縦4組に切って回したら、**頭のすぐ下に縦の裂け目**が出た。
 * あのあたりは8本の足が1つの塊につながっていて、そこを切って別々に回せば
 * 必ず開く。切る位置を足の隙間に合わせても、隙間があるのは足先だけだった。
 * タコは既存の「横帯＋せん断」（`drifts`）のままにする。
 * 帯は隣と傾きでつながるので、どれだけ動かしても開かない。
 */

/*
 * ウミガメ: **絵を1枚のまま、ゆっくり傾ける。**
 *
 * 経緯が2つある。どちらも実機で見て直した。
 *
 * 1. **四隅のひれを回していた。** 甲羅とのあいだに青い隙間が開いた。
 *    ひれの箱の内側の縁（x=0.19 / 0.81）は絵を **58%** 横切っていて、
 *    甲羅を貫いている。回せば必ずそこが開く（R-050）。
 *
 * 2. **そこで分割をやめたら、タコと同じ「横帯＋せん断」に落ちた。**
 *    ウミガメは `tentacled` なので、波が下（＝後ろのひれ）へ向かって
 *    強くなる。**後ろの2枚が触手のように大きく振れ、甲羅まで伸び縮みした**
 *    （会場から「亀の後ろが尾鰭判定されてる」）。
 *    帯とせん断は裂けないが、**甲羅の硬い生き物には合わない**。
 *
 * いまは分割を1つだけ持つ。**絵の全面をひとつの部分**として、
 * 真ん中を軸にゆっくり傾ける。
 *   - 切り目が無いので裂けようがない
 *   - 上から見た亀が、water を掻いて向きを変えている見え方になる
 *
 * `PARTITION` に何か入れておくこと自体が、帯の経路へ落ちるのを止めている。
 * **ここを空にすると 2. に戻る。**
 */

/** 甲羅を傾ける角度（ラジアン）。約 3.5 度。大きくすると回っているように見える */
const KAME_ROLL = 0.06
/** 横帯の数。多いほど帯どうしの段差が小さい */
const KAME_STRIPS = 20
/** ひれを横に伸び縮みさせる幅（倍率のふり幅） */
const KAME_STROKE = 0.12
/**
 * 甲羅の範囲（上からの割合）。**ここは伸び縮みさせない。**
 * 台紙を測った値: 甲羅の縁は y=0.23 と y=0.77 のあたりにあり、
 * その外側が前後のひれ。
 */
const KAME_SHELL_TOP = 0.28
const KAME_SHELL_BOTTOM = 0.72

/**
 * その高さで、横にどれだけ伸び縮みさせるか（-1〜1）。
 *
 * 甲羅の中は 0（動かさない）。前のひれで +1、後ろのひれで -1 に向かう。
 * 前が伸びるとき後ろが縮むので、水を掻いているように見える。
 *
 * **端でなめらかに 0 になる形（smoothstep）を使う。**
 * 直線で 0 に落とすと、甲羅との境目で隣の帯との差が最大になり、
 * ちょうど甲羅の縁に段差が出る。smoothstep なら境目での傾きが 0 になる。
 */
function kameStroke(y: number): number {
  const smooth = (t: number): number => {
    const clamped = Math.min(1, Math.max(0, t))
    return clamped * clamped * (3 - 2 * clamped)
  }
  if (y < KAME_SHELL_TOP) return smooth((KAME_SHELL_TOP - y) / KAME_SHELL_TOP)
  if (y > KAME_SHELL_BOTTOM) return -smooth((y - KAME_SHELL_BOTTOM) / (1 - KAME_SHELL_BOTTOM))
  return 0
}

/**
 * ウミガメ: **甲羅は動かさず、ひれだけ水を掻く。**
 *
 * 横の帯に分け、帯ごとに**横へ伸び縮み**させる。軸は絵の縦の中心線。
 *   - 軸の上の画素は動かないので、左右がちぎれない
 *   - 帯の境目は横線。横に伸び縮みしても、画素はその線を越えない
 *   - 伸び率は上下になめらかに変わるので、輪郭の段差も小さい
 *     （実測で絵の幅の 1.5% 以下。上限は 3%）
 *
 * **甲羅の中は伸び率 0。** 硬いものを伸ばすと、それだけで作り物に見える。
 *
 * すべての帯に**同じ傾き**（`KAME_ROLL`）を掛けてあるので、
 * 絵ぜんぶが1枚として傾きながら、ひれだけが掻く。
 */
const KAME_PARTS: readonly SpritePart[] = Array.from(
  { length: KAME_STRIPS },
  (_, index): SpritePart => {
    const from = index / KAME_STRIPS
    const height = 1 / KAME_STRIPS
    return {
      box: { x: 0, y: from, w: 1, h: height },
      // **全部の帯で同じ軸・同じ拍。** ずらすと帯ごとに別々に回り、絵が割れる
      pivot: { x: 0.5, y: 0.5 },
      swing: KAME_ROLL,
      beat: 0,
      lift: KAME_STROKE * kameStroke(from + height / 2),
      liftAxis: 'x',
    }
  },
)

/**
 * 四足の恐竜: **切らずに、足を伸び縮みさせて歩かせる。**
 *
 * 以前は前足の組と後ろ足の組に切って前後に振っていた。**これが裂けていた。**
 * 切り目に選んだ列はどれも胴を貫いていた（アンキロ 40〜47%・ブロント 46〜58%・
 * ステゴ 36〜54%・トリケラ 20〜46%）。足の隙間は足先にしか無く、
 * その上は腹でつながっている。足元の列だけを数えて決めたのが誤りだった（R-048）。
 *
 * そのあと「絵を1枚のまま縦に縮めて傾ける」に変えた。裂けはしないが、
 * **足が動かない**（本人の指摘）。
 *
 * いまは**腰から下を縦の細い帯に分け、帯ごとに縦へ伸び縮みさせる**。
 *
 * なぜこれなら裂けないか。**回さずに、縦に伸び縮みさせるだけ**だから。
 *   - 軸は腰の線。**軸の上の画素は動かない**ので、胴との境目は開きようがない
 *   - 隣り合う帯の伸び率は**なめらかに変わる**ので、縦の切り目に段差が出ない
 *     （魚の胴を帯に切ってせん断でつないでいるのと同じ考え方）
 *
 * 伸び率の山と谷は、**足と足の隙間**（どの台紙も x=0.40 あたり）に
 * 変化の一番大きいところが来るように置いてある。
 * 伸び率が一番急に変わるのはそこなので、**絵の無い所で変化を使い切る**。
 * 前足の組と後ろ足の組が逆に伸び縮みして、体重が前後に移って見える。
 */

/**
 * **足の付け根の線。ここから下だけが前後に振れる（R-060）。**
 *
 * 台紙を実測して決めた。**四足の胴は 0.78 あたりまで1つに繋がっていて、
 * 4本の足に分かれるのは 0.85 より下**（線の内側を塗りつぶして行ごとに数えた）。
 *
 * | 台紙 | y=0.78 | y=0.85 |
 * |---|---|---|
 * | アンキロサウルス | 4本 | 4本 |
 * | ブロントサウルス | 1本（胴） | 4本 |
 * | ステゴサウルス | 1本（胴） | 4本 |
 * | トリケラトプス | 2本 | 4本 |
 *
 * **以前はここが 0.6 だった。** 胴の半分から下を丸ごと縦に伸び縮みさせていたので、
 * 足が前後に動かず、腹ごと上下に波打っていた。
 * 会場から「恐竜の足がゆらゆらしてます。もともとの歩いているように直して」。
 */
const WALK_KNEE = 0.8
/*
 * 足元を何本の帯に分けるか。
 *
 * 帯を細かくするのは、**前の足と後ろの足を逆に振るため**だけ。
 * 同じ向きに振る帯どうしはぴったり同じだけずれるので、何本あっても裂けない。
 */
const WALK_STRIPS = 24
/**
 * 足先が前後に動く幅（足の長さに対する割合）。
 *
 * 足の長さは絵の高さの 2 割（`1 - WALK_KNEE`）なので、
 * 足先は絵の高さの ±4% ほど前後に動く。
 */
const WALK_SWING = 0.2
/** 胴の上下。足の動きに遅れて背中が沈む。大きいと絵が波打って見える */
const WALK_BODY_LIFT = 0.03
/**
 * 振りの向きが入れ替わる所（前足と後足の境目）。
 *
 * 実測（線の内側を塗りつぶし、行ごとに足の位置を測ったもの）:
 *
 * | 台紙 | y=0.85 の隙間 | y=0.92 の隙間 |
 * |---|---|---|
 * | アンキロサウルス | 0.41〜0.43 | 0.40〜0.56 |
 * | ブロントサウルス | 0.40〜0.43 | 0.39〜0.41 |
 * | ステゴサウルス | 0.38〜0.42 | 0.38〜0.41 |
 * | トリケラトプス | 0.39〜0.43 | 0.38〜0.41 |
 *
 * **4台紙すべてで空いているのは 0.41 の一点しかない。**
 * 足先は下へ行くほど広がるので、隙間は下ほど狭くなる。
 */
const WALK_PIVOT_X = 0.41
/**
 * 振りが +1 から -1 まで変わりきる幅（片側・絵の幅に対する割合）。
 *
 * **ここで急に反転させてはいけない。** 隙間が 1 点しか無いので、
 * 反転させると必ずどれかの台紙で足の途中を横に切る。
 * 実機で、ステゴサウルスの足の付け根が割れて破片が浮いた。
 *
 * なだらかに変えれば、隣り合う帯の差は
 * 「振り幅 ÷ (この幅 × 帯の数)」に薄まり、裂けない。
 * 0.25 にすると、前足（x≈0.2）と後足（x≈0.65）がほぼ振り切る。
 */
const WALK_BLEND = 0.25

/**
 * 帯の中心での振りの向き（-1〜1）。頭側が +、尾側が -。
 *
 * **正弦波を1周期ぶん使ってはいけない。** 以前はそうしていたため、
 * 0 を横切る所が絵の真ん中と尾に来て、足ではなく胴が波打っていた。
 */
export function walkWeight(x: number): number {
  return Math.max(-1, Math.min(1, (WALK_PIVOT_X - x) / WALK_BLEND))
}

const WALKER_PARTS: readonly SpritePart[] = [
  // 足元。帯ごとに前後へ振る。軸は足の付け根なので、付け根は動かない
  ...Array.from({ length: WALK_STRIPS }, (_, index): SpritePart => {
    const from = index / WALK_STRIPS
    const width = 1 / WALK_STRIPS
    const centre = from + width / 2
    return {
      box: { x: from, y: WALK_KNEE, w: width, h: 1 - WALK_KNEE },
      pivot: { x: centre, y: WALK_KNEE },
      swing: 0,
      beat: 0,
      shear: WALK_SWING * walkWeight(centre),
      shearAxis: 'y',
    }
  }),
  /*
   * 胴（足の付け根から上）。**軸は足と同じ付け根の線**にする。
   * 別の軸にすると、そこで足と胴がずれて段差になる。
   * 拍を少しずらして、足の動きに遅れて背中が上下する（体重が移って見える）。
   */
  {
    box: { x: 0, y: 0, w: 1, h: WALK_KNEE },
    pivot: { x: 0.5, y: WALK_KNEE },
    swing: 0,
    beat: 0.25,
    lift: WALK_BODY_LIFT,
    liftAxis: 'y',
  },
]

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
   * 四足はどれも同じ動かし方（切らない）。台紙ごとの数字はもう要らない。
   * 尾のリグ（`TEMPLATE_RIG`）はここに分割がある間は使われない。
   * 使うと切り目が絵を 3.1〜10.9% ずらして段差になる（`tools/check-parts.py`）。
   */
  ankylosaurus: WALKER_PARTS,
  brontosaurus: WALKER_PARTS,
  stegosaurus: WALKER_PARTS,
  triceratops: WALKER_PARTS,
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
    // 鏡に映すと前後が入れ替わるので、足の振りも逆になる
    shear: part.shear === undefined ? undefined : -part.shear,
    shearAxis: part.shearAxis,
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
    // 絵を90度まわすと、縦に離れて横へずれる傾けは、横に離れて縦へずれる傾けになる
    shear: part.shear,
    shearAxis: part.shear ? ((part.shearAxis ?? 'y') === 'y' ? 'x' : 'y') : part.shearAxis,
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
  /*
   * **イルカには尾を持たせない。**
   *
   * 弓なりに跳ねた姿勢なので、尾の付け根で縦に切ると、
   * **弧を描いた背中まで一緒に切れる**。実測で、切り目は絵の高さの **66%** を横切る
   *（まる魚 33%・サメ 16%）。前後6%を探しても一番すいて 55%。
   * 回すと切り目の両側がずれるので（R-037）、ここまで横切る線では必ず裂ける。
   * 実際に会場向けの録画で**尾びれが胴からずれて段差になっていた**（R-045）。
   *
   * 尾を回さなくても、胴のしなり（帯・せん断でつなぐので裂けない）と
   * 20〜30秒に1回の跳躍があるので、動きは足りている。
   */
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
  /**
   * 足・触手の先が絵の**下**にあるか（`tentacled` のときだけ意味がある）。
   *
   * 波は「止める側（頭）」から「大きく振れる側（先）」へ向かって強くなる。
   * ここが逆だと、**止めるべき頭が大きく振れて顔が揺れる**。
   */
  readonly tipsDown?: boolean
}

/**
 * 足・触手の先が下を向いている台紙。
 *
 * **絵からの推定を使わない。** 取り込んだ絵は台紙の向きへ起こしてあるので
 * （`processImage`）、どちらが先かは台紙で決まっている。
 * 推定（`rig.ts` の `tipsAtBottom`）は、実測でタコ4匹のうち**2匹を外した**。
 * 外すと波の向きが逆になり、会場から「顔が揺れている」と言われた（R-044）。
 * 正解が手元にあるのに推定を信じ続ける理由は無い（R-034 と同じ）。
 */
const TIPS_DOWN: Partial<Record<SpeciesId, boolean>> = {
  // 頭（ドーム）が上、足が下
  tako: true,
  // かさが上、触手が下
  kurage: true,
  // 上から見た絵。頭が上・尾が下なので、振れるのは下
  umigame: true,
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
  if (!rig) return { kind, headsRight: mirrored, tail: null, tipsDown: TIPS_DOWN[id] }

  const pivotX = mirrored ? 1 - rig.tailFrom : rig.tailFrom
  return {
    kind,
    headsRight: mirrored,
    tail: { from: rig.tailFrom, pivot: { x: pivotX, y: rig.tailY } },
    tipsDown: TIPS_DOWN[id],
  }
}
