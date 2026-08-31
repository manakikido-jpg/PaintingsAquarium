import { renderCaustics, type CausticsOptions } from '../core/caustics'
import type { Tank } from '../core/swim'

/**
 * 水面の揺らぎ模様を画面に重ねる層。
 *
 * **画面の実寸では作らない。** 長辺 480px 程度の小さい面に描き、
 * 引き伸ばして重ねる。模様はもともとぼやけているので拡大しても粗が出ず、
 * 4K の大画面でも計算量が変わらない。
 *
 * 重ね方は `lighter`（加算）。黒い所は何も足さないので、
 * 明るい筋だけが水に浮かび上がる。
 *
 * ## 毎フレーム計算するか、焼いておくか
 *
 * この模様は**画素ごとの三角関数**で、GPU では肩代わりできない CPU の仕事。
 * 実測（Xeon 2.8GHz・1コア）で 640×360 が 15.0ms、520×293 が 7.8ms。
 * 2枚で 26ms 使うので、**60fps の予算 16.7ms に入らない**
 *（GPU をどれだけ積んでも 38fps が上限・`docs/推奨スペック.md`）。
 *
 * そこで `loopSeconds` を渡すと、**起動時に1周ぶんを焼いて**おき、
 * 以降は焼いた絵を貼るだけにする。毎フレームの計算は 0 になる。
 */
export interface CausticsLayer {
  draw(context: CanvasRenderingContext2D, elapsed: number, strength: number): void
  /** 焼いたコマ数（0 なら毎フレーム計算している）。診断用 */
  readonly frames: number
}

export interface CausticsLayerOptions extends CausticsOptions {
  /** 長辺の画素数。大きいほど細かいが重くなる */
  readonly resolution?: number
  /** 模様の色 */
  readonly tint?: readonly [number, number, number]
  /** 全体の濃さ */
  readonly intensity?: number
  /**
   * 1周する秒数。0（既定）なら焼かずに毎フレーム計算する。
   *
   * **短くしすぎないこと。** 1周に入る回転数が少ないと、波の速さが全部
   * 同じ値へ丸められる（`loopingDrift`）。実測で 60秒 にすると、
   * 全部の波が1回転に丸まったうえ半周で符号が反転するだけになり、
   * **30秒で同じ絵に戻る**（模様が「脈打つ」だけになる）。180秒では起きない。
   */
  readonly loopSeconds?: number
  /** 1秒あたり何コマ焼くか。あいだは2コマの重ね合わせでつなぐ */
  readonly loopFps?: number
}

/**
 * 焼いた絵の使い回し。
 *
 * **世界は作り直されることがある。** 設定の「飾りの多さ」や「絵の大きさ」を
 * 動かすと、そのたびに `createScene` からやり直す（`Aquarium.tsx` の `builtFor`）。
 * 焼き直すと 90コマ×2枚で 0.7秒 ほど固まるので、
 * **画面の大きさと設定が同じなら、焼いたものをそのまま使い回す。**
 * 揺らぎ模様は飾りの数にも絵の大きさにも関係しないので、作り直す理由が無い。
 */
const baked = new Map<string, { sheet: HTMLCanvasElement; frames: number }>()

export function createCausticsLayer(
  tank: Tank,
  {
    resolution = 480,
    tint = [150, 232, 255],
    intensity = 0.5,
    loopSeconds = 0,
    loopFps = 0.5,
    ...causticsOptions
  }: CausticsLayerOptions = {},
): CausticsLayer {
  const width = Math.max(1, Math.min(resolution, Math.round(tank.width)))
  const height = Math.max(1, Math.round((width * Math.max(1, tank.height)) / Math.max(1, tank.width)))
  const [tintR, tintG, tintB] = tint

  const field = new Uint8ClampedArray(width * height)

  /** 明るさの面を、色を付けた画素に変える。 */
  const paint = (image: ImageData): void => {
    const pixels = image.data
    for (let index = 0; index < field.length; index++) {
      const value = field[index] / 255
      const offset = index * 4
      pixels[offset] = tintR * value
      pixels[offset + 1] = tintG * value
      pixels[offset + 2] = tintB * value
      // 加算合成なので、暗い画素は何も足さない。透明度で調整しない。
      pixels[offset + 3] = 255
    }
  }

  /* ------------------------------------------------ 焼かない（毎フレーム計算） */
  if (loopSeconds <= 0) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const buffer = canvas.getContext('2d')
    const image = buffer?.createImageData(width, height)

    return {
      frames: 0,
      draw(context, elapsed, strength) {
        if (!buffer || !image || strength <= 0) return
        renderCaustics(field, width, height, elapsed, causticsOptions)
        paint(image)
        buffer.putImageData(image, 0, 0)
        context.save()
        context.globalCompositeOperation = 'lighter'
        context.globalAlpha = intensity * strength
        context.imageSmoothingEnabled = true
        context.imageSmoothingQuality = 'low'
        context.drawImage(canvas, 0, 0, tank.width, tank.height)
        context.restore()
      },
    }
  }

  /* ------------------------------------------------------------ 焼いておく */
  const frames = Math.max(2, Math.round(loopSeconds * loopFps))
  const key = JSON.stringify([width, height, frames, loopSeconds, tint, causticsOptions])
  const reuse = baked.get(key)
  /*
   * 1コマ1枚の canvas にすると、コマ数ぶんの絵を持つことになる。
   * **1枚の大きな canvas に格子状に並べて**、その一部だけを貼る。
   * 持ち物が1つで済み、貼るときの切り替えも無い。
   */
  const columns = Math.ceil(Math.sqrt(frames))
  const rows = Math.ceil(frames / columns)
  const sheet = reuse?.sheet ?? document.createElement('canvas')
  if (!reuse) {
    sheet.width = width * columns
    sheet.height = height * rows
  }
  const buffer = sheet.getContext('2d')
  const image = buffer?.createImageData(width, height)

  if (!reuse && buffer && image) {
    for (let index = 0; index < frames; index++) {
      // **1周を frames 等分した時刻**で焼く。最後のコマの次が最初のコマに戻る
      renderCaustics(field, width, height, (index / frames) * loopSeconds, {
        ...causticsOptions,
        loopSeconds,
      })
      paint(image)
      buffer.putImageData(image, (index % columns) * width, Math.floor(index / columns) * height)
    }
    baked.set(key, { sheet, frames })
  }

  /*
   * 混ぜる場所。**小さい面の上で混ぜてから、1回だけ引き伸ばす。**
   *
   * 画面いっぱいに2回貼って混ぜると、全画面を塗る回数が2倍になる。
   * 塗る量は画面の広さに比例するので、これは 4K でそのまま効いてくる。
   * ここ（400×225 など）で混ぜれば、混ぜる費用は画面の広さと無関係になり、
   * 全画面を塗るのは焼く前と同じ1回で済む。
   */
  const mixer = document.createElement('canvas')
  mixer.width = width
  mixer.height = height
  const mix = mixer.getContext('2d')

  return {
    frames,
    draw(context, elapsed, strength) {
      if (!buffer || !mix || strength <= 0) return

      const at = ((elapsed % loopSeconds) + loopSeconds) % loopSeconds
      const position = (at / loopSeconds) * frames
      const index = Math.floor(position) % frames
      const blend = position - Math.floor(position)

      /*
       * 前後2コマを濃さで混ぜる。**加算合成なので、`(1-f)` と `f` を足すと
       * ちょうど中間の絵になる**（重ね順や透明度の掛かり方を気にしなくてよい）。
       * こうしないと、コマが切り替わる瞬間に模様が飛んで見える。
       */
      mix.clearRect(0, 0, width, height)
      mix.globalCompositeOperation = 'lighter'
      for (const [frame, weight] of [
        [index, 1 - blend],
        [(index + 1) % frames, blend],
      ] as const) {
        if (weight <= 0) continue
        mix.globalAlpha = weight
        mix.drawImage(
          sheet,
          (frame % columns) * width,
          Math.floor(frame / columns) * height,
          width,
          height,
          0,
          0,
          width,
          height,
        )
      }

      context.save()
      context.globalCompositeOperation = 'lighter'
      context.globalAlpha = intensity * strength
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'low'
      context.drawImage(mixer, 0, 0, tank.width, tank.height)
      context.restore()
    },
  }
}
