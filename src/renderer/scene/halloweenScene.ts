import backgroundUrl from '../../../assets/scene/halloween-background.webp?url'
import type { Tank } from '../../core/swim'
import type { Scene } from './types'

/*
 * ハロウィンの世界。**絵は全部ただよう**ので、奥行きの列は持たない（`float`）。
 *
 * **ここだけ、背景を1枚の絵で敷いている。**
 * 水族館と恐竜は図形で描いているが、このテーマは本人が
 * **「この画像のままで」**と決めた絵をそのまま使う（2026-10-09）。
 * 図形で似せて描いた版も作ったが採らなかった（コミット `e7f7f99`）。
 *
 * **そのとき分かったこと。** 参考画像のお城は画面中央にそびえている。
 * 図形で作り直すときは**絵が漂う場所と正面衝突する**ので小さくする必要があったが、
 * **絵をそのまま敷くなら話が別**で、お城は背景の一部として沈む。
 * 子どもの絵は**その上に光を背負って浮く**（`drawBeneath`）ので埋もれない。
 *
 * **絵が沈まない仕掛けは残してある。**
 * 暗い背景で絵が沈む問題は一度踏んでいる（R-011 / R-013）。
 * 絵の後ろの淡い光は、水族館では撤去したが記録はこう残っている
 * ——「**暗い背景では効いた**が、明るい水では白く濁った」（2026-08-14）。
 * ここは効いたほうの条件に当たるので、入れたままにする。
 *
 * **画像は同梱する。** 実行時に外から取りに行かない（完全オフラインで動く）。
 * 元の PNG（2.0MB）は `assets/scene/source/` に残し、配るのは webp（202KB）。
 * 絵は同じで、インストーラが軽くなる。
 */

/** 画像が読めるまでの下地。白や黒だと一瞬ちらつくので、絵の空に近い紫を置く。 */
const FALLBACK_SKY = '#3B1F6B'
/** 「背景の強さ」を下げたときに重ねる色。絵を目立たせたいときに背景を沈める。 */
const DIM = '26, 14, 54'

/** ハロウィン。絵は夜空をただよう。 */
export function createHalloweenScene(tank: Tank, _decorDensity = 1): Scene {
  /*
   * 飾りの多さ（`decorDensity`）は、このテーマでは効かない。
   * 背景が1枚の絵なので増やす飾りが無い。設定画面のつまみは
   * 水族館・恐竜には効くので、ここで受け取るだけ受け取って捨てる。
   */
  const image = new Image()
  image.src = backgroundUrl
  let ready = image.complete && image.naturalWidth > 0
  image.addEventListener('load', () => { ready = true })

  /** 絵を切らずに画面いっぱいへ（はみ出すぶんは左右か上下で均等に捨てる）。 */
  const cover = (context: CanvasRenderingContext2D): void => {
    const scale = Math.max(tank.width / image.naturalWidth, tank.height / image.naturalHeight)
    const w = image.naturalWidth * scale
    const h = image.naturalHeight * scale
    context.drawImage(image, (tank.width - w) / 2, (tank.height - h) / 2, w, h)
  }

  return {
    motion: 'float',
    lanes: [],

    drawBehind(context, _elapsed, strength) {
      context.fillStyle = FALLBACK_SKY
      context.fillRect(0, 0, tank.width, tank.height)
      if (ready) cover(context)

      // 背景の強さ。1 なら絵のまま、下げるほど沈めて子どもの絵を立たせる
      if (strength < 1) {
        context.fillStyle = `rgba(${DIM}, ${(1 - strength) * 0.7})`
        context.fillRect(0, 0, tank.width, tank.height)
      }
    },

    drawLane() {
      // 列を持たないテーマなので何もしない
    },

    /*
     * **絵の後ろの淡い光。** 子どもの絵は濃い色で塗られがちで、夜空に沈む。
     * 月の色（橙）を借りて浮かせる。水族館で撤去したのは明るい水だったからで、
     * 暗い背景では効く（2026-08-14 の記録）。
     */
    drawBeneath(context, place, _laneIndex, strength) {
      const r = Math.max(place.width, place.height) * 0.9
      const glow = context.createRadialGradient(place.x, place.y, r * 0.15, place.x, place.y, r)
      glow.addColorStop(0, `rgba(255, 214, 150, ${0.26 * strength})`)
      glow.addColorStop(0.55, `rgba(255, 196, 130, ${0.1 * strength})`)
      glow.addColorStop(1, 'rgba(255, 196, 130, 0)')
      context.fillStyle = glow
      context.fillRect(place.x - r, place.y - r, r * 2, r * 2)
    },

    drawFront() {
      // 絵そのものに空気感があるので、霧などは重ねない
    },
  }
}
