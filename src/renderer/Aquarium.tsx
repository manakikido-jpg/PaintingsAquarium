import { useEffect, useRef } from 'react'
import {
  facesRight,
  renderY,
  separateFish,
  spawnFish,
  stepFish,
  type Fish,
  type Tank,
} from '../core/swim'
import { spawnBubbles, spawnRays, stepBubble, type Bubble, type LightRay } from '../core/scenery'
import { drawBubbles, drawLightRays, drawVignette, drawWater } from './drawScenery'
import {
  sandProfile,
  spawnRocks,
  spawnSeaweed,
  shipwreckSpan,
  spawnShells,
  spawnShipwreck,
  type Rock,
  type Seaweed,
  type Shell,
  type Shipwreck,
} from '../core/decor'
import { drawRocks, drawSand, drawSeaweed, drawShells, drawShipwreck } from './drawDecor'
import { appearAlpha, appearProgress, appearScale, isNewlyArrived } from '../core/appear'
import type { Piece } from '../shared/types'

interface Swimmer {
  readonly piece: Piece
  readonly element: HTMLImageElement
  /** 水槽に入った時刻（描画ループの経過秒）。演出をしない絵は -Infinity */
  readonly bornAt: number
  fish: Fish
}

/** 絵の id から泳ぎ方の種を作る。同じ絵はいつ起動しても同じ泳ぎ方になる。 */
function seedOf(id: string): number {
  let seed = 0
  for (const character of id) seed = (seed * 31 + character.charCodeAt(0)) | 0
  return seed
}

const RAY_COUNT = 7
// 手前の泡は絵に重なるので少なく、奥は多めに。奥行きを出すため。
const BACK_BUBBLE_COUNT = 34
const FRONT_BUBBLE_COUNT = 10
const ROCK_COUNT = 6
const SHELL_COUNT = 5
// SEAWEED_COUNT は「株」の数。1 株から数枚の葉が生える。
const SEAWEED_COUNT = 8

export function Aquarium({
  pieces,
  sceneryStrength,
}: {
  pieces: Piece[]
  sceneryStrength: number
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const swimmersRef = useRef<Map<string, Swimmer>>(new Map())
  // 描画ループから読むだけの値。state にすると毎フレーム再購読になる。
  const piecesRef = useRef<Piece[]>(pieces)
  piecesRef.current = pieces
  const strengthRef = useRef(sceneryStrength)
  strengthRef.current = sceneryStrength

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    let animationId = 0
    let previous = performance.now()
    let elapsed = 0
    // 起動時刻。これより後に取り込まれた絵だけを新入りとして演出する。
    const appStartedAt = Date.now()

    let rays: LightRay[] = []
    let backBubbles: Bubble[] = []
    let frontBubbles: Bubble[] = []
    let sand: number[] = []
    let rocks: Rock[] = []
    let seaweed: Seaweed[] = []
    let shells: Shell[] = []
    let wreck: Shipwreck | null = null
    let builtFor = { width: -1, height: -1 }

    const resize = (): void => {
      // 4K の大画面でぼやけないように、実画素に合わせる。
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.round(canvas.clientWidth * ratio)
      canvas.height = Math.round(canvas.clientHeight * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    /**
     * 背景の要素は画面の大きさに合わせて置き直す。
     * 毎フレーム作り直すと、泡が動かず場所だけ変わってちらつくため、
     * 大きさが変わったときだけ作る。
     */
    const rebuildScenery = (tank: Tank): void => {
      if (builtFor.width === tank.width && builtFor.height === tank.height) return
      builtFor = { width: tank.width, height: tank.height }
      rays = spawnRays(20260812, RAY_COUNT, tank)
      backBubbles = spawnBubbles(1207, BACK_BUBBLE_COUNT, tank, { maxAlpha: 0.2 })
      frontBubbles = spawnBubbles(9931, FRONT_BUBBLE_COUNT, tank, {
        minRadius: 5,
        maxRadius: 13,
        minSpeed: 26,
        maxSpeed: 62,
        maxAlpha: 0.14,
      })
      sand = sandProfile(4471, tank)
      wreck = spawnShipwreck(tank)
      // 沈没船の前には生やさない。重ねると輪郭が消えて塊になる（R-006）。
      const wreckSpan = shipwreckSpan(wreck, tank)
      rocks = spawnRocks(8823, ROCK_COUNT, tank, wreckSpan)
      seaweed = spawnSeaweed(5507, SEAWEED_COUNT, tank, wreckSpan)
      shells = spawnShells(6619, SHELL_COUNT, tank)
    }

    const frame = (now: number): void => {
      // タブが隠れていた等で dt が跳ねると、絵が一気に壁まで飛ぶ。上限を掛ける。
      const dt = Math.min(0.05, (now - previous) / 1000)
      previous = now
      elapsed += dt

      const tank: Tank = { width: canvas.clientWidth, height: canvas.clientHeight }
      const strength = strengthRef.current
      rebuildScenery(tank)

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
          // 起動前からある絵は演出しない。起動のたびに全部が一斉に現れると
          // 不具合に見えるため。
          bornAt: isNewlyArrived(piece.createdAt, appStartedAt) ? elapsed : -Infinity,
          fish: spawnFish(seedOf(piece.id), tank, piece.width, piece.height),
        })
      }

      backBubbles = backBubbles.map((bubble) => stepBubble(bubble, dt, tank))
      frontBubbles = frontBubbles.map((bubble) => stepBubble(bubble, dt, tank))

      // 奥から手前へ順に重ねる。周辺減光は絵より前に掛ける
      //（絵のあとに掛けると、端を泳ぐ絵が暗くなって見えづらい）。
      drawWater(context, tank, strength)
      drawLightRays(context, rays, elapsed, tank, strength)
      drawSand(context, sand, tank, strength)
      if (wreck) drawShipwreck(context, wreck, sand, tank, strength)
      drawShells(context, shells, sand, tank, strength)
      drawSeaweed(context, seaweed, sand, tank, elapsed, strength)
      drawRocks(context, rocks, sand, tank, strength)
      drawVignette(context, tank, strength)
      drawBubbles(context, backBubbles, strength)

      // 進める前に、近づきすぎた組の向きを変える。
      // これをしないと、絵が重なったまま並走して1枚にしか見えなくなる（R-005）。
      const list = [...swimmers.values()]
      const separated = separateFish(
        list.map((swimmer) => swimmer.fish),
        dt,
      )
      for (let index = 0; index < list.length; index++) {
        list[index].fish = separated[index]
      }

      for (const swimmer of swimmers.values()) {
        swimmer.fish = stepFish(swimmer.fish, dt, tank)
        if (!swimmer.element.complete || swimmer.element.naturalWidth === 0) continue

        const { fish } = swimmer
        const y = renderY(fish)
        const progress = appearProgress(elapsed - swimmer.bornAt)
        const scale = appearScale(progress)

        context.save()
        context.globalAlpha = appearAlpha(progress)
        context.translate(fish.x, y)
        // 進む向きに合わせて左右反転する。魚が後ろ向きに泳いで見えるのを避けるため。
        context.scale(facesRight(fish) ? scale : -scale, scale)
        context.drawImage(
          swimmer.element,
          -fish.width / 2,
          -fish.height / 2,
          fish.width,
          fish.height,
        )
        context.restore()
      }

      drawBubbles(context, frontBubbles, strength)

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
