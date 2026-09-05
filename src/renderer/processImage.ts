import {
  chooseCutoutValue,
  cutoutPaper,
  diagnoseCutout,
  diagnoseResult,
  inkStats,
  SEAL_RATIOS,
  type CutoutOptions,
} from '../core/cutout'
import { trimTransparent } from '../core/trim'
import { insideOutline } from '../core/outline'
import { keepMainRegions } from '../core/regions'
import { downscale, type RgbaImage } from '../core/image'
import { estimateRig, flipHorizontal, orientForSwimming, rotateQuarter, type Rig } from '../core/rig'
import {
  identifySpecies,
  RAW_SHAPE_THRESHOLD,
  rigForSpecies,
  type Direction,
  type SpeciesId,
} from '../core/templates'
import type { ThemeId } from '../core/theme'

/**
 * 切り抜きは画素数に比例して重い。会場の PC で 1 日 200 枚を捌くので、
 * 元写真（4000px 級）のままでは取り込みが目に見えて遅れる。
 * 水槽での表示は長辺 200px 程度なので、1200px あれば十分足りる。
 */
const MAX_SIDE = 1200

export type ProcessResult =
  | {
      ok: true
      pngBase64: string
      width: number
      height: number
      /** 絵が写真の縁に接していた。撮り方の助言を出すために画面へ返す */
      touchedBorder: boolean
      /** 体の芯と尾びれ。あとで動きに使う */
      rig: Rig
      /** 向きを直したか。直したときだけ画面に知らせる */
      turned: boolean
      /** 台紙の向きに合わせて起こしたか。文言を分けるために別に持つ */
      straightened: boolean
      /** 実際に使ったしきい値。自動で選んだ値を運営者が見られるようにする */
      paperValue: number
      /**
       * どの台紙の絵か。台紙に一致しなければ undefined（自由に描いた絵）。
       * 種類ごとの動きに使う（`docs/設計-生き物ごとの動き.md`）。
       */
      species?: SpeciesId
      /** 絵の中で頭が向いている向き（台紙に一致した絵だけ） */
      head?: { readonly x: number; readonly y: number }
      /** 台紙に合わせるために絵を何回まわしたか・反転したか */
      fit?: { readonly turns: number; readonly mirrored: boolean }
    }
  | { ok: false; message: string }

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  const image = new Image()
  image.src = dataUrl
  await image.decode()
  return image
}

function toCanvas(image: RgbaImage): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas 2d context を取得できません')
  context.putImageData(new ImageData(image.data, image.width, image.height), 0, 0)
  return canvas
}

/**
 * 写真 1 枚を「紙を透明にしてトリミングした PNG」にする。
 * AI は使わない。色も形も変えず、透明度だけを触る。
 */
/**
 * **照合は 2 つの形で試す。ただし信じる基準を変える（R-055・R-058・R-061）。**
 *
 * | 形 | 強いところ | 弱いところ | 合格点 |
 * |---|---|---|---|
 * | 印刷された線の内側 | 枠を超えて塗った色を落とせる | 線が切れていると痩せる | 0.70 |
 * | 紙を消しただけ | 線が切れていても痩せない | **はみ出した色がそのまま形に入る** | **0.85** |
 *
 * **紙を消しただけの形は、よく合っているときだけ信じる。**
 * この形は「こどもが枠の外に塗ったもの」まで含んでいるので、
 * そこそこ合っている程度では**別の生き物に化ける**。
 *
 * 実測（まる魚の台紙）:
 *
 * | | 線の内側 | 紙を消しただけ |
 * |---|---|---|
 * | そのまま | 0.982 | 0.982 |
 * | 輪郭に切れ目（ステゴ 1mm・2mm） | 0.418 / 0.363 | **0.967** |
 * | **黒いクレヨンで 8% はみ出す** | 当たらない | **0.752 → タコと誤判定** |
 *
 * 切れ目を救うときは 0.967 出ているので、0.85 で線を引けば
 * **救うものは救ったまま、誤判定だけ落とせる**。
 * 落ちた絵は種類なしになる（泳ぎはする）。**間違った答えを出すよりよい。**
 *
 * **試して効かなかった案**: 「太い黒はクレヨンなので線として扱わない」。
 * 絵の中を黒く塗ると内側ごと通り抜け可能になり、輪郭の小さな穴から
 * 塗りつぶしが入って**形が線だけになった**（照合が1枚も当たらない）。R-061。
 *
 * **保存する絵は元のまま。** はみ出して描いたものを消したりはしない。
 */
function identify(image: RgbaImage, theme?: ThemeId): ReturnType<typeof identifySpecies> {
  const byOutline = identifySpecies(insideOutline(image), theme)
  const byCut = identifySpecies(image, theme)
  const trusted = byCut && byCut.score >= RAW_SHAPE_THRESHOLD ? byCut : null
  if (!byOutline) return trusted
  if (!trusted) return byOutline
  return trusted.score > byOutline.score ? trusted : byOutline
}

/**
 * **絵を台紙の向きへ起こし、種類と動き方を決める。**
 *
 * 取り込みのときと、あとから作り直すとき（R-062）の両方から呼ぶ。
 * 切り抜きのあと・向き直しのあとの絵を渡すこと。
 */
export interface Settled {
  readonly image: RgbaImage
  readonly rig: Rig
  readonly species?: SpeciesId
  readonly head?: Direction
  readonly fit?: { readonly turns: number; readonly mirrored: boolean }
}

export function settle(start: RgbaImage, theme?: ThemeId): Settled {
  let image = start
  let found = identify(image, theme)

  /*
   * 台紙が分かったら、**絵そのものを台紙の向きへ起こす**。
   *
   * 向き直し（`orientForSwimming`）は形の性質で決めているので、外すことがある。
   * 実際、サメが**上下逆さま**で保存されていた（照合は「180度回して左右反転すれば
   * 合う」と正しく報告していたのに、絵は裏返したままだった）。
   * 台紙という正解がある以上、報告で済ませず絵を直す。
   *
   * 左右反転はしない。反転は描画側が進む向きに合わせてやるので、
   * ここで子どもの塗った絵を鏡に映す必要はない。
   */
  let measured = estimateRig(start)
  /*
   * **台紙と同じ向き・同じ左右になるまで直す（R-048・R-058）。**
   *
   * 回すのは R-048 のとおり。**左右も戻す**のは、向き直しが上下をひっくり返す
   *（`flipVertical`）ことがあり、それで絵の左右が入れ替わるため。
   * 台紙は印刷物なので、こどもの絵が左右反転していることはあり得ない。
   * 照合が「左右反転すれば合う」と言うのは、**こちらがひっくり返したから**。
   *
   * 戻さないと、同じ台紙の絵なのに `headsRight` が絵ごとに変わり、
   * **同じイルカが右を向いたり左を向いたりする**（会場からの指摘）。
   * 実測でも、同じサメの台紙 3 枚のうち 1 枚だけ向きが逆になっていた。
   *
   * 直したら測り直す。回す前の位置のままだと、箱が胴の別の場所を掴む（R-048）。
   * 2 周までにするのは、直したあとに別の台紙へ当たったときの空回りを止めるため。
   */
  for (let pass = 0; pass < 2 && found && (found.turns !== 0 || found.mirrored); pass++) {
    if (found.turns !== 0) image = rotateQuarter(image, found.turns)
    if (found.mirrored) image = flipHorizontal(image)
    found = identify(image, theme)
    measured = estimateRig(image)
  }

  /*
   * 台紙が分かったら、**種類も尾びれも背びれも台紙の正解を使う**。
   *
   * 形からの推定は外れる。実際、イルカが「足のある生き物」と判定され、
   * 尾も背びれも動いていなかった（会場からの指摘）。
   * 正解が手元にあるのに推定を信じ続ける理由は無い（R-034 と同じ形の間違い）。
   */
  const answer = found ? rigForSpecies(found.id, found.mirrored) : null
  const rig: Rig = answer
    ? {
        ...measured,
        kind: answer.kind,
        headsRight: answer.headsRight,
        headKnown: true,
        tail: answer.tail,
        /*
         * 足・触手がどちら向きかも**台紙の正解**を使う。
         * 絵からの推定は、実測でタコ4匹のうち2匹を外していた。
         * 外すと波の向きが逆になり、**止めるべき頭が大きく振れて顔が揺れる**（R-044）。
         */
        tipsDown: answer.tipsDown ?? measured.tipsDown,
        // ひれは絵から実測したものを使う（台紙の手置きの矩形は胴を裂いた）
        // 台紙どおりなので推定ではない。動きに使ってよい
        confidence: 1,
      }
    : measured

  return {
    image,
    rig,
    species: found?.id,
    head: found?.head,
    fit: found ? { turns: found.turns, mirrored: found.mirrored } : undefined,
  }
}

/** 作り直した結果。絵そのものが変わったときだけ `pngBase64` が入る。 */
export interface Rebuilt {
  readonly rig: Rig
  readonly species?: SpeciesId
  readonly head?: Direction
  readonly fit?: { readonly turns: number; readonly mirrored: boolean }
  readonly width: number
  readonly height: number
  readonly pngBase64?: string
}

/**
 * **すでに取り込んだ絵を、いまの見分け方で作り直す（R-062）。**
 *
 * 元の写真は残していないので、**保存してある絵**から作り直す。
 * 切り抜きはやり直せないが、直したのは切り抜きの後ろ（種類・向き・動き方）なので、
 * ここだけで足りる。
 *
 * **向き直し（`orientForSwimming`）はやり直さない。** 保存してある絵は
 * すでに落ち着いた向きなので、もう一度かけると余計に回すことがある。
 */
export async function rebuildPiece(src: string, theme?: ThemeId): Promise<Rebuilt | null> {
  const image = await loadImage(src).catch(() => null)
  if (!image) return null

  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.drawImage(image, 0, 0)
  const before = context.getImageData(0, 0, canvas.width, canvas.height)

  const settled = settle(before, theme)
  const changed = settled.image !== before

  let pngBase64: string | undefined
  if (changed) {
    const blob = await new Promise<Blob | null>((resolve) =>
      toCanvas(settled.image).toBlob(resolve, 'image/png'),
    )
    if (!blob) return null
    const buffer = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    for (const byte of buffer) binary += String.fromCharCode(byte)
    pngBase64 = btoa(binary)
  }

  return {
    rig: settled.rig,
    species: settled.species,
    head: settled.head,
    fit: settled.fit,
    width: settled.image.width,
    height: settled.image.height,
    pngBase64,
  }
}

export async function processPhoto(
  dataUrl: string,
  fileName: string,
  options: CutoutOptions,
  /**
   * いまのテーマ。**照合をこのテーマの台紙だけに絞る。**
   * 全種をひとつの集まりとして測ると、まる魚とトリケラトプスが 0.69 で
   * 重なる。渡さなければ今までどおり全種と照合する。
   */
  theme?: ThemeId,
): Promise<ProcessResult> {
  let source: HTMLImageElement
  try {
    source = await loadImage(dataUrl)
  } catch {
    return {
      ok: false,
      message: `${fileName} を画像として開けませんでした。壊れているか、対応していない形式です。JPEG か PNG で入れ直してください。`,
    }
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(source.naturalWidth, source.naturalHeight))
  const width = Math.max(1, Math.round(source.naturalWidth * scale))
  const height = Math.max(1, Math.round(source.naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return { ok: false, message: 'この PC の画面描画を初期化できませんでした。' }
  context.drawImage(source, 0, 0, width, height)

  const source_ = context.getImageData(0, 0, width, height)

  /*
   * この写真に合うしきい値を選ぶ。
   *
   * 実物3枚で、うまくいく範囲が全部違った（魚 0.50〜0.66 / イカ 0.55〜0.62 /
   * タコ 0.40〜0.58）。1つの固定値ではどれかが必ず落ちる。
   * かといって会場で毎回つまみを触らせるのは、このアプリの核（アプリ操作0回）を壊す。
   *
   * 下見は縮小した絵で行う。しきい値は明るさの比較なので縮めても選ぶ値は変わらず、
   * 実寸のまま何通りも試すと 1 枚に数秒かかる。
   */
  let chosen = options.paperValue
  if (options.auto !== false) {
    const small = downscale(source_, 400)
    const found = chooseCutoutValue((paperValue) => {
      const trial = cutoutPaper(small, { ...options, paperValue })
      if (!diagnoseCutout(trial).ok) return null
      const { image } = keepMainRegions(trial)
      const cropped = trimTransparent(image)
      return cropped ? inkStats(cropped.image) : null
    })
    if (found) chosen = found.value

  }

  /*
   * **輪郭の切れ目を塞ぐ幅を、必要になったときだけ広げる（R-057）。**
   *
   * 会場から「ふちの中の白色はのこして」。
   * 塗っていない所は紙と同じ色なので、輪郭が途切れていると外から塗りつぶしが入り、
   * **絵の中の白が消えて線だけになる**。そうなると中身が足りずに取り込みを断る。
   * これが「中に塗った絵が表示すらされない」の正体だった。
   * 実測: 輪郭に 2mm の切れ目を入れた紙は中身 15% で**取り込み拒否**になった。
   *
   * **1回目でうまくいった紙は、1画素も変わらない。**
   * 塞ぐ幅を広げると、タコの足やクラゲの触手のあいだのような本物の隙間まで
   * 埋まって形が変わる。だから**絵にならなかったときだけ**次の幅へ進む。
   *
   * **「どの幅が一番よく合うか」を下見の絵で選ぶのは駄目だった。**
   * 長辺 400px まで縮めるとクラゲの触手が潰れ、素点が 0.44〜0.66 にしかならない。
   * その素点で幅を選ばせたところ、**実寸なら当たっていたクラゲ 3枚が
   * 3枚とも当たらなくなった**。縮めた絵で決めてよいのは明るさのしきい値だけ。
   */
  let attempt: {
    cut: RgbaImage
    cleaned: RgbaImage
    touchedBorder: boolean
    trimmed: NonNullable<ReturnType<typeof trimTransparent>>
  } | null = null
  let refusal = ''

  for (const sealRatio of SEAL_RATIOS) {
    const cut = cutoutPaper(source_, { ...options, paperValue: chosen, sealRatio })

    const diagnosis = diagnoseCutout(cut)
    if (!diagnosis.ok) {
      refusal = diagnosis.message
      continue
    }

    // 影で残った紙の隅やゴミを落としてからトリミングする。順番が逆だと、
    // 捨てるはずの塊を含んだ外接矩形で切ってしまう（R-003）。
    const { image: cleaned, touchedBorder } = keepMainRegions(cut)

    const trimmed = trimTransparent(cleaned)
    if (!trimmed) {
      refusal = '絵が残りませんでした。設定のしきい値を見直してください。'
      continue
    }

    // 外接矩形は大きいのに中身が無い＝絵が消えて紙の裏写りだけが残った状態。
    // ここで止めないと、紙の模様が黙って泳ぎ出す（R-018）。
    const content = diagnoseResult(trimmed.image)
    if (!content.ok) {
      refusal = content.message
      continue
    }

    attempt = { cut, cleaned, touchedBorder, trimmed }
    break
  }

  if (!attempt) return { ok: false, message: `${fileName}: ${refusal}` }
  const { touchedBorder, trimmed } = attempt

  /*
   * 紙の向きは子どもが決める。実物は縦向き（頭が上）に描かれていた。
   * そのまま出すと頭を上に向けたまま横へ滑るので、ここで横向きに直す。
   * 自信が無ければ触らない（`orientForSwimming`）。
   */
  const oriented = orientForSwimming(trimmed.image)

  /*
   * どの台紙の絵かを見分ける。
   *
   * **向きを直したあとに見分ける。** 保存する絵と向きが揃っていないと、
   * 「頭が右か」の答えがずれる。
   * 一致したら、頭の向きは推定ではなく**台紙の正解**を使う。
   * 形から当てる推定は、当たらないことがある（R-030）。
   */
  const settled = settle(oriented.image, theme)
  const image = settled.image
  const rig = settled.rig

  const blob = await new Promise<Blob | null>((resolve) =>
    toCanvas(image).toBlob(resolve, 'image/png'),
  )
  if (!blob) return { ok: false, message: `${fileName}: PNG に変換できませんでした。` }

  const buffer = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (const byte of buffer) binary += String.fromCharCode(byte)

  return {
    ok: true,
    pngBase64: btoa(binary),
    width: image.width,
    height: image.height,
    touchedBorder,
    rig,
    turned: oriented.turns !== 0 || oriented.flipped,
    straightened: image !== oriented.image,
    paperValue: chosen,
    species: settled.species,
    head: settled.head,
    fit: settled.fit,
  }
}
