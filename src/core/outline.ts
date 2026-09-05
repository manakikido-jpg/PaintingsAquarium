import { cloneImage, value, type RgbaImage } from './image'

/**
 * 照合に使う形を、**印刷された輪郭の内側**から作る。
 *
 * **なぜ要るのか（R-055）**
 *
 * 会場から「こどもが枠を超えて書いているせいで認識しなくなっています」。
 * 台紙の見分けは、取り込んだ絵の**形**を台紙と重ねて測っている。
 * 塗った色まで形に含めていたので、枠外へはみ出した分だけ形が変わって外れた。
 * 実測: 枠外へ 5mm はみ出すと、**こい色でも**種類が付かなくなる
 *（絵の縦横比が 1.15 → 1.48）。
 *
 * **印刷された線は黒く、クレヨンはそれより明るい。**
 * だから「暗い画素＝線」とみなし、その線に囲まれていない所を外す。
 * はみ出した色は線を越えられないので、形から落ちる。
 *
 * 外周から「線でない画素」を通って辿れる所が外側。残りが絵の形。
 * 紙を消したあとの透明な画素も「線でない」ので通り抜けられる。
 */

/**
 * 線とみなす暗さ（0〜1）。これより暗ければ線。
 *
 * 台紙の線は真っ黒（実測 0.11）。クレヨンは一番濃いオレンジでも 0.96 で、
 * 大きく離れている。**濃い色のクレヨンで塗ってもここには入らない。**
 *
 * 例外は**黒や濃紺のクレヨン**で、それは線と同じ扱いになる。
 * そのときは、はみ出した分も形に含まれる（＝いままでと同じ）。
 * 消しすぎるより、たまに外すほうがよい。
 */
export const OUTLINE_DARKNESS = 0.45

/**
 * 線に囲まれた範囲だけを不透明にした絵を返す。色（RGB）は変えない。
 *
 * 返すのは**照合のためだけの絵**。保存する絵や画面に出す絵は元のまま。
 * 子どもが枠の外に描いたものを消すわけではない。
 */
export function insideOutline(
  source: RgbaImage,
  darkness: number = OUTLINE_DARKNESS,
): RgbaImage {
  const { width, height, data } = source
  const result = cloneImage(source)
  const total = width * height
  if (total === 0) return result

  const isLine = (index: number): boolean => {
    const offset = index * 4
    // 透明な所（消した紙）は線ではない。通り抜けられる
    if (data[offset + 3] < 24) return false
    return value(data[offset], data[offset + 1], data[offset + 2]) <= darkness
  }

  const outside = new Uint8Array(total)
  const stack = new Int32Array(total)
  let stackSize = 0

  const push = (index: number): void => {
    if (outside[index] === 1 || isLine(index)) return
    outside[index] = 1
    stack[stackSize++] = index
  }

  for (let x = 0; x < width; x++) {
    push(x)
    push((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    push(y * width)
    push(y * width + width - 1)
  }

  while (stackSize > 0) {
    const index = stack[--stackSize]
    const x = index % width
    const y = (index - x) / width
    if (x > 0) push(index - 1)
    if (x < width - 1) push(index + 1)
    if (y > 0) push(index - width)
    if (y < height - 1) push(index + width)
  }

  for (let index = 0; index < total; index++) {
    result.data[index * 4 + 3] = outside[index] === 1 ? 0 : 255
  }
  return result
}
