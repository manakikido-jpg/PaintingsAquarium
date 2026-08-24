import {
  chooseCutoutValue,
  cutoutPaper,
  diagnoseCutout,
  diagnoseResult,
  inkStats,
  type CutoutOptions,
} from '../core/cutout'
import { trimTransparent } from '../core/trim'
import { keepMainRegions } from '../core/regions'
import { downscale, type RgbaImage } from '../core/image'
import { orientForSwimming, rotateQuarter, type Rig } from '../core/rig'
import { identifySpecies, rigForSpecies, type SpeciesId } from '../core/templates'
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

  const cut = cutoutPaper(source_, { ...options, paperValue: chosen })

  const diagnosis = diagnoseCutout(cut)
  if (!diagnosis.ok) return { ok: false, message: `${fileName}: ${diagnosis.message}` }

  // 影で残った紙の隅やゴミを落としてからトリミングする。順番が逆だと、
  // 捨てるはずの塊を含んだ外接矩形で切ってしまう（R-003）。
  const { image: cleaned, touchedBorder } = keepMainRegions(cut)

  const trimmed = trimTransparent(cleaned)
  if (!trimmed) {
    return { ok: false, message: `${fileName}: 絵が残りませんでした。設定のしきい値を見直してください。` }
  }

  // 外接矩形は大きいのに中身が無い＝絵が消えて紙の裏写りだけが残った状態。
  // ここで止めないと、紙の模様が黙って泳ぎ出す（R-018）。
  const content = diagnoseResult(trimmed.image)
  if (!content.ok) return { ok: false, message: `${fileName}: ${content.message}` }

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
  let image = oriented.image
  let found = identifySpecies(image, theme)

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
  if (found && found.turns !== 0) {
    image = rotateQuarter(image, found.turns)
    found = identifySpecies(image, theme)
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
        ...oriented.rig,
        kind: answer.kind,
        headsRight: answer.headsRight,
        headKnown: true,
        tail: answer.tail,
        // ひれは絵から実測したものを使う（台紙の手置きの矩形は胴を裂いた）
        // 台紙どおりなので推定ではない。動きに使ってよい
        confidence: 1,
      }
    : oriented.rig

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
    species: found?.id,
    head: found?.head,
    fit: found ? { turns: found.turns, mirrored: found.mirrored } : undefined,
  }
}
