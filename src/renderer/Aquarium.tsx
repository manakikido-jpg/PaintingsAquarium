import { useEffect, useRef } from 'react'
import { facesRight, renderY, spawnFish, stepFish, type Fish } from '../core/swim'
import type { Piece } from '../shared/types'

interface Swimmer {
  readonly piece: Piece
  readonly element: HTMLImageElement
  fish: Fish
}

/** 絵の id から泳ぎ方の種を作る。同じ絵はいつ起動しても同じ泳ぎ方になる。 */
function seedOf(id: string): number {
  let seed = 0
  for (const character of id) seed = (seed * 31 + character.charCodeAt(0)) | 0
  return seed
}

export function Aquarium({ pieces }: { pieces: Piece[] }): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const swimmersRef = useRef<Map<string, Swimmer>>(new Map())
  // 描画ループから読むだけの値。state にすると毎フレーム再購読になる。
  const piecesRef = useRef<Piece[]>(pieces)
  piecesRef.current = pieces

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    let animationId = 0
    let previous = performance.now()

    const resize = (): void => {
      // 4K の大画面でぼやけないように、実画素に合わせる。
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.round(canvas.clientWidth * ratio)
      canvas.height = Math.round(canvas.clientHeight * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const frame = (now: number): void => {
      // タブが隠れていた等で dt が跳ねると、絵が一気に壁まで飛ぶ。上限を掛ける。
      const dt = Math.min(0.05, (now - previous) / 1000)
      previous = now

      const tank = { width: canvas.clientWidth, height: canvas.clientHeight }
      const swimmers = swimmersRef.current
      const wanted = new Set(piecesRef.current.map((piece) => piece.id))

      for (const id of swimmers.keys()) {
        if (!wanted.has(id)) swimmers.delete(id)
      }

      for (const piece of piecesRef.current) {
        if (swimmers.has(piece.id)) continue
        const element = new Image()
        element.src = `aqua://piece/${piece.id}`
        swimmers.set(piece.id, {
          piece,
          element,
          fish: spawnFish(seedOf(piece.id), tank, piece.width, piece.height),
        })
      }

      context.clearRect(0, 0, tank.width, tank.height)

      for (const swimmer of swimmers.values()) {
        swimmer.fish = stepFish(swimmer.fish, dt, tank)
        if (!swimmer.element.complete || swimmer.element.naturalWidth === 0) continue

        const { fish } = swimmer
        const y = renderY(fish)
        context.save()
        context.translate(fish.x, y)
        // 進む向きに合わせて左右反転する。魚が後ろ向きに泳いで見えるのを避けるため。
        if (!facesRight(fish)) context.scale(-1, 1)
        context.drawImage(
          swimmer.element,
          -fish.width / 2,
          -fish.height / 2,
          fish.width,
          fish.height,
        )
        context.restore()
      }

      animationId = requestAnimationFrame(frame)
    }

    animationId = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="aquarium" />
}
