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
import { orientForSwimming, type Rig } from '../core/rig'
import { identifySpecies, type SpeciesId } from '../core/templates'

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
      /** 実際に使ったしきい値。自動で選んだ値を運営者が見られるようにする */
      paperValue: number
      /**
       * どの台紙の絵か。台紙に一致しなければ undefined（自由に描いた絵）。
       * 種類ごとの動きに使う（`docs/設計-生き物ごとの動き.md`）。
       */
      species?: SpeciesId
      /** 絵の中で頭が向いている向き（台紙に一致した絵だけ） */
      head?: { readonly x: number; readonly y: number }
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
  const found = identifySpecies(oriented.image)
  const rig: Rig =
    found && found.headsRight !== null
      ? { ...oriented.rig, headsRight: found.headsRight, headKnown: true }
      : oriented.rig

  const blob = await new Promise<Blob | null>((resolve) =>
    toCanvas(oriented.image).toBlob(resolve, 'image/png'),
  )
  if (!blob) return { ok: false, message: `${fileName}: PNG に変換できませんでした。` }

  const buffer = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (const byte of buffer) binary += String.fromCharCode(byte)

  return {
    ok: true,
    pngBase64: btoa(binary),
    width: oriented.image.width,
    height: oriented.image.height,
    touchedBorder,
    rig,
    turned: oriented.turns !== 0 || oriented.flipped,
    paperValue: chosen,
    species: found?.id,
    head: found?.head,
  }
}
