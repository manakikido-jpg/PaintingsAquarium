import backgroundUrl from '../../../assets/scene/halloween-background.webp?url'
import {
  HALLOWEEN_BACK_RATIO,
  HALLOWEEN_LANES,
  HALLOWEEN_MIN_SCALE,
  makeLanes,
  type Lane,
} from '../../core/walk'
import {
  moonPulse,
  moteFade,
  moteProgress,
  moteX,
  quietCentre,
  spawnMotes,
  spawnStars,
  twinkle,
} from '../../core/sparkle'
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
/** 強さ 0 のときの無地。設定画面が「0 にすると軽くなる」と約束しているので、絵も描かない。 */
const PLAIN = '#1A0E36'

/*
 * **背景の絵に光を足す。**
 * 絵には月や街の灯りが**焼き込まれている**ので、同じ量をもう一度重ねると
 * 画面が白っぽく濁る。足すのは「動いているとわかる最小限」だけにする。
 */
const STAR_COUNT = 28
const MOTE_COUNT = 20
/** 金と、少しだけ混ぜる淡い紫 */
const GOLD = '255, 214, 130'
const VIOLET = '206, 178, 245'
/** 月の位置（**背景の絵の中**での割合）。光を避ける場所と、ほのかな脈の中心 */
const MOON_IMAGE_X = 0.505
const MOON_IMAGE_Y = 0.465
/**
 * 同梱している背景の絵の大きさ。**読み込みを待たずに位置を決めるために要る。**
 * 絵の中の位置（月・地面）を画面の位置に直すとき、読み込み前は縮尺が分からない。
 * **絵を差し替えたらこの数字も直すこと。**
 */
const BG_WIDTH = 1672
const BG_HEIGHT = 941
/**
 * 地面の高さ（**絵の中**での割合）。フランケンシュタインがここを歩く。
 * 絵の手前の丘と道が来るあたり。下げすぎると足が画面の外に切れる。
 */
const GROUND_IMAGE_Y = 0.95

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

  const stars = spawnStars(20261009, STAR_COUNT)
  const motes = spawnMotes(31415926, MOTE_COUNT)

  /** 絵を切らずに画面いっぱいへ（はみ出すぶんは左右か上下で均等に捨てる）。 */
  const cover = (context: CanvasRenderingContext2D): void => {
    const scale = Math.max(tank.width / image.naturalWidth, tank.height / image.naturalHeight)
    const w = image.naturalWidth * scale
    const h = image.naturalHeight * scale
    context.drawImage(image, (tank.width - w) / 2, (tank.height - h) / 2, w, h)
  }

  /**
   * 背景の絵の中の位置（0〜1）を、画面の上の位置に直す。
   * **月も地面も絵に焼き込まれている**ので、画面の割合で決め打ちすると
   * 画面の縦横比が変わったときにずれる（`cover` が切り落とす量が変わるため）。
   *
   * **読み込みを待たない。** 絵の大きさは定数で持っている（`BG_WIDTH`）。
   * 待つと、地面の高さが決まる前に歩く絵が置かれてしまう。
   */
  const fromImage = (ix: number, iy: number): { x: number; y: number } => {
    const scale = Math.max(tank.width / BG_WIDTH, tank.height / BG_HEIGHT)
    const w = BG_WIDTH * scale
    const h = BG_HEIGHT * scale
    return { x: (tank.width - w) / 2 + w * ix, y: (tank.height - h) / 2 + h * iy }
  }

  /*
   * **奥行きの列を4本持つ。** 地面を歩く種類（かぼちゃ・フランケン）のため。
   * 背景は1枚の絵なので地面を描く必要はなく（`drawLane` は何もしない）、
   * 要るのは「どの高さに足を置くか」だけ。
   *
   * **1本だと足りない。** 歩く種類が1つ（フランケンだけ）のうちは足りていたが、
   * かぼちゃを地面に下ろして2つになった。会場の設定（同時50枚）だと
   * 歩く絵が約20体になり、実測で**重なった組が平均 3.6 → 18.9**（最大27）
   * まで悪化した。1本の線に20体を並べれば当然で、
   * **自分の絵を見つけられない**（要件定義 §3 5c）。
   * 列を増やすと 3本で 4.5・**4本で 3.0**・5本で 3.5。4本を採る。
   *
   * 帯は背景の絵の手前の丘に合わせてある（画面の高さの 84%〜99%）。
   * これより上げると、城と村の上を歩くことになる。
   *
   * **重なり順は `drawsFlat` で解いてある。** 列ごとに分けて描くと、
   * ただよう絵は全部 0 番の列に入るので、空のおばけが手前の絵より
   * 先に描かれてしまう。足元の低い順に描けばよい（`scene/types.ts`）。
   */
  const frontGroundY = Math.min(tank.height * 0.99, fromImage(0.5, GROUND_IMAGE_Y).y)
  const lanes: Lane[] = makeLanes(tank, HALLOWEEN_LANES, {
    backRatio: HALLOWEEN_BACK_RATIO,
    frontRatio: frontGroundY / tank.height,
    // 奥ほど小さく。奥行きは高さだけでなく大きさでも出す（R-009 / R-011）
    minScale: HALLOWEEN_MIN_SCALE,
    maxScale: 1,
  })

  /** 光をひと粒。中心だけ明るく、縁は透明（四角い点に見せない）。 */
  const dot = (context: CanvasRenderingContext2D, x: number, y: number, r: number,
               color: string, alpha: number): void => {
    const g = context.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(${color}, ${alpha})`)
    g.addColorStop(0.4, `rgba(${color}, ${alpha * 0.5})`)
    g.addColorStop(1, `rgba(${color}, 0)`)
    context.fillStyle = g
    context.beginPath()
    context.arc(x, y, r, 0, Math.PI * 2)
    context.fill()
  }

  return {
    motion: 'float',
    lanes,
    // 背景が1枚の絵なので、列ごとではなく足元の低い順に描く
    drawsFlat: true,

    drawBehind(context, elapsed, strength) {
      /*
       * **強さ 0 は「無地にする」。**
       * 設定画面の説明が「0 にすると軽くなる（背景を描かなくなる）」と
       * 約束しているので、**画像も光も描かない**。暗くするだけでは
       * 描画の費用が変わらず、約束を破ることになる。
       */
      if (strength <= 0) {
        context.fillStyle = PLAIN
        context.fillRect(0, 0, tank.width, tank.height)
        return
      }

      context.fillStyle = FALLBACK_SKY
      context.fillRect(0, 0, tank.width, tank.height)
      if (ready) cover(context)

      // 背景の強さ。1 なら絵のまま、下げるほど沈めて子どもの絵を立たせる
      if (strength < 1) {
        context.fillStyle = `rgba(${DIM}, ${(1 - strength) * 0.7})`
        context.fillRect(0, 0, tank.width, tank.height)
      }

      /*
       * **光は背景と子どもの絵の**あいだ**に描く。**
       * 手前（`drawFront`）に出すと絵の上に粒が乗り、顔が汚れて見える。
       */
      const moon = fromImage(MOON_IMAGE_X, MOON_IMAGE_Y)
      // 月のまわりのごく弱い脈。月そのものは動かさない（貼り替わって見える）
      const pulse = moonPulse(elapsed)
      const halo = Math.min(tank.width, tank.height) * 0.34
      const glow = context.createRadialGradient(moon.x, moon.y, halo * 0.3, moon.x, moon.y, halo)
      glow.addColorStop(0, `rgba(255, 196, 96, ${0.05 * (pulse - 0.9) * 10 * strength})`)
      glow.addColorStop(1, 'rgba(255, 196, 96, 0)')
      context.fillStyle = glow
      context.fillRect(moon.x - halo, moon.y - halo, halo * 2, halo * 2)

      for (const star of stars) {
        const quiet = quietCentre(star.x, star.y, MOON_IMAGE_X, MOON_IMAGE_Y)
        if (quiet < 0.05) continue
        const alpha = twinkle(star, elapsed) * quiet * 0.75 * strength
        dot(context, star.x * tank.width, star.y * tank.height,
            star.radius * tank.height * 3, GOLD, alpha)
      }

      for (const mote of motes) {
        const progress = moteProgress(mote, elapsed)
        // 下から上へ。画面の下半分から出て、上半分へ抜ける
        const y = 1 - progress
        const x = moteX(mote, elapsed)
        const quiet = quietCentre(x, y, MOON_IMAGE_X, MOON_IMAGE_Y)
        if (quiet < 0.05) continue
        const alpha = moteFade(progress) * quiet * 0.5 * strength
        dot(context, x * tank.width, y * tank.height,
            mote.radius * tank.height * 3.4, mote.violet ? VIOLET : GOLD, alpha)
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
