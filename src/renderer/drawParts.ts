import { partAlpha, type PlacedPart } from '../core/parts'
import type { Tank } from '../core/swim'

/**
 * パーツ画像を背景に敷く。
 *
 * 1個につき `drawImage` 1回。図形で描くと縁・影・塗り・光の4工程かかるが、
 * **速くなったわけではない**。同じ11枚での実測は 12.6 / 11.8fps（画像）に対し
 * 12.0fps（図形）で、差は測定のばらつきの範囲だった。
 * 重いのは水と光の側で、飾りの描き方ではない。入れた理由は見た目。
 */

/** 読み込んだパーツ画像。 */
export interface PartImages {
  readonly images: readonly HTMLImageElement[]
  /** 全部読み終わったか */
  readonly ready: boolean
}

/**
 * パーツ画像を読み込む。
 *
 * 1枚でも足りないうちは `ready` を立てない。
 * 途中で描き始めると、抜けたところだけ空いた背景が一瞬映る。
 */
export function loadParts(files: readonly string[], onReady: () => void): PartImages {
  const images: HTMLImageElement[] = []
  const state = { images, ready: false }
  if (files.length === 0) return { images: [], ready: true }

  let left = files.length
  for (const file of files) {
    const image = new Image()
    image.src = file
    image.onload = () => {
      left--
      if (left === 0) {
        ;(state as { ready: boolean }).ready = true
        onReady()
      }
    }
    image.onerror = () => {
      // 読めない画像があっても止めない。その1枚を諦めて先へ進む
      left--
      if (left === 0) {
        ;(state as { ready: boolean }).ready = true
        onReady()
      }
    }
    images.push(image)
  }
  return state
}

export function drawParts(
  context: CanvasRenderingContext2D,
  parts: readonly PlacedPart[],
  loaded: PartImages,
  tank: Tank,
  strength: number,
): void {
  if (strength <= 0 || !loaded.ready || loaded.images.length === 0) return

  for (const part of parts) {
    const image = loaded.images[part.index % loaded.images.length]
    if (!image || !image.complete || image.naturalWidth === 0) continue

    /*
     * 高さを基準に幅を出す。幅を基準にすると、細長いパーツが縦へ伸びて
     * 画面を突き抜ける（実際にそうなった）。
     * ただし極端に横長のパーツは幅が出すぎるので、画面幅の 1/4 で頭打ちにする。
     * 4 割にしていたときは、石が横につながって**底が壁**になった。
     */
    const aspect = image.naturalWidth / image.naturalHeight
    let height = part.height
    let width = height * aspect
    const maxWidth = tank.width * 0.26
    if (width > maxWidth) {
      width = maxWidth
      height = width / aspect
    }
    const left = part.x - width / 2
    const top = part.groundY - height

    /*
     * 接地の影。パーツ側には落ち影を描かせていないので、ここで付ける。
     * 影が無いと、地面に貼り付いた紙に見える（R-025）。
     */
    const shadow = context.createRadialGradient(
      part.x,
      part.groundY,
      0,
      part.x,
      part.groundY,
      width * 0.6,
    )
    shadow.addColorStop(0, `rgba(6, 26, 76, ${0.34 * strength * partAlpha(part.depth)})`)
    shadow.addColorStop(1, 'rgba(6, 26, 76, 0)')
    context.fillStyle = shadow
    context.beginPath()
    context.ellipse(part.x, part.groundY, width * 0.6, height * 0.1, 0, 0, Math.PI * 2)
    context.fill()

    context.save()
    context.globalAlpha = strength * partAlpha(part.depth)
    if (part.flipped) {
      context.translate(part.x, 0)
      context.scale(-1, 1)
      context.translate(-part.x, 0)
    }
    context.drawImage(image, left, top, width, height)
    context.restore()

  }
}
